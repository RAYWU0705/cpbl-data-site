/* =========================
   2026 CPBL Season Center V2.0
   來源：data/live/live-boxscore.json
   - 賽季進度
   - 各隊目前狀態
   - 主客場戰績
   - 近10場
   - 連勝/連敗
   - 最近一場
   - 對戰戰績 H2H
   - 對戰明細可點進 match.html?gameSno=
========================= */

let allSeasonGames = [];

const MY_TEAM = "中信兄弟";
const TOTAL_GAMES = 360;
const LIVE_BOXSCORE_URL = "data/live/live-boxscore.json";

const TEAM_ID_MAP = {
  "中信兄弟": "brothers",
  "統一7-ELEVEn獅": "lions",
  "樂天桃猿": "monkeys",
  "味全龍": "dragons",
  "富邦悍將": "guardians",
  "台鋼雄鷹": "hawks"
};

const TEAM_LIST = Object.keys(TEAM_ID_MAP);

const progressBox = document.getElementById("seasonProgress");
const teamGrid = document.getElementById("teamStatusGrid");
const h2hWrap = document.getElementById("h2hTableWrap");
const h2hDetailHint = document.getElementById("h2hDetailHint");
const h2hDetailList = document.getElementById("h2hDetailList");
const todayBox = document.querySelector("#todayGamesCard .today-content");

/* =========================
   入口
========================= */

document.addEventListener("DOMContentLoaded", initSeason);

async function initSeason() {
  try {
    injectV2CssOnce();

    allSeasonGames = await loadLiveBoxscoreGames();

    const regularGames = allSeasonGames.filter(g =>
      g.type === "regular" &&
      TEAM_LIST.includes(g.home) &&
      TEAM_LIST.includes(g.away)
    );

    const finals = regularGames.filter(g =>
      g.status === "final" &&
      typeof g.homeScore === "number" &&
      typeof g.awayScore === "number"
    );

    updateProgress(finals);

    const base = calculateStandings(finals);
    const extras = calculateExtras(finals);
    const lastGame = calculateLastGame(finals);
    const merged = mergeStandings(base, extras, lastGame);
    const ranked = rankStandings(merged);

    renderTeamCards(ranked);

    const h2h = calculateHeadToHead(finals);
    renderHeadToHeadTable(h2h);
    renderTodayGames();

    if (h2hDetailList) {
      h2hDetailList.innerHTML = `
        <div class="muted">提示：點上方對戰表任一格，就會列出比賽（可點進比賽中心）</div>
      `;
    }

  } catch (err) {
    console.error(err);

    if (progressBox) {
      progressBox.innerHTML = `<div class="muted">賽季資料載入失敗：${escapeHtml(err.message)}</div>`;
    }

    if (teamGrid) {
      teamGrid.innerHTML = `<div class="home-card">資料載入失敗</div>`;
    }
  }
}

/* =========================
   載入新版 live-boxscore
========================= */

async function loadLiveBoxscoreGames() {
  const res = await fetch(`${LIVE_BOXSCORE_URL}?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`讀取 live-boxscore.json 失敗：HTTP ${res.status}`);
  }

  const data = await res.json();
  const arr = Array.isArray(data) ? data : Object.values(data || {});

  return arr
    .map(normalizeGame)
    .filter(g => g.date && g.home && g.away);
}

function normalizeGame(g) {
  const meta = g.meta || {};

  const home = normalizeTeamName(meta.home);
  const away = normalizeTeamName(meta.away);

  return {
    raw: g,

    gameSno: Number(g.gameSno ?? 0),

    date: meta.date || "",
    time: meta.time || "",
    venue: meta.venue || "",

    home,
    away,

    homeScore: valueOrNull(g.totals?.home?.R),
    awayScore: valueOrNull(g.totals?.away?.R),

    status: meta.status || "scheduled",
    statusText: meta.statusText || "",

    type: meta.type || "regular"
  };
}

function normalizeTeamName(name) {
  return String(name || "")
    .replace("7-ELEVEN", "7-ELEVEn")
    .trim();
}

function valueOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* =========================
   賽季進度
========================= */

function updateProgress(finalGames) {
  if (!progressBox) return;

  const played = finalGames.length;
  const percent = Math.round((played / TOTAL_GAMES) * 100);

  progressBox.innerHTML = `
    <div class="season-progress-text">
      已完成 <strong>${played}</strong> / ${TOTAL_GAMES} 場（${percent}%）
    </div>

    <div class="season-progress-bar">
      <div class="season-progress-fill" style="width:${percent}%;">
        ${percent}%
      </div>
    </div>
  `;
}

/* =========================
   基本戰績
========================= */

function calculateStandings(finals) {
  const teams = {};

  TEAM_LIST.forEach(t => {
    teams[t] = {
      team: t,

      W: 0,
      L: 0,
      T: 0,

      homeW: 0,
      homeL: 0,
      homeT: 0,

      awayW: 0,
      awayL: 0,
      awayT: 0,

      RF: 0,
      RA: 0
    };
  });

  for (const g of finals) {
    const home = g.home;
    const away = g.away;

    if (!teams[home] || !teams[away]) continue;

    teams[home].RF += g.homeScore;
    teams[home].RA += g.awayScore;

    teams[away].RF += g.awayScore;
    teams[away].RA += g.homeScore;

    if (g.homeScore > g.awayScore) {
      teams[home].W++;
      teams[home].homeW++;

      teams[away].L++;
      teams[away].awayL++;

    } else if (g.homeScore < g.awayScore) {
      teams[away].W++;
      teams[away].awayW++;

      teams[home].L++;
      teams[home].homeL++;

    } else {
      teams[home].T++;
      teams[home].homeT++;

      teams[away].T++;
      teams[away].awayT++;
    }
  }

  return teams;
}

/* =========================
   近10場 + 連勝/連敗
========================= */

function calculateExtras(finals) {
  const sorted = [...finals].sort(sortByDateTime);

  const seq = {};
  TEAM_LIST.forEach(t => seq[t] = []);

  for (const g of sorted) {
    const home = g.home;
    const away = g.away;

    const homeRes = g.homeScore > g.awayScore ? "W" : (g.homeScore < g.awayScore ? "L" : "T");
    const awayRes = g.homeScore > g.awayScore ? "L" : (g.homeScore < g.awayScore ? "W" : "T");

    if (seq[home]) seq[home].push(homeRes);
    if (seq[away]) seq[away].push(awayRes);
  }

  const extras = {};

  TEAM_LIST.forEach(t => {
    const s = seq[t];
    const last10 = s.slice(-10);

    const last10W = last10.filter(x => x === "W").length;
    const last10L = last10.filter(x => x === "L").length;
    const last10T = last10.filter(x => x === "T").length;

    const streak = getStreakText(s);

    extras[t] = {
      last10: s.length ? `${last10W}-${last10L}-${last10T}` : "—",
      streak
    };
  });

  return extras;
}

function getStreakText(results) {
  if (!results.length) return "—";

  const last = results[results.length - 1];

  if (last === "T") return "和局 1";

  let count = 1;

  for (let i = results.length - 2; i >= 0; i--) {
    if (results[i] === last) count++;
    else break;
  }

  if (last === "W") return `連勝 ${count}`;
  if (last === "L") return `連敗 ${count}`;

  return "—";
}

/* =========================
   最近一場
========================= */

function calculateLastGame(finals) {
  const sorted = [...finals].sort(sortByDateTime);

  const last = {};
  TEAM_LIST.forEach(t => last[t] = null);

  for (const g of sorted) {
    if (last[g.home] !== undefined) last[g.home] = g;
    if (last[g.away] !== undefined) last[g.away] = g;
  }

  const out = {};

  TEAM_LIST.forEach(t => {
    const g = last[t];

    if (!g) {
      out[t] = "—";
      return;
    }

    const isHome = t === g.home;

    const meScore = isHome ? g.homeScore : g.awayScore;
    const oppScore = isHome ? g.awayScore : g.homeScore;
    const opp = isHome ? g.away : g.home;

    const wl = meScore > oppScore ? "勝" : (meScore < oppScore ? "敗" : "和");

    out[t] = `${g.date} vs ${shortName(opp)}（${wl} ${meScore}-${oppScore}）`;
  });

  return out;
}

/* =========================
   合併 + 排名
========================= */

function mergeStandings(base, extras, lastGameText) {
  const out = {};

  TEAM_LIST.forEach(t => {
    const b = base[t];
    const e = extras[t] || { last10: "—", streak: "—" };

    const total = b.W + b.L + b.T;
    const decisionGames = b.W + b.L;
    const pct = decisionGames ? b.W / decisionGames : 0;

    out[t] = {
      ...b,
      total,
      pct,
      last10: e.last10,
      streak: e.streak,
      lastGame: lastGameText?.[t] ?? "—",
      runDiff: b.RF - b.RA
    };
  });

  return out;
}

function rankStandings(standings) {
  const arr = Object.values(standings);

  arr.sort((a, b) => {
    if (b.pct !== a.pct) return b.pct - a.pct;
    if (b.W !== a.W) return b.W - a.W;
    if (b.runDiff !== a.runDiff) return b.runDiff - a.runDiff;
    return a.team.localeCompare(b.team, "zh-Hant");
  });

  const leader = arr[0] || null;

  arr.forEach((t, index) => {
    t.rank = index + 1;

    if (!leader || t.total === 0 || index === 0) {
      t.GB = index === 0 && t.total > 0 ? "-" : "—";
      return;
    }

    const gb = ((leader.W - t.W) + (t.L - leader.L)) / 2;
    t.GB = gb === 0 ? "-" : gb.toFixed(1);
  });

  return arr;
}

/* =========================
   渲染球隊卡片
========================= */

function renderTeamCards(teams) {
  if (!teamGrid) return;

  teamGrid.innerHTML = teams.map(t => {
    const pctText = t.total ? t.pct.toFixed(3) : "—";

    let status = "普通";
    if (t.total === 0) status = "⚠️ 待調整";
    else if (t.pct >= 0.6) status = "🔥 強勢";
    else if (t.pct <= 0.4) status = "⚠️ 待調整";

    const isMine = t.team === MY_TEAM;
    const logo = TEAM_ID_MAP[t.team];

    return `
      <a class="home-card season-team-card ${isMine ? "my-team-card" : ""}"
         href="team.html?team=${logo}"
         data-team="${escapeHtml(t.team)}">

        <div class="season-team-head">
          <img
            src="assets/logo/${logo}.png"
            alt="${escapeHtml(t.team)}"
            onerror="this.style.display='none'"
          >

          <div>
            <strong>${t.rank}. ${escapeHtml(t.team)}</strong><br>
            <span class="muted record">${t.W}-${t.L}-${t.T}</span><br>
            <span class="muted status">勝率 ${pctText} ｜ 勝差 ${t.GB}</span>
          </div>
        </div>

        <div class="season-team-body">
          <div class="muted">主場 ${t.homeW}-${t.homeL}-${t.homeT} ｜ 客場 ${t.awayW}-${t.awayL}-${t.awayT}</div>
          <div class="muted">得分 ${t.RF} ｜ 失分 ${t.RA} ｜ 差 ${t.runDiff > 0 ? "+" : ""}${t.runDiff}</div>
          <div class="muted">近10場 ${t.last10} ｜ ${t.streak}</div>
          <div class="muted">最近一場比賽：${escapeHtml(t.lastGame)}</div>
          <div class="season-status">狀態：${status}</div>
        </div>
      </a>
    `;
  }).join("");
}

/* =========================
   對戰戰績 H2H
========================= */

function calculateHeadToHead(finals) {
  const h2h = {};

  TEAM_LIST.forEach(a => {
    h2h[a] = {};
    TEAM_LIST.forEach(b => {
      h2h[a][b] = { W: 0, L: 0, T: 0 };
    });
  });

  for (const g of finals) {
    const home = g.home;
    const away = g.away;

    if (!h2h[home] || !h2h[away]) continue;

    if (g.homeScore > g.awayScore) {
      h2h[home][away].W++;
      h2h[away][home].L++;

    } else if (g.homeScore < g.awayScore) {
      h2h[away][home].W++;
      h2h[home][away].L++;

    } else {
      h2h[home][away].T++;
      h2h[away][home].T++;
    }
  }

  return h2h;
}

function renderHeadToHeadTable(h2h) {
  if (!h2hWrap) return;

  const header = `
    <div class="h2h-row h2h-head">
      <div class="h2h-cell">隊伍</div>
      ${TEAM_LIST.map(t => `<div class="h2h-cell">${shortName(t)}</div>`).join("")}
    </div>
  `;

  const rows = TEAM_LIST.map(a => {
    const cells = TEAM_LIST.map(b => {
      if (a === b) {
        return `<div class="h2h-cell h2h-self">—</div>`;
      }

      const x = h2h[a][b];
      const total = x.W + x.L + x.T;
      const text = total ? `${x.W}-${x.L}-${x.T}` : "—";

      const isMineLine = (a === MY_TEAM || b === MY_TEAM);

      return `
        <div class="h2h-cell h2h-click ${isMineLine ? "h2h-mine" : ""}"
             data-a="${escapeHtml(a)}"
             data-b="${escapeHtml(b)}">
          ${text}
        </div>
      `;
    }).join("");

    return `
      <div class="h2h-row ${a === MY_TEAM ? "h2h-row-mine" : ""}">
        <div class="h2h-cell h2h-team">${shortName(a)}</div>
        ${cells}
      </div>
    `;
  }).join("");

  h2hWrap.innerHTML = `
    <div class="h2h-table">
      ${header}
      ${rows}
    </div>
  `;

  h2hWrap.querySelectorAll(".h2h-click").forEach(cell => {
    cell.addEventListener("click", () => {
      const a = cell.dataset.a;
      const b = cell.dataset.b;

      renderHeadToHeadDetail(a, b);
      highlightSelectedH2H(a, b);
    });
  });
}

/* =========================
   對戰明細
========================= */

function renderHeadToHeadDetail(teamA, teamB) {
  if (!h2hDetailList || !h2hDetailHint) return;

  const games = allSeasonGames
    .filter(g =>
      (g.home === teamA && g.away === teamB) ||
      (g.home === teamB && g.away === teamA)
    )
    .sort(sortByDateTime);

  h2hDetailHint.textContent = `目前顯示：${teamA} vs ${teamB}（共 ${games.length} 場）`;

  if (!games.length) {
    h2hDetailList.innerHTML = `<div class="muted">目前沒有這組對戰資料</div>`;
    return;
  }

  h2hDetailList.innerHTML = games.map(g => {
    const isFinal =
      g.status === "final" &&
      typeof g.homeScore === "number" &&
      typeof g.awayScore === "number";

    const scoreText = isFinal
      ? `${g.away} ${g.awayScore} : ${g.homeScore} ${g.home}`
      : `${g.away} vs ${g.home}｜${getStatusText(g.status)}`;

    const url = g.gameSno
      ? `match.html?gameSno=${g.gameSno}`
      : "#";

    return `
      <a class="h2h-game-item" href="${url}">
        <div class="h2h-game-date">${escapeHtml(g.date)}｜${escapeHtml(g.time || "時間未定")}</div>
        <div class="muted">${escapeHtml(scoreText)}</div>
        <div class="muted">${escapeHtml(g.venue || "球場待定")}</div>
      </a>
    `;
  }).join("");
}

function highlightSelectedH2H(a, b) {
  if (!h2hWrap) return;

  h2hWrap.querySelectorAll(".h2h-click").forEach(cell => {
    cell.classList.remove("h2h-selected");

    const ca = cell.dataset.a;
    const cb = cell.dataset.b;

    if ((ca === a && cb === b) || (ca === b && cb === a)) {
      cell.classList.add("h2h-selected");
    }
  });
}

/* =========================
   今日賽事
========================= */

function renderTodayGames() {
  if (!todayBox) return;

  const today = getToday();

  const todayGames = allSeasonGames
    .filter(g => g.date === today)
    .sort(sortByDateTime);

  if (!todayGames.length) {
    todayBox.textContent = "今天沒有比賽";
    return;
  }

  todayBox.innerHTML = todayGames.map(g => {
    const scoreText =
      g.status === "final" && typeof g.homeScore === "number" && typeof g.awayScore === "number"
        ? `${g.away} ${g.awayScore} : ${g.homeScore} ${g.home}`
        : `${g.away} vs ${g.home}`;

    return `
      <a class="today-game today-game-link" href="match.html?gameSno=${g.gameSno}">
        <strong>${escapeHtml(scoreText)}</strong><br>
        <span class="muted">${escapeHtml(g.time || "時間未定")}｜${escapeHtml(g.venue || "球場待定")}</span>
      </a>
    `;
  }).join("");
}

/* =========================
   工具
========================= */

function sortByDateTime(a, b) {
  const ad = `${a.date || ""} ${a.time || "00:00"}`;
  const bd = `${b.date || ""} ${b.time || "00:00"}`;
  return ad.localeCompare(bd);
}

function getToday() {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shortName(team) {
  if (team.includes("中信")) return "兄弟";
  if (team.includes("統一")) return "統一";
  if (team.includes("樂天")) return "樂天";
  if (team.includes("味全")) return "味全";
  if (team.includes("富邦")) return "富邦";
  if (team.includes("台鋼")) return "台鋼";
  return team;
}

function getStatusText(status) {
  if (status === "final") return "已結束";
  if (status === "live") return "LIVE";
  if (status === "postponed") return "延賽";
  if (status === "suspended") return "保留比賽";
  if (status === "cancelled") return "取消";
  return "未開賽";
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* =========================
   CSS
========================= */

function injectV2CssOnce() {
  if (document.getElementById("seasonV2Style")) return;

  const style = document.createElement("style");
  style.id = "seasonV2Style";

  style.textContent = `
    .season-progress-text{
      margin-bottom:8px;
      font-size:16px;
    }

    .season-progress-bar{
      background:#ddd;
      border-radius:12px;
      overflow:hidden;
      min-height:32px;
    }

    .season-progress-fill{
      background:#0b3c5d;
      color:#fff;
      padding:8px;
      font-weight:900;
      min-width:42px;
      transition:.3s ease;
    }

    .season-team-card{
      display:block;
      color:inherit;
      text-decoration:none;
    }

    .season-team-head{
      display:flex;
      align-items:center;
      gap:12px;
    }

    .season-team-head img{
      width:54px;
      height:54px;
      object-fit:contain;
    }

    .season-team-body{
      margin-top:12px;
      display:grid;
      gap:7px;
      line-height:1.6;
    }

    .season-status{
      font-weight:900;
    }

    .my-team-card{
      border:2px solid #0b3c5d;
      box-shadow:0 8px 20px rgba(11,60,93,0.18);
    }

    .h2h-table{
      display:grid;
      gap:6px;
      overflow:auto;
    }

    .h2h-row{
      display:grid;
      grid-template-columns:90px repeat(6, minmax(70px,1fr));
      gap:6px;
    }

    .h2h-cell{
      background:#f6f7f9;
      border:1px solid #eceef2;
      border-radius:10px;
      padding:8px;
      text-align:center;
      font-size:13px;
      user-select:none;
    }

    .h2h-head .h2h-cell{
      background:#0b3c5d;
      color:#fff;
      font-weight:700;
    }

    .h2h-team{
      background:#fff;
      font-weight:700;
    }

    .h2h-self{
      background:#fff;
      color:#999;
    }

    .h2h-click{
      cursor:pointer;
      transition:transform .08s ease;
    }

    .h2h-click:hover{
      transform:translateY(-1px);
    }

    .h2h-mine{
      border-color:rgba(11,60,93,0.45);
    }

    .h2h-selected{
      background:#0b3c5d !important;
      color:#fff !important;
      border-color:#0b3c5d !important;
      font-weight:700;
    }

    .h2h-row-mine .h2h-team{
      border:2px solid rgba(11,60,93,0.45);
    }

    #h2hDetailList{
      display:grid;
      gap:10px;
    }

    .h2h-game-item,
    .today-game-link{
      display:block;
      background:#fff;
      border:1px solid #eceef2;
      border-radius:14px;
      padding:12px 14px;
      box-shadow:0 6px 18px rgba(0,0,0,0.06);
      color:inherit;
      text-decoration:none;
      cursor:pointer;
      line-height:1.7;
    }

    .h2h-game-item:hover,
    .today-game-link:hover{
      border-color:rgba(11,60,93,0.45);
    }

    @media (max-width:800px){
      .h2h-row{
        grid-template-columns:80px repeat(6, 80px);
      }
    }
  `;

  document.head.appendChild(style);
}