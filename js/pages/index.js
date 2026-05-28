/* =========================
   index.js v5.2.8-HOME-LOCALSTORAGE-QUOTA-GUARD
   首頁穩定化 + dataQuality 安全顯示 + 二軍入口
   - 讀取 data/live/live-boxscore.json
   - 讀取 data/live/probable-pitchers.json
   - 讀取 data/live/league-news.json
   - 官網風比分橫條
   - 日期切換
   - TOP6 戰績
   - 今日看球指南
   - 球隊賽程雷達
   - 聯盟快訊中心資料化
   - 球迷資料庫入口
   - 首頁二軍賽程入口
   - dataQuality / finalLock / liveState 安全顯示
========================= */

import { calculateStandings } from "../standingsEngine.js";

const VERSION = "v5.2.8-HOME-LOCALSTORAGE-QUOTA-GUARD";

const LIVE_JSON_URL = "data/live/live-boxscore.json";
const PROBABLE_JSON_URL = "data/live/probable-pitchers.json";
const LEAGUE_NEWS_JSON_URL = "data/live/league-news.json";
const LOCAL_BOX_KEY = "cpbl_boxscore";

const TEAM_ID_MAP = {
  "中信兄弟": "brothers",
  "統一7-ELEVEn獅": "lions",
  "樂天桃猿": "monkeys",
  "味全龍": "dragons",
  "富邦悍將": "guardians",
  "台鋼雄鷹": "hawks"
};

let allGames = [];
let selectedDate = new Date();
let focusIndex = 0;
let focusTimer = null;
let probablePitchersMap = {};
let leagueNewsData = null;
let lastLoadedAt = null;


function injectHomePregameCleanStyles() {
  if (document.getElementById("homePregameUxCleanStyle")) return;

  const style = document.createElement("style");
  style.id = "homePregameUxCleanStyle";
  style.textContent = `
    .official-pregame-clean {
      grid-column: 2 / 5;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px;
      margin: 8px auto 0;
      padding: 0;
      width: min(760px, 100%);
      color: #475569;
      font-size: 12px;
      font-weight: 900;
      line-height: 1.45;
      text-align: center;
    }

    .official-pregame-clean .pregame-clean-main {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-width: 0;
      max-width: 100%;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.045);
      color: #334155;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .official-pregame-clean .pregame-clean-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 26px;
      padding: 5px 9px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.055);
      color: #334155;
      white-space: nowrap;
    }

    .official-pregame-clean .pregame-clean-chip.is-ready {
      background: rgba(10, 143, 42, 0.10);
      color: #0a7a24;
    }

    .official-pregame-clean .pregame-clean-chip.is-waiting {
      background: rgba(245, 158, 11, 0.13);
      color: #92400e;
    }

    .official-pregame-clean .pregame-clean-chip.is-countdown {
      background: rgba(11, 60, 93, 0.09);
      color: var(--primary, #0b3c5d);
    }

    .official-score-card.scheduled .official-sub,
    .official-score-card.pregame .official-sub {
      margin-top: 4px;
      font-size: 12px;
      opacity: 0.78;
    }



    .official-pregame-extra.pregame-starters-only {
      margin-top: 8px;
    }

    .official-pregame-clean.pregame-status-lite {
      margin-top: 6px;
    }

    .official-pregame-clean.pregame-status-lite .pregame-clean-main {
      display: none;
    }

    @media (max-width: 900px) {
      .official-pregame-clean {
        grid-column: 1 / -1;
        justify-content: flex-start;
        text-align: left;
        width: 100%;
      }

      .official-pregame-clean .pregame-clean-main {
        white-space: normal;
        justify-content: flex-start;
      }
    }

    @media (max-width: 640px) {
      .official-pregame-clean {
        gap: 6px;
        font-size: 11px;
      }

      .official-pregame-clean .pregame-clean-main,
      .official-pregame-clean .pregame-clean-chip {
        width: 100%;
        justify-content: flex-start;
      }
    }
  `;

  document.head.appendChild(style);
}


/* =========================
   初始化
========================= */

document.addEventListener("DOMContentLoaded", initHome);

async function initHome() {
  try {
    injectHomePregameCleanStyles();
    setText("dataSourceText", "資料載入中…");

    allGames = await loadGames();
    leagueNewsData = await loadLeagueNews();
    lastLoadedAt = new Date();

    syncToLocalStorage(allGames.map(g => g.raw).filter(Boolean));

    // v5.0.2-HOME-DAILY-SCORESTRIP-FIX
    // 首頁比分橫條固定先顯示「今天」。
    // 若今天沒有比賽，renderScoreStrip() 會顯示「本日尚無比賽」。
    // 不再自動跳到最近有比賽日，避免無比賽日被省略。
    selectedDate = new Date();

    bindEvents();
    bindHomeSearch();
    renderAll();

    setText(
      "dataSourceText",
      `✅ 已載入 ${allGames.length} 場比賽資料｜${VERSION}｜最後讀取 ${formatClock(lastLoadedAt)}`
    );
  } catch (err) {
    console.error("❌ 首頁初始化失敗：", err);

    setText("dataSourceText", "⚠️ 首頁資料載入失敗，請查看 Console。");

    const scoreTrack = document.getElementById("scoreTrack");

    if (scoreTrack) {
      scoreTrack.innerHTML = `
        <div class="official-score-board">
          <div class="official-score-board-head">
            <div>
              <h2>資料載入失敗</h2>
              <p>請檢查 live-boxscore.json 或 Console 錯誤。</p>
            </div>
          </div>
          <div class="score-loading">首頁初始化失敗</div>
        </div>
      `;
    }
  }
}

/* =========================
   資料載入
========================= */

async function loadGames() {
  try {
    const [liveRes, probableRes] = await Promise.all([
      fetch(`${LIVE_JSON_URL}?ts=${Date.now()}`, {
        cache: "no-store"
      }),

      fetch(`${PROBABLE_JSON_URL}?ts=${Date.now()}`, {
        cache: "no-store"
      }).catch(() => null)
    ]);

    if (!liveRes.ok) {
      throw new Error(`HTTP ${liveRes.status}`);
    }

    const liveData = await liveRes.json();

    let probableData = {};

    if (probableRes && probableRes.ok) {
      probableData = await probableRes.json();
    }

    probablePitchersMap = probableData || {};

    const arr = normalizeGames(toArray(liveData));

    mergeProbablePitchers(arr, probablePitchersMap);

    console.log("✅ 首頁使用 live-boxscore.json", arr.length);
    console.log("✅ 首頁合併 probable-pitchers.json", Object.keys(probablePitchersMap).length);
    console.log("🧩 HOME parser", VERSION);

    return arr;
  } catch (err) {
    console.warn("⚠️ live-boxscore.json 讀取失敗，改讀 localStorage", err);

    const local = loadFromLocal();

    return normalizeGames(toArray(local));
  }
}

async function loadLeagueNews() {
  try {
    const res = await fetch(`${LEAGUE_NEWS_JSON_URL}?ts=${Date.now()}`, {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!data || !Array.isArray(data.items)) {
      throw new Error("league-news.json 格式不正確");
    }

    console.log("📰 首頁讀到 league-news.json", data.items.length);

    return data;
  } catch (err) {
    console.warn("⚠️ league-news.json 讀取失敗，改用前端 fallback", err);

    return null;
  }
}

function mergeProbablePitchers(games, probableData = {}) {
  games.forEach(game => {
    const probable = probableData?.[String(game.gameSno)];

    if (!probable) return;

    game.pregame ??= {};
    game.pregame.starters ??= {};

    if (probable.away) {
      game.pregame.starters.away = probable.away;
    }

    if (probable.home) {
      game.pregame.starters.home = probable.home;
    }

    game.raw ??= {};
    game.raw.pregame ??= {};
    game.raw.pregame.starters ??= {};

    if (probable.away) {
      game.raw.pregame.starters.away = probable.away;
    }

    if (probable.home) {
      game.raw.pregame.starters.home = probable.home;
    }
  });
}

function loadFromLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_BOX_KEY);

    if (!raw) return [];

    return JSON.parse(raw);
  } catch (err) {
    console.warn("⚠️ localStorage 快取讀取失敗，清除快取", err);

    try {
      localStorage.removeItem(LOCAL_BOX_KEY);
    } catch {}

    return [];
  }
}

function syncToLocalStorage(games) {
  if (!Array.isArray(games) || !games.length) return;

  const map = {};

  games.forEach(g => {
    const light = makeLocalStorageGameLite(g);

    if (light?.gameSno != null) {
      map[light.gameSno] = light;
    }
  });

  safeSetLocalStorage(LOCAL_BOX_KEY, JSON.stringify(map));
}

function makeLocalStorageGameLite(g) {
  if (!g || typeof g !== "object") return null;

  const meta = g.meta || {};

  return {
    gameSno: g.gameSno ?? meta.gameSno ?? null,
    kindCode: g.kindCode || "A",
    meta: {
      date: meta.date || "",
      time: meta.time || "",
      venue: meta.venue || "",
      home: meta.home || "",
      away: meta.away || "",
      status: meta.status || "",
      statusText: meta.statusText || "",
      type: meta.type || "regular",
      typeText: meta.typeText || "一軍例行賽",
      duration: meta.duration || "",
      win: meta.win || "",
      lose: meta.lose || "",
      save: meta.save || "",
      mvp: meta.mvp || "",
      finalLock: meta.finalLock ?? undefined,
      finalLockSource: meta.finalLockSource || "",
      finalVueEnhanced: meta.finalVueEnhanced ?? undefined
    },
    totals: cloneStorageSmall(g.totals || {}),
    lineScore: cloneStorageSmall(g.lineScore || {}),
    pregame: cloneStorageSmall(g.pregame || {}),
    liveState: makeLocalStorageLiveStateLite(g.liveState),
    decision: cloneStorageSmall(g.decision || {}),
    finalLock: cloneStorageSmall(g.finalLock || null),
    dataQuality: cloneStorageSmall(g.dataQuality || {})
  };
}

function makeLocalStorageLiveStateLite(liveState) {
  if (!liveState || typeof liveState !== "object") return null;

  const bases = liveState.bases || {};

  return {
    inningText: liveState.inningText || "",
    battingTeam: liveState.battingTeam || "",
    fieldingTeam: liveState.fieldingTeam || "",
    battingSide: liveState.battingSide || "",
    fieldingSide: liveState.fieldingSide || "",
    batter: liveState.batter || "",
    pitcher: liveState.pitcher || "",
    balls: liveState.balls ?? null,
    strikes: liveState.strikes ?? null,
    outs: liveState.outs ?? null,
    pitchCount: liveState.pitchCount ?? null,
    message: liveState.message || "",
    confidence: liveState.confidence || "",
    bases: {
      first: !!bases.first,
      second: !!bases.second,
      third: !!bases.third
    }
  };
}

function cloneStorageSmall(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`⚠️ localStorage 寫入失敗：${key}，改用輕量快取/跳過快取`, err);

    try {
      localStorage.removeItem(key);
    } catch {}

    try {
      const fallback = JSON.stringify({
        version: VERSION,
        savedAt: new Date().toISOString(),
        message: "localStorage quota exceeded; full live-boxscore is loaded from JSON instead."
      });

      localStorage.setItem(`${key}_meta`, fallback);
    } catch {}

    return false;
  }
}

function toArray(data) {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    return Object.values(data);
  }

  return [];
}

/* =========================
   資料正規化
========================= */

function normalizeGames(games) {
  return games.map(g => {
    const meta = g.meta || {};

    const home = normalizeTeamName(meta.home);
    const away = normalizeTeamName(meta.away);

    const homeScore = valueOrNull(g.totals?.home?.R);
    const awayScore = valueOrNull(g.totals?.away?.R);

    const status = normalizeStatus(
      meta.status || inferStatus(homeScore, awayScore, g)
    );

    const liveState = normalizeLiveState(g.liveState);
    const dataQuality = normalizeDataQuality(g.dataQuality);
    const finalLock = g.finalLock || null;

    return {
      raw: g,

      gameSno: g.gameSno ?? null,

      date: meta.date || "",
      time: meta.time || "",
      duration: meta.duration || "",
      venue: meta.venue || "",

      home,
      away,

      homeId: TEAM_ID_MAP[home] || "",
      awayId: TEAM_ID_MAP[away] || "",

      homeScore,
      awayScore,

      status,
      statusText: meta.statusText || getStatusText(status),

      type: meta.type || "regular",
      typeText: meta.typeText || "一軍例行賽",

      win: meta.win || null,
      lose: meta.lose || null,
      save: meta.save || null,
      mvp: meta.mvp || null,

      pregame: g.pregame || null,
      liveState,
      dataQuality,
      finalLock
    };
  }).filter(g => g.home && g.away && g.date);
}

function normalizeTeamName(name) {
  return String(name || "")
    .replace("7-ELEVEN", "7-ELEVEn")
    .trim();
}

function normalizeStatus(status) {
  const s = String(status || "scheduled").toLowerCase();

  if (
    [
      "live",
      "final",
      "scheduled",
      "postponed",
      "suspended",
      "cancelled"
    ].includes(s)
  ) {
    return s;
  }

  return "scheduled";
}

function normalizeDataQuality(dataQuality) {
  if (!dataQuality || typeof dataQuality !== "object") {
    return {
      score: "debug",
      rhe: "debug",
      lineScore: "debug",
      batters: "debug",
      pitchers: "debug",
      liveState: "debug",
      starters: "debug",
      lineups: "debug",
      source: "unknown"
    };
  }

  return {
    ...dataQuality,
    score: dataQuality.score || "debug",
    rhe: dataQuality.rhe || "debug",
    lineScore: dataQuality.lineScore || "debug",
    batters: dataQuality.batters || "debug",
    pitchers: dataQuality.pitchers || "debug",
    liveState: dataQuality.liveState || "debug",
    starters: dataQuality.starters || "debug",
    lineups: dataQuality.lineups || "debug",
    source: dataQuality.source || "unknown"
  };
}

function normalizeLiveState(liveState) {
  if (!liveState || typeof liveState !== "object") return null;

  const bases = liveState.bases || {};

  return {
    ...liveState,
    inningText: cleanSafe(liveState.inningText),
    batter: cleanSafe(liveState.batter),
    pitcher: cleanSafe(liveState.pitcher),
    battingTeam: cleanSafe(liveState.battingTeam),
    fieldingTeam: cleanSafe(liveState.fieldingTeam),
    battingSide: cleanSafe(liveState.battingSide),
    fieldingSide: cleanSafe(liveState.fieldingSide),
    confidence: liveState.confidence || "debug",
    message: liveState.message || "",
    balls: nullableNumber(liveState.balls),
    strikes: nullableNumber(liveState.strikes),
    outs: nullableNumber(liveState.outs),
    pitchCount: nullableNumber(liveState.pitchCount),
    bases: {
      first: !!bases.first,
      second: !!bases.second,
      third: !!bases.third
    }
  };
}

function cleanSafe(value) {
  return String(value || "").trim();
}

function valueOrNull(v) {
  if (v === undefined || v === null || v === "") return null;

  const n = Number(v);

  return Number.isFinite(n) ? n : null;
}

function nullableNumber(v) {
  if (v === undefined || v === null || v === "") return null;

  const n = Number(v);

  return Number.isFinite(n) ? n : null;
}

function inferStatus(homeScore, awayScore, rawGame) {
  if (rawGame?.meta?.status) return rawGame.meta.status;

  if (homeScore == null || awayScore == null) {
    return "scheduled";
  }

  const hasInning =
    rawGame?.lineScore?.home?.length ||
    rawGame?.lineScore?.away?.length;

  if (homeScore === 0 && awayScore === 0 && !hasInning) {
    return "scheduled";
  }

  return "final";
}

function hasScore(g) {
  return (
    (g.status === "final" || g.status === "live") &&
    typeof g.homeScore === "number" &&
    typeof g.awayScore === "number"
  );
}

function isQualityConfirmed(value) {
  return value === "confirmed";
}

function isQualityPartial(value) {
  return value === "partial";
}

function isQualityUsable(value) {
  return value === "confirmed" || value === "partial";
}

/* =========================
   日期工具
========================= */

function getToday() {
  return formatDate(new Date());
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseLocalDate(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateZh(dateStr) {
  const d = parseLocalDate(dateStr);
  const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${dateStr}（${week}）`;
}


/* =========================
   v5.0.1 賽前 UX 工具
========================= */

function getGameStartDateTime(g) {
  if (!g?.date || !g?.time) return null;

  const timeMatch = String(g.time).match(/(\d{1,2}):(\d{2})/);

  if (!timeMatch) return null;

  const [y, m, d] = String(g.date).split("-").map(Number);
  const hh = Number(timeMatch[1]);
  const mm = Number(timeMatch[2]);

  if (!y || !m || !d || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  return new Date(y, m - 1, d, hh, mm, 0);
}

function getGameCountdownText(g) {
  const start = getGameStartDateTime(g);

  if (!start) return "";

  const diffMs = start.getTime() - Date.now();

  if (diffMs <= -1000 * 60 * 30) {
    return "已達開賽時間，等待 LIVE 資料同步";
  }

  if (diffMs <= 0) {
    return "即將開打";
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `距離開賽約 ${hours} 小時 ${minutes} 分`;
  return `距離開賽約 ${minutes} 分`;
}

function getPregameUxInfo(g) {
  const awayStarter = getAwayStarter(g);
  const homeStarter = getHomeStarter(g);

  const awayLineupCount = Array.isArray(g.pregame?.lineups?.away)
    ? g.pregame.lineups.away.length
    : 0;

  const homeLineupCount = Array.isArray(g.pregame?.lineups?.home)
    ? g.pregame.lineups.home.length
    : 0;

  const hasBothStarters = !!awayStarter && !!homeStarter;
  const hasAnyStarter = !!awayStarter || !!homeStarter;
  const hasBothLineups = awayLineupCount > 0 && homeLineupCount > 0;
  const hasAnyLineup = awayLineupCount > 0 || homeLineupCount > 0;

  return {
    awayStarter,
    homeStarter,
    awayLineupCount,
    homeLineupCount,
    hasBothStarters,
    hasAnyStarter,
    hasBothLineups,
    hasAnyLineup,
    countdown: getGameCountdownText(g),
    starterStatus: hasBothStarters
      ? "先發投手已公布"
      : hasAnyStarter
        ? "先發投手部分同步"
        : "先發投手待公布",
    lineupStatus: hasBothLineups
      ? `先發打序已同步：客 ${awayLineupCount} 人｜主 ${homeLineupCount} 人`
      : hasAnyLineup
        ? `先發打序部分同步：客 ${awayLineupCount || "—"} 人｜主 ${homeLineupCount || "—"} 人`
        : "先發打序尚未同步",
    liveStatus: g.status === "scheduled" ? "LIVE 尚未開始" : getStatusText(g.status),
    finalStatus: g.finalLock?.locked ? "FINAL 已鎖定" : "FINAL 未鎖定"
  };
}

function getPregameQualityLabel(g) {
  const info = getPregameUxInfo(g);

  if (info.hasBothStarters && info.hasBothLineups) return "賽前資料完整";
  if (info.hasBothStarters) return "先發已公布";
  if (info.hasAnyStarter) return "先發部分同步";

  return "賽前同步中";
}

function findNearestGameDate() {
  const today = getToday();

  const todayGames = allGames.filter(g => g.date === today);

  if (todayGames.length) return todayGames[0];

  const future = allGames
    .filter(g => g.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (future.length) return future[0];

  const past = allGames
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  return past[0] || null;
}

function getAvailableGameDates() {
  return [...new Set(
    allGames
      .map(g => g.date)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function moveSelectedDate(direction) {
  // v5.0.3-HOME-CALENDAR-SCORESTRIP
  // 日期切換改成真正的日曆前一天 / 後一天。
  // 不再只在「有比賽的日期」之間跳，這樣無比賽日才會顯示「本日尚無比賽」。
  const step = Number(direction) || 0;

  if (!step) return;

  selectedDate = addDays(selectedDate || new Date(), step);

  renderAll();
}

function findNearestDateIndex(dates, current) {
  const futureIndex = dates.findIndex(d => d >= current);

  if (futureIndex >= 0) return futureIndex;

  return dates.length - 1;
}

function formatClock(date) {
  if (!date) return "—";

  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

/* =========================
   事件
========================= */

function bindEvents() {
  const refreshBtn = document.getElementById("btnRefreshLive");

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "重新載入中…";

      setText("dataSourceText", "重新載入中…");

      allGames = await loadGames();
      leagueNewsData = await loadLeagueNews();
      lastLoadedAt = new Date();

      syncToLocalStorage(allGames.map(g => g.raw).filter(Boolean));

      renderAll();

      setText(
        "dataSourceText",
        `✅ 已重新載入 ${allGames.length} 場比賽資料｜${VERSION}｜最後讀取 ${formatClock(lastLoadedAt)}`
      );

      refreshBtn.disabled = false;
      refreshBtn.textContent = "重新整理資料";
    });
  }

  bindScoreStripDateSwitch();
}

/* =========================
   總渲染
========================= */

function renderAll() {
  safeRender("renderDateGames", renderDateGames);
  safeRender("renderScoreStrip", renderScoreStrip);
  safeRender("renderFocusSlider", renderFocusSlider);
  safeRender("renderTop6", renderTop6);

  safeRender("renderWatchGuide", renderWatchGuide);
  safeRender("renderScheduleRadar", renderScheduleRadar);

  safeRender("renderTodaySummary", renderTodaySummary);
  safeRender("renderSystemStatus", renderSystemStatus);

  safeRender("renderLeagueNews", renderLeagueNews);
  safeRender("renderFanDatabase", renderFanDatabase);
}

function safeRender(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`❌ ${name} 渲染失敗：`, err);
  }
}

/* =========================
   今日 / 指定日期賽事
========================= */

function renderDateGames() {
  const dateText = document.getElementById("currentDateText");
  const countText = document.getElementById("gameCountText");
  const list = document.getElementById("dateGamesList");

  if (!dateText || !countText || !list) return;

  const dateStr = formatDate(selectedDate);

  const games = allGames
    .filter(g => g.date === dateStr)
    .sort(sortByTimeAndGameSno);

  dateText.textContent = formatDateZh(dateStr);

  countText.textContent = games.length
    ? `共 ${games.length} 場比賽`
    : "本日目前沒有賽程資料";

  if (!games.length) {
    list.innerHTML = `<div class="empty-box">這一天沒有比賽資料。</div>`;
    return;
  }

  list.innerHTML = games.map(g => `
    <a class="mini-game-card" href="${buildMatchLink(g)}">
      <strong>${escapeHtml(g.away)} vs ${escapeHtml(g.home)}</strong>
      <div class="muted">
        ${escapeHtml(g.venue || "球場待定")}｜${escapeHtml(g.time || g.duration || "時間未定")}｜${getStatusText(g.status)}
      </div>
      ${renderPregameInfo(g)}
      ${renderMiniQualityHint(g)}
    </a>
  `).join("");
}

/* =========================
   官網風比分橫條
========================= */

function renderScoreStrip() {
  const track = document.getElementById("scoreTrack");

  if (!track) return;

  const selectedDateStr = formatDate(selectedDate);

  const games = allGames
    .filter(g => g.date === selectedDateStr)
    .sort(sortByTimeAndGameSno);

  if (!games.length) {
    track.innerHTML = renderNoGameScoreBoard(selectedDateStr);
    return;
  }

  const boardDate = selectedDateStr;

  track.innerHTML = `
    <div class="official-score-board">
      <div class="official-score-board-head">
        <div class="official-score-title-group">
          <p class="official-score-date">${escapeHtml(formatDateZh(boardDate))}</p>
          <h2>${boardDate === getToday() ? "今日賽程" : "賽程"}</h2>
        </div>

        <div class="official-score-head-right">
          <div class="official-score-summary">
            ${renderOfficialScoreSummary(games)}
          </div>

          <div class="official-score-head-nav" aria-label="切換日期">
            <button class="score-board-nav left" type="button" data-score-nav="-1" aria-label="前一天">‹</button>
            <button class="score-board-nav right" type="button" data-score-nav="1" aria-label="後一天">›</button>
          </div>
        </div>
      </div>

      <div class="official-score-list">
        ${games.map(g => renderOfficialScoreCard(g)).join("")}
      </div>
    </div>
  `;
}

function renderNoGameScoreBoard(dateStr) {
  const isToday = dateStr === getToday();

  return `
    <div class="official-score-board official-score-board-empty">
      <div class="official-score-board-head">
        <div class="official-score-title-group">
          <p class="official-score-date">${escapeHtml(formatDateZh(dateStr))}</p>
          <h2>${isToday ? "今日賽程" : "賽程"}</h2>
        </div>

        <div class="official-score-head-right">
          <div class="official-score-summary">
            <span>共 0 場</span>
            <span>LIVE 0</span>
            <span>未開打 0</span>
            <span>已結束 0</span>
          </div>

          <div class="official-score-head-nav" aria-label="切換日期">
            <button class="score-board-nav left" type="button" data-score-nav="-1" aria-label="前一天">‹</button>
            <button class="score-board-nav right" type="button" data-score-nav="1" aria-label="後一天">›</button>
          </div>
        </div>
      </div>

      <div class="official-no-game-card" role="status" aria-live="polite">
        <div class="official-no-game-main">本日尚無比賽</div>
        <div class="official-no-game-sub">
          可使用左右切換查看前後日期賽程，或進入賽程中心查看完整賽程。
        </div>
      </div>
    </div>
  `;
}

function renderOfficialScoreSummary(games) {
  const live = games.filter(g => g.status === "live").length;
  const scheduled = games.filter(g => g.status === "scheduled").length;
  const final = games.filter(g => g.status === "final").length;
  const postponed = games.filter(g => g.status === "postponed").length;
  const suspended = games.filter(g => g.status === "suspended").length;
  const cancelled = games.filter(g => g.status === "cancelled").length;

  return `
    <span>共 ${games.length} 場</span>
    <span>LIVE ${live}</span>
    <span>未開打 ${scheduled}</span>
    <span>已結束 ${final}</span>
    ${postponed ? `<span>延賽 ${postponed}</span>` : ""}
    ${suspended ? `<span>保留 ${suspended}</span>` : ""}
    ${cancelled ? `<span>取消 ${cancelled}</span>` : ""}
  `;
}

function renderOfficialScoreCard(g) {
  const awayLogo = getTeamLogo(g.away);
  const homeLogo = getTeamLogo(g.home);

  const statusClass = getStatusClass(g.status);
  const qualityClass = getGameQualityClass(g);
  const mainText = getOfficialMainText(g);
  const subText = getOfficialSubText(g);

  return `
    <a class="official-score-card ${statusClass} ${qualityClass}" href="${buildMatchLink(g)}">
      <div class="official-game-no">
        ${escapeHtml(g.gameSno ?? "—")}
      </div>

      <div class="official-team official-away">
        <img src="${awayLogo}" alt="${escapeHtml(g.away)}">
        <strong>${escapeHtml(g.away)}</strong>
        <span>${getTeamShortRecord(g.away)}</span>
      </div>

      <div class="official-center">
        <div class="official-status">${getStatusText(g.status)}</div>
        <div class="official-main">${mainText}</div>
        <div class="official-meta">
          ${escapeHtml(g.venue || "球場待定")}｜${escapeHtml(g.time || g.duration || "時間未定")}
        </div>
        <div class="official-sub">${subText}</div>
      </div>

      <div class="official-team official-home">
        <img src="${homeLogo}" alt="${escapeHtml(g.home)}">
        <strong>${escapeHtml(g.home)}</strong>
        <span>${getTeamShortRecord(g.home)}</span>
      </div>

      <div class="official-actions">
        <span class="official-btn">比賽中心</span>
        <span class="official-more">${getQualityBadgeText(g)}</span>
      </div>

      ${renderOfficialExtraInfo(g)}
    </a>
  `;
}

function renderOfficialExtraInfo(g) {
  if (g.status === "final") {
    const items = [];

    if (g.win) {
      items.push({
        label: "勝投",
        value: g.win
      });
    }

    if (g.lose) {
      items.push({
        label: "敗投",
        value: g.lose
      });
    }

    if (g.save) {
      items.push({
        label: "救援",
        value: g.save
      });
    }

    if (g.mvp) {
      items.push({
        label: "MVP",
        value: g.mvp
      });
    }

    if (!items.length) {
      return `
        <div class="official-starters official-extra official-final-extra">
          <div>
            <span>賽後資訊</span>
            <strong>比賽結束</strong>
          </div>
          <div>
            <span>資料狀態</span>
            <strong>${escapeHtml(getQualityText(g.dataQuality?.result || g.dataQuality?.score))}</strong>
          </div>
        </div>
      `;
    }

    return `
      <div class="official-starters official-extra official-final-extra">
        ${items.map(item => `
          <div>
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }

  if (g.status === "live") {
    const liveState = g.liveState || {};
    const items = [];

    if (liveState.inningText) {
      items.push({
        label: "局數",
        value: liveState.inningText
      });
    }

    if (liveState.battingTeam) {
      items.push({
        label: "進攻",
        value: liveState.battingTeam
      });
    }

    if (liveState.batter && liveState.pitcher) {
      items.push({
        label: "投打",
        value: `${liveState.batter} vs ${liveState.pitcher}`
      });
    } else if (liveState.message) {
      items.push({
        label: "即時資料",
        value: "同步中"
      });
    }

    if (!items.length) {
      items.push({
        label: "即時戰況",
        value: "資料同步中"
      });
    }

    return `
      <div class="official-starters official-extra official-live-extra">
        ${items.map(item => `
          <div>
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }

  const info = getPregameUxInfo(g);

  const lineupTone = info.hasBothLineups
    ? "is-ready"
    : "is-waiting";

  const lineupText = info.hasBothLineups
    ? "打序已同步"
    : info.hasAnyLineup
      ? "打序部分同步"
      : "打序尚未同步";

  const countdownText = info.countdown
    ? info.countdown.replace("距離開賽", "").replace("約", "約")
    : "等待開賽時間";

  const hasAnyStarter = !!info.awayStarter || !!info.homeStarter;

  const starterBlock = hasAnyStarter
    ? `
      <div class="official-starters official-extra official-pregame-extra pregame-ux-extra pregame-starters-only">
        ${info.awayStarter ? `
          <div>
            <span>客場先發</span>
            <strong>${escapeHtml(info.awayStarter)}</strong>
          </div>
        ` : ""}
        ${info.homeStarter ? `
          <div>
            <span>主場先發</span>
            <strong>${escapeHtml(info.homeStarter)}</strong>
          </div>
        ` : ""}
      </div>
    `
    : "";

  return `
    ${starterBlock}

    <div class="official-pregame-clean pregame-status-lite ${hasAnyStarter ? "has-starters" : "no-starters"}">
      <span class="pregame-clean-chip ${lineupTone}">
        📋 ${escapeHtml(lineupText)}
      </span>
      <span class="pregame-clean-chip is-countdown">
        ⏱ ${escapeHtml(countdownText)}
      </span>
    </div>
  `;
}

function getAwayStarter(g) {
  const probable = probablePitchersMap?.[String(g.gameSno)] || {};

  return (
    probable.away ||
    g.pregame?.starters?.away ||
    g.raw?.pregame?.starters?.away ||
    ""
  );
}

function getHomeStarter(g) {
  const probable = probablePitchersMap?.[String(g.gameSno)] || {};

  return (
    probable.home ||
    g.pregame?.starters?.home ||
    g.raw?.pregame?.starters?.home ||
    ""
  );
}

function getOfficialMainText(g) {
  if (hasScore(g)) {
    const awayScore =
      typeof g.awayScore === "number"
        ? g.awayScore
        : "—";

    const homeScore =
      typeof g.homeScore === "number"
        ? g.homeScore
        : "—";

    return `${awayScore} : ${homeScore}`;
  }

  return "VS.";
}

function getOfficialSubText(g) {
  if (g.status === "live") {
    const liveState = g.liveState || {};

    const inning =
      liveState.inningText ||
      "比賽進行中";

    const batting =
      liveState.battingTeam
        ? `｜${liveState.battingTeam}進攻`
        : "";

    const matchup =
      liveState.batter && liveState.pitcher
        ? `｜${liveState.batter} vs ${liveState.pitcher}`
        : "";

    if (matchup) {
      return `${inning}${batting}${matchup}`;
    }

    return `${inning}${batting}｜目前投打資料同步中`;
  }

  if (g.status === "final") {
    const parts = [];

    if (g.win) parts.push(`勝投 ${g.win}`);
    if (g.lose) parts.push(`敗投 ${g.lose}`);
    if (g.save) parts.push(`救援 ${g.save}`);
    if (g.mvp) parts.push(`MVP ${g.mvp}`);

    return parts.length
      ? parts.join("｜")
      : "比賽結束";
  }

  if (g.status === "postponed") return "此場延賽";
  if (g.status === "suspended") return "此場為保留比賽";
  if (g.status === "cancelled") return "此場取消";

  const info = getPregameUxInfo(g);
  const countdownText = info.countdown ? `｜${info.countdown}` : "";

  return `${info.lineupStatus}${countdownText}`;
}

function getStatusClass(status) {
  if (status === "live") return "is-live";
  if (status === "final") return "is-final";
  if (status === "postponed") return "is-postponed";
  if (status === "suspended") return "is-suspended";
  if (status === "cancelled") return "is-cancelled";

  return "is-scheduled";
}

function getGameQualityClass(g) {
  if (g.status === "final") {
    if (g.finalLock?.locked) return "quality-confirmed";
    return isQualityUsable(g.dataQuality?.score) ? "quality-partial" : "quality-debug";
  }

  if (g.status === "live") {
    if (isQualityConfirmed(g.dataQuality?.liveState)) return "quality-confirmed";
    if (isQualityPartial(g.dataQuality?.liveState)) return "quality-partial";
    return "quality-debug";
  }

  if (g.status === "scheduled") {
    if (isQualityConfirmed(g.dataQuality?.starters)) return "quality-confirmed";
    if (isQualityPartial(g.dataQuality?.starters)) return "quality-partial";
    return "quality-debug";
  }

  return "quality-debug";
}

function getQualityBadgeText(g) {
  if (g.status === "final" && g.finalLock?.locked) return "FINAL鎖定";

  if (g.status === "scheduled") {
    return getPregameQualityLabel(g);
  }

  const q =
    g.status === "live"
      ? g.dataQuality?.liveState
      : g.dataQuality?.score;

  if (q === "confirmed") return "資料完整";
  if (q === "partial") return "部分同步";
  return "資料同步中";
}

function getQualityText(q) {
  if (q === "confirmed") return "已確認";
  if (q === "partial") return "部分同步";
  return "同步中";
}

function bindScoreStripDateSwitch() {
  const wrap = document.querySelector(".score-strip-wrap");

  if (!wrap || wrap.dataset.navBound === "1") return;

  wrap.dataset.navBound = "1";

  wrap.addEventListener("click", event => {
    const btn = event.target.closest("[data-score-nav]");

    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();

    const direction = Number(btn.dataset.scoreNav || 0);

    if (!direction) return;

    moveSelectedDate(direction);
  });
}

/* =========================
   最近賽程焦點
========================= */

function renderFocusSlider() {
  const track = document.getElementById("focusTrack");
  const dots = document.getElementById("focusDots");

  if (!track) return;

  const today = getToday();

  let games = allGames
    .filter(g => g.date >= today && g.status !== "cancelled")
    .sort((a, b) => a.date.localeCompare(b.date) || sortByTimeAndGameSno(a, b))
    .slice(0, 6);

  if (!games.length) {
    games = allGames
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || Number(b.gameSno) - Number(a.gameSno))
      .slice(0, 6);
  }

  if (!games.length) {
    track.innerHTML = `<p class="muted">目前沒有賽程焦點。</p>`;

    if (dots) dots.innerHTML = "";

    return;
  }

  focusIndex = Math.min(focusIndex, games.length - 1);

  const g = games[focusIndex];

  track.innerHTML = `
    <a class="focus-card" href="${buildMatchLink(g)}">
      <div class="muted">${escapeHtml(formatDateZh(g.date))}</div>
      <h3>${escapeHtml(g.away)} vs ${escapeHtml(g.home)}</h3>
      <p>${escapeHtml(g.time || g.duration || "時間未定")}｜${escapeHtml(g.venue || "球場待定")}</p>
      <p>${renderGameStatus(g)}</p>
      <p class="muted">${escapeHtml(getOfficialSubText(g))}</p>
    </a>
  `;

  if (dots) {
    dots.innerHTML = games.map((_, i) => `
      <button
        type="button"
        class="${i === focusIndex ? "active" : ""}"
        data-index="${i}"
        aria-label="切換焦點 ${i + 1}"
      ></button>
    `).join("");

    dots.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        focusIndex = Number(btn.dataset.index);
        renderFocusSlider();
      });
    });
  }

  clearInterval(focusTimer);

  focusTimer = setInterval(() => {
    focusIndex = (focusIndex + 1) % games.length;
    renderFocusSlider();
  }, 4500);
}

/* =========================
   TOP 6 排名
========================= */

function renderTop6() {
  const box = document.getElementById("top6List");

  if (!box) return;

  const validGames = allGames
    .map(g => g.raw)
    .filter(g =>
      g?.meta?.type === "regular" &&
      g?.meta?.home &&
      g?.meta?.away
    );

  const standings = calculateStandings(validGames).slice(0, 6);

  if (!standings.length) {
    box.innerHTML = `<li class="muted">尚無戰績資料</li>`;
    return;
  }

  box.innerHTML = standings.map(t => {
    const id = TEAM_ID_MAP[t.team] || "";

    return `
      <li class="top6-item">
        <span class="rank">#${t.rank}</span>
        ${id ? `<img src="assets/logo/${id}.png" alt="${escapeHtml(t.team)}">` : ""}
        <span>${escapeHtml(t.team)}</span>
        <strong>${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}</strong>
        <span class="muted">${t.winPct.toFixed(3)}</span>
      </li>
    `;
  }).join("");
}

/* =========================
   今日看球指南
========================= */

function renderWatchGuide() {
  const box = document.getElementById("watchGuideContent");

  if (!box) return;

  const targetGames = getTodayOrNextGames();

  if (!targetGames.length) {
    box.innerHTML = `
      <div class="feature-empty">
        <strong>目前沒有可推薦賽事</strong>
        <span>等待賽程資料更新後，系統會自動產生看球指南。</span>
      </div>
    `;
    return;
  }

  const standingsMap = getStandingsMap();

  const rankedGames = targetGames
    .map(g => ({
      game: g,
      score: getWatchGuideScore(g, standingsMap),
      reasons: getWatchGuideReasons(g, standingsMap)
    }))
    .sort((a, b) => b.score - a.score || sortByTimeAndGameSno(a.game, b.game));

  const main = rankedGames[0];
  const others = rankedGames.slice(1, 3);
  const g = main.game;

  box.innerHTML = `
    <a class="watch-guide-main" href="${buildMatchLink(g)}">
      <div class="feature-label">TODAY'S PICK</div>

      <div class="watch-guide-match">
        <strong>${escapeHtml(g.away)} vs ${escapeHtml(g.home)}</strong>
        <span>${escapeHtml(g.date)}｜${escapeHtml(g.venue || "球場待定")}｜${escapeHtml(g.time || g.duration || "時間未定")}</span>
      </div>

      <div class="watch-guide-score">
        推薦指數 <strong>${main.score}</strong>
      </div>

      <div class="watch-guide-reasons">
        ${main.reasons.map(r => `<span>${escapeHtml(r)}</span>`).join("")}
      </div>
    </a>

    ${
      others.length
        ? `
          <div class="watch-guide-list">
            ${others.map(item => `
              <a href="${buildMatchLink(item.game)}" class="watch-guide-mini">
                <strong>${escapeHtml(item.game.away)} vs ${escapeHtml(item.game.home)}</strong>
                <span>${escapeHtml(item.reasons[0] || getStatusText(item.game.status))}</span>
              </a>
            `).join("")}
          </div>
        `
        : ""
    }
  `;
}

function getTodayOrNextGames() {
  const today = getToday();

  let games = allGames
    .filter(g => g.date === today)
    .sort(sortByTimeAndGameSno);

  if (games.length) return games;

  const futureDate = allGames
    .map(g => g.date)
    .filter(date => date && date >= today)
    .sort((a, b) => a.localeCompare(b))[0];

  if (!futureDate) return [];

  return allGames
    .filter(g => g.date === futureDate)
    .sort(sortByTimeAndGameSno);
}

function getWatchGuideScore(g, standingsMap) {
  let score = 60;

  if (g.status === "live") score += 30;
  if (g.status === "scheduled") score += 12;
  if (g.status === "final") score -= 10;

  const awayRank = standingsMap.get(g.away)?.rank;
  const homeRank = standingsMap.get(g.home)?.rank;

  if (awayRank && homeRank) {
    const rankGap = Math.abs(awayRank - homeRank);

    if (rankGap <= 1) score += 24;
    else if (rankGap <= 2) score += 16;
    else if (rankGap <= 3) score += 8;
  }

  const awayStarter = getAwayStarter(g);
  const homeStarter = getHomeStarter(g);

  if (awayStarter && homeStarter) score += 10;

  if (hasScore(g)) {
    const diff = Math.abs(g.awayScore - g.homeScore);

    if (diff <= 1) score += 18;
    else if (diff <= 3) score += 8;
  }

  if (g.status === "final" && g.mvp) score += 5;
  if (g.status === "live" && isQualityUsable(g.dataQuality?.liveState)) score += 5;

  return Math.max(0, Math.min(99, score));
}

function getWatchGuideReasons(g, standingsMap) {
  const reasons = [];

  if (g.status === "live") {
    reasons.push("LIVE 進行中");
  } else if (g.status === "scheduled") {
    reasons.push("賽前焦點");
  } else if (g.status === "final") {
    reasons.push("賽後回顧");
  }

  const awayRank = standingsMap.get(g.away)?.rank;
  const homeRank = standingsMap.get(g.home)?.rank;

  if (awayRank && homeRank) {
    const rankGap = Math.abs(awayRank - homeRank);

    if (rankGap <= 1) {
      reasons.push("排名接近");
    } else if (rankGap <= 3) {
      reasons.push("排名牽動");
    }
  }

  const awayStarter = getAwayStarter(g);
  const homeStarter = getHomeStarter(g);

  if (awayStarter && homeStarter && g.status === "scheduled") {
    reasons.push("先發已公布");
  }

  if (hasScore(g)) {
    const diff = Math.abs(g.awayScore - g.homeScore);

    if (diff <= 1) reasons.push("比分膠著");
    else if (diff >= 5) reasons.push("大比分戰局");
  }

  if (g.mvp && g.status === "final") {
    reasons.push(`MVP ${g.mvp}`);
  }

  if (g.venue) {
    reasons.push(g.venue);
  }

  return reasons.slice(0, 4);
}

function getStandingsMap() {
  const rawGames = allGames
    .map(g => g.raw)
    .filter(g =>
      g?.meta?.type === "regular" &&
      g?.meta?.home &&
      g?.meta?.away
    );

  try {
    const standings = calculateStandings(rawGames);
    return new Map(standings.map(row => [row.team, row]));
  } catch {
    return new Map();
  }
}

/* =========================
   球隊賽程雷達
========================= */

function renderScheduleRadar() {
  const box = document.getElementById("scheduleRadarContent");

  if (!box) return;

  const teams = Object.keys(TEAM_ID_MAP);
  const today = getToday();
  const weekEnd = formatDate(addDays(new Date(), 7));

  const futureGames = allGames
    .filter(g =>
      g.date >= today &&
      g.date <= weekEnd &&
      g.status !== "cancelled"
    )
    .sort((a, b) => a.date.localeCompare(b.date) || sortByTimeAndGameSno(a, b));

  if (!futureGames.length) {
    box.innerHTML = `
      <div class="feature-empty">
        <strong>未來 7 天沒有賽程</strong>
        <span>賽程更新後會自動整理六隊行程壓力。</span>
      </div>
    `;
    return;
  }

  const radar = teams.map(team => {
    const games = futureGames.filter(g => g.away === team || g.home === team);
    const home = games.filter(g => g.home === team).length;
    const away = games.filter(g => g.away === team).length;

    return {
      team,
      teamId: TEAM_ID_MAP[team],
      total: games.length,
      home,
      away,
      pressure: getSchedulePressureScore(games, team)
    };
  }).sort((a, b) => b.pressure - a.pressure || b.total - a.total);

  const hardest = radar[0];
  const mostHome = radar
    .slice()
    .sort((a, b) => b.home - a.home || b.total - a.total)[0];

  box.innerHTML = `
    <div class="schedule-radar-summary">
      <div>
        <span>未來 7 天最硬</span>
        <strong>${escapeHtml(hardest?.team || "—")}</strong>
        <em>${hardest ? `${hardest.total} 場｜客場 ${hardest.away}` : "—"}</em>
      </div>

      <div>
        <span>主場優勢最多</span>
        <strong>${escapeHtml(mostHome?.team || "—")}</strong>
        <em>${mostHome ? `${mostHome.home} 場主場` : "—"}</em>
      </div>
    </div>

    <div class="schedule-radar-list">
      ${radar.map(row => `
        <div class="schedule-radar-row">
          <div class="radar-team">
            <img src="assets/logo/${row.teamId}.png" alt="${escapeHtml(row.team)}">
            <strong>${escapeHtml(row.team)}</strong>
          </div>

          <div class="radar-bars">
            <div class="radar-main">
              <span>賽程壓力</span>
              <strong>${row.pressure}</strong>
            </div>

            <div class="radar-meta">
              ${row.total} 場｜主 ${row.home}｜客 ${row.away}
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function getSchedulePressureScore(games, team) {
  if (!games.length) return 0;

  const awayGames = games.filter(g => g.away === team).length;
  const uniqueDays = [...new Set(games.map(g => g.date))].sort();

  let backToBack = 0;

  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = parseLocalDate(uniqueDays[i - 1]);
    const curr = parseLocalDate(uniqueDays[i]);

    const diffDays = Math.round((curr - prev) / 86400000);

    if (diffDays === 1) backToBack++;
  }

  return games.length * 20 + awayGames * 8 + backToBack * 10;
}

/* =========================
   聯盟快訊中心
========================= */

function renderLeagueNews() {
  const box = document.getElementById("leagueNewsContent");

  if (!box) return;

  if (leagueNewsData && Array.isArray(leagueNewsData.items) && leagueNewsData.items.length) {
    renderLeagueNewsFromJson(box, leagueNewsData);
    return;
  }

  renderLeagueNewsFallback(box);
}

function renderLeagueNewsFromJson(box, data) {
  const items = data.items.slice(0, 6);

  box.innerHTML = `
    <div class="league-news-list">
      ${items.map(item => `
        <a
          class="league-news-item"
          href="${item.gameSno ? `match.html?gameSno=${encodeURIComponent(item.gameSno)}` : "version.html"}"
        >
          <span>${escapeHtml(item.tag || item.type || "NEWS")}</span>
          <strong>${escapeHtml(item.title || "快訊待更新")}</strong>
          <em>${escapeHtml(item.desc || "資料整理中。")}</em>
        </a>
      `).join("")}
    </div>

    <div class="league-news-meta">
      <span>快訊更新：${escapeHtml(formatLeagueNewsTime(data.updatedAt))}</span>
      <span>來源：data/live/league-news.json</span>
    </div>
  `;
}

function formatLeagueNewsTime(value) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return value;

  return formatClock(d);
}

function renderLeagueNewsFallback(box) {
  const today = getToday();
  const todayGames = allGames.filter(g => g.date === today);
  const liveGames = todayGames.filter(g => g.status === "live");
  const scheduledGames = todayGames.filter(g => g.status === "scheduled");
  const finalGames = todayGames.filter(g => g.status === "final");
  const postponedGames = todayGames.filter(g => g.status === "postponed");

  const latestGame = allGames
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.gameSno || 0) - Number(a.gameSno || 0))[0];

  const latestFinal = allGames
    .filter(g => g.status === "final")
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.gameSno || 0) - Number(a.gameSno || 0))[0];

  const nextGame = allGames
    .filter(g => g.status === "scheduled" && g.date >= today)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || sortByTimeAndGameSno(a, b))[0];

  const items = [
    {
      tag: "TODAY",
      title: todayGames.length
        ? `今日共有 ${todayGames.length} 場賽事`
        : "今日暫無賽程",
      desc: `LIVE ${liveGames.length}｜未開賽 ${scheduledGames.length}｜已結束 ${finalGames.length}｜延賽 ${postponedGames.length}`
    },
    {
      tag: "FINAL",
      title: latestFinal
        ? `最新賽果：${latestFinal.away} ${latestFinal.awayScore ?? "—"}：${latestFinal.homeScore ?? "—"} ${latestFinal.home}`
        : "尚無最新賽果",
      desc: latestFinal
        ? [
          latestFinal.win ? `勝投 ${latestFinal.win}` : "",
          latestFinal.lose ? `敗投 ${latestFinal.lose}` : "",
          latestFinal.save ? `救援 ${latestFinal.save}` : "",
          latestFinal.mvp ? `MVP ${latestFinal.mvp}` : ""
        ].filter(Boolean).join("｜") || "比賽結束"
        : "等待 FINAL 資料更新。"
    },
    {
      tag: "NEXT",
      title: nextGame
        ? `下一場：${nextGame.away} vs ${nextGame.home}`
        : "目前沒有下一場賽程",
      desc: nextGame
        ? `${nextGame.date}｜${nextGame.venue || "球場待定"}｜${nextGame.time || "時間未定"}`
        : "等待賽程資料更新。"
    },
    {
      tag: "MATCH",
      title: latestGame
        ? `最新比賽資料：#${latestGame.gameSno} ${latestGame.away} vs ${latestGame.home}`
        : "比賽中心資料待更新",
      desc: latestGame
        ? `${latestGame.date}｜${latestGame.venue || "球場待定"}｜${getStatusText(latestGame.status)}`
        : "等待 live-boxscore.json 更新。"
    }
  ];

  box.innerHTML = `
    <div class="league-news-list">
      ${items.map(item => `
        <div class="league-news-item">
          <span>${escapeHtml(item.tag)}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <em>${escapeHtml(item.desc)}</em>
        </div>
      `).join("")}
    </div>
  `;
}

/* =========================
   球迷資料庫入口
========================= */

function renderFanDatabase() {
  const box = document.getElementById("fanDatabaseContent");

  if (!box) return;

  const links = [
    {
      title: "六隊球隊頁",
      desc: "查看球隊資訊、Logo 與隊伍資料。",
      href: "teams.html",
      icon: "🏟"
    },
    {
      title: "一軍賽程中心",
      desc: "用列表或月曆查看一軍全季賽程。",
      href: "schedule.html",
      icon: "🗓"
    },
    {
      title: "二軍賽程中心",
      desc: "查看二軍全年賽程、比賽狀態與二軍比賽中心。",
      href: "farm-schedule.html",
      icon: "🌱",
      farm: true
    },
    {
      title: "戰績排行榜",
      desc: "查看六隊排名、勝率與勝敗場。",
      href: "standings.html",
      icon: "🏆"
    },
    {
      title: "版本紀錄",
      desc: "查看網站更新、功能升級與資料狀態。",
      href: "version.html",
      icon: "🧩"
    }
  ];

  box.innerHTML = `
    <div class="fan-db-grid">
      ${links.map(link => `
        <a class="fan-db-link ${link.farm ? "is-farm" : ""}" href="${link.href}">
          <span>${link.icon}</span>
          <div>
            <strong>${escapeHtml(link.title)}</strong>
            <em>${escapeHtml(link.desc)}</em>
          </div>
        </a>
      `).join("")}
    </div>
  `;
}

/* =========================
   今日數據摘要
========================= */

function renderTodaySummary() {
  const box = document.getElementById("todaySummary");

  if (!box) return;

  const today = getToday();

  const todayGames = allGames.filter(g => g.date === today);
  const finals = todayGames.filter(g => g.status === "final");
  const live = todayGames.filter(g => g.status === "live");
  const scheduled = todayGames.filter(g => g.status === "scheduled");
  const postponed = todayGames.filter(g => g.status === "postponed");
  const suspended = todayGames.filter(g => g.status === "suspended");
  const cancelled = todayGames.filter(g => g.status === "cancelled");

  const scoredGames = todayGames.filter(g =>
    (g.status === "final" || g.status === "live") &&
    typeof g.awayScore === "number" &&
    typeof g.homeScore === "number"
  );

  const totalRuns = scoredGames.reduce(
    (sum, g) => sum + (g.awayScore || 0) + (g.homeScore || 0),
    0
  );

  const venues = [
    ...new Set(
      todayGames
        .map(g => g.venue)
        .filter(Boolean)
    )
  ];

  const nextGame = todayGames
    .filter(g => g.status === "scheduled")
    .sort(sortByTimeAndGameSno)[0];

  const liveGame = todayGames
    .filter(g => g.status === "live")
    .sort(sortByTimeAndGameSno)[0];

  const mainGame = liveGame || nextGame || todayGames[0];

  const specialCount =
    postponed.length +
    suspended.length +
    cancelled.length;

  box.innerHTML = `
    <div class="today-summary-pro">
      <div class="today-summary-main">
        <span>今日場次</span>
        <strong>${todayGames.length}</strong>
      </div>

      <div class="today-summary-grid">
        <div>
          <span>LIVE</span>
          <strong>${live.length}</strong>
        </div>

        <div>
          <span>未開賽</span>
          <strong>${scheduled.length}</strong>
        </div>

        <div>
          <span>已結束</span>
          <strong>${finals.length}</strong>
        </div>

        <div>
          <span>總得分</span>
          <strong>${totalRuns}</strong>
        </div>
      </div>

      <div class="today-summary-extra">
        <div>
          <span>今日球場</span>
          <strong>${venues.length ? escapeHtml(venues.join("、")) : "尚無球場資料"}</strong>
        </div>

        <div>
          <span>${liveGame ? "目前焦點" : "下一場"}</span>
          <strong>
            ${
              mainGame
                ? `${escapeHtml(mainGame.away)} vs ${escapeHtml(mainGame.home)}`
                : "今日暫無賽事"
            }
          </strong>
        </div>

        ${
          nextGame && !liveGame
            ? `
              <div class="today-pregame-ux">
                <span>賽前狀態</span>
                <strong>${escapeHtml(getPregameUxInfo(nextGame).starterStatus)}｜${escapeHtml(getPregameUxInfo(nextGame).lineupStatus)}</strong>
                <em>${escapeHtml(getPregameUxInfo(nextGame).countdown || `${nextGame.time || "時間待定"} 開打`)}</em>
              </div>
            `
            : ""
        }

        ${
          specialCount
            ? `
              <div>
                <span>特殊狀態</span>
                <strong>
                  延賽 ${postponed.length}｜保留 ${suspended.length}｜取消 ${cancelled.length}
                </strong>
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;
}

/* =========================
   系統狀態
========================= */

function renderSystemStatus() {
  const box = document.getElementById("systemStatus");

  if (!box) return;

  const total = allGames.length;
  const finals = allGames.filter(g => g.status === "final").length;
  const live = allGames.filter(g => g.status === "live").length;
  const scheduled = allGames.filter(g => g.status === "scheduled").length;

  const finalLocked = allGames.filter(g => g.raw?.finalLock?.locked).length;

  const withRhe = allGames.filter(g =>
    g.raw?.totals?.away?.H != null &&
    g.raw?.totals?.home?.H != null &&
    g.raw?.totals?.away?.E != null &&
    g.raw?.totals?.home?.E != null
  ).length;

  const withBatters = allGames.filter(g =>
    g.raw?.batters?.away?.length &&
    g.raw?.batters?.home?.length
  ).length;

  const withPitchers = allGames.filter(g =>
    g.raw?.pitchers?.away?.length &&
    g.raw?.pitchers?.home?.length
  ).length;

  const withLiveState = allGames.filter(g => g.raw?.liveState).length;

  const confirmedScore = allGames.filter(g => g.raw?.dataQuality?.score === "confirmed").length;
  const partialScore = allGames.filter(g => g.raw?.dataQuality?.score === "partial").length;

  const newsItems = leagueNewsData?.items?.length || 0;

  box.innerHTML = `
    <div class="home-live-status-grid">
      <div class="home-live-status-item live">
        <span>LIVE</span>
        <strong>${live}</strong>
      </div>
      <div class="home-live-status-item">
        <span>未開打</span>
        <strong>${scheduled}</strong>
      </div>
      <div class="home-live-status-item">
        <span>已結束</span>
        <strong>${finals}</strong>
      </div>
      <div class="home-live-status-item warn">
        <span>總場次</span>
        <strong>${total}</strong>
      </div>
    </div>

    <div>FINAL 鎖定：<strong>${finalLocked}</strong></div>
    <div>R/H/E 完成：<strong>${withRhe}</strong></div>
    <div>打者明細完成：<strong>${withBatters}</strong></div>
    <div>投手明細完成：<strong>${withPitchers}</strong></div>
    <div>即時戰況 liveState：<strong>${withLiveState}</strong></div>
    <div>比分品質 confirmed / partial：<strong>${confirmedScore}</strong> / <strong>${partialScore}</strong></div>
    <div>聯盟快訊 league-news：<strong>${newsItems}</strong></div>
    <div>二軍旁路入口：<strong>farm-schedule.html</strong></div>
    <div>首頁版本：<strong>${VERSION}</strong></div>
    <div>最後讀取：<strong>${formatClock(lastLoadedAt)}</strong></div>
    <div><a href="admin-live-debug.html" class="card-link">前往 LIVE Debug</a></div>
  `;
}

/* =========================
   顯示工具
========================= */

function renderGameStatus(g) {
  if (hasScore(g)) {
    return `${g.awayScore} : ${g.homeScore}`;
  }

  return getStatusText(g.status);
}

function getStatusText(status) {
  if (status === "final") return "✅ 已結束";
  if (status === "live") return "🔴 LIVE";
  if (status === "postponed") return "🌧 延賽";
  if (status === "suspended") return "⏸ 保留比賽";
  if (status === "cancelled") return "❌ 取消";

  return "⏳ 未開打";
}

function getTeamLogo(team) {
  const id = TEAM_ID_MAP[team];

  return id
    ? `assets/logo/${id}.png`
    : "assets/logo/cpbl.png";
}

function getTeamShortRecord(teamName) {
  const rawGames = allGames
    .map(g => g.raw)
    .filter(g =>
      g?.meta?.type === "regular" &&
      g?.meta?.status === "final" &&
      g?.meta?.home &&
      g?.meta?.away
    );

  if (!rawGames.length) return "—";

  try {
    const standings = calculateStandings(rawGames);
    const row = standings.find(t => t.team === teamName);

    if (!row) return "—";

    return `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`;
  } catch {
    return "—";
  }
}

function buildMatchLink(g) {
  if (g.gameSno != null) {
    return `match.html?gameSno=${encodeURIComponent(g.gameSno)}`;
  }

  return "#";
}

function sortByTimeAndGameSno(a, b) {
  const at = a.time || "99:99";
  const bt = b.time || "99:99";

  if (at !== bt) return at.localeCompare(bt);

  return Number(a.gameSno || 0) - Number(b.gameSno || 0);
}

function setText(id, val) {
  const el = document.getElementById(id);

  if (el) el.textContent = val;
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPregameInfo(g) {
  if (g.status !== "scheduled") return "";

  const info = getPregameUxInfo(g);

  if (!info.hasAnyStarter && !info.hasAnyLineup && !info.countdown) return "";

  return `
    <div class="pregame-mini pregame-mini-ux">
      ${
        info.hasAnyStarter
          ? `<div>🎯 先發：${escapeHtml(info.awayStarter || "—")} vs ${escapeHtml(info.homeStarter || "—")}</div>`
          : `<div>🎯 先發投手：等待官方公布</div>`
      }
      <div>📋 ${escapeHtml(info.lineupStatus)}</div>
      ${
        info.countdown
          ? `<div>⏱ ${escapeHtml(info.countdown)}</div>`
          : ""
      }
    </div>
  `;
}

function renderMiniQualityHint(g) {
  const text = getQualityBadgeText(g);

  if (!text) return "";

  return `
    <div class="pregame-mini muted">
      🧩 ${escapeHtml(text)}
    </div>
  `;
}

/* =========================
   首頁搜尋入口
========================= */

function bindHomeSearch() {
  const input = document.getElementById("homeSearchInput");
  const btn = document.getElementById("homeSearchBtn");

  if (!input || !btn) return;

  function goSearch() {
    const q = input.value.trim();

    if (!q) {
      input.focus();
      return;
    }

    location.href = `search.html?q=${encodeURIComponent(q)}`;
  }

  btn.addEventListener("click", goSearch);

  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      goSearch();
    }
  });
}