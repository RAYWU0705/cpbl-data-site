console.log("✅ farm-schedule.js v5.2.1-FARM-SCHEDULE-LINK-TO-MATCH 已載入");

/* =========================================================
   Ray's CPBL Data Site
   Farm Schedule v5.2.1-FARM-SCHEDULE-LINK-TO-MATCH

   旁路靜態系統：
   - 讀取 data/farm/farm-schedule-2026.json
   - 不讀 live-boxscore.json
   - 不動 PREGAME / LIVE / FINAL
   - 不寫檔、不污染主資料
========================================================= */

const VERSION = "v5.2.1-FARM-SCHEDULE-LINK-TO-MATCH";
const FARM_SCHEDULE_URL = "data/farm/farm-schedule-2026.json";

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

const FARM_TEAMS = [
  "中信兄弟二軍",
  "統一7-ELEVEn獅二軍",
  "樂天桃猿二軍",
  "味全龍二軍",
  "富邦悍將二軍",
  "台鋼雄鷹二軍"
];

const STATUS_TEXT = {
  scheduled: "未開賽",
  live: "比賽中",
  final: "已結束",
  postponed: "延賽",
  cancelled: "取消",
  suspended: "保留比賽"
};

let allFarmGames = [];
let filteredFarmGames = [];

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", initFarmSchedule);

async function initFarmSchedule() {
  bindEvents();

  try {
    setText("farmDataStatus", "資料載入中…");

    allFarmGames = await loadFarmSchedule();

    buildFilterOptions();
    applyFilters();

    setText(
      "farmDataStatus",
      `✅ 已載入 ${allFarmGames.length} 場二軍賽程｜${VERSION}`
    );
  } catch (err) {
    console.error("❌ 二軍賽程載入失敗：", err);
    setText("farmDataStatus", `⚠️ 二軍賽程載入失敗：${err.message}`);

    const list = $("farmScheduleList");
    if (list) {
      list.innerHTML = `
        <div class="farm-empty">
          無法讀取 data/farm/farm-schedule-2026.json。<br>
          請先建立資料檔，或確認路徑是否正確。
        </div>
      `;
    }
  }
}

async function loadFarmSchedule() {
  const res = await fetch(`${FARM_SCHEDULE_URL}?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();

  return toArray(data)
    .map(normalizeFarmGame)
    .filter(g => g && g.date && (g.home || g.away))
    .sort(sortFarmGames);
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.games)) return data.games;
  if (Array.isArray(data?.data)) return data.data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function normalizeFarmGame(raw) {
  if (!raw || typeof raw !== "object") return null;

  const away = cleanText(raw.away || raw.awayTeam || raw.AwayTeamName || "");
  const home = cleanText(raw.home || raw.homeTeam || raw.HomeTeamName || "");

  return {
    raw,
    gameSno: cleanText(raw.gameSno || raw.gameNo || raw.id || ""),
    date: cleanText(raw.date || raw.gameDate || ""),
    time: cleanText(raw.time || raw.gameTime || ""),
    away,
    home,
    awayId: toTeamId(away),
    homeId: toTeamId(home),
    venue: cleanText(raw.venue || raw.stadium || raw.place || ""),
    status: normalizeStatus(raw.status || raw.statusText || "scheduled"),
    awayScore: toNumberOrNull(raw.awayScore ?? raw.awayR ?? raw.score?.away),
    homeScore: toNumberOrNull(raw.homeScore ?? raw.homeR ?? raw.score?.home),
    type: cleanText(raw.type || "farm"),
    note: cleanText(raw.note || raw.statusText || "")
  };
}

function normalizeStatus(value) {
  const s = cleanText(value).toLowerCase();
  const raw = cleanText(value);

  if (["live", "ingame", "in_progress"].includes(s)) return "live";
  if (["final", "finished"].includes(s)) return "final";
  if (["postponed"].includes(s)) return "postponed";
  if (["cancelled", "canceled"].includes(s)) return "cancelled";
  if (["suspended"].includes(s)) return "suspended";

  if (/比賽中|進行中|live|局上|局下/i.test(raw)) return "live";
  if (/結束|完賽|final/i.test(raw)) return "final";
  if (/延賽/.test(raw)) return "postponed";
  if (/取消/.test(raw)) return "cancelled";
  if (/保留/.test(raw)) return "suspended";

  return "scheduled";
}

function toTeamId(team) {
  return TEAM_ID_MAP[team] || "";
}

function sortFarmGames(a, b) {
  const d = String(a.date).localeCompare(String(b.date));
  if (d !== 0) return d;

  const t = String(a.time || "99:99").localeCompare(String(b.time || "99:99"));
  if (t !== 0) return t;

  return String(a.gameSno || "").localeCompare(String(b.gameSno || ""));
}

function buildFilterOptions() {
  fillMonthOptions();
  fillTeamOptions();
  fillVenueOptions();
}

function fillMonthOptions() {
  const select = $("farmMonthSelect");
  if (!select) return;

  const months = unique(allFarmGames.map(g => String(g.date).slice(0, 7)).filter(Boolean));

  select.innerHTML = `<option value="ALL">全部月份</option>` +
    months.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
}

function fillTeamOptions() {
  const select = $("farmTeamSelect");
  if (!select) return;

  const teams = unique([
    ...FARM_TEAMS,
    ...allFarmGames.flatMap(g => [g.away, g.home]).filter(Boolean)
  ]);

  select.innerHTML = `<option value="ALL">全部球隊</option>` +
    teams.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
}

function fillVenueOptions() {
  const select = $("farmVenueSelect");
  if (!select) return;

  const venues = unique(allFarmGames.map(g => g.venue).filter(Boolean));

  select.innerHTML = `<option value="ALL">全部場地</option>` +
    venues.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function bindEvents() {
  [
    "farmMonthSelect",
    "farmDateSelect",
    "farmTeamSelect",
    "farmVenueSelect",
    "farmStatusSelect",
    "farmSearchInput"
  ].forEach(id => {
    const el = $(id);
    if (!el) return;

    const eventName = el.tagName === "INPUT" ? "input" : "change";
    el.addEventListener(eventName, applyFilters);
  });

  const reset = $("btnResetFarmFilter");
  if (reset) {
    reset.addEventListener("click", () => {
      setValue("farmMonthSelect", "ALL");
      setValue("farmDateSelect", "");
      setValue("farmTeamSelect", "ALL");
      setValue("farmVenueSelect", "ALL");
      setValue("farmStatusSelect", "ALL");
      setValue("farmSearchInput", "");
      applyFilters();
    });
  }

  const reload = $("btnReloadFarm");
  if (reload) {
    reload.addEventListener("click", async () => {
      reload.disabled = true;
      reload.textContent = "重新載入中…";

      try {
        allFarmGames = await loadFarmSchedule();
        buildFilterOptions();
        applyFilters();
        setText("farmDataStatus", `✅ 已重新載入 ${allFarmGames.length} 場二軍賽程｜${VERSION}`);
      } finally {
        reload.disabled = false;
        reload.textContent = "重新載入";
      }
    });
  }

  const download = $("btnDownloadFarmCsv");
  if (download) {
    download.addEventListener("click", downloadFarmCsv);
  }

  const scheduleList = $("farmScheduleList");
  if (scheduleList && scheduleList.dataset.matchLinkBound !== "1") {
    scheduleList.dataset.matchLinkBound = "1";

    scheduleList.addEventListener("click", event => {
      const card = event.target.closest(".farm-game-card[data-match-url]");
      if (!card) return;

      location.href = card.dataset.matchUrl;
    });

    scheduleList.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;

      const card = event.target.closest(".farm-game-card[data-match-url]");
      if (!card) return;

      event.preventDefault();
      location.href = card.dataset.matchUrl;
    });
  }

}

function applyFilters() {
  const month = getValue("farmMonthSelect", "ALL");
  const date = getValue("farmDateSelect", "");
  const team = getValue("farmTeamSelect", "ALL");
  const venue = getValue("farmVenueSelect", "ALL");
  const status = getValue("farmStatusSelect", "ALL");
  const search = getValue("farmSearchInput", "").toLowerCase();

  filteredFarmGames = allFarmGames.filter(game => {
    if (month !== "ALL" && String(game.date).slice(0, 7) !== month) return false;
    if (date && game.date !== date) return false;
    if (team !== "ALL" && game.home !== team && game.away !== team) return false;
    if (venue !== "ALL" && game.venue !== venue) return false;
    if (status !== "ALL" && game.status !== status) return false;

    if (search) {
      const haystack = [
        game.gameSno,
        game.date,
        game.time,
        game.away,
        game.home,
        game.venue,
        getStatusText(game.status),
        game.note
      ].join(" ").toLowerCase();

      if (!haystack.includes(search)) return false;
    }

    return true;
  });

  renderAll();
}

function renderAll() {
  renderSummary();
  renderScheduleList();
}

function renderSummary() {
  const total = filteredFarmGames.length;
  const scheduled = filteredFarmGames.filter(g => g.status === "scheduled").length;
  const final = filteredFarmGames.filter(g => g.status === "final").length;
  const special = filteredFarmGames.filter(g => g.status === "postponed" || g.status === "cancelled").length;

  setText("farmTotalCount", total);
  setText("farmScheduledCount", scheduled);
  setText("farmFinalCount", final);
  setText("farmSpecialCount", special);

  const hint = $("farmListHint");
  if (hint) {
    hint.textContent = `目前顯示 ${total} 場｜全部資料 ${allFarmGames.length} 場`;
  }
}

function renderScheduleList() {
  const box = $("farmScheduleList");
  if (!box) return;

  if (!filteredFarmGames.length) {
    box.innerHTML = `
      <div class="farm-empty">
        目前沒有符合條件的二軍賽程。<br>
        如果資料檔還是空陣列，這是正常的。
      </div>
    `;
    return;
  }

  const grouped = groupByDate(filteredFarmGames);

  box.innerHTML = Object.entries(grouped).map(([date, games]) => `
    <section class="farm-date-group">
      <div class="farm-date-head">
        <h3>${escapeHtml(date)}（${escapeHtml(getWeekday(date))}）</h3>
        <span>${games.length} 場</span>
      </div>

      <div class="farm-game-grid">
        ${games.map(renderFarmGameCard).join("")}
      </div>
    </section>
  `).join("");
}

function renderFarmGameCard(game) {
  const awayLogo = getTeamLogo(game.away);
  const homeLogo = getTeamLogo(game.home);
  const hasScore = game.awayScore !== null || game.homeScore !== null;
  const scoreText = hasScore
    ? `${formatScore(game.awayScore)} : ${formatScore(game.homeScore)}`
    : "VS";

  const matchUrl = buildFarmMatchUrl(game);

  return `
    <article
      class="farm-game-card"
      role="link"
      tabindex="0"
      data-match-url="${escapeHtml(matchUrl)}"
      title="開啟二軍比賽中心"
    >
      <div class="farm-game-top">
        <span class="farm-game-no">${escapeHtml(game.gameSno || "—")}</span>
        <span class="farm-game-status status-${escapeHtml(game.status)}">${escapeHtml(getStatusText(game.status))}</span>
      </div>

      <div class="farm-match">
        <div class="farm-team">
          <img src="${awayLogo}" alt="${escapeHtml(game.away)}">
          <strong>${escapeHtml(game.away || "客隊")}</strong>
        </div>

        <div class="farm-score">
          <strong>${escapeHtml(scoreText)}</strong>
          <span>${escapeHtml(game.time || "時間未定")}</span>
        </div>

        <div class="farm-team">
          <img src="${homeLogo}" alt="${escapeHtml(game.home)}">
          <strong>${escapeHtml(game.home || "主隊")}</strong>
        </div>
      </div>

      <div class="farm-meta">
        <span>🏟 ${escapeHtml(game.venue || "球場待定")}</span>
        <span>🏷 二軍賽程</span>
        <span>🔎 開啟比賽中心</span>
        ${game.note ? `<span>📝 ${escapeHtml(game.note)}</span>` : ""}
      </div>
    </article>
  `;
}


function buildFarmMatchUrl(game) {
  const params = new URLSearchParams();

  params.set("gameSno", game.gameSno || "");
  params.set("date", game.date || "");

  return `farm-match.html?${params.toString()}`;
}

function downloadFarmCsv() {
  const games = [...filteredFarmGames].sort(sortFarmGames);

  if (!games.length) {
    alert("目前沒有可下載的二軍賽程。");
    return;
  }

  const headers = [
    "gameSno",
    "日期",
    "時間",
    "客隊",
    "主隊",
    "球場",
    "狀態",
    "客隊分數",
    "主隊分數",
    "備註"
  ];

  const rows = games.map(g => [
    g.gameSno,
    g.date,
    g.time,
    g.away,
    g.home,
    g.venue,
    getStatusText(g.status),
    formatCsvScore(g.awayScore),
    formatCsvScore(g.homeScore),
    g.note
  ]);

  const csv = [
    headers,
    ...rows
  ].map(row => row.map(csvCell).join(",")).join("\r\n");

  downloadBlob(`\ufeff${csv}`, buildFarmCsvFilename(), "text/csv;charset=utf-8");
}

function buildFarmCsvFilename() {
  const team = getValue("farmTeamSelect", "ALL");
  const month = getValue("farmMonthSelect", "ALL");
  const date = getValue("farmDateSelect", "");

  const scope = team !== "ALL"
    ? cleanFilename(team)
    : date
      ? date
      : month !== "ALL"
        ? month
        : "all";

  return `cpbl-farm-schedule-2026-${scope}.csv`;
}

function getTeamLogo(team) {
  const id = toTeamId(team);
  return id ? `assets/logo/${id}.png` : "assets/logo/cpbl.png";
}

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

function getStatusText(status) {
  return STATUS_TEXT[status] || status || "未開賽";
}

function getWeekday(dateStr) {
  const date = new Date(`${dateStr}T00:00:00+08:00`);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return weekdays[date.getDay()] || "";
}

function formatScore(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatCsvScore(value) {
  return value === null || value === undefined || value === "" ? "" : String(value);
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
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

function cleanFilename(value) {
  return cleanText(value)
    .replaceAll("/", "-")
    .replaceAll("\\", "-")
    .replaceAll(" ", "");
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
