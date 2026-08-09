console.log("✅ match.js v6.6.4-SEASON-RATES-DARK-FIX 已載入");

/* =========================================================
   Ray's CPBL Data Site
   Match Center v5.6.2-DIGITAL-CLOCK
   覆蓋位置：js/pages/match.js

   重點：
   - 不使用假資料
   - 支援 gameSno / date+home+away
   - 支援 dataQuality / finalLock / liveState
   - pregame 不蓋 LIVE / FINAL 的前端判斷
   - live 不蓋 FINAL 的前端判斷
   - Match Center 元素缺少時不爆頁
   - 支援打者 / 投手 tab
   - 支援資料品質卡
   - 支援官方逐球事件資料；沒有就明確顯示尚無資料
========================================================= */


/* =========================================================
   Match Center 內建智慧分析 fallback
   - 核心頁面不再依賴 ES Module import
   - 即使 file:// 直接開啟，也不會因 module CORS 讓整頁失效
   - 智慧分析只使用目前已載入的比賽資料
========================================================= */
function intelligenceNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function intelligenceText(value) {
  return String(value ?? "").trim();
}

function buildIntelligenceScoreTimeline(game = {}) {
  const away = Array.isArray(game.lineScore?.away) ? game.lineScore.away : [];
  const home = Array.isArray(game.lineScore?.home) ? game.lineScore.home : [];
  const count = Math.max(away.length, home.length);
  const timeline = [];
  let awayScore = 0;
  let homeScore = 0;

  for (let i = 0; i < count; i += 1) {
    const beforeAway = awayScore;
    const beforeHome = homeScore;
    const awayRuns = String(away[i]).toUpperCase() === "X" ? 0 : intelligenceNumber(away[i]);
    const homeRuns = String(home[i]).toUpperCase() === "X" ? 0 : intelligenceNumber(home[i]);

    awayScore += awayRuns;
    if (awayRuns > 0) {
      timeline.push({
        inning: i + 1, half: "TOP", runs: awayRuns,
        before: { away: beforeAway, home: beforeHome },
        after: { away: awayScore, home: homeScore }
      });
    }

    const beforeHomeHalf = { away: awayScore, home: homeScore };
    homeScore += homeRuns;
    if (homeRuns > 0) {
      timeline.push({
        inning: i + 1, half: "BOTTOM", runs: homeRuns,
        before: beforeHomeHalf,
        after: { away: awayScore, home: homeScore }
      });
    }
  }

  return timeline;
}

function intelligenceLeader(score) {
  if (score.away === score.home) return "TIE";
  return score.away > score.home ? "AWAY" : "HOME";
}

function findIntelligenceTurningPoint(game = {}) {
  const timeline = buildIntelligenceScoreTimeline(game);
  if (!timeline.length) return null;

  return timeline
    .map(event => {
      const beforeLeader = intelligenceLeader(event.before);
      const afterLeader = intelligenceLeader(event.after);
      const leadChange = beforeLeader !== afterLeader;
      const lateBonus = Math.max(0, event.inning - 5) * 4;
      const importance = Math.min(100, event.runs * 12 + lateBonus + (leadChange ? 35 : 0) + (afterLeader === "TIE" ? 20 : 0));
      return { ...event, importance };
    })
    .sort((a, b) => b.importance - a.importance || b.inning - a.inning)[0];
}

function rankIntelligenceCandidates(game = {}, limit = 3) {
  const candidates = [];
  for (const side of ["away", "home"]) {
    for (const player of game.batters?.[side] || []) {
      const name = intelligenceText(player.name);
      if (!name) continue;
      const score = 5 + intelligenceNumber(player.H) * 0.75 + intelligenceNumber(player.HR) * 1.5 + intelligenceNumber(player.RBI) * 0.55;
      candidates.push({
        name, side, type: "BATTER", score: Math.max(0, Math.min(10, score)),
        reasons: [
          intelligenceNumber(player.H) ? `${intelligenceNumber(player.H)} 安打` : "",
          intelligenceNumber(player.RBI) ? `${intelligenceNumber(player.RBI)} 打點` : "",
          intelligenceNumber(player.HR) ? `${intelligenceNumber(player.HR)} 全壘打` : ""
        ].filter(Boolean)
      });
    }
    for (const player of game.pitchers?.[side] || []) {
      const name = intelligenceText(player.name);
      if (!name) continue;
      const ip = intelligenceNumber(player.IP ?? player.InningsPitched ?? player.inningsPitched);
      const er = intelligenceNumber(player.ER ?? player.EarnedRun ?? player.earnedRuns);
      const so = intelligenceNumber(player.SO ?? player.StrikeOut ?? player.strikeouts);
      const score = 5 + ip * 0.45 + so * 0.18 - er * 0.75;
      candidates.push({
        name, side, type: "PITCHER", score: Math.max(0, Math.min(10, score)),
        reasons: [ip ? `${ip} 局` : "", `${er} 自責分`, so ? `${so} 三振` : ""].filter(Boolean)
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, limit).map(item => ({ ...item, score: Number(item.score.toFixed(1)) }));
}

function analyzeGame(game = {}) {
  const away = intelligenceText(game.meta?.away) || "客隊";
  const home = intelligenceText(game.meta?.home) || "主隊";
  const awayR = intelligenceNumber(game.totals?.away?.R);
  const homeR = intelligenceNumber(game.totals?.home?.R);
  const status = intelligenceText(game.meta?.status || game.status).toLowerCase();
  const turningPoint = findIntelligenceTurningPoint(game);
  const winner = awayR === homeR ? "雙方" : awayR > homeR ? away : home;
  const loser = awayR === homeR ? "" : awayR > homeR ? home : away;
  const headline = status === "final"
    ? (awayR === homeR ? `${away}與${home}戰成平手` : `${winner}以${Math.max(awayR, homeR)}：${Math.min(awayR, homeR)}擊敗${loser}`)
    : `${away} 對 ${home}`;
  let summary = status === "final"
    ? (awayR === homeR ? `${away}與${home}戰成平手。` : `${winner}以 ${Math.max(awayR, homeR)}：${Math.min(awayR, homeR)} 擊敗${loser}。`)
    : `目前比分 ${away} ${awayR}：${homeR} ${home}。`;
  if (turningPoint) summary += ` ${turningPoint.inning} 局${turningPoint.half === "TOP" ? "上" : "下"}攻下 ${turningPoint.runs} 分，是本場重要轉折。`;

  return {
    version: "6.4.1-standalone",
    gameSno: game.gameSno ?? null,
    status, headline, summary, turningPoint,
    mvpCandidates: rankIntelligenceCandidates(game),
    tags: [status === "final" ? "比賽結束" : status === "live" ? "比賽進行中" : ""].filter(Boolean),
    dataConfidence: (game.lineScore?.away?.length || game.lineScore?.home?.length) ? "HIGH" : "LIMITED"
  };
}

const LOCAL_BOX_KEY = "cpbl_boxscore";

const API_URL = "http://127.0.0.1:3002/api/live";
const STATIC_URL = "data/live/live-boxscore.json";
const PROBABLE_URL = "data/live/probable-pitchers.json";
const FINAL_VUE_URL = "data/live/final-boxscore-vue-2026.json";

const LIVE_REFRESH_MS = 30000;

let CURRENT_MATCH_DATA = null;
let ALL_MATCH_GAMES = [];
let CURRENT_GAME_SNO = null;
let CURRENT_QUERY = null;
let LIVE_REFRESH_TIMER = null;
let HERO_COUNTDOWN_TIMER = null;
let PROBABLE_PITCHERS_MAP = {};
let FINAL_VUE_MAP = {};

const MATCH_TAB_STATE = {
  batters: "away",
  pitchers: "away"
};

const TEAM_ID_MAP = {
  "中信兄弟": "brothers",
  "統一7-ELEVEn獅": "lions",
  "樂天桃猿": "monkeys",
  "味全龍": "dragons",
  "富邦悍將": "guardians",
  "台鋼雄鷹": "hawks"
};

const TEAM_COLOR = {
  "中信兄弟": "#FFD700",
  "統一7-ELEVEn獅": "#FF6B00",
  "樂天桃猿": "#7A0019",
  "味全龍": "#C8102E",
  "富邦悍將": "#0047AB",
  "台鋼雄鷹": "#006666"
};

const TYPE_TEXT = {
  regular: "一軍例行賽",
  exhibition: "一軍熱身賽",
  playoff: "季後賽",
  championship: "總冠軍賽",
  allstar: "明星賽",
  minor: "二軍例行賽"
};

const STATUS_TEXT = {
  scheduled: "⏳ 未開打",
  pregame: "⏳ 賽前",
  live: "🔴 LIVE",
  in_progress: "🔴 LIVE",
  final: "✅ FINAL",
  postponed: "🌧 延賽",
  suspended: "⏸ 保留比賽",
  cancelled: "❌ 取消"
};

document.addEventListener("DOMContentLoaded", initMatch);

/* =========================================================
   初始化
========================================================= */

async function initMatch() {
  try {
    showLoading();

    CURRENT_QUERY = readMatchQuery();

    console.log("🔎 Match Query：", CURRENT_QUERY);

    if (!CURRENT_QUERY.gameSno && !CURRENT_QUERY.date) {
      showError("❌ 缺少比賽參數：需要 gameSno 或 date/home/away");
      return;
    }

    [PROBABLE_PITCHERS_MAP, FINAL_VUE_MAP] = await Promise.all([
      loadProbablePitchers(),
      loadFinalVueBoxscores()
    ]);

    const games = await loadAllGames();
    ALL_MATCH_GAMES = Array.isArray(games) ? games : [];
    const box = findTargetGame(games, CURRENT_QUERY);

    if (!box) {
      console.warn("目前載入的 games：", games);
      showError("❌ 查無此比賽，請確認網址參數或 live-boxscore.json 是否已有此場資料。");
      return;
    }

    CURRENT_GAME_SNO = box.gameSno;

    const mergedBox = enrichFinalDisplayData(mergeGameProbablePitchers(box));

    syncToLocalStorage(
      games.map(g =>
        String(g.gameSno) === String(mergedBox.gameSno)
          ? mergedBox
          : g
      )
    );

    renderAll(mergedBox);
    startLiveAutoRefresh();

  } catch (err) {
    console.error("❌ Match Center 初始化失敗：", err);
    showError(`❌ Match Center 初始化失敗：${err.message}`);
  }
}

function readMatchQuery() {
  const params = new URLSearchParams(window.location.search);

  return {
    gameSno: cleanText(params.get("gameSno")),
    date: cleanText(params.get("date")),
    home: cleanText(params.get("home")),
    away: cleanText(params.get("away"))
  };
}

/* =========================================================
   資料讀取
========================================================= */

async function loadAllGames() {
  const staticJson = sanitizeGames(await readFromStaticJson());

  if (staticJson.length) {
    return staticJson.map(mergeGameProbablePitchers);
  }

  const api = sanitizeGames(await readFromApi());

  if (api.length) {
    return api.map(mergeGameProbablePitchers);
  }

  const local = sanitizeGames(readFromLocalStorage());

  if (local.length) {
    return local.map(mergeGameProbablePitchers);
  }

  return [];
}


function normalizeProbablePitchersMap(input = {}) {
  const map = {};

  function getGameKey(item) {
    if (!item || typeof item !== "object") return "";
    return cleanText(
      item.gameSno ??
      item.gameNo ??
      item.game_no ??
      item.id ??
      item.no ??
      item.GameSno ??
      item.GameNo ??
      ""
    );
  }

  function pickAwayPitcher(item) {
    if (!item || typeof item !== "object") return "";

    const nested = item.probablePitchers || item.starters || item.pitchers || {};

    return cleanText(
      item.awayProbablePitcher ||
      item.awayStarter ||
      item.awayPitcher ||
      item.visitingProbablePitcher ||
      item.visitingStarter ||
      item.VisitingPitcherName ||
      item.AwayPitcherName ||
      nested.awayName ||
      nested.awayPitcher ||
      nested.visiting ||
      nested.away ||
      item.awayName
    );
  }

  function pickHomePitcher(item) {
    if (!item || typeof item !== "object") return "";

    const nested = item.probablePitchers || item.starters || item.pitchers || {};

    return cleanText(
      item.homeProbablePitcher ||
      item.homeStarter ||
      item.homePitcher ||
      item.HomePitcherName ||
      nested.homeName ||
      nested.homePitcher ||
      nested.home ||
      item.homeName
    );
  }

  function addItem(item, fallbackKey = "") {
    if (!item || typeof item !== "object") return;

    const key = cleanText(getGameKey(item) || fallbackKey);
    if (!key) return;

    const away = pickAwayPitcher(item);
    const home = pickHomePitcher(item);

    if (!away && !home) return;

    map[key] = {
      ...(map[key] || {}),
      ...item,
      away,
      home,
      awayName: away,
      homeName: home
    };
  }

  if (Array.isArray(input)) {
    input.forEach(item => addItem(item));
    return map;
  }

  if (Array.isArray(input?.games)) {
    input.games.forEach(item => addItem(item));
  }

  if (Array.isArray(input?.items)) {
    input.items.forEach(item => addItem(item));
  }

  if (Array.isArray(input?.data)) {
    input.data.forEach(item => addItem(item));
  }

  if (input && typeof input === "object") {
    Object.entries(input).forEach(([key, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      addItem(value, key);
    });
  }

  return map;
}


async function loadFinalVueBoxscores() {
  try {
    const res = await fetchWithTimeout(`${FINAL_VUE_URL}?ts=${Date.now()}`, 2500);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const rows = toGameArray(await res.json());
    const map = {};

    for (const row of rows) {
      if (!row || row.gameSno == null) continue;
      map[String(row.gameSno)] = row;
    }

    console.log(`🧩 Match Center FINAL Vue fallback：${Object.keys(map).length} 場`);
    return map;
  } catch (err) {
    console.warn("⚠️ FINAL Vue fallback 讀取失敗：", err.message);
    return {};
  }
}

function hasCompleteSideTotals(totals, side) {
  const t = totals?.[side];
  return t && [t.R, t.H, t.E].every(v => v !== null && v !== undefined && v !== "");
}

function hasAnyInning(row) {
  return Array.isArray(row) && row.some(v => hasInningValue(v));
}

function enrichFinalDisplayData(game) {
  if (!game || game.gameSno == null) return game;

  const fallback = FINAL_VUE_MAP?.[String(game.gameSno)];
  if (!fallback) return game;

  const fallbackConfirmed =
    String(fallback.parseStatus || "").toLowerCase() === "confirmed" ||
    String(fallback.dataQuality?.status || "").toLowerCase() === "confirmed" ||
    String(fallback.dataQuality?.rhe || "").toLowerCase() === "confirmed";

  if (!fallbackConfirmed) return game;

  const currentTotals = game.totals || {};
  const fallbackTotals = fallback.totals || {};
  const currentLine = game.lineScore || {};
  const fallbackLine = fallback.lineScore || {};

  const awayTotalsMissing = !hasCompleteSideTotals(currentTotals, "away");
  const homeTotalsMissing = !hasCompleteSideTotals(currentTotals, "home");
  const awayLineMissing = !hasAnyInning(currentLine.away);
  const homeLineMissing = !hasAnyInning(currentLine.home);

  if (!awayTotalsMissing && !homeTotalsMissing && !awayLineMissing && !homeLineMissing) {
    return game;
  }

  console.warn(`🛟 #${game.gameSno} 比賽中心資料不完整，使用 FINAL Vue 補齊：`, {
    awayTotalsMissing, homeTotalsMissing, awayLineMissing, homeLineMissing
  });

  return normalizeGameShape({
    ...game,
    totals: {
      away: awayTotalsMissing ? fallbackTotals.away : currentTotals.away,
      home: homeTotalsMissing ? fallbackTotals.home : currentTotals.home
    },
    lineScore: {
      ...currentLine,
      away: awayLineMissing ? fallbackLine.away : currentLine.away,
      home: homeLineMissing ? fallbackLine.home : currentLine.home
    },
    dataQuality: {
      ...(game.dataQuality || {}),
      matchCenterFallback: "final-boxscore-vue"
    }
  });
}

async function loadProbablePitchers() {
  try {
    const res = await fetchWithTimeout(`${PROBABLE_URL}?ts=${Date.now()}`, 2000);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    console.log("🎯 Match Center 讀到預告先發：", data);

    return normalizeProbablePitchersMap(data);

  } catch (err) {
    console.warn("⚠️ probable-pitchers.json 讀取失敗：", err.message);
    return {};
  }
}

async function readFromStaticJson() {
  try {
    const res = await fetchWithTimeout(`${STATIC_URL}?ts=${Date.now()}`, 2500);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return toGameArray(await res.json());

  } catch (err) {
    console.warn("⚠️ static JSON 讀取失敗：", err.message);
    return [];
  }
}

async function readFromApi() {
  try {
    const res = await fetchWithTimeout(API_URL, 1800);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return toGameArray(await res.json());

  } catch (err) {
    console.warn("⚠️ API 讀取失敗：", err.message);
    return [];
  }
}

function readFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_BOX_KEY);

    if (!raw) return [];

    return toGameArray(JSON.parse(raw));

  } catch {
    localStorage.removeItem(LOCAL_BOX_KEY);
    return [];
  }
}

function syncToLocalStorage(games) {
  if (!Array.isArray(games) || !games.length) return;

  const map = {};

  games.forEach(g => {
    if (g && g.gameSno != null) {
      map[String(g.gameSno)] = g;
    }
  });

  try {
    localStorage.setItem(LOCAL_BOX_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn("⚠️ localStorage 寫入失敗：", err.message);
  }
}

function toGameArray(data) {
  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.games)) return data.games;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;

  if (data && typeof data === "object") {
    return Object.values(data).filter(v => v && typeof v === "object");
  }

  return [];
}

function sanitizeGames(games) {
  return toGameArray(games)
    .filter(isUsableGame)
    .map(normalizeGameShape)
    .map(applyFrontendLocks);
}

function isUsableGame(game) {
  if (!game || typeof game !== "object") return false;
  if (game.gameSno === undefined || game.gameSno === null) return false;

  const meta = game.meta || {};

  return !!meta.home && !!meta.away && !!meta.date;
}

function normalizeGameShape(game) {
  const normalized = {
    ...game,
    gameSno: Number(game.gameSno),
    meta: normalizeMeta(game.meta),
    lineScore: normalizeLineScore(game.lineScore),
    totals: normalizeTotals(game.totals),
    batters: normalizePlayerGroup(game.batters),
    pitchers: normalizePlayerGroup(game.pitchers),
    pregame: normalizePregame(game.pregame),
    liveState: normalizeLiveState(game.liveState),
    dataQuality: normalizeDataQuality(game.dataQuality),
    finalLock: normalizeFinalLock(game.finalLock),
    playByPlay: normalizePlayByPlay(game.playByPlay || game.plays || game.events || game.pbp)
  };

  return normalized;
}

function normalizeMeta(meta = {}) {
  const rawStatus = cleanText(meta.status || "scheduled");
  const status = normalizeStatus(rawStatus, meta);

  return {
    date: cleanText(meta.date),
    home: cleanText(meta.home || "主隊"),
    away: cleanText(meta.away || "客隊"),
    status,
    rawStatus,
    statusText: cleanText(meta.statusText),
    type: cleanText(meta.type || "regular"),
    typeText: cleanText(meta.typeText),
    time: cleanText(meta.time),
    duration: cleanText(meta.duration),
    venue: cleanText(meta.venue),
    officialUrl: cleanText(meta.officialUrl),
    urlMode: cleanText(meta.urlMode),
    win: cleanText(meta.win),
    lose: cleanText(meta.lose),
    save: cleanText(meta.save),
    mvp: cleanText(meta.mvp)
  };
}

function normalizeStatus(status, meta = {}) {
  const s = String(status || "").toLowerCase();

  if (s === "in_progress") return "live";
  if (s === "playing") return "live";
  if (s === "live") return "live";
  if (s === "final") return "final";
  if (s === "finished") return "final";
  if (s === "postponed") return "postponed";
  if (s === "suspended") return "suspended";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "pregame") return "pregame";
  if (s === "scheduled") return "scheduled";

  const text = `${meta.statusText || ""} ${status || ""}`;

  if (/比賽中|進行中|LIVE/i.test(text)) return "live";
  if (/結束|FINAL|完賽/i.test(text)) return "final";
  if (/延賽/.test(text)) return "postponed";
  if (/保留/.test(text)) return "suspended";
  if (/取消/.test(text)) return "cancelled";

  return "scheduled";
}

function pickSide(source = {}, side = "away") {
  if (!source || typeof source !== "object") return undefined;

  const aliases = side === "away"
    ? ["away", "visitor", "guest", "road", "awayTeam", "visitorTeam"]
    : ["home", "host", "homeTeam"];

  for (const key of aliases) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }

  return undefined;
}

function normalizeLineScore(lineScore = {}) {
  const away = pickSide(lineScore, "away");
  const home = pickSide(lineScore, "home");

  return {
    away: normalizeInningArray(away),
    home: normalizeInningArray(home)
  };
}

function normalizeInningArray(row = []) {
  if (!Array.isArray(row)) return [];

  return row.map(normalizeInningCell);
}

function normalizeInningCell(value) {
  if (value === null || value === undefined) return "";
  if (value === "X") return "X";

  const text = String(value).trim();

  if (!text || text === "—" || text === "-") return "";
  if (text.toUpperCase() === "X") return "X";

  const n = Number(text);

  return Number.isFinite(n) ? n : text;
}

function hasInningValue(value) {
  if (value === "X") return true;
  if (value === 0 || value === "0") return true;
  if (value === null || value === undefined || value === "") return false;

  return String(value).trim() !== "";
}

function formatInningCell(value) {
  if (value === 0 || value === "0") return "0";
  if (value === "X") return "X";
  if (value === null || value === undefined || value === "") return "—";

  return String(value);
}

function getInningScore(lineScore, side, inningIndex) {
  const row = Array.isArray(lineScore?.[side]) ? lineScore[side] : [];

  return formatInningCell(row[inningIndex]);
}


function parseLiveInningInfo(text = "") {
  const s = cleanText(text);
  const m = s.match(/^(\d+)\s*局\s*([上下])$/);

  if (!m) {
    return {
      inning: null,
      half: ""
    };
  }

  return {
    inning: Number(m[1]),
    half: m[2] === "上" ? "top" : "bottom"
  };
}

function getLastKnownInningIndex(lineScore = {}, side = "away") {
  const row = Array.isArray(lineScore?.[side]) ? lineScore[side] : [];
  let last = -1;

  for (let i = 0; i < 9; i++) {
    if (hasInningValue(row[i])) last = i;
  }

  return last;
}

function getLiveDisplayLimit(data, side = "away") {
  const info = parseLiveInningInfo(data?.liveState?.inningText || "");

  if (!info.inning || info.inning < 1) return 0;

  if (side === "away") {
    return Math.min(info.inning, 9);
  }

  // 4局上：主隊最多只應顯示到第3局；4局下：主隊可顯示第4局。
  return Math.min(info.half === "top" ? info.inning - 1 : info.inning, 9);
}

function shouldBackfillZero(data, lineScore = {}, side = "away", inningIndex = 0) {
  const status = data?.meta?.status || "";
  const quality = cleanText(data?.dataQuality?.lineScore || "");

  if (!["live", "final"].includes(status)) return false;
  if (!["partial", "confirmed"].includes(quality)) return false;

  const lastKnown = getLastKnownInningIndex(lineScore, side);
  const liveLimit = getLiveDisplayLimit(data, side);
  const displayLimit = Math.max(lastKnown + 1, liveLimit);

  // 若某隊第4局有1分，前面空格就代表0，不是尚未同步。
  return inningIndex < displayLimit;
}

function getDisplayInningCell(data, lineScore = {}, side = "away", inningIndex = 0) {
  const row = Array.isArray(lineScore?.[side]) ? lineScore[side] : [];
  const value = row[inningIndex];

  if (hasInningValue(value)) {
    return formatInningCell(value);
  }

  if (shouldBackfillZero(data, lineScore, side, inningIndex)) {
    return "0";
  }

  return "—";
}


function getDisplayInningCount(lineScore = {}, data = null) {
  const away = Array.isArray(lineScore.away) ? lineScore.away : [];
  const home = Array.isArray(lineScore.home) ? lineScore.home : [];
  let last = -1;

  for (let i = 0; i < 9; i++) {
    if (hasInningValue(away[i]) || hasInningValue(home[i])) {
      last = i;
    }
  }

  if (data) {
    last = Math.max(
      last,
      getLiveDisplayLimit(data, "away") - 1,
      getLiveDisplayLimit(data, "home") - 1
    );
  }

  return Math.max(last + 1, 0);
}

function normalizeTotals(totals = {}) {
  const away = pickSide(totals, "away") || {};
  const home = pickSide(totals, "home") || {};

  const readStat = (obj, key) => obj?.[key] ?? obj?.[key.toLowerCase()] ?? obj?.[{R:"runs",H:"hits",E:"errors"}[key]];

  return {
    away: {
      R: toNullableNumber(readStat(away, "R")),
      H: toNullableNumber(readStat(away, "H")),
      E: toNullableNumber(readStat(away, "E"))
    },
    home: {
      R: toNullableNumber(readStat(home, "R")),
      H: toNullableNumber(readStat(home, "H")),
      E: toNullableNumber(readStat(home, "E"))
    }
  };
}

function normalizePlayerGroup(group = {}) {
  return {
    away: Array.isArray(group.away) ? group.away : [],
    home: Array.isArray(group.home) ? group.home : []
  };
}

function normalizePregame(pregame) {
  if (!pregame || typeof pregame !== "object") {
    return {
      starters: {
        away: "",
        home: ""
      },
      lineups: {
        away: [],
        home: []
      }
    };
  }

  return {
    ...pregame,
    starters: {
      away: cleanText(pregame.starters?.away),
      home: cleanText(pregame.starters?.home)
    },
    lineups: {
      away: Array.isArray(pregame.lineups?.away) ? pregame.lineups.away : [],
      home: Array.isArray(pregame.lineups?.home) ? pregame.lineups.home : []
    }
  };
}

function normalizeLiveState(liveState) {
  if (!liveState || typeof liveState !== "object") return null;

  const debugLines = Array.isArray(liveState.debug?.lines)
    ? liveState.debug.lines
    : [];

  const fallbackBatter = extractValueAfterLabel(debugLines, ["打擊", "打者", "BATTER"]);
  const fallbackPitcher = extractValueAfterLabel(debugLines, ["投手", "PITCHER"]);

  return {
    source: cleanText(liveState.source),
    quality: cleanText(liveState.quality || liveState.confidence),
    inningText: cleanText(liveState.inningText || liveState.inning || guessInningFromLiveLines(debugLines)),
    half: cleanText(liveState.half),
    battingTeam: cleanText(liveState.battingTeam || liveState.offenseTeam),
    fieldingTeam: cleanText(liveState.fieldingTeam || liveState.defenseTeam),
    batter: cleanText(liveState.batter || liveState.currentBatter || fallbackBatter),
    pitcher: cleanText(liveState.pitcher || liveState.currentPitcher || fallbackPitcher),
    pitchCount: liveState.pitchCount ?? liveState.pitchNumber ?? guessPitchCountFromLiveLines(debugLines),
    pitchLabel: cleanText(liveState.pitchLabel),
    recentEvents: Array.isArray(liveState.recentEvents)
      ? liveState.recentEvents.map(cleanText).filter(Boolean)
      : Array.isArray(liveState.lastEvents)
        ? liveState.lastEvents.map(cleanText).filter(Boolean)
        : [],
    recentEventsText: cleanText(liveState.recentEventsText),
    message: cleanText(liveState.message),
    balls: toNullableNumber(liveState.balls),
    strikes: toNullableNumber(liveState.strikes),
    outs: toNullableNumber(liveState.outs),
    bases: normalizeBases(liveState.bases),
    debug: liveState.debug || {}
  };
}

function normalizeBases(bases) {
  if (!bases || typeof bases !== "object") {
    return {
      first: false,
      second: false,
      third: false
    };
  }

  return {
    first: !!bases.first,
    second: !!bases.second,
    third: !!bases.third
  };
}

function normalizeDataQuality(dataQuality) {
  if (!dataQuality || typeof dataQuality !== "object") {
    return {
      level: "unknown",
      source: "",
      message: "",
      updatedAt: "",
      flags: [],
      warnings: []
    };
  }

  const detailedFields = [
    dataQuality.score,
    dataQuality.rhe,
    dataQuality.lineScore,
    dataQuality.batters,
    dataQuality.pitchers,
    dataQuality.result,
    dataQuality.finalLock
  ].filter(Boolean);

  let inferredLevel = cleanText(dataQuality.level || dataQuality.status || "");

  if (!inferredLevel && detailedFields.length) {
    if (detailedFields.some(v => String(v).toLowerCase() === "debug" || String(v).toLowerCase() === "failed")) {
      inferredLevel = "bad";
    } else if (detailedFields.some(v => String(v).toLowerCase() === "partial")) {
      inferredLevel = "partial";
    } else if (detailedFields.every(v => String(v).toLowerCase() === "confirmed")) {
      inferredLevel = "good";
    }
  }

  return {
    ...dataQuality,
    level: cleanText(inferredLevel || "unknown"),
    source: cleanText(dataQuality.source),
    message: cleanText(dataQuality.message || dataQuality.note),
    updatedAt: cleanText(dataQuality.updatedAt || dataQuality.lastUpdated),
    flags: Array.isArray(dataQuality.flags) ? dataQuality.flags : [],
    warnings: Array.isArray(dataQuality.warnings) ? dataQuality.warnings : [],
    score: cleanText(dataQuality.score),
    rhe: cleanText(dataQuality.rhe),
    lineScore: cleanText(dataQuality.lineScore),
    batters: cleanText(dataQuality.batters),
    pitchers: cleanText(dataQuality.pitchers),
    result: cleanText(dataQuality.result),
    finalLock: cleanText(dataQuality.finalLock),
    mode: cleanText(dataQuality.mode),
    manualOverride: cleanText(dataQuality.manualOverride)
  };
}

function normalizeFinalLock(finalLock) {
  if (!finalLock) return null;

  if (typeof finalLock === "boolean") {
    return {
      locked: finalLock,
      source: "",
      lockedAt: ""
    };
  }

  if (typeof finalLock === "object") {
    return {
      locked: !!finalLock.locked,
      source: cleanText(finalLock.source),
      lockedAt: cleanText(finalLock.lockedAt || finalLock.time)
    };
  }

  return null;
}

function normalizePlayByPlay(input) {
  if (!input) return [];

  const arr = Array.isArray(input) ? input : Object.values(input);

  return arr
    .filter(item => item && typeof item === "object")
    .map(item => ({
      inning: cleanText(item.inning || item.inningText || item.period),
      time: cleanText(item.time || item.createdAt || item.updatedAt),
      title: cleanText(item.title || item.event || item.result || item.text),
      desc: cleanText(item.desc || item.description || item.detail || item.note),
      score: cleanText(item.score),
      type: cleanText(item.type)
    }))
    .filter(item => item.title || item.desc);
}

function getProtectedFrontendStatus(game = {}) {
  const statusValues = [
    game?.meta?.status,
    game?.status,
    game?.dataQuality?.stage
  ].map(v => String(v || "").trim().toLowerCase());

  const statusTextValues = [
    game?.meta?.statusText,
    game?.statusText
  ].map(v => String(v || "").trim());

  if (
    statusValues.some(v => v === "suspended") ||
    statusTextValues.some(v => /^(保留比賽|保留賽|賽事中止|中止比賽|續賽)$/.test(v))
  ) {
    return "suspended";
  }

  if (
    statusValues.some(v => v === "postponed") ||
    statusTextValues.some(v => /^(延賽|時間未定|因雨延賽)$/.test(v))
  ) {
    return "postponed";
  }

  if (
    statusValues.some(v => v === "cancelled" || v === "canceled") ||
    statusTextValues.some(v => /^(取消|比賽取消|取消比賽)$/.test(v))
  ) {
    return "cancelled";
  }

  return "";
}

function applyFrontendLocks(game) {
  if (!game) return game;

  const protectedStatus = getProtectedFrontendStatus(game);

  // 延賽／保留比賽／取消的狀態優先級高於任何殘留 finalLock。
  if (protectedStatus) {
    const statusText = protectedStatus === "suspended"
      ? "保留比賽"
      : protectedStatus === "postponed"
        ? "延賽"
        : "取消";

    return {
      ...game,
      status: protectedStatus,
      statusText,
      meta: {
        ...game.meta,
        status: protectedStatus,
        statusText
      },
      finalLock: null,
      dataQuality: {
        ...(game.dataQuality || {}),
        stage: protectedStatus,
        flags: Array.isArray(game.dataQuality?.flags)
          ? game.dataQuality.flags.filter(flag => flag !== "finalLock")
          : []
      }
    };
  }

  const finalLocked =
    game.finalLock === true ||
    game.finalLock?.locked === true ||
    game.dataQuality?.flags?.includes?.("finalLock");

  if (finalLocked) {
    return {
      ...game,
      meta: {
        ...game.meta,
        status: "final"
      },
      finalLock: {
        ...(game.finalLock || {}),
        locked: true
      }
    };
  }

  return game;
}

/* =========================================================
   找比賽
========================================================= */

function findTargetGame(games, query) {
  if (!Array.isArray(games)) return null;

  if (query.gameSno) {
    const bySno = games.find(g => String(g.gameSno) === String(query.gameSno));

    if (bySno) return bySno;
  }

  if (query.date && query.home && query.away) {
    return games.find(g => {
      const meta = g.meta || {};

      return cleanText(meta.date) === query.date &&
        sameTeam(meta.home, query.home) &&
        sameTeam(meta.away, query.away);
    }) || null;
  }

  if (query.date) {
    return games.find(g => cleanText(g.meta?.date) === query.date) || null;
  }

  return null;
}

function sameTeam(a, b) {
  return cleanTeamName(a) === cleanTeamName(b);
}

function cleanTeamName(name) {
  return decodeURIComponent(String(name || ""))
    .replace(/\s+/g, "")
    .replace(/7-ELEVEn/gi, "7-ELEVEn")
    .trim();
}

/* =========================================================
   預告先發合併
========================================================= */

function mergeGameProbablePitchers(game) {
  if (!game || !game.gameSno) return game;

  const probable = PROBABLE_PITCHERS_MAP?.[String(game.gameSno)];

  if (!probable) return game;

  const awayStarter =
    cleanText(probable.away) ||
    cleanText(game.pregame?.starters?.away);

  const homeStarter =
    cleanText(probable.home) ||
    cleanText(game.pregame?.starters?.home);

  return {
    ...game,
    pregame: {
      ...(game.pregame || {}),
      starters: {
        ...(game.pregame?.starters || {}),
        away: awayStarter,
        home: homeStarter
      },
      lineups: {
        away: Array.isArray(game.pregame?.lineups?.away)
          ? game.pregame.lineups.away
          : [],
        home: Array.isArray(game.pregame?.lineups?.home)
          ? game.pregame.lineups.home
          : []
      }
    }
  };
}

/* =========================================================
   渲染總入口
========================================================= */

function renderAll(data) {
  CURRENT_MATCH_DATA = data;

  renderBasic(data);
  renderScore(data);
  renderStarterDuel(data);
  renderPregameUX(data);
  renderHeroCountdown(data);
  renderMatchProgress(data);
  renderDataQuality(data);
  renderIntelligence(data);
  renderLiveStatus(data);
  renderPlayByPlay(data);
  renderTotals(data);
  renderInnings(data);
  renderDecisions(data);
  updateTeamSwitchLabels(data);
  renderBatters(data);
  renderPitchers(data);
  bindStatTabs();
  bindRefreshButton();
  bindOfficialButton(data);
}


const TEAM_PROFILE_IDS = {
  "中信兄弟": "brothers",
  "統一7-ELEVEn獅": "lions",
  "樂天桃猿": "monkeys",
  "味全龍": "dragons",
  "富邦悍將": "guardians",
  "台鋼雄鷹": "hawks"
};

function teamNameLink(name, options = {}) {
  const teamName = cleanText(name);
  const teamId = TEAM_PROFILE_IDS[teamName] || "";
  if (!teamName || !teamId) return escapeHtml(teamName || "—");
  const className = cleanText(options.className || "team-profile-link");
  return `<a class="${escapeHtml(className)}" href="team.html?team=${encodeURIComponent(teamId)}" title="查看 ${escapeHtml(teamName)} 球隊頁">${escapeHtml(teamName)}</a>`;
}

function playerProfileUrl(name) {
  const playerName = cleanText(name);
  if (!playerName || playerName === "—") return "";
  return `player.html?name=${encodeURIComponent(playerName)}`;
}

function playerNameLink(name, options = {}) {
  const playerName = cleanText(name);
  if (!playerName || playerName === "—") return escapeHtml(playerName || "—");

  const href = playerProfileUrl(playerName);
  const className = cleanText(options.className || "player-profile-link");
  const title = options.title || `查看 ${playerName} 球員頁`;
  return `<a class="${escapeHtml(className)}" href="${href}" title="${escapeHtml(title)}">${escapeHtml(playerName)}</a>`;
}

function labeledPlayerLink(label, name, emptyText = "—") {
  const playerName = cleanText(name);
  if (!playerName || playerName === "—") return `${escapeHtml(label)} ${escapeHtml(emptyText)}`;
  return `${escapeHtml(label)} ${playerNameLink(playerName)}`;
}

function renderIntelligence(data) {
  const root = document.getElementById("baseballIntelligence");
  if (!root) return;

  const insight = analyzeGame(data);
  const point = insight.turningPoint;
  const away = cleanText(data.meta?.away) || "客隊";
  const home = cleanText(data.meta?.home) || "主隊";
  const sideName = side => side === "away" ? away : home;

  const turningHtml = point
    ? `<div class="intelligence-panel">
        <span class="intelligence-label">🔥 關鍵轉折</span>
        <strong>${point.inning} 局${point.half === "TOP" ? "上" : "下"}・${point.runs} 分攻勢</strong>
        <p>比分由 ${point.before.away}：${point.before.home} 改寫為 ${point.after.away}：${point.after.home}，影響指數 ${point.importance}。</p>
      </div>`
    : `<div class="intelligence-panel is-muted"><span class="intelligence-label">🔥 關鍵轉折</span><p>目前資料尚不足以判斷轉折點。</p></div>`;

  const mvpHtml = insight.mvpCandidates.length
    ? insight.mvpCandidates.map((player, index) => `
      <article class="intelligence-mvp">
        <span class="intelligence-rank">${index + 1}</span>
        <div><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(sideName(player.side))}・${player.type === "PITCHER" ? "投手" : "打者"}</small></div>
        <div class="intelligence-score">${player.score}</div>
        <p>${player.reasons.map(escapeHtml).join("・") || "依本場數據綜合評估"}</p>
      </article>`).join("")
    : `<p class="muted">目前尚無足夠球員成績可產生候選名單。</p>`;

  root.innerHTML = `
    <div class="intelligence-head">
      <div><span class="progress-kicker">RAY BASEBALL INTELLIGENCE</span><h2>智慧比賽分析</h2></div>
      <span class="intelligence-confidence">資料可信度：${insight.dataConfidence}</span>
    </div>
    <div class="intelligence-story"><h3>${escapeHtml(insight.headline)}</h3><p>${escapeHtml(insight.summary)}</p></div>
    <div class="intelligence-grid">${turningHtml}<div class="intelligence-panel"><span class="intelligence-label">⭐ Ray 智慧 MVP</span><div class="intelligence-mvp-list">${mvpHtml}</div></div></div>
    <p class="intelligence-disclaimer">智慧分析由本站規則引擎依現有比賽資料產生，並非聯盟官方評選或賽果預測。</p>`;
}

/* =========================================================
   LIVE 自動刷新
========================================================= */

function startLiveAutoRefresh() {
  if (LIVE_REFRESH_TIMER) clearInterval(LIVE_REFRESH_TIMER);

  const status = CURRENT_MATCH_DATA?.meta?.status || "";

  if (["final", "postponed", "cancelled", "suspended"].includes(status)) {
    LIVE_REFRESH_TIMER = null;
    return;
  }

  LIVE_REFRESH_TIMER = setInterval(async () => {
    await refreshCurrentGame();
  }, LIVE_REFRESH_MS);
}

async function refreshCurrentGame() {
  if (!CURRENT_GAME_SNO && !CURRENT_QUERY) return;

  try {
    [PROBABLE_PITCHERS_MAP, FINAL_VUE_MAP] = await Promise.all([
      loadProbablePitchers(),
      loadFinalVueBoxscores()
    ]);

    const games = await loadAllGames();
    const freshBox = findTargetGame(games, {
      ...(CURRENT_QUERY || {}),
      gameSno: CURRENT_GAME_SNO || CURRENT_QUERY?.gameSno
    });

    if (!freshBox) return;

    const mergedBox = mergeGameProbablePitchers(freshBox);

    CURRENT_GAME_SNO = mergedBox.gameSno;

    syncToLocalStorage(
      games.map(g =>
        String(g.gameSno) === String(mergedBox.gameSno)
          ? mergedBox
          : g
      )
    );

    renderAll(mergedBox);

  } catch (err) {
    console.warn("⚠️ Match Center 自動刷新失敗：", err);
  }
}

/* =========================================================
   基本資訊
========================================================= */

function renderBasic(data) {
  const meta = data.meta || {};
  const away = meta.away || "客隊";
  const home = meta.home || "主隊";

  setText("matchHeaderSub", `${meta.date || "日期待補"}｜${away} VS ${home}`);
  setText("matchDate", `📅 ${meta.date || "日期待補"}`);
  setText("matchVenue", `🏟 ${meta.venue || "球場待定"}`);

  if (meta.status === "live") {
    setText("matchTime", "🔴 比賽進行中");
  } else if (meta.status === "final") {
    setText("matchTime", `✅ ${meta.duration || "比賽結束"}`);
  } else {
    setText("matchTime", `⏰ ${meta.time || meta.duration || "時間未定"}`);
  }

  setText("matchType", `🏷 ${TYPE_TEXT[meta.type] || meta.typeText || meta.type || "賽程別未定"}`);
  setText("gameIdDisplay", `GameSno：${data.gameSno ?? "—"}`);

  setText("homeTeam", home);
  setText("awayTeam", away);

  setLogo("homeLogo", home);
  setLogo("awayLogo", away);

  setText("matchStatus", getStatusText(meta.status));

  applyMatchTheme(home, away);
}

function applyMatchTheme(home, away) {
  const homeColor = TEAM_COLOR[home] || "#333333";
  const awayColor = TEAM_COLOR[away] || "#666666";

  document.body.classList.add("theme-match");
  document.body.style.setProperty("--home-color", homeColor);
  document.body.style.setProperty("--away-color", awayColor);
  document.body.style.setProperty("--home-color-light", `${homeColor}22`);
  document.body.style.setProperty("--away-color-light", `${awayColor}22`);

  const hero = document.querySelector(".match-hero");

  if (hero) {
    hero.style.background = `
      radial-gradient(circle at top left, rgba(255,255,255,0.12), transparent 30%),
      linear-gradient(90deg, ${awayColor} 0%, #111827 50%, ${homeColor} 100%)
    `;
    hero.style.color = "#fff";
  }
}

/* =========================================================
   比分
========================================================= */

function renderScore(data) {
  const status = data.meta?.status || "scheduled";

  if (status === "final" || status === "live") {
    setText("homeScore", formatScore(data.totals?.home?.R));
    setText("awayScore", formatScore(data.totals?.away?.R));
    markWinner(data);
    return;
  }

  setText("homeScore", "—");
  setText("awayScore", "—");
}

function markWinner(data) {
  const homeEl = document.getElementById("homeScore");
  const awayEl = document.getElementById("awayScore");

  if (!homeEl || !awayEl) return;

  homeEl.classList.remove("winner", "loser");
  awayEl.classList.remove("winner", "loser");

  const h = data.totals?.home?.R;
  const a = data.totals?.away?.R;

  if (!Number.isFinite(h) || !Number.isFinite(a)) return;

  if (h > a) {
    homeEl.classList.add("winner");
    awayEl.classList.add("loser");
  } else if (a > h) {
    awayEl.classList.add("winner");
    homeEl.classList.add("loser");
  }
}


/* =========================================================
   賽前 UX 狀態卡
========================================================= */

function renderPregameUX(data) {
  const box = document.getElementById("pregameUxCard");

  if (!box) return;

  const meta = data.meta || {};
  const status = meta.status || "scheduled";
  const isPregame = status === "scheduled" || status === "pregame";

  if (!isPregame) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  const starters = getStarterPair(data);
  const awayLineup = Array.isArray(data.pregame?.lineups?.away)
    ? data.pregame.lineups.away
    : [];
  const homeLineup = Array.isArray(data.pregame?.lineups?.home)
    ? data.pregame.lineups.home
    : [];

  const countdown = getGameCountdown(meta.date, meta.time);
  const lineupReady = awayLineup.length > 0 || homeLineup.length > 0;
  const starterReady = !!(starters.away || starters.home);

  box.hidden = false;
  box.innerHTML = `
    <div class="pregame-ux-head">
      <div>
        <span class="pregame-ux-kicker">PREGAME CENTER</span>
        <h2>賽前資料狀態</h2>
      </div>
      <div class="pregame-countdown ${escapeHtml(countdown.tone)}">
        ${escapeHtml(countdown.label)}
      </div>
    </div>

    <div class="pregame-ux-grid">
      <div class="pregame-ux-item ${starterReady ? "is-ok" : "is-waiting"}">
        <span>先發投手</span>
        <strong>${starterReady ? "已公布" : "尚未公布"}</strong>
        <p>${teamNameLink(meta.away || "客隊")}：${starters.away ? playerNameLink(starters.away) : "—"}｜${teamNameLink(meta.home || "主隊")}：${starters.home ? playerNameLink(starters.home) : "—"}</p>
      </div>

      <div class="pregame-ux-item ${lineupReady ? "is-ok" : "is-waiting"}">
        <span>先發打序</span>
        <strong>${lineupReady ? "已同步" : "尚未同步"}</strong>
        <p>客隊 ${awayLineup.length} 人｜主隊 ${homeLineup.length} 人</p>
      </div>

      <div class="pregame-ux-item is-waiting">
        <span>LIVE 狀態</span>
        <strong>尚未開始</strong>
        <p>開打後才會顯示局數、壘包、球數、目前打者與投手。</p>
      </div>

      <div class="pregame-ux-item is-safe">
        <span>FINAL 鎖定</span>
        <strong>未鎖定</strong>
        <p>此場尚未結束，不會被 FINAL 流程誤鎖。</p>
      </div>
    </div>

    <p class="pregame-ux-note">
      賽前階段空白不代表壞掉；打者與投手正式成績會在比賽開始後或賽後逐步出現。
    </p>
  `;
}

function getGameCountdown(dateText, timeText) {
  const start = parseGameStartDate(dateText, timeText);

  if (!start) {
    return {
      label: "開賽時間待確認",
      tone: "neutral"
    };
  }

  const diffMs = start.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin > 0) {
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    const label = hours > 0
      ? `距離開賽約 ${hours} 小時 ${mins} 分`
      : `距離開賽約 ${mins} 分`;

    return {
      label,
      tone: diffMin <= 60 ? "soon" : "normal"
    };
  }

  if (diffMin > -240) {
    return {
      label: "已到開賽時間，等待 LIVE 同步",
      tone: "soon"
    };
  }

  return {
    label: "比賽時間已過，等待資料更新",
    tone: "neutral"
  };
}

function parseGameStartDate(dateText, timeText) {
  const date = cleanText(dateText);
  const time = cleanText(timeText);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{1,2}:\d{2}$/.test(time)) return null;

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function qualityToneFromValue(value) {
  const s = String(value || "").toLowerCase();

  if (s === "confirmed") return "good";
  if (s === "partial") return "warn";
  if (s === "debug" || s === "failed" || s === "error") return "bad";
  if (s === "applied") return "manual";

  return "neutral";
}

function buildDetailedQualityChips(dq = {}, data = {}) {
  const chips = [];
  const fields = [
    ["比分", dq.score],
    ["RHE", dq.rhe],
    ["逐局", dq.lineScore],
    ["打者", dq.batters],
    ["投手", dq.pitchers],
    ["結果", dq.result]
  ];

  fields.forEach(([label, value]) => {
    if (!value) return;

    chips.push({
      label: `${label} ${value}`,
      tone: qualityToneFromValue(value)
    });
  });

  const flags = Array.isArray(dq.flags) ? dq.flags : [];
  const mode = cleanText(dq.mode || data.meta?.urlMode || "");

  if (flags.includes("recentFinalGuard") || mode.includes("recent") || mode.includes("stats-cpbl-fallback")) {
    chips.push({
      label: "近期資料已交叉驗證",
      tone: "manual"
    });
  }

  if (mode.includes("stats-cpbl-fallback") || data.debug?.final?.detailMeta?.usedMode?.includes?.("stats-cpbl-fallback")) {
    chips.push({
      label: "stats fallback 已使用",
      tone: "manual"
    });
  }

  if (dq.manualOverride === "applied" || data.debug?.manualOverride?.applied) {
    chips.push({
      label: "manual override 已套用",
      tone: "manual"
    });
  }

  return chips;
}

/* =========================================================
   資料品質卡
========================================================= */

function renderDataQuality(data) {
  const box = document.getElementById("matchDataQuality");

  if (!box) return;

  const dq = data.dataQuality || {};
  const meta = data.meta || {};
  const finalLock = data.finalLock || null;

  const level = normalizeQualityLevel(dq.level);
  const levelText = getQualityLevelText(level);
  const source = dq.source || "live-boxscore.json";
  const updatedAt = dq.updatedAt || "";
  const message = dq.message || getDefaultQualityMessage(data);
  const flags = Array.isArray(dq.flags) ? dq.flags : [];
  const warnings = Array.isArray(dq.warnings) ? dq.warnings : [];

  const hasBatters =
    data.batters?.away?.length ||
    data.batters?.home?.length;

  const hasPitchers =
    data.pitchers?.away?.length ||
    data.pitchers?.home?.length;

  const hasLineScore = getDisplayInningCount(data.lineScore || {}, data) > 0;

  const chips = [
    {
      label: meta.status === "final" ? "FINAL" : meta.status === "live" ? "LIVE" : "PREGAME",
      tone: meta.status
    },
    {
      label: finalLock?.locked ? "finalLock 已鎖定" : "finalLock 未鎖定",
      tone: finalLock?.locked ? "locked" : "neutral"
    },
    {
      label: hasLineScore ? "逐局比分 OK" : "逐局同步中",
      tone: hasLineScore ? "good" : "warn"
    },
    {
      label: hasBatters ? "打者表 OK" : "打者表同步中",
      tone: hasBatters ? "good" : "warn"
    },
    {
      label: hasPitchers ? "投手表 OK" : "投手表同步中",
      tone: hasPitchers ? "good" : "warn"
    },
    ...buildDetailedQualityChips(dq, data)
  ];

  box.innerHTML = `
    <div class="dq-panel dq-${escapeHtml(level)}">
      <div class="dq-main">
        <div>
          <div class="dq-kicker">DATA QUALITY</div>
          <strong>${escapeHtml(levelText)}</strong>
          <p>${escapeHtml(message)}</p>
        </div>

        <div class="dq-badge">${escapeHtml(level.toUpperCase())}</div>
      </div>

      <div class="dq-chip-grid">
        ${chips.map(chip => `
          <span class="dq-chip dq-chip-${escapeHtml(chip.tone || "neutral")}">
            ${escapeHtml(chip.label)}
          </span>
        `).join("")}
      </div>

      <div class="dq-meta-grid">
        <div>
          <span>資料來源</span>
          <strong>${escapeHtml(source || "—")}</strong>
        </div>
        <div>
          <span>更新時間</span>
          <strong>${escapeHtml(updatedAt || "由前端讀取時間判斷")}</strong>
        </div>
        <div>
          <span>比賽狀態</span>
          <strong>${escapeHtml(getStatusText(meta.status))}</strong>
        </div>
      </div>

      ${
        flags.length || warnings.length
          ? `
            <div class="dq-note-list">
              ${flags.map(flag => `<div>🏷 ${escapeHtml(flag)}</div>`).join("")}
              ${warnings.map(warn => `<div>⚠️ ${escapeHtml(warn)}</div>`).join("")}
            </div>
          `
          : ""
      }
    </div>
  `;
}

function normalizeQualityLevel(level) {
  const s = String(level || "").toLowerCase();

  if (["good", "ok", "stable", "complete"].includes(s)) return "good";
  if (["partial", "syncing", "warning", "warn"].includes(s)) return "partial";
  if (["bad", "error", "failed"].includes(s)) return "bad";

  return "unknown";
}

function getQualityLevelText(level) {
  if (level === "good") return "資料狀態穩定";
  if (level === "partial") return "資料同步中";
  if (level === "bad") return "資料異常";
  return "資料狀態待判斷";
}

function getDefaultQualityMessage(data) {
  const status = data.meta?.status;

  if (status === "live") {
    return "比賽進行中，部分打者、投手或逐局資料可能會比官方頁面稍晚同步。";
  }

  if (status === "final") {
    return data.finalLock?.locked
      ? "比賽已結束，finalLock 已啟用，前端會以 FINAL 資料為準。"
      : "比賽已結束，系統目前以最終比分與賽後資料顯示。";
  }

  return "此場目前為賽前狀態，會優先顯示賽程、球場、時間與預告先發。";
}

/* =========================================================
   先發投手 / 目前投打對決卡
========================================================= */

function renderStarterDuel(data) {
  const box = document.getElementById("starterDuelCard");

  if (!box) return;

  const meta = data.meta || {};
  const away = meta.away || "客隊";
  const home = meta.home || "主隊";
  const status = meta.status || "scheduled";

  const starters = getStarterPair(data);

  const awayLogo = getTeamLogo(away);
  const homeLogo = getTeamLogo(home);

  if (status === "scheduled" || status === "pregame") {
    const hasStarter = starters.away || starters.home;

    box.innerHTML = `
      <div class="starter-duel-head">
        <div>
          <span class="starter-kicker">STARTING PITCHERS</span>
          <h2>🎯 先發投手對決</h2>
        </div>
        <div class="starter-status">賽前資訊</div>
      </div>

      <div class="starter-duel-main">
        <div class="starter-team away">
          <img src="${awayLogo}" alt="${escapeHtml(away)}">
          <span>${teamNameLink(away)}</span>
          <strong>${starters.away ? playerNameLink(starters.away) : "尚未公布"}</strong>
        </div>

        <div class="starter-vs">
          <span>VS</span>
        </div>

        <div class="starter-team home">
          <img src="${homeLogo}" alt="${escapeHtml(home)}">
          <span>${teamNameLink(home)}</span>
          <strong>${starters.home ? playerNameLink(starters.home) : "尚未公布"}</strong>
        </div>
      </div>

      <p class="starter-note">
        ${
          hasStarter
            ? "比賽尚未開始，以下為官方公布之預告先發。"
            : "官方尚未公布本場先發投手。"
        }
      </p>
    `;

    return;
  }

  if (status === "live") {
    const flow = inferLiveFlow(data);

    box.innerHTML = `
      <div class="starter-duel-head">
        <div>
          <span class="starter-kicker">LIVE MATCHUP</span>
          <h2>🔴 目前投打對決</h2>
        </div>
        <div class="starter-status">LIVE 戰況</div>
      </div>

      <div class="starter-duel-main live-mode">
        <div class="starter-team away">
          <img src="${getTeamLogo(flow.battingTeam || away)}" alt="${escapeHtml(flow.battingTeam || away)}">
          <span>目前打者</span>
          <strong>${escapeHtml(flow.currentBatter || "—")}</strong>
        </div>

        <div class="starter-vs">
          <span>VS</span>
        </div>

        <div class="starter-team home">
          <img src="${getTeamLogo(flow.fieldingTeam || home)}" alt="${escapeHtml(flow.fieldingTeam || home)}">
          <span>目前投手</span>
          <strong>${escapeHtml(flow.currentPitcher || "—")}</strong>
        </div>
      </div>

      <p class="starter-note">
        ${escapeHtml(flow.inningText || "比賽進行中")}｜攻擊：${escapeHtml(flow.battingTeam || "—")}｜守備：${escapeHtml(flow.fieldingTeam || "—")}
      </p>
    `;

    return;
  }

  if (status === "final") {
    renderFinalStarterSummary(box, data, away, home, awayLogo, homeLogo);
    return;
  }

  box.innerHTML = `
    <div class="starter-duel-head">
      <div>
        <span class="starter-kicker">GAME STATUS</span>
        <h2>📌 比賽狀態</h2>
      </div>
      <div class="starter-status">${escapeHtml(getStatusText(status))}</div>
    </div>

    <div class="starter-duel-main">
      <div class="starter-team away">
        <img src="${awayLogo}" alt="${escapeHtml(away)}">
        <span>${teamNameLink(away)}</span>
        <strong>—</strong>
      </div>

      <div class="starter-vs">
        <span>VS</span>
      </div>

      <div class="starter-team home">
        <img src="${homeLogo}" alt="${escapeHtml(home)}">
        <span>${teamNameLink(home)}</span>
        <strong>—</strong>
      </div>
    </div>

    <p class="starter-note">
      此場目前狀態為：${escapeHtml(getStatusText(status))}
    </p>
  `;
}

function renderFinalStarterSummary(box, data, away, home, awayLogo, homeLogo) {
  const meta = data.meta || {};
  const awayScore = data.totals?.away?.R;
  const homeScore = data.totals?.home?.R;

  const winnerSide =
    Number.isFinite(awayScore) &&
    Number.isFinite(homeScore)
      ? awayScore > homeScore
        ? "away"
        : homeScore > awayScore
          ? "home"
          : "tie"
      : "unknown";

  const winnerTeam =
    winnerSide === "away"
      ? away
      : winnerSide === "home"
        ? home
        : "勝方";

  const loserTeam =
    winnerSide === "away"
      ? home
      : winnerSide === "home"
        ? away
        : "敗方";

  const winnerLogo =
    winnerSide === "away"
      ? awayLogo
      : winnerSide === "home"
        ? homeLogo
        : getTeamLogo(away);

  const loserLogo =
    winnerSide === "away"
      ? homeLogo
      : winnerSide === "home"
        ? awayLogo
        : getTeamLogo(home);

  box.innerHTML = `
    <div class="starter-duel-head">
      <div>
        <span class="starter-kicker">PITCHING RESULT</span>
        <h2>🏆 本場投手摘要</h2>
      </div>
      <div class="starter-status">FINAL</div>
    </div>

    <div class="starter-duel-main final-mode">
      <div class="starter-team winner-side">
        <img src="${winnerLogo}" alt="${escapeHtml(winnerTeam)}">
        <span>勝方｜${escapeHtml(winnerTeam)}</span>
        <strong>${labeledPlayerLink("勝投", meta.win)}</strong>
        <em>${labeledPlayerLink("救援", meta.save)}</em>
      </div>

      <div class="starter-vs">
        <span>投手</span>
      </div>

      <div class="starter-team loser-side">
        <img src="${loserLogo}" alt="${escapeHtml(loserTeam)}">
        <span>敗方｜${escapeHtml(loserTeam)}</span>
        <strong>${labeledPlayerLink("敗投", meta.lose)}</strong>
        <em>本場敗戰投手</em>
      </div>
    </div>

    <p class="starter-note">
      比賽已結束，系統依最終比分顯示勝敗方；可至「投手」區查看完整投手成績。
    </p>
  `;
}

/* =========================================================
   比賽進度
========================================================= */

function renderMatchProgress(data) {
  const card = document.getElementById("matchProgressCard");

  if (!card) return;

  const status = data.meta?.status || "scheduled";
  const currentStep = getProgressStep(status);

  document.querySelectorAll(".progress-step").forEach(step => {
    const stepName = step.dataset.progressStep;

    step.classList.remove("is-active", "is-done", "is-waiting");

    if (isProgressDone(stepName, currentStep)) {
      step.classList.add("is-done");
    } else if (stepName === currentStep) {
      step.classList.add("is-active");
    } else {
      step.classList.add("is-waiting");
    }
  });

  document.querySelectorAll(".progress-line").forEach((line, index) => {
    line.classList.remove("is-done", "is-active");

    if (currentStep === "live" && index === 0) {
      line.classList.add("is-done");
    }

    if (currentStep === "final") {
      line.classList.add("is-done");
    }
  });

  setText("progressCurrentStatus", getProgressStatusLabel(status));
  setText("matchProgressNote", getProgressNote(data));
}

function getProgressStep(status) {
  if (status === "live") return "live";
  if (status === "final") return "final";

  return "pregame";
}

function isProgressDone(stepName, currentStep) {
  const order = {
    pregame: 1,
    live: 2,
    final: 3
  };

  return order[stepName] < order[currentStep];
}

function getProgressStatusLabel(status) {
  if (status === "live") return "目前階段：LIVE 戰況";
  if (status === "final") return "目前階段：賽後數據";
  if (status === "postponed") return "目前階段：延賽";
  if (status === "suspended") return "目前階段：保留比賽";
  if (status === "cancelled") return "目前階段：取消";

  return "目前階段：賽前資訊";
}

function getProgressNote(data) {
  const meta = data.meta || {};
  const status = meta.status || "scheduled";

  if (status === "live") {
    return "比賽進行中，LIVE 面板會顯示目前局數、打者、投手、壘包與球數。";
  }

  if (status === "final") {
    return "比賽已結束，可以查看最終比分、勝敗投、MVP、打者與投手成績。";
  }

  if (status === "postponed") {
    return "此場比賽已延賽，等待官方公告補賽資訊。";
  }

  if (status === "suspended") {
    return "此場為保留比賽，後續將依官方資料接續更新。";
  }

  if (status === "cancelled") {
    return "此場比賽已取消。";
  }

  return `賽前資訊已載入：${meta.venue || "球場待定"}｜${meta.time || "時間未定"}。`;
}

/* =========================================================
   LIVE 狀態面板
========================================================= */

function renderLiveStatus(data) {
  const panel = document.getElementById("liveStatusPanel");

  if (!panel) return;

  const meta = data.meta || {};
  const away = meta.away || "客隊";
  const home = meta.home || "主隊";
  const status = meta.status || "scheduled";

  const awayR = data.totals?.away?.R;
  const homeR = data.totals?.home?.R;

  const flow = inferLiveFlow(data);
  const liveState = data.liveState || {};

  setText("liveStatusBadge", getLiveBadgeText(status));
  setText("liveInningText", flow.inningText || "—");

  setText(
    "liveScoreLine",
    `${away} ${formatScore(awayR)}：${formatScore(homeR)} ${home}`
  );

  setText("liveBattingTeam", flow.battingTeam || "—");
  setText("liveFieldingTeam", flow.fieldingTeam || "—");
  setText("liveBatter", flow.currentBatter || "—");
  setText("livePitcher", flow.currentPitcher || "—");

  renderLiveCountAndBases(liveState);

  setText(
    "liveRHE",
    `${away} ${formatScore(data.totals?.away?.R)}/${formatScore(data.totals?.away?.H)}/${formatScore(data.totals?.away?.E)} ｜ ` +
    `${home} ${formatScore(data.totals?.home?.R)}/${formatScore(data.totals?.home?.H)}/${formatScore(data.totals?.home?.E)}`
  );

  setText("liveLastUpdate", `最後更新：${formatClock(new Date())}`);

  const hint = document.getElementById("liveStatusHint");

  if (hint) {
    if (status === "live") {
      const events = Array.isArray(liveState?.recentEvents)
        ? liveState.recentEvents.filter(Boolean).join(" / ")
        : "";

      if (liveState?.source) {
        hint.textContent =
          `即時狀態來源：${liveState.source}` +
          (liveState.pitchCount !== null && liveState.pitchCount !== undefined ? `｜PITCH ${liveState.pitchCount}` : "") +
          (events ? `｜最近事件：${events}` : "");
      } else {
        hint.textContent = "即時狀態依目前逐局比分與投手資料推算。";
      }
    } else if (status === "final") {
      hint.textContent = "比賽已結束，此面板顯示最終摘要。";
    } else {
      hint.textContent = "非 LIVE 狀態時，此面板僅顯示比賽摘要。";
    }
  }

  panel.classList.toggle("is-live", status === "live");
  panel.classList.toggle("is-final", status === "final");
  panel.style.display = "";
}

function renderLiveCountAndBases(liveState = {}) {
  const balls = liveState?.balls;
  const strikes = liveState?.strikes;
  const outs = liveState?.outs;

  setText(
    "liveBSO",
    `B ${formatLiveNum(balls)}｜S ${formatLiveNum(strikes)}｜O ${formatLiveNum(outs)}`
  );

  const bases = liveState?.bases || {};
  const first = !!bases.first;
  const second = !!bases.second;
  const third = !!bases.third;

  setBaseState("baseFirst", first);
  setBaseState("baseSecond", second);
  setBaseState("baseThird", third);

  setText("liveBasesText", getBasesText(first, second, third));
}

function inferLiveFlow(data) {
  const meta = data.meta || {};
  const away = meta.away || "客隊";
  const home = meta.home || "主隊";
  const status = meta.status || "scheduled";
  const liveState = data.liveState || {};

  const awayLine = Array.isArray(data.lineScore?.away) ? data.lineScore.away : [];
  const homeLine = Array.isArray(data.lineScore?.home) ? data.lineScore.home : [];

  if (status === "postponed") return buildFlow("延賽");
  if (status === "cancelled") return buildFlow("取消");
  if (status === "suspended") return buildFlow("保留比賽");

  if (status === "scheduled" || status === "pregame") {
    return {
      inningText: "賽前",
      battingTeam: "—",
      fieldingTeam: "—",
      currentBatter: "—",
      currentPitcher: renderScheduledPitcherHint(data)
    };
  }

  if (status === "final") return buildFlow("比賽結束");

  const inningState = inferCurrentInning(awayLine, homeLine);

  let battingTeam = "—";
  let fieldingTeam = "—";
  let currentBatter = "—";
  let currentPitcher = "—";

  if (inningState.half === "top") {
    battingTeam = away;
    fieldingTeam = home;
    currentPitcher = getLastPitcherName(data.pitchers?.home);
  } else if (inningState.half === "bottom") {
    battingTeam = home;
    fieldingTeam = away;
    currentPitcher = getLastPitcherName(data.pitchers?.away);
  }

  if (liveState.half === "top") {
    battingTeam = away;
    fieldingTeam = home;
  } else if (liveState.half === "bottom") {
    battingTeam = home;
    fieldingTeam = away;
  }

  if (liveState.battingTeam) battingTeam = liveState.battingTeam;
  if (liveState.fieldingTeam) fieldingTeam = liveState.fieldingTeam;
  if (liveState.batter) currentBatter = liveState.batter;
  if (liveState.pitcher) currentPitcher = liveState.pitcher;

  return {
    inningText: liveState.inningText || inningState.text,
    battingTeam,
    fieldingTeam,
    currentBatter,
    currentPitcher
  };
}

function buildFlow(inningText) {
  return {
    inningText,
    battingTeam: "—",
    fieldingTeam: "—",
    currentBatter: "—",
    currentPitcher: "—"
  };
}

function inferCurrentInning(awayLine = [], homeLine = []) {
  const maxLength = Math.max(awayLine.length, homeLine.length, 1);

  for (let i = 0; i < maxLength; i++) {
    const awayPlayed = hasInningValue(awayLine[i]);
    const homePlayed = hasInningValue(homeLine[i]);

    if (!awayPlayed) {
      return {
        inning: i + 1,
        half: "top",
        text: `${i + 1}局上`
      };
    }

    if (awayPlayed && !homePlayed) {
      return {
        inning: i + 1,
        half: "bottom",
        text: `${i + 1}局下`
      };
    }
  }

  return {
    inning: maxLength,
    half: "bottom",
    text: `${maxLength}局下`
  };
}

/* =========================================================
   RHE / 逐局 / 勝敗投
========================================================= */

function renderTotals(data) {
  const meta = data.meta || {};
  const away = meta.away || "客隊";
  const home = meta.home || "主隊";

  // v6.4.5：RHE 已改為固定 Grid，不再操作 tbody/tr。
  setText("awayTeamRHE", away);
  setText("homeTeamRHE", home);
  setText("awayR", formatScore(data.totals?.away?.R));
  setText("awayH", formatScore(data.totals?.away?.H));
  setText("awayE", formatScore(data.totals?.away?.E));
  setText("homeR", formatScore(data.totals?.home?.R));
  setText("homeH", formatScore(data.totals?.home?.H));
  setText("homeE", formatScore(data.totals?.home?.E));

  for (const id of ["awayRheRow", "homeRheRow"]) {
    const row = document.getElementById(id);
    if (row) {
      row.hidden = false;
      row.removeAttribute("hidden");
      row.style.setProperty("display", "grid", "important");
      row.style.setProperty("visibility", "visible", "important");
      row.style.setProperty("opacity", "1", "important");
    }
  }

  const hasAnyRhe =
    data.totals?.home?.R != null ||
    data.totals?.away?.R != null ||
    data.totals?.home?.H != null ||
    data.totals?.away?.H != null;

  console.log("📊 Match RHE GRID render", {
    away, home,
    awayTotals: data.totals?.away,
    homeTotals: data.totals?.home,
    awayRow: !!document.getElementById("awayRheRow"),
    homeRow: !!document.getElementById("homeRheRow"),
    awayDisplay: document.getElementById("awayRheRow") ? getComputedStyle(document.getElementById("awayRheRow")).display : null,
    homeDisplay: document.getElementById("homeRheRow") ? getComputedStyle(document.getElementById("homeRheRow")).display : null
  });

  setText("rheHint", hasAnyRhe ? "" : "此場尚未開賽或官方尚未提供 R/H/E。");
}

function renderInnings(data) {
  const lineScore = data.lineScore || { away: [], home: [] };
  const away = data.meta?.away || "客隊";
  const home = data.meta?.home || "主隊";

  fillGridInningsRow("awayInningsRow", away, lineScore, "away", data);
  fillGridInningsRow("homeInningsRow", home, lineScore, "home", data);

  const inningCount = getDisplayInningCount(lineScore, data);
  const hasInnings = inningCount > 0;

  console.log("📋 Match innings GRID render", {
    away, home,
    awayLine: lineScore.away,
    homeLine: lineScore.home,
    awayRow: !!document.getElementById("awayInningsRow"),
    homeRow: !!document.getElementById("homeInningsRow"),
    awayDisplay: document.getElementById("awayInningsRow") ? getComputedStyle(document.getElementById("awayInningsRow")).display : null,
    homeDisplay: document.getElementById("homeInningsRow") ? getComputedStyle(document.getElementById("homeInningsRow")).display : null
  });

  if (hasInnings) {
    const quality = cleanText(data.dataQuality?.lineScore);
    const source = cleanText(data.lineScoreSource);
    if (quality === "partial") {
      setText("inningsHint", source
        ? `逐局比分同步中，目前顯示前 ${inningCount} 局資料｜${source}`
        : `逐局比分同步中，目前顯示前 ${inningCount} 局資料`);
    } else {
      setText("inningsHint", "");
    }
    return;
  }

  const awayScore = formatScore(data.totals?.away?.R);
  const homeScore = formatScore(data.totals?.home?.R);
  setText("inningsHint", `官方目前尚未提供逐局比分，暫先顯示總比分：${away} ${awayScore}：${homeScore} ${home}`);
}

function fillGridInningsRow(id, team, lineScore = {}, side = "away", data = null) {
  const row = document.getElementById(id);
  if (!row) return;

  row.hidden = false;
  row.removeAttribute("hidden");
  row.style.setProperty("display", "grid", "important");
  row.style.setProperty("visibility", "visible", "important");
  row.style.setProperty("opacity", "1", "important");

  const values = Array.isArray(lineScore?.[side]) ? lineScore[side] : [];
  const cells = [`<div class="match-score-grid-cell match-score-grid-team">${escapeHtml(team)}</div>`];
  for (let i = 0; i < 9; i += 1) {
    const raw = values[i];
    const text = raw == null || raw === "" ? "—" : String(raw);
    const cls = text === "—" ? "inning-empty" : Number(text) > 0 ? "inning-has-value" : "inning-zero";
    cells.push(`<div class="match-score-grid-cell ${cls}">${escapeHtml(text)}</div>`);
  }
  row.innerHTML = cells.join("");
}

function renderDecisions(data) {
  setPlayerLink("winPitcher", data.meta?.win);
  setPlayerLink("lossPitcher", data.meta?.lose);
  setPlayerLink("savePitcher", data.meta?.save);
  setPlayerLink("mvpPlayer", data.meta?.mvp);
}

function setPlayerLink(id, name) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = playerNameLink(name || "—");
}

/* =========================================================
   打者 / 投手 tab
========================================================= */

function updateTeamSwitchLabels(data) {
  const away = data.meta?.away || "客隊";
  const home = data.meta?.home || "主隊";

  updateSwitchGroup("batterTeamSwitch", away, home);
  updateSwitchGroup("pitcherTeamSwitch", away, home);
}

function updateSwitchGroup(groupId, away, home) {
  const group = document.getElementById(groupId);

  if (!group) return;

  const awayBtn = group.querySelector('[data-team-side="away"]');
  const homeBtn = group.querySelector('[data-team-side="home"]');

  if (awayBtn) {
    awayBtn.textContent = away;
    awayBtn.classList.add("away");
  }

  if (homeBtn) {
    homeBtn.textContent = home;
    homeBtn.classList.add("home");
  }
}

function bindStatTabs() {
  document.querySelectorAll(".team-tab").forEach(btn => {
    if (btn.dataset.bound === "1") return;

    btn.dataset.bound = "1";

    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      const side = btn.dataset.teamSide;

      if (!target || !side) return;

      MATCH_TAB_STATE[target] = side;
      updateActiveTabs(target);

      if (!CURRENT_MATCH_DATA) return;

      if (target === "batters") renderBatters(CURRENT_MATCH_DATA);
      if (target === "pitchers") renderPitchers(CURRENT_MATCH_DATA);
    });
  });

  updateActiveTabs("batters");
  updateActiveTabs("pitchers");
}

function updateActiveTabs(target) {
  document
    .querySelectorAll(`.team-tab[data-target="${target}"]`)
    .forEach(btn => {
      const isActive = btn.dataset.teamSide === MATCH_TAB_STATE[target];
      btn.classList.toggle("active", isActive);
    });
}

/* =========================================================
   球季累積 Rate（截至本場，避免把單場 AVG / WHIP 當成球季成績）
========================================================= */

function statNumber(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "") {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
  }
  return 0;
}

function normalizePlayerStatName(value) {
  return cleanText(value)
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function isGameAtOrBeforeTarget(game, target) {
  const gameDate = cleanText(game?.meta?.date || game?.date);
  const targetDate = cleanText(target?.meta?.date || target?.date);
  if (!gameDate || !targetDate) return false;
  if (gameDate < targetDate) return true;
  if (gameDate > targetDate) return false;

  const gameSno = Number(game?.gameSno);
  const targetSno = Number(target?.gameSno);
  if (Number.isFinite(gameSno) && Number.isFinite(targetSno)) {
    return gameSno <= targetSno;
  }
  return true;
}

function ipToOutsForSeason(value) {
  const text = cleanText(value);
  if (!text) return 0;
  if (/^\d+\.\d$/.test(text)) {
    const [whole, frac] = text.split(".").map(Number);
    return whole * 3 + Math.min(2, frac);
  }
  if (/^\d+\s+\d\/3$/.test(text)) {
    const [whole, frac] = text.split(/\s+/);
    return Number(whole) * 3 + Number(frac.split("/")[0]);
  }
  if (/^\d+\/3$/.test(text)) return Number(text.split("/")[0]);
  const num = Number(text);
  return Number.isFinite(num) ? Math.round(num * 3) : 0;
}

function formatSeasonAvg(h, ab) {
  if (!ab) return "—";
  return (h / ab).toFixed(3).replace(/^0/, "");
}

function buildSeasonRatesThroughGame(targetGame) {
  const batterMap = new Map();
  const pitcherMap = new Map();
  const targetYear = cleanText(targetGame?.meta?.date || targetGame?.date).slice(0, 4);

  for (const game of ALL_MATCH_GAMES) {
    const status = cleanText(game?.meta?.status || game?.status);
    const date = cleanText(game?.meta?.date || game?.date);
    if (status !== "final" || (targetYear && !date.startsWith(targetYear))) continue;
    if (!isGameAtOrBeforeTarget(game, targetGame)) continue;

    for (const side of ["away", "home"]) {
      for (const row of game?.batters?.[side] || []) {
        const name = normalizePlayerStatName(row?.name || row?.rawName);
        if (!name) continue;
        const acc = batterMap.get(name) || { AB: 0, H: 0, BB: 0, HBP: 0, SF: 0, TB: 0, doubles: 0, triples: 0, HR: 0 };
        acc.AB += statNumber(row, "AB", "打數");
        acc.H += statNumber(row, "H", "安打");
        acc.BB += statNumber(row, "BB", "四壞", "保送");
        acc.HBP += statNumber(row, "HBP", "觸身");
        acc.SF += statNumber(row, "SF", "犧牲飛球");
        acc.doubles += statNumber(row, "2B", "二安", "二壘打");
        acc.triples += statNumber(row, "3B", "三安", "三壘打");
        acc.HR += statNumber(row, "HR", "全壘打");
        const explicitTB = statNumber(row, "TB", "壘打數");
        acc.TB += explicitTB || 0;
        batterMap.set(name, acc);
      }

      for (const row of game?.pitchers?.[side] || []) {
        const name = normalizePlayerStatName(row?.name || row?.rawName);
        if (!name) continue;
        const acc = pitcherMap.get(name) || { outs: 0, H: 0, BB: 0, ER: 0 };
        acc.outs += ipToOutsForSeason(pick(row, "IP", "投球局數"));
        acc.H += statNumber(row, "H", "被安打");
        acc.BB += statNumber(row, "BB", "四壞", "保送");
        acc.ER += statNumber(row, "ER", "自責分", "責失");
        pitcherMap.set(name, acc);
      }
    }
  }

  for (const acc of batterMap.values()) {
    if (!acc.TB) acc.TB = acc.H + acc.doubles + 2 * acc.triples + 3 * acc.HR;
    const obpDen = acc.AB + acc.BB + acc.HBP + acc.SF;
    acc.AVG = formatSeasonAvg(acc.H, acc.AB);
    acc.OBP = obpDen ? ((acc.H + acc.BB + acc.HBP) / obpDen).toFixed(3).replace(/^0/, "") : "—";
    acc.SLG = acc.AB ? (acc.TB / acc.AB).toFixed(3).replace(/^0/, "") : "—";
  }

  for (const acc of pitcherMap.values()) {
    const ip = acc.outs / 3;
    acc.ERA = acc.outs ? ((acc.ER * 9) / ip).toFixed(2) : "—";
    acc.WHIP = acc.outs ? ((acc.H + acc.BB) / ip).toFixed(2) : "—";
  }

  return { batterMap, pitcherMap };
}

function getSeasonBatterRate(playerName) {
  const rates = buildSeasonRatesThroughGame(CURRENT_MATCH_DATA);
  return rates.batterMap.get(normalizePlayerStatName(playerName));
}

function getSeasonPitcherRate(playerName) {
  const rates = buildSeasonRatesThroughGame(CURRENT_MATCH_DATA);
  return rates.pitcherMap.get(normalizePlayerStatName(playerName));
}

/* =========================================================
   打者
========================================================= */

function renderBatters(data) {
  const box = document.getElementById("battersTable");

  if (!box) return;

  const away = data.batters?.away || [];
  const home = data.batters?.home || [];

  if (!away.length && !home.length) {
    box.innerHTML = renderPregameLineup(data);
    return;
  }

  const side = MATCH_TAB_STATE.batters || "away";

  const teamName = side === "home"
    ? data.meta?.home || "主隊"
    : data.meta?.away || "客隊";

  const players = side === "home" ? home : away;

  box.innerHTML = renderBatterTeam(teamName, players);
}

function renderBatterTeam(teamName, players) {
  if (!players.length) {
    return `
      <div class="batter-team-title">${escapeHtml(teamName)}</div>
      <p class="muted">尚無資料</p>
    `;
  }

  const sortedPlayers = [...players].sort((a, b) => {
    const orderA = Number(a?.order ?? 999);
    const orderB = Number(b?.order ?? 999);

    if (orderA !== orderB) return orderA - orderB;

    const roleA = cleanText(a?.roleType);
    const roleB = cleanText(b?.roleType);

    if (roleA === "先發" && roleB !== "先發") return -1;
    if (roleA !== "先發" && roleB === "先發") return 1;

    return 0;
  });

  return `
    <div class="batter-team-title">${escapeHtml(teamName)}｜打者 ${sortedPlayers.length} 人</div>
    <div class="batter-table-scroll">
      <div class="batter-table-detail">
        <div class="batter-header">
          <span>棒次</span>
          <span>球員</span>
          <span>守位</span>
          <span>AB</span>
          <span>R</span>
          <span>H</span>
          <span>RBI</span>
          <span>2B</span>
          <span>3B</span>
          <span>HR</span>
          <span>BB</span>
          <span>SO</span>
          <span>SB</span>
          <span title="截至本場的 2026 球季累積打擊率">AVG（季）</span>
        </div>
        ${sortedPlayers.map(p => {
          const playerName = p.name || p.rawName || "—";
          const position = p.position || "—";
          const roleType = cleanText(p.roleType);
          const hot = p.isMvp || p.gameWinningRbi;

          return `
            <div class="batter-row ${hot ? "is-highlight" : ""}">
              <span>${escapeHtml(p.order ?? "—")}</span>
              <span class="player-name-cell">
                ${playerNameLink(playerName)}
                ${hot ? `<em title="MVP／勝利打點">🔥</em>` : ""}
              </span>
              <span>${escapeHtml(position)}${roleType && roleType !== "先發" ? ` <small>${escapeHtml(roleType)}</small>` : ""}</span>
              <span>${escapeHtml(pick(p, "AB", "打數"))}</span>
              <span>${escapeHtml(pick(p, "R", "得分"))}</span>
              <span>${escapeHtml(pick(p, "H", "安打"))}</span>
              <span>${escapeHtml(pick(p, "RBI", "打點"))}</span>
              <span>${escapeHtml(pick(p, "2B", "二安"))}</span>
              <span>${escapeHtml(pick(p, "3B", "三安"))}</span>
              <span>${escapeHtml(pick(p, "HR", "全壘打"))}</span>
              <span>${escapeHtml(pick(p, "BB", "四壞"))}</span>
              <span>${escapeHtml(pick(p, "SO", "被三振"))}</span>
              <span>${escapeHtml(pick(p, "SB", "盜壘"))}</span>
              <span>${escapeHtml(getSeasonBatterRate(playerName)?.AVG || "—")}</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

/* =========================================================
   投手
========================================================= */

function renderPitchers(data) {
  const box = document.getElementById("pitchersTable");

  if (!box) return;

  const away = data.pitchers?.away || [];
  const home = data.pitchers?.home || [];

  if (!away.length && !home.length) {
    box.innerHTML = renderPregamePitchers(data);
    return;
  }

  const side = MATCH_TAB_STATE.pitchers || "away";

  const teamName = side === "home"
    ? data.meta?.home || "主隊"
    : data.meta?.away || "客隊";

  const players = side === "home" ? home : away;

  box.innerHTML = renderPitcherTeam(teamName, players);
}

function renderPitcherTeam(teamName, players) {
  if (!players.length) {
    return `
      <div class="pitcher-team-title">${escapeHtml(teamName)}</div>
      <p class="muted">尚無資料</p>
    `;
  }

  const sortedPlayers = [...players].sort((a, b) => {
    const orderA = Number(a?.order ?? a?.seq ?? 999);
    const orderB = Number(b?.order ?? b?.seq ?? 999);

    return orderA - orderB;
  });

  return `
    <div class="pitcher-team-title">${escapeHtml(teamName)}｜投手 ${sortedPlayers.length} 人</div>
    <div class="pitcher-table-scroll">
      <div class="pitcher-table-detail">
        <div class="pitcher-header">
          <span>順序</span>
          <span>投手</span>
          <span>結果</span>
          <span>IP</span>
          <span>BF</span>
          <span>NP</span>
          <span>H</span>
          <span>HR</span>
          <span>BB</span>
          <span>SO</span>
          <span>R</span>
          <span>ER</span>
          <span title="截至本場的球季累積防禦率">ERA（季）</span>
          <span title="截至本場的球季累積 WHIP">WHIP（季）</span>
        </div>
        ${sortedPlayers.map((p, index) => {
          const pitcherName = p.name || p.rawName || "—";
          const result = formatPitcherDecision(p);

          return `
            <div class="pitcher-row">
              <span>${escapeHtml(p.order ?? p.seq ?? index + 1)}</span>
              <span class="player-name-cell">${playerNameLink(pitcherName)}</span>
              <span>${escapeHtml(result)}</span>
              <span>${escapeHtml(pick(p, "IP", "投球局數"))}</span>
              <span>${escapeHtml(pick(p, "BF", "面對打者"))}</span>
              <span>${escapeHtml(pick(p, "NP", "投球數", "PITCH"))}</span>
              <span>${escapeHtml(pick(p, "H", "安打"))}</span>
              <span>${escapeHtml(pick(p, "HR", "全壘打"))}</span>
              <span>${escapeHtml(pick(p, "BB", "四壞"))}</span>
              <span>${escapeHtml(pick(p, "SO", "三振"))}</span>
              <span>${escapeHtml(pick(p, "R", "失分"))}</span>
              <span>${escapeHtml(pick(p, "ER", "自責分"))}</span>
              <span>${escapeHtml(getSeasonPitcherRate(pitcherName)?.ERA || "—")}</span>
              <span>${escapeHtml(getSeasonPitcherRate(pitcherName)?.WHIP || "—")}</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderPregamePitchers(game) {
  const meta = game.meta || {};
  const liveState = game.liveState || {};
  const starters = getStarterPair(game);

  if (meta.status === "live") {
    const currentPitcher = liveState.pitcher || inferLiveFlow(game).currentPitcher || "—";

    return `
      <div class="starter-box">
        🔴 目前投手：${escapeHtml(currentPitcher)}
      </div>

      <div class="starter-box">
        🎯 預告先發：
        ${escapeHtml(meta.away || "客隊")} ${starters.away ? playerNameLink(starters.away) : "—"}
        vs
        ${escapeHtml(meta.home || "主隊")} ${starters.home ? playerNameLink(starters.home) : "—"}
      </div>

      <p class="muted">
        官方 boxscore detail 暫未提供完整投手成績；目前先顯示官方首頁 LIVE 卡抓到的投手資訊。
      </p>
    `;
  }

  if (!starters.away && !starters.home) {
    return `<p class="muted">此場尚未有投手成績。</p>`;
  }

  return `
    <div class="starter-box">
      🎯 先發投手：
      ${escapeHtml(game.meta?.away || "客隊")} ${starters.away ? playerNameLink(starters.away) : "—"}
      vs
      ${escapeHtml(game.meta?.home || "主隊")} ${starters.home ? playerNameLink(starters.home) : "—"}
    </div>
    <p class="muted">正式投手成績尚未提供。</p>
  `;
}

function renderPregameLineup(game) {
  const pregame = game.pregame || {};
  const liveState = game.liveState || {};
  const meta = game.meta || {};

  const awayLineup = Array.isArray(pregame.lineups?.away)
    ? pregame.lineups.away
    : [];

  const homeLineup = Array.isArray(pregame.lineups?.home)
    ? pregame.lineups.home
    : [];

  const starters = getStarterPair(game);

  if (
    meta.status === "live" &&
    !awayLineup.length &&
    !homeLineup.length
  ) {
    return `
      <div class="empty-box">
        🔴 目前打者：${playerNameLink(liveState.batter || "—")}<br>
        目前投手：${playerNameLink(liveState.pitcher || inferLiveFlow(game).currentPitcher || "—")}
      </div>

      <div class="starter-box">
        🎯 預告先發：
        ${escapeHtml(game.meta?.away || "客隊")} ${starters.away ? playerNameLink(starters.away) : "—"}
        vs
        ${escapeHtml(game.meta?.home || "主隊")} ${starters.home ? playerNameLink(starters.home) : "—"}
      </div>

      <p class="muted">
        官方 boxscore detail 暫未提供完整打者表；目前先顯示 LIVE 投打資訊。
      </p>
    `;
  }

  if (!awayLineup.length && !homeLineup.length && !starters.away && !starters.home) {
    return `
      <div class="empty-box">
        目前尚未有打者成績，也尚未公布先發打序。
      </div>
    `;
  }

  return `
    <div class="pregame-lineup-section">
      <h2>📋 先發打序</h2>

      ${
        starters.away || starters.home
          ? `
            <div class="starter-box">
              🎯 先發投手：
              ${escapeHtml(game.meta?.away || "客隊")} ${starters.away ? playerNameLink(starters.away) : "—"}
              vs
              ${escapeHtml(game.meta?.home || "主隊")} ${starters.home ? playerNameLink(starters.home) : "—"}
            </div>
          `
          : ""
      }

      <div class="lineup-grid-2">
        <div class="lineup-card">
          <h3>${teamNameLink(game.meta?.away || "客隊")} 先發打序</h3>
          ${
            awayLineup.length
              ? awayLineup.map(p => `
                <div class="lineup-row">
                  <span class="lineup-order">${escapeHtml(p.order ?? "—")}</span>
                  <span class="lineup-name">${playerNameLink(p.name || "—")}</span>
                  <span class="lineup-pos">${escapeHtml(p.position || "")}</span>
                </div>
              `).join("")
              : `<p class="muted">尚未公布</p>`
          }
        </div>

        <div class="lineup-card">
          <h3>${teamNameLink(game.meta?.home || "主隊")} 先發打序</h3>
          ${
            homeLineup.length
              ? homeLineup.map(p => `
                <div class="lineup-row">
                  <span class="lineup-order">${escapeHtml(p.order ?? "—")}</span>
                  <span class="lineup-name">${playerNameLink(p.name || "—")}</span>
                  <span class="lineup-pos">${escapeHtml(p.position || "")}</span>
                </div>
              `).join("")
              : `<p class="muted">尚未公布</p>`
          }
        </div>
      </div>

      <p class="muted pregame-note">
        ※ 目前顯示的是賽前公布的先發攻守名單；正式打者成績出現後，會自動改顯示打擊成績。
      </p>
    </div>
  `;
}

/* =========================================================
   Play By Play
   不使用假資料
========================================================= */

function renderPlayByPlay(data = CURRENT_MATCH_DATA) {
  const container = document.getElementById("playByPlayContainer");

  if (!container) return;

  const plays = Array.isArray(data?.playByPlay) ? data.playByPlay : [];

  if (!plays.length) {
    container.innerHTML = `
      <div class="play-loading">
        尚無官方逐球事件資料。<br>
        <span>目前僅顯示比分、R/H/E、LIVE 狀態與球員成績。</span>
      </div>
    `;
    return;
  }

  container.innerHTML = plays.map(renderPlayCard).join("");
}

function renderPlayCard(play) {
  return `
    <div class="play-event ${escapeHtml(play.type || "")}">
      <div class="play-head">
        <div class="play-inning">${escapeHtml(play.inning || "—")}</div>
        <div class="play-time">${escapeHtml(play.time || "")}</div>
      </div>

      <div class="play-main">${escapeHtml(play.title || play.desc || "—")}</div>

      ${
        play.desc && play.desc !== play.title
          ? `<div class="play-desc">${escapeHtml(play.desc)}</div>`
          : ""
      }

      ${
        play.score
          ? `<div class="play-score">比分：${escapeHtml(play.score)}</div>`
          : ""
      }
    </div>
  `;
}

/* =========================================================
   官方按鈕 / 刷新按鈕
========================================================= */

function bindOfficialButton(data) {
  const btn = document.getElementById("btnOfficial");

  if (!btn) return;

  btn.onclick = () => {
    const url =
      data.meta?.officialUrl ||
      `https://www.cpbl.com.tw/box/index?year=2026&kindCode=A&gameSno=${data.gameSno}`;

    window.open(url, "_blank");
  };
}

function bindRefreshButton() {
  const btn = document.getElementById("btnRefreshMatch");

  if (!btn) return;

  if (btn.dataset.bound === "1") return;

  btn.dataset.bound = "1";

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "刷新中…";

    await refreshCurrentGame();

    btn.disabled = false;
    btn.textContent = "刷新資料";
  };
}

/* =========================================================
   Match Tabs
========================================================= */

bindMatchTabs();

function bindMatchTabs() {
  const buttons = document.querySelectorAll(".match-tab-btn");

  buttons.forEach(btn => {
    if (btn.dataset.bound === "1") return;

    btn.dataset.bound = "1";

    btn.addEventListener("click", () => {
      const tab = btn.dataset.matchTab;

      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const target = document.querySelector(`[data-tab-section="${tab}"]`);

      if (!target) return;

      window.scrollTo({
        top: target.offsetTop - 120,
        behavior: "smooth"
      });
    });
  });
}


/* =========================================================
   Hero 開賽倒數 / 狀態同步
========================================================= */

function renderHeroCountdown(data) {
  stopHeroCountdownTicker();
  updateHeroCountdownDisplay(data);

  const status = data?.meta?.status || "scheduled";
  const start = parseGameStartDate(data?.meta?.date, data?.meta?.time);

  if (!["scheduled", "pregame"].includes(status) || !start) return;

  // 逐秒更新 hero 開賽倒數；原本 renderAll 只會 render 一次，所以畫面會停住。
  HERO_COUNTDOWN_TIMER = setInterval(() => {
    const latestData = CURRENT_MATCH_DATA || data;
    updateHeroCountdownDisplay(latestData);

    const latestStatus = latestData?.meta?.status || "scheduled";
    const latestStart = parseGameStartDate(latestData?.meta?.date, latestData?.meta?.time);

    if (!["scheduled", "pregame"].includes(latestStatus)) {
      stopHeroCountdownTicker();
      return;
    }

    // 開賽時間到後停在 00:00:00，等 live refresh 把資料切到 LIVE。
    if (latestStart && latestStart.getTime() - Date.now() <= 0) {
      stopHeroCountdownTicker();
    }
  }, 1000);
}

function stopHeroCountdownTicker() {
  if (!HERO_COUNTDOWN_TIMER) return;
  clearInterval(HERO_COUNTDOWN_TIMER);
  HERO_COUNTDOWN_TIMER = null;
}

function updateHeroCountdownDisplay(data) {
  const panel = document.getElementById("gameCountdownPanel");
  const clock = document.getElementById("gameCountdownClock");
  const label = panel?.querySelector(".game-countdown-label");

  if (!panel || !clock) return;

  const status = data?.meta?.status || "scheduled";

  panel.classList.remove("is-soon", "is-started", "is-final");

  if (status === "final") {
    panel.hidden = false;
    panel.classList.add("is-final");
    if (label) label.textContent = "比賽狀態";
    renderDigitalClock(clock, "FINAL", { status: true });
    return;
  }

  if (status === "live") {
    panel.hidden = false;
    panel.classList.add("is-started");
    if (label) label.textContent = "比賽狀態";
    renderDigitalClock(clock, "LIVE", { status: true });
    return;
  }

  if (["postponed", "suspended", "cancelled"].includes(status)) {
    panel.hidden = false;
    panel.classList.add("is-started");
    if (label) label.textContent = "比賽狀態";
    renderDigitalClock(clock, getStatusText(status).replace(/[⏳🔴✅🌧⏸❌]\s*/g, ""), { status: true });
    return;
  }

  const start = parseGameStartDate(data?.meta?.date, data?.meta?.time);

  if (!start) {
    panel.hidden = true;
    return;
  }

  const diffMs = start.getTime() - Date.now();

  panel.hidden = false;
  if (label) label.textContent = diffMs > 0 ? "開賽倒數" : "等待資料同步";

  if (diffMs <= 0) {
    panel.classList.add("is-started");
    renderDigitalClock(clock, "00:00:00");
    return;
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (totalSeconds <= 3600) {
    panel.classList.add("is-soon");
  }

  renderDigitalClock(clock, [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0")
  ].join(":"));
}


function renderDigitalClock(clockEl, value, options = {}) {
  if (!clockEl) return;

  const text = String(value ?? "").trim() || "--:--:--";
  const isStatus = Boolean(options.status) || !/^\d{2}:\d{2}:\d{2}$/.test(text);

  clockEl.classList.toggle("is-status-text", isStatus);

  if (isStatus) {
    clockEl.textContent = text;
    return;
  }

  clockEl.innerHTML = text
    .split("")
    .map(char => {
      if (char === ":") {
        return `<span class="digital-colon">:</span>`;
      }

      return `<span class="digital-digit">${escapeHtml(char)}</span>`;
    })
    .join("");
}

window.addEventListener("beforeunload", stopHeroCountdownTicker);


/* =========================================================
   小工具
========================================================= */

function showLoading() {
  setText("matchStatus", "⏳ 載入中...");
  setText("matchHeaderSub", "載入比賽資料中…");
}

function showError(msg) {
  setText("matchStatus", msg);
  setText("matchHeaderSub", msg);

  const q = document.getElementById("matchDataQuality");

  if (q) {
    q.innerHTML = `
      <div class="dq-panel dq-bad">
        <div class="dq-main">
          <div>
            <div class="dq-kicker">MATCH ERROR</div>
            <strong>比賽中心載入失敗</strong>
            <p>${escapeHtml(msg)}</p>
          </div>
          <div class="dq-badge">ERROR</div>
        </div>
      </div>
    `;
  }
}

function setText(id, val) {
  const el = document.getElementById(id);

  if (el) el.textContent = val;
}

function setLogo(id, team) {
  const el = document.getElementById(id);

  if (!el) return;

  const teamId = TEAM_ID_MAP[team];

  if (teamId) {
    el.src = `assets/logo/${teamId}.png`;
    el.style.display = "";
  } else {
    el.removeAttribute("src");
    el.style.display = "none";
  }
}

function getTeamLogo(team) {
  const id = TEAM_ID_MAP[team];

  return id
    ? `assets/logo/${id}.png`
    : "assets/logo/cpbl.png";
}

function getStarterPair(data) {
  const probable = PROBABLE_PITCHERS_MAP?.[String(data.gameSno)] || {};

  return {
    away:
      cleanText(probable.away) ||
      cleanText(data.pregame?.starters?.away),
    home:
      cleanText(probable.home) ||
      cleanText(data.pregame?.starters?.home)
  };
}

function getLastPitcherName(players = []) {
  if (!Array.isArray(players) || !players.length) return "—";

  const valid = players.filter(p => {
    const name = p?.name || p?.rawName;

    if (!name) return false;
    if (String(name).includes("Total")) return false;
    if (String(name).includes("合計")) return false;

    return true;
  });

  if (!valid.length) return "—";

  return formatPitcherName(valid[valid.length - 1]);
}

function renderScheduledPitcherHint(data) {
  const starters = getStarterPair(data);

  if (!starters.away && !starters.home) return "—";

  return `${starters.away || "—"} vs ${starters.home || "—"}`;
}

function getLiveBadgeText(status) {
  if (status === "live") return "LIVE";
  if (status === "final") return "FINAL";
  if (status === "postponed") return "延賽";
  if (status === "suspended") return "保留";
  if (status === "cancelled") return "取消";

  return "賽前";
}

function getStatusText(status) {
  return STATUS_TEXT[status] || STATUS_TEXT.scheduled;
}

function formatScore(v) {
  return v ?? "—";
}

function formatLiveNum(value) {
  if (value === 0) return "0";
  if (value === null || value === undefined || value === "") return "—";

  return String(value);
}

function setBaseState(id, active) {
  const el = document.getElementById(id);

  if (!el) return;

  el.classList.toggle("on", !!active);
  el.classList.toggle("active", !!active);
}

function getBasesText(first, second, third) {
  const occupied = [];

  if (first) occupied.push("一壘");
  if (second) occupied.push("二壘");
  if (third) occupied.push("三壘");

  if (!occupied.length) return "壘包：—";

  return `壘包：${occupied.join("、")}有人`;
}

function formatClock(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

function formatBatterName(p) {
  const name = p.name || p.rawName || "—";
  const pos = p.position ? ` (${p.position})` : "";
  const note = p.note ? ` ${p.note}` : "";

  return `${name}${pos}${note}`;
}

function formatPitcherDecision(p) {
  const decision = p?.decision;

  if (decision && typeof decision === "object") {
    const text = cleanText(decision.text);
    const record = cleanText(decision.record);
    const type = cleanText(decision.type);

    if (text && record) return `${text} ${record}`;
    if (text) return text;

    if (type === "W") return "勝投";
    if (type === "L") return "敗投";
    if (type === "S") return "救援成功";
    if (type === "H") return "中繼成功";
  }

  if (typeof decision === "string" && decision.trim()) {
    return decision.trim();
  }

  const fallback = pick(p, "result", "note", "勝敗", "結果");

  return fallback === "—" ? "—" : String(fallback);
}

function formatPitcherName(p) {
  const name = p.name || p.rawName || "—";
  const note = p.note ? ` ${p.note}` : "";

  return `${name}${note}`;
}

function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && obj?.[key] !== "") {
      return obj[key];
    }
  }

  return "—";
}

function extractValueAfterLabel(lines = [], labels = []) {
  if (!Array.isArray(lines)) return "";

  for (const label of labels) {
    const idx = lines.findIndex(line =>
      String(line || "").trim().toUpperCase() === String(label).toUpperCase() ||
      String(line || "").includes(label)
    );

    if (idx >= 0) {
      for (let i = idx + 1; i < Math.min(lines.length, idx + 4); i++) {
        const candidate = String(lines[i] || "").trim();

        if (isProbablyPlayerName(candidate)) {
          return candidate;
        }
      }
    }
  }

  return "";
}

function isProbablyPlayerName(text) {
  const s = String(text || "").trim();

  if (!s) return false;

  const banned = [
    "比賽中",
    "LIVE",
    "進行中",
    "打擊",
    "打者",
    "投手",
    "BATTER",
    "PITCHER",
    "亞太主",
    "新莊",
    "天母",
    "澄清湖",
    "樂天桃園",
    "大巨蛋",
    "洲際",
    "攝氏25至26度",
    "攝氏27至28度",
    "降雨機率20%"
  ];

  if (banned.some(word => s.includes(word))) return false;
  if (Object.keys(TEAM_ID_MAP).some(team => s.includes(team))) return false;
  if (/^\d+$/.test(s)) return false;
  if (/^\d+\s*:\s*\d+$/.test(s)) return false;
  if (/^\d+-\d+-\d+$/.test(s)) return false;
  if (s.length < 2 || s.length > 12) return false;

  return /^[\u4e00-\u9fa5A-Za-z·．・]+$/.test(s);
}

function guessPitchCountFromLiveLines(lines = []) {
  if (!Array.isArray(lines) || !lines.length) return null;

  const last = Number(lines[lines.length - 1]);

  return Number.isFinite(last) ? last : null;
}

function guessInningFromLiveLines(lines = []) {
  if (!Array.isArray(lines)) return "";

  const inning = lines.find(line => /\d+局[上下]/.test(String(line || "")));

  return inning || "";
}

function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    cache: "no-store",
    signal: controller.signal
  }).finally(() => clearTimeout(timer));
}

function toNullableNumber(v) {
  if (v === null || v === undefined || v === "") return null;

  const n = Number(v);

  return Number.isFinite(n) ? n : v;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}