import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const VERSION = "v5.0-8-PREGAME-PAGE-EVALUATE-CLEAN-GUARD";
const SEASON_YEAR = 2026;
const KIND_CODE = "A";

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

const VENUES = [
  "亞太主",
  "新莊",
  "澄清湖",
  "天母",
  "花蓮",
  "斗六",
  "台東",
  "洲際",
  "樂天桃園",
  "大巨蛋",
  "嘉義市",
  "台南"
];

const FIELD_CODE_MAP = {
  F07: "嘉義市",
  F08: "新莊",
  F09: "澄清湖",
  F10: "天母",
  F11: "花蓮",
  F12: "斗六",
  F13: "台東",
  F14: "洲際",
  F15: "樂天桃園",
  F16: "大巨蛋",
  F17: "亞太主"
};

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIVE_BOX_FILE = path.join(__dirname, "../data/live/live-boxscore.json");
const PREGAME_TODAY_FILE = path.join(__dirname, "../data/live/pregame-today.json");
const PROBABLE_FILE = path.join(__dirname, "../data/live/probable-pitchers.json");
const BACKUP_DIR = path.join(__dirname, "../data/live/backups");

const DEBUG_DIR = path.join(__dirname, "../debug/pregame");
const DEBUG_SCHEDULE_FILE = path.join(DEBUG_DIR, "pregame-schedule-api-debug.json");
const DEBUG_HOME_FILE = path.join(DEBUG_DIR, "pregame-home-debug.json");
const DEBUG_SCORE_STRIP_FILE = path.join(DEBUG_DIR, "pregame-score-strip-debug.json");
const DEBUG_HOME_HTML_FILE = path.join(DEBUG_DIR, "pregame-home-after-expand.html");
const DEBUG_HOME_TEXT_FILE = path.join(DEBUG_DIR, "pregame-home-after-expand.txt");
const DEBUG_SCORE_STRIP_HTML_FILE = path.join(DEBUG_DIR, "pregame-score-strip.html");
const DEBUG_SCORE_STRIP_TEXT_FILE = path.join(DEBUG_DIR, "pregame-score-strip.txt");
const DEBUG_BOX_VUE_FILE = path.join(DEBUG_DIR, "pregame-box-vue-debug.json");

/* =========================
   基礎工具
========================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getTodayTaipei() {
  const now = new Date();

  const taipei = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const y = taipei.find(p => p.type === "year")?.value;
  const m = taipei.find(p => p.type === "month")?.value;
  const d = taipei.find(p => p.type === "day")?.value;

  return `${y}-${m}-${d}`;
}

function addDaysTaipei(dateText, days) {
  const [y, m, d] = dateText.split("-").map(Number);

  const base = new Date(Date.UTC(y, m - 1, d, 16, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);

  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(base);

  const yy = parts.find(p => p.type === "year")?.value;
  const mm = parts.find(p => p.type === "month")?.value;
  const dd = parts.find(p => p.type === "day")?.value;

  return `${yy}-${mm}-${dd}`;
}

function getTargetDate() {
  const dateArg = process.argv.find(arg => arg.startsWith("--date="));
  const tomorrowArg = process.argv.includes("--tomorrow");

  if (dateArg) {
    const value = dateArg.replace("--date=", "").trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    console.log(`⚠️ --date 格式錯誤，改用今日：${value}`);
  }

  const today = getTodayTaipei();

  if (tomorrowArg) {
    return addDaysTaipei(today, 1);
  }

  return today;
}

function isTodayTaipei(dateText) {
  return dateText === getTodayTaipei();
}

function getPregameDateFile(dateText) {
  return path.join(__dirname, `../data/live/pregame-${dateText}.json`);
}

function getTimestampForFile() {
  const d = new Date();

  return [
    d.getFullYear(),
    pad2(d.getMonth() + 1),
    pad2(d.getDate())
  ].join("") + "-" + [
    pad2(d.getHours()),
    pad2(d.getMinutes()),
    pad2(d.getSeconds())
  ].join("");
}

function cleanText(v) {
  return String(v || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function cleanOneLine(v) {
  return String(v || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fixDate(dateStr) {
  if (!dateStr) return null;

  const raw = String(dateStr)
    .replace(/\//g, "-")
    .trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) {
    const parts = raw.split(/[ T]/)[0].split("-");
    return `${parts[0]}-${pad2(parts[1])}-${pad2(parts[2])}`;
  }

  const parts = raw.split("-");

  if (parts.length >= 3 && parts[0].length === 4) {
    return `${parts[0]}-${pad2(parts[1])}-${pad2(parts[2])}`;
  }

  if (parts.length >= 2) {
    return `${SEASON_YEAR}-${pad2(parts[0])}-${pad2(parts[1])}`;
  }

  return null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function pick(raw, keys, fallback = "") {
  for (const key of keys) {
    if (raw?.[key] !== undefined && raw?.[key] !== null && raw?.[key] !== "") {
      return raw[key];
    }
  }

  return fallback;
}

function pickNumber(raw, keys) {
  for (const key of keys) {
    const n = numberOrNull(raw?.[key]);

    if (n !== null) return n;
  }

  return null;
}

function pickTeamName(raw, side) {
  if (side === "away") {
    return cleanOneLine(
      pick(raw, [
        "VisitingTeamName",
        "VisitingName",
        "VisitTeamName",
        "AwayTeamName",
        "AwayName",
        "VisitingTeam",
        "AwayTeam"
      ])
    );
  }

  return cleanOneLine(
    pick(raw, [
      "HomeTeamName",
      "HomeName",
      "HomeTeam"
    ])
  );
}

function pickVenue(raw) {
  const venue = cleanOneLine(
    pick(raw, [
      "FieldAbbe",
      "FieldName",
      "Field",
      "FieldChi",
      "Stadium",
      "Venue"
    ])
  );

  if (venue) return FIELD_CODE_MAP[venue] || venue;

  const fieldCode = cleanOneLine(
    pick(raw, [
      "FieldNo",
      "FieldCode",
      "fieldCode"
    ])
  );

  return FIELD_CODE_MAP[fieldCode] || fieldCode || "";
}

function pickGameSno(raw) {
  return Number(
    pick(raw, [
      "GameSno",
      "GameNo",
      "GameSN",
      "Sno",
      "No"
    ], 0)
  );
}

function pickGameDate(raw) {
  const dateTime = cleanOneLine(
    pick(raw, [
      "GameDateTimeS",
      "GameDate",
      "Date",
      "GameDateS",
      "GameDateTime",
      "StartDateTime"
    ])
  );

  return fixDate(dateTime);
}

function pickGameTime(raw) {
  const dateTime = cleanOneLine(
    pick(raw, [
      "GameDateTimeS",
      "GameDate",
      "Date",
      "GameDateS",
      "GameDateTime",
      "StartDateTime"
    ])
  );

  const timeMatch =
    dateTime.match(/T(\d{1,2}:\d{2})/) ||
    dateTime.match(/\s(\d{1,2}:\d{2})/) ||
    dateTime.match(/(\d{1,2}:\d{2})/);

  if (timeMatch) return timeMatch[1];

  return cleanOneLine(
    pick(raw, [
      "GameTime",
      "Time",
      "StartTime",
      "GameStartTime",
      "StartTimeS"
    ])
  );
}

function buildOfficialUrl(gameSno) {
  return `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`;
}

function normalizeType(typeText) {
  const s = String(typeText || "");

  if (s.includes("熱身")) return "exhibition";
  if (s.includes("例行")) return "regular";
  if (s.includes("總冠軍")) return "championship";
  if (s.includes("季後")) return "playoff";
  if (s.includes("明星")) return "allstar";
  if (s.includes("二軍")) return "minor";

  return "regular";
}

function toArray(data) {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    return Object.values(data);
  }

  return [];
}

function emptyBoxscore() {
  return {
    lineScore: {
      away: [],
      home: []
    },
    totals: {
      away: {
        R: null,
        H: null,
        E: null
      },
      home: {
        R: null,
        H: null,
        E: null
      }
    },
    batters: {
      away: [],
      home: []
    },
    pitchers: {
      away: [],
      home: []
    },
    liveState: null
  };
}

function isBeforeGameStart(dateText, timeText) {
  if (!dateText || !timeText) return true;

  const date = String(dateText).trim();
  const time = String(timeText).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return true;
  if (!/^\d{1,2}:\d{2}$/.test(time)) return true;

  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return true;

  const start = new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`
  );

  const now = new Date();

  return now.getTime() < start.getTime();
}

function normalizeTeamAlias(name) {
  const s = cleanOneLine(name);

  if (s.includes("統一")) return "統一";
  if (s.includes("中信")) return "中信";
  if (s.includes("樂天")) return "樂天";
  if (s.includes("富邦")) return "富邦";
  if (s.includes("味全")) return "味全";
  if (s.includes("台鋼")) return "台鋼";

  return s;
}

function getDateForms(dateText) {
  const [y, m, d] = dateText.split("-");

  return [
    dateText,
    `${y}/${m}/${d}`,
    `${y}/${Number(m)}/${Number(d)}`,
    `${Number(m)}/${Number(d)}`,
    `${m}/${d}`,
    `${Number(m)}月${Number(d)}日`,
    `${m}月${d}日`
  ];
}

/* =========================
   dataQuality
========================= */

function quality(condition, partial = false) {
  if (condition) return "confirmed";
  if (partial) return "partial";
  return "debug";
}

function buildPregameDataQuality(game) {
  const awayStarter = game?.pregame?.starters?.away || "";
  const homeStarter = game?.pregame?.starters?.home || "";

  const awayLineupCount = game?.pregame?.lineups?.away?.length || 0;
  const homeLineupCount = game?.pregame?.lineups?.home?.length || 0;

  const hasSchedule =
    !!game?.meta?.date &&
    !!game?.meta?.away &&
    !!game?.meta?.home &&
    !!game?.meta?.time &&
    !!game?.meta?.venue;

  const hasBothStarters = !!awayStarter && !!homeStarter;
  const hasAnyStarter = !!awayStarter || !!homeStarter;

  const hasBothLineups = awayLineupCount >= 9 && homeLineupCount >= 9;
  const hasAnyLineup = awayLineupCount > 0 || homeLineupCount > 0;

  return {
    version: VERSION,
    source: "fetch-cpbl-pregame-today",
    stage: "pregame",
    schedule: quality(hasSchedule),
    starters: quality(hasBothStarters, hasAnyStarter),
    lineups: quality(hasBothLineups, hasAnyLineup),
    liveSafe: "confirmed",
    finalSafe: "confirmed",
    mode: "pregame-safe-parser",
    message: "PREGAME 安全模式：只更新 scheduled / pregame 區塊，不覆蓋 LIVE / FINAL 狀態。",
    updatedAt: new Date().toISOString()
  };
}

/* =========================
   檔案
========================= */

async function readJsonFile(filepath, fallback) {
  try {
    const text = await fs.readFile(filepath, "utf-8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filepath, data) {
  await fs.mkdir(path.dirname(filepath), {
    recursive: true
  });

  await fs.writeFile(
    filepath,
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

async function writeJsonFileWithBackup(filepath, data, label = "pregame") {
  await fs.mkdir(path.dirname(filepath), {
    recursive: true
  });

  await fs.mkdir(BACKUP_DIR, {
    recursive: true
  });

  const stamp = getTimestampForFile();
  const basename = path.basename(filepath, ".json");
  const backupFile = path.join(BACKUP_DIR, `${basename}-${label}-${stamp}.json`);

  try {
    const oldText = await fs.readFile(filepath, "utf-8");
    await fs.writeFile(backupFile, oldText, "utf-8");

    console.log(`🛡️ 已備份舊資料：${path.relative(path.join(__dirname, ".."), backupFile)}`);
  } catch {
    console.log(`🛡️ ${path.basename(filepath)} 尚無舊資料可備份，略過備份。`);
  }

  await fs.writeFile(filepath, JSON.stringify(data, null, 2), "utf-8");
}

async function readExistingLiveGames() {
  const data = await readJsonFile(LIVE_BOX_FILE, []);
  return toArray(data);
}

/* =========================
   Puppeteer
========================= */

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

async function setupPage(browser) {
  const page = await browser.newPage();

  await page.setViewport({
    width: 1500,
    height: 2200,
    deviceScaleFactor: 1
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "Chrome/120.0.0.0 Safari/537.36"
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
   schedule/getgamedatas
========================= */

function parseGameDatasPayload(payload) {
  if (!payload) return [];

  let rawList = [];

  if (Array.isArray(payload)) {
    rawList = payload;
  } else if (Array.isArray(payload.GameDatas)) {
    rawList = payload.GameDatas;
  } else if (typeof payload.GameDatas === "string") {
    try {
      rawList = JSON.parse(payload.GameDatas);
    } catch {
      rawList = [];
    }
  } else if (Array.isArray(payload.gameDatas)) {
    rawList = payload.gameDatas;
  } else if (typeof payload.gameDatas === "string") {
    try {
      rawList = JSON.parse(payload.gameDatas);
    } catch {
      rawList = [];
    }
  } else if (Array.isArray(payload.data)) {
    rawList = payload.data;
  } else if (payload.data && typeof payload.data === "object") {
    rawList = Object.values(payload.data).flat();
  }

  return rawList;
}

function normalizeScheduleGame(raw) {
  const gameSno = pickGameSno(raw);

  if (!gameSno) return null;

  const date = pickGameDate(raw);
  const time = pickGameTime(raw);

  const away = pickTeamName(raw, "away");
  const home = pickTeamName(raw, "home");
  const venue = pickVenue(raw);

  const awayScore = pickNumber(raw, [
    "VisitingScore",
    "VisitScore",
    "AwayScore",
    "VisitingTeamScore",
    "AwayTeamScore",
    "VisitingPoint",
    "AwayPoint",
    "VisitingRuns",
    "AwayRuns",
    "VisitingR",
    "AwayR",
    "GuestScore"
  ]);

  const homeScore = pickNumber(raw, [
    "HomeScore",
    "HomeTeamScore",
    "HomePoint",
    "HomeRuns",
    "HomeR"
  ]);

  const gameTypeText = cleanOneLine(
    pick(raw, [
      "KindName",
      "GameKindName",
      "KindCodeName",
      "GameType",
      "GameTypeName"
    ], "一軍例行賽")
  );

  return {
    gameSno,
    date,
    away,
    home,
    venue,
    time,
    status: "scheduled",
    statusText: "比賽尚未開始",
    type: normalizeType(gameTypeText),
    typeText: gameTypeText || "一軍例行賽",
    awayScore: awayScore ?? 0,
    homeScore: homeScore ?? 0,
    awayStarter: cleanOneLine(
      pick(raw, [
        "VisitingStartingPitcher",
        "VisitingStarter",
        "AwayStartingPitcher",
        "AwayStarter",
        "VisitingProbablePitcher",
        "AwayProbablePitcher"
      ])
    ),
    homeStarter: cleanOneLine(
      pick(raw, [
        "HomeStartingPitcher",
        "HomeStarter",
        "HomeProbablePitcher"
      ])
    ),
    duration: cleanOneLine(
      pick(raw, [
        "GameDuringTime",
        "DuringTime",
        "Duration",
        "GameTimeLong"
      ])
    ),
    raw
  };
}

async function discoverTargetGamesFromScheduleApi(browser, targetDate) {
  console.log("🔎 賽前：從官方 schedule/getgamedatas 抓目標日期賽程...");
  console.log("目標日期：", targetDate);

  const page = await setupPage(browser);
  const captured = [];

  page.on("response", async response => {
    const url = response.url();

    if (!url.includes("/schedule/getgamedatas")) return;

    try {
      const text = await response.text();
      const payload = JSON.parse(text);

      captured.push({
        url,
        payload,
        sample: cleanOneLine(text).slice(0, 1200)
      });
    } catch (err) {
      captured.push({
        url,
        error: err.message
      });
    }
  });

  await page.goto(`https://www.cpbl.com.tw/schedule?year=${SEASON_YEAR}`, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(3500);

  if (!captured.length) {
    const directAttempts = [
      {
        label: "GET basic",
        method: "GET",
        url: "/schedule/getgamedatas"
      },
      {
        label: "GET year kind",
        method: "GET",
        url: `/schedule/getgamedatas?year=${SEASON_YEAR}&kindCode=${KIND_CODE}`
      },
      {
        label: "POST year kind",
        method: "POST",
        url: "/schedule/getgamedatas",
        body: {
          year: SEASON_YEAR,
          kindCode: KIND_CODE
        }
      },
      {
        label: "POST uppercase",
        method: "POST",
        url: "/schedule/getgamedatas",
        body: {
          Year: SEASON_YEAR,
          KindCode: KIND_CODE
        }
      }
    ];

    for (const attempt of directAttempts) {
      try {
        const directPayload = await page.evaluate(async attemptInPage => {
          const options = {
            method: attemptInPage.method,
            credentials: "include",
            headers: {}
          };

          if (attemptInPage.body) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(attemptInPage.body);
          }

          const res = await fetch(attemptInPage.url, options);
          return await res.json();
        }, attempt);

        captured.push({
          url: `page-fetch:${attempt.label}:${attempt.url}`,
          payload: directPayload,
          sample: JSON.stringify(directPayload).slice(0, 1200)
        });

        const list = parseGameDatasPayload(directPayload);

        if (list.length) break;
      } catch (err) {
        captured.push({
          url: `page-fetch:${attempt.label}:${attempt.url}`,
          error: err.message
        });
      }
    }
  }

  await safeClosePage(page);

  const rawGames = [];

  for (const item of captured) {
    const list = parseGameDatasPayload(item.payload);
    rawGames.push(...list);
  }

  const normalized = rawGames
    .map(normalizeScheduleGame)
    .filter(Boolean);

  const uniqueMap = new Map();

  for (const game of normalized) {
    const key = `${game.date}_${game.gameSno}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, game);
    }
  }

  const uniqueGames = [...uniqueMap.values()];

  const targetGames = uniqueGames
    .filter(game => game.date === targetDate)
    .sort((a, b) => Number(a.gameSno) - Number(b.gameSno));

  await writeJsonFile(DEBUG_SCHEDULE_FILE, {
    targetDate,
    capturedCount: captured.length,
    rawCount: rawGames.length,
    normalizedCount: normalized.length,
    uniqueCount: uniqueGames.length,
    targetCount: targetGames.length,
    captured: captured.map(item => ({
      url: item.url,
      error: item.error || null,
      sample: item.sample || ""
    })),
    targetGames,
    normalizedSample: uniqueGames.slice(0, 50),
    parserMode: VERSION,
    updatedAt: new Date().toISOString()
  });

  targetGames.forEach(g => {
    console.log(
      `✅ 賽前場次 ${g.gameSno}: ${g.away || "?"} vs ${g.home || "?"} ` +
      `${g.venue || ""} ${g.time || ""} 比賽尚未開始｜` +
      `預告先發 ${g.awayStarter || "—"} vs ${g.homeStarter || "—"}`
    );
  });

  return targetGames;
}

/* =========================
   首頁比分橫條：切日期
========================= */

async function moveScoreStripToTargetDate(page, targetDate) {
  console.log(`📅 比分橫條：嘗試切換到 ${targetDate}...`);

  const targetForms = getDateForms(targetDate);
  const maxClicks = 8;

  for (let i = 0; i <= maxClicks; i++) {
    const state = await page.evaluate(() => {
      function one(v) {
        return String(v || "")
          .replace(/\u00a0/g, " ")
          .replace(/\r/g, " ")
          .replace(/\n/g, " ")
          .replace(/[ \t]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      function pickScoreStripText() {
        const selectors = [
          "#scoreTrack",
          ".scoreTrack",
          ".score-track",
          ".score-strip",
          ".game_list",
          ".game-list",
          ".top_game",
          ".today_game",
          ".index_game",
          "section",
          "div"
        ];

        const candidates = [];

        for (const selector of selectors) {
          const elements = Array.from(document.querySelectorAll(selector));

          for (const el of elements) {
            const rect = el.getBoundingClientRect();
            const text = one(el.innerText || el.textContent || "");

            if (!text) continue;
            if (rect.width <= 0 || rect.height <= 0) continue;

            const hasDate =
              /\d{4}\/\d{1,2}\/\d{1,2}/.test(text) ||
              /\d{4}-\d{1,2}-\d{1,2}/.test(text);

            const hasNav =
              text.toLowerCase().includes("previous") ||
              text.toLowerCase().includes("next") ||
              text.includes("一軍") ||
              text.includes("二軍");

            const hasGame =
              text.includes("中信兄弟") ||
              text.includes("統一") ||
              text.includes("樂天") ||
              text.includes("富邦") ||
              text.includes("味全") ||
              text.includes("台鋼");

            if (!hasDate && !hasGame) continue;

            let score = 0;
            if (hasDate) score += 10;
            if (hasNav) score += 6;
            if (hasGame) score += 5;
            if (text.includes("成績看板")) score += 4;
            if (text.includes("比賽尚未開始")) score += 4;
            if (text.includes("客場先發")) score += 8;
            if (text.includes("主場先發")) score += 8;

            candidates.push({
              text,
              score,
              area: rect.width * rect.height,
              length: text.length,
              rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            });
          }
        }

        candidates.sort((a, b) => {
          if (a.score !== b.score) return b.score - a.score;
          if (a.area !== b.area) return a.area - b.area;
          return a.length - b.length;
        });

        return candidates[0]?.text || one(document.body?.innerText || "").slice(0, 2500);
      }

      const text = pickScoreStripText();

      const dateMatch =
        text.match(/\d{4}\/\d{1,2}\/\d{1,2}/) ||
        text.match(/\d{4}-\d{1,2}-\d{1,2}/);

      return {
        text: text.slice(0, 2500),
        visibleDate: dateMatch ? dateMatch[0] : ""
      };
    });

    const alreadyTarget = targetForms.some(form => state.text.includes(form));

    if (alreadyTarget) {
      console.log(`✅ 比分橫條已在目標日期：${targetDate}`);
      return true;
    }

    console.log(
      `📅 比分橫條目前日期：${state.visibleDate || "未知"}，尚未到 ${targetDate}`
    );

    const clicked = await page.evaluate(() => {
      function one(v) {
        return String(v || "")
          .replace(/\u00a0/g, " ")
          .replace(/\r/g, " ")
          .replace(/\n/g, " ")
          .replace(/[ \t]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      const elements = Array.from(
        document.querySelectorAll("button, a, [role='button'], .next, .slick-next, .swiper-button-next")
      );

      const candidates = elements
        .map(el => {
          const text = one(
            el.innerText ||
            el.textContent ||
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            ""
          );

          const className = String(el.className || "");
          const id = String(el.id || "");
          const href = String(el.getAttribute("href") || "");
          const rect = el.getBoundingClientRect();

          let score = 0;

          if (text.toLowerCase() === "next") score += 20;
          if (text.toLowerCase().includes("next")) score += 15;
          if (text.includes("下一")) score += 15;
          if (/next/i.test(className)) score += 20;
          if (/next/i.test(id)) score += 20;
          if (/next/i.test(href)) score += 10;

          if (rect.x > window.innerWidth / 2) score += 3;

          if (text.includes("更多")) score -= 20;
          if (text.includes("新聞")) score -= 20;
          if (/news/i.test(className) || /news/i.test(id) || /news/i.test(href)) score -= 20;

          return {
            el,
            text,
            className,
            id,
            href,
            score,
            visible: rect.width > 0 && rect.height > 0,
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          };
        })
        .filter(item => item.visible && item.score > 0)
        .sort((a, b) => b.score - a.score);

      const target = candidates[0];

      if (!target) return false;

      target.el.scrollIntoView({
        block: "center",
        inline: "center"
      });

      target.el.click();

      return true;
    });

    if (!clicked) {
      console.log("⚠️ 找不到比分橫條 next 按鈕");
      return false;
    }

    console.log(`➡️ 已點擊比分橫條 next，第 ${i + 1} 次`);
    await sleep(1300);
  }

  console.log(`⚠️ 點擊 next ${maxClicks} 次後仍未切到 ${targetDate}`);
  return false;
}

/* =========================
   首頁比分橫條：抓預告先發
========================= */

async function discoverScoreStripPregameCards(browser, scheduleGames, targetDate) {
  console.log("🎯 賽前：從官方首頁比分橫條抓預告先發...");

  const page = await setupPage(browser);

  await page.goto("https://www.cpbl.com.tw/", {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(3500);

  await moveScoreStripToTargetDate(page, targetDate);

  await sleep(1500);

  try {
    await fs.mkdir(DEBUG_DIR, { recursive: true });
    await fs.writeFile(DEBUG_SCORE_STRIP_HTML_FILE, await page.content(), "utf-8");
    await fs.writeFile(
      DEBUG_SCORE_STRIP_TEXT_FILE,
      await page.evaluate(() => document.body?.innerText || ""),
      "utf-8"
    );
  } catch (err) {
    console.log(`⚠️ 寫入比分橫條 debug 失敗：${err.message}`);
  }

  const payload = await page.evaluate((TEAM_NAMES_IN_PAGE, VENUES_IN_PAGE, scheduleGamesInPage, targetDateInPage, dateFormsInPage) => {
    function one(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function cleanBlock(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, "\n")
        .trim();
    }

    function linesOf(text) {
      return String(text || "")
        .split("\n")
        .map(one)
        .filter(Boolean);
    }

    function normalizeAlias(name) {
      const s = one(name);

      if (s.includes("統一")) return "統一";
      if (s.includes("中信")) return "中信";
      if (s.includes("樂天")) return "樂天";
      if (s.includes("富邦")) return "富邦";
      if (s.includes("味全")) return "味全";
      if (s.includes("台鋼")) return "台鋼";

      return s;
    }

    function collectElementText(el) {
      const pieces = [];

      function push(v) {
        const s = one(v);
        if (s) pieces.push(s);
      }

      push(el.innerText);
      push(el.textContent);

      const attrNames = [
        "title",
        "aria-label",
        "alt",
        "data-title",
        "data-name",
        "data-team",
        "data-away",
        "data-home",
        "data-pitcher",
        "data-starter",
        "data-tooltip",
        "data-content",
        "data-original-title"
      ];

      for (const attr of attrNames) {
        push(el.getAttribute?.(attr));
      }

      for (const attr of Array.from(el.attributes || [])) {
        if (/^(data-|aria-)/i.test(attr.name)) {
          push(attr.value);
        }
      }

      const descendants = Array.from(el.querySelectorAll("*"));

      for (const child of descendants.slice(0, 120)) {
        push(child.innerText);
        push(child.textContent);

        for (const attr of attrNames) {
          push(child.getAttribute?.(attr));
        }

        for (const attr of Array.from(child.attributes || [])) {
          if (/^(data-|aria-)/i.test(attr.name)) {
            push(attr.value);
          }
        }
      }

      return [...new Set(pieces)]
        .join("\n")
        .replace(/\n+/g, "\n")
        .trim();
    }

    function isPlayerLike(text) {
      const s = one(text);

      if (!s) return false;
      if (TEAM_NAMES_IN_PAGE.some(team => s.includes(team))) return false;
      if (VENUES_IN_PAGE.some(venue => s.includes(venue))) return false;

      const banned = [
        "客場先發",
        "主場先發",
        "客隊先發",
        "主隊先發",
        "預告先發",
        "先發投手",
        "先發",
        "打者",
        "投手",
        "LIVE",
        "比賽中",
        "比賽尚未開始",
        "比賽結束",
        "VS",
        "VS.",
        "售票",
        "更多",
        "English",
        "CPBLTV",
        "Box Score",
        "BOX SCORE",
        "賽程",
        "成績看板",
        "球隊戰績",
        "日期",
        "場次",
        "隊伍",
        "場地",
        "previous",
        "next",
        "一軍",
        "二軍",
        "星期",
        "亞太主",
        "新莊",
        "天母"
      ];

      if (banned.some(word => s.includes(word))) return false;
      if (/^\d+$/.test(s)) return false;
      if (/^\d{1,2}:\d{2}$/.test(s)) return false;
      if (/^\d+\s*:\s*\d+$/.test(s)) return false;
      if (/^\d+-\d+(-\d+)?$/.test(s)) return false;
      if (/^\d{1,2}\/\d{1,2}$/.test(s)) return false;
      if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) return false;
      if (s.length < 2 || s.length > 16) return false;

      return /^[\u4e00-\u9fa5A-Za-z·．・\-]+$/.test(s);
    }

    function cleanStarterName(text) {
      let s = one(text);

      if (!s) return "";

      s = s
        .replace(/客場先發/g, "")
        .replace(/主場先發/g, "")
        .replace(/客隊先發/g, "")
        .replace(/主隊先發/g, "")
        .replace(/預告先發/g, "")
        .replace(/先發投手/g, "")
        .replace(/先發/g, "")
        .replace(/^[:：\-\s]+/, "")
        .replace(/[，,。]+$/, "")
        .trim();

      if (!isPlayerLike(s)) return "";

      return s;
    }

    function extractStarterByLabel(lines, labels) {
      for (const label of labels) {
        const idx = lines.findIndex(line => line.includes(label));

        if (idx < 0) continue;

        const sameLine = cleanStarterName(lines[idx]);

        if (sameLine) return sameLine;

        for (let i = idx + 1; i < Math.min(lines.length, idx + 12); i++) {
          const line = lines[i];

          if (
            line.includes("售票") ||
            line.includes("更多") ||
            line.includes("VS") ||
            line.includes("Box Score") ||
            line.includes("比賽") ||
            line.includes("成績看板")
          ) {
            continue;
          }

          const candidate = cleanStarterName(line);

          if (candidate) return candidate;
        }
      }

      return "";
    }

    function extractByCompactText(text) {
      const t = one(text);

      const result = {
        awayStarter: "",
        homeStarter: ""
      };

      const awayPatterns = [
        /客場先發[:：\s]*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/,
        /客隊先發[:：\s]*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/,
        /客場預告先發[:：\s]*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/,
        /客隊預告先發[:：\s]*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/
      ];

      const homePatterns = [
        /主場先發[:：\s]*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/,
        /主隊先發[:：\s]*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/,
        /主場預告先發[:：\s]*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/,
        /主隊預告先發[:：\s]*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/
      ];

      for (const pattern of awayPatterns) {
        const match = t.match(pattern);
        const name = cleanStarterName(match?.[1] || "");
        if (name) {
          result.awayStarter = name;
          break;
        }
      }

      for (const pattern of homePatterns) {
        const match = t.match(pattern);
        const name = cleanStarterName(match?.[1] || "");
        if (name) {
          result.homeStarter = name;
          break;
        }
      }

      return result;
    }

    function extractLoosePlayers(text, game) {
      let t = cleanBlock(text);

      const removeWords = [
        game.away,
        game.home,
        normalizeAlias(game.away),
        normalizeAlias(game.home),
        String(game.gameSno),
        game.venue,
        game.time,
        "比賽尚未開始",
        "比賽結束",
        "比賽中",
        "客場先發",
        "主場先發",
        "客隊先發",
        "主隊先發",
        "預告先發",
        "先發投手",
        "先發",
        "VS.",
        "VS",
        "vs",
        "成績看板",
        "售票資訊",
        "一軍",
        "二軍",
        "previous",
        "next"
      ].filter(Boolean);

      for (const word of removeWords) {
        t = t.split(word).join("\n");
      }

      t = t
        .replace(/\d{4}\/\d{1,2}\/\d{1,2}/g, "\n")
        .replace(/\d{4}-\d{1,2}-\d{1,2}/g, "\n")
        .replace(/\d{1,2}:\d{2}/g, "\n")
        .replace(/\d+-\d+-\d+/g, "\n")
        .replace(/\d+\s*:\s*\d+/g, "\n")
        .replace(/[|｜/／,，。:：()（）\[\]【】]/g, "\n");

      const players = linesOf(t)
        .map(cleanStarterName)
        .filter(Boolean)
        .filter(isPlayerLike);

      return [...new Set(players)];
    }

    function isWrongArea(el) {
      const text = one(el.innerText || el.textContent || "");
      const className = String(el.className || "");
      const id = String(el.id || "");

      const badWords = [
        "最新消息",
        "新聞",
        "News",
        "NEWS",
        "公告",
        "影音",
        "Video",
        "VIDEO",
        "球員異動",
        "商城",
        "排行榜",
        "投手TOP5",
        "打者TOP5",
        "MAGAZINES",
        "STANDING",
        "NEWS"
      ];

      if (badWords.some(w => text.includes(w))) return true;
      if (/news|News|NEWS|video|Video|banner|ad|magazine|standing/i.test(className)) return true;
      if (/news|News|NEWS|video|Video|banner|ad|magazine|standing/i.test(id)) return true;

      return false;
    }

    function textLooksLikeTargetGame(text, game) {
      const t = one(text);

      if (!t) return false;

      const awayAlias = normalizeAlias(game.away || "");
      const homeAlias = normalizeAlias(game.home || "");

      const awayOk = t.includes(game.away) || t.includes(awayAlias);
      const homeOk = t.includes(game.home) || t.includes(homeAlias);

      if (!awayOk || !homeOk) return false;

      const gameSnoOk =
        t.includes(String(game.gameSno)) ||
        new RegExp(`(^|\\s)${game.gameSno}(\\s|$)`).test(t);

      const dateOk = dateFormsInPage.some(dateText => t.includes(dateText));
      const timeOk = game.time ? t.includes(game.time) : false;
      const venueOk = game.venue ? t.includes(game.venue) : false;
      const hasStarter = t.includes("先發");

      return gameSnoOk || dateOk || timeOk || venueOk || hasStarter;
    }

    function findBestScoreStripElement(game) {
      const selectors = [
        "#scoreTrack",
        ".scoreTrack",
        ".score-track",
        ".score-strip",
        ".score-card",
        ".game-card",
        ".game",
        ".game_item",
        ".game-item",
        ".top_game",
        ".today_game",
        ".index_game",
        "li",
        "article",
        "section",
        "a",
        "div"
      ].join(",");

      const elements = Array.from(document.querySelectorAll(selectors));

      const candidates = [];

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const text = collectElementText(el);

        if (!text) continue;
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (rect.width < 80) continue;
        if (rect.height < 20) continue;
        if (rect.height > 900) continue;
        if (isWrongArea(el)) continue;
        if (!textLooksLikeTargetGame(text, game)) continue;

        const usefulPower =
          (text.includes("客場先發") ? 15 : 0) +
          (text.includes("主場先發") ? 15 : 0) +
          (text.includes("客隊先發") ? 15 : 0) +
          (text.includes("主隊先發") ? 15 : 0) +
          (text.includes("預告先發") ? 12 : 0) +
          (text.includes("先發投手") ? 12 : 0) +
          (text.includes("先發") ? 8 : 0) +
          (dateFormsInPage.some(d => text.includes(d)) ? 4 : 0) +
          (game.time && text.includes(game.time) ? 4 : 0) +
          (game.venue && text.includes(game.venue) ? 3 : 0) +
          (String(game.gameSno) && text.includes(String(game.gameSno)) ? 4 : 0);

        candidates.push({
          el,
          usefulPower,
          area: rect.width * rect.height,
          textLength: text.length,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          text
        });
      }

      candidates.sort((a, b) => {
        if (a.usefulPower !== b.usefulPower) return b.usefulPower - a.usefulPower;
        if (a.area !== b.area) return a.area - b.area;
        return a.textLength - b.textLength;
      });

      return {
        best: candidates[0] || null,
        candidates: candidates.slice(0, 10).map(item => ({
          usefulPower: item.usefulPower,
          area: Math.round(item.area),
          textLength: item.textLength,
          rect: item.rect,
          textSample: one(item.text).slice(0, 1000)
        }))
      };
    }

    function parseGame(game) {
      const found = findBestScoreStripElement(game);

      if (!found.best) {
        return {
          gameSno: Number(game.gameSno),
          awayStarter: "",
          homeStarter: "",
          lineups: {
            away: [],
            home: []
          },
          foundCard: false,
          source: "official-home-score-strip",
          debugText: "",
          debugLines: [],
          candidates: found.candidates,
          loosePlayers: []
        };
      }

      const text = found.best.text;
      const lines = linesOf(text);

      const compact = extractByCompactText(text);

      let awayStarter =
        compact.awayStarter ||
        extractStarterByLabel(lines, [
          "客場先發",
          "客隊先發",
          "客場預告先發",
          "客隊預告先發"
        ]);

      let homeStarter =
        compact.homeStarter ||
        extractStarterByLabel(lines, [
          "主場先發",
          "主隊先發",
          "主場預告先發",
          "主隊預告先發"
        ]);

      const loosePlayers = extractLoosePlayers(text, game);

      if (!awayStarter && loosePlayers[0]) {
        awayStarter = loosePlayers[0];
      }

      if (!homeStarter && loosePlayers[1]) {
        homeStarter = loosePlayers[1];
      }

      return {
        gameSno: Number(game.gameSno),
        awayStarter,
        homeStarter,
        lineups: {
          away: [],
          home: []
        },
        foundCard: !!(awayStarter || homeStarter),
        source: "official-home-score-strip",
        cardRect: found.best.rect,
        debugText: one(text).slice(0, 3000),
        debugLines: lines.slice(0, 180),
        candidates: found.candidates,
        loosePlayers
      };
    }

    function parseFromBodyByGameSno(game, allText) {
      const text = one(allText);
      const currentSno = String(game.gameSno);

      const nextSnos = scheduleGamesInPage
        .map(g => Number(g.gameSno))
        .filter(n => n > Number(game.gameSno))
        .sort((a, b) => a - b);

      const currentIndex = text.indexOf(currentSno);

      if (currentIndex < 0) return null;

      let endIndex = text.length;

      for (const nextSno of nextSnos) {
        const idx = text.indexOf(String(nextSno), currentIndex + currentSno.length);

        if (idx > currentIndex) {
          endIndex = idx;
          break;
        }
      }

      let block = text.slice(currentIndex, endIndex);

      const stopWords = [
        "職業棒球雜誌",
        "MAGAZINES",
        "球隊戰績",
        "STANDING",
        "投手TOP5",
        "打擊TOP5",
        "最新消息",
        "NEWS",
        "新聞公告"
      ];

      for (const word of stopWords) {
        const idx = block.indexOf(word);

        if (idx >= 0) {
          block = block.slice(0, idx);
        }
      }

      const awayMatch =
        block.match(/客場先發\s*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/) ||
        block.match(/客隊先發\s*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/);

      const homeMatch =
        block.match(/主場先發\s*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/) ||
        block.match(/主隊先發\s*([\u4e00-\u9fa5A-Za-z·．・\-]{2,16})/);

      const awayStarter = cleanStarterName(awayMatch?.[1] || "");
      const homeStarter = cleanStarterName(homeMatch?.[1] || "");
      

      function isBadStarterText(text) {
        const s = one(text);

        if (!s) return true;
        if (TEAM_NAMES_IN_PAGE.some(team => s.includes(team))) return true;
        if (VENUES_IN_PAGE.some(venue => s.includes(venue))) return true;

        const banned = [
          "客場先發",
          "主場先發",
          "客隊先發",
          "主隊先發",
          "預告先發",
          "先發投手",
          "先發",
          "打者",
          "投手",
          "LIVE",
          "比賽中",
          "比賽尚未開始",
          "比賽結束",
          "VS",
          "VS.",
          "售票",
          "更多",
          "English",
          "CPBLTV",
          "Box Score",
          "BOX SCORE",
          "賽程",
          "成績看板",
          "球隊戰績",
          "日期",
          "場次",
          "隊伍",
          "場地",
          "previous",
          "next",
          "一軍",
          "二軍",
          "星期"
        ];

        if (banned.some(word => s.includes(word))) return true;
        if (/^\d+$/.test(s)) return true;
        if (/^\d{1,2}:\d{2}$/.test(s)) return true;
        if (/^\d+\s*:\s*\d+$/.test(s)) return true;
        if (/^\d+-\d+(-\d+)?$/.test(s)) return true;
        if (/^\d{1,2}\/\d{1,2}$/.test(s)) return true;
        if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) return true;
        if (s.length < 2 || s.length > 16) return true;

        return !/^[\u4e00-\u9fa5A-Za-z·．・\-]+$/.test(s);
      }

      function cleanStarterName(name) {
        const s = one(name);
        return isBadStarterText(s) ? "" : s;
      }
      if (!awayStarter && !homeStarter) return null;

      return {
        gameSno: Number(game.gameSno),
        awayStarter,
        homeStarter,
        lineups: {
          away: [],
          home: []
        },
        foundCard: true,
        source: "official-home-score-strip-body-fallback",
        debugText: block.slice(0, 2200),
        debugLines: linesOf(block).slice(0, 120),
        candidates: [],
        loosePlayers: [awayStarter, homeStarter].filter(Boolean)
      };
    }

    const bodyText = document.body?.innerText || "";

    const games = scheduleGamesInPage
      .map(game => {
        const parsedByCard = parseGame(game);

        if (parsedByCard?.awayStarter || parsedByCard?.homeStarter) {
          return parsedByCard;
        }

        return parseFromBodyByGameSno(game, bodyText) || parsedByCard;
      })
      .sort((a, b) => Number(a.gameSno) - Number(b.gameSno));

    return {
      games,
      debug: {
        targetDate: targetDateInPage,
        dateForms: dateFormsInPage,
        gameCount: games.length,
        games,
        bodySample: one(bodyText).slice(0, 9000)
      }
    };
  }, TEAM_NAMES, VENUES, scheduleGames, targetDate, getDateForms(targetDate));

  await safeClosePage(page);

  const games = Array.isArray(payload.games)
    ? payload.games
    : [];

  await writeJsonFile(DEBUG_SCORE_STRIP_FILE, {
    ...(payload.debug || {}),
    parserMode: VERSION,
    updatedAt: new Date().toISOString()
  });

  games.forEach(g => {
    console.log(
      `🎯 比分橫條 ${g.gameSno}: ` +
      `客場先發=${g.awayStarter || "—"}｜主場先發=${g.homeStarter || "—"}｜` +
      `候選=${Array.isArray(g.loosePlayers) ? g.loosePlayers.join(",") : "—"}`
    );
  });

  return games;
}

/* =========================
   官方首頁：精準展開比賽卡更多資訊
========================= */

async function expandPregameMoreInfo(page, scheduleGames) {
  console.log("🔽 賽前：精準展開官方首頁比賽卡更多資訊...");

  const safeGames = scheduleGames.map(game => ({
    gameSno: Number(game.gameSno),
    away: game.away || "",
    home: game.home || "",
    awayAlias: normalizeTeamAlias(game.away || ""),
    homeAlias: normalizeTeamAlias(game.home || ""),
    venue: game.venue || "",
    time: game.time || ""
  }));

  try {
    const beforeUrl = page.url();

    const clickedReport = await page.evaluate(games => {
      function clean(v) {
        return String(v || "")
          .replace(/\u00a0/g, " ")
          .replace(/\r/g, "\n")
          .replace(/[ \t]+/g, " ")
          .replace(/\n+/g, "\n")
          .trim();
      }

      function one(v) {
        return String(v || "")
          .replace(/\u00a0/g, " ")
          .replace(/\r/g, " ")
          .replace(/\n/g, " ")
          .replace(/[ \t]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      function normalizeAlias(name) {
        const s = one(name);

        if (s.includes("統一")) return "統一";
        if (s.includes("中信")) return "中信";
        if (s.includes("樂天")) return "樂天";
        if (s.includes("富邦")) return "富邦";
        if (s.includes("味全")) return "味全";
        if (s.includes("台鋼")) return "台鋼";

        return s;
      }

      function isNewsOrWrongArea(el) {
        const text = one(el.innerText || el.textContent || "");
        const className = String(el.className || "");
        const id = String(el.id || "");

        const badWords = [
          "最新消息",
          "新聞",
          "News",
          "NEWS",
          "公告",
          "影音",
          "Video",
          "VIDEO",
          "球員異動",
          "商城",
          "排行榜",
          "投手TOP5",
          "打者TOP5"
        ];

        if (badWords.some(w => text.includes(w))) return true;
        if (/news|News|NEWS|video|Video|banner|ad/i.test(className)) return true;
        if (/news|News|NEWS|video|Video|banner|ad/i.test(id)) return true;

        return false;
      }

      function textLooksLikeGameCard(text, game) {
        const t = one(text);

        if (!t) return false;

        const gameSnoOk =
          t.includes(String(game.gameSno)) ||
          new RegExp(`(^|\\s)${game.gameSno}(\\s|$)`).test(t);

        const awayOk =
          t.includes(game.away) ||
          t.includes(game.awayAlias) ||
          t.includes(normalizeAlias(game.away));

        const homeOk =
          t.includes(game.home) ||
          t.includes(game.homeAlias) ||
          t.includes(normalizeAlias(game.home));

        const venueOk = !game.venue || t.includes(game.venue);
        const timeOk = !game.time || t.includes(game.time);

        const hasVs = t.includes("VS") || t.includes("vs") || t.includes(":");

        return gameSnoOk && awayOk && homeOk && hasVs && (venueOk || timeOk);
      }

      function findSmallestCardForGame(game) {
        const selector = [
          "li",
          "article",
          "section",
          ".item",
          ".game",
          ".game_item",
          ".game-item",
          ".game_list",
          ".game-list",
          ".schedule",
          ".schedule_item",
          ".schedule-item",
          "div"
        ].join(",");

        const elements = Array.from(document.querySelectorAll(selector));

        const candidates = [];

        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          const text = clean(el.innerText || el.textContent || "");

          if (!text) continue;
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (rect.width < 220) continue;
          if (rect.height < 50) continue;
          if (rect.height > 900) continue;
          if (isNewsOrWrongArea(el)) continue;
          if (!textLooksLikeGameCard(text, game)) continue;

          candidates.push({
            el,
            area: rect.width * rect.height,
            textLength: text.length,
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            textSample: one(text).slice(0, 240)
          });
        }

        candidates.sort((a, b) => {
          if (a.area !== b.area) return a.area - b.area;
          return a.textLength - b.textLength;
        });

        return candidates[0] || null;
      }

      function findMoreButtonInside(cardEl) {
        const buttons = Array.from(cardEl.querySelectorAll("button, a, [role='button']"));

        const candidates = [];

        for (const btn of buttons) {
          const btnText = one(btn.innerText || btn.textContent || btn.getAttribute("aria-label") || "");
          const href = btn.getAttribute("href") || "";
          const onclick = btn.getAttribute("onclick") || "";
          const className = String(btn.className || "");

          if (!btnText.includes("更多資訊")) continue;
          if (btnText.includes("新聞")) continue;
          if (btnText.includes("售票")) continue;
          if (/news|News|NEWS/i.test(href)) continue;
          if (/news|News|NEWS/i.test(onclick)) continue;
          if (/news|News|NEWS/i.test(className)) continue;

          const rect = btn.getBoundingClientRect();

          if (rect.width <= 0 || rect.height <= 0) continue;

          const safeHref =
            !href ||
            href === "#" ||
            href.startsWith("#") ||
            href.startsWith("javascript") ||
            href.includes("box/index") ||
            href.includes("/box/");

          candidates.push({
            btn,
            safeHref,
            href,
            text: btnText,
            y: rect.y
          });
        }

        candidates.sort((a, b) => {
          if (a.safeHref !== b.safeHref) return a.safeHref ? -1 : 1;
          return a.y - b.y;
        });

        return candidates[0] || null;
      }

      const report = [];

      for (const game of games) {
        const card = findSmallestCardForGame(game);

        if (!card) {
          report.push({
            gameSno: game.gameSno,
            clicked: false,
            reason: "找不到精準比賽卡"
          });
          continue;
        }

        const more = findMoreButtonInside(card.el);

        if (!more) {
          report.push({
            gameSno: game.gameSno,
            clicked: false,
            reason: "比賽卡內沒有更多資訊按鈕",
            cardRect: card.rect,
            cardText: card.textSample
          });
          continue;
        }

        try {
          more.btn.scrollIntoView({
            block: "center",
            inline: "center"
          });

          more.btn.click();

          report.push({
            gameSno: game.gameSno,
            clicked: true,
            href: more.href,
            buttonText: more.text,
            cardRect: card.rect,
            cardText: card.textSample
          });
        } catch (err) {
          report.push({
            gameSno: game.gameSno,
            clicked: false,
            reason: err.message,
            cardRect: card.rect,
            cardText: card.textSample
          });
        }
      }

      return report;
    }, safeGames);

    const clickedCount = clickedReport.filter(item => item.clicked).length;

    console.log(`🔽 已精準嘗試展開比賽卡更多資訊：${clickedCount} 個`);

    for (const item of clickedReport) {
      if (item.clicked) {
        console.log(`   ✅ ${item.gameSno} 已點擊更多資訊`);
      } else {
        console.log(`   ⚠️ ${item.gameSno} 未點擊：${item.reason}`);
      }
    }

    await sleep(2200);

    const afterUrl = page.url();

    if (
      afterUrl !== beforeUrl &&
      (
        afterUrl.includes("/news") ||
        afterUrl.includes("News") ||
        afterUrl.includes("/xmdoc/") ||
        afterUrl.includes("/article/")
      )
    ) {
      console.log("⚠️ 點擊後誤入新聞頁，返回首頁重新抓取...");
      await page.goto("https://www.cpbl.com.tw/", {
        waitUntil: "networkidle2",
        timeout: 60000
      });
      await sleep(2500);
    }

    return clickedReport;
  } catch (err) {
    console.log(`⚠️ 展開更多資訊失敗：${err.message}`);
    return [];
  }
}

/* =========================
   官方首頁：抓預告先發 / 先發打序
========================= */

async function discoverHomePregameCards(browser, scheduleGames) {
  console.log("🎯 賽前：從官方首頁比賽卡抓預告先發 / 先發名單...");

  const page = await setupPage(browser);

  await page.goto("https://www.cpbl.com.tw/", {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(3500);

  const clickedReport = await expandPregameMoreInfo(page, scheduleGames);

  await sleep(1200);

  try {
    await fs.mkdir(DEBUG_DIR, { recursive: true });
    await fs.writeFile(DEBUG_HOME_HTML_FILE, await page.content(), "utf-8");
    await fs.writeFile(
      DEBUG_HOME_TEXT_FILE,
      await page.evaluate(() => document.body?.innerText || ""),
      "utf-8"
    );
  } catch (err) {
    console.log(`⚠️ 寫入首頁 debug 失敗：${err.message}`);
  }

  const payload = await page.evaluate((TEAM_NAMES_IN_PAGE, VENUES_IN_PAGE, scheduleGamesInPage) => {
    function cleanTextInPage(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, "\n")
        .trim();
    }

    function cleanOneLineInPage(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function splitLines(text) {
      return String(text || "")
        .split("\n")
        .map(cleanOneLineInPage)
        .filter(Boolean);
    }

    function normalizeAlias(name) {
      const s = cleanOneLineInPage(name);

      if (s.includes("統一")) return "統一";
      if (s.includes("中信")) return "中信";
      if (s.includes("樂天")) return "樂天";
      if (s.includes("富邦")) return "富邦";
      if (s.includes("味全")) return "味全";
      if (s.includes("台鋼")) return "台鋼";

      return s;
    }

    function isPlayerLikeInPage(text) {
      const s = cleanOneLineInPage(text);

      if (!s) return false;
      if (TEAM_NAMES_IN_PAGE.some(team => s.includes(team))) return false;
      if (VENUES_IN_PAGE.some(venue => s.includes(venue))) return false;

      const banned = [
        "客場先發",
        "主場先發",
        "客隊先發",
        "主隊先發",
        "先發",
        "打者",
        "投手",
        "LIVE",
        "比賽中",
        "比賽尚未開始",
        "比賽結束",
        "VS",
        "VS.",
        "售票",
        "更多",
        "English",
        "CPBLTV",
        "Box Score",
        "BOX SCORE",
        "賽程",
        "成績看板",
        "球隊戰績",
        "觀戰重點",
        "先發戰報",
        "對戰戰報",
        "新聞",
        "公告",
        "日期",
        "場次",
        "隊伍",
        "場地"
      ];

      if (banned.some(word => s.includes(word))) return false;
      if (/^\d+$/.test(s)) return false;
      if (/^\d{1,2}:\d{2}$/.test(s)) return false;
      if (/^\d+\s*:\s*\d+$/.test(s)) return false;
      if (/^\d+-\d+(-\d+)?$/.test(s)) return false;
      if (s.length < 2 || s.length > 16) return false;

      return /^[\u4e00-\u9fa5A-Za-z·．・\-]+$/.test(s);
    }

    function cleanStarterName(text) {
      let s = cleanOneLineInPage(text);

      if (!s) return "";

      s = s
        .replace(/客場先發/g, "")
        .replace(/主場先發/g, "")
        .replace(/客隊先發/g, "")
        .replace(/主隊先發/g, "")
        .replace(/預告先發/g, "")
        .replace(/先發投手/g, "")
        .replace(/^[:：\-\s]+/, "")
        .replace(/[，,。]+$/, "")
        .trim();

      if (!isPlayerLikeInPage(s)) return "";

      return s;
    }

    function extractStarter(lines, label) {
      const idx = lines.findIndex(line => line.includes(label));

      if (idx < 0) return "";

      const sameLine = cleanStarterName(lines[idx]);

      if (sameLine) return sameLine;

      for (let i = idx + 1; i < Math.min(lines.length, idx + 10); i++) {
        const line = lines[i];

        if (
          line.includes("先發打序") ||
          line.includes("先發名單") ||
          line.includes("售票") ||
          line.includes("更多資訊")
        ) {
          continue;
        }

        const candidate = cleanStarterName(line);

        if (candidate) return candidate;
      }

      return "";
    }

    function parseOrderValue(value) {
      const zhOrderMap = {
        一: 1,
        二: 2,
        三: 3,
        四: 4,
        五: 5,
        六: 6,
        七: 7,
        八: 8,
        九: 9
      };

      if (zhOrderMap[value]) return zhOrderMap[value];

      const n = Number(value);

      return Number.isFinite(n) ? n : null;
    }

    function parseLineupLine(line) {
      const s = cleanOneLineInPage(line);

      if (!s) return null;

      const patterns = [
        /^第\s*([1-9一二三四五六七八九])\s*棒\s+(.+)$/,
        /^第([1-9一二三四五六七八九])棒\s+(.+)$/,
        /^([1-9])[\s.、．]+(.+)$/,
        /^([一二三四五六七八九])棒?[\s：:、．]*(.+)$/,
        /^棒次\s*([1-9])\s+(.+)$/,
        /^([1-9])\s*棒\s*(.+)$/
      ];

      let match = null;

      for (const pattern of patterns) {
        match = s.match(pattern);
        if (match) break;
      }

      if (!match) return null;

      const order = parseOrderValue(match[1]);
      let rest = cleanOneLineInPage(match[2]);

      if (!order || !rest) return null;

      rest = rest
        .replace(/^[-：:\s]+/, "")
        .replace(/\s+/g, " ")
        .trim();

      const parts = rest.split(/\s+/).filter(Boolean);

      let name = "";
      let position = "";

      if (parts.length >= 2) {
        name = parts[0];
        position = parts.slice(1).join(" ");
      } else {
        name = rest;
        position = "";
      }

      name = cleanOneLineInPage(name)
        .replace(/[()（）]/g, "")
        .trim();

      if (!isPlayerLikeInPage(name)) return null;

      return {
        order,
        name,
        position,
        raw: s
      };
    }

    function extractLineupAfterLabel(lines, label) {
      const idx = lines.findIndex(line => line.includes(label));

      if (idx < 0) return [];

      const result = [];
      const seenOrders = new Set();

      for (let i = idx + 1; i < Math.min(lines.length, idx + 150); i++) {
        const line = cleanOneLineInPage(lines[i]);

        if (!line) continue;

        if (
          line.includes("售票資訊") ||
          line.includes("觀戰重點") ||
          line.includes("先發戰報") ||
          line.includes("對戰戰報") ||
          line.includes("更多資訊") ||
          line.includes("客場先發") ||
          line.includes("主場先發") ||
          line.includes("客隊先發") ||
          line.includes("主隊先發")
        ) {
          if (result.length) break;
          continue;
        }

        const parsed = parseLineupLine(line);

        if (!parsed) continue;
        if (seenOrders.has(parsed.order)) continue;

        seenOrders.add(parsed.order);
        result.push(parsed);

        if (result.length >= 9) break;
      }

      return result.sort((a, b) => a.order - b.order);
    }

    function extractLineupByTable(cardEl, sideKeywords) {
      const tables = Array.from(cardEl.querySelectorAll("table"));
      const result = [];

      for (const table of tables) {
        const tableText = cleanOneLineInPage(table.innerText || table.textContent || "");

        if (!sideKeywords.some(keyword => tableText.includes(keyword))) continue;

        const rows = Array.from(table.querySelectorAll("tr"));

        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll("td, th"))
            .map(cell => cleanOneLineInPage(cell.innerText || cell.textContent || ""))
            .filter(Boolean);

          if (!cells.length) continue;

          const rowText = cells.join(" ");

          const parsed = parseLineupLine(rowText);

          if (parsed) {
            result.push(parsed);
          } else if (/^[1-9]$/.test(cells[0] || "") && cells[1]) {
            const order = Number(cells[0]);
            const name = cells[1];
            const position = cells.slice(2).join(" ");

            if (isPlayerLikeInPage(name)) {
              result.push({
                order,
                name,
                position,
                raw: rowText
              });
            }
          }
        }
      }

      const map = new Map();

      for (const item of result) {
        if (!map.has(item.order)) {
          map.set(item.order, item);
        }
      }

      return [...map.values()]
        .sort((a, b) => a.order - b.order)
        .slice(0, 9);
    }

    function textLooksLikeGameCard(text, game) {
      const t = cleanOneLineInPage(text);

      if (!t) return false;

      const gameSnoOk =
        t.includes(String(game.gameSno)) ||
        new RegExp(`(^|\\s)${game.gameSno}(\\s|$)`).test(t);

      const awayAlias = normalizeAlias(game.away || "");
      const homeAlias = normalizeAlias(game.home || "");

      const awayOk =
        t.includes(game.away) ||
        t.includes(awayAlias);

      const homeOk =
        t.includes(game.home) ||
        t.includes(homeAlias);

      const venueOk = !game.venue || t.includes(game.venue);
      const timeOk = !game.time || t.includes(game.time);

      const hasVs = t.includes("VS") || t.includes("vs") || t.includes(":");

      return gameSnoOk && awayOk && homeOk && hasVs && (venueOk || timeOk);
    }

    function isBadArea(el) {
      const text = cleanOneLineInPage(el.innerText || el.textContent || "");
      const className = String(el.className || "");
      const id = String(el.id || "");

      const badWords = [
        "最新消息",
        "新聞",
        "News",
        "NEWS",
        "公告",
        "影音",
        "Video",
        "VIDEO",
        "球員異動",
        "商城",
        "排行榜",
        "投手TOP5",
        "打者TOP5"
      ];

      if (badWords.some(w => text.includes(w))) return true;
      if (/news|News|NEWS|video|Video|banner|ad/i.test(className)) return true;
      if (/news|News|NEWS|video|Video|banner|ad/i.test(id)) return true;

      return false;
    }

    function findCardElementForGame(game) {
      const elements = Array.from(
        document.querySelectorAll("li, article, section, .item, .game, .game_item, .game-item, .schedule, .schedule_item, .schedule-item, div")
      );

      const candidates = [];

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const text = cleanTextInPage(el.innerText || el.textContent || "");

        if (!text) continue;
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (rect.width < 220) continue;
        if (rect.height < 50) continue;
        if (rect.height > 1200) continue;
        if (isBadArea(el)) continue;
        if (!textLooksLikeGameCard(text, game)) continue;

        const usefulPower =
          (text.includes("客場先發") ? 5 : 0) +
          (text.includes("主場先發") ? 5 : 0) +
          (text.includes("客隊先發") ? 5 : 0) +
          (text.includes("主隊先發") ? 5 : 0) +
          (text.includes("先發打序") ? 8 : 0) +
          (text.includes("先發名單") ? 8 : 0) +
          (text.includes("更多資訊") ? 2 : 0);

        candidates.push({
          el,
          area: rect.width * rect.height,
          textLength: text.length,
          usefulPower,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          textSample: cleanOneLineInPage(text).slice(0, 500)
        });
      }

      candidates.sort((a, b) => {
        if (a.usefulPower !== b.usefulPower) return b.usefulPower - a.usefulPower;
        if (a.area !== b.area) return a.area - b.area;
        return a.textLength - b.textLength;
      });

      return candidates[0] || null;
    }

    function parseCardForGame(game) {
      const card = findCardElementForGame(game);

      if (!card) {
        return {
          gameSno: Number(game.gameSno),
          awayStarter: "",
          homeStarter: "",
          lineups: {
            away: [],
            home: []
          },
          foundCard: false,
          source: "official-home-game-card",
          debugText: "",
          debugLines: []
        };
      }

      const text = cleanTextInPage(card.el.innerText || card.el.textContent || "");
      const lines = splitLines(text);

      const awayStarter =
        extractStarter(lines, "客場先發") ||
        extractStarter(lines, "客隊先發") ||
        extractStarter(lines, "客場預告先發") ||
        "";

      const homeStarter =
        extractStarter(lines, "主場先發") ||
        extractStarter(lines, "主隊先發") ||
        extractStarter(lines, "主場預告先發") ||
        "";

      const awayLineup =
        extractLineupAfterLabel(lines, "客場先發打序").length
          ? extractLineupAfterLabel(lines, "客場先發打序")
          : extractLineupAfterLabel(lines, "客場先發名單").length
            ? extractLineupAfterLabel(lines, "客場先發名單")
            : extractLineupAfterLabel(lines, "客隊先發打序").length
              ? extractLineupAfterLabel(lines, "客隊先發打序")
              : extractLineupByTable(card.el, ["客場", "客隊"]);

      const homeLineup =
        extractLineupAfterLabel(lines, "主場先發打序").length
          ? extractLineupAfterLabel(lines, "主場先發打序")
          : extractLineupAfterLabel(lines, "主場先發名單").length
            ? extractLineupAfterLabel(lines, "主場先發名單")
            : extractLineupAfterLabel(lines, "主隊先發打序").length
              ? extractLineupAfterLabel(lines, "主隊先發打序")
              : extractLineupByTable(card.el, ["主場", "主隊"]);

      return {
        gameSno: Number(game.gameSno),
        awayStarter,
        homeStarter,
        lineups: {
          away: awayLineup,
          home: homeLineup
        },
        foundCard: true,
        source: "official-home-game-card",
        cardRect: card.rect,
        debugText: cleanOneLineInPage(text).slice(0, 2000),
        debugLines: lines.slice(0, 160)
      };
    }

    const games = scheduleGamesInPage
      .map(parseCardForGame)
      .sort((a, b) => Number(a.gameSno) - Number(b.gameSno));

    return {
      games,
      debug: {
        gameCount: games.length,
        bodySample: cleanOneLineInPage(document.body?.innerText || "").slice(0, 8000),
        games
      }
    };
  }, TEAM_NAMES, VENUES, scheduleGames);

  await safeClosePage(page);

  const games = Array.isArray(payload.games)
    ? payload.games
    : [];

  await writeJsonFile(DEBUG_HOME_FILE, {
    clickedReport,
    ...(payload.debug || {}),
    parserMode: VERSION,
    updatedAt: new Date().toISOString()
  });

  games.forEach(g => {
    console.log(
      `🎯 比賽卡 ${g.gameSno}: ` +
      `客場先發=${g.awayStarter || "—"}｜主場先發=${g.homeStarter || "—"}｜` +
      `打序 客${g.lineups?.away?.length || 0} 主${g.lineups?.home?.length || 0}`
    );
  });

  return games;
}


/* =========================
   官方 Box 頁 Vue：抓先發打序
   用於首頁比賽卡沒有展開名單時
========================= */

async function discoverBoxPregameLineups(browser, scheduleGames) {
  console.log("🎯 賽前：從官方 Box 頁 Vue data 抓先發打序...");

  const page = await setupPage(browser);
  const cards = [];
  const debug = [];

  for (const game of scheduleGames) {
    const gameSno = Number(game.gameSno);

    if (!gameSno) continue;

    const url = buildOfficialUrl(gameSno);

    try {
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 60000
      });

      await sleep(1200);

      const payload = await page.evaluate(gameInPage => {
        function clean(v) {
          return String(v || "")
            .replace(/\u00a0/g, " ")
            .replace(/\r/g, " ")
            .replace(/\n/g, " ")
            .replace(/[ \t]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }

        function clone(value) {
          try {
            return JSON.parse(JSON.stringify(value || []));
          } catch {
            return [];
          }
        }

        function findVueInstance() {
          const root = document.querySelector("#Center");

          if (root && root.__vue__) return root.__vue__;

          const all = [...document.querySelectorAll("*")];
          const found = all.find(el => el.__vue__);

          return found ? found.__vue__ : null;
        }

        function parseOrder(value) {
          const n = Number(value);
          return Number.isFinite(n) ? n : null;
        }

        function mapBattleRows(rows) {
          const map = new Map();

          (rows || []).forEach(row => {
            const order = parseOrder(
              row.Lineup ??
              row.BattingOrder ??
              row.BatOrder ??
              row.OrderNo ??
              row.Sort
            );

            const name = clean(
              row.HitterName ||
              row.PlayerName ||
              row.Name ||
              row.BatterName
            );

            if (!order || order < 1 || order > 9 || !name) return;

            if (!map.has(order)) {
              map.set(order, {
                order,
                name,
                position: clean(
                  row.DefendStation ||
                  row.Position ||
                  row.DefencePosition ||
                  row.Pos
                ),
                raw: row
              });
            }
          });

          return [...map.values()].sort((a, b) => a.order - b.order);
        }

        function findLineupArrayFromVm(vm, side) {
          const wanted = side === "away"
            ? ["visiting", "away", "visitor"]
            : ["home"];

          const keys = Object.keys(vm || {}).filter(k => !k.startsWith("_") && !k.startsWith("$"));

          const candidates = [];

          for (const key of keys) {
            const lower = key.toLowerCase();

            if (!wanted.some(w => lower.includes(w))) continue;

            let value = null;

            try {
              value = vm[key];
            } catch {
              continue;
            }

            if (!Array.isArray(value) || !value.length) continue;

            const sample = value[0] || {};
            const sampleKeys = Object.keys(sample);

            const looksLikeLineup =
              sampleKeys.includes("Lineup") ||
              sampleKeys.includes("HitterName") ||
              sampleKeys.includes("PlayerName") ||
              sampleKeys.includes("DefendStation");

            if (!looksLikeLineup) continue;

            const lineup = mapBattleRows(clone(value));

            if (lineup.length) {
              candidates.push({
                key,
                length: value.length,
                lineup
              });
            }
          }

          candidates.sort((a, b) => {
            const aExact = /BattleScores/i.test(a.key) ? 1 : 0;
            const bExact = /BattleScores/i.test(b.key) ? 1 : 0;

            if (aExact !== bExact) return bExact - aExact;
            return b.lineup.length - a.lineup.length;
          });

          return candidates[0] || null;
        }

        const vm = findVueInstance();

        if (!vm) {
          return {
            ok: false,
            reason: "vue-not-found",
            title: document.title || "",
            bodySample: clean(document.body?.innerText || "").slice(0, 2000)
          };
        }

        const awayFromBattle = mapBattleRows(clone(vm.visitingBattleScores || []));
        const homeFromBattle = mapBattleRows(clone(vm.homeBattleScores || []));

        const awayFallback = awayFromBattle.length
          ? null
          : findLineupArrayFromVm(vm, "away");

        const homeFallback = homeFromBattle.length
          ? null
          : findLineupArrayFromVm(vm, "home");

        const awayLineup = awayFromBattle.length
          ? awayFromBattle
          : awayFallback?.lineup || [];

        const homeLineup = homeFromBattle.length
          ? homeFromBattle
          : homeFallback?.lineup || [];

        const detail = clone(vm.curtGameDetail || {});

        return {
          ok: true,
          title: document.title || "",
          href: location.href,
          activeTab: vm.activeTab,
          activeSeq: vm.activeSeq,
          sourceKeys: Object.keys(vm).filter(k => !k.startsWith("_") && !k.startsWith("$")).slice(0, 120),
          arrays: {
            visitingBattleScores: Array.isArray(vm.visitingBattleScores) ? vm.visitingBattleScores.length : 0,
            homeBattleScores: Array.isArray(vm.homeBattleScores) ? vm.homeBattleScores.length : 0,
            awayFallbackKey: awayFallback?.key || "",
            homeFallbackKey: homeFallback?.key || ""
          },
          detail,
          lineups: {
            away: awayLineup,
            home: homeLineup
          },
          bodySample: clean(document.body?.innerText || "").slice(0, 2600)
        };
      }, {
        gameSno,
        away: game.away,
        home: game.home
      });

      const awayLineup = Array.isArray(payload?.lineups?.away)
        ? payload.lineups.away
        : [];

      const homeLineup = Array.isArray(payload?.lineups?.home)
        ? payload.lineups.home
        : [];

      cards.push({
        gameSno,
        awayStarter: "",
        homeStarter: "",
        lineups: {
          away: awayLineup,
          home: homeLineup
        },
        foundCard: awayLineup.length > 0 || homeLineup.length > 0,
        source: "official-box-vue-pregame-lineup",
        debugText: payload?.bodySample || "",
        debugLines: [],
        boxVue: {
          ok: payload?.ok || false,
          url,
          arrays: payload?.arrays || {},
          activeTab: payload?.activeTab,
          activeSeq: payload?.activeSeq
        }
      });

      debug.push({
        gameSno,
        away: game.away,
        home: game.home,
        url,
        ok: payload?.ok || false,
        reason: payload?.reason || "",
        arrays: payload?.arrays || {},
        lineups: {
          awayCount: awayLineup.length,
          homeCount: homeLineup.length,
          awaySample: awayLineup.slice(0, 3),
          homeSample: homeLineup.slice(0, 3)
        },
        sourceKeys: payload?.sourceKeys || [],
        bodySample: payload?.bodySample || ""
      });

      console.log(
        `🎯 Box Vue ${gameSno}: 打序 客${awayLineup.length} 主${homeLineup.length}`
      );
    } catch (err) {
      cards.push({
        gameSno,
        awayStarter: "",
        homeStarter: "",
        lineups: {
          away: [],
          home: []
        },
        foundCard: false,
        source: "official-box-vue-pregame-lineup",
        debugText: "",
        debugLines: [],
        boxVue: {
          ok: false,
          url,
          error: err.message
        }
      });

      debug.push({
        gameSno,
        away: game.away,
        home: game.home,
        url,
        ok: false,
        error: err.message
      });

      console.log(`⚠️ Box Vue ${gameSno}: 抓取失敗：${err.message}`);
    }
  }

  await safeClosePage(page);

  await writeJsonFile(DEBUG_BOX_VUE_FILE, {
    version: VERSION,
    updatedAt: new Date().toISOString(),
    games: debug
  });

  return cards;
}


/* =========================
   資料合併
========================= */

function getPregameStarterPriority(card) {
  const source = String(card?.source || "");

  // 先發投手：官方首頁比賽卡是正源。
  if (source.includes("official-home-game-card")) return 30;

  // body fallback 已依 gameSno 切區塊，比比分橫條安全。
  if (source.includes("official-home-score-strip-body-fallback")) return 20;

  // 比分橫條容易把整條文字混在一起，只能當 fallback。
  if (source.includes("official-home-score-strip")) return 10;

  // Box Vue 這版只拿先發打序，不拿先發投手，避免空值或舊值干擾。
  if (source.includes("official-box-vue-pregame-lineup")) return 0;

  return 0;
}

function getPregameLineupPriority(card) {
  const source = String(card?.source || "");

  // 先發打序：官方 Box Vue 是單場頁，且目前已確認能抓到客9主9。
  if (source.includes("official-box-vue-pregame-lineup")) return 40;

  // 首頁比賽卡若能展開名單，當作第二順位。
  if (source.includes("official-home-game-card")) return 30;

  // score-strip 不負責打序。
  if (source.includes("official-home-score-strip-body-fallback")) return 10;
  if (source.includes("official-home-score-strip")) return 5;

  return 0;
}

function pickBetterStarter(oldName, oldSource, newName, newSource) {
  const oldClean = cleanOneLine(oldName);
  const newClean = cleanOneLine(newName);

  if (!oldClean && newClean) return newClean;
  if (oldClean && !newClean) return oldClean;
  if (!oldClean && !newClean) return "";

  const oldPriority = getPregameStarterPriority({ source: oldSource });
  const newPriority = getPregameStarterPriority({ source: newSource });

  // 關鍵修正：home-game-card 的正確先發要能蓋掉 score-strip 的污染值。
  if (newPriority > oldPriority) return newClean;

  return oldClean;
}

function pickBetterLineup(oldLineup, oldSource, newLineup, newSource) {
  const oldList = Array.isArray(oldLineup) ? oldLineup : [];
  const newList = Array.isArray(newLineup) ? newLineup : [];

  if (!oldList.length && newList.length) return newList;
  if (oldList.length && !newList.length) return oldList;
  if (!oldList.length && !newList.length) return [];

  const oldPriority = getPregameLineupPriority({ source: oldSource });
  const newPriority = getPregameLineupPriority({ source: newSource });

  // 關鍵修正：Box Vue 打序要能蓋掉其他來源的空/舊打序。
  if (newPriority > oldPriority) return newList;

  // 同來源等級時，保留較完整的打序。
  if (newPriority === oldPriority && newList.length > oldList.length) return newList;

  return oldList;
}

function mergePregameCards(...cardGroups) {
  const map = new Map();

  for (const cards of cardGroups) {
    for (const card of cards || []) {
      const gameSno = Number(card.gameSno);

      if (!gameSno) continue;

      const old = map.get(gameSno) || {
        gameSno,
        awayStarter: "",
        homeStarter: "",
        lineups: {
          away: [],
          home: []
        },
        foundCard: false,
        source: "",
        starterSource: "",
        lineupSourceAway: "",
        lineupSourceHome: "",
        starterPriority: -1,
        lineupPriorityAway: -1,
        lineupPriorityHome: -1
      };

      const cardSource = card.source || "";

      const oldStarterSource = old.starterSource || old.source || "";
      const starterPriority = getPregameStarterPriority(card);

      const oldAwayLineupSource = old.lineupSourceAway || old.source || "";
      const oldHomeLineupSource = old.lineupSourceHome || old.source || "";
      const lineupPriority = getPregameLineupPriority(card);

      const awayStarter = pickBetterStarter(
        old.awayStarter,
        oldStarterSource,
        card.awayStarter,
        cardSource
      );

      const homeStarter = pickBetterStarter(
        old.homeStarter,
        oldStarterSource,
        card.homeStarter,
        cardSource
      );

      const selectedStarterSource =
        (
          (card.awayStarter || card.homeStarter) &&
          starterPriority > (old.starterPriority ?? -1)
        )
          ? cardSource
          : oldStarterSource;

      const awayLineup = pickBetterLineup(
        old.lineups?.away,
        oldAwayLineupSource,
        card.lineups?.away,
        cardSource
      );

      const homeLineup = pickBetterLineup(
        old.lineups?.home,
        oldHomeLineupSource,
        card.lineups?.home,
        cardSource
      );

      const selectedAwayLineupSource =
        (
          Array.isArray(card.lineups?.away) &&
          card.lineups.away.length &&
          lineupPriority > (old.lineupPriorityAway ?? -1)
        )
          ? cardSource
          : oldAwayLineupSource;

      const selectedHomeLineupSource =
        (
          Array.isArray(card.lineups?.home) &&
          card.lineups.home.length &&
          lineupPriority > (old.lineupPriorityHome ?? -1)
        )
          ? cardSource
          : oldHomeLineupSource;

      const source = [...new Set([old.source, card.source].filter(Boolean).join("+").split("+"))]
        .filter(Boolean)
        .join("+");

      map.set(gameSno, {
        gameSno,
        awayStarter,
        homeStarter,
        lineups: {
          away: awayLineup,
          home: homeLineup
        },
        foundCard: old.foundCard || card.foundCard || false,
        source,
        starterSource: selectedStarterSource,
        lineupSourceAway: selectedAwayLineupSource,
        lineupSourceHome: selectedHomeLineupSource,
        starterPriority: Math.max(old.starterPriority ?? -1, starterPriority),
        lineupPriorityAway: Math.max(old.lineupPriorityAway ?? -1, lineupPriority),
        lineupPriorityHome: Math.max(old.lineupPriorityHome ?? -1, lineupPriority),
        debugText: card.debugText || old.debugText || "",
        debugLines: card.debugLines?.length ? card.debugLines : old.debugLines || [],
        cardRect: card.cardRect || old.cardRect || null,
        scoreStripCandidates: old.scoreStripCandidates || card.candidates || null,
        mergeGuard: {
          version: VERSION,
          rule: "starter-and-lineup-separated-priority",
          starterRule: "home-game-card > body-fallback > score-strip; box-vue does not override starters",
          lineupRule: "box-vue > home-game-card > fallback",
          finalStarterSource: selectedStarterSource,
          finalAwayLineupSource: selectedAwayLineupSource,
          finalHomeLineupSource: selectedHomeLineupSource,
          selectedAwayStarter: awayStarter,
          selectedHomeStarter: homeStarter,
          awayLineupCount: awayLineup.length,
          homeLineupCount: homeLineup.length
        }
      });
    }
  }

  return [...map.values()]
    .sort((a, b) => Number(a.gameSno) - Number(b.gameSno));
}

/* =========================
   建立賽前資料
========================= */

function createPregameGame(scheduleGame, homeCard = null) {
  const box = emptyBoxscore();

  const awayStarter = cleanOneLine(
    homeCard?.awayStarter ||
    scheduleGame.awayStarter ||
    ""
  );

  const homeStarter = cleanOneLine(
    homeCard?.homeStarter ||
    scheduleGame.homeStarter ||
    ""
  );

  const awayLineup =
    Array.isArray(homeCard?.lineups?.away)
      ? homeCard.lineups.away
      : [];

  const homeLineup =
    Array.isArray(homeCard?.lineups?.home)
      ? homeCard.lineups.home
      : [];

  const game = {
    gameSno: Number(scheduleGame.gameSno),

    sourceStage: "pregame",

    meta: {
      date: scheduleGame.date,
      home: scheduleGame.home,
      away: scheduleGame.away,
      status: "scheduled",
      statusText: "比賽尚未開始",
      type: normalizeType(scheduleGame.typeText || "一軍例行賽"),
      typeText: scheduleGame.typeText || "一軍例行賽",
      time: scheduleGame.time || "",
      duration: "",
      venue: scheduleGame.venue || "",
      officialUrl: buildOfficialUrl(scheduleGame.gameSno),
      urlMode: "pregame",
      win: null,
      lose: null,
      save: null,
      mvp: null
    },

    lineScore: box.lineScore,

    totals: {
      away: {
        R: 0,
        H: null,
        E: null
      },
      home: {
        R: 0,
        H: null,
        E: null
      }
    },

    batters: box.batters,
    pitchers: box.pitchers,

    pregame: {
      starters: {
        away: awayStarter,
        home: homeStarter
      },
      lineups: {
        away: awayLineup,
        home: homeLineup
      }
    },

    liveState: null,

    debug: {
      source: "fetch-cpbl-pregame-today",
      scheduleRaw: scheduleGame.raw || null,
      homeCard: homeCard || null,
      beforeGameStart: isBeforeGameStart(scheduleGame.date, scheduleGame.time),
      parserMode: VERSION,
      updatedAt: new Date().toISOString()
    }
  };

  return {
    ...game,
    dataQuality: buildPregameDataQuality(game)
  };
}

function shouldProtectExistingLiveGame(existingGame, pregameGame) {
  const oldStatus = existingGame?.meta?.status || "";
  const oldStatusText = existingGame?.meta?.statusText || "";
  const oldStage = existingGame?.sourceStage || "";
  const finalLock = existingGame?.finalLock?.locked === true;

  const sameDate = existingGame?.meta?.date === pregameGame?.meta?.date;

  if (!sameDate) return false;

  if (
    finalLock ||
    oldStatus === "live" ||
    oldStatus === "final" ||
    oldStage === "live" ||
    oldStage === "final" ||
    oldStatusText.includes("比賽中") ||
    oldStatusText.includes("比賽結束") ||
    oldStatusText.includes("LIVE")
  ) {
    return true;
  }

  return false;
}

function mergePregameIntoExisting(existingGame, pregameGame) {
  if (shouldProtectExistingLiveGame(existingGame, pregameGame)) {
    console.log(
      `🛡️ ${pregameGame.gameSno} 已是 LIVE/FINAL，不用 pregame 覆蓋狀態，只補 pregame 區塊`
    );

    const oldPregame = existingGame.pregame || {};
    const oldStarters = oldPregame.starters || {};
    const oldLineups = oldPregame.lineups || {};
    const newStarters = pregameGame.pregame?.starters || {};
    const newLineups = pregameGame.pregame?.lineups || {};

    const merged = {
      ...existingGame,
      pregame: {
        ...oldPregame,
        starters: {
          away: newStarters.away || oldStarters.away || "",
          home: newStarters.home || oldStarters.home || ""
        },
        lineups: {
          away: newLineups.away?.length ? newLineups.away : oldLineups.away || [],
          home: newLineups.home?.length ? newLineups.home : oldLineups.home || []
        }
      },
      debug: {
        ...(existingGame.debug || {}),
        pregameProtectedMerge: {
          protectedAt: new Date().toISOString(),
          reason: "existing game is LIVE/FINAL/finalLock, only pregame block was merged",
          parserMode: VERSION,
          incomingPregame: pregameGame.pregame || null
        }
      }
    };

    return {
      ...merged,
      dataQuality: {
        ...(merged.dataQuality || {}),
        pregame: buildPregameDataQuality(pregameGame),
        pregameMerge: "protected"
      }
    };
  }

  const oldPregame = existingGame.pregame || {};
  const oldStarters = oldPregame.starters || {};
  const oldLineups = oldPregame.lineups || {};

  const newStarters = pregameGame.pregame?.starters || {};
  const newLineups = pregameGame.pregame?.lineups || {};

  const merged = {
    ...existingGame,

    sourceStage: "pregame",

    meta: {
      ...(existingGame.meta || {}),
      ...(pregameGame.meta || {}),
      status: "scheduled",
      statusText: "比賽尚未開始"
    },

    lineScore: {
      away: [],
      home: []
    },

    totals: {
      away: {
        R: 0,
        H: existingGame.totals?.away?.H ?? null,
        E: existingGame.totals?.away?.E ?? null
      },
      home: {
        R: 0,
        H: existingGame.totals?.home?.H ?? null,
        E: existingGame.totals?.home?.E ?? null
      }
    },

    batters: existingGame.batters || {
      away: [],
      home: []
    },

    pitchers: existingGame.pitchers || {
      away: [],
      home: []
    },

    pregame: {
      ...oldPregame,
      starters: {
        away: newStarters.away || oldStarters.away || "",
        home: newStarters.home || oldStarters.home || ""
      },
      lineups: {
        away: newLineups.away?.length ? newLineups.away : oldLineups.away || [],
        home: newLineups.home?.length ? newLineups.home : oldLineups.home || []
      }
    },

    liveState: null,

    debug: {
      ...(existingGame.debug || {}),
      pregameMerge: {
        mergedAt: new Date().toISOString(),
        parserMode: VERSION,
        incomingPregame: pregameGame.pregame || null
      }
    }
  };

  return {
    ...merged,
    dataQuality: buildPregameDataQuality(merged)
  };
}

async function writeProbablePitchersFromPregame(games, targetDate) {
  const oldData = await readJsonFile(PROBABLE_FILE, {});
  const result = oldData && typeof oldData === "object" && !Array.isArray(oldData)
    ? oldData
    : {};

  let count = 0;

  for (const game of games) {
    const gameSno = Number(game.gameSno);

    if (!gameSno) continue;

    const away = game.pregame?.starters?.away || "";
    const home = game.pregame?.starters?.home || "";

    if (!away && !home) continue;

    result[String(gameSno)] = {
      gameSno,
      date: game.meta?.date || targetDate,
      awayTeam: game.meta?.away || "",
      homeTeam: game.meta?.home || "",
      away: away || null,
      home: home || null,
      source: "fetch-cpbl-pregame-today",
      version: VERSION,
      updatedAt: new Date().toISOString()
    };

    count++;
  }

  if (!count) {
    console.log("⚠️ 賽前：沒有有效預告先發，不覆蓋 probable-pitchers.json");
    return;
  }

  await writeJsonFileWithBackup(PROBABLE_FILE, result, "pregame-probable");

  console.log(
    `🎯 賽前預告先發輸出 / 合併：${count} 場 → data/live/probable-pitchers.json`
  );
}

/* =========================
   主程式
========================= */

async function main() {
  const targetDate = getTargetDate();
  const todayTaipei = getTodayTaipei();
  const datePregameFile = getPregameDateFile(targetDate);

  console.log(`📡 CPBL 賽前資料更新 ${VERSION}...`);
  console.log("今天：", todayTaipei);
  console.log("目標日期：", targetDate);

  const executablePath = await getChromeExecutablePath();

  const launchOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled"
    ]
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const scheduleGames = await discoverTargetGamesFromScheduleApi(browser, targetDate);

    if (!scheduleGames.length) {
      console.log("⚠️ 目標日期賽程為 0 場，停止寫入，避免清空資料。");
      await safeCloseBrowser(browser);
      return;
    }

    const scoreStripPregameCards = await discoverScoreStripPregameCards(
      browser,
      scheduleGames,
      targetDate
    );

    const homePregameCards = await discoverHomePregameCards(
      browser,
      scheduleGames
    );

    const boxPregameLineupCards = await discoverBoxPregameLineups(
      browser,
      scheduleGames
    );

    const mergedPregameCards = mergePregameCards(
      scoreStripPregameCards,
      homePregameCards,
      boxPregameLineupCards
    );

    await safeCloseBrowser(browser);

    const homeCardMap = new Map(
      mergedPregameCards.map(card => [Number(card.gameSno), card])
    );

    const pregameGames = scheduleGames.map(scheduleGame => {
      const card = homeCardMap.get(Number(scheduleGame.gameSno)) || null;

      return createPregameGame(scheduleGame, card);
    });

    const existingGames = await readExistingLiveGames();

    const updatedMap = new Map(
      existingGames.map(game => [Number(game.gameSno), game])
    );

    let protectedCount = 0;
    let insertedCount = 0;
    let mergedCount = 0;

    for (const game of pregameGames) {
      const gameSno = Number(game.gameSno);
      const old = updatedMap.get(gameSno);

      if (old) {
        if (shouldProtectExistingLiveGame(old, game)) {
          protectedCount++;
        }

        updatedMap.set(gameSno, mergePregameIntoExisting(old, game));
        mergedCount++;
      } else {
        updatedMap.set(gameSno, game);
        insertedCount++;
      }
    }

    const result = [...updatedMap.values()]
      .sort((a, b) => {
        const da = a.meta?.date || "9999-12-31";
        const db = b.meta?.date || "9999-12-31";

        if (da !== db) return da.localeCompare(db);

        return Number(a.gameSno || 0) - Number(b.gameSno || 0);
      });

    await writeJsonFileWithBackup(datePregameFile, pregameGames, "pregame-date");

    if (isTodayTaipei(targetDate)) {
      await writeJsonFileWithBackup(PREGAME_TODAY_FILE, pregameGames, "pregame-today");
      console.log("輸出：data/live/pregame-today.json");
    } else {
      console.log("🛡️ 目標日期不是今天，不覆蓋 data/live/pregame-today.json");
    }

    await writeJsonFileWithBackup(LIVE_BOX_FILE, result, "pregame-livebox");
    await writeProbablePitchersFromPregame(pregameGames, targetDate);

    console.log("");
    console.log(`💾 賽前資料更新完成：${pregameGames.length} 場`);
    console.log(`新增場次：${insertedCount}`);
    console.log(`合併場次：${mergedCount}`);
    console.log(`LIVE/FINAL 保護：${protectedCount}`);
    console.log(`輸出：data/live/pregame-${targetDate}.json`);
    console.log("同步更新：data/live/live-boxscore.json");
    console.log("同步合併：data/live/probable-pitchers.json");

    pregameGames.forEach(game => {
      console.log(
        `✅ ${game.gameSno}: ${game.meta.away} vs ${game.meta.home} ` +
        `${game.meta.venue} ${game.meta.time} ${game.meta.statusText}｜` +
        `先發 ${game.pregame?.starters?.away || "—"} vs ${game.pregame?.starters?.home || "—"}｜` +
        `打序 客${game.pregame?.lineups?.away?.length || 0} 主${game.pregame?.lineups?.home?.length || 0}｜` +
        `dataQuality 先發=${game.dataQuality?.starters || "—"} 打序=${game.dataQuality?.lineups || "—"}`
      );
    });

    console.log("");
    console.log("🧪 Debug 檔案：");
    console.log("debug/pregame/pregame-schedule-api-debug.json");
    console.log("debug/pregame/pregame-score-strip-debug.json");
    console.log("debug/pregame/pregame-score-strip.html");
    console.log("debug/pregame/pregame-score-strip.txt");
    console.log("debug/pregame/pregame-home-debug.json");
    console.log("debug/pregame/pregame-home-after-expand.html");
    console.log("debug/pregame/pregame-home-after-expand.txt");
    console.log("debug/pregame/pregame-box-vue-debug.json");
  } catch (err) {
    await safeCloseBrowser(browser);
    throw err;
  }
}

main().catch(err => {
  console.error("❌ 賽前更新失敗：", err);
  process.exit(1);
});