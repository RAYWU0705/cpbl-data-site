// =========================
// games-data.js
// v9 LIVE Data Engine
// 支援：雙網址資料流 / 延賽 / 保留 / 取消 / officialUrl
// =========================

const API_URL = "http://localhost:3002/api/live";
const STATIC_URL = "data/live/live-boxscore.json";
const LOCAL_BOX_KEY = "cpbl_boxscore";

let gamesStore = [];
let lastSource = "none";

// =========================
// 對外：載入資料
// =========================
export async function loadGames(options = {}) {
  const { force = false } = options;

  if (!force && gamesStore.length) {
    return gamesStore;
  }

  const rawGames = await readGames();

  gamesStore = rawGames
    .map(normalizeGame)
    .filter(g => g.home && g.away)
    .sort(sortGames);

  syncLocalStorage(gamesStore);

  return gamesStore;
}

export function getGames() {
  return gamesStore;
}

export function getDataSource() {
  return lastSource;
}

export function getMonths() {
  const months = new Set();

  gamesStore.forEach(g => {
    if (g.month) months.add(g.month);
  });

  return [...months].sort();
}

export function getTeams() {
  const teams = new Set();

  gamesStore.forEach(g => {
    if (g.home) teams.add(g.home);
    if (g.away) teams.add(g.away);
  });

  return [...teams].sort();
}

export function getVenues() {
  const venues = new Set();

  gamesStore.forEach(g => {
    if (g.venue) venues.add(g.venue);
  });

  return [...venues].sort();
}

export function getTypes() {
  const types = new Set();

  gamesStore.forEach(g => {
    if (g.type) types.add(g.type);
  });

  return [...types].sort();
}

export function getStatuses() {
  const statuses = new Set();

  gamesStore.forEach(g => {
    if (g.status) statuses.add(g.status);
  });

  return [...statuses].sort();
}

// =========================
// 對外：篩選
// =========================
export function filterGames({
  month = "ALL",
  date = "",
  team = "ALL",
  venue = "ALL",
  type = "ALL",
  status = "ALL",
  keyword = ""
} = {}) {
  const kw = String(keyword || "").trim().toLowerCase();

  return gamesStore.filter(g => {
    if (type !== "ALL" && g.type !== type) return false;

    if (month !== "ALL" && g.month !== month) return false;

    if (date && g.date !== date) return false;

    if (team !== "ALL") {
      if (g.home !== team && g.away !== team) return false;
    }

    if (venue !== "ALL") {
      if (g.venue !== venue) return false;
    }

    if (status !== "ALL") {
      if (g.status !== status) return false;
    }

    if (kw) {
      const haystack = [
        g.gameSno,
        g.date,
        g.weekday,
        g.home,
        g.away,
        g.venue,
        g.time,
        g.type,
        g.typeText,
        g.status,
        g.statusText,
        g.officialUrl,
        g.urlMode
      ].join(" ").toLowerCase();

      if (!haystack.includes(kw)) return false;
    }

    return true;
  });
}

// =========================
// 讀取來源：API → 靜態 JSON → localStorage
// =========================
async function readGames() {
  const apiGames = await readFromApi();

  if (apiGames.length) {
    lastSource = "localhost api";
    return apiGames;
  }

  const staticGames = await readFromStaticJson();

  if (staticGames.length) {
    lastSource = "static json";
    return staticGames;
  }

  const localGames = readFromLocalStorage();

  if (localGames.length) {
    lastSource = "localStorage";
    return localGames;
  }

  lastSource = "none";
  return [];
}

async function readFromApi() {
  try {
    const res = await fetchWithTimeout(API_URL, 900);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    return toArray(data);
  } catch {
    return [];
  }
}

async function readFromStaticJson() {
  try {
    const res = await fetch(STATIC_URL, { cache: "no-store" });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    return toArray(data);
  } catch {
    return [];
  }
}

function readFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_BOX_KEY);
    if (!raw) return [];

    const data = JSON.parse(raw);

    return toArray(data);
  } catch {
    return [];
  }
}

function syncLocalStorage(games) {
  if (!games.length) return;

  const map = {};

  games.forEach(g => {
    if (g.gameSno != null) {
      map[g.gameSno] = g.raw || g;
    }
  });

  localStorage.setItem(LOCAL_BOX_KEY, JSON.stringify(map));
}

// =========================
// 標準化
// =========================
function normalizeGame(g) {
  const meta = g.meta || {};

  const home = meta.home || g.home || g.teams?.home || "";
  const away = meta.away || g.away || g.teams?.away || "";

  const homeScore = safeNumber(g.totals?.home?.R ?? g.homeScore ?? g.score?.home);
  const awayScore = safeNumber(g.totals?.away?.R ?? g.awayScore ?? g.score?.away);

  const hasScore = isRealScore(g, homeScore, awayScore);

  const date = normalizeDate(meta.date || g.date || null);

  const type = normalizeType(meta.type || g.type || "regular");

  const status = normalizeStatus(
    meta.status || g.status || (hasScore ? "final" : "scheduled")
  );

  const statusText = meta.statusText || getStatusText(status);
  const typeText = meta.typeText || getTypeText(type);

  return {
    raw: g,

    id: buildGameId(date, home, away, g.gameSno ?? meta.gameSno),
    gameSno: safeNumber(g.gameSno ?? meta.gameSno),

    date,
    weekday: getWeekday(date),
    month: date ? date.slice(0, 7) : null,

    home,
    away,

    homeId: getTeamId(home),
    awayId: getTeamId(away),

    score: hasScore ? {
      home: homeScore,
      away: awayScore
    } : null,

    homeScore: hasScore ? homeScore : null,
    awayScore: hasScore ? awayScore : null,

    homeH: safeNumber(g.totals?.home?.H),
    awayH: safeNumber(g.totals?.away?.H),
    homeE: safeNumber(g.totals?.home?.E),
    awayE: safeNumber(g.totals?.away?.E),

    status,
    statusText,

    type,
    typeText,

    time: meta.time || g.time || "",
    venue: meta.venue || g.venue || "",

    officialUrl: meta.officialUrl || g.officialUrl || "",
    urlMode: meta.urlMode || g.urlMode || "",

    win: meta.win || null,
    lose: meta.lose || null,
    save: meta.save || null,
    mvp: meta.mvp || null
  };
}

// =========================
// 工具
// =========================
function toArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return fetch(url, {
    cache: "no-store",
    signal: controller.signal
  }).finally(() => clearTimeout(timer));
}

function buildGameId(date, home, away, gameSno) {
  if (gameSno != null) return `gameSno_${gameSno}`;
  return `${date || "no-date"}_${home}_${away}`;
}

function sortGames(a, b) {
  const da = a.date || "9999-12-31";
  const db = b.date || "9999-12-31";

  if (da !== db) return da.localeCompare(db);

  return Number(a.gameSno || 0) - Number(b.gameSno || 0);
}

function normalizeDate(dateStr) {
  if (!dateStr) return null;

  const raw = String(dateStr).replace(/\//g, "-");
  const parts = raw.split("-");

  if (parts.length < 3) return raw;

  const y = parts[0];
  const m = String(parts[1]).padStart(2, "0");
  const d = String(parts[2]).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function getWeekday(dateStr) {
  if (!dateStr) return "";

  const days = ["日", "一", "二", "三", "四", "五", "六"];
  const d = new Date(`${dateStr}T00:00:00`);

  if (Number.isNaN(d.getTime())) return "";

  return `(${days[d.getDay()]})`;
}

function safeNumber(v) {
  if (v === null || v === undefined || v === "") return null;

  const n = Number(v);

  return Number.isFinite(n) ? n : null;
}

function isRealScore(g, homeScore, awayScore) {
  if (typeof homeScore !== "number" || typeof awayScore !== "number") {
    return false;
  }

  // 防假 0:0：如果沒有逐局，又是 0:0，不當成真比分
  if (homeScore === 0 && awayScore === 0) {
    const hasInnings =
      Array.isArray(g.lineScore?.home) && g.lineScore.home.length > 0 &&
      Array.isArray(g.lineScore?.away) && g.lineScore.away.length > 0;

    if (!hasInnings) return false;
  }

  return true;
}

function normalizeStatus(status) {
  if (!status) return "scheduled";

  const s = String(status).toLowerCase();

  if (s === "finished") return "final";
  if (s === "final") return "final";
  if (s === "live") return "live";
  if (s === "scheduled") return "scheduled";
  if (s === "upcoming") return "scheduled";

  if (s === "postponed") return "postponed";
  if (s === "delay") return "postponed";
  if (s === "delayed") return "postponed";

  if (s === "suspended") return "suspended";
  if (s === "reserved") return "suspended";

  if (s === "cancelled") return "cancelled";
  if (s === "canceled") return "cancelled";

  return s;
}

function normalizeType(type) {
  if (!type) return "regular";

  const s = String(type).toLowerCase();

  if (s === "regular") return "regular";
  if (s === "exhibition") return "exhibition";
  if (s === "preseason") return "exhibition";
  if (s === "warmup") return "exhibition";
  if (s === "playoff") return "playoff";
  if (s === "championship") return "championship";
  if (s === "allstar") return "allstar";
  if (s === "minor") return "minor";

  return s;
}

function getStatusText(status) {
  if (status === "live") return "🔴 LIVE";
  if (status === "final") return "✅ 已結束";
  if (status === "postponed") return "🌧 延賽";
  if (status === "suspended") return "⏸ 保留比賽";
  if (status === "cancelled") return "❌ 取消";
  return "⏳ 未開賽";
}

function getTypeText(type) {
  if (type === "regular") return "一軍例行賽";
  if (type === "exhibition") return "一軍熱身賽";
  if (type === "playoff") return "季後賽";
  if (type === "championship") return "總冠軍賽";
  if (type === "allstar") return "明星賽";
  if (type === "minor") return "二軍例行賽";
  return type || "";
}

function getTeamId(name) {
  const map = {
    "中信兄弟": "brothers",
    "統一7-ELEVEn獅": "lions",
    "樂天桃猿": "monkeys",
    "味全龍": "dragons",
    "富邦悍將": "guardians",
    "台鋼雄鷹": "hawks"
  };

  return map[name] || "";
}