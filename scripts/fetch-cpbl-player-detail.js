import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SEASON_YEAR = 2026;
const KIND_CODE = "A";

const DATA_FILE_NAME = "../data/live/live-boxscore.json";

// 第一次先保守跑 5 場，確認成功後再改 999
const MAX_UPDATE_GAMES = 360;
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
// 只補還沒有球員明細的 final 比賽
const ONLY_MISSING = true;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, DATA_FILE_NAME);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildOfficialUrl(gameSno) {
  return `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`;
}

async function readGames() {
  try {
    const text = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : Object.values(data || {});
  } catch {
    return [];
  }
}

async function writeGames(games) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(games, null, 2), "utf-8");
}

async function setupPage(browser) {
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  return page;
}

function hasPlayerDetail(g) {
  return (
    Array.isArray(g?.batters?.away) &&
    g.batters.away.length > 0 &&
    Array.isArray(g?.batters?.home) &&
    g.batters.home.length > 0 &&
    Array.isArray(g?.pitchers?.away) &&
    g.pitchers.away.length > 0 &&
    Array.isArray(g?.pitchers?.home) &&
    g.pitchers.home.length > 0
  );
}

function needsUpdate(g) {
  if (g?.meta?.status !== "final") return false;

  if (!ONLY_MISSING) return true;

  return !hasPlayerDetail(g);
}

function cleanValue(v) {
  if (v == null) return "";
  return String(v).trim();
}

function parseNumberLike(v) {
  const s = cleanValue(v);

  if (!s) return null;
  if (s === "-") return null;

  // 保留小數
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    return Number(s);
  }

  // 像「（0）」這種故意四壞，轉成 0
  const inner = s.match(/^（(\d+)）$/);
  if (inner) return Number(inner[1]);

  // 投球局數可能是 02/3、01/3，不能轉 number，保留字串
  if (/^\d{1,2}\/3$/.test(s)) {
    return s;
  }

  return s;
}

function parsePlayerName(raw = "") {
  const text = cleanValue(raw);

  // 例：1 何品室融 CF
  // 例：1 麥斯威尼 (L,1-3)
  const orderMatch = text.match(/^(\d+)\s+(.+)$/);

  if (!orderMatch) {
    return {
      order: null,
      name: text,
      raw: text
    };
  }

  const order = Number(orderMatch[1]);
  const rest = orderMatch[2].trim();

  // 打者常見：何品室融 CF、邱智呈 RF(LF)
  // 投手常見：麥斯威尼 (L,1-3)
  let name = rest;
  let position = "";
  let note = "";

  const noteMatch = rest.match(/^(.+?)\s+(\(.+\))$/);
  if (noteMatch) {
    name = noteMatch[1].trim();
    note = noteMatch[2].trim();

    return {
      order,
      name,
      position,
      note,
      raw: text
    };
  }

  const posMatch = rest.match(/^(.+?)\s+([A-Z]{1,3}(?:\([A-Z]{1,3}\))?)$/);
  if (posMatch) {
    name = posMatch[1].trim();
    position = posMatch[2].trim();
  }

  return {
    order,
    name,
    position,
    note,
    raw: text
  };
}

function parseBatterRow(row, headers) {
  const cells = row.cells || [];

  if (!cells.length) return null;
  if (cells[0] === "Total") return null;

  const player = parsePlayerName(cells[0]);

  const item = {
    order: player.order,
    name: player.name,
    position: player.position,
    note: player.note || "",
    rawName: player.raw
  };

  // headers[0] 是隊名，所以資料從 headers[1] 對 cells[1]
  for (let i = 1; i < headers.length; i++) {
    const key = headers[i];
    const value = cells[i] ?? "";

    item[key] = parseNumberLike(value);
  }

  return item;
}

function parsePitcherRow(row, headers) {
  const cells = row.cells || [];

  if (!cells.length) return null;
  if (cells[0] === "Total") return null;

  const player = parsePlayerName(cells[0]);

  const item = {
    order: player.order,
    name: player.name,
    note: player.note || "",
    rawName: player.raw
  };

  for (let i = 1; i < headers.length; i++) {
    const key = headers[i];
    const value = cells[i] ?? "";

    item[key] = parseNumberLike(value);
  }

  return item;
}

function mergePlayerDetail(oldGame, detail) {
  return {
    ...oldGame,

    // meta / score / lineScore / totals 全部保持原樣
    meta: oldGame.meta,
    lineScore: oldGame.lineScore,
    totals: oldGame.totals,

    batters: {
      away: detail.batters.away.length
        ? detail.batters.away
        : oldGame.batters?.away || [],
      home: detail.batters.home.length
        ? detail.batters.home
        : oldGame.batters?.home || []
    },

    pitchers: {
      away: detail.pitchers.away.length
        ? detail.pitchers.away
        : oldGame.pitchers?.away || [],
      home: detail.pitchers.home.length
        ? detail.pitchers.home
        : oldGame.pitchers?.home || []
    }
  };
}

async function clickPlayerTab(page, index) {
  await page.evaluate((tabIndex) => {
    const links = Array.from(document.querySelectorAll(".GameBoxDetail .tabs li a"));
    links[tabIndex]?.click();
  }, index);

  await sleep(1200);
}

async function readGameBoxDetailTables(page) {
  return await page.evaluate(() => {
    function getRows(table) {
      return Array.from(table.querySelectorAll("tr"))
        .map((tr, rowIndex) => ({
          rowIndex,
          cells: Array.from(tr.querySelectorAll("th, td"))
            .map(td => td.innerText.trim())
            .filter(Boolean)
        }))
        .filter(row => row.cells.length);
    }

    const tabs = Array.from(document.querySelectorAll(".GameBoxDetail .tabs li"))
      .map((li, index) => ({
        index,
        text: li.innerText.trim(),
        className: li.className
      }));

    const tables = Array.from(document.querySelectorAll(".GameBoxDetail table"))
      .map((table, tableIndex) => {
        const rows = getRows(table);
        const headers = rows[0]?.cells || [];

        return {
          tableIndex,
          headers,
          rows
        };
      });

    return {
      tabs,
      tables
    };
  });
}

function parseDetailTables(snapshot, expectedTeam) {
  const tables = snapshot.tables || [];

  // 只取目前 active tab 對應的非空表格
  // 客隊 tab：table 0/1/2 非空
  // 主隊 tab：table 3/4/5 非空
  const activeTeam = snapshot.tabs.find(t => t.className.includes("active"))?.text || expectedTeam;

  const nonEmptyTables = tables.filter(t => t.headers && t.headers.length);

  const battleTable = nonEmptyTables.find(t =>
    t.headers.includes("1") &&
    t.headers.includes("打數") &&
    t.headers.includes("安打") &&
    t.headers.includes("打擊率")
  );

  const batterTable = nonEmptyTables.find(t =>
    t.headers.includes("打數") &&
    t.headers.includes("得分") &&
    t.headers.includes("安打") &&
    t.headers.includes("打點") &&
    t.headers.includes("二安") &&
    t.headers.includes("打擊率")
  );

  const pitcherTable = nonEmptyTables.find(t =>
    t.headers.includes("投球局數") &&
    t.headers.includes("面對打席") &&
    t.headers.includes("投球數") &&
    t.headers.includes("防禦率")
  );

  const batters = [];

  if (batterTable) {
    const headers = batterTable.headers;

    batterTable.rows.slice(1).forEach(row => {
      const parsed = parseBatterRow(row, headers);
      if (parsed) {
        parsed.team = activeTeam;
        batters.push(parsed);
      }
    });
  }

  const pitchers = [];

  if (pitcherTable) {
    const headers = pitcherTable.headers;

    pitcherTable.rows.slice(1).forEach(row => {
      const parsed = parsePitcherRow(row, headers);
      if (parsed) {
        parsed.team = activeTeam;
        pitchers.push(parsed);
      }
    });
  }

  return {
    activeTeam,
    battleTableFound: Boolean(battleTable),
    batterTableFound: Boolean(batterTable),
    pitcherTableFound: Boolean(pitcherTable),
    batters,
    pitchers
  };
}

async function fetchPlayerDetail(page, game) {
  const gameSno = Number(game.gameSno);
  const url = game.meta?.officialUrl || buildOfficialUrl(gameSno);

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(2500);

  const tabs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".GameBoxDetail .tabs li a"))
      .map((a, index) => ({
        index,
        text: a.innerText.trim()
      }));
  });

  if (tabs.length < 2) {
    return {
      ok: false,
      reason: `找不到兩隊球員 tab，目前 tabs=${tabs.length}`
    };
  }

  const awayTeam = game.meta?.away || tabs[0]?.text || "";
  const homeTeam = game.meta?.home || tabs[1]?.text || "";

  // tab 0：客隊
  await clickPlayerTab(page, 0);
  const awaySnapshot = await readGameBoxDetailTables(page);
  const awayParsed = parseDetailTables(awaySnapshot, awayTeam);

  // tab 1：主隊
  await clickPlayerTab(page, 1);
  const homeSnapshot = await readGameBoxDetailTables(page);
  const homeParsed = parseDetailTables(homeSnapshot, homeTeam);

  const ok =
    awayParsed.batters.length > 0 &&
    awayParsed.pitchers.length > 0 &&
    homeParsed.batters.length > 0 &&
    homeParsed.pitchers.length > 0;

  if (!ok) {
    return {
      ok: false,
      reason:
        `球員表不完整：` +
        `away batters=${awayParsed.batters.length}, ` +
        `away pitchers=${awayParsed.pitchers.length}, ` +
        `home batters=${homeParsed.batters.length}, ` +
        `home pitchers=${homeParsed.pitchers.length}`
    };
  }

  return {
    ok: true,
    teams: {
      away: awayParsed.activeTeam,
      home: homeParsed.activeTeam
    },
    batters: {
      away: awayParsed.batters,
      home: homeParsed.batters
    },
    pitchers: {
      away: awayParsed.pitchers,
      home: homeParsed.pitchers
    }
  };
}

/* =========================
   主程式
========================= */
async function main() {
  const games = await readGames();

  if (!games.length) {
    console.log("沒有 live-boxscore.json 資料，請先確認資料檔存在。");
    return;
  }

  const targets = games
    .filter(needsUpdate)
    .slice(0, MAX_UPDATE_GAMES);

  console.log("👥 補球員明細：打者 / 投手");
  console.log("總場次：", games.length);
  console.log("待更新 final 場次：", targets.length);

  if (!targets.length) {
    console.log("沒有需要更新的場次。");
    return;
  }

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

  const page = await setupPage(browser);

  const updatedMap = new Map(
    games.map(g => [Number(g.gameSno), g])
  );

  let success = 0;
  let skipped = 0;

  for (const game of targets) {
    const gameSno = Number(game.gameSno);

    console.log(`抓 player detail: ${gameSno} ${game.meta?.away} vs ${game.meta?.home}`);

    try {
      const detail = await fetchPlayerDetail(page, game);

      if (!detail || !detail.ok) {
        skipped++;
        console.log(`保留原資料：${gameSno}（${detail?.reason || "抓不到 player detail"}）`);
        continue;
      }

      const updated = mergePlayerDetail(game, detail);

      updatedMap.set(gameSno, updated);
      success++;

      console.log(
        `✅ ${gameSno}: ` +
        `${updated.meta.away} 打者${updated.batters.away.length}/投手${updated.pitchers.away.length} ` +
        `vs ${updated.meta.home} 打者${updated.batters.home.length}/投手${updated.pitchers.home.length}`
      );

    } catch (err) {
      skipped++;
      console.log(`保留原資料：${gameSno}（${err.message}）`);
    }
  }

  await page.close();
  await browser.close();

  const result = [...updatedMap.values()]
    .sort((a, b) => {
      const da = a.meta?.date || "9999-12-31";
      const db = b.meta?.date || "9999-12-31";

      if (da !== db) return da.localeCompare(db);

      return Number(a.gameSno || 0) - Number(b.gameSno || 0);
    });

  await writeGames(result);

  console.log("==============");
  console.log("📦 player detail 補強完成");
  console.log("成功：", success);
  console.log("保留：", skipped);
  console.log("最後總場次：", result.length);
}

main().catch(err => {
  console.error("❌ 失敗：", err);
  process.exit(1);
});