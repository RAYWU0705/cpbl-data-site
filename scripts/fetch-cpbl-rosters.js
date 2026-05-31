import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const HEADLESS = true;

const CPBL_CLUBS = {
  brothers: { name: "中信兄弟", clubNo: "ACN" },
  lions: { name: "統一7-ELEVEn獅", clubNo: "ADD" },
  monkeys: { name: "樂天桃猿", clubNo: "AJL" },
  guardians: { name: "富邦悍將", clubNo: "AEO" },
  dragons: { name: "味全龍", clubNo: "AAA" },
  hawks: { name: "台鋼雄鷹", clubNo: "AKP" }
};

const SQUADS = [
  { key: "first", label: "一軍" },
  { key: "second", label: "二軍" }
];

const GROUPS = ["教練", "投手", "捕手", "內野手", "外野手"];
const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

async function fileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function getChromeExecutablePath() {
  for (const chromePath of CHROME_PATHS) {
    if (await fileExists(chromePath)) {
      return chromePath;
    }
  }

  return null;
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, "../data/rosters");
const OUTPUT_ALL = path.join(OUTPUT_DIR, "team-rosters.json");

/* =========================
   v5.5.4-ROSTER-TRANSACTIONS-PRESERVE
   roster 更新時保留既有 transactions：
   - 官方異動頁抓到新資料：使用新資料
   - 官方異動頁抓到 0 筆或失敗：保留原 data/rosters/<team>.json 的 transactions
========================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rosterUrl(clubNo) {
  return `https://www.cpbl.com.tw/team?ClubNo=${clubNo}`;
}

function transUrl(clubNo) {
  return `https://www.cpbl.com.tw/team/trans?ClubNo=${clubNo}`;
}

function cleanText(v) {
  return String(v || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .trim();
}

async function readJsonIfExists(filepath, fallback = null) {
  try {
    const text = await fs.readFile(filepath, "utf-8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function pickTransactions(newTransactions, oldRoster, teamName) {
  const fresh = Array.isArray(newTransactions) ? newTransactions : [];
  const previous = Array.isArray(oldRoster?.transactions) ? oldRoster.transactions : [];

  if (fresh.length > 0) {
    console.log(`🆕 ${teamName} 使用官方最新異動：${fresh.length} 筆`);
    return fresh;
  }

  if (previous.length > 0) {
    console.log(`🛡️ ${teamName} 官方異動為 0，保留既有異動：${previous.length} 筆`);
    return previous;
  }

  console.log(`⚠️ ${teamName} 沒有可用異動資料`);
  return [];
}

function preserveRosterLocalFields(newRoster, oldRoster) {
  if (!oldRoster || typeof oldRoster !== "object") {
    return newRoster;
  }

  return {
    ...newRoster,
    transactions: Array.isArray(newRoster.transactions)
      ? newRoster.transactions
      : (Array.isArray(oldRoster.transactions) ? oldRoster.transactions : [])
  };
}

function isNumberLine(v) {
  return /^\d{1,3}$/.test(cleanText(v));
}

function uniquePeople(list) {
  const seen = new Set();
  const result = [];

  list.forEach(item => {
    const key = `${item.number || ""}_${item.name || ""}_${item.position || item.role || ""}`;
    if (seen.has(key)) return;

    seen.add(key);
    result.push(item);
  });

  return result;
}

async function setupPage(browser) {
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  return page;
}

/* =========================
   切換一軍 / 二軍
========================= */
async function setSquad(page, label) {
  console.log(`  🔧 切換：${label}`);

  const changedBySelect = await page.evaluate((label) => {
    const selects = Array.from(document.querySelectorAll("select"));

    for (const select of selects) {
      const option = Array.from(select.options).find(opt =>
        opt.textContent.trim() === label
      );

      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }

    return false;
  }, label);

  if (changedBySelect) {
    await sleep(2500);
    return true;
  }

  const clicked = await page.evaluate((label) => {
    const candidates = Array.from(document.querySelectorAll("a, button, li, span, div"))
      .filter(el => {
        const text = (el.innerText || "").trim();
        const rect = el.getBoundingClientRect();

        return (
          text === label &&
          rect.width > 0 &&
          rect.height > 0
        );
      });

    const target = candidates[candidates.length - 1];

    if (target) {
      target.click();
      return true;
    }

    return false;
  }, label);

  await sleep(clicked ? 2500 : 1200);
  return clicked;
}

/* =========================
   從官方頁面用文字順序解析
   重點：
   - 抓到分類標題：教練 / 投手 / 捕手 / 內野手 / 外野手
   - 後面每個人用「細守位、姓名、背號」三行一組
========================= */
async function extractRosterFromPage(page) {
  return await page.evaluate(() => {
    const GROUPS = ["教練", "投手", "捕手", "內野手", "外野手"];

    function cleanLine(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t\r\f\v]+/g, " ")
        .trim();
    }

    function isNumberLine(v) {
      return /^\d{1,3}$/.test(cleanLine(v));
    }

    const rawLines = (document.body?.innerText || "")
      .split("\n")
      .map(cleanLine)
      .filter(Boolean);

    const result = {
      coaches: [],
      players: {
        "投手": [],
        "捕手": [],
        "內野手": [],
        "外野手": []
      },
      debugLines: rawLines.slice(0, 300)
    };

    let currentGroup = "";

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];

      if (GROUPS.includes(line)) {
        currentGroup = line;
        continue;
      }

      if (!currentGroup) continue;
      if (!isNumberLine(line)) continue;

      const number = line;
      const name = rawLines[i - 1] || "";
      const roleOrPosition = rawLines[i - 2] || "";

      if (!name || !roleOrPosition) continue;

      if (
        GROUPS.includes(name) ||
        name === "球員列表" ||
        name === "逐日戰績" ||
        name === "賽程" ||
        name === "球隊戰績" ||
        name === "團隊成績" ||
        name === "球員異動"
      ) {
        continue;
      }

      if (currentGroup === "教練") {
        result.coaches.push({
          number,
          name,
          role: roleOrPosition || "教練"
        });
      } else if (result.players[currentGroup]) {
        result.players[currentGroup].push({
          number,
          name,
          group: currentGroup,
          position: roleOrPosition || currentGroup
        });
      }
    }

    return result;
  });
}

function normalizeExtractedRoster(parsed) {
  return {
    coaches: uniquePeople(parsed.coaches || []),
    players: {
      "投手": uniquePeople(parsed.players?.["投手"] || []),
      "捕手": uniquePeople(parsed.players?.["捕手"] || []),
      "內野手": uniquePeople(parsed.players?.["內野手"] || []),
      "外野手": uniquePeople(parsed.players?.["外野手"] || [])
    }
  };
}

/* =========================
   抓單隊 roster
========================= */
async function fetchTeamRoster(browser, teamId, club) {
  const page = await setupPage(browser);
  const url = rosterUrl(club.clubNo);

  console.log(`🌐 ${club.name} 球員列表：${url}`);

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(3000);

  const result = {
    teamId,
    teamName: club.name,
    clubNo: club.clubNo,
    sourceUrl: url,
    updatedAt: new Date().toISOString(),

    coaches: {
      first: {
        title: "一軍教練團",
        squad: "first",
        list: []
      },
      second: {
        title: "二軍教練團",
        squad: "second",
        list: []
      }
    },

    players: {}
  };

  for (const squad of SQUADS) {
    await setSquad(page, squad.label);

    const raw = await extractRosterFromPage(page);
    const parsed = normalizeExtractedRoster(raw);

    result.coaches[squad.key] = {
      title: `${squad.label}教練團`,
      squad: squad.key,
      list: parsed.coaches
    };

    ["投手", "捕手", "內野手", "外野手"].forEach(group => {
      const key = `${squad.key}_${group}`;

      result.players[key] = {
        title: `${squad.label}${group}`,
        squad: squad.key,
        group,
        list: parsed.players[group] || []
      };
    });

    console.log(
      `✅ ${club.name} ${squad.label}：教練 ${parsed.coaches.length}，` +
      `投手${parsed.players["投手"].length} / ` +
      `捕手${parsed.players["捕手"].length} / ` +
      `內野手${parsed.players["內野手"].length} / ` +
      `外野手${parsed.players["外野手"].length}`
    );

    if (
      parsed.coaches.length === 0 &&
      parsed.players["投手"].length === 0 &&
      parsed.players["捕手"].length === 0 &&
      parsed.players["內野手"].length === 0 &&
      parsed.players["外野手"].length === 0
    ) {
      console.log("⚠️ 這次解析為 0，請改 HEADLESS=false 觀察官方頁面是否有載入");
    }
  }

  await page.close();

  return result;
}

/* =========================
   抓球員異動
========================= */
async function fetchTeamTransactions(browser, club) {
  const page = await setupPage(browser);
  const url = transUrl(club.clubNo);

  console.log(`🔁 ${club.name} 球員異動：${url}`);

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(2500);

  const transactions = await page.evaluate(() => {
    function cleanText(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t\r\f\v]+/g, " ")
        .trim();
    }

    function isDate(v) {
      return /^\d{4}\/\d{2}\/\d{2}$/.test(cleanText(v));
    }

    const rows = Array.from(document.querySelectorAll("table tr"))
      .map(tr => Array.from(tr.querySelectorAll("th, td")).map(td => cleanText(td.innerText)))
      .filter(cells => cells.length);

    const list = [];
    let currentDate = "";

    rows.forEach(cells => {
      if (cells.includes("異動日期") || cells.includes("球員") || cells.includes("異動原因")) {
        return;
      }

      if (cells.length >= 3 && isDate(cells[0])) {
        currentDate = cells[0].replaceAll("/", "-");

        const player = cells[1];
        const reason = cells[2];

        if (player && reason) {
          list.push({
            date: currentDate,
            player,
            reason
          });
        }

        return;
      }

      if (cells.length >= 2 && currentDate) {
        const player = cells[0];
        const reason = cells[1];

        if (player && reason && !isDate(player)) {
          list.push({
            date: currentDate,
            player,
            reason
          });
        }
      }
    });

    return list;
  });

  await page.close();

  console.log(`✅ ${club.name} 異動 ${transactions.length} 筆`);

  return transactions;
}

/* =========================
   主程式
========================= */
async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const executablePath = await getChromeExecutablePath();

  const launchOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  console.log("Chrome:", executablePath || "puppeteer default");

  const browser = await puppeteer.launch(launchOptions);

  const all = {};

  for (const [teamId, club] of Object.entries(CPBL_CLUBS)) {
    try {
      const teamOutput = path.join(OUTPUT_DIR, `${teamId}.json`);
      const oldRoster = await readJsonIfExists(teamOutput, null);

      const roster = await fetchTeamRoster(browser, teamId, club);
      const transactions = await fetchTeamTransactions(browser, club);

      roster.transactions = pickTransactions(transactions, oldRoster, club.name);

      const finalRoster = preserveRosterLocalFields(roster, oldRoster);
      all[teamId] = finalRoster;

      await fs.writeFile(teamOutput, JSON.stringify(finalRoster, null, 2), "utf-8");

      console.log(`💾 已輸出：data/rosters/${teamId}.json`);
      console.log("--------------------------------------------------");

    } catch (err) {
      console.error(`❌ ${club.name} 失敗：`, err.message);
    }
  }

  await fs.writeFile(OUTPUT_ALL, JSON.stringify(all, null, 2), "utf-8");

  await browser.close();

  console.log("==============");
  console.log("📦 全部球隊名單完成");
  console.log("💾 已輸出：data/rosters/team-rosters.json");
  console.log("🛡️ transactions preserve guard 已啟用");
}

main().catch(err => {
  console.error("❌ 失敗：", err);
  process.exit(1);
});