import { TEAM_MAP } from "../data/teamMap.js";
import { getTeamIdByName } from "../services/teamService.js";

export function initMatch() {
console.log("🔥 MATCH.JS v1.4 LOADED");

// =========================
// 比賽中心（穩定完整版 v1.4 FINAL）
// =========================

let currentTeam = null;
let countdownTimer = null;


/* =========================
   🎫 官方購票連結
========================= */
const TICKET_LINKS = {
  "中信兄弟": "https://tix.ctbcsports.com/BROTHERS/UTK0101_",
  "統一7-ELEVEn獅": "https://ticket.ibon.com.tw/",
  "樂天桃猿": "https://ticket.ibon.com.tw/",
  "味全龍": "https://tix.wdragons.com/UTK0101_",
  "富邦悍將": "https://guardians.fami.life/UTK0101_",
  "台鋼雄鷹": "https://ticket.tsghawks.com/"
};

/* =========================
   工具區
========================= */
function renderTeam(elId, teamName) {

  const el = document.getElementById(elId);
  if (!el) return;

  // 🔥 用 service 轉 id
  const teamId = getTeamIdByName(teamName);

  if (!teamId) {
    el.innerHTML = `<span>${teamName ?? "—"}</span>`;
    return;
  }

  const teamData = TEAM_MAP[teamId];

  const logo = `
    <img src="${teamData.logo}" class="team-logo">
  `;

  el.innerHTML = `
    ${logo}
    <span class="team-name">
      ${teamData.name}
    </span>
  `;
}


function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* =========================
   狀態樣式
========================= */
function setMatchStatus(status, customText = null) {
  const el = document.getElementById("matchStatus");
  if (!el) return;

  el.classList.remove("status-live","status-final","status-scheduled");

  if (status === "live") {
    el.textContent = customText || "🔴 LIVE 比賽進行中";
    el.classList.add("status-live");
  } 
  else if (status === "final") {
    el.textContent = customText || "✅ FINAL 比賽結束";
    el.classList.add("status-final");
  } 
  else {
    el.textContent = customText || "⏳ 尚未開打";
    el.classList.add("status-scheduled");
  }
}

/* =========================
   倒數計時
========================= */
function startCountdown(gameDate, gameTime) {

  if (countdownTimer) clearInterval(countdownTimer);

  const target = new Date(`${gameDate}T${gameTime}:00`);

  function update() {
    const now = new Date();
    const diff = target - now;

    if (diff <= 0) {
      clearInterval(countdownTimer);
      setMatchStatus("live"); // 這行已經夠
      return;
    }

    const h = Math.floor(diff / 1000 / 60 / 60);
    const m = Math.floor((diff / 1000 / 60) % 60);
    const s = Math.floor((diff / 1000) % 60);

    setMatchStatus("scheduled", `⏳ 開打倒數 ${h}h ${m}m ${s}s`);
  }

  update();
  countdownTimer = setInterval(update, 1000);
}


/* =========================
   工具
========================= */
function getTeamsFromGame(g) {
  if (g?.teams?.home) return g.teams;
  if (g?.home) return { home: g.home, away: g.away };
  return { home: null, away: null };
}

function buildGameId(game) {
  const t = getTeamsFromGame(game);
  if (!game.date || !t.home || !t.away) return null;
  const homeId = getTeamIdByName(t.home);
  const awayId = getTeamIdByName(t.away);
  const homeColor = TEAM_MAP[homeId]?.color;
  const awayColor = TEAM_MAP[awayId]?.color;

  if (homeColor && awayColor) {

    document.body.classList.add("theme-match");

    document.documentElement.style.setProperty(
      "--home-color-light",
      `${homeColor}22`
    );

    document.documentElement.style.setProperty(
     "--away-color-light",
      `${awayColor}22`
   );
  }

  return `${game.date.replaceAll("-", "")}_${homeId}_${awayId}`;
}


document.addEventListener("DOMContentLoaded", () => {

  const params = new URLSearchParams(location.search);

  const date = params.get("date");
  const homeParam = params.get("home");
  const awayParam = params.get("away");

  if (!date || !homeParam || !awayParam) {
    console.error("網址缺少必要參數");
    return;
  }

  const month = date.slice(0, 7);
  const url = `data/schedule-${month}.json`;

  fetch(url)
    .then(r => r.json())
    .then(games => {

      const game = games.find(g => {
        const t = getTeamsFromGame(g);
        return (
          g.date === date &&
          t.home === homeParam &&
          t.away === awayParam
        );
      });

      if (!game) {
        console.error("找不到比賽");
        return;
      }

      // 🔥 在這裡產生 gameId（英文 id 版本）
      const gameId =
        date.replaceAll("-", "") +
        "_" +
        homeParam +
        "_" +
        awayParam;

      renderMatch(game, gameId);

    })
    .catch(err => console.error(err));
});
function applyMatchTheme(homeName, awayName) {

  const homeId = getTeamIdByName(homeName);
  const awayId = getTeamIdByName(awayName);

  const homeColor = TEAM_MAP[homeId]?.color;
  const awayColor = TEAM_MAP[awayId]?.color;

  if (!homeColor || !awayColor) return;

  document.body.classList.add("theme-match");

  // 淡色背景
  document.documentElement.style.setProperty(
    "--home-color-light",
    `${homeColor}22`
  );

  document.documentElement.style.setProperty(
    "--away-color-light",
    `${awayColor}22`
  );

  // 主色
  document.documentElement.style.setProperty(
    "--home-color",
    homeColor
  );

  document.documentElement.style.setProperty(
    "--away-color",
    awayColor
  );
}



/* =========================
   渲染比賽
========================= */
function renderMatch(game, gameId) {

  const t = getTeamsFromGame(game);
  const homeName = t.home;
  const awayName = t.away;
  applyMatchTheme(homeName, awayName);

  setText("matchDate", `📅 ${game.date}`);
  setText("matchVenue", game.venue || "球場待公布");
  setText("matchTime", game.time || "時間待公布");
  const typeText =
  game.type === "exhibition" ? "熱身賽" :
  game.type === "regular" ? "例行賽" :
  "類型待公布";

  setText(
    "matchMeta",
    `📍 ${game.venue || "球場待公布"} ｜ 🕒 ${game.time || "時間待公布"} ｜ 🎟 ${typeText}`
);
  renderTeam("homeTeam", homeName);
  renderTeam("awayTeam", awayName);
  renderTicketButton(homeName);

  setText("homeScore", "—");
  setText("awayScore", "—");
  setText("gameIdDisplay", `Game ID: ${gameId}`);
  
  if (game.status === "final") {
    setMatchStatus("final");
  }
  else if (game.status === "live") {
    setMatchStatus("live");
  }
  else if (game.time) {
    startCountdown(game.date, game.time);
  }
  else {
    setMatchStatus("scheduled");
  }

  initTeamSwitch(homeName, awayName);
  loadMonthlyBoxScore(game, gameId, homeName, awayName);
}

/* =========================
   讀取 boxscore-YYYY-MM.json
========================= */
function loadMonthlyBoxScore(game, gameId, homeName, awayName) {

  const month = game.date.slice(0, 7);
  const url = `data/boxscore-${month}.json`;

  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then(data => {

      // 1) 先用原本的 gameId 找
    let box = data[gameId];

    // 2) 找不到就試反過來（修正 home/away 參數顛倒的情況）
    if (!box) {
      const reverseId =
        game.date.replaceAll("-", "") + "_" +
        awayName + "_" +
        homeName;
        box = data[reverseId];

      // 🔥 如果反向找到，也把顯示用的隊名交換，避免畫面顯示顛倒
      if (box) {
        const tmp = homeName;
        homeName = awayName;
        awayName = tmp;
      }
    }

    if (!box) {
      renderAllPlaceholder(homeName, awayName);
      return;
    }

      renderLineScore(box, homeName, awayName);
      renderBoxTotals(box, homeName, awayName);
      renderBatters(box, homeName, awayName);
      renderPitchers(box, homeName, awayName);
      // 🔥 RHE 同步上方比分
      const homeR = box.totals?.home?.R ?? 0;
      const awayR = box.totals?.away?.R ?? 0;

      setText("homeScore", homeR);
      setText("awayScore", awayR);

      

    })
    .catch(() => renderAllPlaceholder(homeName, awayName));
}

/* =========================
   空殼
========================= */
function renderAllPlaceholder(homeName, awayName) {

  const boxSection = document.querySelector(".boxscore");
  const lineSection = document.querySelector(".linescore");

  if (boxSection) boxSection.style.display = "none";

  // ❌ 不要隱藏 linescore
  if (lineSection) lineSection.style.display = "block";

  setMatchStatus("scheduled");

  renderLineScorePlaceholder(homeName, awayName);
  renderBoxScorePlaceholder(homeName, awayName);
}


/* =========================
   逐局比分
========================= */
function renderLineScore(box, homeName, awayName) {

  const header = document.getElementById("linescoreHeader");
  const rows = document.getElementById("linescoreRows");
  if (!header || !rows) return;

  header.innerHTML = `
    <span>隊伍</span>
    ${[1,2,3,4,5,6,7,8,9].map(i=>`<span>${i}</span>`).join("")}
    <span>R</span>
    <span>H</span>
    <span>E</span>
  `;

  const away = box.lineScore?.away || [];
  const home = box.lineScore?.home || [];

  rows.innerHTML = `
  <div class="linescore-row">
    <span>${awayName}</span>
    ${away.map(i=>`<span>${i ?? "-"}</span>`).join("")}
    <span>${box.totals?.away?.R ?? "-"}</span>
    <span>${box.totals?.away?.H ?? "-"}</span>
    <span>${box.totals?.away?.E ?? "-"}</span>
  </div>
  <div class="linescore-row">
    <span>${homeName}</span>
    ${home.map(i=>`<span>${i ?? "-"}</span>`).join("")}
    <span>${box.totals?.home?.R ?? "-"}</span>
    <span>${box.totals?.home?.H ?? "-"}</span>
    <span>${box.totals?.home?.E ?? "-"}</span>
  </div>
`;

  // 如果有目前局數資訊（例如 box.currentInning）
if (box.currentInning) {
  highlightCurrentInning(box.currentInning);
}

}

/* =========================
   R / H / E
========================= */
function renderBoxTotals(box, homeName, awayName) {

  const el = document.getElementById("boxScoreRows");
  if (!el) return;

  const homeR = box.totals?.home?.R ?? 0;
  const awayR = box.totals?.away?.R ?? 0;

  // 🔥 判斷勝負
  let homeClass = "";
  let awayClass = "";

  if (homeR > awayR) {
    homeClass = "winner";
    awayClass = "loser";
  } 
  else if (awayR > homeR) {
    awayClass = "winner";
    homeClass = "loser";
  }

  el.innerHTML = `
    <div class="boxscore-row ${awayClass}">
      <span>${awayName}</span>
      <span>${awayR}</span>
      <span>${box.totals?.away?.H ?? 0}</span>
      <span>${box.totals?.away?.E ?? 0}</span>
    </div>
    <div class="boxscore-row ${homeClass}">
      <span>${homeName}</span>
      <span>${homeR}</span>
      <span>${box.totals?.home?.H ?? 0}</span>
      <span>${box.totals?.home?.E ?? 0}</span>
    </div>
  `;

  // 🔥 上方比分同步高亮
  const homeScoreEl = document.getElementById("homeScore");
  const awayScoreEl = document.getElementById("awayScore");

  homeScoreEl.textContent = homeR;
  awayScoreEl.textContent = awayR;

  homeScoreEl.classList.remove("winner","loser");
  awayScoreEl.classList.remove("winner","loser");

  if (homeR > awayR) {
    homeScoreEl.classList.add("winner");
    awayScoreEl.classList.add("loser");
  }
  else if (awayR > homeR) {
    awayScoreEl.classList.add("winner");
    homeScoreEl.classList.add("loser");
  }

  
}


/* =========================
   Placeholder
========================= */
function renderLineScorePlaceholder(homeName, awayName) {

  const header = document.getElementById("linescoreHeader");
  const rows = document.getElementById("linescoreRows");
  if (!header || !rows) return;

  header.innerHTML = `
  <span>隊伍</span>
  ${[1,2,3,4,5,6,7,8,9].map(i=>`<span>${i}</span>`).join("")}
  <span>R</span>
  <span>H</span>
  <span>E</span>
`;


  const empty = Array(9).fill(`<span>-</span>`).join("");

  rows.innerHTML = `
  <div class="linescore-row">
    <span>${awayName}</span>
    ${empty}
    <span>-</span>
    <span>-</span>
    <span>-</span>
  </div>
  <div class="linescore-row">
    <span>${homeName}</span>
    ${empty}
    <span>-</span>
    <span>-</span>
    <span>-</span>
  </div>
`;


}

function renderBoxScorePlaceholder(homeName, awayName) {

  const el = document.getElementById("boxScoreRows");
  if (!el) return;

  el.innerHTML = `
    <div class="boxscore-row">
      <span>${awayName}</span>
      <span>-</span>
      <span>-</span>
      <span>-</span>
    </div>
    <div class="boxscore-row">
      <span>${homeName}</span>
      <span>-</span>
      <span>-</span>
      <span>-</span>
    </div>
  `;
}

/* =========================
   主客隊切換
========================= */
function initTeamSwitch(homeName, awayName) {

  const el = document.getElementById("teamSwitch");
  const hint = document.getElementById("teamDataHint");
  if (!el) return;

  el.innerHTML = `
    <button class="team-tab" data-team="away">${awayName}</button>
    <button class="team-tab" data-team="home">${homeName}</button>
  `;

  el.querySelectorAll(".team-tab").forEach(btn=>{
    btn.addEventListener("click",()=>{
      currentTeam = btn.dataset.team;
      el.querySelectorAll(".team-tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      if (hint) {
        hint.textContent = currentTeam==="home"
          ? "目前顯示：主隊數據"
          : "目前顯示：客隊數據";
      }
    });
  });

  currentTeam = "home";
  el.querySelector('[data-team="home"]')?.classList.add("active");
}
function highlightCurrentInning(inningNumber) {
  const rows = document.querySelectorAll("#linescoreRows .linescore-row");

  rows.forEach(row => {
    const spans = row.querySelectorAll("span");

    // 第 0 個是隊名，所以局數從 index 1 開始
    spans.forEach((s, i) => {
      s.classList.remove("current-inning");

      if (i === inningNumber) {
        s.classList.add("current-inning");
      }
    });
  });
}
function renderTicketButton(homeName) {

  const link = TICKET_LINKS[homeName];
  const container = document.getElementById("ticketArea");

  if (!container) return;

  if (!link) {
    container.innerHTML = `<div class="muted">暫無購票資訊</div>`;
    return;
  }

  container.innerHTML = `
    <a href="${link}" target="_blank" class="ticket-btn">
      🎫 前往 ${homeName} 官方購票
    </a>
  `;
}
}
function renderBatters(box, homeName, awayName){

  const container = document.getElementById("batterRows");
  if(!container) return;

  const home = box?.batters?.home ?? [];
  const away = box?.batters?.away ?? [];

  if(!home.length && !away.length){
    container.innerHTML = `<div class="muted">尚無打者數據</div>`;
    return;
  }

  let html = "";

  if(away.length){
    html += `<div class="batter-team-title">${awayName}</div>`;
    away.forEach(p=>{
      html += `
        <div class="batter-row">
          <span>${p.name}</span>
          <span>${p.AB ?? "-"}</span>
          <span>${p.H ?? "-"}</span>
          <span>${p.R ?? "-"}</span>
          <span>${p.RBI ?? "-"}</span>
          <span>${p.AVG ?? "-"}</span>
        </div>
      `;
    });
  }

  if(home.length){
    html += `<div class="batter-team-title">${homeName}</div>`;
    home.forEach(p=>{
      html += `
        <div class="batter-row">
          <span>${p.name}</span>
          <span>${p.AB ?? "-"}</span>
          <span>${p.H ?? "-"}</span>
          <span>${p.R ?? "-"}</span>
          <span>${p.RBI ?? "-"}</span>
          <span>${p.AVG ?? "-"}</span>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}
function renderPitchers(box, homeName, awayName){

  const container = document.getElementById("pitcherRows");
  if(!container) return;

  const home = box?.pitchers?.home ?? [];
  const away = box?.pitchers?.away ?? [];

  if(!home.length && !away.length){
    container.innerHTML = `<div class="muted">尚無投手數據</div>`;
    return;
  }

  let html = "";

  if(away.length){
    html += `<div class="pitcher-team-title">${awayName}</div>`;
    away.forEach(p=>{
      html += `
        <div class="pitcher-row">
          <span>${p.name}</span>
          <span>${p.IP ?? "-"}</span>
          <span>${p.H ?? "-"}</span>
          <span>${p.ER ?? "-"}</span>
          <span>-</span>
          <span>${p.SO ?? "-"}</span>
        </div>
      `;
    });
  }

  if(home.length){
    html += `<div class="pitcher-team-title">${homeName}</div>`;
    home.forEach(p=>{
      html += `
        <div class="pitcher-row">
          <span>${p.name}</span>
          <span>${p.IP ?? "-"}</span>
          <span>${p.H ?? "-"}</span>
          <span>${p.ER ?? "-"}</span>
          <span>-</span>
          <span>${p.SO ?? "-"}</span>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}