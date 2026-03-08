// team-roster.js（支援一軍 / 二軍教練團）
const pageTitle = document.getElementById("pageTitle");
const pageSub = document.getElementById("pageSub");

const params = new URLSearchParams(location.search);
const teamId = params.get("team");

const coachBox = document.getElementById("coachList");
const playerBox = document.getElementById("playerList");

if (!teamId) {
  coachBox.textContent = "缺少 team 參數";
  playerBox.textContent = "缺少 team 參數";
  throw new Error("missing team");
}

fetch(`data/rosters/${teamId}.json`)
  .then(r => {
    if (!r.ok) throw new Error("roster not found");
    return r.json();
  })
  .then(data => {
  // 設定頁首標題
  pageTitle.textContent = data.teamName || "球隊名單";
  pageSub.textContent = `2026 年度球隊名單`;

  renderCoaches(data.coaches);
  renderPlayers(data.players);
})

  .catch(err => {
    console.error(err);
    coachBox.textContent = "名單載入失敗";
    playerBox.textContent = "名單載入失敗";
  });

/* =====================
   教練團（一軍 / 二軍）
   ===================== */
function renderCoaches(coaches) {
  if (!coaches || (!coaches.first && !coaches.second)) {
    coachBox.textContent = "尚未建立教練資料";
    return;
  }

  let html = "";

  // 一軍教練
if (coaches.first) {
  html += `
    <h3>${coaches.first.title}</h3>
    <div class="roster-list">
      ${coaches.first.list.map(c => `
        <div class="roster-item" data-squad="first">
          <strong>${c.name}</strong>
          <div class="muted">${c.role}</div>
        </div>
      `).join("")}
    </div>
  `;
}

// 二軍教練
if (coaches.second) {
  html += `
    <h3 style="margin-top:16px;">${coaches.second.title}</h3>
    <div class="roster-list">
      ${coaches.second.list.map(c => `
        <div class="roster-item" data-squad="second">
          <strong>${c.name}</strong>
          <div class="muted">${c.role}</div>
        </div>
      `).join("")}
    </div>
  `;
}

coachBox.innerHTML = html;
}


/* =====================
   球員名單（先空殼）
   ===================== */
function renderPlayers(players) {
  if (!players || players.length === 0) {
    playerBox.innerHTML = `
      <div class="roster-list">
        <div class="roster-item muted">
          2026 球員名單尚未公告
        </div>
      </div>
    `;
    return;
  }

  playerBox.innerHTML = `
    <div class="roster-list">
      ${players.map(p => `
        <div class="roster-item">
          <strong>#${p.number || "--"} ${p.name}</strong>
          <div class="muted">${p.position || ""}</div>
        </div>
      `).join("")}
    </div>
  `;
}

