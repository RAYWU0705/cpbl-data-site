import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SEASON_YEAR = 2026;
const KIND_CODE = "A";

const TEAM_NAMES = [
  "中信兄弟",
  "統一7-ELEVEn獅",
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

const BAD_LIVE_PLAYER_WORDS = [
  "比賽中",
  "LIVE",
  "進行中",
  "比賽尚未開始",
  "比賽結束",
  "FINAL",
  "S",
  "B",
  "O",
  "出局",
  "一壘",
  "二壘",
  "三壘",
  "全打",
  "三振",
  "查詢",
  "文字轉播",
  "成績看板",
  "精彩影片",
  "賽程",
  "球隊戰績",
  "數據統計",
  "球員",
  "Box Score",
  "BOX SCORE",
  "CPBLTV",
  ...VENUES
];

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "../data/live/live-boxscore.json");
const PROBABLE_FILE = path.join(__dirname, "../data/live/probable-pitchers.json");

const DEBUG_DIR = path.join(__dirname, "../debug/live-detail");
const SCHEDULE_DEBUG_FILE = path.join(DEBUG_DIR, "schedule-api-debug.json");
const SCHEDULE_DOM_DEBUG_FILE = path.join(DEBUG_DIR, "schedule-dom-debug.json");
const HOME_LIVE_DEBUG_FILE = path.join(DEBUG_DIR, "home-live-cards-debug.json");
const HOME_PROBABLE_DEBUG_FILE = path.join(DEBUG_DIR, "home-probable-debug.json");

/* =========================
   基礎工具
========================= */

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

function cleanText(v) {
  return String(v || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escReg(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const [y, m, d] = raw.slice(0, 10).split("-");
    return `${y}-${pad2(m)}-${pad2(d)}`;
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

function toArray(data) {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    return Object.values(data);
  }

  return [];
}

function normalizeGameSno(text) {
  if (!text) return null;

  const n = Number(String(text).replace(/^0+/, ""));

  return Number.isFinite(n) ? n : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function buildOfficialUrl(gameSno) {
  return `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`;
}

function buildUrls(gameSno) {
  return [
    {
      mode: "normal",
      url: buildOfficialUrl(gameSno)
    },
    {
      mode: "presentStatus0",
      url: `https://www.cpbl.com.tw/box?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}&presentStatus=0`
    },
    {
      mode: "presentStatus1",
      url: `https://www.cpbl.com.tw/box?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}&presentStatus=1`
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

function getStatusFromText(text) {
  const s = String(text || "");

  if (s.includes("延賽")) return "postponed";
  if (s.includes("保留")) return "suspended";
  if (s.includes("取消")) return "cancelled";

  if (s.includes("比賽中")) return "live";
  if (s.includes("進行中")) return "live";
  if (s.includes("LIVE")) return "live";

  if (s.includes("比賽結束")) return "final";
  if (s.includes("比賽終了")) return "final";
  if (s.includes("FINAL")) return "final";

  if (s.includes("比賽尚未開始")) return "scheduled";
  if (s.includes("未開賽")) return "scheduled";
  if (s.includes("未開打")) return "scheduled";

  return "scheduled";
}

function getStatusText(status) {
  if (status === "live") return "LIVE";
  if (status === "final") return "比賽結束";
  if (status === "postponed") return "延賽";
  if (status === "suspended") return "保留比賽";
  if (status === "cancelled") return "取消";

  return "比賽尚未開始";
}

function normalizeScheduleStatus(raw = {}) {
  const statusText = cleanText(
    raw.GameStatusChi ||
    raw.GameStatusName ||
    raw.StatusText ||
    raw.GameStatusText ||
    raw.Status ||
    raw.PresentStatusChi ||
    ""
  );

  if (statusText) {
    return getStatusFromText(statusText);
  }

  const presentStatus = String(raw.PresentStatus ?? raw.presentStatus ?? "");

  if (presentStatus === "1" || presentStatus === "2") {
    const homeScore = pickNumber(raw, [
      "HomeScore",
      "HomeTeamScore",
      "HomePoint",
      "HomeRuns",
      "HomeR"
    ]);

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
      "AwayR"
    ]);

    const date = pickGameDate(raw);
    const time = pickGameTime(raw);

    const isZeroZero =
      Number(homeScore) === 0 &&
      Number(awayScore) === 0;

    if (isZeroZero && !isAfterGameStart(date, time)) {
      return "scheduled";
    }

    if (homeScore !== null || awayScore !== null) {
      return "live";
    }
  }

  if (presentStatus === "3" || presentStatus === "4") return "final";

  return "scheduled";
}

function isClearlyFinalText(text = "") {
  const s = String(text || "");

  return (
    s.includes("比賽結束") ||
    s.includes("比賽終了") ||
    s.includes("FINAL")
  );
}

function hasRealDecisionText(text = "") {
  const s = String(text || "");

  return (
    /勝投[:：]\s*[^\s]+/.test(s) ||
    /敗投[:：]\s*[^\s]+/.test(s) ||
    /救援成功[:：]\s*[^\s]+/.test(s) ||
    /救援[:：]\s*[^\s]+/.test(s) ||
    /MVP[:：]\s*[^\s]+/.test(s)
  );
}

function parseDecisionLine(line = "") {
  const result = {
    win: null,
    lose: null,
    save: null,
    mvp: null
  };

  if (!line) return result;

  const winMatch = line.match(/勝投[:：]\s*([^\s]+)/);
  const loseMatch = line.match(/敗投[:：]\s*([^\s]+)/);

  const saveMatch =
    line.match(/救援成功[:：]\s*([^\s]+)/) ||
    line.match(/救援[:：]\s*([^\s]+)/);

  const mvpMatch = line.match(/MVP[:：]\s*(.+)$/i);

  result.win = winMatch?.[1] || null;
  result.lose = loseMatch?.[1] || null;
  result.save = saveMatch?.[1] || null;
  result.mvp = mvpMatch?.[1]?.trim() || null;

  return result;
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
    return cleanText(
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

  return cleanText(
    pick(raw, [
      "HomeTeamName",
      "HomeName",
      "HomeTeam"
    ])
  );
}

function pickVenue(raw) {
  const venue = cleanText(
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

  const fieldCode = cleanText(
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
  const dateTime = cleanText(
    pick(raw, [
      "GameDateTimeS",
      "GameDate",
      "Date",
      "GameDateS"
    ])
  );

  return fixDate(dateTime);
}
function pickGameTime(raw) {
  const dateTime = cleanText(
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

  return cleanText(
    pick(raw, [
      "GameTime",
      "Time",
      "StartTime",
      "GameStartTime",
      "StartTimeS"
    ])
  );
}

function parseInningScoreValue(value) {
  if (value === null || value === undefined || value === "") return null;

  const s = String(value).trim();

  if (!s || s === "—" || s === "-" || s.toUpperCase() === "X") {
    return null;
  }

  const n = Number(s);

  return Number.isFinite(n) ? n : null;
}

function normalizeInningArray(value) {
  if (Array.isArray(value)) {
    return value
      .map(parseInningScoreValue)
      .filter(v => v !== null);
  }

  if (typeof value === "string") {
    const s = value.trim();

    if (!s) return [];

    return s
      .split(/[,，\s|/]+/)
      .map(parseInningScoreValue)
      .filter(v => v !== null);
  }

  return [];
}

function pickInningArray(raw, keys) {
  for (const key of keys) {
    const arr = normalizeInningArray(raw?.[key]);

    if (arr.length) return arr;
  }

  return [];
}

function parseLineScoreFromObjectList(list) {
  if (!Array.isArray(list) || !list.length) {
    return {
      away: [],
      home: []
    };
  }

  const away = [];
  const home = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;

    const inning =
      Number(
        item.Inning ||
        item.InningSeq ||
        item.InningNo ||
        item.No ||
        item.Seq ||
        0
      );

    if (!inning) continue;

    const idx = inning - 1;

    const awayVal = pickNumber(item, [
      "VisitingScore",
      "VisitScore",
      "AwayScore",
      "GuestScore",
      "VisitingTeamScore",
      "AwayTeamScore",
      "TopScore",
      "TScore"
    ]);

    const homeVal = pickNumber(item, [
      "HomeScore",
      "HomeTeamScore",
      "BottomScore",
      "BScore"
    ]);

    if (awayVal !== null) away[idx] = awayVal;
    if (homeVal !== null) home[idx] = homeVal;
  }

  return {
    away: away.filter(v => v !== undefined && v !== null),
    home: home.filter(v => v !== undefined && v !== null)
  };
}

function parseLineScoreFromDirectKeys(raw, side) {
  const result = [];

  const prefixes =
    side === "away"
      ? [
          "VisitingScore",
          "VisitScore",
          "AwayScore",
          "GuestScore",
          "VScore",
          "AScore"
        ]
      : [
          "HomeScore",
          "HScore"
        ];

  for (let i = 1; i <= 15; i++) {
    let found = null;

    for (const prefix of prefixes) {
      const keys = [
        `${prefix}${i}`,
        `${prefix}_${i}`,
        `${prefix}Inning${i}`,
        `${prefix}Inn${i}`,
        `${prefix}I${i}`
      ];

      for (const key of keys) {
        if (raw?.[key] !== undefined && raw?.[key] !== null && raw?.[key] !== "") {
          found = parseInningScoreValue(raw[key]);
          break;
        }
      }

      if (found !== null) break;
    }

    if (found !== null) {
      result.push(found);
    }
  }

  return result;
}

function parseLineScoreFromScheduleRaw(raw = {}) {
  const directAway = pickInningArray(raw, [
    "VisitingScoreByInning",
    "VisitingScoresByInning",
    "VisitScoreByInning",
    "AwayScoreByInning",
    "AwayScoresByInning",
    "GuestScoreByInning",
    "VisitingInningScore",
    "AwayInningScore",
    "VScoreList",
    "AwayScoreList"
  ]);

  const directHome = pickInningArray(raw, [
    "HomeScoreByInning",
    "HomeScoresByInning",
    "HomeInningScore",
    "HScoreList",
    "HomeScoreList"
  ]);

  if (directAway.length || directHome.length) {
    return {
      away: directAway,
      home: directHome
    };
  }

  const list =
    raw.GameScoreDatas ||
    raw.ScoreDatas ||
    raw.LineScore ||
    raw.LineScores ||
    raw.InningScores ||
    raw.Innings ||
    raw.ScoreByInning ||
    [];

  const fromList = parseLineScoreFromObjectList(list);

  if (fromList.away.length || fromList.home.length) {
    return fromList;
  }

  const fromKeys = {
    away: parseLineScoreFromDirectKeys(raw, "away"),
    home: parseLineScoreFromDirectKeys(raw, "home")
  };

  if (fromKeys.away.length || fromKeys.home.length) {
    return fromKeys;
  }

  return {
    away: [],
    home: []
  };
}

function hasAnyLineScore(lineScore = {}) {
  return (
    Array.isArray(lineScore.away) &&
    lineScore.away.length > 0
  ) || (
    Array.isArray(lineScore.home) &&
    lineScore.home.length > 0
  );
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

function sanitizeLiveState(liveState) {
  if (!liveState || typeof liveState !== "object") return null;

  const cleanPlayer = value => {
    const s = String(value || "").trim();

    if (!s) return "";

    if (BAD_LIVE_PLAYER_WORDS.includes(s)) return "";
    if (TEAM_NAMES.some(team => s.includes(team))) return "";
    if (VENUES.some(venue => s.includes(venue))) return "";

    if (
      /比賽|LIVE|進行中|局|壘|球|出局|安打|得分|打點|防禦率|投球局數|打數|成績|看板|精彩|影片|賽程|球場|場地/.test(s)
    ) {
      return "";
    }

    if (/^\d+$/.test(s)) return "";
    if (/^\d+\s*:\s*\d+$/.test(s)) return "";
    if (/^\d{1,2}:\d{2}$/.test(s)) return "";
    if (s.length < 2 || s.length > 12) return "";

    return s;
  };

  return {
    ...liveState,
    batter: cleanPlayer(liveState.batter),
    pitcher: cleanPlayer(liveState.pitcher),
    inningText: liveState.inningText || "比賽中"
  };
}

function buildPregameFromMeta(meta = {}, oldPregame = null) {
  const old =
    oldPregame && typeof oldPregame === "object"
      ? oldPregame
      : {};

  const oldStarters = old.starters || {};
  const oldLineups = old.lineups || {};
  const metaStarters = meta.starters || {};
  const metaLineups = meta.lineups || {};

  const awayStarter =
    meta.awayStarter ||
    metaStarters.away ||
    oldStarters.away ||
    "";

  const homeStarter =
    meta.homeStarter ||
    metaStarters.home ||
    oldStarters.home ||
    "";

  const awayLineup =
    Array.isArray(metaLineups.away) && metaLineups.away.length
      ? metaLineups.away
      : Array.isArray(oldLineups.away)
        ? oldLineups.away
        : [];

  const homeLineup =
    Array.isArray(metaLineups.home) && metaLineups.home.length
      ? metaLineups.home
      : Array.isArray(oldLineups.home)
        ? oldLineups.home
        : [];

  if (
    !awayStarter &&
    !homeStarter &&
    !awayLineup.length &&
    !homeLineup.length
  ) {
    return oldPregame || null;
  }

  return {
    ...old,
    starters: {
      away: awayStarter || "",
      home: homeStarter || ""
    },
    lineups: {
      away: awayLineup,
      home: homeLineup
    }
  };
}

function buildScheduleLiveState(game) {
  const meta = game?.meta || {};

  return {
    source: "schedule-api-fallback",
    inningText: "比賽中",
    half: "",
    battingTeam: "",
    fieldingTeam: "",
    batter: "",
    pitcher: "",
    pitchCount: null,
    balls: null,
    strikes: null,
    outs: null,
    bases: {
      first: false,
      second: false,
      third: false
    },
    debug: {
      note: "boxscore detail 尚未可用，暫時使用官方 schedule/getgamedatas LIVE 比分資料。",
      gameSno: game?.gameSno ?? null,
      away: meta.away || "",
      home: meta.home || "",
      awayScore: game?.totals?.away?.R ?? null,
      homeScore: game?.totals?.home?.R ?? null
    }
  };
}
function hasRealLiveState(liveState) {
  if (!liveState || typeof liveState !== "object") return false;

  return Boolean(
    liveState.batter ||
    liveState.pitcher ||
    liveState.pitchCount ||
    liveState.balls !== null && liveState.balls !== undefined ||
    liveState.strikes !== null && liveState.strikes !== undefined ||
    liveState.outs !== null && liveState.outs !== undefined ||
    liveState.inningText && liveState.inningText !== "比賽中"
  );
}

function isAfterGameStart(dateText, timeText) {
  if (!dateText || !timeText) return false;

  const date = String(dateText).trim();
  const time = String(timeText).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (!/^\d{1,2}:\d{2}$/.test(time)) return false;

  const [hour, minute] = time.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;

  const start = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);
  const now = new Date();

  return now.getTime() >= start.getTime();
}

function shouldForceScheduledBeforeStart(game) {
  if (!game || typeof game !== "object") return false;

  const meta = game.meta || {};
  const totals = game.totals || {};
  const lineScore = game.lineScore || {};
  const batters = game.batters || {};
  const pitchers = game.pitchers || {};

  const isScheduledLike =
    meta.status === "scheduled" ||
    meta.statusText === "比賽尚未開始" ||
    meta.statusText === "未開賽" ||
    meta.statusText === "未開打";

  const isLiveLike =
    meta.status === "live" ||
    meta.statusText === "LIVE" ||
    meta.statusText === "比賽中" ||
    meta.statusText === "進行中";

  if (!isLiveLike && !isScheduledLike) return false;

  const awayR = totals.away?.R;
  const homeR = totals.home?.R;

  const scoreIsZeroZero =
    Number(awayR) === 0 &&
    Number(homeR) === 0;

  const hasLineScore =
    hasAnyLineScore(lineScore);

  const hasBatters =
    (Array.isArray(batters.away) && batters.away.length > 0) ||
    (Array.isArray(batters.home) && batters.home.length > 0);

  const hasPitchers =
    (Array.isArray(pitchers.away) && pitchers.away.length > 0) ||
    (Array.isArray(pitchers.home) && pitchers.home.length > 0);

  const hasLive =
    hasRealLiveState(game.liveState);

  const alreadyStarted =
    isAfterGameStart(meta.date, meta.time);

  return (
    !alreadyStarted &&
    scoreIsZeroZero &&
    !hasLineScore &&
    !hasBatters &&
    !hasPitchers &&
    !hasLive
  );
}
function ensureVisibleLiveGame(game) {
  if (!game || typeof game !== "object") return game;

  const meta = game.meta || {};
  const totals = game.totals || {};

  const isLive =
    meta.status === "live" ||
    meta.statusText === "LIVE" ||
    meta.statusText === "比賽中" ||
    meta.statusText === "進行中";

  if (!isLive) return game;

  game.meta = {
    ...meta,
    status: "live",
    statusText: "LIVE"
  };

  if (!game.lineScore) {
    game.lineScore = {
      away: [],
      home: []
    };
  }

  if (!game.totals) {
    game.totals = {
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

  if (!game.batters) {
    game.batters = {
      away: [],
      home: []
    };
  }

  if (!game.pitchers) {
    game.pitchers = {
      away: [],
      home: []
    };
  }

  if (typeof totals.away?.R === "number") {
    game.totals.away.R = totals.away.R;
  }

  if (typeof totals.home?.R === "number") {
    game.totals.home.R = totals.home.R;
  }

  game.liveState = sanitizeLiveState(game.liveState);

  const hasLiveState =
    game.liveState &&
    typeof game.liveState === "object" &&
    (
      game.liveState.inningText ||
      game.liveState.batter ||
      game.liveState.pitcher ||
      game.liveState.source
    );

  if (!hasLiveState) {
    game.liveState = buildScheduleLiveState(game);
  }

  game.liveState = sanitizeLiveState(game.liveState);

  return game;
}

function mergeHomeLiveCardIntoGame(game, liveCard) {
  if (!game || !liveCard) return game;

  const oldMeta = game.meta || {};

  const hasLiveScore =
    typeof liveCard.awayScore === "number" &&
    typeof liveCard.homeScore === "number";

  const merged = {
    ...game,

    meta: {
      ...oldMeta,
      away: oldMeta.away || liveCard.away || "",
      home: oldMeta.home || liveCard.home || "",
      status: "live",
      statusText: "LIVE"
    },

    totals: hasLiveScore
      ? {
          away: {
            R: liveCard.awayScore,
            H: game.totals?.away?.H ?? null,
            E: game.totals?.away?.E ?? null
          },
          home: {
            R: liveCard.homeScore,
            H: game.totals?.home?.H ?? null,
            E: game.totals?.home?.E ?? null
          }
        }
      : game.totals,

    liveState:
      sanitizeLiveState(liveCard.liveState) ||
      sanitizeLiveState(game.liveState) ||
      null
  };

  return ensureVisibleLiveGame(merged);
}

/* =========================
   檔案
========================= */

async function readExistingGames() {
  try {
    const text = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(text);

    return toArray(data);
  } catch {
    return [];
  }
}

async function writeGames(games) {
  await fs.mkdir(path.dirname(DATA_FILE), {
    recursive: true
  });

  await fs.writeFile(
    DATA_FILE,
    JSON.stringify(games, null, 2),
    "utf-8"
  );
}

async function writeProbablePitchers(games = []) {
  if (!Array.isArray(games) || !games.length) {
    console.log("⚠️ 本次沒有抓到預告先發，保留舊 probable-pitchers.json，不覆蓋。");
    return;
  }

  const result = {};

  for (const game of games) {
    const gameSno = Number(game.gameSno);

    if (!gameSno) continue;

    const awayStarter =
      game.awayStarter ||
      game.starters?.away ||
      game.pregame?.starters?.away ||
      game.raw?.pregame?.starters?.away ||
      "";

    const homeStarter =
      game.homeStarter ||
      game.starters?.home ||
      game.pregame?.starters?.home ||
      game.raw?.pregame?.starters?.home ||
      "";

    if (!awayStarter && !homeStarter) continue;

    result[String(gameSno)] = {
      away: awayStarter || null,
      home: homeStarter || null
    };
  }

  if (!Object.keys(result).length) {
    console.log("⚠️ 本次沒有有效預告先發，保留舊 probable-pitchers.json，不覆蓋。");
    return;
  }

  await fs.mkdir(path.dirname(PROBABLE_FILE), {
    recursive: true
  });

  await fs.writeFile(
    PROBABLE_FILE,
    JSON.stringify(result, null, 2),
    "utf-8"
  );

  console.log(
    `🎯 預告先發輸出：${Object.keys(result).length} 場 → data/live/probable-pitchers.json`
  );
}

async function saveDebug(gameSno, detail) {
  await fs.mkdir(DEBUG_DIR, {
    recursive: true
  });

  await fs.writeFile(
    path.join(DEBUG_DIR, `live-detail-${gameSno}.json`),
    JSON.stringify(detail || {}, null, 2),
    "utf-8"
  );
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
   schedule/getgamedatas API
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
  }

  return rawList;
}

function normalizeScheduleApiGame(raw) {
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

  const lineScore = parseLineScoreFromScheduleRaw(raw);

  const awayH = pickNumber(raw, [
    "VisitingH",
    "VisitH",
    "AwayH",
    "VisitingHits",
    "AwayHits",
    "VisitingTeamH",
    "AwayTeamH"
  ]);

  const homeH = pickNumber(raw, [
    "HomeH",
    "HomeHits",
    "HomeTeamH"
  ]);

  const awayE = pickNumber(raw, [
    "VisitingE",
    "VisitE",
    "AwayE",
    "VisitingErrors",
    "AwayErrors",
    "VisitingTeamE",
    "AwayTeamE"
  ]);

  const homeE = pickNumber(raw, [
    "HomeE",
    "HomeErrors",
    "HomeTeamE"
  ]);

  const status = normalizeScheduleStatus(raw);
  const statusText = getStatusText(status);

  return {
    gameSno,
    date,
    away,
    home,
    venue,
    time,
    duration: cleanText(
      pick(raw, [
        "GameDuringTime",
        "DuringTime",
        "Duration",
        "GameTimeLong"
      ])
    ),
    statusText,
    awayScore,
    homeScore,
    awayH,
    homeH,
    awayE,
    homeE,
    lineScore,
    decisionLine: cleanText(
      pick(raw, [
        "Decision",
        "DecisionLine",
        "Record",
        "GameNote",
        "Note"
      ])
    ),
    awayStarter: cleanText(
      pick(raw, [
        "VisitingStartingPitcher",
        "VisitingStarter",
        "AwayStartingPitcher",
        "AwayStarter"
      ])
    ),
    homeStarter: cleanText(
      pick(raw, [
        "HomeStartingPitcher",
        "HomeStarter"
      ])
    ),
    starters: {
      away: "",
      home: ""
    },
    lineups: {
      away: [],
      home: []
    },
    raw
  };
}

async function discoverTodayGamesFromScheduleApi(browser, today) {
  console.log("🔎 從官方 schedule/getgamedatas API 尋找今天全部場次...");

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
        sample: cleanText(text).slice(0, 1200)
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
    try {
      const directPayload = await page.evaluate(async () => {
        const res = await fetch("/schedule/getgamedatas", {
          method: "GET",
          credentials: "include"
        });

        return await res.json();
      });

      captured.push({
        url: "page-fetch:/schedule/getgamedatas",
        payload: directPayload,
        sample: JSON.stringify(directPayload).slice(0, 1200)
      });
    } catch (err) {
      captured.push({
        url: "page-fetch:/schedule/getgamedatas",
        error: err.message
      });
    }
  }

  await safeClosePage(page);

  const rawGames = [];

  for (const item of captured) {
    const list = parseGameDatasPayload(item.payload);
    rawGames.push(...list);
  }

  const normalized = rawGames
    .map(normalizeScheduleApiGame)
    .filter(Boolean);

  const todayGames = normalized
    .filter(game => game.date === today)
    .sort((a, b) => Number(a.gameSno) - Number(b.gameSno));

  await fs.mkdir(DEBUG_DIR, {
    recursive: true
  });

  await fs.writeFile(
    SCHEDULE_DEBUG_FILE,
    JSON.stringify({
      today,
      capturedCount: captured.length,
      rawCount: rawGames.length,
      normalizedCount: normalized.length,
      todayCount: todayGames.length,
      captured: captured.map(item => ({
        url: item.url,
        error: item.error || null,
        sample: item.sample || ""
      })),
      todayGames,
      normalizedSample: normalized.slice(0, 20)
    }, null, 2),
    "utf-8"
  );

  todayGames.forEach(g => {
    const inningCount =
      Math.max(
        g.lineScore?.away?.length || 0,
        g.lineScore?.home?.length || 0
      );

    console.log(
      `✅ API 今日場次 ${g.gameSno}: ${g.away || "?"} vs ${g.home || "?"} ` +
      `${g.venue || ""} ${g.time || ""} ${g.statusText}` +
      `｜比分:${g.awayScore ?? "—"}:${g.homeScore ?? "—"}` +
      `｜逐局:${inningCount ? inningCount + "局" : "—"}`
    );
  });

  return todayGames;
}

/* =========================
   DOM fallback
========================= */

async function discoverTodayGamesFromDom(browser, today) {
  console.log("🔎 API 不足，改用官方賽程頁 DOM fallback...");

  const page = await setupPage(browser);

  await page.goto(`https://www.cpbl.com.tw/schedule?year=${SEASON_YEAR}`, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(3500);

  const payload = await page.evaluate((TEAM_NAMES_IN_PAGE, VENUES_IN_PAGE, todayInPage) => {
    function cleanTextInPage(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function escRegInPage(text) {
      return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function normalizeStatusTextInPage(raw = "") {
      const s = String(raw || "");

      if (s.includes("延賽")) return "延賽";
      if (s.includes("保留")) return "保留比賽";
      if (s.includes("取消")) return "取消";

      if (s.includes("比賽中") || s.includes("進行中") || s.includes("LIVE")) {
        return "LIVE";
      }

      if (s.includes("比賽結束") || s.includes("比賽終了") || s.includes("FINAL")) {
        return "比賽結束";
      }

      return "比賽尚未開始";
    }

    function getTodayBlockFromBody() {
      const bodyText = cleanTextInPage(document.body?.innerText || "");
      const [, , dd] = todayInPage.split("-").map(Number);

      const dayMarker = new RegExp(`(?:^|\\s)${dd}\\s+`);
      const nextDayMarker = new RegExp(`\\s${dd + 1}\\s+`);

      const startMatch = bodyText.match(dayMarker);

      if (!startMatch || startMatch.index == null) {
        return "";
      }

      const startIndex = startMatch.index + startMatch[0].length;
      const afterToday = bodyText.slice(startIndex);
      const nextMatch = afterToday.match(nextDayMarker);

      return nextMatch && nextMatch.index != null
        ? afterToday.slice(0, nextMatch.index)
        : afterToday.slice(0, 2500);
    }

    function discoverByFlatMonthText() {
      const todayBlock = getTodayBlockFromBody();

      if (!todayBlock) return [];

      const teamPattern = TEAM_NAMES_IN_PAGE.map(escRegInPage).join("|");
      const venuePattern = VENUES_IN_PAGE.map(escRegInPage).join("|");

      const result = [];

      const scheduledRegex = new RegExp(
        `(${venuePattern})\\s+(\\d{1,3})\\s+(${teamPattern})\\s+VS\\.?\\s+(${teamPattern})\\s+(\\d{1,2}:\\d{2})`,
        "g"
      );

      const liveScoreRegex = new RegExp(
        `(${venuePattern})\\s+(\\d{1,3})\\s+(${teamPattern})\\s+(\\d+)\\s*[:：]\\s*(\\d+)\\s+(${teamPattern})\\s+(比賽中|進行中|LIVE|比賽結束|比賽終了|FINAL)`,
        "g"
      );

      let match;

      while ((match = scheduledRegex.exec(todayBlock)) !== null) {
        result.push({
          gameSno: Number(match[2]),
          date: todayInPage.replaceAll("-", "/"),
          away: match[3],
          home: match[4],
          venue: match[1],
          time: match[5],
          duration: "",
          statusText: "比賽尚未開始",
          awayScore: null,
          homeScore: null,
          decisionLine: "",
          awayStarter: "",
          homeStarter: "",
          starters: {
            away: "",
            home: ""
          },
          lineups: {
            away: [],
            home: []
          }
        });
      }

      while ((match = liveScoreRegex.exec(todayBlock)) !== null) {
        const gameSno = Number(match[2]);

        if (result.some(g => Number(g.gameSno) === gameSno)) continue;

        result.push({
          gameSno,
          date: todayInPage.replaceAll("-", "/"),
          away: match[3],
          home: match[6],
          venue: match[1],
          time: "",
          duration: "",
          statusText: normalizeStatusTextInPage(match[7]),
          awayScore: Number(match[4]),
          homeScore: Number(match[5]),
          decisionLine: match[7],
          awayStarter: "",
          homeStarter: "",
          starters: {
            away: "",
            home: ""
          },
          lineups: {
            away: [],
            home: []
          }
        });
      }

      return result.sort((a, b) => a.gameSno - b.gameSno);
    }

    const games = discoverByFlatMonthText();

    return {
      games,
      debug: {
        todayBlock: getTodayBlockFromBody(),
        bodySample: cleanTextInPage(document.body?.innerText || "").slice(0, 6000)
      }
    };
  }, TEAM_NAMES, VENUES, today);

  await safeClosePage(page);

  await fs.mkdir(DEBUG_DIR, {
    recursive: true
  });

  await fs.writeFile(
    SCHEDULE_DOM_DEBUG_FILE,
    JSON.stringify(payload.debug || {}, null, 2),
    "utf-8"
  );

  const games = Array.isArray(payload.games)
    ? payload.games
    : [];

  games.forEach(g => {
    console.log(
      `✅ DOM 今日場次 ${g.gameSno}: ${g.away} vs ${g.home} ` +
      `${g.venue || ""} ${g.time || ""} ${g.statusText}` +
      `｜比分:${g.awayScore ?? "—"}:${g.homeScore ?? "—"}`
    );
  });

  return games;
}

async function discoverTodayGames(browser, today) {
  const apiGames = await discoverTodayGamesFromScheduleApi(browser, today);

  if (apiGames.length) {
    return apiGames;
  }

  return await discoverTodayGamesFromDom(browser, today);
}

/* =========================
   官方首頁 LIVE 卡
========================= */

async function discoverHomeLiveCards(browser) {
  console.log("🔴 從官方首頁抓 LIVE 卡...");

  const page = await setupPage(browser);
  const url = "https://www.cpbl.com.tw/";

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(3500);

  const payload = await page.evaluate((TEAM_NAMES_IN_PAGE, VENUES_IN_PAGE) => {
    function cleanTextInPage(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function isPlayerName(text) {
      const s = cleanTextInPage(text);

      if (!s) return false;
      if (TEAM_NAMES_IN_PAGE.some(team => s.includes(team))) return false;
      if (VENUES_IN_PAGE.some(venue => s.includes(venue))) return false;

      const banned = [
        "比賽中",
        "LIVE",
        "進行中",
        "BATTER",
        "PITCHER",
        "BOX SCORE",
        "Box Score",
        "CPBLTV",
        "WINS",
        "LOSES",
        "SAVES",
        "TIE",
        "賽程",
        "成績看板",
        "球隊戰績"
      ];

      if (banned.some(k => s.includes(k))) return false;
      if (/^\d+$/.test(s)) return false;
      if (/^\d+\s*:\s*\d+$/.test(s)) return false;
      if (/^\d+-\d+(-\d+)?$/.test(s)) return false;
      if (/^\d{1,2}:\d{2}$/.test(s)) return false;
      if (s.length < 2 || s.length > 12) return false;

      return /^[\u4e00-\u9fa5A-Za-z·．・]+$/.test(s);
    }

    function parseCard(el) {
      const text = cleanTextInPage(el.innerText || el.textContent || "");

      const hasLive =
        text.includes("LIVE") ||
        text.includes("比賽中") ||
        text.includes("進行中");

      if (!hasLive) return null;

      const teams = TEAM_NAMES_IN_PAGE
        .filter(team => text.includes(team))
        .sort((a, b) => text.indexOf(a) - text.indexOf(b));

      if (teams.length < 2) return null;

      const nums = [...text.matchAll(/(^|\s)(\d{1,3})(\s|$)/g)]
        .map(m => Number(m[2]))
        .filter(n => n >= 1 && n <= 999);

      const gameSno = nums[0];

      if (!gameSno) return null;

      const scoreMatch = text.match(
        new RegExp(
          `${teams[0]}[\\s\\S]{0,120}?(\\d+)\\s*[:：]\\s*(\\d+)[\\s\\S]{0,120}?${teams[1]}`
        )
      );

      const awayScore = scoreMatch ? Number(scoreMatch[1]) : null;
      const homeScore = scoreMatch ? Number(scoreMatch[2]) : null;

      const lines = String(el.innerText || el.textContent || "")
        .split("\n")
        .map(cleanTextInPage)
        .filter(Boolean);

      let batter = "";
      let pitcher = "";

      const batterIndex = lines.findIndex(line =>
        line.toUpperCase() === "BATTER" ||
        line.includes("打者") ||
        line.includes("打擊")
      );

      const pitcherIndex = lines.findIndex(line =>
        line.toUpperCase() === "PITCHER" || line.includes("投手")
      );

      if (batterIndex >= 0) {
        for (let i = batterIndex + 1; i < Math.min(lines.length, batterIndex + 7); i++) {
          if (isPlayerName(lines[i])) {
            batter = lines[i];
            break;
          }
        }
      }

      if (pitcherIndex >= 0) {
        for (let i = pitcherIndex + 1; i < Math.min(lines.length, pitcherIndex + 7); i++) {
          if (isPlayerName(lines[i])) {
            pitcher = lines[i];
            break;
          }
        }
      }

      const inningLine =
        lines.find(line => /\d+局[上下]/.test(line)) ||
        lines.find(line => /局[上下]/.test(line)) ||
        "";

      return {
        gameSno,
        away: teams[0],
        home: teams[1],
        statusText: "LIVE",
        awayScore,
        homeScore,
        liveState: {
          source: "official-home-live-card",
          inningText: inningLine || "比賽中",
          half: inningLine.includes("上")
            ? "top"
            : inningLine.includes("下")
              ? "bottom"
              : "",
          battingTeam: "",
          fieldingTeam: "",
          batter,
          pitcher,
          pitchCount: null,
          balls: null,
          strikes: null,
          outs: null,
          bases: {
            first: false,
            second: false,
            third: false
          },
          debug: {
            note: "官方首頁 LIVE 卡解析",
            lines: lines.slice(0, 80),
            text: text.slice(0, 1200)
          }
        },
        debugText: text.slice(0, 1500)
      };
    }

    const elements = Array.from(
      document.querySelectorAll("div, li, article, section")
    );

    const candidates = [];

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const text = cleanTextInPage(el.innerText || el.textContent || "");

      if (!text) continue;
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (!text.includes("LIVE") && !text.includes("比賽中") && !text.includes("進行中")) continue;
      if (!TEAM_NAMES_IN_PAGE.some(team => text.includes(team))) continue;

      const parsed = parseCard(el);

      if (!parsed) continue;

      candidates.push({
        ...parsed,
        textLength: text.length,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      });
    }

    candidates.sort((a, b) => {
      if (a.gameSno !== b.gameSno) return a.gameSno - b.gameSno;

      const aHasPlayer = a.liveState?.batter || a.liveState?.pitcher ? 1 : 0;
      const bHasPlayer = b.liveState?.batter || b.liveState?.pitcher ? 1 : 0;

      if (aHasPlayer !== bHasPlayer) return bHasPlayer - aHasPlayer;

      return a.textLength - b.textLength;
    });

    const map = new Map();

    for (const item of candidates) {
      if (!map.has(String(item.gameSno))) {
        map.set(String(item.gameSno), item);
      }
    }

    const games = [...map.values()]
      .sort((a, b) => Number(a.gameSno) - Number(b.gameSno));

    return {
      games,
      debug: {
        gameCount: games.length,
        candidateCount: candidates.length,
        candidates: candidates.slice(0, 30),
        bodySample: cleanTextInPage(document.body?.innerText || "").slice(0, 6000)
      }
    };
  }, TEAM_NAMES, VENUES);

  await fs.mkdir(DEBUG_DIR, {
    recursive: true
  });

  await fs.writeFile(
    HOME_LIVE_DEBUG_FILE,
    JSON.stringify(payload.debug || {}, null, 2),
    "utf-8"
  );

  await safeClosePage(page);

  const games = Array.isArray(payload.games)
    ? payload.games
    : [];

  games.forEach(g => {
    console.log(
      `🔴 首頁 LIVE ${g.gameSno}: ${g.away} ${g.awayScore ?? "—"} : ${g.homeScore ?? "—"} ${g.home}｜打者:${g.liveState?.batter || "—"}｜投手:${g.liveState?.pitcher || "—"}`
    );
  });

  return games;
}

/* =========================
   官方首頁預告先發
========================= */

async function discoverHomeProbables(browser) {
  console.log("🎯 從官方首頁抓預告先發...");

  const page = await setupPage(browser);

  await page.goto("https://www.cpbl.com.tw/", {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(3500);

  const payload = await page.evaluate((TEAM_NAMES_IN_PAGE) => {
    function cleanTextInPage(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function splitLines(text) {
      return String(text || "")
        .split("\n")
        .map(cleanTextInPage)
        .filter(Boolean);
    }

    function cleanStarterName(text) {
      let s = cleanTextInPage(text);

      if (!s) return "";

      s = s
        .replace("客場先發", "")
        .replace("主場先發", "")
        .replace(/^[:：\-\s]+/, "")
        .replace(/[，,。]+$/, "")
        .trim();

      if (!s) return "";
      if (TEAM_NAMES_IN_PAGE.includes(s)) return "";
      if (s.includes("售票")) return "";
      if (s.includes("更多")) return "";
      if (s.includes("VS")) return "";
      if (s.includes("LIVE")) return "";
      if (s.includes("English")) return "";
      if (/^\d{1,3}$/.test(s)) return "";
      if (/^\d{1,2}:\d{2}$/.test(s)) return "";
      if (/^\d+-\d+$/.test(s)) return "";

      for (const team of TEAM_NAMES_IN_PAGE) {
        if (s.startsWith(team)) {
          s = cleanTextInPage(s.slice(team.length));
        }
      }

      if (s.length < 2 || s.length > 12) return "";

      return s;
    }

    function extractStarter(lines, label) {
      const idx = lines.findIndex(line => line.includes(label));

      if (idx < 0) return "";

      const sameLine = cleanStarterName(lines[idx]);

      if (sameLine) return sameLine;

      for (let i = idx + 1; i < Math.min(lines.length, idx + 8); i++) {
        const candidate = cleanStarterName(lines[i]);

        if (candidate) return candidate;
      }

      return "";
    }

    function parseCard(el) {
      const text = cleanTextInPage(el.innerText || el.textContent || "");

      if (!text.includes("客場先發") && !text.includes("主場先發")) {
        return null;
      }

      const lines = splitLines(text);

      const gameSnoLine = lines.find(line => /^\d{1,3}$/.test(line));

      const gameSno =
        gameSnoLine ||
        text.match(/(^|\s)(\d{1,3})(\s|$)/)?.[2] ||
        "";

      if (!gameSno) return null;

      const awayStarter = extractStarter(lines, "客場先發");
      const homeStarter = extractStarter(lines, "主場先發");

      if (!awayStarter && !homeStarter) return null;

      return {
        gameSno: Number(gameSno),
        awayStarter,
        homeStarter,
        debugText: text.slice(0, 1000),
        debugLines: lines.slice(0, 80)
      };
    }

    const elements = Array.from(
      document.querySelectorAll("div, li, article, section")
    );

    const candidates = [];

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const text = cleanTextInPage(el.innerText || el.textContent || "");

      if (!text) continue;
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (!text.includes("客場先發") && !text.includes("主場先發")) continue;

      const parsed = parseCard(el);

      if (!parsed) continue;

      candidates.push({
        ...parsed,
        textLength: text.length
      });
    }

    candidates.sort((a, b) => a.textLength - b.textLength);

    const map = new Map();

    for (const item of candidates) {
      if (!map.has(String(item.gameSno))) {
        map.set(String(item.gameSno), item);
      }
    }

    const games = [...map.values()]
      .sort((a, b) => Number(a.gameSno) - Number(b.gameSno));

    return {
      games,
      debug: {
        gameCount: games.length,
        candidateCount: candidates.length,
        candidates: candidates.slice(0, 20),
        bodySample: cleanTextInPage(document.body?.innerText || "").slice(0, 5000)
      }
    };
  }, TEAM_NAMES);

  await fs.mkdir(DEBUG_DIR, {
    recursive: true
  });

  await fs.writeFile(
    HOME_PROBABLE_DEBUG_FILE,
    JSON.stringify(payload.debug || {}, null, 2),
    "utf-8"
  );

  await safeClosePage(page);

  const games = Array.isArray(payload.games)
    ? payload.games
    : [];

  games.forEach(g => {
    console.log(
      `🎯 首頁先發 ${g.gameSno}: ${g.awayStarter || "—"} vs ${g.homeStarter || "—"}`
    );
  });

  return games;
}

/* =========================
   boxscore detail
========================= */

async function revealPregameTables(page) {
  try {
    const urlBefore = page.url();

    const clickResult = await page.evaluate(async () => {
      function sleepInPage(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }

      function cleanTextInPage(v) {
        return String(v || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      const allowTexts = [
        "客隊",
        "主隊",
        "客場",
        "主場",
        "打者",
        "投手",
        "野手",
        "先發",
        "先發打序",
        "先發名單"
      ];

      const clicked = [];

      const clickable = Array.from(
        document.querySelectorAll('button, [role="tab"], [role="button"]')
      ).filter(el => {
        const text = cleanTextInPage(el.innerText || el.textContent || "");
        const rect = el.getBoundingClientRect();

        if (!text) return false;
        if (rect.width <= 0 || rect.height <= 0) return false;

        return allowTexts.some(t => text === t || text.includes(t));
      });

      for (const el of clickable.slice(0, 20)) {
        const text = cleanTextInPage(el.innerText || el.textContent || "");

        try {
          el.scrollIntoView({
            block: "center",
            inline: "center"
          });

          await sleepInPage(80);

          el.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window
            })
          );

          clicked.push(text.slice(0, 40));

          await sleepInPage(220);
        } catch {}
      }

      return clicked;
    });

    await sleep(600);

    const urlAfter = page.url();

    if (urlAfter !== urlBefore) {
      console.log(`⚠️ 展開賽前表格時發生跳頁，返回原頁：${urlBefore}`);

      await page.goto(urlBefore, {
        waitUntil: "networkidle2",
        timeout: 60000
      });

      await sleep(1200);
      return;
    }

    if (clickResult.length) {
      console.log(
        `🖱 已嘗試展開賽前表格：${clickResult.slice(0, 8).join(" / ")}`
      );
    }
  } catch (err) {
    console.log(`⚠️ 展開賽前表格略過：${err.message}`);
  }
}

async function parseOfficialLiveState(page) {
  try {
    const parsed = await page.evaluate((TEAM_NAMES_IN_PAGE, VENUES_IN_PAGE) => {
      function cleanTextInPage(v) {
        return String(v || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      function isPlayerLike(text) {
        if (!text) return false;

        const s = String(text || "").trim();

        if (!s) return false;

        const bannedExact = [
          "比賽中",
          "LIVE",
          "進行中",
          "比賽尚未開始",
          "比賽結束",
          "FINAL",
          "S",
          "B",
          "O",
          "出局",
          "一壘",
          "二壘",
          "三壘",
          "全打",
          "三振",
          "查詢",
          "文字轉播",
          "成績看板",
          "精彩影片",
          "賽程",
          "球隊戰績",
          "數據統計",
          "球員",
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

        if (bannedExact.includes(s)) return false;
        if (TEAM_NAMES_IN_PAGE.some(team => s.includes(team))) return false;
        if (VENUES_IN_PAGE.some(venue => s.includes(venue))) return false;

        if (/^\d+$/.test(s)) return false;
        if (/^\d+局[上下]$/.test(s)) return false;
        if (/PITCH\s*\d+/i.test(s)) return false;

        if (
          /比賽|LIVE|進行中|局|壘|球|出局|安打|得分|打點|防禦率|投球局數|打數|成績|看板|精彩|影片|賽程|球場|場地/.test(s)
        ) {
          return false;
        }

        if (s.length < 2 || s.length > 8) return false;

        return /^[\u4e00-\u9fa5A-Za-z·．・]+$/.test(s);
      }

      function parseCount(lines) {
        const joined = lines.join(" ");

        const bMatch =
          joined.match(/B\s*[:：]?\s*([0-3])/i) ||
          joined.match(/壞球\s*[:：]?\s*([0-3])/);

        const sMatch =
          joined.match(/S\s*[:：]?\s*([0-2])/i) ||
          joined.match(/好球\s*[:：]?\s*([0-2])/);

        const oMatch =
          joined.match(/O\s*[:：]?\s*([0-2])/i) ||
          joined.match(/出局\s*[:：]?\s*([0-2])/);

        return {
          balls: bMatch ? Number(bMatch[1]) : null,
          strikes: sMatch ? Number(sMatch[1]) : null,
          outs: oMatch ? Number(oMatch[1]) : null
        };
      }

      function parseBases(lines) {
        const joined = lines.join(" ");

        const first =
          /一壘.{0,6}(有人|跑者|ON|●|亮|occupied)/i.test(joined) ||
          /1B.{0,6}(ON|●|occupied)/i.test(joined);

        const second =
          /二壘.{0,6}(有人|跑者|ON|●|亮|occupied)/i.test(joined) ||
          /2B.{0,6}(ON|●|occupied)/i.test(joined);

        const third =
          /三壘.{0,6}(有人|跑者|ON|●|亮|occupied)/i.test(joined) ||
          /3B.{0,6}(ON|●|occupied)/i.test(joined);

        return {
          first,
          second,
          third
        };
      }

      const bodyText = document.body?.innerText || "";

      const lines = bodyText
        .split("\n")
        .map(cleanTextInPage)
        .filter(Boolean);

      const inningText =
        lines.find(line => /^\d+局[上下]$/.test(line)) ||
        lines.find(line => /\d+局[上下]/.test(line)) ||
        "";

      const half = inningText.includes("上")
        ? "top"
        : inningText.includes("下")
          ? "bottom"
          : "";

      const pitchLine = lines.find(line => /PITCH\s*\d+/i.test(line)) || "";
      const pitchCountMatch = pitchLine.match(/PITCH\s*(\d+)/i);
      const pitchCount = pitchCountMatch ? Number(pitchCountMatch[1]) : null;

      const panelItems = Array.from(
        document.querySelectorAll("div, span, p, strong, b")
      )
        .map(el => {
          const rect = el.getBoundingClientRect();

          return {
            text: cleanTextInPage(el.innerText),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            className: String(el.className || "")
          };
        })
        .filter(item => {
          if (!item.text) return false;
          if (item.width <= 0 || item.height <= 0) return false;
          if (item.x < window.innerWidth * 0.50) return false;
          if (item.y < 120 || item.y > 760) return false;

          return true;
        });

      const panelTextLines = panelItems
        .map(item => item.text)
        .filter(Boolean);

      const playerCandidates = panelItems
        .filter(item => isPlayerLike(item.text))
        .sort((a, b) => a.y - b.y)
        .map(item => item.text);

      let batter = "";
      let pitcher = "";

      if (playerCandidates.length >= 2) {
        batter = playerCandidates[0] || "";
        pitcher = playerCandidates[1] || "";
      } else if (playerCandidates.length === 1) {
        batter = playerCandidates[0] || "";
      }

      const count = parseCount(panelTextLines);
      const bases = parseBases(panelTextLines);

      return {
        source: "official-panel",
        inningText: inningText || "比賽中",
        half,
        batter,
        pitcher,
        pitchCount,
        balls: count.balls,
        strikes: count.strikes,
        outs: count.outs,
        bases,
        debug: {
          pitchLine,
          panelItems: panelItems.slice(0, 30),
          playerCandidates,
          countCandidates: panelTextLines.filter(line =>
            /B|S|O|好球|壞球|出局/i.test(line)
          ),
          baseCandidates: panelTextLines.filter(line =>
            /一壘|二壘|三壘|1B|2B|3B|壘/i.test(line)
          )
        }
      };
    }, TEAM_NAMES, VENUES);

    return sanitizeLiveState(parsed);
  } catch (err) {
    console.log(`⚠️ 官方 liveState 解析失敗：${err.message}`);
    return null;
  }
}

async function fetchGameBundle(page, gameSno, entry) {
  await page.goto(entry.url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(1800);

  await revealPregameTables(page);

  const bundle = await page.evaluate((TEAM_NAMES_IN_PAGE, entryMode, entryUrl) => {
    function cleanTextInPage(v) {
      return String(v || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function normalizeCell(v) {
      const s = cleanTextInPage(v);
      return s === "" ? "—" : s;
    }

    function readLines() {
      return (document.body?.innerText || "")
        .split("\n")
        .map(cleanTextInPage)
        .filter(Boolean);
    }

    function parseMeta() {
      const bodyText = document.body?.innerText || "";

      if (!bodyText || bodyText.length < 180) {
        return {
          ok: false,
          reason: "頁面文字太短",
          entryMode,
          entryUrl
        };
      }

      const lines = readLines();

      const matchupLines = lines.filter(line =>
        /\d{4}\/\d{1,2}\/\d{1,2}/.test(line) &&
        /VS\.?|vs\.?/i.test(line) &&
        TEAM_NAMES_IN_PAGE.some(team => line.includes(team))
      );

      const matchupLine =
        matchupLines[matchupLines.length - 1] ||
        matchupLines[0];

      if (!matchupLine) {
        return {
          ok: false,
          reason: "找不到 matchupLine",
          entryMode,
          entryUrl
        };
      }

      const dateMatch = matchupLine.match(/\d{4}\/\d{1,2}\/\d{1,2}/);
      const date = dateMatch ? dateMatch[0] : null;

      const teams = TEAM_NAMES_IN_PAGE
        .filter(team => matchupLine.includes(team))
        .sort((a, b) => matchupLine.indexOf(a) - matchupLine.indexOf(b));

      if (teams.length < 2) {
        return {
          ok: false,
          reason: "matchupLine 找不到兩隊",
          entryMode,
          entryUrl
        };
      }

      const away = teams[0];
      const home = teams[1];

      const dateBlockIndex = lines.findIndex(line =>
        /\d{4}\/\d{1,2}\/\d{1,2}\s*\(星期/.test(line)
      );

      const block =
        dateBlockIndex >= 0
          ? lines.slice(dateBlockIndex, dateBlockIndex + 40)
          : lines;

      const gameSnoLine =
        block.find(line => /^\d{3}$/.test(line)) ||
        block.find(line => /^\d{1,3}$/.test(line)) ||
        null;

      let venue = "";
      let time = "";

      const venueTimeLine = block.find(line =>
        /\d{1,2}:\d{2}/.test(line) &&
        !line.includes("/") &&
        !line.includes("年")
      ) || "";

      const venueTimeMatch = venueTimeLine.match(/^(.+?)\s+(\d{1,2}:\d{2})$/);

      if (venueTimeMatch) {
        venue = venueTimeMatch[1].trim();
        time = venueTimeMatch[2].trim();
      }

      const statusLine =
        block.find(line => line.includes("進行中")) ||
        block.find(line => line.includes("比賽中")) ||
        block.find(line => line.includes("LIVE")) ||
        block.find(line => line.includes("比賽尚未開始")) ||
        block.find(line => line.includes("比賽結束")) ||
        block.find(line => line.includes("比賽終了")) ||
        block.find(line => line.includes("延賽")) ||
        block.find(line => line.includes("保留")) ||
        block.find(line => line.includes("取消")) ||
        "";

      const typeLine =
        lines.find(line => line.includes("一軍例行賽")) ||
        lines.find(line => line.includes("一軍熱身賽")) ||
        lines.find(line => line.includes("一軍總冠軍賽")) ||
        lines.find(line => line.includes("一軍季後挑戰賽")) ||
        lines.find(line => line.includes("一軍明星賽")) ||
        lines.find(line => line.includes("二軍例行賽")) ||
        "";

      return {
        ok: true,
        entryMode,
        entryUrl,
        matchupLine,
        date,
        away,
        home,
        gameSnoText: gameSnoLine,
        venue,
        time,
        statusText: statusLine,
        typeText: typeLine
      };
    }

    function readTables() {
      const tables = Array.from(document.querySelectorAll("table"));

      return tables.map((table, tableIndex) => {
        const rows = Array.from(table.querySelectorAll("tr"))
          .map(tr =>
            Array.from(tr.querySelectorAll("th, td"))
              .map(td => normalizeCell(td.innerText))
              .filter(Boolean)
          )
          .filter(row => row.length);

        const text = rows.flat().join(" ");

        return {
          tableIndex,
          text,
          rows,
          rowCount: rows.length,
          sampleRows: rows.slice(0, 12)
        };
      });
    }

    function findHeaderIndex(rows, keywords) {
      return rows.findIndex(row => {
        const text = row.join(" ");
        return keywords.every(k => text.includes(k));
      });
    }

    function indexOfHeader(header, names) {
      for (const name of names) {
        const idx = header.findIndex(h => h === name || h.includes(name));

        if (idx >= 0) return idx;
      }

      return -1;
    }

    function cell(row, idx) {
      if (idx < 0) return "—";
      return row[idx] ?? "—";
    }

    function cleanPlayerName(rawName) {
      const s = cleanTextInPage(rawName);

      if (!s) return "";

      if (
        s === "Total" ||
        s.includes("合計") ||
        s.includes("小計") ||
        s.includes("球員") ||
        s.includes("打者") ||
        s.includes("投手")
      ) {
        return "";
      }

      return s;
    }

    function parseBatterTable(table) {
      const rows = table.rows;

      const headerIndex =
        findHeaderIndex(rows, ["打數"]) >= 0
          ? findHeaderIndex(rows, ["打數"])
          : findHeaderIndex(rows, ["AB"]);

      if (headerIndex < 0) return [];

      const header = rows[headerIndex];

      const nameIdx = indexOfHeader(header, ["球員", "姓名", "打者"]);
      const abIdx = indexOfHeader(header, ["AB", "打數"]);
      const rIdx = indexOfHeader(header, ["R", "得分"]);
      const hIdx = indexOfHeader(header, ["H", "安打"]);
      const rbiIdx = indexOfHeader(header, ["RBI", "打點"]);
      const avgIdx = indexOfHeader(header, ["AVG", "打擊率"]);

      const players = [];

      for (const row of rows.slice(headerIndex + 1)) {
        if (row.length < 2) continue;

        const rawName =
          cell(row, nameIdx) !== "—"
            ? cell(row, nameIdx)
            : row[0];

        const name = cleanPlayerName(rawName);

        if (!name) continue;

        players.push({
          name,
          rawName,
          position: "",
          AB: cell(row, abIdx),
          R: cell(row, rIdx),
          H: cell(row, hIdx),
          RBI: cell(row, rbiIdx),
          AVG: cell(row, avgIdx)
        });
      }

      return players.filter(p => p.name && p.name !== "—");
    }

    function parsePitcherTable(table) {
      const rows = table.rows;

      const headerIndex =
        findHeaderIndex(rows, ["投球局數"]) >= 0
          ? findHeaderIndex(rows, ["投球局數"])
          : findHeaderIndex(rows, ["IP"]);

      if (headerIndex < 0) return [];

      const header = rows[headerIndex];

      const nameIdx = indexOfHeader(header, ["投手", "球員", "姓名"]);
      const ipIdx = indexOfHeader(header, ["IP", "投球局數"]);
      const hIdx = indexOfHeader(header, ["H", "安打"]);
      const erIdx = indexOfHeader(header, ["ER", "自責分"]);
      const bbIdx = indexOfHeader(header, ["BB", "四壞"]);
      const soIdx = indexOfHeader(header, ["SO", "三振", "奪三振"]);
      const eraIdx = indexOfHeader(header, ["ERA", "防禦率"]);

      const players = [];

      for (const row of rows.slice(headerIndex + 1)) {
        if (row.length < 2) continue;

        const rawName =
          cell(row, nameIdx) !== "—"
            ? cell(row, nameIdx)
            : row[0];

        const name = cleanPlayerName(rawName);

        if (!name) continue;

        players.push({
          name,
          rawName,
          IP: cell(row, ipIdx),
          H: cell(row, hIdx),
          ER: cell(row, erIdx),
          BB: cell(row, bbIdx),
          SO: cell(row, soIdx),
          ERA: cell(row, eraIdx)
        });
      }

      return players.filter(p => p.name && p.name !== "—");
    }

    function parseLineScoreCell(value) {
      const s = cleanTextInPage(value);

      if (!s || s === "—" || s === "-") return "";

      if (s.toUpperCase() === "X") return "X";

      const n = Number(s);

      return Number.isFinite(n) ? n : "";
    }

    function isInningHeaderCell(value) {
      const s = cleanTextInPage(value);

      if (/^\d{1,2}$/.test(s)) {
        const n = Number(s);
        return n >= 1 && n <= 15;
      }

      return false;
    }

    function rowHasTeam(row, teamName) {
      if (!teamName) return false;

      return row.join(" ").includes(teamName);
    }

    function rowHasManyInningNumbers(row) {
      return row.filter(isInningHeaderCell).length >= 3;
    }

    function parseLineScoreTable(table, meta) {
      const rows = table.rows || [];

      if (!rows.length) {
        return {
          away: [],
          home: []
        };
      }

      const awayTeam = meta?.away || "";
      const homeTeam = meta?.home || "";

      let headerIndex = -1;
      let inningIndexes = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        if (!rowHasManyInningNumbers(row)) continue;

        const indexes = [];

        row.forEach((cell, idx) => {
          if (isInningHeaderCell(cell)) {
            indexes.push(idx);
          }
        });

        if (indexes.length >= 3) {
          headerIndex = i;
          inningIndexes = indexes;
          break;
        }
      }

      if (headerIndex < 0 || !inningIndexes.length) {
        return {
          away: [],
          home: []
        };
      }

      let awayRow = null;
      let homeRow = null;

      for (const row of rows.slice(headerIndex + 1, headerIndex + 6)) {
        if (!awayRow && rowHasTeam(row, awayTeam)) {
          awayRow = row;
        }

        if (!homeRow && rowHasTeam(row, homeTeam)) {
          homeRow = row;
        }
      }

      if (!awayRow || !homeRow) {
        const candidates = rows
          .slice(headerIndex + 1, headerIndex + 6)
          .filter(row => {
            const inningValues = inningIndexes
              .map(idx => parseLineScoreCell(row[idx]))
              .filter(v => v !== "");

            return inningValues.length >= 1;
          });

        if (!awayRow) awayRow = candidates[0] || null;
        if (!homeRow) homeRow = candidates[1] || null;
      }

      const parseRow = row => {
        if (!row) return [];

        return inningIndexes.map(idx => parseLineScoreCell(row[idx]));
      };

      return {
        away: parseRow(awayRow),
        home: parseRow(homeRow)
      };
    }

    function findLineScoreFromTables(tables, meta) {
      const candidates = [];

      for (const table of tables) {
        const rows = table.rows || [];
        const text = table.text || "";

        const hasInningHeader = rows.some(row => rowHasManyInningNumbers(row));

        const hasScoreWords =
          text.includes("R") ||
          text.includes("H") ||
          text.includes("E") ||
          text.includes("合計") ||
          text.includes("比分");

        if (!hasInningHeader) continue;
        if (!hasScoreWords) continue;

        const lineScore = parseLineScoreTable(table, meta);

        const count =
          (lineScore.away?.length || 0) +
          (lineScore.home?.length || 0);

        if (count > 0) {
          candidates.push({
            tableIndex: table.tableIndex,
            lineScore,
            count
          });
        }
      }

      candidates.sort((a, b) => b.count - a.count);

      return candidates[0]?.lineScore || {
        away: [],
        home: []
      };
    }

    function parseDetail(meta) {
      const tables = readTables();

      const lineScore = findLineScoreFromTables(tables, meta);

      const batterTables = [];
      const pitcherTables = [];

      tables.forEach(table => {
        const text = table.text;

        const maybeBatter =
          text.includes("打數") ||
          text.includes("AB") ||
          text.includes("打擊率") ||
          text.includes("RBI");

        const maybePitcher =
          text.includes("投球局數") ||
          text.includes("IP") ||
          text.includes("防禦率") ||
          text.includes("ERA");

        if (maybeBatter) {
          const players = parseBatterTable(table);

          if (players.length) {
            batterTables.push({
              tableIndex: table.tableIndex,
              players
            });
          }
        }

        if (maybePitcher) {
          const players = parsePitcherTable(table);

          if (players.length) {
            pitcherTables.push({
              tableIndex: table.tableIndex,
              players
            });
          }
        }
      });

      return {
        lineScore,

        batters: {
          away: batterTables[0]?.players || [],
          home: batterTables[1]?.players || []
        },

        pitchers: {
          away: pitcherTables[0]?.players || [],
          home: pitcherTables[1]?.players || []
        },

        debug: {
          tableCount: tables.length,

          lineScore,
          lineScoreAwayCount: lineScore.away.length,
          lineScoreHomeCount: lineScore.home.length,

          tableSamples: tables.map(table => ({
            tableIndex: table.tableIndex,
            rowCount: table.rowCount,
            sampleRows: table.sampleRows,
            textSample: table.text.slice(0, 600)
          })),

          batterTableCount: batterTables.length,
          pitcherTableCount: pitcherTables.length,

          batterSamples: batterTables.map(t => ({
            tableIndex: t.tableIndex,
            count: t.players.length,
            sample: t.players.slice(0, 3)
          })),

          pitcherSamples: pitcherTables.map(t => ({
            tableIndex: t.tableIndex,
            count: t.players.length,
            sample: t.players.slice(0, 3)
          }))
        }
      };
    }

    const parsedMeta = parseMeta();

    return {
      meta: parsedMeta,
      detail: parseDetail(parsedMeta)
    };
  }, TEAM_NAMES, entry.mode, entry.url);

  const pageStatus = getStatusFromText(bundle?.meta?.statusText || "");

  const officialLiveState =
    pageStatus === "live"
      ? await parseOfficialLiveState(page)
      : null;

  return {
    ...bundle,
    detail: {
      ...(bundle.detail || {}),
      liveState: officialLiveState || null,
      debug: {
        ...(bundle.detail?.debug || {}),
        liveState: officialLiveState || null
      }
    }
  };
}
async function fetchBundleByGameSno(page, gameSno) {
  const entries = buildUrls(gameSno);
  const failures = [];

  for (const entry of entries) {
    try {
      const bundle = await fetchGameBundle(page, gameSno, entry);
      const meta = bundle?.meta;

      if (!meta || !meta.ok) {
        failures.push(`${entry.mode}: ${meta?.reason || "無資料"}`);
        continue;
      }

      const displayedSno = normalizeGameSno(meta.gameSnoText);

      if (displayedSno != null && displayedSno !== Number(gameSno)) {
        failures.push(`${entry.mode}: 此查詢值導向 gameSno=${displayedSno}`);
        continue;
      }

      return {
        meta: {
          ...meta,
          displayedSno,
          usedUrl: entry.url,
          usedMode: entry.mode
        },
        detail: bundle.detail || {
          batters: {
            home: [],
            away: []
          },
          pitchers: {
            home: [],
            away: []
          },
          liveState: null,
          debug: {}
        }
      };
    } catch (err) {
      failures.push(`${entry.mode}: ${err.message}`);
    }
  }

  return {
    meta: {
      ok: false,
      reason: failures.join("｜")
    },
    detail: {
      batters: {
        home: [],
        away: []
      },
      pitchers: {
        home: [],
        away: []
      },
      liveState: null,
      debug: {}
    }
  };
}

/* =========================
   建立 / 合併
========================= */

function createGameFromMeta(meta) {
  let status = getStatusFromText(meta.statusText);
  const empty = emptyBoxscore();

  const hasScore =
    typeof meta.homeScore === "number" &&
    typeof meta.awayScore === "number";

  const metaLineScore = hasAnyLineScore(meta.lineScore)
    ? meta.lineScore
    : empty.lineScore;

  const decisions = parseDecisionLine(meta.decisionLine);

  if (
    hasScore &&
    !isClearlyFinalText(meta.statusText) &&
    !hasRealDecisionText(meta.decisionLine)
  ) {
    status = "live";
  }

  const game = {
    gameSno: Number(meta.gameSno),

    meta: {
      date: fixDate(meta.date),
      home: meta.home,
      away: meta.away,
      status,
      statusText: getStatusText(status),
      type: normalizeType(meta.typeText || "一軍例行賽"),
      typeText: meta.typeText || "一軍例行賽",
      time: meta.time || "",
      duration: meta.duration || "",
      venue: meta.venue || "",
      officialUrl: meta.usedUrl || buildOfficialUrl(meta.gameSno),
      urlMode: meta.usedMode || "schedule-api",
      win: decisions.win,
      lose: decisions.lose,
      save: decisions.save,
      mvp: decisions.mvp
    },

    lineScore: metaLineScore,

    totals: hasScore
      ? {
          home: {
            R: meta.homeScore,
            H: meta.homeH ?? null,
            E: meta.homeE ?? null
          },
          away: {
            R: meta.awayScore,
            H: meta.awayH ?? null,
            E: meta.awayE ?? null
          }
        }
      : empty.totals,

    batters: empty.batters,
    pitchers: empty.pitchers,

    pregame: buildPregameFromMeta(meta, null),

    liveState: null
  };

  return ensureVisibleLiveGame(game);
}

function mergeUpdatedGame(oldGame, meta, detail = {}) {
  let status = getStatusFromText(meta.statusText);

  const oldMeta = oldGame.meta || {};
  const empty = emptyBoxscore();

  const hasScore =
    typeof meta.homeScore === "number" &&
    typeof meta.awayScore === "number";

  const metaLineScore = hasAnyLineScore(meta.lineScore)
    ? meta.lineScore
    : null;

  const detailLineScore = hasAnyLineScore(detail.lineScore)
    ? detail.lineScore
    : null;

  const decisions = parseDecisionLine(meta.decisionLine);

  const newBatters = detail.batters || {};
  const newPitchers = detail.pitchers || {};

  const hasNewBatters =
    (Array.isArray(newBatters.away) && newBatters.away.length > 0) ||
    (Array.isArray(newBatters.home) && newBatters.home.length > 0);

  const hasNewPitchers =
    (Array.isArray(newPitchers.away) && newPitchers.away.length > 0) ||
    (Array.isArray(newPitchers.home) && newPitchers.home.length > 0);

  const clearlyFinal =
    isClearlyFinalText(meta.statusText) ||
    hasRealDecisionText(meta.decisionLine);

  const mergedPregame =
    buildPregameFromMeta(meta, oldGame.pregame);

  const hasRosterData =
    hasNewBatters ||
    hasNewPitchers ||
    (Array.isArray(oldGame.batters?.away) && oldGame.batters.away.length > 0) ||
    (Array.isArray(oldGame.batters?.home) && oldGame.batters.home.length > 0) ||
    (Array.isArray(oldGame.pitchers?.away) && oldGame.pitchers.away.length > 0) ||
    (Array.isArray(oldGame.pitchers?.home) && oldGame.pitchers.home.length > 0);

  const metaDate =
    fixDate(meta.date) ||
    oldMeta.date ||
    "";

  const metaTime =
    meta.time ||
    oldMeta.time ||
    "";

  const hasRealLiveSignal =
    hasScore ||
    hasRealLiveState(detail.liveState) ||
    detailLineScore ||
    metaLineScore ||
    hasAnyLineScore(oldGame.lineScore) ||
    (
      isAfterGameStart(metaDate, metaTime) &&
      hasRosterData
    );

  if (hasRealLiveSignal && !clearlyFinal) {
    status = "live";
  }

  const updatedGame = {
    ...oldGame,

    gameSno:
      Number(oldGame.gameSno),

    meta: {
      ...oldMeta,

      date:
        fixDate(meta.date) ||
        oldMeta.date,

      home:
        meta.home ||
        oldMeta.home,

      away:
        meta.away ||
        oldMeta.away,

      status,

      statusText:
        getStatusText(status),

      type:
        normalizeType(
          meta.typeText ||
          oldMeta.typeText ||
          "一軍例行賽"
        ),

      typeText:
        meta.typeText ||
        oldMeta.typeText ||
        "一軍例行賽",

      time:
        meta.time ||
        oldMeta.time ||
        "",

      duration:
        meta.duration ||
        oldMeta.duration ||
        "",

      venue:
        meta.venue ||
        oldMeta.venue ||
        "",

      officialUrl:
        meta.usedUrl ||
        oldMeta.officialUrl ||
        buildOfficialUrl(oldGame.gameSno),

      urlMode:
        meta.usedMode ||
        oldMeta.urlMode ||
        "schedule",

      win:
        decisions.win ??
        oldMeta.win ??
        null,

      lose:
        decisions.lose ??
        oldMeta.lose ??
        null,

      save:
        decisions.save ??
        oldMeta.save ??
        null,

      mvp:
        decisions.mvp ??
        oldMeta.mvp ??
        null
    },

    lineScore:
      detailLineScore ||
      metaLineScore ||
      oldGame.lineScore ||
      empty.lineScore,

    totals:
      hasScore
        ? {
            home: {
              R: meta.homeScore,
              H: meta.homeH ?? oldGame.totals?.home?.H ?? null,
              E: meta.homeE ?? oldGame.totals?.home?.E ?? null
            },
            away: {
              R: meta.awayScore,
              H: meta.awayH ?? oldGame.totals?.away?.H ?? null,
              E: meta.awayE ?? oldGame.totals?.away?.E ?? null
            }
          }
        : oldGame.totals ||
          empty.totals,

    batters:
      hasNewBatters
        ? {
            away:
              newBatters.away || [],
            home:
              newBatters.home || []
          }
        : oldGame.batters ||
          empty.batters,

    pitchers:
      hasNewPitchers
        ? {
            away:
              newPitchers.away || [],
            home:
              newPitchers.home || []
          }
        : oldGame.pitchers ||
          empty.pitchers,

    pregame:
      mergedPregame,

    liveState:
      detail.liveState ||
      oldGame.liveState ||
      empty.liveState ||
      null
  };

  if (shouldForceScheduledBeforeStart(updatedGame)) {
    updatedGame.meta.status = "scheduled";
    updatedGame.meta.statusText = "比賽尚未開始";
    updatedGame.liveState = null;

    console.log(
      `⏳ ${updatedGame.gameSno}: 先發名單已公布，但尚未開賽，狀態維持 scheduled`
    );
  }

  return updatedGame;
}
/* =========================
   主程式
========================= */

async function main() {
  const games = await readExistingGames();
  const today = getToday();

  console.log("📡 更新今日 CPBL 比賽...");
  console.log("今天：", today);

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

  const browser = await puppeteer.launch(launchOptions);

  const updatedMap = new Map(
    games.map(g => [Number(g.gameSno), g])
  );

  let discoveredToday = await discoverTodayGames(browser, today);

  const homeProbables = await discoverHomeProbables(browser);
  const homeLiveCards = await discoverHomeLiveCards(browser);

  const homeLiveCardMap = new Map(
    homeLiveCards.map(g => [Number(g.gameSno), g])
  );

  const homeProbableMap = new Map(
    homeProbables.map(g => [Number(g.gameSno), g])
  );

  if (discoveredToday.length) {
    discoveredToday = discoveredToday.map(g => {
      const probable = homeProbableMap.get(Number(g.gameSno));

      if (!probable) return g;

      return {
        ...g,
        awayStarter:
          g.awayStarter ||
          probable.awayStarter ||
          "",
        homeStarter:
          g.homeStarter ||
          probable.homeStarter ||
          "",
        starters: {
          away:
            g.awayStarter ||
            probable.awayStarter ||
            "",
          home:
            g.homeStarter ||
            probable.homeStarter ||
            ""
        }
      };
    });
  }

  discoveredToday.forEach(meta => {
    const gameSno = Number(meta.gameSno);
    const oldGame = updatedMap.get(gameSno);
    const liveCard = homeLiveCardMap.get(gameSno);

    if (oldGame) {
      let merged = mergeUpdatedGame(oldGame, meta);

      if (liveCard) {
        merged = mergeHomeLiveCardIntoGame(merged, liveCard);
      }

      updatedMap.set(gameSno, ensureVisibleLiveGame(merged));
    } else {
      console.log(`➕ 新增今日場次：${gameSno} ${meta.away} vs ${meta.home}`);

      let created = createGameFromMeta(meta);

      if (liveCard) {
        created = mergeHomeLiveCardIntoGame(created, liveCard);
      }

      updatedMap.set(gameSno, created);
    }
  });

  await writeProbablePitchers(
    homeProbables.length
      ? homeProbables
      : discoveredToday
  );

  const todayGames = [...updatedMap.values()]
    .filter(g => g.meta?.date === today)
    .sort((a, b) => Number(a.gameSno || 0) - Number(b.gameSno || 0));

  console.log("今日場次：", todayGames.length);

  if (!todayGames.length) {
    console.log("今天沒有比賽，不更新。");
    await safeCloseBrowser(browser);
    return;
  }

  const page = await setupPage(browser);

  for (const game of todayGames) {
    const gameSno = Number(game.gameSno);

    console.log("");
    console.log("更新:", gameSno);

    const bundle = await fetchBundleByGameSno(page, gameSno);
    const meta = bundle.meta;
    const detail = bundle.detail;

    await saveDebug(gameSno, detail);

    if (!meta || !meta.ok) {
      const liveCard = homeLiveCardMap.get(gameSno);

      let kept = updatedMap.get(gameSno);

      if (liveCard) {
        kept = mergeHomeLiveCardIntoGame(kept, liveCard);
        updatedMap.set(gameSno, kept);

        console.log(
          `✅ ${gameSno}: boxscore 暫不可用，已改用官方首頁 LIVE 卡`
        );

        console.log(
          `   ↳ ${kept.meta?.away} ${kept.totals?.away?.R ?? "—"} : ${kept.totals?.home?.R ?? "—"} ${kept.meta?.home}｜${kept.meta?.statusText}`
        );

        console.log(
          `   ↳ liveState：打者=${kept.liveState?.batter || "—"}｜投手=${kept.liveState?.pitcher || "—"}｜${kept.liveState?.inningText || "比賽中"}`
        );

        continue;
      }

      kept = ensureVisibleLiveGame(kept);

      if (kept) {
        updatedMap.set(gameSno, kept);
      }

      console.log(
        `✅ ${gameSno}: boxscore 暫不可用，已改用官方 schedule/getgamedatas LIVE 比分`
      );

      if (kept) {
        console.log(
          `   ↳ ${kept.meta?.away} ${kept.totals?.away?.R ?? "—"} : ${kept.totals?.home?.R ?? "—"} ${kept.meta?.home}｜${kept.meta?.statusText}`
        );
      }

      continue;
    }

    let updated = ensureVisibleLiveGame(
      mergeUpdatedGame(game, meta, detail)
    );

    const liveCard = homeLiveCardMap.get(gameSno);

    if (liveCard) {
      updated = mergeHomeLiveCardIntoGame(updated, liveCard);
    }

    updated.liveState = sanitizeLiveState(updated.liveState);

    updatedMap.set(gameSno, updated);

    const batterCount =
      (updated.batters?.away?.length || 0) +
      (updated.batters?.home?.length || 0);

    const pitcherCount =
      (updated.pitchers?.away?.length || 0) +
      (updated.pitchers?.home?.length || 0);

    console.log(
      `✅ ${gameSno}: ${updated.meta.date} ${updated.meta.away} vs ${updated.meta.home} ` +
      `${updated.meta.venue || ""} ${updated.meta.time || updated.meta.duration || ""} ${updated.meta.statusText}` +
      `${updated.meta.win ? `｜勝投:${updated.meta.win}` : ""}` +
      `${updated.meta.lose ? `｜敗投:${updated.meta.lose}` : ""}` +
      `${updated.meta.save ? `｜救援:${updated.meta.save}` : ""}` +
      `${updated.meta.mvp ? `｜MVP:${updated.meta.mvp}` : ""}`
    );

    const inningCount =
      Math.max(
        updated.lineScore?.away?.length || 0,
        updated.lineScore?.home?.length || 0
      );

    console.log(`   打者：${batterCount} 人｜投手：${pitcherCount} 人`);
    console.log(`   逐局：${inningCount ? inningCount + "局" : "—"}`);
    console.log(
      `   liveState：打者=${updated.liveState?.batter || "—"}｜投手=${updated.liveState?.pitcher || "—"}`
    );
  }

  await safeClosePage(page);
  await safeCloseBrowser(browser);

  const result = [...updatedMap.values()]
    .map(ensureVisibleLiveGame)
    .map(game => {
      if (game?.liveState) {
        game.liveState = sanitizeLiveState(game.liveState);
      }

      return game;
    })
    .sort((a, b) => {
      const da = a.meta?.date || "9999-12-31";
      const db = b.meta?.date || "9999-12-31";

      if (da !== db) return da.localeCompare(db);

      return Number(a.gameSno || 0) - Number(b.gameSno || 0);
    });

  await writeGames(result);

  console.log("");
  console.log("💾 今日更新完成，共保留場次：", result.length);
  console.log("Debug：debug/live-detail/live-detail-場次.json");
}

main().catch(err => {
  console.error("❌ 失敗：", err);
  process.exit(1);
});