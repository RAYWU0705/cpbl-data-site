export function initTeam() {
/* =========================
   team.js（完整可跑版）
   ========================= */

// 1️⃣ 讀取 team 參數
const params = new URLSearchParams(location.search);
const teamId = params.get("team");

if (!teamId) {
  alert("缺少 team 參數");
  throw new Error("missing team");
}

// 2️⃣ DOM
const pageTitle = document.getElementById("pageTitle");
const pageSub   = document.getElementById("pageSub");
const teamBox   = document.getElementById("teamDetail");
const nextBox   = document.querySelector("#nextGame .next-content");
const recentBox = document.querySelector("#recentGames .next-content");

// 3️⃣ 全域資料
let teamsData = [];
let gamesData = [];

// 4️⃣ 載入資料
Promise.all([
  fetch("data/teams.json").then(r => r.json()),
  fetch("data/schedule-2026-03.json").then(r => r.json())
]).then(([teams, games]) => {
  teamsData = teams;
  gamesData = games;
  renderTeamPage();
}).catch(err => {
  console.error(err);
  alert("資料載入失敗，請檢查 JSON");
});

// =========================
// 核心渲染
// =========================
function renderTeamPage() {
  const team = teamsData.find(t => t.id === teamId);
  if (!team) {
    teamBox.innerHTML = "<p style='color:red;'>找不到球隊</p>";
    return;
  }

  // Header
  pageTitle.textContent = team.name;
  pageSub.textContent = `${team.city}｜${team.home}`;

  // 球隊資訊卡
  teamBox.innerHTML = `
    <div class="team-detail-card">
      <img src="assets/logo/${team.id}.png" class="team-logo-xl">
      <h2>${team.name}</h2>
      <ul class="team-meta">
        <li>📍 城市：${team.city}</li>
        <li>🏟️ 主場：${team.home}</li>
        <li>📅 成立：${team.founded}</li>
      </ul>
    </div>
  `;

  renderNextGame(team.id);
  renderRecentGames(team.id);
}

// =========================
// 工具
// =========================
function teamName(id) {
  const t = teamsData.find(x => x.id === id);
  return t ? t.name : id;
}

function highlight(id) {
  if (id === teamId) {
    return `<span style="
      background: #ffe600;
      color: #c40000;
      font-weight: 900;
      padding: 2px 6px;
      border-radius: 4px;
    ">${teamName(id)}</span>`;
  }
  return teamName(id);
}

// =========================
// 下一場比賽
// =========================
function renderNextGame(id) {
  const today = new Date().toISOString().slice(0, 10);

  const game = gamesData
    .filter(g =>
      (g.home === id || g.away === id) &&
      g.date >= today
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (!game) {
    nextBox.textContent = "目前沒有下一場比賽";
    return;
  }

  nextBox.innerHTML = `
    📅 ${game.date}<br>
    ${highlight(game.home)} vs ${highlight(game.away)}<br>
    ⏰ ${game.time || "時間未定"}
  `;
}

// =========================
// 近期 3 場
// =========================
function renderRecentGames(id) {
  const today = new Date().toISOString().slice(0, 10);

  const list = gamesData
    .filter(g =>
      (g.home === id || g.away === id) &&
      g.date < today
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  if (list.length === 0) {
    recentBox.textContent = "尚無近期賽程";
    return;
  }

  recentBox.innerHTML = list.map(g => `
    📅 ${g.date} ｜ ${highlight(g.home)} vs ${highlight(g.away)}
  `).join("<br>");
}
}