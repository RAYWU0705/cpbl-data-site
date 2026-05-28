/* =========================
   search.js
   全站搜尋 v1
========================= */

const TEAM_DATA_URL = "data/teams.json";
const LIVE_BOX_URL = "data/live/live-boxscore.json";

const SCHEDULE_MONTHS = [
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09"
];

const TEAM_ALIAS = {
  brothers: ["中信兄弟", "兄弟", "中信", "brothers"],
  lions: ["統一7-ELEVEn獅", "統一", "統一獅", "獅", "lions"],
  monkeys: ["樂天桃猿", "樂天", "桃猿", "猿", "monkeys"],
  dragons: ["味全龍", "味全", "龍", "dragons"],
  guardians: ["富邦悍將", "富邦", "悍將", "guardians"],
  hawks: ["台鋼雄鷹", "台鋼", "雄鷹", "hawks"]
};

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const searchStatus = document.getElementById("searchStatus");
const searchResults = document.getElementById("searchResults");

let teams = [];
let schedules = [];
let liveGames = [];

initSearch();

async function initSearch() {
  const params = new URLSearchParams(location.search);
  const q = params.get("q") || "";

  searchInput.value = q;

  setStatus("資料載入中…");

  await loadAllData();

  setStatus("資料載入完成，請輸入關鍵字。");

  bindEvents();

  if (q.trim()) {
    runSearch(q.trim());
  }
}

function bindEvents() {
  searchBtn.addEventListener("click", () => {
    const q = searchInput.value.trim();
    runSearch(q);
  });

  searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      runSearch(searchInput.value.trim());
    }
  });
}

async function loadAllData() {
  const [teamData, liveData, ...scheduleData] = await Promise.all([
    fetchJson(TEAM_DATA_URL),
    fetchJson(LIVE_BOX_URL),
    ...SCHEDULE_MONTHS.map(month => fetchJson(`data/schedule-${month}.json`))
  ]);

  teams = Array.isArray(teamData) ? teamData : [];
  liveGames = toArray(liveData);
  schedules = scheduleData.flatMap(data => Array.isArray(data) ? data : []);
}

async function fetchJson(url) {
  try {
    const res = await fetch(`${url}?ts=${Date.now()}`, {
      cache: "no-store"
    });

    if (!res.ok) return [];

    return await res.json();
  } catch {
    return [];
  }
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function runSearch(q) {
  const query = normalize(q);

  if (!query) {
    searchResults.innerHTML = `<div class="empty-box">請輸入關鍵字。</div>`;
    setStatus("請輸入關鍵字。");
    return;
  }

  const results = [
    ...searchTeams(query),
    ...searchSchedules(query),
    ...searchLiveGames(query)
  ];

  setStatus(`搜尋「${escapeHtml(q)}」：找到 ${results.length} 筆結果。`);
  renderResults(results);
}

function searchTeams(query) {
  return teams
    .filter(team => {
      const id = normalize(team.id);
      const name = normalize(team.name);
      const home = normalize(team.home);

      const alias = TEAM_ALIAS[team.id] || [];
      const aliasText = normalize(alias.join(" "));

      return (
        id.includes(query) ||
        name.includes(query) ||
        home.includes(query) ||
        aliasText.includes(query)
      );
    })
    .map(team => ({
      type: "team",
      title: team.name,
      subtitle: `球隊｜主場：${team.home || "資料待補"}`,
      href: `team.html?team=${encodeURIComponent(team.id)}`,
      badge: "球隊"
    }));
}

function searchSchedules(query) {
  return schedules
    .filter(game => {
      const text = normalize([
        game.gameSno,
        game.id,
        game.date,
        game.time,
        game.venue,
        game.type,
        game.status,
        game.teams?.home,
        game.teams?.away,
        game.home,
        game.away
      ].join(" "));

      return text.includes(query);
    })
    .slice(0, 80)
    .map(game => {
      const home = game.teams?.home || game.home || "—";
      const away = game.teams?.away || game.away || "—";
      const gameSno = game.gameSno || game.id || "";

      return {
        type: "schedule",
        title: `${away} vs ${home}`,
        subtitle: `${game.date || "日期未定"}｜${game.time || "時間未定"}｜${game.venue || "球場待定"}`,
        href: gameSno
          ? `match.html?gameSno=${encodeURIComponent(gameSno)}`
          : `schedule.html?date=${encodeURIComponent(game.date || "")}`,
        badge: "賽程"
      };
    });
}

function searchLiveGames(query) {
  return liveGames
    .filter(game => {
      const meta = game.meta || {};

      const text = normalize([
        game.gameSno,
        meta.date,
        meta.time,
        meta.venue,
        meta.status,
        meta.statusText,
        meta.type,
        meta.typeText,
        meta.home,
        meta.away,
        meta.win,
        meta.lose,
        meta.save,
        meta.mvp
      ].join(" "));

      return text.includes(query);
    })
    .slice(0, 80)
    .map(game => {
      const meta = game.meta || {};
      const gameSno = game.gameSno || "";

      return {
        type: "match",
        title: `${meta.away || "—"} vs ${meta.home || "—"}`,
        subtitle: `${meta.date || "日期未定"}｜${meta.statusText || meta.status || "狀態未定"}｜${meta.venue || "球場待定"}`,
        href: gameSno
          ? `match.html?gameSno=${encodeURIComponent(gameSno)}`
          : "#",
        badge: "比賽中心"
      };
    });
}

function renderResults(results) {
  if (!results.length) {
    searchResults.innerHTML = `<div class="empty-box">找不到符合的結果。</div>`;
    return;
  }

  const grouped = groupBy(results, item => item.type);

  searchResults.innerHTML = `
    ${renderGroup("球隊", grouped.team)}
    ${renderGroup("賽程", grouped.schedule)}
    ${renderGroup("比賽中心", grouped.match)}
  `;
}

function renderGroup(title, items = []) {
  if (!items.length) return "";

  return `
    <div class="search-group">
      <h3>${escapeHtml(title)}</h3>

      <div class="search-result-list">
        ${items.map(item => `
          <a class="mini-game-card search-result-item" href="${item.href}">
            <span class="badge">${escapeHtml(item.badge)}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <div class="muted">${escapeHtml(item.subtitle)}</div>
          </a>
        `).join("")}
      </div>
    </div>
  `;
}

function groupBy(arr, fn) {
  return arr.reduce((map, item) => {
    const key = fn(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
    return map;
  }, {});
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace("7-eleven", "7-eleven")
    .replace(/\s+/g, "")
    .trim();
}

function setStatus(text) {
  searchStatus.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}