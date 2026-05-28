// =========================
// CPBL Pregame Fetch v3
// 從中職官網首頁比分橫條抓：
// 1. 先發投手
// 2. 展開「先發打序」後抓先發攻守名單
// 寫回 data/live/live-boxscore.json 的 pregame 欄位
// =========================

import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const HEADLESS = true;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, "..");
const LIVE_BOXSCORE_PATH = path.join(ROOT_DIR, "data/live/live-boxscore.json");
const DEBUG_DIR = path.join(ROOT_DIR, "debug/pregame");

const CPBL_HOME_URL = "https://www.cpbl.com.tw/";

// 今天 + 明天
const TARGET_DAYS = 1;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);

  dt.setDate(dt.getDate() + days);

  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function isTargetDate(dateStr) {
  const today = getToday();

  for (let i = 0; i <= TARGET_DAYS; i++) {
    if (dateStr === addDays(today, i)) return true;
  }

  return false;
}

function shouldFetchPregame(g) {
  const meta = g.meta || {};

  if (!meta.date || !isTargetDate(meta.date)) return false;

  // 已結束不用抓賽前
  if (meta.status === "final") return false;

  // 延賽、取消不用抓
  if (meta.status === "postponed") return false;
  if (meta.status === "cancelled") return false;

  return true;
}

async function readGames() {
  const raw = await fs.readFile(LIVE_BOXSCORE_PATH, "utf-8");
  const data = JSON.parse(raw);

  return Array.isArray(data) ? data : Object.values(data || {});
}

async function writeGames(games) {
  await fs.writeFile(
    LIVE_BOXSCORE_PATH,
    JSON.stringify(games, null, 2),
    "utf-8"
  );
}

async function setupPage(browser) {
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  page.setDefaultTimeout(30000);

  return page;
}

async function safeClosePage(page) {
  if (!page) return;

  try {
    if (!page.isClosed()) {
      await page.close();
    }
  } catch (err) {
    console.log(`⚠️ page close 略過：${err.message}`);
  }
}

async function safeCloseBrowser(browser) {
  if (!browser) return;

  try {
    await browser.close();
  } catch (err) {
    console.log(`⚠️ browser close 略過：${err.message}`);
  }
}

/* =========================
   從首頁比分橫條解析賽前資料
========================= */

async function fetchPregameFromHomePage(browser, targets) {
  const page = await setupPage(browser);

  try {
    console.log(`🌐 打開中職官網首頁：${CPBL_HOME_URL}`);

    await page.goto(CPBL_HOME_URL, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    await sleep(3500);

    const targetGameSnos = targets
      .map(g => Number(g.gameSno))
      .filter(Boolean);

    const result = {};

    for (const gameSno of targetGameSnos) {
      console.log(`🔎 首頁卡片解析 gameSno=${gameSno}`);

      const basic = await parseHomeCardBasic(page, gameSno);

      result[gameSno] = {
        found: basic.found,
        starters: basic.starters || { away: "", home: "" },
        lineups: {
          away: [],
          home: []
        },
        lines: basic.lines || []
      };

      if (!basic.found) {
        continue;
      }

      const clicked = await clickLineupButton(page, gameSno);

      if (!clicked) {
        console.log(`   ℹ️ gameSno=${gameSno} 找不到「先發打序 / 更多資訊」或無法展開`);
        continue;
      }

      await sleep(5000);

      const expanded = await parseExpandedLineups(page, gameSno);

      result[gameSno].expandedLines = expanded.lines || [];
      result[gameSno].expandedDebug = expanded.debug || {};

      if (expanded.found) {
        result[gameSno].starters = {
          away: expanded.starters.away || result[gameSno].starters.away || "",
          home: expanded.starters.home || result[gameSno].starters.home || ""
        };

        result[gameSno].lineups = expanded.lineups;

        console.log(
          `   ✅ 打序：客 ${expanded.lineups.away.length} 人｜主 ${expanded.lineups.home.length} 人`
        );
      } else {
        console.log(`   ℹ️ gameSno=${gameSno} 展開後尚未解析到打序`);
      }
    }

    await saveHomeDebug(result);

    return result;

  } finally {
    await safeClosePage(page);
  }
}

/* =========================
   解析未展開卡片：先發投手
========================= */

async function parseHomeCardBasic(page, gameSno) {
  return await page.evaluate((gameSno) => {
    function cleanText(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getLines(el) {
      return String(el.innerText || "")
        .split("\n")
        .map(cleanText)
        .filter(Boolean);
    }

    function visible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function exactLine(lines, value) {
      return lines.some(line => cleanText(line) === String(value));
    }

    function getNextName(lines, label) {
      const idx = lines.findIndex(line => line.includes(label));
      if (idx < 0) return "";

      for (let i = idx + 1; i < lines.length; i++) {
        const line = cleanText(lines[i]);

        if (!line) continue;
        if (line.includes("客場先發")) continue;
        if (line.includes("主場先發")) continue;
        if (line.includes("售票資訊")) continue;
        if (line.includes("更多資訊")) continue;
        if (line.includes("先發打序")) continue;
        if (line.includes("VS")) continue;
        if (/^\d+$/.test(line)) continue;
        if (/^\d{1,2}:\d{2}$/.test(line)) continue;
        if (/^\d+-\d+-\d+$/.test(line)) continue;

        return line;
      }

      return "";
    }

    const elements = Array.from(document.querySelectorAll("body *"))
      .filter(visible);

    const candidates = elements
      .map(el => {
        const lines = getLines(el);
        const rect = el.getBoundingClientRect();

        return {
          el,
          lines,
          area: rect.width * rect.height,
          score: 0
        };
      })
      .filter(x =>
        exactLine(x.lines, gameSno) &&
        (
          x.lines.some(line => line.includes("客場先發")) ||
          x.lines.some(line => line.includes("主場先發")) ||
          x.lines.some(line => line.includes("先發打序")) ||
          x.lines.some(line => line.includes("售票資訊"))
        )
      )
      .map(x => {
        if (x.lines.some(line => line.includes("客場先發"))) x.score += 10;
        if (x.lines.some(line => line.includes("主場先發"))) x.score += 10;
        if (x.lines.some(line => line.includes("VS"))) x.score += 5;
        if (x.lines.some(line => line.includes("大巨蛋") || line.includes("新莊") || line.includes("天母"))) x.score += 3;
        if (x.lines.length >= 10) x.score += 3;

        return x;
      })
      // ✅ 不要再選最小元素，改選「資訊最完整」的區塊
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.lines.length - a.lines.length;
      });

    const card = candidates[0];

    if (!card) {
      return {
        found: false,
        starters: { away: "", home: "" },
        lines: []
      };
    }

    return {
      found: true,
      starters: {
        away: getNextName(card.lines, "客場先發"),
        home: getNextName(card.lines, "主場先發")
      },
      lines: card.lines.slice(0, 80)
    };
  }, gameSno);
}
/* =========================
   點擊「先發打序」或「更多資訊」
========================= */

async function clickLineupButton(page, gameSno) {
  return await page.evaluate((gameSno) => {
    function cleanText(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getLines(el) {
      return String(el.innerText || "")
        .split("\n")
        .map(cleanText)
        .filter(Boolean);
    }

    function visible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function ancestorHasGameSno(el) {
      let cur = el;

      for (let depth = 0; cur && depth < 10; depth++) {
        const lines = getLines(cur);

        if (lines.some(line => line === String(gameSno))) {
          return true;
        }

        cur = cur.parentElement;
      }

      return false;
    }

    const all = Array.from(document.querySelectorAll("a, button, div, span"))
      .filter(visible);

    // ✅ 優先找該場附近的「先發打序」
    const lineupElement = all.find(el => {
      const text = cleanText(el.innerText);
      return text.includes("先發打序") && ancestorHasGameSno(el);
    });

    const moreElement = all.find(el => {
      const text = cleanText(el.innerText);
      return text.includes("更多資訊") && ancestorHasGameSno(el);
    });

    const rawTarget = lineupElement || moreElement;

    if (!rawTarget) return false;

    const target =
      rawTarget.closest("a") ||
      rawTarget.closest("button") ||
      rawTarget;

    target.scrollIntoView({
      block: "center",
      inline: "center"
    });

    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    return true;
  }, gameSno);
}

/* =========================
   解析展開後的先發打序
========================= */

async function parseExpandedLineups(page, gameSno) {
  return await page.evaluate((gameSno) => {
    function cleanText(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getLines(el) {
      return String(el.innerText || "")
        .split("\n")
        .map(cleanText)
        .filter(Boolean);
    }

    function visible(el) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function isOrderText(v) {
      return /^第[1-9]棒$/.test(cleanText(v));
    }

    function parseOrderNumber(v) {
      const m = cleanText(v).match(/第([1-9])棒/);
      return m ? Number(m[1]) : null;
    }

    function isBadName(v) {
      const s = cleanText(v);

      if (!s) return true;
      if (s.includes("先發攻守名單")) return true;
      if (s.includes("先發打序")) return true;
      if (s.includes("觀戰重點")) return true;
      if (s.includes("先發戰報")) return true;
      if (s.includes("對戰戰報")) return true;
      if (s.includes("售票資訊")) return true;
      if (s.includes("更多資訊")) return true;
      if (s.includes("客場先發")) return true;
      if (s.includes("主場先發")) return true;
      if (s.includes("先發投手")) return true;
      if (s.includes("VS")) return true;
      if (/^\d+$/.test(s)) return true;
      if (/^\d{1,2}:\d{2}$/.test(s)) return true;
      if (/^\d+-\d+-\d+$/.test(s)) return true;
      if (/^第[1-9]棒$/.test(s)) return true;

      return false;
    }

    function parseLineupsFromLines(lines) {
      const entries = [];

      for (let i = 0; i < lines.length; i++) {
        const line = cleanText(lines[i]);

        // A：
        // 第1棒
        // 王威晨
        // 指定打擊
        if (isOrderText(line)) {
          const order = parseOrderNumber(line);
          const name = cleanText(lines[i + 1] || "");
          const position = cleanText(lines[i + 2] || "");

          if (order && !isBadName(name)) {
            entries.push({
              order,
              name,
              position
            });
          }

          continue;
        }

        // B：第1棒 王威晨 指定打擊
        const sameLine = line.match(/^第([1-9])棒\s+(.+?)\s+(.+?)$/);

        if (sameLine) {
          const order = Number(sameLine[1]);
          const name = cleanText(sameLine[2]);
          const position = cleanText(sameLine[3]);

          if (order && !isBadName(name)) {
            entries.push({
              order,
              name,
              position
            });
          }

          continue;
        }

        // C：第1棒 王威晨
        const twoPart = line.match(/^第([1-9])棒\s+(.+?)$/);

        if (twoPart) {
          const order = Number(twoPart[1]);
          const name = cleanText(twoPart[2]);
          const position = cleanText(lines[i + 1] || "");

          if (order && !isBadName(name)) {
            entries.push({
              order,
              name,
              position
            });
          }
        }
      }

      // 去重
      const seen = new Set();
      const unique = [];

      entries.forEach(e => {
        const key = `${e.order}_${e.name}_${e.position}`;

        if (seen.has(key)) return;

        seen.add(key);
        unique.push(e);
      });

      return unique;
    }

    function parseStartersFromLines(lines) {
      const starters = [];

      for (let i = 0; i < lines.length; i++) {
        const line = cleanText(lines[i]);

        if (line !== "先發投手") continue;

        const name = cleanText(lines[i + 1] || "");

        if (!isBadName(name)) {
          starters.push(name);
        }
      }

      return starters;
    }

    const visibleElements = Array.from(document.querySelectorAll("body *"))
      .filter(visible);

    // 優先找包含打序區的區塊
    const lineupBlocks = visibleElements
      .map(el => {
        const lines = getLines(el);
        const rect = el.getBoundingClientRect();

        return {
          el,
          lines,
          area: rect.width * rect.height
        };
      })
      .filter(x =>
        x.lines.some(line => line.includes("先發攻守名單")) ||
        x.lines.some(line => line.includes("先發打序")) ||
        x.lines.some(line => line.includes("第1棒"))
      )
      .sort((a, b) => b.area - a.area);

    const block = lineupBlocks[0];

    const lines = block
      ? block.lines
      : getLines(document.body);

    const entries = parseLineupsFromLines(lines);
    const starterNames = parseStartersFromLines(lines);

    return {
      found: entries.length >= 9 || starterNames.length >= 1,
      starters: {
        away: starterNames[0] || "",
        home: starterNames[1] || ""
      },
      lineups: {
        away: entries.slice(0, 9),
        home: entries.slice(9, 18)
      },
      lines,
      debug: {
        entriesCount: entries.length,
        entriesSample: entries.slice(0, 20),
        starterNames,
        blockFound: Boolean(block)
      }
    };
  }, gameSno);
}

/* =========================
   Debug
========================= */

async function saveHomeDebug(result) {
  await fs.mkdir(DEBUG_DIR, { recursive: true });

  await fs.writeFile(
    path.join(DEBUG_DIR, "homepage-starters.json"),
    JSON.stringify(result, null, 2),
    "utf-8"
  );
}

/* =========================
   合併資料
========================= */

function mergePregame(oldPregame, pregameData) {
  return {
    starters: {
      away: pregameData?.starters?.away || oldPregame?.starters?.away || "",
      home: pregameData?.starters?.home || oldPregame?.starters?.home || ""
    },
    lineups: {
      away: pregameData?.lineups?.away?.length
        ? pregameData.lineups.away
        : oldPregame?.lineups?.away || [],

      home: pregameData?.lineups?.home?.length
        ? pregameData.lineups.home
        : oldPregame?.lineups?.home || []
    },
    updatedAt: new Date().toISOString()
  };
}

/* =========================
   主程式
========================= */

async function main() {
  console.log("======================================");
  console.log("🎯 CPBL 賽前資料更新 v3");
  console.log("來源：中職官網首頁比分橫條");
  console.log("======================================");

  const games = await readGames();
  const targets = games.filter(shouldFetchPregame);

  console.log(`總場次：${games.length}`);
  console.log(`待檢查賽前資料：${targets.length}`);

  if (!targets.length) {
    console.log("目前沒有需要抓賽前資料的場次。");
    return;
  }

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  let updated = 0;

  try {
    const pregameMap = await fetchPregameFromHomePage(browser, targets);

    for (const game of targets) {
      const gameSno = Number(game.gameSno);
      const item = pregameMap?.[gameSno];

      console.log("");
      console.log(`🔎 ${gameSno}: ${game.meta?.away} vs ${game.meta?.home}｜${game.meta?.date}`);

      if (!item || !item.found) {
        console.log("ℹ️ 首頁尚未找到賽前資料");
        continue;
      }

      game.pregame = mergePregame(game.pregame, item);

      const awayStarter = game.pregame.starters.away || "—";
      const homeStarter = game.pregame.starters.home || "—";
      const awayLineupCount = game.pregame.lineups.away.length;
      const homeLineupCount = game.pregame.lineups.home.length;

      console.log("✅ 賽前資料更新");
      console.log(`   先發投手：${awayStarter} vs ${homeStarter}`);
      console.log(`   打序：客 ${awayLineupCount} 人｜主 ${homeLineupCount} 人`);

      updated++;
    }

  } finally {
    await safeCloseBrowser(browser);
  }

  await writeGames(games);

  console.log("");
  console.log("======================================");
  console.log("📦 賽前資料更新完成");
  console.log(`檢查場次：${targets.length}`);
  console.log(`更新場次：${updated}`);
  console.log("Debug：debug/pregame/homepage-starters.json");
  console.log("======================================");
}

main().catch(err => {
  console.error("❌ fetch-cpbl-pregame 失敗：", err);
  process.exit(1);
});