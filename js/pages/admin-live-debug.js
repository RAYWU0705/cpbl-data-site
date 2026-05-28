// =========================
// CPBL ADMIN OPS CENTER v5.1.5
// 原 admin-live-debug.js 升級版
// 讀取：live-boxscore / pregame-today / probable-pitchers / league-news / manual overrides
// 不寫檔、不污染主資料
// =========================

const OPS_VERSION = "v5.1.5-ADMIN-OPS-CENTER";

const DEBUG_STATIC_URL = "data/live/live-boxscore.json";
const PREGAME_URL = "data/live/pregame-today.json";
const PROBABLE_URL = "data/live/probable-pitchers.json";
const NEWS_URL = "data/live/league-news.json";
const MANUAL_OVERRIDE_URL = "data/manual/manual-boxscore-overrides.json";

let DEBUG_GAMES = [];
let DEBUG_FILTER = "all";

let OPS_DATA = {
  live: [],
  pregame: [],
  probable: {},
  news: [],
  overrides: [],
  sources: {}
};

document.addEventListener("DOMContentLoaded", initLiveDebug);

async function initLiveDebug() {
  bindDebugButtons();
  await loadDebugData();
}

function bindDebugButtons() {
  const reloadBtn = document.getElementById("btnReloadDebug");

  if (reloadBtn) {
    reloadBtn.addEventListener("click", async () => {
      reloadBtn.disabled = true;
      reloadBtn.textContent = "載入中…";

      await loadDebugData();

      reloadBtn.disabled = false;
      reloadBtn.textContent = "重新載入";
    });
  }

  document.querySelectorAll(".debug-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      DEBUG_FILTER = btn.dataset.filter || "all";

      document.querySelectorAll(".debug-filter-btn").forEach(b => {
        b.classList.toggle("active", b === btn);
      });

      renderDebugGames();
    });
  });
}

async function loadDebugData() {
  try {
    setOpsStatus("warn", "正在讀取資料...", "讀取 live-boxscore / pregame / probable / league-news / manual override。");
    setText("debugHeaderSub", "讀取 Admin Ops Center 資料中…");

    const [liveResult, pregameResult, probableResult, newsResult, overrideResult] = await Promise.all([
      fetchJsonSafe(DEBUG_STATIC_URL),
      fetchJsonSafe(PREGAME_URL),
      fetchJsonSafe(PROBABLE_URL),
      fetchJsonSafe(NEWS_URL),
      fetchJsonSafe(MANUAL_OVERRIDE_URL)
    ]);

    OPS_DATA.sources = {
      live: liveResult,
      pregame: pregameResult,
      probable: probableResult,
      news: newsResult,
      overrides: overrideResult
    };

    DEBUG_GAMES = toArray(liveResult.data);
    OPS_DATA.live = DEBUG_GAMES;
    OPS_DATA.pregame = toArray(pregameResult.data);
    OPS_DATA.probable = normalizeObject(probableResult.data);
    OPS_DATA.news = toArray(newsResult.data);
    OPS_DATA.overrides = normalizeOverrides(overrideResult.data);

    renderOpsSourceStatus();
    renderDebugSummary();
    renderOpsSummary();
    renderDebugGames();
    renderOpsRawSummary();

    const health = buildOverallHealth();

    setOpsStatus(health.level, health.title, health.detail);
    setText("opsOverallStatus", health.heroTitle);
    setText("opsOverallMessage", health.heroMessage);
    setText("debugHeaderSub", `Admin Ops Center 讀取完成｜${OPS_VERSION}`);
    setText("debugLastLoad", formatClock(new Date()));

  } catch (err) {
    console.error("Admin Ops Center 讀取失敗：", err);

    setOpsStatus("bad", "讀取失敗", String(err.message || err));
    setText("opsOverallStatus", "讀取失敗");
    setText("opsOverallMessage", "請確認 data 目錄與 JSON 檔案是否存在。");
    setText("debugHeaderSub", `❌ 讀取失敗：${err.message}`);

    const list = document.getElementById("debugGamesList");
    if (list) {
      list.innerHTML = `
        <div class="debug-empty bad">
          ❌ 無法讀取 Admin Ops Center 資料<br>
          <span class="muted">請確認 data/live/live-boxscore.json 與相關資料檔存在。</span>
        </div>
      `;
    }
  }
}

async function fetchJsonSafe(url) {
  try {
    const res = await fetch(`${url}?ts=${Date.now()}`, { cache: "no-store" });

    if (!res.ok) {
      return { ok: false, url, status: res.status, error: `HTTP ${res.status}`, data: null };
    }

    const data = await res.json();
    return { ok: true, url, status: res.status, error: "", data };

  } catch (err) {
    return { ok: false, url, status: 0, error: err.message || String(err), data: null };
  }
}

function renderOpsSourceStatus() {
  setText("opsLiveSource", sourceText(OPS_DATA.sources.live, `${DEBUG_GAMES.length} 場`));
  setText("opsPregameSource", sourceText(OPS_DATA.sources.pregame, `${OPS_DATA.pregame.length} 場`));
  setText("opsProbableSource", sourceText(OPS_DATA.sources.probable, `${countProbableEntries()} 筆`));
  setText("opsNewsSource", sourceText(OPS_DATA.sources.news, `${OPS_DATA.news.length} 則`));
}

function renderDebugSummary() {
  const today = getToday();
  const todayGames = DEBUG_GAMES.filter(g => g.meta?.date === today);

  const checks = DEBUG_GAMES.map(analyzeGame);

  const goodCount = checks.filter(c => c.level === "good").length;
  const warnCount = checks.filter(c => c.level === "warn").length;
  const badCount = checks.filter(c => c.level === "bad").length;
  const liveCount = DEBUG_GAMES.filter(g => g.meta?.status === "live").length;

  setText("debugTotalGames", DEBUG_GAMES.length);
  setText("debugTodayGames", todayGames.length);
  setText("debugGoodCount", goodCount);
  setText("debugWarnCount", warnCount);
  setText("debugBadCount", badCount);
  setText("debugLiveCount", liveCount);

  setText("opsTodayHint", `${today}｜台北日期`);
}

function renderOpsSummary() {
  const finalCount = DEBUG_GAMES.filter(g => g.meta?.status === "final").length;
  const scheduledCount = DEBUG_GAMES.filter(g => {
    const status = g.meta?.status || "scheduled";
    return status === "scheduled" || status === "pregame";
  }).length;

  setText("opsOverrideCount", OPS_DATA.overrides.length);
  setText("opsPregameCount", OPS_DATA.pregame.length);
  setText("opsProbableCount", countProbableEntries());
  setText("opsNewsCount", OPS_DATA.news.length);
  setText("opsFinalCount", finalCount);
  setText("opsScheduledCount", scheduledCount);
}

function renderDebugGames() {
  const list = document.getElementById("debugGamesList");
  if (!list) return;

  const today = getToday();
  let games = [...DEBUG_GAMES];

  if (DEBUG_FILTER === "today") games = games.filter(g => g.meta?.date === today);
  if (DEBUG_FILTER === "live") games = games.filter(g => g.meta?.status === "live");
  if (DEBUG_FILTER === "final") games = games.filter(g => g.meta?.status === "final");
  if (DEBUG_FILTER === "problem") {
    games = games.filter(g => {
      const check = analyzeGame(g);
      return check.level === "warn" || check.level === "bad";
    });
  }
  if (DEBUG_FILTER === "override") games = games.filter(hasManualOverride);

  games.sort((a, b) => {
    const da = a.meta?.date || "9999-12-31";
    const db = b.meta?.date || "9999-12-31";
    if (da !== db) return db.localeCompare(da);
    return Number(a.gameSno || 0) - Number(b.gameSno || 0);
  });

  if (!games.length) {
    list.innerHTML = `<div class="debug-empty">沒有符合條件的場次。</div>`;
    return;
  }

  list.innerHTML = games.map(renderDebugGameCard).join("");
}

function renderDebugGameCard(game) {
  const meta = game.meta || {};
  const check = analyzeGame(game);

  const away = meta.away || "客隊";
  const home = meta.home || "主隊";

  const batterAway = game.batters?.away?.length || 0;
  const batterHome = game.batters?.home?.length || 0;
  const pitcherAway = game.pitchers?.away?.length || 0;
  const pitcherHome = game.pitchers?.home?.length || 0;

  const lineAway = Array.isArray(game.lineScore?.away) ? game.lineScore.away : [];
  const lineHome = Array.isArray(game.lineScore?.home) ? game.lineScore.home : [];

  const starterAway = game.pregame?.starters?.away || "";
  const starterHome = game.pregame?.starters?.home || "";

  const matchUrl = buildMatchUrl(game);
  const officialUrl =
    meta.officialUrl ||
    `https://www.cpbl.com.tw/box/index?year=2026&kindCode=A&gameSno=${game.gameSno}`;

  const overrideBadge = hasManualOverride(game)
    ? `<span class="debug-badge warn">Override</span>`
    : "";

  return `
    <article class="debug-game-card ${check.level}">
      <div class="debug-game-top">
        <div>
          <div class="debug-game-title">
            <span class="debug-badge ${check.level}">${getLevelText(check.level)}</span>
            ${overrideBadge}
            <strong>#${escapeHtml(game.gameSno ?? "—")}</strong>
            <span>${escapeHtml(away)} VS ${escapeHtml(home)}</span>
          </div>

          <div class="debug-game-meta">
            ${escapeHtml(meta.date || "日期待補")}
            ｜${escapeHtml(meta.venue || "球場待定")}
            ｜${escapeHtml(getStatusText(meta.status))}
            ${meta.time ? `｜${escapeHtml(meta.time)}` : ""}
            ${meta.duration ? `｜${escapeHtml(meta.duration)}` : ""}
          </div>
        </div>

        <div class="debug-game-actions">
          <a href="${matchUrl}" target="_blank">開比賽中心</a>
          <a href="${officialUrl}" target="_blank">官方</a>
        </div>
      </div>

      <div class="debug-stat-grid">
        <div><span>比分</span><strong>${escapeHtml(away)} ${formatScore(game.totals?.away?.R)}：${formatScore(game.totals?.home?.R)} ${escapeHtml(home)}</strong></div>
        <div><span>R/H/E</span><strong>${formatScore(game.totals?.away?.R)}/${formatScore(game.totals?.away?.H)}/${formatScore(game.totals?.away?.E)} ｜ ${formatScore(game.totals?.home?.R)}/${formatScore(game.totals?.home?.H)}/${formatScore(game.totals?.home?.E)}</strong></div>
        <div><span>逐局</span><strong>${lineAway.length}/${lineHome.length}</strong></div>
        <div><span>打者</span><strong>客 ${batterAway}｜主 ${batterHome}</strong></div>
        <div><span>投手</span><strong>客 ${pitcherAway}｜主 ${pitcherHome}</strong></div>
        <div><span>預告先發</span><strong>${escapeHtml(starterAway || "—")} vs ${escapeHtml(starterHome || "—")}</strong></div>
        <div><span>urlMode</span><strong>${escapeHtml(meta.urlMode || "—")}</strong></div>
        <div><span>dataQuality</span><strong>${escapeHtml(formatDataQuality(game))}</strong></div>
      </div>

      <details class="debug-detail">
        <summary>檢查訊息</summary>
        <ul>${check.messages.map(msg => `<li>${escapeHtml(msg)}</li>`).join("")}</ul>
      </details>
    </article>
  `;
}

function analyzeGame(game) {
  const meta = game.meta || {};
  const messages = [];
  let score = 0;

  const status = meta.status || "scheduled";

  const hasTeams = !!meta.away && !!meta.home;
  const hasDate = !!meta.date;
  const hasVenue = !!meta.venue;

  const hasRHE = game.totals?.away?.R != null && game.totals?.home?.R != null;
  const hasHits = game.totals?.away?.H != null && game.totals?.home?.H != null;

  const hasLineScore =
    Array.isArray(game.lineScore?.away) &&
    game.lineScore.away.length > 0 &&
    Array.isArray(game.lineScore?.home) &&
    game.lineScore.home.length > 0;

  const batterCount = (game.batters?.away?.length || 0) + (game.batters?.home?.length || 0);
  const pitcherCount = (game.pitchers?.away?.length || 0) + (game.pitchers?.home?.length || 0);

  if (!hasTeams) { messages.push("缺少主客隊 meta。"); score += 3; }
  if (!hasDate) { messages.push("缺少日期。"); score += 2; }
  if (!hasVenue) { messages.push("缺少球場。"); score += 1; }

  if (status === "live") {
    if (!hasRHE) { messages.push("LIVE 但沒有比分 R。"); score += 3; }
    if (!hasHits) { messages.push("LIVE 但 H/E 尚未完整。"); score += 1; }
    if (!hasLineScore) { messages.push("LIVE 但沒有逐局比分。"); score += 2; }
    if (!batterCount) { messages.push("LIVE 但沒有打者資料。"); score += 3; }
    if (!pitcherCount) { messages.push("LIVE 但沒有投手資料。"); score += 2; }
  }

  if (status === "final") {
    if (!hasRHE) { messages.push("FINAL 但沒有最終比分。"); score += 3; }
    if (!hasLineScore) { messages.push("FINAL 但沒有逐局比分。"); score += 2; }
    if (!batterCount) { messages.push("FINAL 但沒有打者資料。"); score += 1; }
    if (!pitcherCount) { messages.push("FINAL 但沒有投手資料。"); score += 1; }
  }

  if (status === "scheduled" || status === "pregame") {
    if (!game.pregame?.starters?.away && !game.pregame?.starters?.home) {
      messages.push("未開賽場次：尚無預告先發或尚未抓到。");
    }
  }

  if (status === "postponed") {
    if (batterCount || pitcherCount || hasLineScore) {
      messages.push("延賽場次卻存在 boxscore detail，請確認是否被其他場污染。");
      score += 2;
    }
  }

  if (meta.urlMode === "fallback-detail" || meta.urlMode === "schedule-fallback-auto") {
    messages.push(`此場使用 fallback meta：${meta.urlMode}`);
  }

  if (hasManualOverride(game)) {
    messages.push("此場含 manual override 標記，請確認是否為預期修正。");
  }

  if (!messages.length) messages.push("目前看起來正常。");

  let level = "good";
  if (score >= 5) level = "bad";
  else if (score >= 1) level = "warn";

  return { level, messages };
}

function renderOpsRawSummary() {
  const summary = {
    version: OPS_VERSION,
    loadedAt: new Date().toISOString(),
    sources: {
      live: simplifySource(OPS_DATA.sources.live),
      pregame: simplifySource(OPS_DATA.sources.pregame),
      probable: simplifySource(OPS_DATA.sources.probable),
      news: simplifySource(OPS_DATA.sources.news),
      overrides: simplifySource(OPS_DATA.sources.overrides)
    },
    counts: {
      liveBoxscoreGames: DEBUG_GAMES.length,
      pregameTodayGames: OPS_DATA.pregame.length,
      probablePitchers: countProbableEntries(),
      leagueNews: OPS_DATA.news.length,
      manualOverrides: OPS_DATA.overrides.length
    },
    health: {
      good: Number(document.getElementById("debugGoodCount")?.textContent || 0),
      warn: Number(document.getElementById("debugWarnCount")?.textContent || 0),
      bad: Number(document.getElementById("debugBadCount")?.textContent || 0),
      live: Number(document.getElementById("debugLiveCount")?.textContent || 0)
    }
  };

  const pre = document.getElementById("opsRawSummary");
  if (pre) pre.textContent = JSON.stringify(summary, null, 2);
}

function buildOverallHealth() {
  const sourceBad = Object.values(OPS_DATA.sources).filter(s => !s.ok);
  const badCount = Number(document.getElementById("debugBadCount")?.textContent || 0);
  const warnCount = Number(document.getElementById("debugWarnCount")?.textContent || 0);

  if (!OPS_DATA.sources.live?.ok) {
    return {
      level: "bad",
      title: "主要資料讀取失敗",
      detail: "live-boxscore.json 無法讀取，前台資料可能無法正常顯示。",
      heroTitle: "主資料異常",
      heroMessage: "請先檢查 data/live/live-boxscore.json 是否存在。"
    };
  }

  if (badCount > 0) {
    return {
      level: "bad",
      title: "偵測到嚴重資料問題",
      detail: `目前有 ${badCount} 場被判定為錯誤，建議查看「有問題」篩選。`,
      heroTitle: "需要處理",
      heroMessage: `目前有 ${badCount} 場資料異常，建議先看場次總覽。`
    };
  }

  if (sourceBad.length > 0 || warnCount > 0) {
    return {
      level: "warn",
      title: "系統可用，但有警告",
      detail: `來源讀取警告 ${sourceBad.length} 個，場次警告 ${warnCount} 個。`,
      heroTitle: "可用但需注意",
      heroMessage: "主資料可讀，部分輔助資料或場次健康狀態有警告。"
    };
  }

  return {
    level: "good",
    title: "系統健康",
    detail: "主要資料與健康檢查目前看起來正常。",
    heroTitle: "All Systems Go",
    heroMessage: "live-boxscore 與輔助資料已完成讀取。"
  };
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function normalizeObject(data) {
  if (data && typeof data === "object" && !Array.isArray(data)) return data;
  return {};
}

function normalizeOverrides(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function countProbableEntries() {
  return Object.values(OPS_DATA.probable || {}).filter(Boolean).length;
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

function formatClock(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatScore(v) {
  return v ?? "—";
}

function getStatusText(status) {
  if (status === "live") return "🔴 LIVE";
  if (status === "final") return "✅ FINAL";
  if (status === "postponed") return "🌧 延賽";
  if (status === "suspended") return "⏸ 保留比賽";
  if (status === "cancelled") return "❌ 取消";
  return "⏳ 未開打";
}

function getLevelText(level) {
  if (level === "bad") return "錯誤";
  if (level === "warn") return "警告";
  return "正常";
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setOpsStatus(level, title, detail) {
  const dot = document.getElementById("opsStatusDot");
  if (dot) dot.className = `ops-status-dot ${level === "good" ? "" : level}`;
  setText("opsStatusTitle", title);
  setText("opsStatusDetail", detail);
}

function sourceText(source, okText) {
  if (!source) return "未讀取";
  if (source.ok) return `OK｜${okText}`;
  return `缺少｜${source.error || "讀取失敗"}`;
}

function simplifySource(source) {
  if (!source) return { ok: false, error: "not loaded" };
  return {
    ok: source.ok,
    url: source.url,
    status: source.status,
    error: source.error || ""
  };
}

function hasManualOverride(game) {
  return Boolean(
    game.manualOverride ||
    game.debug?.manualOverride?.applied ||
    game.dataQuality?.manualOverride === "applied"
  );
}

function formatDataQuality(game) {
  const dq = game.dataQuality || {};
  if (!dq || !Object.keys(dq).length) return "—";
  if (dq.manualOverride === "applied") return "manual override";
  return dq.stage || dq.source || dq.mode || dq.status || "available";
}

function buildMatchUrl(game) {
  const meta = game.meta || {};
  const date = meta.date || "";
  const home = meta.home || "";
  const away = meta.away || "";

  if (date && home && away) {
    return `match.html?date=${encodeURIComponent(date)}&home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`;
  }

  return `match.html?gameSno=${encodeURIComponent(game.gameSno || "")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
