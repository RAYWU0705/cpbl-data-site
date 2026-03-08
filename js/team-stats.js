/* =========================
   team-stats.js（穩定版）
   ========================= */

const TEAM_NAME_MAP = {
  brothers: "中信兄弟",
  lions: "統一7-ELEVEn獅",
  monkeys: "樂天桃猿",
  dragons: "味全龍",
  guardians: "富邦悍將",
  hawks: "台鋼雄鷹"
};

// 已完成 3～8 月
const MONTHS = ["2026-03","2026-04","2026-05","2026-06","2026-07","2026-08"];

function getParam(name){
  return new URL(location.href).searchParams.get(name);
}

function teamIdToName(id){
  return TEAM_NAME_MAP[id] || id;
}

function nameToTeamId(name){
  for (const [id, n] of Object.entries(TEAM_NAME_MAP)) {
    if (n === name) return id;
  }
  return null;
}

// teams.home / away 可能是 teamId 或中文
function normalizeTeamValue(v){
  if (!v) return null;
  if (TEAM_NAME_MAP[v]) return v;
  const id = nameToTeamId(v);
  return id || v;
}

function normalizeGame(g){
  const home = normalizeTeamValue(g?.teams?.home);
  const away = normalizeTeamValue(g?.teams?.away);
  return { ...g, teams: { home, away } };
}

function hasScore(g){
  return typeof g.homeScore === "number" && typeof g.awayScore === "number";
}

function isGameOfTeam(g, teamId){
  return g?.teams?.home === teamId || g?.teams?.away === teamId;
}

function resultForTeam(g, teamId){
  if (!hasScore(g)) return null;

  const isHome = g.teams.home === teamId;
  const my  = isHome ? g.homeScore : g.awayScore;
  const opp = isHome ? g.awayScore : g.homeScore;

  if (my > opp) return "W";
  if (my < opp) return "L";
  return "T";
}

function $(id){ return document.getElementById(id); }

async function loadAllGames(){
  const results = await Promise.all(
    MONTHS.map(m =>
      fetch(`data/schedule-${m}.json`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
    )
  );
  return results
    .flat()
    .map(normalizeGame)
    .filter(g => g.date && g.teams?.home && g.teams?.away);
}

function sortByDateAsc(a,b){ return (a.date || "").localeCompare(b.date || ""); }
function sortByDateDesc(a,b){ return (b.date || "").localeCompare(a.date || ""); }

/* =========================
   📊 近期概況（含最近 10 場）
   ========================= */
function renderSummary(teamGames, teamId){
  const ul = $("summaryList");
  if (!ul) return;

  const finished = teamGames.filter(hasScore);

  const w = finished.filter(g => resultForTeam(g, teamId) === "W").length;
  const l = finished.filter(g => resultForTeam(g, teamId) === "L").length;
  const t = finished.filter(g => resultForTeam(g, teamId) === "T").length;

  /* ===== 最近 10 場 ===== */
  const last10 = finished.slice(-10);
  let last10W = 0, last10L = 0;

  last10.forEach(g => {
    const r = resultForTeam(g, teamId);
    if (r === "W") last10W++;
    else if (r === "L") last10L++;
  });

  const last10Games = last10W + last10L;
  const last10Pct = last10Games
    ? (last10W / last10Games).toFixed(3)
    : "—";

  /* ===== 連勝 / 連敗 ===== */
  let streakType = null;
  let streakCount = 0;

  const desc = finished.slice().sort(sortByDateDesc);
  for (const g of desc) {
    const r = resultForTeam(g, teamId);
    if (!r || r === "T") continue;
    const cur = r === "W" ? "win" : "lose";
    if (!streakType) {
      streakType = cur;
      streakCount = 1;
    } else if (streakType === cur) {
      streakCount++;
    } else break;
  }

  const streakText =
    !streakType ? "—" :
    streakType === "win" ? `🔥 ${streakCount} 連勝` :
    `❄️ ${streakCount} 連敗`;

  const winPct = finished.length ? (w / finished.length).toFixed(3) : "—";

  ul.innerHTML = `
    <li>總場次：${teamGames.length}</li>
    <li>已完賽：${finished.length}</li>
    <li>勝：${w} ｜ 敗：${l} ｜ 和：${t}</li>
    <li>勝率：${winPct}</li>

    <li><b>最近 10 場：</b>
      ${last10W} 勝 ${last10L} 敗（勝率 ${last10Pct}）
    </li>

    <li><b>近期狀態：</b> ${streakText}</li>
    <li class="muted">※ 僅統計有比分的比賽</li>
  `;
}

/* =========================
   🕒 最近 5 場
   ========================= */
function renderRecent5(teamGames, teamId){
  const box = $("recentGames");
  if (!box) return;

  const finished = teamGames
    .filter(hasScore)
    .sort(sortByDateDesc)
    .slice(0,5);

  if (!finished.length){
    box.innerHTML = `<div class="muted">目前沒有已完賽比賽</div>`;
    return;
  }

  box.innerHTML = finished.map(g => {
    const homeName = teamIdToName(g.teams.home);
    const awayName = teamIdToName(g.teams.away);
    const r = resultForTeam(g, teamId);
    const badge = r === "W" ? "勝" : r === "L" ? "敗" : "和";

    return `
      <div class="mini-game ${badge === "勝" ? "win" : badge === "敗" ? "lose" : ""}">
        ${g.date}｜${awayName} vs ${homeName}｜${g.awayScore}:${g.homeScore}（${badge}）
      </div>
    `;
  }).join("");
}

/* =========================
   🏠 / ✈️ 主客場
   ========================= */
function renderHomeAway(teamGames, teamId){
  const ul = $("homeAwayStats");
  if (!ul) return;

  const finished = teamGames.filter(hasScore);

  let homeGames=0, homeWins=0;
  let awayGames=0, awayWins=0;

  finished.forEach(g => {
    const isHome = g.teams.home === teamId;
    const my = isHome ? g.homeScore : g.awayScore;
    const opp = isHome ? g.awayScore : g.homeScore;

    if (isHome){
      homeGames++;
      if (my > opp) homeWins++;
    } else {
      awayGames++;
      if (my > opp) awayWins++;
    }
  });

  const homePct = homeGames ? (homeWins/homeGames).toFixed(3) : "—";
  const awayPct = awayGames ? (awayWins/awayGames).toFixed(3) : "—";

  ul.innerHTML = `
    <li>🏠 主場：${homeWins} 勝 / ${homeGames} 場（勝率 ${homePct}）</li>
    <li>✈️ 客場：${awayWins} 勝 / ${awayGames} 場（勝率 ${awayPct}）</li>
  `;
}

/* =========================
   ⚔️ 對戰各隊
   ========================= */
function renderVsTeams(allGames, teamId){
  const box = $("vsTeams");
  if (!box) return;

  const opponents = Object.keys(TEAM_NAME_MAP).filter(id => id !== teamId);
  const vsMap = {};
  opponents.forEach(o => vsMap[o] = { w:0, l:0, t:0, n:0 });

  allGames.filter(hasScore).forEach(g => {
    const h = g.teams.home, a = g.teams.away;
    if (h !== teamId && a !== teamId) return;

    const opp = h === teamId ? a : h;
    if (!vsMap[opp]) return;

    const r = resultForTeam(g, teamId);
    vsMap[opp].n++;
    if (r === "W") vsMap[opp].w++;
    else if (r === "L") vsMap[opp].l++;
    else vsMap[opp].t++;
  });

  box.innerHTML = `
    <table class="simple-table">
      <thead>
        <tr>
          <th>對手</th>
          <th>勝-敗-和</th>
          <th>場次</th>
        </tr>
      </thead>
      <tbody>
        ${opponents.map(o => `
          <tr>
            <td>${teamIdToName(o)}</td>
            <td>${vsMap[o].w}-${vsMap[o].l}-${vsMap[o].t}</td>
            <td>${vsMap[o].n}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* =========================
   init
   ========================= */
(async function init(){
  const teamId = getParam("team") || "brothers";
  const teamName = teamIdToName(teamId);

  const title = $("teamTitle");
  if (title) title.textContent = `${teamName}｜球隊分析`;

  const link = $("linkSchedule");
  if (link) link.href = `schedule.html?team=${teamId}`;

  const all = await loadAllGames();
  const teamGames = all
    .filter(g => isGameOfTeam(g, teamId))
    .sort(sortByDateAsc);

  renderSummary(teamGames, teamId);
  renderRecent5(teamGames, teamId);
  renderHomeAway(teamGames, teamId);
  renderVsTeams(all, teamId);
})();
