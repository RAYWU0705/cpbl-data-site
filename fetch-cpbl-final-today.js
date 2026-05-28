import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const VERSION = "v5.0-12-FINAL-RECENT-GUARD";
const RECENT_FINAL_GUARD_DAYS = 2;
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
  "台鋼雄鷹",
  "Brothers",
  "U-Lions",
  "Uni-Lions",
  "Monkeys",
  "Dragons",
  "Guardians",
  "TSG",
  "Hawks"
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
const MANUAL_OVERRIDE_FILE = path.join(__dirname, "../data/manual/manual-boxscore-overrides.json");
const BACKUP_DIR = path.join(__dirname, "../data/live/backups");

const DEBUG_DIR = path.join(__dirname, "../debug/final");
const DEBUG_DETAILS_DIR = path.join(DEBUG_DIR, "details");
const DEBUG_PAGES_DIR = path.join(DEBUG_DIR, "pages");
const DEBUG_SCHEDULE_FILE = path.join(DEBUG_DIR, "final-schedule-api-debug.json");

/* =========================
   基礎工具
========================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pad2(n) {
  return String(n).padStart(2, "0");
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

function getTargetDate() {
  const arg = process.argv.find(item => item.startsWith("--date="));

  if (arg) {
    const value = arg.slice("--date=".length).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }

  return getTodayTaipei();
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

function fixDate(dateStr) {
  if (!dateStr) return null;

  const raw = String(dateStr).replace(/\//g, "-").trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) {
    const parts = raw.split(/[ T]/)[0].split("-");

    return `${parts[0]}-${pad2(parts[1])}-${pad2(parts[2])}`;
  }

  if (/^\d{1,2}-\d{1,2}/.test(raw)) {
    const [m, d] = raw.split("-");

    return `${SEASON_YEAR}-${pad2(m)}-${pad2(d)}`;
  }

  return null;
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

function buildOfficialUrl(gameSno) {
  return `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`;
}

function buildBoxUrls(gameSno) {
  const zhIndexBase = `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`;
  const zhBoxBase = `https://www.cpbl.com.tw/box?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`;

  return [
    {
      mode: "box-index-PresentStatus-0",
      sideHint: "away",
      langHint: "zh",
      url: `${zhIndexBase}&PresentStatus=0`
    },
    {
      mode: "box-index-PresentStatus-1",
      sideHint: "home",
      langHint: "zh",
      url: `${zhIndexBase}&PresentStatus=1`
    },
    {
      mode: "box-PresentStatus-0",
      sideHint: "away",
      langHint: "zh",
      url: `${zhBoxBase}&PresentStatus=0`
    },
    {
      mode: "box-PresentStatus-1",
      sideHint: "home",
      langHint: "zh",
      url: `${zhBoxBase}&PresentStatus=1`
    },
    {
      mode: "box-index-presentStatus-0",
      sideHint: "away",
      langHint: "zh",
      url: `${zhIndexBase}&presentStatus=0`
    },
    {
      mode: "box-index-presentStatus-1",
      sideHint: "home",
      langHint: "zh",
      url: `${zhIndexBase}&presentStatus=1`
    },
    {
      mode: "box-presentStatus-0",
      sideHint: "away",
      langHint: "zh",
      url: `${zhBoxBase}&presentStatus=0`
    },
    {
      mode: "box-presentStatus-1",
      sideHint: "home",
      langHint: "zh",
      url: `${zhBoxBase}&presentStatus=1`
    },
    {
      mode: "box-index-default",
      sideHint: "",
      langHint: "zh",
      url: zhIndexBase
    }
  ];
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

function isFinalText(text = "") {
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

function isPostponedText(text = "") {
  const s = String(text || "");

  return s.includes("延賽") || s.includes("保留") || s.includes("取消");
}

function cleanDecisionPlayerName(value) {
  const s = cleanOneLine(value);

  if (!s) return "";

  const banned = [
    "中信兄弟",
    "統一7-ELEVEn獅",
    "統一7-ELEVEN獅",
    "統一獅",
    "樂天桃猿",
    "味全龍",
    "富邦悍將",
    "台鋼雄鷹",
    "中斷",
    "連勝",
    "賽事",
    "簡報",
    "觀眾",
    "時間",
    "TOP",
    "打擊成績",
    "投手成績",
    "戰況表",
    "SCOREBOARD",
    "BATTERS",
    "PITCHERS",
    "◎",
    "●",
    "▲",
    "★"
  ];

  if (banned.some(word => s.includes(word))) return "";
  if (s.length < 2 || s.length > 8) return "";
  if (/^\d+$/.test(s)) return "";
  if (/^[◎●▲★]/.test(s)) return "";

  return s;
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

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data);

  return [];
}

/* =========================
   dataQuality
========================= */

function quality(condition, partial = false) {
  if (condition) return "confirmed";
  if (partial) return "partial";
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
    hasUsefulLineScoreRow(game?.lineScore?.away) &&
    hasUsefulLineScoreRow(game?.lineScore?.home);

  const batterAway = game?.batters?.away?.length || 0;
  const batterHome = game?.batters?.home?.length || 0;
  const pitcherAway = game?.pitchers?.away?.length || 0;
  const pitcherHome = game?.pitchers?.home?.length || 0;

  const hasResult =
    !!game?.meta?.win ||
    !!game?.meta?.lose ||
    !!game?.meta?.save ||
    !!game?.meta?.mvp;

  return {
    version: VERSION,
    source: "fetch-cpbl-final-today",
    stage: "final",
    score: quality(hasScore),
    rhe: quality(hasRHE, hasScore),
    lineScore: quality(hasLineScore),
    batters: quality(batterAway > 0 && batterHome > 0, batterAway > 0 || batterHome > 0),
    pitchers: quality(pitcherAway > 0 && pitcherHome > 0, pitcherAway > 0 || pitcherHome > 0),
    result: quality(hasResult),
    finalLock: "confirmed",
    mode: "final-lock-parser",
    message: "FINAL 最高優先級：終場資料確認後鎖定 final，LIVE / PREGAME 不應再覆蓋。",
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

async function writeJsonFileWithBackup(filepath, data, label = "final") {
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
    height: 2600,
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
  let statusText = "比賽尚未開始";

  if (rawStatus.includes("延賽")) {
    status = "postponed";
    statusText = "延賽";
  } else if (rawStatus.includes("保留")) {
    status = "suspended";
    statusText = "保留比賽";
  } else if (rawStatus.includes("取消")) {
    status = "cancelled";
    statusText = "取消";
  } else if (isFinalText(rawStatus)) {
    status = "final";
    statusText = "比賽結束";
  }

  const hasScore =
    awayScore !== null ||
    homeScore !== null ||
    awayH !== null ||
    homeH !== null ||
    awayE !== null ||
    homeE !== null;

  const win = cleanDecisionPlayerName(
    pick(raw, [
      "WinningPitcherName",
      "WinPitcherName",
      "WinnerPitcherName",
      "WinningPitcher",
      "WinPitcher"
    ])
  );

  const lose = cleanDecisionPlayerName(
    pick(raw, [
      "LoserPitcherName",
      "LosingPitcherName",
      "LosePitcherName",
      "LoserPitcher",
      "LosePitcher"
    ])
  );

  const save = cleanDecisionPlayerName(
    pick(raw, [
      "CloserName",
      "SavePitcherName",
      "SavingPitcherName",
      "CloserPitcherName",
      "SavePitcher"
    ])
  );

  const mvp = cleanDecisionPlayerName(
    pick(raw, [
      "MvpName",
      "MVPName",
      "MvpPlayerName",
      "MVPPlayerName"
    ])
  );

  const decisionLine = [
    win ? `勝投:${win}` : "",
    lose ? `敗投:${lose}` : "",
    save ? `救援:${save}` : "",
    mvp ? `MVP:${mvp}` : ""
  ].filter(Boolean).join("｜");

  return {
    gameSno,
    date,
    away,
    home,
    venue,
    time,
    status,
    statusText,
    type: "regular",
    typeText: "一軍例行賽",
    awayScore,
    homeScore,
    awayH,
    homeH,
    awayE,
    homeE,
    hasScore,
    rawStatus,
    win,
    lose,
    save,
    mvp,
    decisionLine,
    raw
  };
}

async function discoverTargetGamesFromScheduleApi(browser, targetDate) {
  console.log("🔎 FINAL：從官方 schedule/getgamedatas 抓目標日期資料...");
  console.log("目標日期：", targetDate);

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
    rawGames.push(...parseGameDatasPayload(item.payload));
  }

  const normalized = rawGames
    .map(normalizeScheduleGame)
    .filter(Boolean);

  const uniqueMap = new Map();

  for (const game of normalized) {
    uniqueMap.set(`${game.date}_${game.gameSno}`, game);
  }

  const targetGames = [...uniqueMap.values()]
    .filter(game => game.date === targetDate)
    .sort((a, b) => Number(a.gameSno) - Number(b.gameSno));

  await writeJsonFile(DEBUG_SCHEDULE_FILE, {
    targetDate,
    capturedCount: captured.length,
    rawCount: rawGames.length,
    normalizedCount: normalized.length,
    uniqueCount: uniqueMap.size,
    targetCount: targetGames.length,
    targetGames,
    captured: captured.map(item => ({
      url: item.url,
      error: item.error || null,
      sample: item.sample || ""
    }))
  });

  targetGames.forEach(g => {
    console.log(
      `✅ API ${g.gameSno}: ${g.away} vs ${g.home} ${g.venue} ${g.time} ${g.statusText}｜` +
      `比分:${g.awayScore ?? "—"}:${g.homeScore ?? "—"}｜` +
      `RHE 客=${g.awayScore ?? "—"}/${g.awayH ?? "—"}/${g.awayE ?? "—"} ` +
      `主=${g.homeScore ?? "—"}/${g.homeH ?? "—"}/${g.homeE ?? "—"}｜raw=${g.rawStatus || "—"}`
    );
  });

  return targetGames;
}

/* =========================
   boxscore detail
========================= */
async function parseBoxscorePage(page, entry, gameSno) {
  await page.goto(entry.url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(2500);

  /*
    v5.0-4：
    不再亂點頁面上的隊名元素。
    原本的點擊法很容易點到官網上方「球隊導覽」，
    讓 PresentStatus=1 直接失效或導到別的頁面。
    這版改成用多組官方 URL 逐一嘗試，再由 sideHint 分隊。
  */

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

  return await page.evaluate((TEAM_NAMES_IN_PAGE, targetGameSno, entryMode, entryUrl, sideHintInPage) => {
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
        away: teams[0] || "",
        home: teams[1] || "",
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

      if (s.includes("統一") || s.includes("U-Lions") || s.includes("Uni-Lions")) return "統一";
      if (s.includes("中信") || s.includes("Brothers")) return "中信";
      if (s.includes("樂天") || s.includes("Monkeys")) return "樂天";
      if (s.includes("富邦") || s.includes("Guardians")) return "富邦";
      if (s.includes("味全") || s.includes("Dragons")) return "味全";
      if (s.includes("台鋼") || s.includes("TSG") || s.includes("Hawks")) return "台鋼";

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
      if (s.length < 2 || s.length > 40) return "";

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

        /*
          v5.0-11 重點：
          球員表「分主客」只能相信表格自己偵測到的隊名，
          不再用 URL 的 PresentStatus sideHint 當 fallback。
          因為 2026/05/16-05/17 官網會出現 PresentStatus=1
          但頁面內容仍是客隊表，若信 sideHint 就會把客隊塞到主隊。
        */
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
        awards: parseAwards(),
        debug: {
          entryMode,
          sideHint: sideHintInPage,
          tableCount: tables.length,
          lineScoreParsed: lineScoreBundle,
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
  }, TEAM_NAMES, gameSno, entry.mode, entry.url, entry.sideHint);
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

function mergeAwards(a = {}, b = {}) {
  return {
    win: cleanDecisionPlayerName(a.win) || cleanDecisionPlayerName(b.win) || "",
    lose: cleanDecisionPlayerName(a.lose) || cleanDecisionPlayerName(b.lose) || "",
    save: cleanDecisionPlayerName(a.save) || cleanDecisionPlayerName(b.save) || "",
    mvp: cleanDecisionPlayerName(a.mvp) || cleanDecisionPlayerName(b.mvp) || ""
  };
}

function mergeDetailBundles(bundles) {
  const merged = emptyBoxscore();
  const debugBundles = [];
  let meta = null;
  let awards = {
    win: "",
    lose: "",
    save: "",
    mvp: ""
  };

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

    awards = mergeAwards(awards, detail.awards || {});

    debugBundles.push({
      usedMode: bundle.meta?.usedMode,
      sideHint: bundle.meta?.sideHint,
      langHint: bundle.meta?.langHint || "",
      statusText: bundle.meta?.statusText || "",
      batterAway: detail.batters?.away?.length || 0,
      batterHome: detail.batters?.home?.length || 0,
      pitcherAway: detail.pitchers?.away?.length || 0,
      pitcherHome: detail.pitchers?.home?.length || 0,
      lineScoreAway: detail.lineScore?.away?.length || 0,
      lineScoreHome: detail.lineScore?.home?.length || 0,
      totals: detail.totals || null,
      awards: detail.awards || null,
      pitcherCandidateCount: detail.debug?.pitcherCandidateCount || 0
    });
  }

  merged.awards = awards;
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

async function fetchBoxscoreDetail(page, gameSno) {
  const entries = buildBoxUrls(gameSno);
  const failures = [];
  const bundles = [];

  for (const entry of entries) {
    try {
      console.log(`   🔎 嘗試 box url：${entry.mode}｜${entry.url}`);

      const bundle = await parseBoxscorePage(page, entry, gameSno);

      if (!bundle.meta?.ok) {
        const reason = bundle.meta?.reason || "meta invalid";
        failures.push(`${entry.mode}: ${reason}`);
        console.log(`   ↳ ${entry.mode} 略過：${reason}`);
        continue;
      }

      bundles.push({
        ok: true,
        meta: {
          ...bundle.meta,
          usedUrl: entry.url,
          usedMode: entry.mode,
          sideHint: entry.sideHint,
          langHint: entry.langHint || ""
        },
        detail: bundle.detail || emptyBoxscore()
      });

      const d = bundle.detail || emptyBoxscore();

      console.log(
        `   ↳ ${entry.mode} 解析：` +
        `打者 客${d.batters?.away?.length || 0}/主${d.batters?.home?.length || 0}｜` +
        `投手 客${d.pitchers?.away?.length || 0}/主${d.pitchers?.home?.length || 0}｜` +
        `逐局 客${d.lineScore?.away?.length || 0}/主${d.lineScore?.home?.length || 0}｜` +
        `勝=${d.awards?.win || "—"} 敗=${d.awards?.lose || "—"} 救=${d.awards?.save || "—"} MVP=${d.awards?.mvp || "—"}`
      );
    } catch (err) {
      failures.push(`${entry.mode}: ${err.message}`);
    }
  }

  if (!bundles.length) {
    return {
      ok: false,
      reason: failures.join("｜"),
      detail: emptyBoxscore()
    };
  }

  const merged = mergeDetailBundles(bundles);
  merged.reason = failures.join("｜");

  return merged;
}


/* =========================
   stats.cpbl.com.tw fallback
   用於補足官網 box PresentStatus 仍只回同一隊的場次
========================= */

function buildStatsScheduleUrl(gameSno) {
  return `https://stats.cpbl.com.tw/schedule/${SEASON_YEAR}-${KIND_CODE}-${gameSno}`;
}

function normalizeStatsPlayerLine(line) {
  return cleanOneLine(line)
    .replace(/^\d+\s*[\.．、]\s*/, "")
    .replace(/^#\s*\d+\s*/, "")
    .replace(/[\[\]【】]/g, "")
    .trim();
}

function isProbablyStatsPlayerName(line) {
  const s = normalizeStatsPlayerLine(line);

  if (!s) return false;
  if (s.includes("合計")) return false;
  if (s.includes("打者") || s.includes("投手")) return false;
  if (s.includes("局數") || s.includes("打數")) return false;
  if (/^\d+(\.\d+)?$/.test(s)) return false;
  if (s.length < 2 || s.length > 12) return false;

  return /^[\u4e00-\u9fa5A-Za-z·．・]+$/.test(s);
}

function parseStatsNumberLine(line) {
  return cleanOneLine(line)
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function pickStatsLineNumber(parts, idx) {
  const v = parts[idx];

  if (v === undefined || v === null || v === "") return "—";

  return v;
}

async function fetchStatsFallback(page, scheduleGame) {
  const gameSno = Number(scheduleGame.gameSno);
  const url = buildStatsScheduleUrl(gameSno);

  console.log(`   🔎 嘗試 stats fallback：${url}`);

  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    await sleep(1800);

    try {
      await fs.mkdir(DEBUG_PAGES_DIR, {
        recursive: true
      });

      await fs.writeFile(
        path.join(DEBUG_PAGES_DIR, `stats-${gameSno}.html`),
        await page.content(),
        "utf-8"
      );

      await fs.writeFile(
        path.join(DEBUG_PAGES_DIR, `stats-${gameSno}.txt`),
        await page.evaluate(() => document.body?.innerText || ""),
        "utf-8"
      );
    } catch {
      // debug 寫入失敗不影響流程
    }

    const parsed = await page.evaluate((awayName, homeName) => {
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
        if (s.includes("合計")) return false;
        if (s.includes("打者") || s.includes("投手")) return false;
        if (s.includes("局數") || s.includes("打數")) return false;
        if (/^\d+(\.\d+)?$/.test(s)) return false;
        if (s.length < 2 || s.length > 12) return false;

        return /^[\u4e00-\u9fa5A-Za-z·．・]+$/.test(s);
      }

      function isNumberLine(line, minCount = 5) {
        const parts = one(line).split(/\s+/).filter(Boolean);

        if (parts.length < minCount) return false;

        return parts.every(part => /^-?\d+(\.\d+)?$/.test(part));
      }

      function parseParts(line) {
        return one(line).split(/\s+/).filter(Boolean);
      }

      function normalizePlayerNameFromStatsLine(line) {
        let s = one(line)
          .replace(/【\d+†([^】]+)】/g, "$1")
          .replace(/\[\d+†([^\]]+)\]/g, "$1")
          .replace(/^\d+\s*[\.．、]\s*/, "")
          .replace(/^#\s*\d+\s*/, "")
          .trim();

        return s;
      }

      function splitStatsPlayerAndNumbers(line, minCount = 8) {
        const normalized = normalizePlayerNameFromStatsLine(line);

        const combinedRegex = new RegExp(
          "^(.+?)(-?\\d+(?:\\.\\d+)?(?:\\s+-?\\d+(?:\\.\\d+)?){" +
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
        const firstNumberIndex = pieces.findIndex(part => /^-?\d+(?:\.\d+)?$/.test(part));

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

        if (s === teamName) return true;
        if (s.startsWith(`${teamName} `)) return true;

        return false;
      }

      function hasBatterHeaderSoon(allLines, index) {
        const windowLines = allLines.slice(index + 1, Math.min(allLines.length, index + 10));

        return windowLines.some(line => {
          const s = one(line);

          return s.includes("打者") && s.includes("打數") && s.includes("安打") && s.includes("打擊率");
        });
      }

      function findTeamStart(allLines, teamName, fromIndex = 0) {
        /*
          stats.cpbl.com.tw 頁面前面有比分板，也會出現隊名。
          不能抓第一個隊名，必須抓「隊名後方很快出現打者表頭」的球員資料區塊。
        */
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

        let batterHeader = section.findIndex(line => line.includes("打者") && line.includes("打數") && line.includes("安打"));
        let pitcherHeader = section.findIndex(line => line.includes("投手") && line.includes("局數") && line.includes("用球數"));

        if (batterHeader >= 0) {
          for (let i = batterHeader + 1; i < section.length; i++) {
            const line = section[i];

            if (line.includes("合計")) break;
            if (pitcherHeader >= 0 && i >= pitcherHeader) break;

            let combined = splitStatsPlayerAndNumbers(line, 8);
            let statsLine = "";
            let name = "";
            let parts = [];

            if (combined) {
              name = cleanPlayerLine(combined.name);
              parts = combined.parts;
            } else {
              if (!isPlayerName(line)) continue;

              for (let j = i + 1; j < Math.min(section.length, i + 4); j++) {
                if (isNumberLine(section[j], 8)) {
                  statsLine = section[j];
                  break;
                }
              }

              if (!statsLine) continue;

              parts = parseParts(statsLine);
              name = cleanPlayerLine(line);
            }

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
              source: "stats.cpbl.com.tw"
            });
          }
        }

        if (pitcherHeader >= 0) {
          for (let i = pitcherHeader + 1; i < section.length; i++) {
            const line = section[i];

            if (line.includes("合計")) break;
            let combined = splitStatsPlayerAndNumbers(line, 8);
            let statsLine = "";
            let name = "";
            let parts = [];

            if (combined) {
              name = cleanPlayerLine(combined.name);
              parts = combined.parts;
            } else {
              if (!isPlayerName(line)) continue;

              for (let j = i + 1; j < Math.min(section.length, i + 4); j++) {
                if (isNumberLine(section[j], 8)) {
                  statsLine = section[j];
                  break;
                }
              }

              if (!statsLine) continue;

              parts = parseParts(statsLine);
              name = cleanPlayerLine(line);
            }

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
      const awayStart = findTeamStart(all, awayName, 0);
      const homeStart = findTeamStart(all, homeName, Math.max(0, awayStart + 1));

      const away = parseTeamSection(awayName, 0, homeStart > 0 ? homeStart : all.length);
      const home = parseTeamSection(homeName, awayStart >= 0 ? awayStart + 1 : 0, all.length);

      return {
        ok: away.start >= 0 || home.start >= 0,
        url: window.location.href,
        away,
        home,
        sampleLines: all.slice(0, 220)
      };
    }, scheduleGame.away, scheduleGame.home);

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
      awayTeam: parsed.away?.teamName || scheduleGame.away,
      homeTeam: parsed.home?.teamName || scheduleGame.home,
      sampleLines: parsed.sampleLines || []
    };

    console.log(
      `   ↳ stats fallback 解析：` +
      `打者 客${detail.batters.away.length}/主${detail.batters.home.length}｜` +
      `投手 客${detail.pitchers.away.length}/主${detail.pitchers.home.length}`
    );

    return {
      ok: !!parsed.ok,
      meta: {
        ok: !!parsed.ok,
        usedMode: "stats-cpbl-fallback",
        usedUrl: url,
        statusText: "比賽結束",
        source: "stats.cpbl.com.tw"
      },
      detail
    };
  } catch (err) {
    console.log(`   ↳ stats fallback 失敗：${err.message}`);

    return {
      ok: false,
      reason: err.message,
      detail: emptyBoxscore()
    };
  }
}

function daysBetweenTaipei(dateText, todayText = getTodayTaipei()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ""))) return Infinity;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(todayText || ""))) return Infinity;

  const a = new Date(`${dateText}T00:00:00+08:00`).getTime();
  const b = new Date(`${todayText}T00:00:00+08:00`).getTime();

  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;

  return Math.floor((b - a) / 86400000);
}

function isRecentFinalGame(scheduleGame, days = RECENT_FINAL_GUARD_DAYS) {
  const diff = daysBetweenTaipei(scheduleGame?.date);

  return diff >= 0 && diff <= days;
}

function needsStatsFallback(detailBundle) {
  const d = detailBundle?.detail || emptyBoxscore();

  const hasAllSides =
    (d.batters?.away?.length || 0) > 0 &&
    (d.batters?.home?.length || 0) > 0 &&
    (d.pitchers?.away?.length || 0) > 0 &&
    (d.pitchers?.home?.length || 0) > 0;

  const hasMirror =
    isMirroredTeamArray(d.batters?.away || [], d.batters?.home || []) ||
    isMirroredTeamArray(d.pitchers?.away || [], d.pitchers?.home || []);

  return !hasAllSides || hasMirror;
}

function pickFallbackArray(baseArr = [], statsArr = [], options = {}) {
  const base = Array.isArray(baseArr) ? baseArr : [];
  const stats = Array.isArray(statsArr) ? statsArr : [];
  const actions = options.actions || [];
  const label = options.label || "unknown";

  if (options.forceStats && stats.length) {
    actions.push(`${label} uses stats fallback because recentFinalGuard is enabled (${stats.length})`);
    return stats;
  }

  if (base.length) return base;

  if (stats.length) {
    actions.push(`${label} filled by stats fallback (${stats.length})`);
    return stats;
  }

  return [];
}

function mergeStatsFallbackIntoDetail(detailBundle, statsBundle, options = {}) {
  if (!statsBundle?.ok) return detailBundle;

  const base = detailBundle?.detail || emptyBoxscore();
  const stats = statsBundle.detail || emptyBoxscore();
  const forceStats = !!options.forceStats;

  const statsGuard = {
    forceStats,
    recentFinalGuard: !!options.recentFinalGuard,
    batterOverlap: 0,
    pitcherOverlap: 0,
    actions: []
  };

  const candidateBattersAway = pickFallbackArray(base.batters?.away, stats.batters?.away, {
    forceStats,
    actions: statsGuard.actions,
    label: "batters.away"
  });

  const candidateBattersHome = pickFallbackArray(base.batters?.home, stats.batters?.home, {
    forceStats,
    actions: statsGuard.actions,
    label: "batters.home"
  });

  const candidatePitchersAway = pickFallbackArray(base.pitchers?.away, stats.pitchers?.away, {
    forceStats,
    actions: statsGuard.actions,
    label: "pitchers.away"
  });

  const candidatePitchersHome = pickFallbackArray(base.pitchers?.home, stats.pitchers?.home, {
    forceStats,
    actions: statsGuard.actions,
    label: "pitchers.home"
  });

  statsGuard.batterOverlap = overlapRatioForGuard(candidateBattersAway, candidateBattersHome);
  statsGuard.pitcherOverlap = overlapRatioForGuard(candidatePitchersAway, candidatePitchersHome);

  const safeBattersHome = isMirroredTeamArray(candidateBattersAway, candidateBattersHome)
    ? []
    : candidateBattersHome;

  if (candidateBattersHome.length && !safeBattersHome.length) {
    statsGuard.actions.push("home batters rejected because they mirror away batters after fallback merge");
  }

  const safePitchersHome = isMirroredTeamArray(candidatePitchersAway, candidatePitchersHome)
    ? []
    : candidatePitchersHome;

  if (candidatePitchersHome.length && !safePitchersHome.length) {
    statsGuard.actions.push("home pitchers rejected because they mirror away pitchers after fallback merge");
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
      statsFallback: stats.debug || null,
      statsFallbackGuard: statsGuard
    }
  };

  return {
    ...detailBundle,
    reason: [detailBundle?.reason, statsBundle.reason].filter(Boolean).join("｜"),
    meta: {
      ...(detailBundle?.meta || {}),
      usedMode: `${detailBundle?.meta?.usedMode || "boxscore"}+stats-cpbl-fallback${forceStats ? "+recent-final-guard" : ""}`,
      usedUrl: `${detailBundle?.meta?.usedUrl || ""} | ${statsBundle.meta?.usedUrl || ""}`
    },
    detail: mergedDetail
  };
}



/* =========================
   鏡像資料防呆
   避免客隊球員被誤塞到主隊欄位
========================= */

function normalizePlayerKeyForGuard(player) {
  return cleanOneLine(player?.name || player?.rawName || "")
    .replace(/^\d{1,2}\s+/, "")
    .replace(/\s+[A-Z]{1,3}(?:\([A-Z]{1,3}\))*$/i, "")
    .replace(/\(.+?\)/g, "")
    .replace(/（.+?）/g, "")
    .trim();
}

function playerNameSetForGuard(players = []) {
  const set = new Set();

  for (const player of players || []) {
    const key = normalizePlayerKeyForGuard(player);

    if (key && key.length >= 2) set.add(key);
  }

  return set;
}

function overlapRatioForGuard(a = [], b = []) {
  const aSet = playerNameSetForGuard(a);
  const bSet = playerNameSetForGuard(b);

  if (!aSet.size || !bSet.size) return 0;

  let hit = 0;

  for (const key of bSet) {
    if (aSet.has(key)) hit++;
  }

  return hit / Math.min(aSet.size, bSet.size);
}

function isMirroredTeamArray(away = [], home = []) {
  const awayCount = away?.length || 0;
  const homeCount = home?.length || 0;

  if (!awayCount || !homeCount) return false;

  const ratio = overlapRatioForGuard(away, home);

  return ratio >= 0.55;
}

function sanitizeMirroredTeamData(game) {
  const fixed = {
    ...game,
    batters: {
      away: game?.batters?.away || [],
      home: game?.batters?.home || []
    },
    pitchers: {
      away: game?.pitchers?.away || [],
      home: game?.pitchers?.home || []
    },
    debug: {
      ...(game?.debug || {})
    }
  };

  const guard = {
    enabled: true,
    batterOverlap: overlapRatioForGuard(fixed.batters.away, fixed.batters.home),
    pitcherOverlap: overlapRatioForGuard(fixed.pitchers.away, fixed.pitchers.home),
    actions: []
  };

  if (isMirroredTeamArray(fixed.batters.away, fixed.batters.home)) {
    guard.actions.push(
      `home batters cleared: overlap=${guard.batterOverlap.toFixed(2)}`
    );
    fixed.batters.home = [];
  }

  if (isMirroredTeamArray(fixed.pitchers.away, fixed.pitchers.home)) {
    guard.actions.push(
      `home pitchers cleared: overlap=${guard.pitcherOverlap.toFixed(2)}`
    );
    fixed.pitchers.home = [];
  }

  fixed.debug.finalDuplicateGuard = guard;

  if (guard.actions.length) {
    const dq = buildDataQuality(fixed);
    const flags = Array.isArray(dq.flags) ? [...dq.flags] : [];
    const warnings = Array.isArray(dq.warnings) ? [...dq.warnings] : [];

    if (!flags.includes("duplicateTeamGuard")) {
      flags.push("duplicateTeamGuard");
    }

    warnings.push(
      "偵測到主客隊球員名單高度重複，已清除疑似錯誤的主隊球員資料，等待 stats/manual 補正。"
    );

    fixed.dataQuality = {
      ...dq,
      level: "partial",
      flags,
      warnings,
      message: "偵測到疑似主客隊球員資料重複，系統已阻止錯誤資料被鎖定。"
    };
  }

  return fixed;
}

/* =========================
   Manual Override v1
   人工修正層：爬蟲仍是主體，人工只補洞 / 修錯
========================= */

function manualOverrideKeysForGame(game) {
  const date = cleanOneLine(game?.meta?.date || game?.date || "");
  const gameSno = Number(game?.gameSno || game?.meta?.gameSno || 0);
  const away = cleanOneLine(game?.meta?.away || game?.away || "");
  const home = cleanOneLine(game?.meta?.home || game?.home || "");

  return [
    `${date}_${gameSno}`,
    `${gameSno}`,
    `${date}_${away}_${home}`
  ].filter(key => key && !key.includes("undefined") && !key.includes("NaN"));
}

async function readManualOverrides() {
  const raw = await readJsonFile(MANUAL_OVERRIDE_FILE, {});

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return raw;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeManualArray(value) {
  return Array.isArray(value) ? clonePlain(value) : null;
}

function applyManualSideOverride(targetGroup, overrideGroup, groupName, actions) {
  const next = {
    away: Array.isArray(targetGroup?.away) ? targetGroup.away : [],
    home: Array.isArray(targetGroup?.home) ? targetGroup.home : []
  };

  if (!overrideGroup || typeof overrideGroup !== "object") {
    return next;
  }

  for (const side of ["away", "home"]) {
    if (!hasOwn(overrideGroup, side)) continue;

    const arr = normalizeManualArray(overrideGroup[side]);

    if (arr) {
      next[side] = arr.map(item => ({
        ...item,
        source: item?.source || "manual-override"
      }));

      actions.push(`${groupName}.${side} replaced by manual override (${next[side].length})`);
    }
  }

  return next;
}

function applyManualObjectOverride(targetObj, overrideObj, objectName, actions) {
  const next = {
    ...(targetObj || {})
  };

  if (!overrideObj || typeof overrideObj !== "object" || Array.isArray(overrideObj)) {
    return next;
  }

  for (const [key, value] of Object.entries(overrideObj)) {
    next[key] = clonePlain(value);
    actions.push(`${objectName}.${key} replaced by manual override`);
  }

  return next;
}

function mergeManualDataQuality(game, override, actions) {
  const oldDQ = game.dataQuality || {};
  const flags = Array.isArray(oldDQ.flags) ? [...oldDQ.flags] : [];
  const warnings = Array.isArray(oldDQ.warnings) ? [...oldDQ.warnings] : [];

  if (!flags.includes("manualOverride")) flags.push("manualOverride");

  if (override?.reason) {
    warnings.push(`人工修正：${override.reason}`);
  }

  return {
    ...oldDQ,
    level: "good",
    source: [
      cleanOneLine(oldDQ.source || "fetch-cpbl-final-today"),
      "manual-override"
    ].filter(Boolean).join("+"),
    manualOverride: "applied",
    flags,
    warnings,
    message: override?.message || "此場含人工修正資料，人工修正優先於爬蟲疑似錯誤欄位。",
    updatedAt: new Date().toISOString(),
    manualOverrideActions: actions
  };
}

function applyManualOverride(finalGame, manualOverrides) {
  const keys = manualOverrideKeysForGame(finalGame);
  const matchedKey = keys.find(key => manualOverrides && manualOverrides[key]);

  if (!matchedKey) return finalGame;

  const override = manualOverrides[matchedKey];

  if (!override || override.enabled === false) {
    return finalGame;
  }

  const actions = [];

  const next = {
    ...finalGame,
    meta: {
      ...(finalGame.meta || {})
    },
    totals: {
      ...(finalGame.totals || {})
    },
    lineScore: {
      ...(finalGame.lineScore || {})
    },
    batters: {
      away: Array.isArray(finalGame.batters?.away) ? finalGame.batters.away : [],
      home: Array.isArray(finalGame.batters?.home) ? finalGame.batters.home : []
    },
    pitchers: {
      away: Array.isArray(finalGame.pitchers?.away) ? finalGame.pitchers.away : [],
      home: Array.isArray(finalGame.pitchers?.home) ? finalGame.pitchers.home : []
    },
    debug: {
      ...(finalGame.debug || {})
    }
  };

  if (override.meta && typeof override.meta === "object") {
    next.meta = applyManualObjectOverride(next.meta, override.meta, "meta", actions);
  }

  if (override.totals && typeof override.totals === "object") {
    next.totals = {
      away: applyManualObjectOverride(next.totals.away || {}, override.totals.away || {}, "totals.away", actions),
      home: applyManualObjectOverride(next.totals.home || {}, override.totals.home || {}, "totals.home", actions)
    };
  }

  if (override.lineScore && typeof override.lineScore === "object") {
    for (const side of ["away", "home"]) {
      if (hasOwn(override.lineScore, side) && Array.isArray(override.lineScore[side])) {
        next.lineScore[side] = clonePlain(override.lineScore[side]);
        actions.push(`lineScore.${side} replaced by manual override`);
      }
    }
  }

  next.batters = applyManualSideOverride(next.batters, override.batters, "batters", actions);
  next.pitchers = applyManualSideOverride(next.pitchers, override.pitchers, "pitchers", actions);

  if (override.pregame && typeof override.pregame === "object") {
    next.pregame = applyManualObjectOverride(next.pregame || {}, override.pregame, "pregame", actions);
  }

  next.finalLock = {
    ...(next.finalLock || {}),
    locked: true,
    source: `${next.finalLock?.source || "fetch-cpbl-final-today"}+manual-override`,
    manualOverrideKey: matchedKey,
    manualOverrideAt: new Date().toISOString()
  };

  next.debug = {
    ...next.debug,
    manualOverride: {
      applied: true,
      key: matchedKey,
      reason: override.reason || "",
      actions,
      appliedAt: new Date().toISOString()
    }
  };

  next.dataQuality = mergeManualDataQuality(
    {
      ...next,
      dataQuality: buildDataQuality(next)
    },
    override,
    actions
  );

  console.log(`🛠️ ${next.gameSno}: 已套用人工修正｜key=${matchedKey}`);
  actions.forEach(action => console.log(`   ↳ ${action}`));

  return next;
}

async function ensureManualOverrideFile() {
  try {
    await fs.access(MANUAL_OVERRIDE_FILE);
  } catch {
    await fs.mkdir(path.dirname(MANUAL_OVERRIDE_FILE), {
      recursive: true
    });

    await fs.writeFile(MANUAL_OVERRIDE_FILE, JSON.stringify({}, null, 2), "utf-8");

    console.log(
      `📝 已建立人工修正檔：${path.relative(path.join(__dirname, ".."), MANUAL_OVERRIDE_FILE)}`
    );
  }
}


/* =========================
   建立 FINAL 資料
========================= */

function isFinalCandidate(scheduleGame, oldGame = null) {
  if (!scheduleGame) return false;

  if (isPostponedText(scheduleGame.statusText) || isPostponedText(scheduleGame.rawStatus)) {
    return false;
  }

  if (scheduleGame.status === "final") return true;
  if (scheduleGame.hasScore) return true;

  const oldStatus = oldGame?.meta?.status || "";
  const oldStatusText = oldGame?.meta?.statusText || "";

  if (oldStatus === "live") return true;
  if (oldStatus === "final") return true;
  if (oldStatusText.includes("LIVE")) return true;

  return false;
}

function isDetailFinal(detailBundle) {
  const statusText = detailBundle?.meta?.statusText || "";
  const bundles = detailBundle?.detail?.debug?.mergedBundles || [];

  if (isFinalText(statusText)) return true;

  if (bundles.some(item => isFinalText(item.statusText))) {
    return true;
  }

  const lineScore = detailBundle?.detail?.lineScore || {};

  const awayInnings = lineScore.away?.length || 0;
  const homeInnings = lineScore.home?.length || 0;

  if (awayInnings >= 9 && homeInnings >= 8) return true;

  return false;
}

function createFinalGame(oldGame, scheduleGame, detailBundle) {
  const old = oldGame || {};
  const box = emptyBoxscore();
  const detail = detailBundle?.detail || box;

  const lineScore =
    hasAnyLineScore(detail.lineScore)
      ? detail.lineScore
      : hasAnyLineScore(old.lineScore)
        ? old.lineScore
        : box.lineScore;

  const detailTotals = detail.totals || emptyTotals();

  const awayR =
    firstNumber(
      detailTotals.away?.R,
      scheduleGame.awayScore,
      sumLineScoreRuns(lineScore.away),
      old.totals?.away?.R
    );

  const homeR =
    firstNumber(
      detailTotals.home?.R,
      scheduleGame.homeScore,
      sumLineScoreRuns(lineScore.home),
      old.totals?.home?.R
    );

  const totals = {
    away: {
      R: awayR,
      H: firstNumber(detailTotals.away?.H, scheduleGame.awayH, old.totals?.away?.H),
      E: firstNumber(detailTotals.away?.E, scheduleGame.awayE, old.totals?.away?.E)
    },
    home: {
      R: homeR,
      H: firstNumber(detailTotals.home?.H, scheduleGame.homeH, old.totals?.home?.H),
      E: firstNumber(detailTotals.home?.E, scheduleGame.homeE, old.totals?.home?.E)
    }
  };

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

  const detailAwards = detail.awards || {};
  const awards = {
    // schedule/getgamedatas 的 WinningPitcherName / LoserPitcherName / CloserName / MvpName
    // 通常比頁面文字掃描更乾淨，所以 FINAL 優先採用 schedule API。
    win:
      cleanDecisionPlayerName(scheduleGame.win) ||
      cleanDecisionPlayerName(detailAwards.win) ||
      cleanDecisionPlayerName(old.meta?.win) ||
      "",
    lose:
      cleanDecisionPlayerName(scheduleGame.lose) ||
      cleanDecisionPlayerName(detailAwards.lose) ||
      cleanDecisionPlayerName(old.meta?.lose) ||
      "",
    save:
      cleanDecisionPlayerName(scheduleGame.save) ||
      cleanDecisionPlayerName(detailAwards.save) ||
      cleanDecisionPlayerName(old.meta?.save) ||
      "",
    mvp:
      cleanDecisionPlayerName(scheduleGame.mvp) ||
      cleanDecisionPlayerName(detailAwards.mvp) ||
      cleanDecisionPlayerName(old.meta?.mvp) ||
      ""
  };

  const finalGame = {
    ...old,

    gameSno: Number(scheduleGame.gameSno),
    sourceStage: "final",

    meta: {
      ...(old.meta || {}),
      date: scheduleGame.date || old.meta?.date || "",
      away: scheduleGame.away || old.meta?.away || "",
      home: scheduleGame.home || old.meta?.home || "",
      status: "final",
      statusText: "比賽結束",
      type: normalizeType(scheduleGame.typeText || old.meta?.typeText || "一軍例行賽"),
      typeText: scheduleGame.typeText || old.meta?.typeText || "一軍例行賽",
      time: scheduleGame.time || old.meta?.time || "",
      duration: old.meta?.duration || "",
      venue: scheduleGame.venue || old.meta?.venue || "",
      officialUrl: buildOfficialUrl(scheduleGame.gameSno),
      urlMode:
        detailBundle?.ok
          ? detailBundle.meta?.usedMode || "boxscore-final"
          : "schedule-api-final",
      win: awards.win || old.meta?.win || null,
      lose: awards.lose || old.meta?.lose || null,
      save: awards.save || old.meta?.save || null,
      mvp: awards.mvp || old.meta?.mvp || null
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

    liveState: null,

    finalLock: {
      locked: true,
      lockedAt: new Date().toISOString(),
      source: "fetch-cpbl-final-today",
      version: VERSION,
      message: "FINAL 已鎖定，pregame / live 不應覆蓋此場狀態。"
    },

    debug: {
      ...(old.debug || {}),
      final: {
        scheduleGame,
        detailOk: !!detailBundle?.ok,
        detailReason: detailBundle?.reason || null,
        detailMeta: detailBundle?.meta || null,
        detailMergedDebug: detail.debug || null,
        awards,
        parserMode: VERSION,
        updatedAt: new Date().toISOString()
      }
    }
  };

  return {
    ...finalGame,
    dataQuality: buildDataQuality(finalGame)
  };
}

/* =========================
   主程式
========================= */

async function main() {
  const targetDate = getTargetDate();

  console.log(`📦 CPBL 賽後 FINAL 更新 ${VERSION}...`);
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

  console.log("Chrome:", executablePath || "puppeteer default");

  const browser = await puppeteer.launch(launchOptions);

  try {
    await ensureManualOverrideFile();

    const scheduleGames = await discoverTargetGamesFromScheduleApi(browser, targetDate);
    const existingGames = await readExistingGames();
    const manualOverrides = await readManualOverrides();

    const updatedMap = new Map(
      existingGames.map(game => [Number(game.gameSno), game])
    );

    const candidates = scheduleGames.filter(game =>
      isFinalCandidate(game, updatedMap.get(Number(game.gameSno)) || null)
    );

    console.log(`今日場次：${scheduleGames.length}｜賽後檢查候選：${candidates.length}`);

    if (!scheduleGames.length) {
      console.log("⏳ 目標日期沒有賽程，FINAL 不更新。");
      await safeCloseBrowser(browser);
      return;
    }

    if (!candidates.length) {
      console.log("⏳ 目前沒有需要 FINAL 更新的候選場次。");
      await safeCloseBrowser(browser);
      return;
    }

    const page = await setupPage(browser);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const game of candidates) {
      const gameSno = Number(game.gameSno);

      console.log("");
      console.log(`檢查 FINAL：${gameSno}`);

      let detailBundle = await fetchBoxscoreDetail(page, gameSno);

      if (!detailBundle.ok) {
        console.log(`⚠️ ${gameSno}: boxscore detail 不可用｜${detailBundle.reason || "unknown"}`);
        skippedCount++;
        continue;
      }

      const recentFinalGuard = isRecentFinalGame(game);
      const shouldUseStatsFallback = recentFinalGuard || needsStatsFallback(detailBundle);

      if (recentFinalGuard) {
        console.log(`🧪 ${gameSno}: recentFinalGuard 啟動｜近 ${RECENT_FINAL_GUARD_DAYS} 天 FINAL，強制 stats fallback 交叉驗證`);
      }

      if (shouldUseStatsFallback) {
        const statsBundle = await fetchStatsFallback(page, game);
        detailBundle = mergeStatsFallbackIntoDetail(detailBundle, statsBundle, {
          forceStats: recentFinalGuard,
          recentFinalGuard
        });
      }

      const detailFinal = isDetailFinal(detailBundle);

      if (!detailFinal) {
        console.log(`⏳ ${gameSno}: 尚未確認 FINAL，不鎖定。`);
        skippedCount++;
        continue;
      }

      const oldGame = updatedMap.get(gameSno) || null;
      let finalGame = createFinalGame(oldGame, game, detailBundle);

      // v5.0-11：先擋掉「客隊球員誤塞主隊」的鏡像錯誤，再套用人工修正。
      finalGame = sanitizeMirroredTeamData(finalGame);

      finalGame.debug = {
        ...(finalGame.debug || {}),
        recentFinalGuard: recentFinalGuard
          ? {
            enabled: true,
            days: RECENT_FINAL_GUARD_DAYS,
            message: "近期 FINAL 場次已強制使用 stats fallback 交叉驗證。"
          }
          : {
            enabled: false
          }
      };

      // sanitize 後必須重新計算 dataQuality，避免錯誤 confirmed 被沿用。
      finalGame = {
        ...finalGame,
        dataQuality: {
          ...buildDataQuality(finalGame),
          flags: recentFinalGuard ? ["recentFinalGuard"] : [],
          warnings: recentFinalGuard
            ? ["近期 FINAL 場次：已強制使用 stats fallback 交叉驗證。"]
            : []
        }
      };

      finalGame = applyManualOverride(finalGame, manualOverrides);

      updatedMap.set(gameSno, finalGame);
      updatedCount++;

      if (finalGame.debug?.finalDuplicateGuard?.actions?.length) {
        console.log(`🧯 ${gameSno}: duplicateTeam guard 已啟動`);
        finalGame.debug.finalDuplicateGuard.actions.forEach(action => {
          console.log(`   ↳ ${action}`);
        });
      }

      const batterCount =
        (finalGame.batters?.away?.length || 0) +
        (finalGame.batters?.home?.length || 0);

      const pitcherCount =
        (finalGame.pitchers?.away?.length || 0) +
        (finalGame.pitchers?.home?.length || 0);

      const inningCount =
        Math.max(
          finalGame.lineScore?.away?.length || 0,
          finalGame.lineScore?.home?.length || 0
        );

      await writeJsonFile(
        path.join(DEBUG_DETAILS_DIR, `final-detail-${gameSno}.json`),
        detailBundle
      );

      await writeJsonFile(
        path.join(DEBUG_DETAILS_DIR, `final-merged-${gameSno}.json`),
        finalGame
      );

      console.log(`✅ ${gameSno}: boxscore detail 可用｜status=比賽結束`);
      console.log(
        `✅ ${gameSno}: ${finalGame.meta.away} ${finalGame.totals?.away?.R ?? "—"} : ` +
        `${finalGame.totals?.home?.R ?? "—"} ${finalGame.meta.home}｜FINAL`
      );

      console.log(
        `   RHE 客=${finalGame.totals?.away?.R ?? "—"}/${finalGame.totals?.away?.H ?? "—"}/${finalGame.totals?.away?.E ?? "—"} ` +
        `主=${finalGame.totals?.home?.R ?? "—"}/${finalGame.totals?.home?.H ?? "—"}/${finalGame.totals?.home?.E ?? "—"}`
      );

      console.log(
        `   打者：${batterCount} 人｜投手：${pitcherCount} 人｜逐局：${inningCount ? inningCount + "局" : "—"}`
      );

      console.log(
        `   勝投=${finalGame.meta.win || "—"}｜` +
        `敗投=${finalGame.meta.lose || "—"}｜` +
        `救援=${finalGame.meta.save || "—"}｜` +
        `MVP=${finalGame.meta.mvp || "—"}`
      );

      console.log(
        `   dataQuality：比分=${finalGame.dataQuality?.score}｜RHE=${finalGame.dataQuality?.rhe}｜` +
        `逐局=${finalGame.dataQuality?.lineScore}｜打者=${finalGame.dataQuality?.batters}｜` +
        `投手=${finalGame.dataQuality?.pitchers}｜結果=${finalGame.dataQuality?.result}`
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

    await writeJsonFileWithBackup(LIVE_BOX_FILE, result, "final");

    console.log("");
    console.log("💾 FINAL 更新完成");
    console.log("本次更新 FINAL 場次：", updatedCount);
    console.log("跳過 / 尚未確認 FINAL：", skippedCount);
    console.log("共保留場次：", result.length);
    console.log("輸出：data/live/live-boxscore.json");
    console.log("");
    console.log("🧪 Debug 檔案：");
    console.log("debug/final/final-schedule-api-debug.json");
    console.log("debug/final/details/final-detail-{gameSno}.json");
    console.log("debug/final/details/final-merged-{gameSno}.json");
    console.log("debug/final/pages/boxscore-{gameSno}-{mode}.html");
    console.log("debug/final/pages/boxscore-{gameSno}-{mode}.txt");

  } catch (err) {
    await safeCloseBrowser(browser);
    throw err;
  }
}

main().catch(err => {
  console.error("❌ FINAL 更新失敗：", err);
  process.exit(1);
});