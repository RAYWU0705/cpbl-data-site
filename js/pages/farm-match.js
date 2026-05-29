console.log("✅ farm-match.js v5.5.2-FARM-GAME-COUNTDOWN-SYNC 已載入");

/* =========================================================
   Ray's CPBL Data Site
   Farm Match Center v5.5.2-FARM-GAME-COUNTDOWN-SYNC

   旁路二軍比賽中心：
   - 讀 data/farm/farm-schedule-2026.json
   - 再讀 data/farm/farm-boxscore-2026.json
   - 找到同場 boxscore 時，顯示 R/H/E、逐局、打者、投手、勝敗救
   - 找不到 boxscore 時，保留 schedule-only 模式
   - 不讀一軍 live-boxscore.json
   - 不顯示假資料
========================================================= */

const VERSION = "v5.5.2-FARM-GAME-COUNTDOWN-SYNC";
const FARM_SCHEDULE_URL = "data/farm/farm-schedule-2026.json";
const FARM_BOXSCORE_URL = "data/farm/farm-boxscore-2026.json";

const TEAM_ID_MAP = {
  "中信兄弟": "brothers",
  "中信兄弟二軍": "brothers",
  "統一7-ELEVEn獅": "lions",
  "統一7-ELEVEn獅二軍": "lions",
  "樂天桃猿": "monkeys",
  "樂天桃猿二軍": "monkeys",
  "味全龍": "dragons",
  "味全龍二軍": "dragons",
  "富邦悍將": "guardians",
  "富邦悍將二軍": "guardians",
  "台鋼雄鷹": "hawks",
  "台鋼雄鷹二軍": "hawks"
};

const TEAM_COLOR = {
  "中信兄弟二軍": "#FFD700",
  "統一7-ELEVEn獅二軍": "#FF6B00",
  "樂天桃猿二軍": "#7A0019",
  "味全龍二軍": "#C8102E",
  "富邦悍將二軍": "#0047AB",
  "台鋼雄鷹二軍": "#006666",
  "中信兄弟": "#FFD700",
  "統一7-ELEVEn獅": "#FF6B00",
  "樂天桃猿": "#7A0019",
  "味全龍": "#C8102E",
  "富邦悍將": "#0047AB",
  "台鋼雄鷹": "#006666"
};

const STATUS_TEXT = {
  scheduled: "⏳ 未開打",
  live: "🔴 LIVE",
  final: "✅ FINAL",
  postponed: "🌧 延賽",
  cancelled: "❌ 取消",
  suspended: "⏸ 保留比賽"
};

const MATCH_TAB_STATE = {
  batters: "away",
  pitchers: "away"
};

let farmGames = [];
let farmBoxscores = [];
let currentGame = null;
let currentBoxscore = null;
let FARM_GAME_COUNTDOWN_TIMER = null;

document.addEventListener("DOMContentLoaded", initFarmMatch);

async function initFarmMatch() {
  try {
    showLoading();
    bindRefreshButton();

    const loaded = await Promise.all([
      loadFarmSchedule(),
      loadFarmBoxscores()
    ]);

    farmGames = loaded[0];
    farmBoxscores = loaded[1];

    currentGame = resolveCurrentGame(farmGames);

    if (!currentGame) {
      showError("❌ 找不到指定的二軍場次。請確認網址參數 gameSno/date/home/away 是否正確。");
      return;
    }

    currentBoxscore = findBoxscoreForGame(currentGame, farmBoxscores);
    currentGame = mergeGameWithBoxscore(currentGame, currentBoxscore);

    renderAll(currentGame, currentBoxscore);
  } catch (err) {
    console.error("❌ 二軍比賽中心初始化失敗：", err);
    showError(`❌ 二軍比賽中心初始化失敗：${err.message}`);
  }
}

async function loadFarmSchedule() {
  const res = await fetch(`${FARM_SCHEDULE_URL}?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`無法讀取 ${FARM_SCHEDULE_URL}：HTTP ${res.status}`);
  }

  const data = await res.json();

  return toArray(data)
    .map(normalizeFarmGame)
    .filter(Boolean)
    .sort(sortGames);
}

async function loadFarmBoxscores() {
  try {
    const res = await fetch(`${FARM_BOXSCORE_URL}?ts=${Date.now()}`, {
      cache: "no-store"
    });

    if (!res.ok) {
      console.warn(`⚠️ 無法讀取 ${FARM_BOXSCORE_URL}：HTTP ${res.status}，改用 schedule-only 模式`);
      return [];
    }

    const data = await res.json();

    return toArray(data)
      .map(normalizeFarmBoxscore)
      .filter(Boolean)
      .sort(sortGames);
  } catch (err) {
    console.warn("⚠️ 二軍 boxscore 尚未可用，改用 schedule-only 模式：", err);
    return [];
  }
}

function resolveCurrentGame(games) {
  const params = new URLSearchParams(location.search);

  const gameSno = cleanText(params.get("gameSno"));
  const date = cleanText(params.get("date"));
  const home = cleanText(params.get("home"));
  const away = cleanText(params.get("away"));

  if (gameSno && date) {
    const found = games.find(g => String(g.gameSno) === gameSno && g.date === date);
    if (found) return found;
  }

  if (date && home && away) {
    const found = games.find(g =>
      g.date === date &&
      sameTeam(g.home, home) &&
      sameTeam(g.away, away)
    );

    if (found) return found;
  }

  if (gameSno) {
    const sameNo = games.filter(g => String(g.gameSno) === gameSno);

    if (sameNo.length === 1) return sameNo[0];

    if (sameNo.length > 1) {
      return sameNo.sort(sortGames)[sameNo.length - 1];
    }
  }

  const today = getToday();
  const todayGames = games.filter(g => g.date === today);

  if (todayGames.length) {
    return todayGames.find(g => g.status === "live") || todayGames[0];
  }

  return games.find(g => g.status === "live") ||
    findNearestGame(games) ||
    games[0] ||
    null;
}

function findBoxscoreForGame(game, boxscores) {
  if (!game || !boxscores.length) return null;

  const exact = boxscores.find(box =>
    String(box.gameSno) === String(game.gameSno) &&
    box.date === game.date
  );

  if (exact) return exact;

  return boxscores.find(box =>
    String(box.gameSno) === String(game.gameSno) &&
    sameTeam(box.away, game.away) &&
    sameTeam(box.home, game.home)
  ) || null;
}

function mergeGameWithBoxscore(game, boxscore) {
  if (!boxscore) return game;

  const awayR = boxscore.totals?.away?.R;
  const homeR = boxscore.totals?.home?.R;

  return {
    ...game,
    boxscore,
    boxscoreStatus: boxscore.parseStatus || "unknown",
    awayScore: Number.isFinite(Number(awayR)) ? Number(awayR) : game.awayScore,
    homeScore: Number.isFinite(Number(homeR)) ? Number(homeR) : game.homeScore
  };
}

function renderAll(game, boxscore = null) {
  currentGame = game;
  currentBoxscore = boxscore || game.boxscore || null;

  renderBasic(game, currentBoxscore);
  renderGameCountdown(game);
  renderScore(game);
  renderStarterDuel(game, currentBoxscore);
  renderPregameUX(game);
  renderMatchProgress(game, currentBoxscore);
  renderDataQuality(game, currentBoxscore);
  renderLiveStatus(game, currentBoxscore);
  renderTotals(game, currentBoxscore);
  renderInnings(game, currentBoxscore);
  renderDecisions(game, currentBoxscore);
  renderPlayByPlay(game, currentBoxscore);
  updateTeamSwitchLabels(game);
  renderBatters(game, currentBoxscore);
  renderPitchers(game, currentBoxscore);
  renderRaw(game, currentBoxscore);
  bindStatTabs();
  bindOfficialButton(game);
}

function renderBasic(game, boxscore = null) {
  const away = game.away || "客隊";
  const home = game.home || "主隊";

  document.title = `${away} vs ${home}｜二軍比賽中心`;

  setText("matchHeaderSub", `${game.date || "日期待補"}｜${away} VS ${home}｜二軍例行賽`);
  setText("matchDate", `📅 ${game.date || "日期待補"}`);
  setText("matchVenue", `🏟 ${game.venue || "球場待定"}`);

  if (game.status === "live") {
    setText("matchTime", "🔴 比賽進行中");
  } else if (game.status === "final") {
    setText("matchTime", `✅ ${formatDuration(game.raw?.GameDuringTime || boxscore?.meta?.gameDuringTime) || "比賽結束"}`);
  } else {
    setText("matchTime", `⏰ ${game.time || "時間未定"}`);
  }

  setText("matchType", "🏷 二軍例行賽");
  setText(
    "gameIdDisplay",
    `Farm GameSno：${game.gameSno || "—"}｜資料來源：${boxscore ? "schedule + farm-boxscore" : "schedule-only"}`
  );

  setText("homeTeam", home);
  setText("awayTeam", away);

  setLogo("homeLogo", home);
  setLogo("awayLogo", away);

  setText("matchStatus", getStatusText(game.status));

  renderBoxscoreBadge(boxscore);
  applyMatchTheme(home, away);
}

function renderBoxscoreBadge(boxscore) {
  const el = document.getElementById("farmBoxscoreBadge");
  if (!el) return;

  el.classList.remove("is-confirmed", "is-partial", "is-missing");

  if (!boxscore) {
    el.textContent = "Boxscore：尚未建立，使用 schedule-only 模式";
    el.classList.add("is-missing");
    return;
  }

  const status = boxscore.parseStatus || "unknown";
  const source = boxscore.crawler?.version || boxscore.source || "farm-boxscore";

  el.textContent = `Boxscore：${status}｜${source}`;
  el.classList.add(status === "confirmed" ? "is-confirmed" : "is-partial");
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

function renderScore(game) {
  if (game.status === "final" || game.status === "live") {
    setText("awayScore", formatScore(game.awayScore));
    setText("homeScore", formatScore(game.homeScore));
    markWinner(game);
    return;
  }

  setText("awayScore", "—");
  setText("homeScore", "—");
}

function markWinner(game) {
  const homeEl = document.getElementById("homeScore");
  const awayEl = document.getElementById("awayScore");

  if (!homeEl || !awayEl) return;

  homeEl.classList.remove("winner", "loser");
  awayEl.classList.remove("winner", "loser");

  const h = Number(game.homeScore);
  const a = Number(game.awayScore);

  if (!Number.isFinite(h) || !Number.isFinite(a)) return;

  if (h > a) {
    homeEl.classList.add("winner");
    awayEl.classList.add("loser");
  } else if (a > h) {
    awayEl.classList.add("winner");
    homeEl.classList.add("loser");
  }
}

function renderStarterDuel(game, boxscore = null) {
  const box = document.getElementById("starterDuelCard");
  if (!box) return;

  const awayLogo = getTeamLogo(game.away);
  const homeLogo = getTeamLogo(game.home);
  const awayStarter = cleanText(game.raw?.VisitingPitcherName);
  const homeStarter = cleanText(game.raw?.HomePitcherName);

  if (game.status === "final") {
    const decision = boxscore?.decision || {};
    const win = decision.win || game.raw?.WinningPitcherName || "—";
    const lose = decision.lose || game.raw?.LoserPitcherName || "—";
    const save = decision.save || game.raw?.CloserName || "—";

    box.innerHTML = `
      <div class="starter-duel-head">
        <div>
          <span class="starter-kicker">FARM PITCHING RESULT</span>
          <h2>🏆 本場投手摘要</h2>
        </div>
        <div class="starter-status">${boxscore ? "BOXSCORE" : "FINAL"}</div>
      </div>

      <div class="starter-duel-main final-mode">
        <div class="starter-team winner-side">
          <img src="${getTeamLogo(getWinnerTeam(game) || game.away)}" alt="">
          <span>勝投</span>
          <strong>${escapeHtml(win)}</strong>
          <em>${escapeHtml(getWinnerTeam(game) || "勝方待判斷")}</em>
        </div>

        <div class="starter-vs">
          <span>${escapeHtml(save && save !== "—" ? `救援 ${save}` : "投手")}</span>
        </div>

        <div class="starter-team loser-side">
          <img src="${getTeamLogo(getLoserTeam(game) || game.home)}" alt="">
          <span>敗投</span>
          <strong>${escapeHtml(lose)}</strong>
          <em>${escapeHtml(getLoserTeam(game) || "敗方待判斷")}</em>
        </div>
      </div>

      <p class="starter-note">
        ${boxscore
          ? "本場投手摘要來自二軍 farm-boxscore 旁路資料。"
          : "二軍目前顯示 schedule raw 提供的勝敗投；完整投手表待二軍 boxscore 旁路資料建立後補上。"}
      </p>
    `;
    return;
  }

  box.innerHTML = `
    <div class="starter-duel-head">
      <div>
        <span class="starter-kicker">FARM STARTING PITCHERS</span>
        <h2>🎯 先發投手對決</h2>
      </div>
      <div class="starter-status">${escapeHtml(getStatusText(game.status))}</div>
    </div>

    <div class="starter-duel-main">
      <div class="starter-team away">
        <img src="${awayLogo}" alt="${escapeHtml(game.away)}">
        <span>${escapeHtml(game.away || "客隊")}</span>
        <strong>${escapeHtml(awayStarter || "尚未公布")}</strong>
      </div>

      <div class="starter-vs">
        <span>VS</span>
      </div>

      <div class="starter-team home">
        <img src="${homeLogo}" alt="${escapeHtml(game.home)}">
        <span>${escapeHtml(game.home || "主隊")}</span>
        <strong>${escapeHtml(homeStarter || "尚未公布")}</strong>
      </div>
    </div>

    <p class="starter-note">
      二軍第一版僅讀 schedule raw；若官方未提供先發投手，這裡會保持「尚未公布」。
    </p>
  `;
}

function renderPregameUX(game) {
  const box = document.getElementById("pregameUxCard");
  if (!box) return;

  const isPregame = game.status === "scheduled";

  if (!isPregame) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  box.hidden = false;
  box.innerHTML = `
    <div class="pregame-ux-head">
      <div>
        <span class="pregame-ux-kicker">FARM PREGAME CENTER</span>
        <h2>賽前資料狀態</h2>
      </div>
      <div class="pregame-countdown" id="farmPregameCountdownMini">開賽倒數 --:--:--</div>
    </div>

    <div class="pregame-ux-grid">
      <div class="pregame-ux-item is-ok">
        <span>二軍賽程</span>
        <strong>已載入</strong>
        <p>${escapeHtml(game.date || "日期待補")}｜${escapeHtml(game.time || "時間未定")}｜${escapeHtml(game.venue || "球場待定")}</p>
      </div>

      <div class="pregame-ux-item ${game.raw?.VisitingPitcherName || game.raw?.HomePitcherName ? "is-ok" : "is-waiting"}">
        <span>先發投手</span>
        <strong>${game.raw?.VisitingPitcherName || game.raw?.HomePitcherName ? "已同步" : "尚未同步"}</strong>
        <p>${escapeHtml(game.raw?.VisitingPitcherName || "—")} vs ${escapeHtml(game.raw?.HomePitcherName || "—")}</p>
      </div>

      <div class="pregame-ux-item is-waiting">
        <span>LIVE 明細</span>
        <strong>尚未建立</strong>
        <p>二軍 LIVE boxscore 之後建議另開 farm-live-boxscore.json。</p>
      </div>

      <div class="pregame-ux-item is-safe">
        <span>主流程安全</span>
        <strong>旁路讀取</strong>
        <p>不讀一軍 live-boxscore.json，不污染一軍比賽中心。</p>
      </div>
    </div>

    <p class="pregame-ux-note">
      二軍賽前階段不補假打序、不補假逐局；只顯示官方 schedule 目前提供的欄位。
    </p>
  `;
}


function renderGameCountdown(game) {
  const panel = document.getElementById("gameCountdownPanel");
  const clock = document.getElementById("gameCountdownClock");
  const label = panel?.querySelector(".game-countdown-label");
  const mini = document.getElementById("farmPregameCountdownMini");

  if (!panel || !clock) return;

  if (FARM_GAME_COUNTDOWN_TIMER) {
    clearInterval(FARM_GAME_COUNTDOWN_TIMER);
    FARM_GAME_COUNTDOWN_TIMER = null;
  }

  const status = game?.status || "scheduled";
  const start = parseGameStartDate(game?.date, game?.time);

  panel.classList.remove("is-soon", "is-started", "is-final");

  if (!start) {
    panel.hidden = true;
    if (mini) mini.textContent = "開賽時間待確認";
    return;
  }

  if (status === "final") {
    panel.hidden = false;
    panel.classList.add("is-final");
    if (label) label.textContent = "比賽狀態";
    clock.textContent = "FINAL";
    if (mini) mini.textContent = "比賽已結束";
    return;
  }

  if (["postponed", "cancelled", "suspended"].includes(status)) {
    panel.hidden = false;
    if (label) label.textContent = "比賽狀態";
    clock.textContent = getStatusText(status).replace(/[^\u4e00-\u9fa5A-Z]/g, "") || getStatusText(status);
    if (mini) mini.textContent = getStatusText(status);
    return;
  }

  panel.hidden = false;
  if (label) label.textContent = "開賽倒數";

  const tick = () => {
    const diffMs = start.getTime() - Date.now();
    panel.classList.remove("is-soon", "is-started");

    if (diffMs > 0) {
      const text = formatCountdownClock(diffMs);
      clock.textContent = text;

      if (mini) {
        mini.textContent = `開賽倒數 ${text}`;
        mini.classList.toggle("soon", diffMs <= 60 * 60 * 1000);
        mini.classList.toggle("normal", diffMs > 60 * 60 * 1000);
      }

      if (diffMs <= 60 * 60 * 1000) {
        panel.classList.add("is-soon");
      }

      return;
    }

    if (status === "live") {
      panel.classList.add("is-started");
      if (label) label.textContent = "比賽狀態";
      clock.textContent = "LIVE";
      if (mini) mini.textContent = "比賽進行中";
      return;
    }

    panel.classList.add("is-started");
    if (label) label.textContent = "比賽狀態";
    clock.textContent = "即將開賽";
    if (mini) mini.textContent = "已到開賽時間，等待 LIVE 同步";
  };

  tick();
  FARM_GAME_COUNTDOWN_TIMER = setInterval(tick, 1000);
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


function renderMatchProgress(game, boxscore = null) {
  const status = game.status || "scheduled";
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

    if (currentStep === "live" && index === 0) line.classList.add("is-done");
    if (currentStep === "final") line.classList.add("is-done");
  });

  setText("progressCurrentStatus", getProgressStatusLabel(status, boxscore));
  setText("matchProgressNote", getProgressNote(game, boxscore));
}

function getProgressStep(status) {
  if (status === "live") return "live";
  if (status === "final") return "final";
  return "pregame";
}

function isProgressDone(stepName, currentStep) {
  const order = { pregame: 1, live: 2, final: 3 };
  return order[stepName] < order[currentStep];
}

function getProgressStatusLabel(status, boxscore = null) {
  if (status === "live") return "目前階段：LIVE 狀態";
  if (status === "final" && boxscore) return "目前階段：賽後 Boxscore";
  if (status === "final") return "目前階段：賽後摘要";
  if (status === "postponed") return "目前階段：延賽";
  if (status === "suspended") return "目前階段：保留比賽";
  if (status === "cancelled") return "目前階段：取消";
  return "目前階段：賽前資訊";
}

function getProgressNote(game, boxscore = null) {
  if (game.status === "live") return "二軍比賽進行中；目前依 IsPlayBall 與 schedule raw 顯示比分與狀態。";
  if (game.status === "final" && boxscore) return "二軍 FINAL boxscore 已載入：逐局、R/H/E、打者、投手與勝敗救改由 farm-boxscore 旁路提供。";
  if (game.status === "final") return "二軍比賽已結束；目前顯示比分、勝敗救與比賽時間摘要。";
  if (game.status === "postponed") return "此場二軍比賽已延賽，等待官方公告補賽資訊。";
  if (game.status === "cancelled") return "此場二軍比賽已取消。";
  if (game.status === "suspended") return "此場二軍比賽為保留比賽。";
  return `二軍賽前資訊已載入：${game.venue || "球場待定"}｜${game.time || "時間未定"}。`;
}

function renderDataQuality(game, boxscore = null) {
  const box = document.getElementById("matchDataQuality");
  if (!box) return;

  const level = boxscore?.parseStatus === "confirmed"
    ? "good"
    : game.status === "live"
      ? "partial"
      : "good";

  const message = boxscore
    ? `二軍 boxscore 已載入：${boxscore.parseStatus || "unknown"}。R/H/E、逐局、打者與投手成績由 farm-boxscore 旁路提供。`
    : game.status === "live"
      ? "二軍比賽進行中，目前只讀 schedule raw；尚未建立二軍 LIVE boxscore 明細。"
      : game.status === "final"
        ? "二軍比賽已結束，但此場尚未建立 farm-boxscore；目前顯示 schedule raw 摘要。"
        : "二軍賽程資料已讀取，目前為賽前或特殊狀態。";

  const chips = [
    { label: getStatusText(game.status), tone: game.status },
    { label: "旁路 farm schedule", tone: "manual" },
    { label: boxscore ? "farm-boxscore loaded" : "boxscore missing", tone: boxscore ? "good" : "warn" },
    { label: "不讀一軍 live-boxscore", tone: "good" }
  ];

  box.innerHTML = `
    <div class="dq-panel dq-${escapeHtml(level)}">
      <div class="dq-main">
        <div>
          <div class="dq-kicker">FARM DATA QUALITY</div>
          <strong>${escapeHtml(boxscore ? "二軍 Boxscore 已整合" : "二軍資料狀態穩定")}</strong>
          <p>${escapeHtml(message)}</p>
        </div>

        <div class="dq-badge">${escapeHtml(boxscore?.parseStatus?.toUpperCase?.() || level.toUpperCase())}</div>
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
          <span>賽程來源</span>
          <strong>data/farm/farm-schedule-2026.json</strong>
        </div>
        <div>
          <span>Boxscore 來源</span>
          <strong>${boxscore ? "data/farm/farm-boxscore-2026.json" : "尚未建立"}</strong>
        </div>
        <div>
          <span>比賽狀態</span>
          <strong>${escapeHtml(getStatusText(game.status))}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderLiveStatus(game, boxscore = null) {
  const away = game.away || "客隊";
  const home = game.home || "主隊";

  setText("liveStatusBadge", getLiveBadgeText(game.status));
  setText("liveInningText", game.status === "live" ? "比賽中" : getStatusText(game.status));

  setText(
    "liveScoreLine",
    `${away} ${formatScoreForStatus(game, "away")}：${formatScoreForStatus(game, "home")} ${home}`
  );

  setText("liveBattingTeam", "—");
  setText("liveFieldingTeam", "—");
  setText("liveBatter", "—");
  setText("livePitcher", getFeaturedPitcher(game, boxscore));
  setText("liveRHE", boxscore ? `RHE ${formatRheText(boxscore)}` : "schedule raw");

  setText("liveBSO", "B —｜S —｜O —");
  setBaseState("baseFirst", false);
  setBaseState("baseSecond", false);
  setBaseState("baseThird", false);
  setText("liveBasesText", "壘包：—");

  setText("liveLastUpdate", `最後更新：${formatClock(new Date())}`);

  const hint = document.getElementById("liveStatusHint");
  if (hint) {
    hint.textContent = boxscore
      ? "此場已載入二軍 FINAL boxscore；LIVE 逐球、壘包與 B/S/O 仍不顯示假資料。"
      : game.status === "live"
        ? "二軍目前只依 schedule raw 顯示 LIVE 狀態；尚無逐球、打者、壘包與 B/S/O 明細。"
        : "非 LIVE 狀態時，此面板顯示二軍賽程摘要。";
  }

  const panel = document.getElementById("liveStatusPanel");
  if (panel) {
    panel.classList.toggle("is-live", game.status === "live");
    panel.classList.toggle("is-final", game.status === "final");
    panel.classList.toggle("has-boxscore", !!boxscore);
  }
}

function renderTotals(game, boxscore = null) {
  setText("awayTeamRHE", game.away || "客隊");
  setText("homeTeamRHE", game.home || "主隊");

  if (boxscore?.totals) {
    setText("awayR", formatScore(boxscore.totals.away?.R));
    setText("homeR", formatScore(boxscore.totals.home?.R));
    setText("awayH", formatScore(boxscore.totals.away?.H));
    setText("homeH", formatScore(boxscore.totals.home?.H));
    setText("awayE", formatScore(boxscore.totals.away?.E));
    setText("homeE", formatScore(boxscore.totals.home?.E));
    setText("rheHint", "R/H/E 來自 data/farm/farm-boxscore-2026.json。");
    return;
  }

  setText("awayR", formatScoreForStatus(game, "away"));
  setText("homeR", formatScoreForStatus(game, "home"));
  setText("awayH", "—");
  setText("homeH", "—");
  setText("awayE", "—");
  setText("homeE", "—");

  setText(
    "rheHint",
    "此場尚未建立二軍 boxscore；目前 schedule raw 只提供 R。"
  );
}

function renderInnings(game, boxscore = null) {
  const innings = boxscore?.lineScore?.innings || [];

  renderInningsHeader(innings.length ? innings : ["1","2","3","4","5","6","7","8","9"]);

  if (boxscore?.lineScore?.away?.length || boxscore?.lineScore?.home?.length) {
    fillRow("awayInningsRow", game.away || "客隊", boxscore.lineScore.away || [], innings);
    fillRow("homeInningsRow", game.home || "主隊", boxscore.lineScore.home || [], innings);

    setText(
      "inningsHint",
      "逐局比分來自 data/farm/farm-boxscore-2026.json。"
    );
    return;
  }

  fillRow("awayInningsRow", game.away || "客隊", [], innings);
  fillRow("homeInningsRow", game.home || "主隊", [], innings);

  setText(
    "inningsHint",
    "此場尚未建立二軍 boxscore；不補假逐局比分。"
  );
}

function renderInningsHeader(innings = []) {
  const row = document.getElementById("inningsHeaderRow");
  if (!row) return;

  row.innerHTML = "<th>隊伍</th>";

  innings.forEach(inning => {
    const th = document.createElement("th");
    th.textContent = inning;
    row.appendChild(th);
  });
}

function fillRow(id, team, values = [], innings = []) {
  const row = document.getElementById(id);
  if (!row) return;

  row.innerHTML = "";

  const name = document.createElement("td");
  name.textContent = team;
  row.appendChild(name);

  const count = Math.max(innings.length, 9);

  for (let i = 0; i < count; i++) {
    const td = document.createElement("td");
    td.textContent = values[i] ?? "—";
    row.appendChild(td);
  }
}

function renderDecisions(game, boxscore = null) {
  const decision = boxscore?.decision || {};

  setText("winPitcher", decision.win || game.raw?.WinningPitcherName || "—");
  setText("lossPitcher", decision.lose || game.raw?.LoserPitcherName || "—");
  setText("savePitcher", decision.save || game.raw?.CloserName || "—");
  setText("mvpPlayer", decision.mvp || game.raw?.MvpName || boxscore?.meta?.mvpAcnt || "—");
}

function renderPlayByPlay(game, boxscore = null) {
  const container = document.getElementById("playByPlayContainer");
  if (!container) return;

  const plays = collectBattlePlays(boxscore);

  if (plays.length) {
    container.innerHTML = `
      <div class="farm-play-note">
        目前顯示由二軍 boxscore 戰況資料整理出的打席結果摘要，非 LIVE 逐球。
      </div>
      <div class="farm-play-list">
        ${plays.slice(0, 80).map(play => `
          <div class="farm-play-item">
            <span>${escapeHtml(play.inningText)}</span>
            <strong>${escapeHtml(play.player)}</strong>
            <em>${escapeHtml(play.result)}</em>
          </div>
        `).join("")}
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="play-loading">
      尚無二軍官方逐球事件資料。<br>
      <span>目前只顯示二軍 schedule / final boxscore 摘要，不使用假逐球事件。</span>
    </div>
  `;
}

function collectBattlePlays(boxscore) {
  if (!boxscore?.batters) return [];

  const result = [];

  ["away", "home"].forEach(side => {
    const players = boxscore.batters[side] || [];

    players.forEach(player => {
      (player.plays || []).forEach(play => {
        result.push({
          side,
          inning: play.inning || 0,
          round: play.round || 0,
          inningText: `${play.inning || "?"}局${side === "away" ? "上" : "下"}`,
          player: player.name || "—",
          result: play.result || "—"
        });
      });
    });
  });

  return result.sort((a, b) => a.inning - b.inning || a.round - b.round);
}

function updateTeamSwitchLabels(game) {
  updateSwitchGroup("batterTeamSwitch", game.away || "客隊", game.home || "主隊");
  updateSwitchGroup("pitcherTeamSwitch", game.away || "客隊", game.home || "主隊");
}

function updateSwitchGroup(groupId, away, home) {
  const group = document.getElementById(groupId);
  if (!group) return;

  const awayBtn = group.querySelector('[data-team-side="away"]');
  const homeBtn = group.querySelector('[data-team-side="home"]');

  if (awayBtn) awayBtn.textContent = away;
  if (homeBtn) homeBtn.textContent = home;
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

      if (!currentGame) return;

      if (target === "batters") renderBatters(currentGame, currentBoxscore);
      if (target === "pitchers") renderPitchers(currentGame, currentBoxscore);
    });
  });

  updateActiveTabs("batters");
  updateActiveTabs("pitchers");
}

function updateActiveTabs(target) {
  document
    .querySelectorAll(`.team-tab[data-target="${target}"]`)
    .forEach(btn => {
      btn.classList.toggle("active", btn.dataset.teamSide === MATCH_TAB_STATE[target]);
    });
}

function renderBatters(game, boxscore = null) {
  const box = document.getElementById("battersTable");
  if (!box) return;

  const side = MATCH_TAB_STATE.batters || "away";
  const team = side === "home" ? game.home : game.away;
  const players = boxscore?.batters?.[side] || [];

  if (!players.length) {
    box.innerHTML = `
      <div class="batter-team-title">${escapeHtml(team || "球隊")}</div>
      <div class="empty-box">
        此場尚未建立${escapeHtml(team || "該隊")}打者成績資料。<br>
        不讀一軍 live-boxscore.json，也不顯示假打者表。
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="batter-team-title">${escapeHtml(team || "球隊")}｜打者 ${players.length} 人</div>
    <div class="farm-table-wrap">
      <table class="farm-stat-table batter-stat-table">
        <thead>
          <tr>
            <th>棒次</th>
            <th>球員</th>
            <th>守位</th>
            <th>AB</th>
            <th>R</th>
            <th>H</th>
            <th>RBI</th>
            <th>2B</th>
            <th>3B</th>
            <th>HR</th>
            <th>BB</th>
            <th>SO</th>
            <th>SB</th>
            <th>AVG</th>
          </tr>
        </thead>
        <tbody>
          ${players.map(player => `
            <tr>
              <td>${escapeHtml(formatStat(player.order))}</td>
              <td class="player-name">${escapeHtml(player.name || "—")}${player.isMvp ? " ⭐" : ""}${player.gameWinningRbi ? " 🔥" : ""}</td>
              <td>${escapeHtml(player.position || "—")}</td>
              <td>${escapeHtml(formatStat(player.AB))}</td>
              <td>${escapeHtml(formatStat(player.R))}</td>
              <td>${escapeHtml(formatStat(player.H))}</td>
              <td>${escapeHtml(formatStat(player.RBI))}</td>
              <td>${escapeHtml(formatStat(player["2B"]))}</td>
              <td>${escapeHtml(formatStat(player["3B"]))}</td>
              <td>${escapeHtml(formatStat(player.HR))}</td>
              <td>${escapeHtml(formatStat(player.BB))}</td>
              <td>${escapeHtml(formatStat(player.SO))}</td>
              <td>${escapeHtml(formatStat(player.SB))}</td>
              <td>${escapeHtml(formatStat(player.AVG))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <p class="muted farm-stat-note">打者成績來自 data/farm/farm-boxscore-2026.json。</p>
  `;
}

function renderPitchers(game, boxscore = null) {
  const box = document.getElementById("pitchersTable");
  if (!box) return;

  const side = MATCH_TAB_STATE.pitchers || "away";
  const team = side === "home" ? game.home : game.away;
  const players = boxscore?.pitchers?.[side] || [];
  const starter = side === "home"
    ? game.raw?.HomePitcherName
    : game.raw?.VisitingPitcherName;

  if (!players.length) {
    box.innerHTML = `
      <div class="pitcher-team-title">${escapeHtml(team || "球隊")}</div>
      <div class="starter-box">
        🎯 先發投手：${escapeHtml(starter || "尚未公布")}
      </div>
      <p class="muted">
        此場尚未建立${escapeHtml(team || "該隊")}投手成績資料；目前只顯示 schedule raw 的先發 / 勝敗救摘要。
      </p>
    `;
    return;
  }

  box.innerHTML = `
    <div class="pitcher-team-title">${escapeHtml(team || "球隊")}｜投手 ${players.length} 人</div>
    <div class="farm-table-wrap">
      <table class="farm-stat-table pitcher-stat-table">
        <thead>
          <tr>
            <th>順序</th>
            <th>投手</th>
            <th>結果</th>
            <th>IP</th>
            <th>BF</th>
            <th>NP</th>
            <th>H</th>
            <th>HR</th>
            <th>BB</th>
            <th>SO</th>
            <th>R</th>
            <th>ER</th>
            <th>WHIP</th>
          </tr>
        </thead>
        <tbody>
          ${players.map(player => `
            <tr>
              <td>${escapeHtml(formatStat(player.order))}</td>
              <td class="player-name">${escapeHtml(player.name || "—")}${player.isMvp ? " ⭐" : ""}</td>
              <td>${escapeHtml(player.decision?.text || player.decision?.type || "—")}</td>
              <td>${escapeHtml(formatStat(player.IP))}</td>
              <td>${escapeHtml(formatStat(player.BF))}</td>
              <td>${escapeHtml(formatStat(player.NP))}</td>
              <td>${escapeHtml(formatStat(player.H))}</td>
              <td>${escapeHtml(formatStat(player.HR))}</td>
              <td>${escapeHtml(formatStat(player.BB))}</td>
              <td>${escapeHtml(formatStat(player.SO))}</td>
              <td>${escapeHtml(formatStat(player.R))}</td>
              <td>${escapeHtml(formatStat(player.ER))}</td>
              <td>${escapeHtml(formatStat(player.WHIP))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <p class="muted farm-stat-note">投手成績來自 data/farm/farm-boxscore-2026.json。</p>
  `;
}

function renderRaw(game, boxscore = null) {
  const pre = document.getElementById("farmRawData");
  if (!pre) return;

  const summary = {
    version: VERSION,
    gameSno: game.gameSno,
    date: game.date,
    away: game.away,
    home: game.home,
    venue: game.venue,
    status: game.status,
    boxscoreStatus: boxscore?.parseStatus || "missing",
    score: {
      away: game.awayScore,
      home: game.homeScore
    },
    scheduleRaw: {
      PresentStatus: game.raw?.PresentStatus,
      IsPlayBall: game.raw?.IsPlayBall,
      GameDateTimeS: game.raw?.GameDateTimeS,
      GameDateTimeE: game.raw?.GameDateTimeE,
      GameDuringTime: game.raw?.GameDuringTime,
      GameResult: game.raw?.GameResult,
      VisitingPitcherName: game.raw?.VisitingPitcherName,
      HomePitcherName: game.raw?.HomePitcherName,
      WinningPitcherName: game.raw?.WinningPitcherName,
      LoserPitcherName: game.raw?.LoserPitcherName,
      CloserName: game.raw?.CloserName
    },
    boxscoreSummary: boxscore ? {
      totals: boxscore.totals,
      lineScoreLength: {
        away: boxscore.lineScore?.away?.length || 0,
        home: boxscore.lineScore?.home?.length || 0
      },
      batters: {
        away: boxscore.batters?.away?.length || 0,
        home: boxscore.batters?.home?.length || 0
      },
      pitchers: {
        away: boxscore.pitchers?.away?.length || 0,
        home: boxscore.pitchers?.home?.length || 0
      },
      decision: boxscore.decision,
      source: boxscore.crawler?.version || boxscore.source || "farm-boxscore"
    } : null
  };

  pre.textContent = JSON.stringify(summary, null, 2);
}

function bindOfficialButton(game) {
  const btn = document.getElementById("btnOfficial");
  if (!btn) return;

  btn.onclick = () => {
    const url = game.officialUrl ||
      `https://www.cpbl.com.tw/box/index?gameSno=${encodeURIComponent(game.gameSno || "")}&kindCode=D&year=2026`;

    window.open(url, "_blank");
  };
}

function bindRefreshButton() {
  const btn = document.getElementById("btnRefreshMatch");
  if (!btn || btn.dataset.bound === "1") return;

  btn.dataset.bound = "1";

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "刷新中…";

    try {
      const loaded = await Promise.all([
        loadFarmSchedule(),
        loadFarmBoxscores()
      ]);

      farmGames = loaded[0];
      farmBoxscores = loaded[1];

      const fresh = resolveCurrentGame(farmGames);

      if (fresh) {
        const freshBoxscore = findBoxscoreForGame(fresh, farmBoxscores);
        renderAll(mergeGameWithBoxscore(fresh, freshBoxscore), freshBoxscore);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "刷新資料";
    }
  };
}

function normalizeFarmGame(rawGame) {
  if (!rawGame || typeof rawGame !== "object") return null;

  const raw = rawGame.raw || rawGame;

  const away = cleanText(rawGame.away || raw.VisitingTeamName || raw.away || "");
  const home = cleanText(rawGame.home || raw.HomeTeamName || raw.home || "");

  return {
    ...rawGame,
    raw,
    gameSno: cleanText(rawGame.gameSno || raw.GameSno || ""),
    officialGameSno: rawGame.officialGameSno ?? raw.GameSno ?? null,
    kindCode: cleanText(rawGame.kindCode || raw.KindCode || "D"),
    date: cleanText(rawGame.date || normalizeDate(raw.GameDate || raw.PreExeDate || "")),
    time: cleanText(rawGame.time || normalizeTime(raw.PreExeDate || raw.GameDateTimeS || "")),
    away,
    home,
    venue: cleanText(rawGame.venue || raw.FieldAbbe || raw.FieldName || ""),
    status: cleanText(rawGame.status || normalizeStatus(raw)),
    awayScore: toNumberOrNull(rawGame.awayScore ?? raw.VisitingScore),
    homeScore: toNumberOrNull(rawGame.homeScore ?? raw.HomeScore),
    officialUrl: cleanText(
      rawGame.officialUrl ||
      (raw.GameSno ? `https://www.cpbl.com.tw/box/index?gameSno=${raw.GameSno}&kindCode=D&year=${raw.Year || "2026"}` : "")
    )
  };
}

function normalizeFarmBoxscore(rawBox) {
  if (!rawBox || typeof rawBox !== "object") return null;

  return {
    ...rawBox,
    gameSno: cleanText(rawBox.gameSno || rawBox.raw?.GameSno || ""),
    officialGameSno: rawBox.officialGameSno ?? rawBox.raw?.GameSno ?? null,
    kindCode: cleanText(rawBox.kindCode || "D"),
    date: cleanText(rawBox.date || ""),
    time: cleanText(rawBox.time || ""),
    away: cleanText(rawBox.away || ""),
    home: cleanText(rawBox.home || ""),
    venue: cleanText(rawBox.venue || ""),
    parseStatus: cleanText(rawBox.parseStatus || "unknown"),
    totals: rawBox.totals || {},
    lineScore: rawBox.lineScore || { innings: [], away: [], home: [] },
    batters: rawBox.batters || { away: [], home: [] },
    pitchers: rawBox.pitchers || { away: [], home: [] },
    decision: rawBox.decision || {},
    officialUrl: cleanText(rawBox.officialUrl || "")
  };
}

function normalizeStatus(raw) {
  const isPlayBall = cleanText(raw.IsPlayBall);
  const gameDateTimeE = cleanText(raw.GameDateTimeE);
  const gameDuringTime = cleanText(raw.GameDuringTime || raw.Duration || raw.ElapsedTime);
  const text = [
    raw.GameStatus,
    raw.GameStatusName,
    raw.Status,
    raw.StatusText,
    raw.GameRemark,
    raw.Remark
  ].map(cleanText).join(" ");

  if (raw.IsCancel === true || /取消/.test(text)) return "cancelled";
  if (raw.IsDelay === true || /延賽/.test(text)) return "postponed";
  if (/保留/.test(text)) return "suspended";
  if (isPlayBall === "Y") return "live";
  if (gameDateTimeE || gameDuringTime) return "final";

  return "scheduled";
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.games)) return data.games;
  if (Array.isArray(data?.data)) return data.data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function sortGames(a, b) {
  const d = String(a.date || "").localeCompare(String(b.date || ""));
  if (d !== 0) return d;

  const t = String(a.time || "99:99").localeCompare(String(b.time || "99:99"));
  if (t !== 0) return t;

  return Number(a.officialGameSno || a.gameSno || 0) - Number(b.officialGameSno || b.gameSno || 0);
}

function findNearestGame(games) {
  const now = new Date();
  let best = null;
  let bestDiff = Infinity;

  games.forEach(game => {
    const d = new Date(`${game.date}T${game.time || "00:00"}:00+08:00`);
    const diff = Math.abs(d.getTime() - now.getTime());

    if (diff < bestDiff) {
      bestDiff = diff;
      best = game;
    }
  });

  return best;
}

function sameTeam(a, b) {
  return cleanTeamName(a) === cleanTeamName(b);
}

function cleanTeamName(name) {
  return decodeURIComponent(String(name || ""))
    .replace(/\s+/g, "")
    .replace(/二軍/g, "")
    .replace(/7-ELEVEn/gi, "7-ELEVEn")
    .trim();
}

function getWinnerTeam(game) {
  if (!Number.isFinite(Number(game.awayScore)) || !Number.isFinite(Number(game.homeScore))) return "";
  if (Number(game.awayScore) > Number(game.homeScore)) return game.away;
  if (Number(game.homeScore) > Number(game.awayScore)) return game.home;
  return "";
}

function getLoserTeam(game) {
  if (!Number.isFinite(Number(game.awayScore)) || !Number.isFinite(Number(game.homeScore))) return "";
  if (Number(game.awayScore) > Number(game.homeScore)) return game.home;
  if (Number(game.homeScore) > Number(game.awayScore)) return game.away;
  return "";
}

function getTeamLogo(team) {
  const id = TEAM_ID_MAP[team];
  return id ? `assets/logo/${id}.png` : "assets/logo/cpbl.png";
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

function getFeaturedPitcher(game, boxscore = null) {
  const win = boxscore?.decision?.win || game.raw?.WinningPitcherName;
  if (win) return `勝投：${win}`;

  return game.raw?.HomePitcherName || game.raw?.VisitingPitcherName || "—";
}

function getStatusText(status) {
  return STATUS_TEXT[status] || STATUS_TEXT.scheduled;
}

function getLiveBadgeText(status) {
  if (status === "live") return "LIVE";
  if (status === "final") return "FINAL";
  if (status === "postponed") return "延賽";
  if (status === "suspended") return "保留";
  if (status === "cancelled") return "取消";
  return "賽前";
}

function formatScoreForStatus(game, side) {
  if (game.status === "scheduled" && Number(game.awayScore) === 0 && Number(game.homeScore) === 0) {
    return "—";
  }

  const value = side === "home" ? game.homeScore : game.awayScore;
  return formatScore(value);
}

function formatScore(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatStat(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatRheText(boxscore) {
  if (!boxscore?.totals) return "—";

  const a = boxscore.totals.away || {};
  const h = boxscore.totals.home || {};

  return `${formatScore(a.R)}-${formatScore(a.H)}-${formatScore(a.E)} / ${formatScore(h.R)}-${formatScore(h.H)}-${formatScore(h.E)}`;
}

function formatDuration(value) {
  const s = cleanText(value);
  if (!s) return "";

  if (/^\d{6}$/.test(s)) {
    const hh = Number(s.slice(0, 2));
    const mm = Number(s.slice(2, 4));
    return `${hh}小時${mm}分`;
  }

  return s;
}

function normalizeDate(value) {
  if (!value) return "";

  const d = new Date(value);

  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  const s = String(value);
  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);

  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  return "";
}

function normalizeTime(value) {
  if (!value) return "";

  const d = new Date(value);

  if (!Number.isNaN(d.getTime())) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  const s = String(value);
  const m = s.match(/(\d{1,2}):(\d{2})/);

  if (m) return `${pad2(m[1])}:${m[2]}`;

  return "";
}

function getToday() {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;

  return `${y}-${m}-${d}`;
}

function setBaseState(id, active) {
  const el = document.getElementById(id);
  if (!el) return;

  el.classList.toggle("on", !!active);
  el.classList.toggle("active", !!active);
}

function formatClock(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function showLoading() {
  setText("matchStatus", "⏳ 載入中...");
  setText("matchHeaderSub", "載入二軍比賽資料中…");
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
            <div class="dq-kicker">FARM MATCH ERROR</div>
            <strong>二軍比賽中心載入失敗</strong>
            <p>${escapeHtml(msg)}</p>
          </div>
          <div class="dq-badge">ERROR</div>
        </div>
      </div>
    `;
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
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
