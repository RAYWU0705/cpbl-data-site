/* =========================================================
   Ray's Baseball Live Logger
   v1.0.0-LIVE-GAME-LOGGER
========================================================= */

const STORAGE_KEY = "ray_baseball_live_logger_v1";

let state = createDefaultState();
let saveTimer = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  state = loadState();
  bindInputs();
  bindButtons();
  renderAll();
  updateJsonPreview();
}

function createDefaultState() {
  const now = new Date();

  return {
    version: "v1.0.0-LIVE-GAME-LOGGER",
    updatedAt: "",
    game: {
      id: `manual-${Date.now()}`,
      title: "",
      date: formatDateInput(now),
      time: "",
      venue: "",
      away: "客隊",
      home: "主隊"
    },
    score: {
      away: 0,
      home: 0
    },
    current: {
      inning: 1,
      half: "top",
      outs: 0,
      bases: {
        first: false,
        second: false,
        third: false
      },
      batter: "",
      pitcher: ""
    },
    events: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();

    const parsed = JSON.parse(raw);
    return mergeState(createDefaultState(), parsed);
  } catch {
    return createDefaultState();
  }
}

function mergeState(base, saved) {
  return {
    ...base,
    ...saved,
    game: { ...base.game, ...(saved.game || {}) },
    score: { ...base.score, ...(saved.score || {}) },
    current: {
      ...base.current,
      ...(saved.current || {}),
      bases: {
        ...base.current.bases,
        ...(saved.current?.bases || {})
      }
    },
    events: Array.isArray(saved.events) ? saved.events : []
  };
}

function bindInputs() {
  const map = {
    gameDate: ["game", "date"],
    gameTime: ["game", "time"],
    venue: ["game", "venue"],
    gameTitle: ["game", "title"],
    awayTeam: ["game", "away"],
    homeTeam: ["game", "home"],
    inning: ["current", "inning"],
    half: ["current", "half"],
    outs: ["current", "outs"],
    batter: ["current", "batter"],
    pitcher: ["current", "pitcher"]
  };

  Object.entries(map).forEach(([id, path]) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.value = getPath(state, path) ?? "";

    el.addEventListener("input", () => {
      const value = el.type === "number" || id === "outs"
        ? Number(el.value)
        : el.value;

      setPath(state, path, value);
      scheduleSave();
      renderAll();
    });
  });
}

function bindButtons() {
  document.querySelectorAll("[data-score-side]").forEach(btn => {
    btn.addEventListener("click", () => {
      const side = btn.dataset.scoreSide;
      const delta = Number(btn.dataset.delta || 0);
      state.score[side] = Math.max(0, Number(state.score[side] || 0) + delta);
      scheduleSave();
      renderAll();
    });
  });

  document.querySelectorAll("[data-base]").forEach(btn => {
    btn.addEventListener("click", () => {
      const base = btn.dataset.base;
      state.current.bases[base] = !state.current.bases[base];
      scheduleSave();
      renderAll();
    });
  });

  document.querySelectorAll("[data-quick-event]").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.quickEvent;
      const select = document.getElementById("eventType");
      if (select) select.value = type;
      addEvent(type);
    });
  });

  document.getElementById("btnAddEvent")?.addEventListener("click", () => {
    addEvent(document.getElementById("eventType")?.value || "其他");
  });

  document.getElementById("btnUndoEvent")?.addEventListener("click", undoEvent);
  document.getElementById("btnNextHalf")?.addEventListener("click", nextHalf);
  document.getElementById("btnResetGame")?.addEventListener("click", resetGame);
  document.getElementById("btnExportJson")?.addEventListener("click", exportJson);
  document.getElementById("btnCopyJson")?.addEventListener("click", copyJson);
  document.getElementById("btnRefreshPreview")?.addEventListener("click", updateJsonPreview);
}

function addEvent(type = "其他") {
  const note = document.getElementById("eventNote")?.value || "";

  const event = {
    id: `evt-${Date.now()}`,
    createdAt: new Date().toISOString(),
    timeText: formatClock(new Date()),
    inning: Number(state.current.inning || 1),
    half: state.current.half || "top",
    inningText: getInningText(),
    outs: Number(state.current.outs || 0),
    bases: { ...state.current.bases },
    score: { ...state.score },
    batter: state.current.batter || "",
    pitcher: state.current.pitcher || "",
    type,
    note: note.trim()
  };

  state.events.unshift(event);

  if (type.includes("出局") || type === "三振") {
    state.current.outs = Math.min(2, Number(state.current.outs || 0) + 1);
    const outsEl = document.getElementById("outs");
    if (outsEl) outsEl.value = String(state.current.outs);
  }

  if (type === "全壘打") {
    state.current.bases.first = false;
    state.current.bases.second = false;
    state.current.bases.third = false;
  }

  const noteEl = document.getElementById("eventNote");
  if (noteEl) noteEl.value = "";

  scheduleSave();
  renderAll();
}

function undoEvent() {
  if (!state.events.length) return;
  const ok = confirm("確定要刪除上一筆事件嗎？");
  if (!ok) return;

  state.events.shift();
  scheduleSave();
  renderAll();
}

function nextHalf() {
  const currentHalf = state.current.half;

  if (currentHalf === "top") {
    state.current.half = "bottom";
  } else {
    state.current.half = "top";
    state.current.inning = Number(state.current.inning || 1) + 1;
  }

  state.current.outs = 0;
  state.current.bases = { first: false, second: false, third: false };

  syncControlsFromState();
  addEvent("換半局");
}

function resetGame() {
  const ok = confirm("確定要清空目前比賽紀錄嗎？這個動作不能復原。");
  if (!ok) return;

  state = createDefaultState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncControlsFromState();
  renderAll();
  updateJsonPreview();
}

function exportJson() {
  const data = getExportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const date = state.game.date || "game";
  a.href = url;
  a.download = `baseball-live-log-${date}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

async function copyJson() {
  const text = JSON.stringify(getExportData(), null, 2);

  try {
    await navigator.clipboard.writeText(text);
    setSaveStatus("JSON 已複製");
  } catch {
    alert("無法使用剪貼簿，請從 JSON 預覽手動複製。");
  }
}

function scheduleSave() {
  setSaveStatus("儲存中…");

  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setSaveStatus(`已儲存 ${formatClock(new Date())}`);
    updateJsonPreview();
  }, 180);
}

function renderAll() {
  renderLabels();
  renderScoreboard();
  renderBases();
  renderTimeline();
}

function renderLabels() {
  setText("awayTeamLabel", state.game.away || "客隊");
  setText("homeTeamLabel", state.game.home || "主隊");

  const awayInput = document.getElementById("awayTeam");
  const homeInput = document.getElementById("homeTeam");

  if (awayInput && document.activeElement !== awayInput) awayInput.value = state.game.away || "";
  if (homeInput && document.activeElement !== homeInput) homeInput.value = state.game.home || "";
}

function renderScoreboard() {
  setText("awayScoreDisplay", state.score.away);
  setText("homeScoreDisplay", state.score.home);
  setText("inningDisplay", getInningText());
  setText("scoreLine", `${state.game.away || "客隊"} ${state.score.away}：${state.score.home} ${state.game.home || "主隊"}`);
}

function renderBases() {
  const bases = state.current.bases || {};

  ["first", "second", "third"].forEach(base => {
    const el = document.querySelector(`[data-base="${base}"]`);
    if (el) el.classList.toggle("active", !!bases[base]);
  });

  const names = [];
  if (bases.first) names.push("一壘");
  if (bases.second) names.push("二壘");
  if (bases.third) names.push("三壘");

  setText("basesText", names.length ? `壘包：${names.join("、")}有人` : "壘包：無人在壘");
}

function renderTimeline() {
  const box = document.getElementById("timeline");
  if (!box) return;

  setText("eventCount", `${state.events.length} 筆事件`);

  if (!state.events.length) {
    box.innerHTML = `<div class="empty-state">尚未新增事件。看球時可以從左側控制台開始記錄。</div>`;
    return;
  }

  box.innerHTML = state.events.map(event => `
    <article class="event-card">
      <div class="event-card-head">
        <span class="event-inning">${escapeHtml(event.inningText)}</span>
        <span class="event-time">${escapeHtml(event.timeText || "")}</span>
      </div>

      <div class="event-main">
        ${escapeHtml(event.type)}
        ${event.batter ? `｜${escapeHtml(event.batter)}` : ""}
      </div>

      <div class="event-sub">
        投手：${escapeHtml(event.pitcher || "—")}｜出局：${escapeHtml(event.outs)}
        ${event.note ? `<br>${escapeHtml(event.note)}` : ""}
      </div>

      <div class="event-meta">
        <span>${escapeHtml(state.game.away || "客隊")} ${event.score.away}：${event.score.home} ${escapeHtml(state.game.home || "主隊")}</span>
        <span>${escapeHtml(formatBases(event.bases))}</span>
      </div>
    </article>
  `).join("");
}

function updateJsonPreview() {
  const pre = document.getElementById("jsonPreview");
  if (!pre) return;

  pre.textContent = JSON.stringify(getExportData(), null, 2);
}

function getExportData() {
  return {
    ...state,
    exportedAt: new Date().toISOString(),
    summary: {
      title: state.game.title || `${state.game.away} vs ${state.game.home}`,
      scoreLine: `${state.game.away} ${state.score.away}:${state.score.home} ${state.game.home}`,
      inningText: getInningText(),
      eventCount: state.events.length
    }
  };
}

function syncControlsFromState() {
  const ids = {
    gameDate: state.game.date,
    gameTime: state.game.time,
    venue: state.game.venue,
    gameTitle: state.game.title,
    awayTeam: state.game.away,
    homeTeam: state.game.home,
    inning: state.current.inning,
    half: state.current.half,
    outs: state.current.outs,
    batter: state.current.batter,
    pitcher: state.current.pitcher
  };

  Object.entries(ids).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
  });
}

function getInningText() {
  const inning = Number(state.current.inning || 1);
  const halfText = state.current.half === "bottom" ? "下" : "上";
  return `${inning}局${halfText}`;
}

function formatBases(bases = {}) {
  const names = [];
  if (bases.first) names.push("一壘");
  if (bases.second) names.push("二壘");
  if (bases.third) names.push("三壘");
  return names.length ? `${names.join("、")}有人` : "無人在壘";
}

function setSaveStatus(text) {
  setText("saveStatus", text);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function getPath(obj, path) {
  return path.reduce((cur, key) => cur?.[key], obj);
}

function setPath(obj, path, value) {
  let cur = obj;

  path.slice(0, -1).forEach(key => {
    if (!cur[key]) cur[key] = {};
    cur = cur[key];
  });

  cur[path[path.length - 1]] = value;
}

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatClock(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
