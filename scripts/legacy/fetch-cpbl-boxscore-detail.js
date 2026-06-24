import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SEASON_YEAR = 2026;
const KIND_CODE = "A";

const DATA_FILE_NAME = "../data/live/live-boxscore.json";

// 第一次先保守跑 30 場，穩了再加大
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
// 只補缺逐局或缺 H/E 的 final 比賽
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

function hasLineScore(g) {
  return (
    Array.isArray(g?.lineScore?.away) &&
    g.lineScore.away.length >= 9 &&
    Array.isArray(g?.lineScore?.home) &&
    g.lineScore.home.length >= 9
  );
}

function hasRHE(g) {
  return (
    g?.totals?.away?.R != null &&
    g?.totals?.away?.H != null &&
    g?.totals?.away?.E != null &&
    g?.totals?.home?.R != null &&
    g?.totals?.home?.H != null &&
    g?.totals?.home?.E != null
  );
}

function needsUpdate(g) {
  if (g?.meta?.status !== "final") return false;

  if (!ONLY_MISSING) return true;

  return !hasLineScore(g) || !hasRHE(g);
}

function normalizeCellNumber(v) {
  if (v === "X" || v === "x") return null;

  const n = Number(v);

  return Number.isFinite(n) ? n : null;
}

function mergeBoxscoreDetail(oldGame, detail) {
  const oldLineScore = oldGame.lineScore || { away: [], home: [] };
  const oldTotals = oldGame.totals || {
    away: { R: null, H: null, E: null },
    home: { R: null, H: null, E: null }
  };

  return {
    ...oldGame,

    // 不改 gameSno / meta 主資料，只補詳細成績
    lineScore: {
      away: detail.lineScore.away.length ? detail.lineScore.away : oldLineScore.away || [],
      home: detail.lineScore.home.length ? detail.lineScore.home : oldLineScore.home || []
    },

    totals: {
      away: {
        R: detail.totals.away.R ?? oldTotals.away?.R ?? null,
        H: detail.totals.away.H ?? oldTotals.away?.H ?? null,
        E: detail.totals.away.E ?? oldTotals.away?.E ?? null
      },
      home: {
        R: detail.totals.home.R ?? oldTotals.home?.R ?? null,
        H: detail.totals.home.H ?? oldTotals.home?.H ?? null,
        E: detail.totals.home.E ?? oldTotals.home?.E ?? null
      }
    },

    batters: oldGame.batters || { away: [], home: [] },
    pitchers: oldGame.pitchers || { away: [], home: [] }
  };
}

async function fetchBoxscoreDetail(page, game) {
  const gameSno = Number(game.gameSno);
  const url = game.meta?.officialUrl || buildOfficialUrl(gameSno);

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(1800);

  return await page.evaluate((expectedAway, expectedHome) => {
    const tables = Array.from(document.querySelectorAll("table"));

    if (tables.length < 3) {
      return {
        ok: false,
        reason: `表格數不足，目前 ${tables.length} 個`
      };
    }

    function getRows(table) {
      return Array.from(table.querySelectorAll("tr"))
        .map(tr =>
          Array.from(tr.querySelectorAll("th, td"))
            .map(td => td.innerText.trim())
            .filter(Boolean)
        )
        .filter(row => row.length);
    }

    function toNumber(v) {
      if (v === "X" || v === "x") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }

    // table 0：兩隊名稱
    const teamRows = getRows(tables[0]);
    const awayFromPage = teamRows?.[0]?.[0] || "";
    const homeFromPage = teamRows?.[1]?.[0] || "";

    if (
      expectedAway &&
      expectedHome &&
      awayFromPage &&
      homeFromPage &&
      (awayFromPage !== expectedAway || homeFromPage !== expectedHome)
    ) {
      return {
        ok: false,
        reason: `頁面隊伍不一致：${awayFromPage} vs ${homeFromPage}`
      };
    }

    // table 1：逐局比分
    const inningRows = getRows(tables[1]);

    if (inningRows.length < 3) {
      return {
        ok: false,
        reason: "逐局比分表不足"
      };
    }

    const awayInnings = inningRows[1]
      .slice(0, 9)
      .map(toNumber);

    const homeInnings = inningRows[2]
      .slice(0, 9)
      .map(toNumber);

    // table 2：R H E
    const rheRows = getRows(tables[2]);

    if (rheRows.length < 3) {
      return {
        ok: false,
        reason: "RHE 表不足"
      };
    }

    const awayRHE = rheRows[1].map(toNumber);
    const homeRHE = rheRows[2].map(toNumber);

    return {
      ok: true,

      teams: {
        away: awayFromPage,
        home: homeFromPage
      },

      lineScore: {
        away: awayInnings,
        home: homeInnings
      },

      totals: {
        away: {
          R: awayRHE[0] ?? null,
          H: awayRHE[1] ?? null,
          E: awayRHE[2] ?? null
        },
        home: {
          R: homeRHE[0] ?? null,
          H: homeRHE[1] ?? null,
          E: homeRHE[2] ?? null
        }
      }
    };
  }, game.meta?.away || "", game.meta?.home || "");
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

  console.log("📊 補 boxscore detail：逐局 / RHE");
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

    console.log(`抓 detail: ${gameSno} ${game.meta?.away} vs ${game.meta?.home}`);

    try {
      const detail = await fetchBoxscoreDetail(page, game);

      if (!detail || !detail.ok) {
        skipped++;
        console.log(`保留原資料：${gameSno}（${detail?.reason || "抓不到 detail"}）`);
        continue;
      }

      const updated = mergeBoxscoreDetail(game, detail);

      updatedMap.set(gameSno, updated);
      success++;

      console.log(
        `✅ ${gameSno}: ` +
        `${updated.meta.away} ${updated.totals.away.R}/${updated.totals.away.H}/${updated.totals.away.E} ` +
        `vs ${updated.totals.home.R}/${updated.totals.home.H}/${updated.totals.home.E} ${updated.meta.home}`
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
  console.log("📦 boxscore detail 補強完成");
  console.log("成功：", success);
  console.log("保留：", skipped);
  console.log("最後總場次：", result.length);
}

main().catch(err => {
  console.error("❌ 失敗：", err);
  process.exit(1);
});