import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SEASON_YEAR = 2026;
const KIND_CODE = "A";

const ONLY_MISSING = true;
const MAX_UPDATE_GAMES = 30;

const TEAM_NAMES = [
  "中信兄弟",
  "統一7-ELEVEn獅",
  "樂天桃猿",
  "富邦悍將",
  "味全龍",
  "台鋼雄鷹"
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "../data/live/live-boxscore.json");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildOfficialUrl(gameSno) {
  return `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`;
}

function normalizeGameSno(text) {
  if (!text) return null;

  const n = Number(String(text).replace(/^0+/, ""));

  return Number.isFinite(n) ? n : null;
}

function safeNumber(v) {
  if (v === null || v === undefined || v === "") return null;

  const n = Number(v);

  return Number.isFinite(n) ? n : null;
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

function hasRealScore(g) {
  const homeR = g?.totals?.home?.R;
  const awayR = g?.totals?.away?.R;

  if (typeof homeR !== "number" || typeof awayR !== "number") return false;

  if (homeR === 0 && awayR === 0) {
    const hasInnings =
      Array.isArray(g?.lineScore?.home) &&
      g.lineScore.home.length > 0 &&
      Array.isArray(g?.lineScore?.away) &&
      g.lineScore.away.length > 0;

    if (!hasInnings) return false;
  }

  return true;
}

function needsUpdate(g) {
  if (g?.meta?.status !== "final") return false;

  if (!ONLY_MISSING) return true;

  const hasScore = hasRealScore(g);

  const hasInnings =
    Array.isArray(g?.lineScore?.home) &&
    g.lineScore.home.length > 0 &&
    Array.isArray(g?.lineScore?.away) &&
    g.lineScore.away.length > 0;

  const hasRhe =
    g?.totals?.home?.R != null &&
    g?.totals?.away?.R != null &&
    g?.totals?.home?.H != null &&
    g?.totals?.away?.H != null &&
    g?.totals?.home?.E != null &&
    g?.totals?.away?.E != null;

  return !hasScore || !hasInnings || !hasRhe;
}

function mergeBoxscore(oldGame, box) {
  const oldMeta = oldGame.meta || {};

  return {
    ...oldGame,

    meta: {
      ...oldMeta,
      status: "final",
      statusText: oldMeta.statusText || "比賽結束",
      win: box.win ?? oldMeta.win ?? null,
      lose: box.lose ?? oldMeta.lose ?? null,
      save: box.save ?? oldMeta.save ?? null,
      mvp: box.mvp ?? oldMeta.mvp ?? null
    },

    lineScore: {
      away: box.lineScore?.away?.length
        ? box.lineScore.away
        : oldGame.lineScore?.away || [],

      home: box.lineScore?.home?.length
        ? box.lineScore.home
        : oldGame.lineScore?.home || []
    },

    totals: {
      away: {
        R: box.totals?.away?.R ?? oldGame.totals?.away?.R ?? null,
        H: box.totals?.away?.H ?? oldGame.totals?.away?.H ?? null,
        E: box.totals?.away?.E ?? oldGame.totals?.away?.E ?? null
      },

      home: {
        R: box.totals?.home?.R ?? oldGame.totals?.home?.R ?? null,
        H: box.totals?.home?.H ?? oldGame.totals?.home?.H ?? null,
        E: box.totals?.home?.E ?? oldGame.totals?.home?.E ?? null
      }
    },

    batters: oldGame.batters || { home: [], away: [] },
    pitchers: oldGame.pitchers || { home: [], away: [] }
  };
}

/* =========================
   抓單場 boxscore
========================= */
async function fetchBoxscore(page, game) {
  const gameSno = Number(game.gameSno);
  const url = game.meta?.officialUrl || buildOfficialUrl(gameSno);

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(1800);

  return await page.evaluate((TEAM_NAMES, targetGameSno) => {
    const bodyText = document.body?.innerText || "";

    if (!bodyText || bodyText.length < 200) {
      return {
        ok: false,
        reason: "頁面文字太短"
      };
    }

    const lines = bodyText
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    const dateBlockIndex = lines.findIndex(line =>
      /\d{4}\/\d{1,2}\/\d{1,2}\s*\(星期/.test(line)
    );

    const block = dateBlockIndex >= 0
      ? lines.slice(dateBlockIndex, dateBlockIndex + 25)
      : lines;

    const gameSnoLine =
      block.find(line => /^\d{3}$/.test(line)) ||
      block.find(line => /^\d{1,3}$/.test(line)) ||
      null;

    const displayedSno = gameSnoLine
      ? Number(String(gameSnoLine).replace(/^0+/, ""))
      : null;

    if (displayedSno != null && displayedSno !== Number(targetGameSno)) {
      return {
        ok: false,
        reason: `box 頁導向 gameSno=${displayedSno}`
      };
    }

    const teamPattern = TEAM_NAMES
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");

    const scoreLine = lines.find(line => {
      const re = new RegExp(`(${teamPattern})\\s+\\d+\\s*:\\s*\\d+\\s+(${teamPattern})`);
      return re.test(line);
    }) || "";

    let away = "";
    let home = "";
    let awayR = null;
    let homeR = null;

    const scoreMatch = scoreLine.match(
      new RegExp(`(${teamPattern})\\s+(\\d+)\\s*:\\s*(\\d+)\\s+(${teamPattern})`)
    );

    if (scoreMatch) {
      away = scoreMatch[1];
      awayR = Number(scoreMatch[2]);
      homeR = Number(scoreMatch[3]);
      home = scoreMatch[4];
    }

    const result = {
      ok: true,
      away,
      home,

      lineScore: {
        away: [],
        home: []
      },

      totals: {
        away: { R: awayR, H: null, E: null },
        home: { R: homeR, H: null, E: null }
      },

      win: null,
      lose: null,
      save: null,
      mvp: null,

      debug: {
        scoreLine,
        tableCount: document.querySelectorAll("table").length
      }
    };

    // 勝敗投 / MVP
    const winMatch = bodyText.match(/勝投[:：]\s*([^\s]+)/);
    const loseMatch = bodyText.match(/敗投[:：]\s*([^\s]+)/);
    const saveMatch = bodyText.match(/救援成功[:：]\s*([^\s]+)/) || bodyText.match(/救援[:：]\s*([^\s]+)/);
    const mvpMatch = bodyText.match(/MVP[:：]\s*([^\s]+)/i);

    result.win = winMatch?.[1] || null;
    result.lose = loseMatch?.[1] || null;
    result.save = saveMatch?.[1] || null;
    result.mvp = mvpMatch?.[1] || null;

    // 嘗試抓逐局 / RHE 表
    const tables = Array.from(document.querySelectorAll("table"));

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll("tr"));

      for (const row of rows) {
        const cols = Array.from(row.querySelectorAll("td, th"))
          .map(td => td.innerText.trim())
          .filter(Boolean);

        if (cols.length < 10) continue;

        const first = cols[0];

        const isAwayRow = away && first.includes(away);
        const isHomeRow = home && first.includes(home);

        if (!isAwayRow && !isHomeRow) continue;

        const nums = cols
          .slice(1)
          .map(v => Number(v))
          .filter(n => Number.isFinite(n));

        if (nums.length < 10) continue;

        const innings = nums.slice(0, 9);
        const R = nums[9] ?? null;
        const H = nums[10] ?? null;
        const E = nums[11] ?? null;

        if (isAwayRow) {
          result.lineScore.away = innings;
          result.totals.away = {
            R: R ?? result.totals.away.R,
            H,
            E
          };
        }

        if (isHomeRow) {
          result.lineScore.home = innings;
          result.totals.home = {
            R: R ?? result.totals.home.R,
            H,
            E
          };
        }
      }
    }

    return result;
  }, TEAM_NAMES, gameSno);
}

/* =========================
   主程式
========================= */
async function main() {
  const games = await readGames();

  if (!games.length) {
    console.log("沒有 live-boxscore.json 資料，請先跑 metadata 或 live-today。");
    return;
  }

  const targets = games
    .filter(needsUpdate)
    .slice(0, MAX_UPDATE_GAMES);

  console.log("📊 補已結束比賽 boxscore");
  console.log("待更新場次：", targets.length);

  if (!targets.length) {
    console.log("沒有需要更新的 final 比賽。");
    return;
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await setupPage(browser);
  const updatedMap = new Map(games.map(g => [Number(g.gameSno), g]));

  for (const game of targets) {
    const gameSno = Number(game.gameSno);

    console.log(`抓 boxscore: ${gameSno} ${game.meta?.away} vs ${game.meta?.home}`);

    try {
      const box = await fetchBoxscore(page, game);

      if (!box || !box.ok) {
        console.log(`保留原資料：${gameSno}（${box?.reason || "抓不到 boxscore"}）`);
        continue;
      }

      const updated = mergeBoxscore(game, box);

      updatedMap.set(gameSno, updated);

      console.log(
        `✅ ${gameSno}: ${updated.meta.away} ${updated.totals.away.R} : ${updated.totals.home.R} ${updated.meta.home} ` +
        `RHE away=${updated.totals.away.R}/${updated.totals.away.H}/${updated.totals.away.E} ` +
        `home=${updated.totals.home.R}/${updated.totals.home.H}/${updated.totals.home.E}`
      );

    } catch (err) {
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

  console.log("💾 boxscore 補強完成，共保留場次：", result.length);
}

main().catch(err => {
  console.error("❌ 失敗：", err);
  process.exit(1);
});