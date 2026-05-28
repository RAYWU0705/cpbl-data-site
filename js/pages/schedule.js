console.log("✅ schedule.js v5.2.4-FARM-HOME-ENTRY 已載入");

/* =========================================================
   Ray's CPBL Data Site
   Schedule Center v5.2.4-FARM-HOME-ENTRY

   重點：
   - 資料來源：data/live/live-boxscore.json
   - 恢復原本全部賽程顯示
   - 支援 schedule.html?team=brothers
   - 不讀 data/schedule-YYYY-MM.json
   - 支援列表 / 月曆 / 月份 / 日期 / 球隊 / 場地 / 狀態 / 搜尋
========================================================= */

const VERSION = "v5.2.4-FARM-HOME-ENTRY";
const LIVE_BOXSCORE_URL = "data/live/live-boxscore.json";

const TEAM_ID_MAP = {
  "中信兄弟": "brothers",
  "統一7-ELEVEn獅": "lions",
  "樂天桃猿": "monkeys",
  "味全龍": "dragons",
  "富邦悍將": "guardians",
  "台鋼雄鷹": "hawks"
};

const TEAM_NAME_MAP = {
  brothers: "中信兄弟",
  lions: "統一7-ELEVEn獅",
  monkeys: "樂天桃猿",
  dragons: "味全龍",
  guardians: "富邦悍將",
  hawks: "台鋼雄鷹"
};

const TEAM_COLORS = {
  brothers: "#f6c400",
  lions: "#f26b21",
  monkeys: "#8a1538",
  dragons: "#c8102e",
  guardians: "#0047ab",
  hawks: "#007f7a"
};

const TYPE_TEXT = {
  regular: "例行賽",
  exhibition: "熱身賽",
  playoff: "季後賽",
  championship: "總冠軍賽",
  allstar: "明星賽",
  minor: "二軍賽"
};

const STATUS_TEXT = {
  scheduled: "未開賽",
  pregame: "賽前",
  live: "LIVE",
  in_progress: "LIVE",
  final: "已結束",
  postponed: "延賽",
  suspended: "保留",
  cancelled: "取消"
};

let allGames = [];
let filteredGames = [];
let currentMode = "list";

const queryParams = new URLSearchParams(location.search);
const initialTeamParam = cleanText(queryParams.get("team"));
const initialDateParam = cleanText(queryParams.get("date"));

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", initSchedule);

async function initSchedule() {
  try {
    setText("scheduleDataStatus", "資料載入中…");

    allGames = await loadLiveBoxscoreGames();

    if (!allGames.length) {
      renderLoadEmpty();
      return;
    }

    buildFilterOptions();
    applyInitialQueryParams();
    bindEvents();
    applyFilters();

    setText(
      "scheduleDataStatus",
      `✅ 已載入 ${allGames.length} 場賽程資料｜資料來源：live-boxscore.json｜${VERSION}`
    );
  } catch (err) {
    console.error("❌ 賽程中心初始化失敗：", err);
    setText("scheduleDataStatus", "⚠️ 賽程資料載入失敗，請查看 Console。");
    const list = $("scheduleList");
    if (list) {
      list.innerHTML = `<div class="schedule-empty">賽程資料載入失敗。</div>`;
    }
  }
}

async function loadLiveBoxscoreGames() {
  const res = await fetch(`${LIVE_BOXSCORE_URL}?ts=${Date.now()}`, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`live-boxscore.json HTTP ${res.status}`);
  }

  const data = await res.json();
  const arr = toArray(data);

  return arr
    .map(normalizeGame)
    .filter(g => g && g.date && (g.home || g.away))
    .sort(sortGames);
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.games)) return data.games;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;

  if (data && typeof data === "object") {
    return Object.values(data).filter(v => v && typeof v === "object");
  }

  return [];
}

function normalizeGame(raw) {
  if (!raw || typeof raw !== "object") return null;

  const meta = raw.meta || {};
  const totals = raw.totals || {};
  const dq = raw.dataQuality || {};

  const homeRaw =
    meta.home ??
    raw.home ??
    raw.teams?.home ??
    raw.homeTeam ??
    raw.HomeTeamName ??
    "";

  const awayRaw =
    meta.away ??
    raw.away ??
    raw.teams?.away ??
    raw.awayTeam ??
    raw.AwayTeamName ??
    "";

  const home = normalizeTeamName(homeRaw);
  const away = normalizeTeamName(awayRaw);

  const status = normalizeStatus(meta.status || meta.statusText || raw.status || raw.gameStatus);

  return {
    raw,
    gameSno: raw.gameSno ?? meta.gameSno ?? raw.game_no ?? raw.gameNo ?? raw.id ?? "",
    date: cleanText(meta.date ?? raw.date ?? raw.gameDate ?? raw.GameDate),
    time: cleanText(meta.time ?? raw.time ?? raw.gameTime ?? raw.GameTime),
    venue: cleanText(meta.venue ?? raw.venue ?? raw.stadium ?? raw.place),
    type: cleanText(meta.type ?? raw.type ?? raw.kind ?? "regular"),
    status,
    statusRaw: cleanText(meta.rawStatus || meta.statusText || raw.status || ""),
    home,
    away,
    homeId: toTeamId(home),
    awayId: toTeamId(away),
    awayR: toNumberOrNull(totals.away?.R),
    homeR: toNumberOrNull(totals.home?.R),
    awayH: toNumberOrNull(totals.away?.H),
    homeH: toNumberOrNull(totals.home?.H),
    awayE: toNumberOrNull(totals.away?.E),
    homeE: toNumberOrNull(totals.home?.E),
    dataQuality: dq,
    finalLock: raw.finalLock
  };
}

function normalizeTeamName(value) {
  const s = cleanText(value);
  if (!s) return "";
  if (TEAM_NAME_MAP[s]) return TEAM_NAME_MAP[s];
  return s;
}

function toTeamId(value) {
  const s = cleanText(value);
  if (!s) return "";
  if (TEAM_NAME_MAP[s]) return s;
  return TEAM_ID_MAP[s] || s;
}

function normalizeStatus(value) {
  const s = cleanText(value).toLowerCase();
  const raw = cleanText(value);

  if (["live", "in_progress", "playing"].includes(s)) return "live";
  if (["final", "finished"].includes(s)) return "final";
  if (["scheduled", "pregame"].includes(s)) return "scheduled";
  if (["postponed"].includes(s)) return "postponed";
  if (["suspended"].includes(s)) return "suspended";
  if (["cancelled", "canceled"].includes(s)) return "cancelled";

  if (/比賽中|進行中|live/i.test(raw)) return "live";
  if (/結束|完賽|final/i.test(raw)) return "final";
  if (/延賽/.test(raw)) return "postponed";
  if (/保留/.test(raw)) return "suspended";
  if (/取消/.test(raw)) return "cancelled";
  if (/尚未|未開始|賽前/.test(raw)) return "scheduled";

  // 有比分且 finalLock 時，視為 FINAL。
  return "scheduled";
}

function sortGames(a, b) {
  const d = String(a.date).localeCompare(String(b.date));
  if (d !== 0) return d;

  const t = String(a.time || "99:99").localeCompare(String(b.time || "99:99"));
  if (t !== 0) return t;

  return Number(a.gameSno || 0) - Number(b.gameSno || 0);
}

/* =========================
   篩選選單
========================= */

function buildFilterOptions() {
  fillTypeOptions();
  fillMonthOptions();
  fillTeamOptions();
  fillVenueOptions();
}

function fillTypeOptions() {
  const select = $("typeSelect");
  if (!select) return;

  const types = unique(allGames.map(g => g.type).filter(Boolean));

  select.innerHTML = `<option value="ALL">全部賽程</option>` +
    types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(getTypeText(t))}</option>`).join("");
}

function fillMonthOptions() {
  const select = $("monthSelect");
  if (!select) return;

  const months = unique(allGames.map(g => String(g.date).slice(0, 7)).filter(Boolean));

  select.innerHTML = `<option value="ALL">全部月份</option>` +
    months.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
}

function fillTeamOptions() {
  const select = $("teamSelect");
  if (!select) return;

  const teams = Object.entries(TEAM_NAME_MAP);

  select.innerHTML = `<option value="ALL">全部球隊</option>` +
    teams.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("");
}

function fillVenueOptions() {
  const select = $("venueSelect");
  if (!select) return;

  const venues = unique(allGames.map(g => g.venue).filter(Boolean));

  select.innerHTML = `<option value="ALL">全部場地</option>` +
    venues.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function applyInitialQueryParams() {
  const teamSelect = $("teamSelect");
  const dateSelect = $("dateSelect");

  if (initialTeamParam && teamSelect) {
    const teamId = TEAM_NAME_MAP[initialTeamParam]
      ? initialTeamParam
      : TEAM_ID_MAP[initialTeamParam] || initialTeamParam;

    teamSelect.value = teamId;

    renderTeamFilterBanner(teamId);
  }

  if (initialDateParam && dateSelect) {
    dateSelect.value = initialDateParam;
  }
}

function renderTeamFilterBanner(teamId) {
  const banner = $("teamFilterBanner");
  const title = $("teamFilterTitle");
  const text = $("teamFilterText");
  const link = $("teamHomeLink");

  if (!banner) return;

  if (!teamId || teamId === "ALL") {
    banner.style.display = "none";
    return;
  }

  const name = TEAM_NAME_MAP[teamId] || teamId;
  const color = TEAM_COLORS[teamId] || "#0b3c5d";

  document.body.style.setProperty("--team-color", color);

  banner.style.display = "";
  if (title) title.textContent = `目前篩選球隊：${name}`;
  if (text) text.textContent = `目前只顯示 ${name} 相關賽程。`;
  if (link) link.href = `team.html?team=${encodeURIComponent(teamId)}`;
}

function bindEvents() {
  [
    "typeSelect",
    "monthSelect",
    "dateSelect",
    "teamSelect",
    "venueSelect",
    "statusSelect",
    "searchInput"
  ].forEach(id => {
    const el = $(id);
    if (!el) return;

    const eventName = el.tagName === "INPUT" ? "input" : "change";
    el.addEventListener(eventName, () => {
      if (id === "teamSelect") {
        updateUrlTeamParam(el.value);
        renderTeamFilterBanner(el.value);
      }

      applyFilters();
    });
  });

  const reset = $("btnResetFilter");
  if (reset) {
    reset.addEventListener("click", () => {
      resetFilters();
      applyFilters();
    });
  }

  const reload = $("btnReloadGames");
  if (reload) {
    reload.addEventListener("click", async () => {
      reload.disabled = true;
      reload.textContent = "重新整理中…";

      try {
        allGames = await loadLiveBoxscoreGames();
        buildFilterOptions();
        applyInitialQueryParams();
        applyFilters();
        setText("scheduleDataStatus", `✅ 已重新載入 ${allGames.length} 場賽程資料｜${VERSION}`);
      } finally {
        reload.disabled = false;
        reload.textContent = "重新整理資料";
      }
    });
  }


  const downloadCsv = $("btnDownloadScheduleCsv");
  if (downloadCsv) {
    downloadCsv.addEventListener("click", () => {
      downloadScheduleCsv();
    });
  }

  const downloadIcs = $("btnDownloadScheduleIcs");
  if (downloadIcs) {
    downloadIcs.addEventListener("click", () => {
      downloadScheduleIcs();
    });
  }

  const listBtn = $("btnListMode");
  const calBtn = $("btnCalendarMode");

  if (listBtn) {
    listBtn.addEventListener("click", () => {
      currentMode = "list";
      renderMode();
    });
  }

  if (calBtn) {
    calBtn.addEventListener("click", () => {
      currentMode = "calendar";
      renderMode();
    });
  }
}

function updateUrlTeamParam(teamId) {
  const url = new URL(location.href);

  if (!teamId || teamId === "ALL") {
    url.searchParams.delete("team");
  } else {
    url.searchParams.set("team", teamId);
  }

  history.replaceState(null, "", url);
}

function resetFilters() {
  setValue("typeSelect", "ALL");
  setValue("monthSelect", "ALL");
  setValue("dateSelect", "");
  setValue("teamSelect", "ALL");
  setValue("venueSelect", "ALL");
  setValue("statusSelect", "ALL");
  setValue("searchInput", "");

  updateUrlTeamParam("ALL");
  renderTeamFilterBanner("ALL");
}

/* =========================
   套用篩選
========================= */

function applyFilters() {
  const type = getValue("typeSelect", "ALL");
  const month = getValue("monthSelect", "ALL");
  const date = getValue("dateSelect", "");
  const team = getValue("teamSelect", "ALL");
  const venue = getValue("venueSelect", "ALL");
  const status = getValue("statusSelect", "ALL");
  const search = getValue("searchInput", "").toLowerCase();

  filteredGames = allGames.filter(game => {
    if (type !== "ALL" && game.type !== type) return false;
    if (month !== "ALL" && String(game.date).slice(0, 7) !== month) return false;
    if (date && game.date !== date) return false;
    if (team !== "ALL" && !isGameOfTeam(game, team)) return false;
    if (venue !== "ALL" && game.venue !== venue) return false;
    if (status !== "ALL" && game.status !== status) return false;

    if (search) {
      const haystack = [
        game.gameSno,
        game.date,
        game.time,
        game.venue,
        game.home,
        game.away,
        game.homeId,
        game.awayId,
        getTypeText(game.type),
        getStatusText(game.status)
      ].join(" ").toLowerCase();

      if (!haystack.includes(search)) return false;
    }

    return true;
  });

  renderAll();
}

function isGameOfTeam(game, teamId) {
  const id = TEAM_NAME_MAP[teamId] ? teamId : TEAM_ID_MAP[teamId] || teamId;
  const name = TEAM_NAME_MAP[id] || teamId;

  return (
    sameTeam(game.homeId, id) ||
    sameTeam(game.awayId, id) ||
    sameTeam(game.home, name) ||
    sameTeam(game.away, name)
  );
}

function sameTeam(a, b) {
  return cleanTeam(a) === cleanTeam(b);
}

function cleanTeam(v) {
  return cleanText(v)
    .replace(/\s+/g, "")
    .replace(/7-ELEVEn/gi, "7-eleven")
    .toLowerCase();
}

/* =========================
   渲染
========================= */

function renderAll() {
  renderTodayFocus();
  renderDownloadHint();
  renderSummary();
  renderMode();
}

function renderTodayFocus() {
  const box = $("todayFocus");
  if (!box) return;

  const today = getTodayString();

  const todayGames = filteredGames.filter(g => g.date === today);
  const upcoming = filteredGames.filter(g => g.date >= today);
  const focus = todayGames.length ? todayGames : upcoming.slice(0, 3);

  if (!focus.length) {
    box.innerHTML = `
      <div class="schedule-empty">
        <strong>目前沒有符合條件的近期賽事</strong>
        <span>可以清除篩選或查看完整賽程。</span>
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="schedule-focus-grid">
      ${focus.slice(0, 3).map(renderFocusCard).join("")}
    </div>
  `;
}

function renderFocusCard(game) {
  return `
    <article class="schedule-focus-card">
      <div class="schedule-focus-date">${escapeHtml(game.date)}｜${escapeHtml(game.time || "時間未定")}</div>
      <div class="schedule-focus-match">
        <strong>${escapeHtml(game.away || "客隊")}</strong>
        <span>vs</span>
        <strong>${escapeHtml(game.home || "主隊")}</strong>
      </div>
      <div class="schedule-focus-meta">
        <span>🏟 ${escapeHtml(game.venue || "球場待定")}</span>
        <span>🏷 ${escapeHtml(getTypeText(game.type))}</span>
        <span>📌 ${escapeHtml(getStatusText(game.status))}</span>
      </div>
      <div class="schedule-focus-actions">
        <a class="card-link" href="${buildMatchUrl(game)}">比賽中心</a>
      </div>
    </article>
  `;
}

function renderSummary() {
  const box = $("scheduleSummary");
  if (!box) return;

  const total = filteredGames.length;
  const live = filteredGames.filter(g => g.status === "live").length;
  const final = filteredGames.filter(g => g.status === "final").length;
  const scheduled = filteredGames.filter(g => g.status === "scheduled").length;
  const venues = unique(filteredGames.map(g => g.venue).filter(Boolean)).length;

  box.innerHTML = `
    <div class="schedule-summary-grid">
      <div class="schedule-summary-item">
        <span>目前顯示</span>
        <strong>${total}</strong>
      </div>
      <div class="schedule-summary-item">
        <span>LIVE</span>
        <strong>${live}</strong>
      </div>
      <div class="schedule-summary-item">
        <span>已結束</span>
        <strong>${final}</strong>
      </div>
      <div class="schedule-summary-item">
        <span>未開賽</span>
        <strong>${scheduled}</strong>
      </div>
      <div class="schedule-summary-item">
        <span>場地數</span>
        <strong>${venues}</strong>
      </div>
    </div>
  `;
}

function renderMode() {
  const list = $("listSection");
  const cal = $("calendarSection");

  if (list) list.classList.toggle("is-hidden", currentMode !== "list");
  if (cal) cal.classList.toggle("is-hidden", currentMode !== "calendar");

  document.querySelectorAll(".schedule-toolbar button").forEach(btn => {
    if (btn.id === "btnListMode") btn.classList.toggle("active", currentMode === "list");
    if (btn.id === "btnCalendarMode") btn.classList.toggle("active", currentMode === "calendar");
  });

  if (currentMode === "calendar") {
    renderCalendar();
  } else {
    renderList();
  }
}

function renderList() {
  const box = $("scheduleList");
  if (!box) return;

  if (!filteredGames.length) {
    box.innerHTML = `
      <div class="schedule-empty">
        <strong>目前沒有符合條件的賽程</strong>
        <span>請調整篩選條件。</span>
      </div>
    `;
    return;
  }

  const grouped = groupByDate(filteredGames);

  box.innerHTML = Object.entries(grouped).map(([date, games]) => `
    <section class="schedule-date-group">
      <div class="schedule-date-head">
        <h3>${escapeHtml(date)}（${escapeHtml(getWeekday(date))}）</h3>
        <span>${games.length} 場</span>
      </div>

      <div class="schedule-game-grid">
        ${games.map(renderGameCard).join("")}
      </div>
    </section>
  `).join("");
}

function renderGameCard(game) {
  const awayLogo = getTeamLogo(game.awayId);
  const homeLogo = getTeamLogo(game.homeId);
  const scoreText = hasScore(game)
    ? `${formatScore(game.awayR)} : ${formatScore(game.homeR)}`
    : "VS";

  return `
    <article class="schedule-game-card status-${escapeHtml(game.status)}">
      <div class="schedule-game-top">
        <span class="schedule-game-no">G${escapeHtml(game.gameSno || "—")}</span>
        <span class="schedule-game-status">${escapeHtml(getStatusText(game.status))}</span>
      </div>

      <div class="schedule-game-main">
        <div class="schedule-team away">
          <img src="${awayLogo}" alt="${escapeHtml(game.away)}">
          <strong>${escapeHtml(game.away || "客隊")}</strong>
        </div>

        <div class="schedule-score-box">
          <span>${escapeHtml(scoreText)}</span>
          <small>${escapeHtml(game.time || "時間未定")}</small>
        </div>

        <div class="schedule-team home">
          <img src="${homeLogo}" alt="${escapeHtml(game.home)}">
          <strong>${escapeHtml(game.home || "主隊")}</strong>
        </div>
      </div>

      <div class="schedule-game-meta">
        <span>🏟 ${escapeHtml(game.venue || "球場待定")}</span>
        <span>🏷 ${escapeHtml(getTypeText(game.type))}</span>
      </div>

      <div class="schedule-game-actions">
        <a class="card-link" href="${buildMatchUrl(game)}">比賽中心</a>
      </div>
    </article>
  `;
}

function renderCalendar() {
  const grid = $("calendarGrid");
  const title = $("calendarTitle");
  if (!grid) return;

  const month = getValue("monthSelect", "ALL") !== "ALL"
    ? getValue("monthSelect", "ALL")
    : getBestCalendarMonth();

  if (title) title.textContent = month ? `${month} 月曆` : "月曆模式";

  if (!month) {
    grid.innerHTML = `<div class="schedule-empty">沒有可顯示的月份。</div>`;
    return;
  }

  const [year, m] = month.split("-").map(Number);
  const first = new Date(year, m - 1, 1);
  const last = new Date(year, m, 0);

  const gamesByDate = groupByDate(filteredGames.filter(g => String(g.date).slice(0, 7) === month));

  const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
  const cells = [];

  weekdayNames.forEach(w => {
    cells.push(`<div class="calendar-weekday">${w}</div>`);
  });

  for (let i = 0; i < first.getDay(); i++) {
    cells.push(`<div class="calendar-day is-empty"></div>`);
  }

  for (let day = 1; day <= last.getDate(); day++) {
    const dateStr = `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const games = gamesByDate[dateStr] || [];

    cells.push(`
      <div class="calendar-day ${games.length ? "has-game" : ""}">
        <div class="calendar-day-num">${day}</div>
        <div class="calendar-day-games">
          ${
            games.length
              ? games.map(g => `
                <a href="${buildMatchUrl(g)}" class="calendar-game-pill">
                  ${escapeHtml(g.away)} vs ${escapeHtml(g.home)}
                </a>
              `).join("")
              : `<span class="calendar-no-game">—</span>`
          }
        </div>
      </div>
    `);
  }

  grid.innerHTML = `<div class="calendar-grid-inner">${cells.join("")}</div>`;
}

function getBestCalendarMonth() {
  if (filteredGames.length) {
    const today = getTodayString();
    const future = filteredGames.find(g => g.date >= today);
    return String((future || filteredGames[0]).date).slice(0, 7);
  }

  if (allGames.length) return String(allGames[0].date).slice(0, 7);

  return "";
}


/* =========================
   下載賽程表 CSV / ICS
========================= */

function renderDownloadHint() {
  const hint = $("scheduleDownloadHint");
  if (!hint) return;

  const team = getValue("teamSelect", "ALL");
  const teamName = team !== "ALL" ? (TEAM_NAME_MAP[team] || team) : "全部球隊";

  hint.textContent =
    `目前可下載 ${filteredGames.length} 場賽程｜範圍：${teamName}｜依目前篩選條件輸出。`;
}

function downloadScheduleCsv() {
  const games = [...filteredGames].sort(sortGames);

  if (!games.length) {
    alert("目前沒有可下載的賽程。");
    return;
  }

  const headers = [
    "gameSno",
    "日期",
    "時間",
    "客隊",
    "主隊",
    "球場",
    "賽程別",
    "狀態",
    "客隊分數",
    "主隊分數",
    "比分",
    "客隊H",
    "主隊H",
    "客隊E",
    "主隊E",
    "比賽中心"
  ];

  const rows = games.map(game => [
    game.gameSno || "",
    game.date || "",
    game.time || "",
    game.away || "",
    game.home || "",
    game.venue || "",
    getTypeText(game.type),
    getStatusText(game.status),
    formatCsvScore(game.awayR),
    formatCsvScore(game.homeR),
    hasScore(game) ? `${formatCsvScore(game.awayR)}:${formatCsvScore(game.homeR)}` : "VS",
    formatCsvScore(game.awayH),
    formatCsvScore(game.homeH),
    formatCsvScore(game.awayE),
    formatCsvScore(game.homeE),
    buildAbsoluteUrl(buildMatchUrl(game))
  ]);

  const csv = [
    headers,
    ...rows
  ].map(row => row.map(csvCell).join(",")).join("\r\n");

  const filename = buildScheduleDownloadFilename("csv");

  // UTF-8 BOM：避免 Excel 中文亂碼。
  downloadBlob(`\ufeff${csv}`, filename, "text/csv;charset=utf-8");
}

function downloadScheduleIcs() {
  const games = [...filteredGames].sort(sortGames);

  if (!games.length) {
    alert("目前沒有可下載的賽程。");
    return;
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ray CPBL Data Site//Schedule Export//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Ray CPBL Schedule"
  ];

  games.forEach(game => {
    const start = buildIcsDateTime(game.date, game.time || "18:35");
    const end = buildIcsEndDateTime(game.date, game.time || "18:35", 3);

    const summary = `${game.away || "客隊"} vs ${game.home || "主隊"}`;
    const desc = [
      `賽程別：${getTypeText(game.type)}`,
      `狀態：${getStatusText(game.status)}`,
      `場次：${game.gameSno || "—"}`,
      hasScore(game) ? `比分：${formatScore(game.awayR)}:${formatScore(game.homeR)}` : "",
      `比賽中心：${buildAbsoluteUrl(buildMatchUrl(game))}`
    ].filter(Boolean).join("\\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:cpbl-${game.date}-${game.gameSno || `${game.awayId}-${game.homeId}`}@ray-cpbl-data-site`,
      `DTSTAMP:${toIcsUtc(new Date())}`,
      `DTSTART;TZID=Asia/Taipei:${start}`,
      `DTEND;TZID=Asia/Taipei:${end}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `LOCATION:${escapeIcsText(game.venue || "")}`,
      `DESCRIPTION:${escapeIcsText(desc)}`,
      `URL:${buildAbsoluteUrl(buildMatchUrl(game))}`,
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");

  const filename = buildScheduleDownloadFilename("ics");
  downloadBlob(lines.join("\r\n"), filename, "text/calendar;charset=utf-8");
}

function buildScheduleDownloadFilename(ext) {
  const team = getValue("teamSelect", "ALL");
  const month = getValue("monthSelect", "ALL");
  const date = getValue("dateSelect", "");

  const scope = team !== "ALL"
    ? team
    : date
      ? date
      : month !== "ALL"
        ? month
        : "all";

  return `cpbl-schedule-2026-${scope}.${ext}`;
}

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function formatCsvScore(value) {
  return value === null || value === undefined || value === "" ? "" : String(value);
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function buildAbsoluteUrl(relativeUrl) {
  return new URL(relativeUrl, location.href).href;
}

function buildIcsDateTime(dateText, timeText) {
  const date = String(dateText || "").replaceAll("-", "");
  const [hour = "00", minute = "00"] = String(timeText || "00:00").split(":");

  return `${date}T${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}00`;
}

function buildIcsEndDateTime(dateText, timeText, addHours = 3) {
  const [y, m, d] = String(dateText || "").split("-").map(Number);
  const [hh, mm] = String(timeText || "00:00").split(":").map(Number);

  if (!y || !m || !d) return buildIcsDateTime(dateText, timeText);

  const start = new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0);
  start.setHours(start.getHours() + addHours);

  const yy = start.getFullYear();
  const mo = String(start.getMonth() + 1).padStart(2, "0");
  const dd = String(start.getDate()).padStart(2, "0");
  const h = String(start.getHours()).padStart(2, "0");
  const mi = String(start.getMinutes()).padStart(2, "0");

  return `${yy}${mo}${dd}T${h}${mi}00`;
}

function toIcsUtc(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "");
}

/* =========================
   小工具
========================= */

function groupByDate(games) {
  return games.reduce((acc, game) => {
    if (!acc[game.date]) acc[game.date] = [];
    acc[game.date].push(game);
    return acc;
  }, {});
}

function unique(arr) {
  return [...new Set(arr.filter(v => v !== null && v !== undefined && v !== ""))];
}

function getTypeText(type) {
  return TYPE_TEXT[type] || type || "例行賽";
}

function getStatusText(status) {
  return STATUS_TEXT[status] || status || "未開賽";
}

function getTeamLogo(teamId) {
  return TEAM_NAME_MAP[teamId]
    ? `assets/logo/${teamId}.png`
    : "assets/logo/cpbl.png";
}

function buildMatchUrl(game) {
  if (game.gameSno) {
    return `match.html?gameSno=${encodeURIComponent(game.gameSno)}`;
  }

  return `match.html?date=${encodeURIComponent(game.date)}&home=${encodeURIComponent(game.home)}&away=${encodeURIComponent(game.away)}`;
}

function hasScore(game) {
  return game.awayR !== null || game.homeR !== null;
}

function formatScore(v) {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

function getWeekday(dateStr) {
  const date = new Date(`${dateStr}T00:00:00+08:00`);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return weekdays[date.getDay()] || "";
}

function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getValue(id, fallback = "") {
  const el = $(id);
  if (!el) return fallback;
  return el.value ?? fallback;
}

function setValue(id, value) {
  const el = $(id);
  if (el) el.value = value;
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function renderLoadEmpty() {
  setText("scheduleDataStatus", "⚠️ 沒有讀到任何賽程資料。");
  const list = $("scheduleList");
  if (list) {
    list.innerHTML = `<div class="schedule-empty">目前沒有賽程資料。</div>`;
  }
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
