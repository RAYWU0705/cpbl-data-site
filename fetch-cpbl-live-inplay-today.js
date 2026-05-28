import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const VERSION = "v5.0-16-LIVE-STATE-SCOUT";
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
const BACKUP_DIR = path.join(__dirname, "../data/live/backups");

const DEBUG_DIR = path.join(__dirname, "../debug/live-inplay");
const DEBUG_SCHEDULE_FILE = path.join(DEBUG_DIR, "live-inplay-schedule-api-debug.json");
const DEBUG_HOME_FILE = path.join(DEBUG_DIR, "live-inplay-home-cards-debug.json");

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

  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  return [
    parts.find(p => p.type === "year")?.value,
    parts.find(p => p.type === "month")?.value,
    parts.find(p => p.type === "day")?.value
  ].join("-");
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

function cleanOneLine(v) {
  return String(v || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = numberOrNull(value);

    if (n !== null) return n;
  }

  return null;
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

function fixDate(dateStr) {
  if (!dateStr) return null;

  const raw = String(dateStr).replace(/\//g, "-").trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) {
    const parts = raw.split(/[ T]/)[0].split("-");

    return `${parts[0]}-${pad2(parts[1])}-${pad2(parts[2])}`;
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

function buildBoxUrls(gameSno) {
  return [
    {
      mode: "box-index-PresentStatus-0",
      sideHint: "away",
      url: `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}&PresentStatus=0`
    },
    {
      mode: "box-index-PresentStatus-1",
      sideHint: "home",
      url: `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}&PresentStatus=1`
    },
    {
      mode: "box-index-default",
      sideHint: "",
      url: `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`
    }
  ];
}

function isAfterGameStart(dateText, timeText) {
  if (!dateText || !timeText) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;
  if (!/^\d{1,2}:\d{2}$/.test(timeText)) return false;

  const [hour, minute] = timeText.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;

  const start = new Date(
    `${dateText}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`
  );

  return Date.now() >= start.getTime();
}

function isFinalText(text = "") {
  const s = String(text || "");

  return (
    s.includes("比賽結束") ||
    s.includes("比賽終了") ||
    s.includes("FINAL") ||
    s.includes("Final")
  );
}

function isLiveText(text = "") {
  const s = String(text || "");

  return (
    s.includes("LIVE") ||
    s.includes("比賽中") ||
    s.includes("進行中") ||
    s.includes("局上") ||
    s.includes("局下")
  );
}

function getStatusText(status) {
  if (status === "live") return "LIVE";
  if (status === "final") return "比賽結束";
  if (status === "postponed") return "延賽";
  if (status === "suspended") return "保留比賽";
  if (status === "cancelled") return "取消";

  return "比賽尚未開始";
}

function emptyTotals() {
  return {
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
  };
}

function emptyBoxscore() {
  return {
    lineScore: {
      away: [],
      home: []
    },
    totals: emptyTotals(),
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

function hasUsefulLineScoreRow(row = []) {
  if (!Array.isArray(row)) return false;

  return row.some(value => {
    if (value === "X") return true;

    const n = numberOrNull(value);

    return n !== null;
  });
}

function hasAnyLineScore(lineScore = {}) {
  return (
    hasUsefulLineScoreRow(lineScore.away) ||
    hasUsefulLineScoreRow(lineScore.home)
  );
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

function sanitizePlayerName(value) {
  const s = cleanOneLine(value);

  if (!s) return "";

  const banned = [
    "比賽中",
    "LIVE",
    "進行中",
    "打擊",
    "打者",
    "投手",
    "BATTER",
    "PITCHER",
    "Box Score",
    "BOX SCORE",
    "CPBLTV",
    "賽程",
    "成績看板",
    "球隊戰績",
    "一壘",
    "二壘",
    "三壘",
    "出局",
    "好球",
    "壞球",
    "球數",
    "局上",
    "局下",
    "裁判",
    "主審",
    "一壘審",
    "二壘審",
    "三壘審",
    "紀錄",
    "播報",
    "官方"
  ];

  if (banned.some(word => s.includes(word))) return "";
  if (TEAM_NAMES.some(team => s.includes(team))) return "";
  if (VENUES.some(venue => s.includes(venue))) return "";
  if (/^\d+$/.test(s)) return "";
  if (/^\d+\s*:\s*\d+$/.test(s)) return "";
  if (/^\d{1,2}:\d{2}$/.test(s)) return "";
  if (s.length < 2 || s.length > 16) return "";

  return s;
}

function detectHalfFromInningText(inningText = "") {
  const text = cleanOneLine(inningText);

  if (/^\d+\s*局\s*上$/.test(text)) return "top";
  if (/^\d+\s*局\s*下$/.test(text)) return "bottom";
  if (/^[一二三四五六七八九十]+\s*局\s*上$/.test(text)) return "top";
  if (/^[一二三四五六七八九十]+\s*局\s*下$/.test(text)) return "bottom";

  return "";
}

function isStrictInningText(text = "") {
  const s = cleanOneLine(text);

  return (
    /^\d+\s*局\s*[上下]$/.test(s) ||
    /^[一二三四五六七八九十]+\s*局\s*[上下]$/.test(s)
  );
}

function sideTeam(side, scheduleGame = {}, oldGame = {}) {
  if (side === "away") return scheduleGame.away || oldGame?.meta?.away || "";
  if (side === "home") return scheduleGame.home || oldGame?.meta?.home || "";

  return "";
}

function oppositeSide(side) {
  if (side === "away") return "home";
  if (side === "home") return "away";

  return "";
}

function normalizeBases(bases = {}) {
  return {
    first: !!bases.first,
    second: !!bases.second,
    third: !!bases.third
  };
}

function normalizeBSO(liveState = {}) {
  return {
    balls: numberOrNull(liveState.balls),
    strikes: numberOrNull(liveState.strikes),
    outs: numberOrNull(liveState.outs),
    pitchCount: numberOrNull(liveState.pitchCount)
  };
}

function sanitizeLiveState(liveState) {
  if (!liveState || typeof liveState !== "object") return null;

  const inningText = isStrictInningText(liveState.inningText)
    ? cleanOneLine(liveState.inningText)
    : "";

  const bso = normalizeBSO(liveState);

  return {
    ...liveState,
    batter: sanitizePlayerName(liveState.batter),
    pitcher: sanitizePlayerName(liveState.pitcher),
    inningText,
    half: liveState.half || detectHalfFromInningText(inningText),
    balls: bso.balls,
    strikes: bso.strikes,
    outs: bso.outs,
    pitchCount: bso.pitchCount,
    bases: normalizeBases(liveState.bases)
  };
}

function makeNameSet(players = []) {
  return new Set(
    players
      .map(p => cleanOneLine(p?.name || p?.rawName || ""))
      .filter(Boolean)
  );
}

function findPlayerSide(name, group = {}) {
  const target = cleanOneLine(name);

  if (!target) return "";

  if (makeNameSet(group.away || []).has(target)) return "away";
  if (makeNameSet(group.home || []).has(target)) return "home";

  return "";
}

function resolveLiveState(liveState, scheduleGame, oldGame, batters, pitchers) {
  if (!liveState) return null;

  const fixed = { ...liveState };
  const half = fixed.half || detectHalfFromInningText(fixed.inningText);

  let battingSide = "";
  let fieldingSide = "";

  const batterSide = findPlayerSide(fixed.batter, batters);
  const pitcherSide = findPlayerSide(fixed.pitcher, pitchers);

  if (batterSide) {
    battingSide = batterSide;
    fieldingSide = oppositeSide(batterSide);
  } else if (pitcherSide) {
    fieldingSide = pitcherSide;
    battingSide = oppositeSide(pitcherSide);
  } else if (half === "top") {
    battingSide = "away";
    fieldingSide = "home";
  } else if (half === "bottom") {
    battingSide = "home";
    fieldingSide = "away";
  }

  const battingTeam = sideTeam(battingSide, scheduleGame, oldGame);
  const fieldingTeam = sideTeam(fieldingSide, scheduleGame, oldGame);
  const bases = normalizeBases(fixed.bases);
  const bso = normalizeBSO(fixed);

  return {
    ...fixed,
    half,
    battingSide,
    fieldingSide,
    battingTeam,
    fieldingTeam,

    balls: bso.balls,
    strikes: bso.strikes,
    outs: bso.outs,
    pitchCount: bso.pitchCount,
    bases,

    confidence:
      fixed.batter && fixed.pitcher
        ? "confirmed"
        : half
          ? "partial"
          : "debug",

    message:
      fixed.batter && fixed.pitcher
        ? "目前投打資料可用"
        : half
          ? "LIVE 安全模式：目前投打資料同步中，只顯示可信攻守狀態"
          : "LIVE 安全模式：官方目前未提供可解析的局數與投打資料",

    matchupText:
      fixed.batter && fixed.pitcher
        ? `${fixed.batter} vs ${fixed.pitcher}`
        : "",

    matchupLabel:
      battingTeam && fieldingTeam
        ? `${battingTeam} 打擊 / ${fieldingTeam} 投球`
        : "",

    current: {
      batter: fixed.batter || "",
      pitcher: fixed.pitcher || "",
      battingSide,
      fieldingSide,
      battingTeam,
      fieldingTeam,
      balls: bso.balls,
      strikes: bso.strikes,
      outs: bso.outs,
      pitchCount: bso.pitchCount,
      bases
    },

    playersBySide: {
      batter: {
        away: battingSide === "away" ? fixed.batter || "" : "",
        home: battingSide === "home" ? fixed.batter || "" : ""
      },
      pitcher: {
        away: fieldingSide === "away" ? fixed.pitcher || "" : "",
        home: fieldingSide === "home" ? fixed.pitcher || "" : ""
      }
    },

    debug: {
      ...(fixed.debug || {}),
      sideResolve: {
        batter: fixed.batter || "",
        pitcher: fixed.pitcher || "",
        batterSide,
        pitcherSide,
        finalBattingSide: battingSide,
        finalFieldingSide: fieldingSide
      }
    }
  };
}

function sumLineScoreRuns(row) {
  if (!Array.isArray(row) || !row.length) return null;

  let sum = 0;
  let hasNumber = false;

  for (const value of row) {
    if (value === "X") continue;

    const n = numberOrNull(value);

    if (n !== null) {
      sum += n;
      hasNumber = true;
    }
  }

  return hasNumber ? sum : null;
}

function pickLiveRuns(lineScoreRow, liveScore, scheduleScore, detailR, oldR) {
  if (typeof liveScore === "number") return liveScore;
  if (scheduleScore !== null && scheduleScore !== undefined) return scheduleScore;

  const lineSum = sumLineScoreRuns(lineScoreRow);

  if (lineSum !== null) return lineSum;
  if (detailR !== null && detailR !== undefined) return detailR;
  if (oldR !== null && oldR !== undefined) return oldR;

  return null;
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data);

  return [];
}

/* =========================
   Data Quality
========================= */

function getQualityLevel(condition, partialCondition = false) {
  if (condition) return "confirmed";
  if (partialCondition) return "partial";
  return "debug";
}

function buildDataQuality(game) {
  const hasScore =
    typeof game?.totals?.away?.R === "number" &&
    typeof game?.totals?.home?.R === "number";

  const hasRHE =
    hasScore &&
    game?.totals?.away?.H !== null &&
    game?.totals?.home?.H !== null &&
    game?.totals?.away?.E !== null &&
    game?.totals?.home?.E !== null;

  const hasLineScore =
    (game?.lineScore?.away?.length || 0) > 0 &&
    (game?.lineScore?.home?.length || 0) > 0;

  const batterAway = game?.batters?.away?.length || 0;
  const batterHome = game?.batters?.home?.length || 0;
  const pitcherAway = game?.pitchers?.away?.length || 0;
  const pitcherHome = game?.pitchers?.home?.length || 0;

  const hasBothBatters = batterAway > 0 && batterHome > 0;
  const hasAnyBatters = batterAway > 0 || batterHome > 0;

  const hasBothPitchers = pitcherAway > 0 && pitcherHome > 0;
  const hasAnyPitchers = pitcherAway > 0 || pitcherHome > 0;

  const hasInning =
    !!game?.liveState?.inningText &&
    !!game?.liveState?.half;

  const hasCurrentPlayers =
    !!game?.liveState?.batter &&
    !!game?.liveState?.pitcher;

  const hasBSO =
    game?.liveState?.balls !== null &&
    game?.liveState?.balls !== undefined &&
    game?.liveState?.strikes !== null &&
    game?.liveState?.strikes !== undefined &&
    game?.liveState?.outs !== null &&
    game?.liveState?.outs !== undefined;

  const hasBases =
    !!game?.liveState?.bases?.first ||
    !!game?.liveState?.bases?.second ||
    !!game?.liveState?.bases?.third;

  return {
    version: VERSION,
    source: "fetch-cpbl-live-inplay-today",
    stage: "live",
    score: getQualityLevel(hasScore),
    rhe: getQualityLevel(hasRHE, hasScore),
    lineScore: getQualityLevel(hasLineScore),
    batters: getQualityLevel(hasBothBatters, hasAnyBatters),
    pitchers: getQualityLevel(hasBothPitchers, hasAnyPitchers),
    liveState: getQualityLevel(hasCurrentPlayers, hasInning),
    bso: getQualityLevel(hasBSO),
    bases: getQualityLevel(hasBases),
    mode: "safe-live-parser+live-stats-fallback",
    message:
      "LIVE 安全模式：只顯示可信資料；若中文 boxscore 只吐單隊，會嘗試 stats fallback 補齊雙隊；仍無法確認時標記 partial/debug。",
    updatedAt: new Date().toISOString()
  };
}

/* =========================
   檔案
========================= */

async function readJsonFile(filepath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filepath, "utf-8"));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filepath, data) {
  await fs.mkdir(path.dirname(filepath), {
    recursive: true
  });

  await fs.writeFile(filepath, JSON.stringify(data, null, 2), "utf-8");
}

async function writeJsonFileWithBackup(filepath, data, label = "json") {
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
    console.log("🛡️ 尚無舊資料可備份，略過備份。");
  }

  await fs.writeFile(filepath, JSON.stringify(data, null, 2), "utf-8");
}

async function readExistingGames() {
  return toArray(await readJsonFile(LIVE_BOX_FILE, []));
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
    if (await fileExists(chromePath)) return chromePath;
  }

  return null;
}

async function setupPage(browser) {
  const page = await browser.newPage();

  await page.setViewport({
    width: 1500,
    height: 2400,
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
    if (!page.isClosed()) await page.close();
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

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.GameDatas)) return payload.GameDatas;
  if (Array.isArray(payload.gameDatas)) return payload.gameDatas;
  if (Array.isArray(payload.data)) return payload.data;

  if (typeof payload.GameDatas === "string") {
    try {
      return JSON.parse(payload.GameDatas);
    } catch {
      return [];
    }
  }

  if (typeof payload.gameDatas === "string") {
    try {
      return JSON.parse(payload.gameDatas);
    } catch {
      return [];
    }
  }

  if (payload.data && typeof payload.data === "object") {
    return Object.values(payload.data).flat();
  }

  return [];
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

  const awayH = pickNumber(raw, [
    "VisitingH",
    "VisitH",
    "AwayH",
    "VisitingHits",
    "AwayHits"
  ]);

  const homeH = pickNumber(raw, [
    "HomeH",
    "HomeHits"
  ]);

  const awayE = pickNumber(raw, [
    "VisitingE",
    "VisitE",
    "AwayE",
    "VisitingErrors",
    "AwayErrors"
  ]);

  const homeE = pickNumber(raw, [
    "HomeE",
    "HomeErrors"
  ]);

  const rawStatus = cleanOneLine(
    pick(raw, [
      "GameStatusChi",
      "GameStatusName",
      "StatusText",
      "GameStatusText",
      "Status",
      "PresentStatusChi",
      "PresentStatusName",
      "GameResult"
    ])
  );

  let status = "scheduled";

  if (rawStatus.includes("延賽")) status = "postponed";
  else if (rawStatus.includes("保留")) status = "suspended";
  else if (rawStatus.includes("取消")) status = "cancelled";
  else if (isFinalText(rawStatus)) status = "final";
  else if (isLiveText(rawStatus)) status = "live";

  return {
    gameSno,
    date,
    away,
    home,
    venue,
    time,
    status,
    statusText: getStatusText(status),
    type: "regular",
    typeText: "一軍例行賽",
    awayScore,
    homeScore,
    awayH,
    homeH,
    awayE,
    homeE,
    hasScore:
      awayScore !== null ||
      homeScore !== null ||
      awayH !== null ||
      homeH !== null ||
      awayE !== null ||
      homeE !== null,
    rawStatus,
    raw
  };
}

async function discoverTodayGamesFromScheduleApi(browser, today) {
  console.log("🔎 LIVE：從官方 schedule/getgamedatas 抓今日比分...");

  const page = await setupPage(browser);
  const captured = [];

  page.on("response", async response => {
    const url = response.url();

    if (!url.includes("/schedule/getgamedatas")) return;

    try {
      const text = await response.text();

      captured.push({
        url,
        payload: JSON.parse(text),
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
  await safeClosePage(page);

  const rawGames = [];

  for (const item of captured) {
    rawGames.push(...parseGameDatasPayload(item.payload));
  }

  const normalized = rawGames
    .map(normalizeScheduleGame)
    .filter(Boolean);

  const uniqueMap = new Map();

  for (const game of normalized) {
    uniqueMap.set(`${game.date}_${game.gameSno}`, game);
  }

  const todayGames = [...uniqueMap.values()]
    .filter(game => game.date === today)
    .sort((a, b) => Number(a.gameSno) - Number(b.gameSno));

  await writeJsonFile(DEBUG_SCHEDULE_FILE, {
    today,
    capturedCount: captured.length,
    rawCount: rawGames.length,
    normalizedCount: normalized.length,
    uniqueCount: uniqueMap.size,
    todayCount: todayGames.length,
    todayGames,
    captured: captured.map(item => ({
      url: item.url,
      error: item.error || null,
      sample: item.sample || ""
    }))
  });

  todayGames.forEach(g => {
    console.log(
      `✅ API ${g.gameSno}: ${g.away} vs ${g.home} ${g.venue} ${g.time} ${g.statusText}｜` +
      `比分:${g.awayScore ?? "—"}:${g.homeScore ?? "—"}｜` +
      `RHE 客=${g.awayScore ?? "—"}/${g.awayH ?? "—"}/${g.awayE ?? "—"} ` +
      `主=${g.homeScore ?? "—"}/${g.homeH ?? "—"}/${g.homeE ?? "—"}｜raw=${g.rawStatus || "—"}`
    );
  });

  return todayGames;
}

/* =========================
   首頁備援：只抓比分，不抓投打
========================= */

async function discoverHomeLiveCards(browser, scheduleGames) {
  console.log("🔴 LIVE：從官方首頁抓比分備援，不再信任首頁投打...");

  const page = await setupPage(browser);

  await page.goto("https://www.cpbl.com.tw/", {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(3500);

  const payload = await page.evaluate((scheduleGamesInPage) => {
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

    function parseScoreFromText(text, game) {
      const t = one(text);
      const awayAlias = normalizeAlias(game.away || "");
      const homeAlias = normalizeAlias(game.home || "");

      const patterns = [
        new RegExp(`${awayAlias}[\\s\\S]{0,120}?(\\d+)\\s*[:：]\\s*(\\d+)[\\s\\S]{0,120}?${homeAlias}`),
        new RegExp(`${game.away}[\\s\\S]{0,120}?(\\d+)\\s*[:：]\\s*(\\d+)[\\s\\S]{0,120}?${game.home}`),
        /(\d+)\s*[:：]\s*(\d+)/
      ];

      for (const pattern of patterns) {
        const m = t.match(pattern);

        if (m) {
          return {
            awayScore: Number(m[1]),
            homeScore: Number(m[2])
          };
        }
      }

      return {
        awayScore: null,
        homeScore: null
      };
    }

    function looksLikeGame(text, game) {
      const t = one(text);
      const awayAlias = normalizeAlias(game.away || "");
      const homeAlias = normalizeAlias(game.home || "");

      return (
        t.includes(String(game.gameSno)) &&
        (t.includes(game.away) || t.includes(awayAlias)) &&
        (t.includes(game.home) || t.includes(homeAlias))
      );
    }

    const elements = Array.from(document.querySelectorAll("div, li, article, section"));
    const games = [];

    for (const game of scheduleGamesInPage) {
      const candidates = [];

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const text = one(el.innerText || el.textContent || "");

        if (!text) continue;
        if (rect.width < 220 || rect.height < 40 || rect.height > 900) continue;
        if (!looksLikeGame(text, game)) continue;

        candidates.push({
          text,
          area: rect.width * rect.height,
          score: parseScoreFromText(text, game),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        });
      }

      candidates.sort((a, b) => a.area - b.area);

      const best = candidates[0];

      if (!best) continue;

      games.push({
        gameSno: Number(game.gameSno),
        away: game.away,
        home: game.home,
        awayScore: best.score.awayScore,
        homeScore: best.score.homeScore,
        liveState: null,
        debugText: best.text.slice(0, 1800),
        candidateCount: candidates.length
      });
    }

    return {
      games,
      debug: {
        gameCount: games.length,
        games,
        bodySample: one(document.body?.innerText || "").slice(0, 8000)
      }
    };
  }, scheduleGames);

  try {
    await fs.mkdir(DEBUG_DIR, {
      recursive: true
    });

    await fs.writeFile(
      path.join(DEBUG_DIR, "live-inplay-home-after-load.html"),
      await page.content(),
      "utf-8"
    );

    await fs.writeFile(
      path.join(DEBUG_DIR, "live-inplay-home-after-load.txt"),
      await page.evaluate(() => document.body?.innerText || ""),
      "utf-8"
    );
  } catch (err) {
    console.log(`⚠️ 首頁 debug 寫入失敗：${err.message}`);
  }

  await safeClosePage(page);

  const games = Array.isArray(payload.games)
    ? payload.games
    : [];

  await writeJsonFile(DEBUG_HOME_FILE, payload.debug || {});

  games.forEach(g => {
    console.log(
      `🔴 首頁備援 ${g.gameSno}: ${g.away} ${g.awayScore ?? "—"}:${g.homeScore ?? "—"} ${g.home}｜不採用首頁投打`
    );
  });

  return games;
}

/* =========================
   Boxscore detail parser
========================= */
async function parseBoxscorePage(page, entry, gameSno, expectedGame = null) {
  await page.goto(entry.url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(2500);

  /*
    CPBL 官網 Box Score 是前端模板頁。
    PresentStatus 有時不穩，所以這裡再用 sideHint 強制點擊隊伍頁籤。
  */
  try {
    await page.evaluate((sideHint) => {
      function one(v) {
        return String(v || "")
          .replace(/\u00a0/g, " ")
          .replace(/\r/g, " ")
          .replace(/\n/g, " ")
          .replace(/[ \t]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      const links = Array.from(document.querySelectorAll("a, button, li, div, span"));

      const candidates = links
        .map(el => ({
          el,
          text: one(el.innerText || el.textContent || ""),
          rect: el.getBoundingClientRect()
        }))
        .filter(item => {
          if (!item.text) return false;
          if (item.rect.width <= 0 || item.rect.height <= 0) return false;

          /*
            官網主客隊頁籤通常在成績區上方，
            不直接用隊名猜，改用位置與文字長度過濾。
          */
          if (item.text.length > 30) return false;

          return true;
        });

      /*
        sideHint=home 時，優先點比較後面的隊名按鈕。
        sideHint=away 時，優先點比較前面的隊名按鈕。
      */
      const teamLike = candidates.filter(item => {
        const t = item.text;

        return (
          t.includes("中信") ||
          t.includes("統一") ||
          t.includes("樂天") ||
          t.includes("味全") ||
          t.includes("富邦") ||
          t.includes("台鋼")
        );
      });

      if (!teamLike.length) return false;

      teamLike.sort((a, b) => {
        if (Math.abs(a.rect.y - b.rect.y) > 20) {
          return a.rect.y - b.rect.y;
        }

        return a.rect.x - b.rect.x;
      });

      const target =
        sideHint === "home"
          ? teamLike[teamLike.length - 1]
          : teamLike[0];

      if (target?.el) {
        target.el.click();
        return true;
      }

      return false;
    }, entry.sideHint);

    await sleep(1200);
  } catch (err) {
    console.log(`⚠️ ${gameSno} ${entry.mode} 隊伍頁籤點擊略過：${err.message}`);
  }

  try {
    const pageDebugDir =
      typeof DEBUG_PAGES_DIR !== "undefined"
        ? DEBUG_PAGES_DIR
        : DEBUG_DIR;

    await fs.mkdir(pageDebugDir, {
      recursive: true
    });

    await fs.writeFile(
      path.join(pageDebugDir, `boxscore-${gameSno}-${entry.mode}.html`),
      await page.content(),
      "utf-8"
    );

    await fs.writeFile(
      path.join(pageDebugDir, `boxscore-${gameSno}-${entry.mode}.txt`),
      await page.evaluate(() => document.body?.innerText || ""),
      "utf-8"
    );
  } catch {
    // debug 寫入失敗不影響主流程
  }

  return await page.evaluate((TEAM_NAMES_IN_PAGE, targetGameSno, entryMode, entryUrl, sideHintInPage, expectedGameInPage) => {
    function one(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function num(v) {
      if (v === null || v === undefined || v === "") return null;

      if (String(v).toUpperCase() === "X") return "X";

      const n = Number(v);

      return Number.isFinite(n) ? n : null;
    }

    function normalizeCell(v) {
      const s = one(v);

      return s === "" ? "—" : s;
    }

    function readLines() {
      return (document.body?.innerText || "")
        .split("\n")
        .map(one)
        .filter(Boolean);
    }

    function readTables() {
      return Array.from(document.querySelectorAll("table")).map((table, tableIndex) => {
        const rows = Array.from(table.querySelectorAll("tr"))
          .map(tr =>
            Array.from(tr.querySelectorAll("th, td"))
              .map(td => normalizeCell(td.innerText))
              .filter(Boolean)
          )
          .filter(row => row.length);

        return {
          tableIndex,
          rows,
          text: rows.flat().join(" "),
          rowCount: rows.length,
          sampleRows: rows.slice(0, 14)
        };
      });
    }

    function isFinalTextInPage(text = "") {
      const s = String(text || "");

      return (
        s.includes("比賽結束") ||
        s.includes("比賽終了") ||
        s.includes("FINAL") ||
        s.includes("Final") ||
        s.includes("Game Set") ||
        s.includes("結束")
      );
    }

    function isLiveTextInPage(text = "") {
      const s = String(text || "");

      return (
        s.includes("LIVE") ||
        s.includes("比賽中") ||
        s.includes("進行中") ||
        s.includes("局上") ||
        s.includes("局下")
      );
    }

    function parseMeta() {
      const lines = readLines();
      const bodyText = one(document.body?.innerText || "");

      if (!bodyText || bodyText.length < 50) {
        return {
          ok: false,
          reason: "頁面文字太少",
          entryMode,
          entryUrl,
          sideHint: sideHintInPage
        };
      }

      const teams = TEAM_NAMES_IN_PAGE
        .filter(team => bodyText.includes(team))
        .sort((a, b) => bodyText.indexOf(a) - bodyText.indexOf(b));

      const gameSnoCandidates = lines
        .filter(line => /^\d{1,3}$/.test(line))
        .map(Number)
        .filter(n => n >= 1 && n <= 999);

      const displayedSno =
        gameSnoCandidates.find(n => Number(n) === Number(targetGameSno)) ||
        gameSnoCandidates[0] ||
        null;

      if (displayedSno && Number(displayedSno) !== Number(targetGameSno)) {
        return {
          ok: false,
          reason: `此查詢值導向 gameSno=${displayedSno}`,
          displayedSno,
          entryMode,
          entryUrl,
          sideHint: sideHintInPage
        };
      }

      const statusLine =
        lines.find(line => line.includes("比賽結束")) ||
        lines.find(line => line.includes("比賽終了")) ||
        lines.find(line => line.includes("FINAL")) ||
        lines.find(line => line.includes("Final")) ||
        lines.find(line => line.includes("結束")) ||
        lines.find(line => line.includes("進行中")) ||
        lines.find(line => line.includes("LIVE")) ||
        lines.find(line => /^\d+\s*局\s*[上下]$/.test(line)) ||
        lines.find(line => /^[一二三四五六七八九十]+\s*局\s*[上下]$/.test(line)) ||
        "";

      const dateLine =
        lines.find(line => /\d{4}\/\d{2}\/\d{2}/.test(line)) ||
        lines.find(line => /\d{4}-\d{2}-\d{2}/.test(line)) ||
        "";

      const dateMatch =
        dateLine.match(/(\d{4})\/(\d{2})\/(\d{2})/) ||
        dateLine.match(/(\d{4})-(\d{2})-(\d{2})/);

      const date = dateMatch
        ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
        : "";

      const typeText =
        lines.find(line => line.includes("一軍例行賽")) ||
        lines.find(line => line.includes("熱身賽")) ||
        lines.find(line => line.includes("總冠軍賽")) ||
        "一軍例行賽";

      return {
        ok: true,
        entryMode,
        entryUrl,
        sideHint: sideHintInPage,
        // v5.0-14：官方頁面上方 nav 會先出現六隊隊名，不能用 body 內第一次出現順序判斷主客隊。
        // LIVE 球員表分隊以 schedule API 的 expected away/home 為準，再用表格標題隊名決定 side。
        away: one(expectedGameInPage?.away) || teams[0] || "",
        home: one(expectedGameInPage?.home) || teams[1] || "",
        date,
        gameSnoText: String(targetGameSno),
        statusText: statusLine,
        isFinal: isFinalTextInPage(statusLine) || isFinalTextInPage(bodyText),
        isLive: isLiveTextInPage(statusLine),
        typeText,
        bodySample: bodyText.slice(0, 2000)
      };
    }

    function findHeaderIndex(rows, keywords) {
      return rows.findIndex(row => {
        const text = row.join(" ");

        return keywords.every(k => text.includes(k));
      });
    }

    function findAnyHeaderIndex(rows, groups) {
      return rows.findIndex(row => {
        const text = row.join(" ");

        return groups.some(group => group.every(k => text.includes(k)));
      });
    }

    function indexOfHeader(header, names) {
      for (const name of names) {
        const idx = header.findIndex(h => {
          const s = one(h);

          return s === name || s.includes(name);
        });

        if (idx >= 0) return idx;
      }

      return -1;
    }

    function cell(row, idx) {
      if (idx < 0) return "—";

      return row[idx] ?? "—";
    }

    function isTeamName(value) {
      const s = one(value);

      return TEAM_NAMES_IN_PAGE.some(team => s.includes(team));
    }

    function detectTableTeam(table) {
      const rows = table.rows || [];

      for (const row of rows.slice(0, 3)) {
        for (const value of row.slice(0, 2)) {
          const s = one(value);

          const matched = TEAM_NAMES_IN_PAGE.find(team => s.includes(team));

          if (matched) return matched;
        }
      }

      const text = one(table.text || "");
      const matched = TEAM_NAMES_IN_PAGE.find(team => text.startsWith(team));

      return matched || "";
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

    function resolveSideByTeam(teamName, pageMeta) {
      const team = normalizeAlias(teamName);
      const away = normalizeAlias(pageMeta.away || "");
      const home = normalizeAlias(pageMeta.home || "");

      if (team && away && team === away) return "away";
      if (team && home && team === home) return "home";

      return "";
    }

    function cleanPlayerName(rawName) {
      let s = one(rawName);

      if (!s) return "";

      const banned = [
        "Total",
        "合計",
        "小計",
        "球員",
        "打者",
        "投手",
        "姓名",
        "打數",
        "投球局數",
        "AVG",
        "ERA",
        "裁判",
        "主審",
        "一壘審",
        "二壘審",
        "三壘審"
      ];

      if (banned.some(word => s.includes(word))) return "";
      if (/^\d+$/.test(s)) return "";
      if (/^\d+\.\d+$/.test(s)) return "";
      if (s.length < 2 || s.length > 18) return "";

      return s;
    }

    function splitOrderNamePosition(rawName) {
      const raw = one(rawName);

      const m = raw.match(/^(\d{1,2})\s+(.+?)\s+([A-Z]{1,3})$/);

      if (m) {
        return {
          order: Number(m[1]),
          name: one(m[2]),
          position: one(m[3]),
          rawName: raw
        };
      }

      const m2 = raw.match(/^(\d{1,2})\s+(.+)$/);

      if (m2) {
        return {
          order: Number(m2[1]),
          name: one(m2[2]),
          position: "",
          rawName: raw
        };
      }

      return {
        order: null,
        name: raw,
        position: "",
        rawName: raw
      };
    }

    function rowHasManyInningNumbers(row) {
      return row.filter(value => {
        const s = one(value);

        if (!/^\d{1,2}$/.test(s)) return false;

        const n = Number(s);

        return n >= 1 && n <= 15;
      }).length >= 3;
    }

    function parseLineScoreCell(value) {
      const s = one(value);

      if (!s || s === "—" || s === "-") return "";
      if (s.toUpperCase() === "X") return "X";

      const n = Number(s);

      return Number.isFinite(n) ? n : "";
    }

    function hasUsefulLineRow(row = []) {
      return row.some(value => {
        if (String(value).toUpperCase() === "X") return true;

        const n = Number(value);

        return Number.isFinite(n);
      });
    }

    function parsePureInningTable(table) {
      const rows = table.rows || [];

      if (rows.length < 3) return null;

      const headerIndex = rows.findIndex(row => rowHasManyInningNumbers(row));

      if (headerIndex < 0) return null;

      const header = rows[headerIndex];

      const inningIndexes = [];

      header.forEach((value, idx) => {
        const s = one(value);

        if (/^\d{1,2}$/.test(s)) {
          const n = Number(s);

          if (n >= 1 && n <= 15) inningIndexes.push(idx);
        }
      });

      if (inningIndexes.length < 3) return null;

      const row1 = rows[headerIndex + 1] || [];
      const row2 = rows[headerIndex + 2] || [];

      const away = inningIndexes.map(idx => parseLineScoreCell(row1[idx]));
      const home = inningIndexes.map(idx => parseLineScoreCell(row2[idx]));

      if (!hasUsefulLineRow(away) && !hasUsefulLineRow(home)) return null;

      return {
        tableIndex: table.tableIndex,
        lineScore: {
          away,
          home
        }
      };
    }

    function parseRheTable(table) {
      const rows = table.rows || [];

      const headerIndex = rows.findIndex(row => {
        const joined = row.map(one).join("|").toUpperCase();

        return (
          joined.includes("R") &&
          joined.includes("H") &&
          joined.includes("E")
        );
      });

      if (headerIndex < 0) return null;

      const header = rows[headerIndex].map(v => one(v).toUpperCase());

      const rIdx = header.findIndex(v => v === "R" || v.includes("得分"));
      const hIdx = header.findIndex(v => v === "H" || v.includes("安打"));
      const eIdx = header.findIndex(v => v === "E" || v.includes("失誤"));

      const awayRow = rows[headerIndex + 1] || [];
      const homeRow = rows[headerIndex + 2] || [];

      return {
        tableIndex: table.tableIndex,
        totals: {
          away: {
            R: num(awayRow[rIdx]),
            H: num(awayRow[hIdx]),
            E: num(awayRow[eIdx])
          },
          home: {
            R: num(homeRow[rIdx]),
            H: num(homeRow[hIdx]),
            E: num(homeRow[eIdx])
          }
        }
      };
    }

    function findLineScoreFromTables(tables) {
      const inningCandidates = [];
      const rheCandidates = [];

      for (const table of tables) {
        const pure = parsePureInningTable(table);

        if (pure) {
          inningCandidates.push(pure);
        }

        const rhe = parseRheTable(table);

        if (rhe) {
          rheCandidates.push(rhe);
        }
      }

      inningCandidates.sort((a, b) => {
        const aIsEarly = a.tableIndex <= 2 ? 1 : 0;
        const bIsEarly = b.tableIndex <= 2 ? 1 : 0;

        return bIsEarly - aIsEarly || a.tableIndex - b.tableIndex;
      });

      rheCandidates.sort((a, b) => a.tableIndex - b.tableIndex);

      const inning = inningCandidates[0] || {
        tableIndex: null,
        lineScore: {
          away: [],
          home: []
        }
      };

      const rhe =
        rheCandidates.find(item =>
          inning.tableIndex === null ||
          item.tableIndex >= inning.tableIndex
        ) ||
        rheCandidates[0] ||
        {
          tableIndex: null,
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
          }
        };

      return {
        tableIndex: inning.tableIndex,
        rheTableIndex: rhe.tableIndex,
        lineScore: inning.lineScore,
        totals: rhe.totals,
        count:
          (inning.lineScore.away?.filter(v => v !== "").length || 0) +
          (inning.lineScore.home?.filter(v => v !== "").length || 0)
      };
    }

    function parseBatterTable(table) {
      const rows = table.rows || [];

      const headerIndex =
        findHeaderIndex(rows, ["打數"]) >= 0
          ? findHeaderIndex(rows, ["打數"])
          : findHeaderIndex(rows, ["AB"]);

      if (headerIndex < 0) return [];

      const header = rows[headerIndex];

      const nameIdx = 0;
      const abIdx = indexOfHeader(header, ["AB", "打數"]);
      const rIdx = indexOfHeader(header, ["R", "得分"]);
      const hIdx = indexOfHeader(header, ["H", "安打"]);
      const rbiIdx = indexOfHeader(header, ["RBI", "打點"]);
      const bbIdx = indexOfHeader(header, ["BB", "四壞"]);
      const soIdx = indexOfHeader(header, ["SO", "被三振", "三振"]);
      const avgIdx = indexOfHeader(header, ["AVG", "打擊率"]);

      const players = [];

      for (const row of rows.slice(headerIndex + 1)) {
        const rawName = cell(row, nameIdx);
        const cleanedRawName = cleanPlayerName(rawName);

        if (!cleanedRawName) continue;

        const nameInfo = splitOrderNamePosition(cleanedRawName);

        players.push({
          order: nameInfo.order,
          name: nameInfo.name,
          rawName: nameInfo.rawName,
          position: nameInfo.position,
          AB: cell(row, abIdx),
          R: cell(row, rIdx),
          H: cell(row, hIdx),
          RBI: cell(row, rbiIdx),
          BB: cell(row, bbIdx),
          SO: cell(row, soIdx),
          AVG: cell(row, avgIdx)
        });
      }

      return players;
    }

    function parsePitcherName(rawName) {
      const raw = one(rawName);

      const m = raw.match(/^(\d{1,2})\s+(.+?)(\s+\(.+?\))?$/);

      if (m) {
        return {
          order: Number(m[1]),
          name: one(m[2]),
          note: one(m[3] || ""),
          rawName: raw
        };
      }

      return {
        order: null,
        name: raw,
        note: "",
        rawName: raw
      };
    }

    function parsePitcherTable(table) {
      const rows = table.rows || [];

      const headerIndex = findAnyHeaderIndex(rows, [
        ["投球局數"],
        ["IP"],
        ["防禦率"],
        ["ERA"],
        ["投球數"],
        ["自責分"],
        ["奪三振"]
      ]);

      if (headerIndex < 0) return [];

      const header = rows[headerIndex];

      const nameIdx = 0;
      const ipIdx = indexOfHeader(header, ["IP", "投球局數", "局數", "局"]);
      const bfIdx = indexOfHeader(header, ["面對打席", "BF"]);
      const npIdx = indexOfHeader(header, ["NP", "P", "球數", "用球數", "投球數"]);
      const strikeIdx = indexOfHeader(header, ["好球數"]);
      const hIdx = indexOfHeader(header, ["H", "安打", "被安打"]);
      const hrIdx = indexOfHeader(header, ["HR", "全壘打", "被全壘打"]);
      const bbIdx = indexOfHeader(header, ["BB", "四壞", "保送"]);
      const soIdx = indexOfHeader(header, ["SO", "奪三振", "三振"]);
      const rIdx = indexOfHeader(header, ["R", "失分"]);
      const erIdx = indexOfHeader(header, ["ER", "自責分"]);
      const eIdx = indexOfHeader(header, ["失誤"]);
      const eraIdx = indexOfHeader(header, ["ERA", "防禦率"]);
      const whipIdx = indexOfHeader(header, ["WHIP", "每局被上壘率"]);

      const players = [];

      for (const row of rows.slice(headerIndex + 1)) {
        const rawName = cell(row, nameIdx);
        const cleanedRawName = cleanPlayerName(rawName);

        if (!cleanedRawName) continue;

        const nameInfo = parsePitcherName(cleanedRawName);

        const hasPitchingValue =
          cell(row, ipIdx) !== "—" ||
          cell(row, npIdx) !== "—" ||
          cell(row, hIdx) !== "—" ||
          cell(row, rIdx) !== "—" ||
          cell(row, erIdx) !== "—" ||
          cell(row, eraIdx) !== "—";

        if (!hasPitchingValue) continue;

        players.push({
          order: nameInfo.order,
          name: nameInfo.name,
          note: nameInfo.note,
          rawName: nameInfo.rawName,

          IP: cell(row, ipIdx),
          H: cell(row, hIdx),
          R: cell(row, rIdx),
          ER: cell(row, erIdx),
          BB: cell(row, bbIdx),
          SO: cell(row, soIdx),
          HR: cell(row, hrIdx),
          NP: cell(row, npIdx),
          ERA: cell(row, eraIdx),

          投球局數: num(cell(row, ipIdx)) ?? cell(row, ipIdx),
          面對打席: num(cell(row, bfIdx)) ?? cell(row, bfIdx),
          投球數: num(cell(row, npIdx)) ?? cell(row, npIdx),
          好球數: num(cell(row, strikeIdx)) ?? cell(row, strikeIdx),
          安打: num(cell(row, hIdx)) ?? cell(row, hIdx),
          全壘打: num(cell(row, hrIdx)) ?? cell(row, hrIdx),
          四壞: num(cell(row, bbIdx)) ?? cell(row, bbIdx),
          奪三振: num(cell(row, soIdx)) ?? cell(row, soIdx),
          失分: num(cell(row, rIdx)) ?? cell(row, rIdx),
          自責分: num(cell(row, erIdx)) ?? cell(row, erIdx),
          失誤: num(cell(row, eIdx)) ?? cell(row, eIdx),
          防禦率: num(cell(row, eraIdx)) ?? cell(row, eraIdx),
          每局被上壘率: num(cell(row, whipIdx)) ?? cell(row, whipIdx)
        });
      }

      return players;
    }

    function cleanAwardName(value) {
      let s = one(value);

      if (!s) return "";

      s = s
        .replace(/^[:：\-\s]+/, "")
        .replace(/[，,。]+$/, "")
        .replace(/\(.+?\)/g, "")
        .replace(/（.+?）/g, "")
        .trim();

      const bannedWords = [
        "勝投",
        "敗投",
        "救援",
        "救援成功",
        "MVP",
        "單場MVP",
        "球員",
        "投手",
        "打者",
        "無",
        "中信兄弟",
        "統一7-ELEVEn獅",
        "統一7-ELEVEN獅",
        "樂天桃猿",
        "味全龍",
        "富邦悍將",
        "台鋼雄鷹",
        "中斷",
        "連勝",
        "賽事",
        "簡報",
        "新聞",
        "觀眾",
        "時間",
        "亞太主",
        "新莊",
        "天母",
        "澄清湖",
        "大巨蛋",
        "洲際",
        "桃園"
      ];

      if (bannedWords.some(word => s.includes(word))) return "";
      if (s.length < 2 || s.length > 8) return "";
      if (/^\d+$/.test(s)) return "";
      if (/^[◎●▲★]/.test(s)) return "";

      return s;
    }
    function valueAfterLabel(lines, labels) {
      const stopWords = [
        "賽事簡報",
        "briefing",
        "裁判",
        "比賽時間",
        "觀眾",
        "TOP",
        "打擊成績",
        "投手成績",
        "戰況表"
      ];

      for (const label of labels) {
        for (let i = 0; i < lines.length; i++) {
          const line = one(lines[i]);

          if (stopWords.some(word => line.includes(word))) {
            continue;
          }

          if (!line.includes(label)) continue;

          const sameLine = cleanAwardName(
            line
              .replace(label, "")
              .replace("：", "")
              .replace(":", "")
              .trim()
          );

          if (sameLine) return sameLine;

          for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
            const candidateLine = one(lines[j]);

            if (stopWords.some(word => candidateLine.includes(word))) break;

            const candidate = cleanAwardName(candidateLine);

            if (candidate) return candidate;
          }
        }
      }

      return "";
    }

    function parseAwards() {
      const lines = readLines();

      return {
        win: valueAfterLabel(lines, ["勝投", "勝利投手"]),
        lose: valueAfterLabel(lines, ["敗投", "敗戰投手"]),
        save: valueAfterLabel(lines, ["救援成功", "救援"]),
        mvp: valueAfterLabel(lines, ["單場MVP", "MVP"])
      };
    }

    function putPlayers(target, side, players) {
      if (!side || !players.length) return;

      const map = new Map(
        (target[side] || [])
          .map(player => [one(player.name || player.rawName || ""), player])
          .filter(([key]) => key)
      );

      for (const player of players) {
        const key = one(player.name || player.rawName || "");

        if (key && !map.has(key)) map.set(key, player);
      }

      target[side] = [...map.values()];
    }

    function isDetailedBatterTable(table) {
      const firstRow = table.rows?.[0] || [];

      if (rowHasManyInningNumbers(firstRow)) return false;

      const text = table.text || "";

      return (
        text.includes("打數") &&
        text.includes("得分") &&
        text.includes("安打") &&
        text.includes("打點") &&
        text.includes("打擊率")
      );
    }

    function isPitcherTable(table) {
      const text = table.text || "";

      return (
        text.includes("投球局數") ||
        text.includes("防禦率") ||
        text.includes("自責分") ||
        text.includes("奪三振") ||
        text.includes("投球數") ||
        text.includes("ERA")
      );
    }


    function extractLiveStateScout(pageMeta, batters, pitchers) {
      const lines = readLines();
      const inningIndexes = [];

      for (let i = 0; i < lines.length; i++) {
        const line = one(lines[i]);
        if (/^\d+\s*局\s*[上下]$/.test(line) || /^[一二三四五六七八九十]+\s*局\s*[上下]$/.test(line)) {
          inningIndexes.push(i);
        }
      }

      if (!inningIndexes.length) return null;

      const inningIndex = inningIndexes[inningIndexes.length - 1];
      const inningText = one(lines[inningIndex]);
      const half = inningText.includes("上") ? "top" : inningText.includes("下") ? "bottom" : "";
      const after = lines.slice(inningIndex + 1, inningIndex + 16).map(one).filter(Boolean);
      const pitchIndex = after.findIndex(line => /^PITCH\s*\d+/i.test(line));
      const beforePitch = pitchIndex >= 0 ? after.slice(0, pitchIndex) : after.slice(0, 8);
      const pitchLine = pitchIndex >= 0 ? after[pitchIndex] : "";
      const pitchMatch = pitchLine.match(/^PITCH\s*(\d+)/i);
      const pitchCount = pitchMatch ? Number(pitchMatch[1]) : null;
      const recentEventsText = pitchIndex >= 0 ? one(after[pitchIndex + 1] || "") : "";

      const teamValues = new Set([
        pageMeta.away,
        pageMeta.home,
        expectedGameInPage?.away,
        expectedGameInPage?.home,
        ...TEAM_NAMES_IN_PAGE
      ].map(one).filter(Boolean));

      function isPossiblePlayerName(value) {
        const text = one(value);
        if (!text) return false;
        if (teamValues.has(text)) return false;
        if (/^PITCH\s*\d+/i.test(text)) return false;
        if (/^\d+$/.test(text)) return false;
        if (/^\d+\s*局\s*[上下]$/.test(text)) return false;
        if (text.includes(":")) return false;
        if (text.length > 14) return false;
        if (/^[A-Za-z0-9\s:.-]+$/.test(text)) return false;
        return /[\u4e00-\u9fff]/.test(text);
      }

      const candidates = beforePitch.filter(isPossiblePlayerName);

      function nameSet(list = []) {
        return new Set((list || []).map(p => one(p.name || p.rawName || "")).filter(Boolean));
      }

      const batterAway = nameSet(batters.away);
      const batterHome = nameSet(batters.home);
      const pitcherAway = nameSet(pitchers.away);
      const pitcherHome = nameSet(pitchers.home);

      let batter = "";
      let pitcher = "";

      for (const candidate of candidates) {
        if (!batter && (batterAway.has(candidate) || batterHome.has(candidate))) batter = candidate;
        if (!pitcher && (pitcherAway.has(candidate) || pitcherHome.has(candidate))) pitcher = candidate;
      }

      // CPBL 即時小區塊通常會呈現：投手、打者；如果名單尚未完整，就用安全預設補上。
      if ((!batter || !pitcher) && candidates.length >= 2) {
        if (!pitcher) pitcher = candidates[0];
        if (!batter) batter = candidates[candidates.length - 1];
      }

      function splitEvents(text) {
        const source = one(text);
        if (!source) return [];

        const tokens = source.match(/全壘打|場安|一安|二安|三安|四壞|故四|觸身|三振|左飛|中飛|右飛|游飛|二飛|三飛|一飛|捕飛|左滾|中滾|右滾|游滾|二滾|三滾|一滾|雙殺|犧飛|犧打|野選|失誤|盜壘|暴投|捕逸|界飛/g);
        return tokens || (source ? [source] : []);
      }

      const battingSide = half === "top" ? "away" : half === "bottom" ? "home" : "";
      const fieldingSide = half === "top" ? "home" : half === "bottom" ? "away" : "";
      const battingTeam = battingSide === "away" ? pageMeta.away : battingSide === "home" ? pageMeta.home : "";
      const fieldingTeam = fieldingSide === "away" ? pageMeta.away : fieldingSide === "home" ? pageMeta.home : "";

      return {
        source: "boxscore-live-state-scout",
        inningText,
        half,
        battingSide,
        fieldingSide,
        battingTeam,
        fieldingTeam,
        batter,
        pitcher,
        pitchCount,
        pitchLabel: pitchLine,
        recentEvents: splitEvents(recentEventsText),
        recentEventsText,
        rawWindow: after,
        confidence: batter && pitcher ? "scout" : "debug",
        message: batter && pitcher
          ? "LIVE state scout：已從官方 boxscore 文字偵測目前投打"
          : "LIVE state scout：已偵測局數，但目前投打仍需人工確認"
      };
    }

    function parseDetail(pageMeta) {
      const tables = readTables();
      const lineScoreBundle = findLineScoreFromTables(tables);

      const batters = {
        away: [],
        home: []
      };

      const pitchers = {
        away: [],
        home: []
      };

      const batterTables = [];
      const pitcherTables = [];
      const skippedBatterTables = [];

      for (const table of tables) {
        const teamName = detectTableTeam(table);
        // v5.0-14：球員表分隊只相信「表格標題隊名」對 expected away/home 的比對。
        // 不再用 PresentStatus / sideHint 硬塞，避免統一球員跑到富邦 tab。
        const side = resolveSideByTeam(teamName, pageMeta);

        if (isDetailedBatterTable(table)) {
          const players = parseBatterTable(table);

          if (players.length && side) {
            putPlayers(batters, side, players);

            batterTables.push({
              tableIndex: table.tableIndex,
              teamName,
              side,
              count: players.length,
              players
            });
          }

          continue;
        }

        const maybeBatter =
          table.text.includes("打數") ||
          table.text.includes("AB") ||
          table.text.includes("打擊率") ||
          table.text.includes("RBI");

        if (maybeBatter) {
          skippedBatterTables.push({
            tableIndex: table.tableIndex,
            reason: "非詳細打擊表，避免把戰況表誤當另一隊",
            teamName,
            side,
            textSample: table.text.slice(0, 500)
          });
        }

        if (isPitcherTable(table)) {
          const players = parsePitcherTable(table);

          if (players.length && side) {
            const teamForPlayer =
              side === "away"
                ? pageMeta.away || teamName
                : pageMeta.home || teamName;

            putPlayers(
              pitchers,
              side,
              players.map(player => ({
                ...player,
                team: teamForPlayer
              }))
            );

            pitcherTables.push({
              tableIndex: table.tableIndex,
              teamName,
              side,
              count: players.length,
              players
            });
          }
        }
      }

      return {
        lineScore: lineScoreBundle.lineScore,
        totals: lineScoreBundle.totals,
        batters,
        pitchers,
        liveState: extractLiveStateScout(pageMeta, batters, pitchers),
        awards: parseAwards(),
        debug: {
          entryMode,
          sideHint: sideHintInPage,
          tableCount: tables.length,
          lineScoreParsed: lineScoreBundle,
          liveStateScout: extractLiveStateScout(pageMeta, batters, pitchers),
          batterTableCount: batterTables.length,
          pitcherTableCount: pitcherTables.length,
          batterSamples: batterTables.map(t => ({
            tableIndex: t.tableIndex,
            teamName: t.teamName,
            side: t.side,
            count: t.count,
            sample: t.players.slice(0, 3)
          })),
          pitcherSamples: pitcherTables.map(t => ({
            tableIndex: t.tableIndex,
            teamName: t.teamName,
            side: t.side,
            count: t.count,
            sample: t.players.slice(0, 3)
          })),
          skippedBatterTables,
          tableSamples: tables.map(table => ({
            tableIndex: table.tableIndex,
            rowCount: table.rowCount,
            sampleRows: table.sampleRows,
            textSample: table.text.slice(0, 700)
          }))
        }
      };
    }

    const meta = parseMeta();

    return {
      meta,
      detail: meta.ok
        ? parseDetail(meta)
        : {
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
          liveState: null,
          awards: {
            win: "",
            lose: "",
            save: "",
            mvp: ""
          },
          debug: {
            reason: "meta invalid"
          }
        }
    };
  }, TEAM_NAMES, gameSno, entry.mode, entry.url, entry.sideHint, expectedGame);
}

/* =========================
   合併 detail
========================= */

function mergePlayerArray(a = [], b = []) {
  const map = new Map();

  [...a, ...b].forEach(player => {
    const key = cleanOneLine(player?.name || player?.rawName || "");

    if (key && !map.has(key)) map.set(key, player);
  });

  return [...map.values()];
}

function mergeLineScore(a = {}, b = {}) {
  return {
    away:
      hasUsefulLineScoreRow(a.away)
        ? a.away
        : hasUsefulLineScoreRow(b.away)
          ? b.away
          : [],
    home:
      hasUsefulLineScoreRow(a.home)
        ? a.home
        : hasUsefulLineScoreRow(b.home)
          ? b.home
          : []
  };
}

function mergeTotals(a = emptyTotals(), b = emptyTotals()) {
  return {
    away: {
      R: firstNumber(a.away?.R, b.away?.R),
      H: firstNumber(a.away?.H, b.away?.H),
      E: firstNumber(a.away?.E, b.away?.E)
    },
    home: {
      R: firstNumber(a.home?.R, b.home?.R),
      H: firstNumber(a.home?.H, b.home?.H),
      E: firstNumber(a.home?.E, b.home?.E)
    }
  };
}

function liveStateScore(liveState) {
  if (!liveState) return -1;

  let score = 0;

  if (liveState.inningText) score += 3;
  if (liveState.half) score += 3;
  if (liveState.balls !== null && liveState.balls !== undefined) score += 1;
  if (liveState.strikes !== null && liveState.strikes !== undefined) score += 1;
  if (liveState.outs !== null && liveState.outs !== undefined) score += 1;
  if (liveState.bases?.first) score += 1;
  if (liveState.bases?.second) score += 1;
  if (liveState.bases?.third) score += 1;

  return score;
}

function pickBetterLiveState(a, b) {
  return liveStateScore(a) >= liveStateScore(b)
    ? a
    : b;
}

function mergeDetailBundles(bundles) {
  const merged = emptyBoxscore();
  const debugBundles = [];
  let meta = null;

  for (const bundle of bundles) {
    if (!bundle?.ok) continue;

    if (!meta) meta = bundle.meta;

    const detail = bundle.detail || emptyBoxscore();

    merged.lineScore = mergeLineScore(merged.lineScore, detail.lineScore || {});
    merged.totals = mergeTotals(merged.totals, detail.totals || emptyTotals());

    merged.batters.away = mergePlayerArray(merged.batters.away, detail.batters?.away || []);
    merged.batters.home = mergePlayerArray(merged.batters.home, detail.batters?.home || []);

    merged.pitchers.away = mergePlayerArray(merged.pitchers.away, detail.pitchers?.away || []);
    merged.pitchers.home = mergePlayerArray(merged.pitchers.home, detail.pitchers?.home || []);

    merged.liveState = pickBetterLiveState(merged.liveState, detail.liveState || null);

    debugBundles.push({
      usedMode: bundle.meta?.usedMode,
      sideHint: bundle.meta?.sideHint,
      batterAway: detail.batters?.away?.length || 0,
      batterHome: detail.batters?.home?.length || 0,
      pitcherAway: detail.pitchers?.away?.length || 0,
      pitcherHome: detail.pitchers?.home?.length || 0,
      lineScoreAway: detail.lineScore?.away?.length || 0,
      lineScoreHome: detail.lineScore?.home?.length || 0,
      totals: detail.totals || null,
      pitcherCandidateCount: detail.debug?.pitcherCandidateCount || 0
    });
  }

  merged.debug = {
    mergedBundles: debugBundles
  };

  return {
    ok: true,
    meta: {
      ...(meta || {}),
      usedMode: bundles.map(b => b.meta?.usedMode).filter(Boolean).join("+"),
      usedUrl: bundles.map(b => b.meta?.usedUrl).filter(Boolean).join(" | ")
    },
    detail: merged
  };
}


/* =========================
   LIVE Stats Fallback v5.0-15
   目的：
   - LIVE 中文 boxscore 只吐單隊時，嘗試從 stats.cpbl.com.tw 補另一隊
   - 保留 v5.0-14 side guard，不用 stats 資料硬塞錯邊
========================= */

function buildStatsScheduleUrl(gameSno) {
  return `https://stats.cpbl.com.tw/schedule/${SEASON_YEAR}-${KIND_CODE}-${gameSno}`;
}

function needsLiveStatsFallback(detailBundle) {
  const d = detailBundle?.detail || emptyBoxscore();

  const batterAway = d.batters?.away?.length || 0;
  const batterHome = d.batters?.home?.length || 0;
  const pitcherAway = d.pitchers?.away?.length || 0;
  const pitcherHome = d.pitchers?.home?.length || 0;

  const hasBothBatters = batterAway > 0 && batterHome > 0;
  const hasBothPitchers = pitcherAway > 0 && pitcherHome > 0;

  const hasMirror =
    isLiveMirroredTeamArray(d.batters?.away || [], d.batters?.home || []) ||
    isLiveMirroredTeamArray(d.pitchers?.away || [], d.pitchers?.home || []);

  return !hasBothBatters || !hasBothPitchers || hasMirror;
}

function normalizeLivePlayerKeyForGuard(player) {
  return cleanOneLine(player?.name || player?.rawName || "")
    .replace(/^\d{1,2}\s+/, "")
    .replace(/\s+[A-Z]{1,3}(?:\([A-Z]{1,3}\))*$/i, "")
    .replace(/\(.+?\)/g, "")
    .replace(/（.+?）/g, "")
    .trim();
}

function livePlayerNameSetForGuard(players = []) {
  const set = new Set();

  for (const player of players || []) {
    const key = normalizeLivePlayerKeyForGuard(player);
    if (key && key.length >= 2) set.add(key);
  }

  return set;
}

function liveOverlapRatioForGuard(a = [], b = []) {
  const aSet = livePlayerNameSetForGuard(a);
  const bSet = livePlayerNameSetForGuard(b);

  if (!aSet.size || !bSet.size) return 0;

  let hit = 0;

  for (const key of bSet) {
    if (aSet.has(key)) hit++;
  }

  return hit / Math.min(aSet.size, bSet.size);
}

function isLiveMirroredTeamArray(away = [], home = []) {
  const awayCount = away?.length || 0;
  const homeCount = home?.length || 0;

  if (!awayCount || !homeCount) return false;

  const ratio = liveOverlapRatioForGuard(away, home);

  return ratio >= 0.55;
}

function pickLiveFallbackArray(baseArr = [], statsArr = [], options = {}) {
  const base = Array.isArray(baseArr) ? baseArr : [];
  const stats = Array.isArray(statsArr) ? statsArr : [];
  const actions = options.actions || [];
  const label = options.label || "unknown";

  if (base.length) return base;

  if (stats.length) {
    actions.push(`${label} filled by LIVE stats fallback (${stats.length})`);
    return stats;
  }

  return [];
}

function mergeLiveStatsFallbackIntoDetail(detailBundle, statsBundle) {
  if (!statsBundle?.ok) return detailBundle;

  const base = detailBundle?.detail || emptyBoxscore();
  const stats = statsBundle.detail || emptyBoxscore();

  const guard = {
    enabled: true,
    batterOverlap: 0,
    pitcherOverlap: 0,
    actions: []
  };

  const candidateBattersAway = pickLiveFallbackArray(base.batters?.away, stats.batters?.away, {
    actions: guard.actions,
    label: "batters.away"
  });

  const candidateBattersHome = pickLiveFallbackArray(base.batters?.home, stats.batters?.home, {
    actions: guard.actions,
    label: "batters.home"
  });

  const candidatePitchersAway = pickLiveFallbackArray(base.pitchers?.away, stats.pitchers?.away, {
    actions: guard.actions,
    label: "pitchers.away"
  });

  const candidatePitchersHome = pickLiveFallbackArray(base.pitchers?.home, stats.pitchers?.home, {
    actions: guard.actions,
    label: "pitchers.home"
  });

  guard.batterOverlap = liveOverlapRatioForGuard(candidateBattersAway, candidateBattersHome);
  guard.pitcherOverlap = liveOverlapRatioForGuard(candidatePitchersAway, candidatePitchersHome);

  const safeBattersHome = isLiveMirroredTeamArray(candidateBattersAway, candidateBattersHome)
    ? []
    : candidateBattersHome;

  if (candidateBattersHome.length && !safeBattersHome.length) {
    guard.actions.push("home batters rejected because they mirror away batters after LIVE stats fallback");
  }

  const safePitchersHome = isLiveMirroredTeamArray(candidatePitchersAway, candidatePitchersHome)
    ? []
    : candidatePitchersHome;

  if (candidatePitchersHome.length && !safePitchersHome.length) {
    guard.actions.push("home pitchers rejected because they mirror away pitchers after LIVE stats fallback");
  }

  const mergedDetail = {
    ...base,
    batters: {
      away: candidateBattersAway,
      home: safeBattersHome
    },
    pitchers: {
      away: candidatePitchersAway,
      home: safePitchersHome
    },
    debug: {
      ...(base.debug || {}),
      liveStatsFallback: stats.debug || null,
      liveStatsFallbackGuard: guard
    }
  };

  return {
    ...detailBundle,
    reason: [detailBundle?.reason, statsBundle.reason].filter(Boolean).join("｜"),
    meta: {
      ...(detailBundle?.meta || {}),
      usedMode: `${detailBundle?.meta?.usedMode || "boxscore"}+live-stats-fallback`,
      usedUrl: `${detailBundle?.meta?.usedUrl || ""} | ${statsBundle.meta?.usedUrl || ""}`
    },
    detail: mergedDetail
  };
}

async function fetchStatsFallback(page, scheduleGame) {
  const gameSno = Number(scheduleGame?.gameSno);
  const awayName = cleanOneLine(scheduleGame?.away || scheduleGame?.meta?.away || "");
  const homeName = cleanOneLine(scheduleGame?.home || scheduleGame?.meta?.home || "");

  if (!gameSno || !awayName || !homeName) {
    return {
      ok: false,
      reason: "stats fallback 缺少 gameSno / away / home",
      detail: emptyBoxscore()
    };
  }

  const url = buildStatsScheduleUrl(gameSno);

  console.log(`   🔎 LIVE stats fallback：${url}`);

  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    await sleep(1800);

    try {
      await fs.mkdir(DEBUG_DIR, {
        recursive: true
      });

      await fs.writeFile(
        path.join(DEBUG_DIR, `stats-${gameSno}.html`),
        await page.content(),
        "utf-8"
      );

      await fs.writeFile(
        path.join(DEBUG_DIR, `stats-${gameSno}.txt`),
        await page.evaluate(() => document.body?.innerText || ""),
        "utf-8"
      );
    } catch {
      // debug 寫入失敗不影響主流程
    }

    const parsed = await page.evaluate((awayNameInPage, homeNameInPage) => {
      function one(v) {
        return String(v || "")
          .replace(/\u00a0/g, " ")
          .replace(/\r/g, " ")
          .replace(/\n/g, " ")
          .replace(/[ \t]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      function lines() {
        return (document.body?.innerText || "")
          .split("\n")
          .map(one)
          .filter(Boolean);
      }

      function cleanPlayerLine(line) {
        return one(line)
          .replace(/^\d+\s*[\.．、]\s*/, "")
          .replace(/^#\s*\d+\s*/, "")
          .replace(/[\[\]【】]/g, "")
          .trim();
      }

      function isPlayerName(line) {
        const s = cleanPlayerLine(line);

        if (!s) return false;
        if (s.includes("合計") || s.includes("Total")) return false;
        if (s.includes("打者") || s.includes("投手")) return false;
        if (s.includes("局數") || s.includes("打數")) return false;
        if (/^\d+(\.\d+)?$/.test(s)) return false;
        if (s.length < 2 || s.length > 18) return false;

        return /^[\u4e00-\u9fa5A-Za-z·．・\s()（）]+$/.test(s);
      }

      function isNumberLine(line, minCount = 5) {
        const parts = one(line).split(/\s+/).filter(Boolean);
        if (parts.length < minCount) return false;
        return parts.every(part => /^-?\d+(?:\/\d+)?(?:\.\d+)?$/.test(part));
      }

      function parseParts(line) {
        return one(line).split(/\s+/).filter(Boolean);
      }

      function normalizePlayerNameFromStatsLine(line) {
        return one(line)
          .replace(/【\d+†([^】]+)】/g, "$1")
          .replace(/\[\d+†([^\]]+)\]/g, "$1")
          .replace(/^\d+\s*[\.．、]\s*/, "")
          .replace(/^#\s*\d+\s*/, "")
          .trim();
      }

      function splitStatsPlayerAndNumbers(line, minCount = 8) {
        const normalized = normalizePlayerNameFromStatsLine(line);

        const combinedRegex = new RegExp(
          "^(.+?)(-?\\d+(?:/\\d+)?(?:\\.\\d+)?(?:\\s+-?\\d+(?:/\\d+)?(?:\\.\\d+)?){" +
          (minCount - 1) +
          ",})$"
        );

        const combinedMatch = normalized.match(combinedRegex);

        if (combinedMatch) {
          const name = combinedMatch[1]
            .replace(/^\d+\s*[\.．、]\s*/, "")
            .trim();
          const parts = parseParts(combinedMatch[2]);

          if (name && parts.length >= minCount) {
            return { name, parts };
          }
        }

        const pieces = parseParts(normalized);
        const firstNumberIndex = pieces.findIndex(part => /^-?\d+(?:\/\d+)?(?:\.\d+)?$/.test(part));

        if (firstNumberIndex > 0) {
          const name = pieces.slice(0, firstNumberIndex).join(" ").trim();
          const parts = pieces.slice(firstNumberIndex);

          if (name && parts.length >= minCount) {
            return { name, parts };
          }
        }

        return null;
      }

      function isTeamSectionLine(line, teamName) {
        const s = one(line);
        return s === teamName || s.startsWith(`${teamName} `);
      }

      function hasBatterHeaderSoon(allLines, index) {
        const windowLines = allLines.slice(index + 1, Math.min(allLines.length, index + 12));

        return windowLines.some(line => {
          const s = one(line);
          return s.includes("打者") && s.includes("打數") && s.includes("安打");
        });
      }

      function findTeamStart(allLines, teamName, fromIndex = 0) {
        for (let i = fromIndex; i < allLines.length; i++) {
          if (!isTeamSectionLine(allLines[i], teamName)) continue;
          if (hasBatterHeaderSoon(allLines, i)) return i;
        }

        return -1;
      }

      function parseTeamSection(teamName, fromIndex, stopIndex) {
        const all = lines();
        const start = findTeamStart(all, teamName, fromIndex);

        if (start < 0) {
          return {
            teamName,
            start: -1,
            batters: [],
            pitchers: []
          };
        }

        const end = stopIndex > start ? stopIndex : all.length;
        const section = all.slice(start, end);

        const batters = [];
        const pitchers = [];

        const batterHeader = section.findIndex(line => line.includes("打者") && line.includes("打數") && line.includes("安打"));
        const pitcherHeader = section.findIndex(line => line.includes("投手") && (line.includes("局數") || line.includes("投球局數")));

        if (batterHeader >= 0) {
          for (let i = batterHeader + 1; i < section.length; i++) {
            const line = section[i];

            if (line.includes("合計") || line.includes("Total")) break;
            if (pitcherHeader >= 0 && i >= pitcherHeader) break;

            let combined = splitStatsPlayerAndNumbers(line, 8);
            let name = "";
            let parts = [];

            if (combined) {
              name = cleanPlayerLine(combined.name);
              parts = combined.parts;
            } else {
              if (!isPlayerName(line)) continue;

              for (let j = i + 1; j < Math.min(section.length, i + 4); j++) {
                if (isNumberLine(section[j], 8)) {
                  name = cleanPlayerLine(line);
                  parts = parseParts(section[j]);
                  break;
                }
              }
            }

            if (!name || parts.length < 8) continue;

            batters.push({
              name,
              rawName: name,
              position: "",
              PA: parts[0] ?? "—",
              AB: parts[1] ?? "—",
              H: parts[2] ?? "—",
              SO: parts[3] ?? "—",
              BB: parts[4] ?? "—",
              HR: parts[5] ?? "—",
              R: parts[6] ?? "—",
              AVG: parts[7] ?? "—",

              打數: parts[1] ?? "—",
              得分: parts[6] ?? "—",
              安打: parts[2] ?? "—",
              打點: parts[8] ?? "—",
              打擊率: parts[7] ?? "—",
              team: teamName,
              source: "stats.cpbl.com.tw"
            });
          }
        }

        if (pitcherHeader >= 0) {
          for (let i = pitcherHeader + 1; i < section.length; i++) {
            const line = section[i];

            if (line.includes("合計") || line.includes("Total")) break;

            let combined = splitStatsPlayerAndNumbers(line, 8);
            let name = "";
            let parts = [];

            if (combined) {
              name = cleanPlayerLine(combined.name);
              parts = combined.parts;
            } else {
              if (!isPlayerName(line)) continue;

              for (let j = i + 1; j < Math.min(section.length, i + 4); j++) {
                if (isNumberLine(section[j], 8)) {
                  name = cleanPlayerLine(line);
                  parts = parseParts(section[j]);
                  break;
                }
              }
            }

            if (!name || parts.length < 7) continue;

            pitchers.push({
              name,
              rawName: name,
              note: "",
              IP: parts[0] ?? "—",
              NP: parts[1] ?? "—",
              H: parts[2] ?? "—",
              SO: parts[3] ?? "—",
              BB: parts[4] ?? "—",
              R: parts[5] ?? "—",
              ER: parts[6] ?? "—",
              ERA: parts[7] ?? "—",

              投球局數: parts[0] ?? "—",
              投球數: parts[1] ?? "—",
              安打: parts[2] ?? "—",
              奪三振: parts[3] ?? "—",
              四壞: parts[4] ?? "—",
              失分: parts[5] ?? "—",
              自責分: parts[6] ?? "—",
              防禦率: parts[7] ?? "—",
              team: teamName,
              source: "stats.cpbl.com.tw"
            });
          }
        }

        return {
          teamName,
          start,
          batters,
          pitchers
        };
      }

      const all = lines();
      const awayStart = findTeamStart(all, awayNameInPage, 0);
      const homeStart = findTeamStart(all, homeNameInPage, Math.max(0, awayStart + 1));

      const away = parseTeamSection(awayNameInPage, 0, homeStart > 0 ? homeStart : all.length);
      const home = parseTeamSection(homeNameInPage, awayStart >= 0 ? awayStart + 1 : 0, all.length);

      return {
        ok: away.start >= 0 || home.start >= 0,
        url: window.location.href,
        away,
        home,
        sampleLines: all.slice(0, 220)
      };
    }, awayName, homeName);

    const detail = emptyBoxscore();

    detail.batters.away = parsed.away?.batters || [];
    detail.batters.home = parsed.home?.batters || [];
    detail.pitchers.away = parsed.away?.pitchers || [];
    detail.pitchers.home = parsed.home?.pitchers || [];
    detail.debug = {
      source: "stats.cpbl.com.tw",
      url,
      parsedUrl: parsed.url,
      awayStart: parsed.away?.start ?? -1,
      homeStart: parsed.home?.start ?? -1,
      awayTeam: parsed.away?.teamName || awayName,
      homeTeam: parsed.home?.teamName || homeName,
      sampleLines: parsed.sampleLines || []
    };

    console.log(
      `   ↳ LIVE stats fallback 解析：` +
      `打者 客${detail.batters.away.length}/主${detail.batters.home.length}｜` +
      `投手 客${detail.pitchers.away.length}/主${detail.pitchers.home.length}`
    );

    return {
      ok: !!parsed.ok,
      meta: {
        ok: !!parsed.ok,
        usedMode: "live-stats-fallback",
        usedUrl: url,
        statusText: "LIVE",
        source: "stats.cpbl.com.tw"
      },
      detail
    };
  } catch (err) {
    console.log(`   ↳ LIVE stats fallback 失敗：${err.message}`);

    return {
      ok: false,
      reason: err.message,
      detail: emptyBoxscore()
    };
  }
}


async function fetchBoxscoreDetail(page, gameSno, expectedGame = null) {
  const entries = buildBoxUrls(gameSno);
  const failures = [];
  const bundles = [];

  for (const entry of entries) {
    try {
      const bundle = await parseBoxscorePage(page, entry, gameSno, expectedGame);

      if (!bundle.meta?.ok) {
        failures.push(`${entry.mode}: ${bundle.meta?.reason || "meta invalid"}`);
        continue;
      }

      bundles.push({
        ok: true,
        meta: {
          ...bundle.meta,
          usedUrl: entry.url,
          usedMode: entry.mode,
          sideHint: entry.sideHint
        },
        detail: bundle.detail || emptyBoxscore()
      });

      const d = bundle.detail || emptyBoxscore();

      console.log(
        `   ↳ ${entry.mode} 解析：` +
        `打者 客${d.batters?.away?.length || 0}/主${d.batters?.home?.length || 0}｜` +
        `投手 客${d.pitchers?.away?.length || 0}/主${d.pitchers?.home?.length || 0}｜` +
        `逐局 客${d.lineScore?.away?.length || 0}/主${d.lineScore?.home?.length || 0}｜` +
        `投手候選表 ${d.debug?.pitcherCandidateCount || 0}`
      );
    } catch (err) {
      failures.push(`${entry.mode}: ${err.message}`);
    }
  }

  if (!bundles.length) {
    const emptyBundle = {
      ok: true,
      meta: {
        ok: true,
        usedMode: "boxscore-empty",
        usedUrl: "",
        statusText: "LIVE"
      },
      detail: emptyBoxscore()
    };

    const statsBundle = await fetchStatsFallback(page, expectedGame || { gameSno });

    if (statsBundle?.ok) {
      const mergedWithStats = mergeLiveStatsFallbackIntoDetail(emptyBundle, statsBundle);
      mergedWithStats.reason = failures.join("｜");
      return mergedWithStats;
    }

    return {
      ok: false,
      reason: failures.join("｜"),
      detail: emptyBoxscore()
    };
  }

  let merged = mergeDetailBundles(bundles);
  merged.reason = failures.join("｜");

  if (needsLiveStatsFallback(merged)) {
    const d = merged.detail || emptyBoxscore();

    console.log(
      `   🧩 LIVE 球員資料 partial，啟動 stats fallback｜` +
      `打者 客${d.batters?.away?.length || 0}/主${d.batters?.home?.length || 0}｜` +
      `投手 客${d.pitchers?.away?.length || 0}/主${d.pitchers?.home?.length || 0}`
    );

    const statsBundle = await fetchStatsFallback(page, expectedGame || { gameSno });

    if (statsBundle?.ok) {
      merged = mergeLiveStatsFallbackIntoDetail(merged, statsBundle);
    }
  }

  return merged;
}

/* =========================
   合併資料
========================= */

function shouldSkipBecauseFinal(oldGame, scheduleGame, detailBundle) {
  const oldStatus = oldGame?.meta?.status || "";
  const oldStatusText = oldGame?.meta?.statusText || "";
  const apiStatus = scheduleGame?.status || "";
  const apiStatusText = scheduleGame?.statusText || "";
  const detailStatusText = detailBundle?.meta?.statusText || "";

  if (oldStatus === "final" || oldStatusText.includes("比賽結束")) return true;
  if (apiStatus === "final" || apiStatusText.includes("比賽結束")) return true;
  if (isFinalText(detailStatusText)) return true;

  return false;
}

function createOrMergeGame(oldGame, scheduleGame, liveCard, detailBundle) {
  const old = oldGame || {};
  const box = emptyBoxscore();

  const detail = detailBundle?.ok
    ? detailBundle.detail || {}
    : {};

  const lineScore =
    hasAnyLineScore(detail.lineScore)
      ? detail.lineScore
      : hasAnyLineScore(old.lineScore)
        ? old.lineScore
        : box.lineScore;

  const detailTotals = detail.totals || emptyTotals();

  const batters =
    detail.batters &&
    (
      detail.batters.away?.length ||
      detail.batters.home?.length
    )
      ? {
        away: detail.batters.away || [],
        home: detail.batters.home || []
      }
      : old.batters || box.batters;

  const pitchers =
    detail.pitchers &&
    (
      detail.pitchers.away?.length ||
      detail.pitchers.home?.length
    )
      ? {
        away: detail.pitchers.away || [],
        home: detail.pitchers.home || []
      }
      : old.pitchers || box.pitchers;

  const rawLiveState =
    sanitizeLiveState(detail.liveState) ||
    sanitizeLiveState(old.liveState) ||
    null;

  const liveState = resolveLiveState(
    rawLiveState,
    scheduleGame,
    old,
    batters,
    pitchers
  );

  const totals = {
    away: {
      R: pickLiveRuns(
        lineScore.away,
        liveCard?.awayScore,
        scheduleGame.awayScore,
        detailTotals.away?.R,
        old.totals?.away?.R
      ),
      H: firstNumber(scheduleGame.awayH, detailTotals.away?.H, old.totals?.away?.H),
      E: firstNumber(scheduleGame.awayE, detailTotals.away?.E, old.totals?.away?.E)
    },
    home: {
      R: pickLiveRuns(
        lineScore.home,
        liveCard?.homeScore,
        scheduleGame.homeScore,
        detailTotals.home?.R,
        old.totals?.home?.R
      ),
      H: firstNumber(scheduleGame.homeH, detailTotals.home?.H, old.totals?.home?.H),
      E: firstNumber(scheduleGame.homeE, detailTotals.home?.E, old.totals?.home?.E)
    }
  };

  const mergedGame = {
    ...old,

    gameSno: Number(scheduleGame.gameSno),
    sourceStage: "live",

    meta: {
      ...(old.meta || {}),
      date: scheduleGame.date || old.meta?.date || "",
      away: scheduleGame.away || old.meta?.away || "",
      home: scheduleGame.home || old.meta?.home || "",
      status: "live",
      statusText: "LIVE",
      type: old.meta?.type || "regular",
      typeText: old.meta?.typeText || "一軍例行賽",
      time: scheduleGame.time || old.meta?.time || "",
      duration: old.meta?.duration || "",
      venue: scheduleGame.venue || old.meta?.venue || "",
      officialUrl: buildOfficialUrl(scheduleGame.gameSno),
      urlMode:
        detailBundle?.ok
          ? detailBundle.meta?.usedMode || "boxscore"
          : "schedule-api-live",
      win: old.meta?.win || null,
      lose: old.meta?.lose || null,
      save: old.meta?.save || null,
      mvp: old.meta?.mvp || null
    },

    lineScore,
    totals,
    batters,
    pitchers,

    pregame: old.pregame || {
      starters: {
        away: "",
        home: ""
      },
      lineups: {
        away: [],
        home: []
      }
    },

    liveState,

    debug: {
      ...(old.debug || {}),
      liveInplay: {
        scheduleGame,
        liveCard: liveCard || null,
        detailOk: !!detailBundle?.ok,
        detailReason: detailBundle?.reason || null,
        detailTotals,
        detailMergedDebug: detail.debug || null,
        liveStateResolved: liveState || null,
        parserMode: VERSION,
        updatedAt: new Date().toISOString()
      }
    }
  };

  return {
    ...mergedGame,
    dataQuality: buildDataQuality(mergedGame)
  };
}

function isInplayCandidate(game, liveCard) {
  if (!game) return false;

  if (
    game.status === "final" ||
    game.status === "postponed" ||
    game.status === "suspended" ||
    game.status === "cancelled"
  ) {
    return false;
  }

  if (game.status === "live") return true;
  if (liveCard) return true;

  const hasUsefulScore =
    typeof game.awayScore === "number" ||
    typeof game.homeScore === "number" ||
    typeof game.awayH === "number" ||
    typeof game.homeH === "number";

  return isAfterGameStart(game.date, game.time) && hasUsefulScore;
}

/* =========================
   主程式
========================= */

async function main() {
  const today = getTodayTaipei();

  console.log(`📡 CPBL 比賽中 LIVE 更新 ${VERSION}...`);
  console.log("今天：", today);

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

  if (executablePath) launchOptions.executablePath = executablePath;

  console.log("Chrome:", executablePath || "puppeteer default");

  const browser = await puppeteer.launch(launchOptions);

  try {
    const scheduleGames = await discoverTodayGamesFromScheduleApi(browser, today);
    const liveCards = await discoverHomeLiveCards(browser, scheduleGames);

    const liveCardMap = new Map(
      liveCards.map(card => [Number(card.gameSno), card])
    );

    const existingGames = await readExistingGames();

    const updatedMap = new Map(
      existingGames.map(game => [Number(game.gameSno), game])
    );

    const inplayGames = scheduleGames.filter(game =>
      isInplayCandidate(game, liveCardMap.get(Number(game.gameSno)) || null)
    );

    console.log(`今日場次：${scheduleGames.length}｜比賽中候選：${inplayGames.length}`);

    if (!inplayGames.length) {
      console.log("⏳ 目前沒有需要 LIVE 更新的比賽。");
      await safeCloseBrowser(browser);
      return;
    }

    const page = await setupPage(browser);

    let updatedCount = 0;
    let skippedFinalCount = 0;

    for (const game of inplayGames) {
      const gameSno = Number(game.gameSno);
      const liveCard = liveCardMap.get(gameSno) || null;

      console.log("");
      console.log(`更新 LIVE：${gameSno}`);

      const detailBundle = await fetchBoxscoreDetail(page, gameSno, game);

      if (detailBundle.ok) {
        console.log(`✅ ${gameSno}: boxscore detail 合併完成｜mode=${detailBundle.meta?.usedMode || "—"}`);
      } else {
        console.log(`⚠️ ${gameSno}: boxscore detail 暫不可用｜${detailBundle.reason || "unknown"}`);
      }

      const oldGame = updatedMap.get(gameSno) || null;

      if (shouldSkipBecauseFinal(oldGame, game, detailBundle)) {
        skippedFinalCount++;
        console.log(`🛡️ ${gameSno}: 偵測為 FINAL，LIVE 腳本不覆蓋，交給 final fetch。`);
        continue;
      }

      const merged = createOrMergeGame(oldGame, game, liveCard, detailBundle);

      updatedMap.set(gameSno, merged);
      updatedCount++;

      const batterAway = merged.batters?.away?.length || 0;
      const batterHome = merged.batters?.home?.length || 0;
      const pitcherAway = merged.pitchers?.away?.length || 0;
      const pitcherHome = merged.pitchers?.home?.length || 0;

      const inningCount =
        Math.max(
          merged.lineScore?.away?.length || 0,
          merged.lineScore?.home?.length || 0
        );

      const basesText =
        `${merged.liveState?.bases?.first ? "一" : "—"}` +
        `${merged.liveState?.bases?.second ? "二" : "—"}` +
        `${merged.liveState?.bases?.third ? "三" : "—"}`;

      const pitcherCandidateCount =
        merged.debug?.liveInplay?.detailMergedDebug?.mergedBundles
          ?.reduce((sum, item) => sum + Number(item.pitcherCandidateCount || 0), 0) || 0;

      console.log(
        `✅ ${gameSno}: ${merged.meta.away} ${merged.totals?.away?.R ?? "—"} : ` +
        `${merged.totals?.home?.R ?? "—"} ${merged.meta.home}｜${merged.meta.statusText}`
      );

      console.log(
        `   RHE 客=${merged.totals?.away?.R ?? "—"}/${merged.totals?.away?.H ?? "—"}/${merged.totals?.away?.E ?? "—"} ` +
        `主=${merged.totals?.home?.R ?? "—"}/${merged.totals?.home?.H ?? "—"}/${merged.totals?.home?.E ?? "—"}`
      );

      console.log(
        `   打者：客${batterAway} 主${batterHome}｜投手：客${pitcherAway} 主${pitcherHome}｜` +
        `逐局：${inningCount ? inningCount + "局" : "—"}｜投手候選表=${pitcherCandidateCount}`
      );

      console.log(
        `   liveState：${merged.liveState?.inningText || "比賽中"}｜` +
        `進攻=${merged.liveState?.battingTeam || "—"}(${merged.liveState?.battingSide || "—"})｜` +
        `守備=${merged.liveState?.fieldingTeam || "—"}(${merged.liveState?.fieldingSide || "—"})｜` +
        `打者=${merged.liveState?.batter || "—"}｜` +
        `投手=${merged.liveState?.pitcher || "—"}｜` +
        `B/S/O=${merged.liveState?.balls ?? "—"}/${merged.liveState?.strikes ?? "—"}/${merged.liveState?.outs ?? "—"}｜` +
        `球數=${merged.liveState?.pitchCount ?? "—"}｜壘包=${basesText}`
      );

      if (merged.liveState?.source === "boxscore-live-state-scout") {
        console.log(
          `   🛰️ LIVE state scout：局數=${merged.liveState.inningText || "—"}｜` +
          `打者=${merged.liveState.batter || "—"}｜投手=${merged.liveState.pitcher || "—"}｜` +
          `PITCH=${merged.liveState.pitchCount ?? "—"}｜` +
          `事件=${(merged.liveState.recentEvents || []).join(" / ") || merged.liveState.recentEventsText || "—"}`
        );
      }

      console.log(
        `   dataQuality：比分=${merged.dataQuality?.score}｜逐局=${merged.dataQuality?.lineScore}｜` +
        `打者=${merged.dataQuality?.batters}｜投手=${merged.dataQuality?.pitchers}｜` +
        `liveState=${merged.dataQuality?.liveState}`
      );
    }

    await safeClosePage(page);
    await safeCloseBrowser(browser);

    const result = [...updatedMap.values()]
      .sort((a, b) => {
        const da = a.meta?.date || "9999-12-31";
        const db = b.meta?.date || "9999-12-31";

        if (da !== db) return da.localeCompare(db);

        return Number(a.gameSno || 0) - Number(b.gameSno || 0);
      });

    await writeJsonFileWithBackup(LIVE_BOX_FILE, result, "live-inplay");

    console.log("");
    console.log("💾 LIVE 更新完成，共保留場次：", result.length);
    console.log(`本次 LIVE 更新場次：${updatedCount}`);
    console.log(`FINAL 保護跳過：${skippedFinalCount}`);
    console.log("輸出：data/live/live-boxscore.json");
    console.log("");
    console.log("🧪 Debug 檔案：");
    console.log("debug/live-inplay/live-inplay-schedule-api-debug.json");
    console.log("debug/live-inplay/live-inplay-home-cards-debug.json");
    console.log("debug/live-inplay/live-inplay-home-after-load.html");
    console.log("debug/live-inplay/live-inplay-home-after-load.txt");
    console.log("debug/live-inplay/boxscore-{gameSno}-{mode}.html");
    console.log("debug/live-inplay/boxscore-{gameSno}-{mode}.txt");

  } catch (err) {
    await safeCloseBrowser(browser);
    throw err;
  }
}

main().catch(err => {
  console.error("❌ LIVE 更新失敗：", err);
  process.exit(1);
});