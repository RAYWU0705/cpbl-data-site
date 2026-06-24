import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const OUT_FILE = "data/live/probable-pitchers.json";
const DEBUG_FILE = "data/live/probable-pitchers-debug.json";

const CPBL_URL = "https://www.cpbl.com.tw/";

const TEAM_NAMES = [
  "中信兄弟",
  "統一7-ELEVEn獅",
  "統一7-ELEVEN獅",
  "統一獅",
  "樂天桃猿",
  "富邦悍將",
  "味全龍",
  "台鋼雄鷹"
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });
}

async function main() {
  console.log("🎯 抓取 CPBL 預告先發...");
  console.log(`🌐 來源：${CPBL_URL}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  const page = await browser.newPage();

  await page.setViewport({
    width: 1500,
    height: 1800,
    deviceScaleFactor: 1
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  await page.goto(CPBL_URL, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(2500);

  const payload = await page.evaluate((TEAM_NAMES) => {
    function cleanText(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim();
    }

    function splitLines(text) {
      return String(text || "")
        .split("\n")
        .map(cleanText)
        .filter(Boolean);
    }

    function isBadName(text) {
      const s = cleanText(text);

      if (!s) return true;

      if (TEAM_NAMES.includes(s)) return true;

      if (
        s.includes("客場先發") ||
        s.includes("主場先發") ||
        s.includes("售票資訊") ||
        s.includes("票券資訊") ||
        s.includes("更多資訊") ||
        s.includes("降雨") ||
        s.includes("攝氏") ||
        s.includes("English") ||
        s.includes("CPBL") ||
        s.includes("LIVE") ||
        s.includes("VS")
      ) {
        return true;
      }

      if (/^VS\.?$/i.test(s)) return true;
      if (/^\d{1,3}$/.test(s)) return true;
      if (/^\d{1,2}:\d{2}$/.test(s)) return true;
      if (/^\d+-\d+(?:-\d+)?$/.test(s)) return true;
      if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) return true;
      if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return true;

      if (s.length < 2 || s.length > 12) return true;

      return false;
    }

    function cleanPitcherName(text) {
      let s = cleanText(text);

      s = s
        .replace("客場先發", "")
        .replace("主場先發", "")
        .replace(/^[:：\-\s]+/, "")
        .replace(/[，,。]+$/, "")
        .trim();

      for (const team of TEAM_NAMES) {
        if (s.startsWith(team)) {
          s = cleanText(s.slice(team.length));
        }
      }

      if (isBadName(s)) return "";

      return s;
    }

    function extractStarterFromLines(lines, label) {
      const labelIndex = lines.findIndex(line =>
        line.includes(label)
      );

      if (labelIndex < 0) return "";

      // 情況 1：同一行就有名字，例如「客場先發 勝騎士」
      const sameLine = cleanPitcherName(lines[labelIndex]);

      if (sameLine) return sameLine;

      // 情況 2：下一行才是名字
      for (
        let i = labelIndex + 1;
        i < Math.min(lines.length, labelIndex + 8);
        i++
      ) {
        const candidate = cleanPitcherName(lines[i]);

        if (candidate) return candidate;
      }

      return "";
    }

    function extractGameSno(lines, text) {
      const lineGameSno = lines.find(line =>
        /^\d{1,3}$/.test(line)
      );

      if (lineGameSno) return lineGameSno;

      const match =
        cleanText(text).match(/(^|\s)(\d{1,3})(\s|$)/);

      return match?.[2] || "";
    }

    function parseCardElement(el) {
      const text = cleanText(el.innerText || el.textContent || "");

      if (!text) return null;
      if (!text.includes("客場先發") && !text.includes("主場先發")) return null;

      const lines = splitLines(text);

      const gameSno = extractGameSno(lines, text);

      if (!gameSno) return null;

      const away = extractStarterFromLines(lines, "客場先發");
      const home = extractStarterFromLines(lines, "主場先發");

      if (!away && !home) return null;

      const teams = TEAM_NAMES
        .filter(team => text.includes(team))
        .sort((a, b) => text.indexOf(a) - text.indexOf(b));

      return {
        gameSno,
        away: away || null,
        home: home || null,
        teams,
        textLength: text.length,
        debugText: text.slice(0, 1000),
        debugLines: lines.slice(0, 60)
      };
    }

    function discoverByCards() {
      const elements = Array.from(
        document.querySelectorAll("div, li, article, section")
      );

      const candidates = [];

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const text = cleanText(el.innerText || el.textContent || "");

        if (!text) continue;
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (!text.includes("客場先發") && !text.includes("主場先發")) continue;

        const parsed = parseCardElement(el);

        if (!parsed) continue;

        candidates.push({
          ...parsed,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        });
      }

      // 重要：同一場可能被外層大區塊重複抓到，
      // 所以先用 textLength 小的，通常比較接近真正單一卡片。
      candidates.sort((a, b) => a.textLength - b.textLength);

      const map = new Map();

      for (const item of candidates) {
        if (!map.has(String(item.gameSno))) {
          map.set(String(item.gameSno), item);
        }
      }

      return {
        games: [...map.values()]
          .sort((a, b) => Number(a.gameSno) - Number(b.gameSno)),
        candidates
      };
    }

    function discoverByBodyTextFallback() {
      const text = cleanText(document.body?.innerText || "");
      const lines = splitLines(text);

      const result = [];

      for (let i = 0; i < lines.length; i++) {
        if (!/^\d{1,3}$/.test(lines[i])) continue;

        const gameSno = lines[i];

        const segment = [];

        for (let j = i; j < Math.min(lines.length, i + 35); j++) {
          if (j > i && /^\d{1,3}$/.test(lines[j])) break;
          segment.push(lines[j]);
        }

        const joined = segment.join(" ");

        if (!joined.includes("客場先發") && !joined.includes("主場先發")) {
          continue;
        }

        const away = extractStarterFromLines(segment, "客場先發");
        const home = extractStarterFromLines(segment, "主場先發");

        if (!away && !home) continue;

        result.push({
          gameSno,
          away: away || null,
          home: home || null,
          teams: TEAM_NAMES
            .filter(team => joined.includes(team))
            .sort((a, b) => joined.indexOf(a) - joined.indexOf(b)),
          debugText: joined.slice(0, 1000),
          debugLines: segment
        });
      }

      const map = new Map();

      result.forEach(item => {
        if (!map.has(String(item.gameSno))) {
          map.set(String(item.gameSno), item);
        }
      });

      return [...map.values()]
        .sort((a, b) => Number(a.gameSno) - Number(b.gameSno));
    }

    const byCards = discoverByCards();
    let games = byCards.games;

    if (!games.length) {
      games = discoverByBodyTextFallback();
    }

    return {
      games,
      debug: {
        method: byCards.games.length ? "cards" : "body-text-fallback",
        gameCount: games.length,
        cardCandidateCount: byCards.candidates.length,
        cardCandidates: byCards.candidates.slice(0, 20),
        bodySample: cleanText(document.body?.innerText || "").slice(0, 5000)
      }
    };
  }, TEAM_NAMES);

  await browser.close();

  const result = {};

  for (const game of payload.games || []) {
    result[String(game.gameSno)] = {
      away: game.away || null,
      home: game.home || null
    };

    console.log(
      `✅ ${game.gameSno}: ${game.away || "—"} vs ${game.home || "—"}`
    );
  }

  ensureDir(OUT_FILE);

  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(result, null, 2),
    "utf-8"
  );

  fs.writeFileSync(
    DEBUG_FILE,
    JSON.stringify(payload.debug || {}, null, 2),
    "utf-8"
  );

  console.log("");
  console.log(`💾 已輸出：${OUT_FILE}`);
  console.log(`🧪 Debug：${DEBUG_FILE}`);

  if (!Object.keys(result).length) {
    console.log("");
    console.log("⚠️ 沒抓到預告先發。可能原因：");
    console.log("1. 官方首頁目前沒有顯示預告先發");
    console.log("2. 官方首頁版型改了");
    console.log("3. 預告先發是延遲載入，等待時間需要再加長");
  }
}

main().catch(err => {
  console.error("❌ 抓取預告先發失敗：", err);
  process.exit(1);
});