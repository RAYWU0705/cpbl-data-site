console.log("✅ match.js v5.5.2-GAME-COUNTDOWN-SYNC 已載入");

/* =========================================================
   Ray's CPBL Data Site
   Match Center v5.5.2-GAME-COUNTDOWN-SYNC
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

const LOCAL_BOX_KEY = "cpbl_boxscore";

const API_URL = "http://127.0.0.1:3002/api/live";
const STATIC_URL = "data/live/live-boxscore.json";
const PROBABLE_URL = "data/live/probable-pitchers.json";

const LIVE_REFRESH_MS = 30000;

let CURRENT_MATCH_DATA = null;
let CURRENT_GAME_SNO = null;
let CURRENT_QUERY = null;
let LIVE_REFRESH_TIMER = null;
let PROBABLE_PITCHERS_MAP = {};
let GAME_COUNTDOWN_TIMER = null;

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

    PROBABLE_PITCHERS_MAP = await loadProbablePitchers();

    const games = await loadAllGames();
    const box = findTargetGame(games, CURRENT_QUERY);

    if (!box) {
      console.warn("目前載入的 games：", games);
      showError("❌ 查無此比賽，請確認網址參數或 live-boxscore.json 是否已有此場資料。");
      return;
    }

    CURRENT_GAME_SNO = box.gameSno;

    const mergedBox = mergeGameProbablePitchers(box);

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

async function loadProbablePitchers() {
  try {
    const res = await fetchWithTimeout(`${PROBABLE_URL}?ts=${Date.now()}`, 2000);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    console.log("🎯 Match Center 讀到預告先發：", data);

    return data && typeof data === "object" ? data : {};

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

function normalizeLineScore(lineScore = {}) {
  return {
    away: normalizeInningArray(lineScore.away),
    home: normalizeInningArray(lineScore.home)
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
  return {
    away: {
      R: toNullableNumber(totals.away?.R),
      H: toNullableNumber(totals.away?.H),
      E: toNullableNumber(totals.away?.E)
    },
    home: {
      R: toNullableNumber(totals.home?.R),
      H: toNullableNumber(totals.home?.H),
      E: toNullableNumber(totals.home?.E)
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

function applyFrontendLocks(game) {
  if (!game) return game;

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
  renderGameCountdown(data);
  renderScore(data);
  renderStarterDuel(data);
  renderPregameUX(data);
  renderMatchProgress(data);
  renderDataQuality(data);
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
    PROBABLE_PITCHERS_MAP = await loadProbablePitchers();

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
        <p>${escapeHtml(meta.away || "客隊")}：${escapeHtml(starters.away || "—")}｜${escapeHtml(meta.home || "主隊")}：${escapeHtml(starters.home || "—")}</p>
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

  if (diffMs > 0) {
    return {
      label: `開賽倒數 ${formatCountdownClock(diffMs)}`,
      tone: diffMs <= 60 * 60 * 1000 ? "soon" : "normal"
    };
  }

  if (diffMs > -240 * 60 * 1000) {
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


function renderGameCountdown(data) {
  const panel = document.getElementById("gameCountdownPanel");
  const clock = document.getElementById("gameCountdownClock");
  const label = panel?.querySelector(".game-countdown-label");

  if (!panel || !clock) return;

  if (GAME_COUNTDOWN_TIMER) {
    clearInterval(GAME_COUNTDOWN_TIMER);
    GAME_COUNTDOWN_TIMER = null;
  }

  const meta = data?.meta || {};
  const status = meta.status || "scheduled";
  const start = parseGameStartDate(meta.date, meta.time);

  panel.classList.remove("is-soon", "is-started", "is-final");

  if (!start) {
    panel.hidden = true;
    return;
  }

  if (status === "final") {
    panel.hidden = false;
    panel.classList.add("is-final");
    if (label) label.textContent = "比賽狀態";
    clock.textContent = "FINAL";
    return;
  }

  if (["postponed", "cancelled", "suspended"].includes(status)) {
    panel.hidden = false;
    if (label) label.textContent = "比賽狀態";
    clock.textContent = getStatusText(status).replace(/[^\u4e00-\u9fa5A-Z]/g, "") || getStatusText(status);
    return;
  }

  panel.hidden = false;
  if (label) label.textContent = "開賽倒數";

  const tick = () => {
    const diffMs = start.getTime() - Date.now();
    panel.classList.remove("is-soon", "is-started");

    if (diffMs > 0) {
      clock.textContent = formatCountdownClock(diffMs);

      if (diffMs <= 60 * 60 * 1000) {
        panel.classList.add("is-soon");
      }

      return;
    }

    if (status === "live") {
      panel.classList.add("is-started");
      if (label) label.textContent = "比賽狀態";
      clock.textContent = "LIVE";
      return;
    }

    panel.classList.add("is-started");
    if (label) label.textContent = "比賽狀態";
    clock.textContent = "即將開賽";
  };

  tick();
  GAME_COUNTDOWN_TIMER = setInterval(tick, 1000);
}

function formatCountdownClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0")
  ].join(":");
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
          <span>${escapeHtml(away)}</span>
          <strong>${escapeHtml(starters.away || "尚未公布")}</strong>
        </div>

        <div class="starter-vs">
          <span>VS</span>
        </div>

        <div class="starter-team home">
          <img src="${homeLogo}" alt="${escapeHtml(home)}">
          <span>${escapeHtml(home)}</span>
          <strong>${escapeHtml(starters.home || "尚未公布")}</strong>
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
        <span>${escapeHtml(away)}</span>
        <strong>—</strong>
      </div>

      <div class="starter-vs">
        <span>VS</span>
      </div>

      <div class="starter-team home">
        <img src="${homeLogo}" alt="${escapeHtml(home)}">
        <span>${escapeHtml(home)}</span>
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
        <strong>${escapeHtml(meta.win ? `勝投 ${meta.win}` : "勝投 —")}</strong>
        <em>${escapeHtml(meta.save ? `救援 ${meta.save}` : "救援 —")}</em>
      </div>

      <div class="starter-vs">
        <span>投手</span>
      </div>

      <div class="starter-team loser-side">
        <img src="${loserLogo}" alt="${escapeHtml(loserTeam)}">
        <span>敗方｜${escapeHtml(loserTeam)}</span>
        <strong>${escapeHtml(meta.lose ? `敗投 ${meta.lose}` : "敗投 —")}</strong>
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

  setText("homeTeamRHE", meta.home || "主隊");
  setText("awayTeamRHE", meta.away || "客隊");

  setText("homeR", formatScore(data.totals?.home?.R));
  setText("homeH", formatScore(data.totals?.home?.H));
  setText("homeE", formatScore(data.totals?.home?.E));

  setText("awayR", formatScore(data.totals?.away?.R));
  setText("awayH", formatScore(data.totals?.away?.H));
  setText("awayE", formatScore(data.totals?.away?.E));

  const hasAnyRhe =
    data.totals?.home?.R != null ||
    data.totals?.away?.R != null ||
    data.totals?.home?.H != null ||
    data.totals?.away?.H != null;

  setText("rheHint", hasAnyRhe ? "" : "此場尚未開賽或官方尚未提供 R/H/E。");
}

function renderInnings(data) {
  const lineScore = data.lineScore || {
    away: [],
    home: []
  };

  fillRow("awayInningsRow", data.meta?.away || "客隊", lineScore, "away", data);
  fillRow("homeInningsRow", data.meta?.home || "主隊", lineScore, "home", data);

  const inningCount = getDisplayInningCount(lineScore, data);
  const hasInnings = inningCount > 0;

  if (hasInnings) {
    const quality = cleanText(data.dataQuality?.lineScore);
    const source = cleanText(data.lineScoreSource);

    if (quality === "partial") {
      setText(
        "inningsHint",
        source
          ? `逐局比分同步中，目前顯示前 ${inningCount} 局資料｜${source}`
          : `逐局比分同步中，目前顯示前 ${inningCount} 局資料`
      );
    } else {
      setText("inningsHint", "");
    }

    return;
  }

  const awayScore = formatScore(data.totals?.away?.R);
  const homeScore = formatScore(data.totals?.home?.R);

  setText(
    "inningsHint",
    `官方目前尚未提供逐局比分，暫先顯示總比分：${data.meta?.away || "客隊"} ${awayScore}：${homeScore} ${data.meta?.home || "主隊"}`
  );
}

function fillRow(id, team, lineScore = {}, side = "away", data = null) {
  const row = document.getElementById(id);

  if (!row) return;

  row.innerHTML = "";

  const name = document.createElement("td");
  name.textContent = team;
  name.className = "inning-team-name";
  row.appendChild(name);

  // 固定跑 1～9 局，不用 lineScore.length 決定欄位。
  // partial 逐局中，若第4局有分，前面空格會補0，不會看起來像錯位。
  for (let i = 0; i < 9; i++) {
    const td = document.createElement("td");
    const value = getDisplayInningCell(data, lineScore, side, i);

    td.textContent = value;
    td.dataset.inning = String(i + 1);

    if (value === "—") {
      td.classList.add("inning-empty");
    } else if (value === "0") {
      td.classList.add("inning-zero");
    } else {
      td.classList.add("inning-has-value");
    }

    row.appendChild(td);
  }
}

function renderDecisions(data) {
  setText("winPitcher", data.meta?.win || "—");
  setText("lossPitcher", data.meta?.lose || "—");
  setText("savePitcher", data.meta?.save || "—");
  setText("mvpPlayer", data.meta?.mvp || "—");
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

  return `
    <div class="batter-team-title">${escapeHtml(teamName)}</div>
    <div class="batter-header">
      <span>球員</span><span>AB</span><span>R</span><span>H</span><span>RBI</span><span>AVG</span>
    </div>
    ${players.map(p => {
      const playerName = formatBatterName(p);

      return `
        <div class="batter-row">
          <span>${escapeHtml(playerName)}</span>
          <span>${escapeHtml(pick(p, "AB", "打數"))}</span>
          <span>${escapeHtml(pick(p, "R", "得分"))}</span>
          <span>${escapeHtml(pick(p, "H", "安打"))}</span>
          <span>${escapeHtml(pick(p, "RBI", "打點"))}</span>
          <span>${escapeHtml(pick(p, "AVG", "打擊率"))}</span>
        </div>
      `;
    }).join("")}
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

  return `
    <div class="pitcher-team-title">${escapeHtml(teamName)}</div>
    <div class="pitcher-header">
      <span>投手</span><span>IP</span><span>H</span><span>ER</span><span>BB</span><span>ERA</span>
    </div>
    ${players.map(p => {
      const pitcherName = formatPitcherName(p);

      return `
        <div class="pitcher-row">
          <span>${escapeHtml(pitcherName)}</span>
          <span>${escapeHtml(pick(p, "IP", "投球局數"))}</span>
          <span>${escapeHtml(pick(p, "H", "安打"))}</span>
          <span>${escapeHtml(pick(p, "ER", "自責分"))}</span>
          <span>${escapeHtml(pick(p, "BB", "四壞"))}</span>
          <span>${escapeHtml(pick(p, "ERA", "防禦率"))}</span>
        </div>
      `;
    }).join("")}
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
        ${escapeHtml(meta.away || "客隊")} ${escapeHtml(starters.away || "—")}
        vs
        ${escapeHtml(meta.home || "主隊")} ${escapeHtml(starters.home || "—")}
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
      ${escapeHtml(game.meta?.away || "客隊")} ${escapeHtml(starters.away || "—")}
      vs
      ${escapeHtml(game.meta?.home || "主隊")} ${escapeHtml(starters.home || "—")}
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
        🔴 目前打者：${escapeHtml(liveState.batter || "—")}<br>
        目前投手：${escapeHtml(liveState.pitcher || inferLiveFlow(game).currentPitcher || "—")}
      </div>

      <div class="starter-box">
        🎯 預告先發：
        ${escapeHtml(game.meta?.away || "客隊")} ${escapeHtml(starters.away || "—")}
        vs
        ${escapeHtml(game.meta?.home || "主隊")} ${escapeHtml(starters.home || "—")}
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
              ${escapeHtml(game.meta?.away || "客隊")} ${escapeHtml(starters.away || "—")}
              vs
              ${escapeHtml(game.meta?.home || "主隊")} ${escapeHtml(starters.home || "—")}
            </div>
          `
          : ""
      }

      <div class="lineup-grid-2">
        <div class="lineup-card">
          <h3>${escapeHtml(game.meta?.away || "客隊")} 先發打序</h3>
          ${
            awayLineup.length
              ? awayLineup.map(p => `
                <div class="lineup-row">
                  <span class="lineup-order">${escapeHtml(p.order ?? "—")}</span>
                  <span class="lineup-name">${escapeHtml(p.name || "—")}</span>
                  <span class="lineup-pos">${escapeHtml(p.position || "")}</span>
                </div>
              `).join("")
              : `<p class="muted">尚未公布</p>`
          }
        </div>

        <div class="lineup-card">
          <h3>${escapeHtml(game.meta?.home || "主隊")} 先發打序</h3>
          ${
            homeLineup.length
              ? homeLineup.map(p => `
                <div class="lineup-row">
                  <span class="lineup-order">${escapeHtml(p.order ?? "—")}</span>
                  <span class="lineup-name">${escapeHtml(p.name || "—")}</span>
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