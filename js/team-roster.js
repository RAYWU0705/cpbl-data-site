console.log("✅ team-roster.js v5.5.0-PLAYER-PROFILE-LINK 已載入");

/* =========================================================
   Ray's CPBL Data Site
   Team Roster v5.5.0-PLAYER-PROFILE-LINK
   覆蓋位置：js/team-roster.js

   重點：
   - 不改資料來源：仍讀 data/rosters/<teamId>.json
   - 支援 squad=first / squad=second
   - 新增球隊 Hero、教練卡、球員卡、分類統計
   - 沒資料時清楚顯示，不爆版
========================================================= */

const VERSION = "v5.5.0-PLAYER-PROFILE-LINK";

const TEAM_META = {
  brothers: {
    name: "中信兄弟",
    shortName: "兄弟",
    color: "#f6c400",
    colorDark: "#1f2937",
    logo: "assets/logo/brothers.png",
    home: "臺中洲際棒球場"
  },
  lions: {
    name: "統一7-ELEVEn獅",
    shortName: "統一獅",
    color: "#f26b21",
    colorDark: "#7c2d12",
    logo: "assets/logo/lions.png",
    home: "臺南市立棒球場"
  },
  monkeys: {
    name: "樂天桃猿",
    shortName: "桃猿",
    color: "#8a1538",
    colorDark: "#3f0a1f",
    logo: "assets/logo/monkeys.png",
    home: "樂天桃園棒球場"
  },
  dragons: {
    name: "味全龍",
    shortName: "味全龍",
    color: "#c8102e",
    colorDark: "#5f0b16",
    logo: "assets/logo/dragons.png",
    home: "天母棒球場"
  },
  guardians: {
    name: "富邦悍將",
    shortName: "悍將",
    color: "#0047ab",
    colorDark: "#082f6f",
    logo: "assets/logo/guardians.png",
    home: "新莊棒球場"
  },
  hawks: {
    name: "台鋼雄鷹",
    shortName: "雄鷹",
    color: "#007f7a",
    colorDark: "#064e4a",
    logo: "assets/logo/hawks.png",
    home: "澄清湖棒球場"
  }
};

const SQUAD_TEXT = {
  first: "一軍",
  second: "二軍"
};

const GROUP_ICON = {
  投手: "⚾",
  捕手: "🧤",
  內野手: "🏟️",
  外野手: "🚀"
};

const pageTitle = document.getElementById("pageTitle");
const pageSub = document.getElementById("pageSub");
const heroCard = document.getElementById("teamRosterHeroCard");

const params = new URLSearchParams(location.search);
const teamId = cleanText(params.get("team"));
const squad = cleanText(params.get("squad")) || "first";

const coachBox = document.getElementById("coachList");
const playerHint = document.getElementById("playerList");
const playersContainer = document.getElementById("playersContainer");
const backToTeam = document.getElementById("backToTeam");
const coachCountPill = document.getElementById("coachCountPill");
const playerCountPill = document.getElementById("playerCountPill");

initRosterPage();

async function initRosterPage() {
  try {
    if (!teamId) {
      throw new Error("缺少 team 參數");
    }

    if (!["first", "second"].includes(squad)) {
      throw new Error("invalid squad");
    }

    applyTeamTheme(teamId);

    if (backToTeam) {
      backToTeam.href = `team.html?team=${encodeURIComponent(teamId)}`;
    }

    const data = await loadRoster(teamId);
    const squadText = SQUAD_TEXT[squad] || "一軍";
    const teamName = data.teamName || TEAM_META[teamId]?.name || "球隊";

    setText(pageTitle, `${teamName}｜${squadText}名單`);
    setText(pageSub, `官方球員名單｜更新時間：${formatDateTime(data.updatedAt)}`);

    renderTeamRosterHero(data, squad);
    renderSquadTabs(data);
    renderCoaches(data.coaches, squad);
    renderPlayers(data.players, squad);
    renderTransactions(data.transactions);

  } catch (err) {
    console.error("❌ 球隊名單載入失敗：", err);
    renderError(err.message || "名單載入失敗");
  }
}

async function loadRoster(id) {
  const res = await fetch(`data/rosters/${encodeURIComponent(id)}.json?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!res.ok) throw new Error("roster not found");
  return res.json();
}

function applyTeamTheme(id) {
  const meta = TEAM_META[id] || {};

  document.body.classList.add(`team-${id}`);
  document.body.style.setProperty("--team-color", meta.color || "#0b3c5d");
  document.body.style.setProperty("--team-color-dark", meta.colorDark || "#0f172a");
}

function renderTeamRosterHero(data, squadKey) {
  if (!heroCard) return;

  const meta = TEAM_META[teamId] || {};
  const teamName = data.teamName || meta.name || "球隊";
  const squadText = SQUAD_TEXT[squadKey] || "一軍";
  const counts = getRosterCounts(data, squadKey);

  heroCard.innerHTML = `
    <div class="team-roster-hero-bg-text">ROSTER</div>

    <div class="team-roster-hero-main">
      <div class="team-roster-logo-wrap">
        <img src="${escapeHtml(meta.logo || `assets/logo/${teamId}.png`)}" alt="${escapeHtml(teamName)}">
      </div>

      <div class="team-roster-hero-info">
        <span class="team-roster-kicker">${escapeHtml(squadText)} TEAM ROSTER</span>
        <h2>${escapeHtml(teamName)}</h2>
        <p>${escapeHtml(squadText)}名單・教練團・球員分類</p>

        <div class="team-roster-hero-actions">
          <a href="team.html?team=${encodeURIComponent(teamId)}">球隊總覽</a>
          <a href="team-roster.html?team=${encodeURIComponent(teamId)}&squad=first" class="${squadKey === "first" ? "active" : ""}">一軍</a>
          <a href="team-roster.html?team=${encodeURIComponent(teamId)}&squad=second" class="${squadKey === "second" ? "active" : ""}">二軍</a>
          <a href="team-transactions.html?team=${encodeURIComponent(teamId)}">異動</a>
        </div>
      </div>
    </div>

    <div class="team-roster-stat-grid">
      <div class="team-roster-stat">
        <span>教練團</span>
        <strong>${counts.coaches}</strong>
      </div>
      <div class="team-roster-stat">
        <span>球員</span>
        <strong>${counts.players}</strong>
      </div>
      <div class="team-roster-stat">
        <span>軍別</span>
        <strong>${escapeHtml(squadText)}</strong>
      </div>
      <div class="team-roster-stat">
        <span>主場</span>
        <strong>${escapeHtml(meta.home || "—")}</strong>
      </div>
    </div>
  `;
}

function getRosterCounts(data, squadKey) {
  const coaches = data.coaches?.[squadKey]?.list?.length || 0;
  const players = countSquadPlayers(data.players, squadKey);

  return { coaches, players };
}

function countSquadPlayers(players = {}, squadKey) {
  const keys = [
    `${squadKey}_投手`,
    `${squadKey}_捕手`,
    `${squadKey}_內野手`,
    `${squadKey}_外野手`
  ];

  return keys.reduce((sum, key) => sum + (players?.[key]?.list?.length || 0), 0);
}

function renderSquadTabs() {
  const existing = document.querySelector(".squad-tabs");
  if (existing) existing.remove();

  const tab = document.createElement("div");
  tab.className = "squad-tabs squad-tabs-pro";

  tab.innerHTML = `
    <a class="${squad === "first" ? "active" : ""}" href="team-roster.html?team=${encodeURIComponent(teamId)}&squad=first">一軍名單</a>
    <a class="${squad === "second" ? "active" : ""}" href="team-roster.html?team=${encodeURIComponent(teamId)}&squad=second">二軍名單</a>
    <a href="team-transactions.html?team=${encodeURIComponent(teamId)}">球員異動</a>
  `;

  const zone = document.querySelector(".team-roster-panel");

  if (zone) {
    zone.insertBefore(tab, zone.firstElementChild);
  }
}

/* =====================
   教練團
===================== */
function renderCoaches(coaches, squadKey) {
  if (!coachBox) return;

  const group = coaches?.[squadKey];
  const list = Array.isArray(group?.list) ? group.list : [];

  if (coachCountPill) {
    coachCountPill.textContent = list.length ? `${list.length} 人` : "尚無資料";
  }

  if (!list.length) {
    coachBox.innerHTML = renderEmptyState("尚未建立教練資料", "請確認 data/rosters 資料是否已更新。");
    return;
  }

  coachBox.innerHTML = `
    <div class="roster-group-head">
      <div>
        <span class="roster-kicker">${escapeHtml(SQUAD_TEXT[squadKey] || "一軍")}</span>
        <h3>${escapeHtml(group.title || "教練團")}</h3>
      </div>
      <span class="roster-mini-pill">${list.length} 人</span>
    </div>

    <div class="coach-card-grid">
      ${list.map(c => renderCoachCard(c, squadKey)).join("")}
    </div>
  `;
}

function renderCoachCard(coach, squadKey) {
  return `
    <article class="coach-card" data-squad="${escapeHtml(squadKey)}">
      <div class="coach-number">#${escapeHtml(coach.number || "—")}</div>
      <div class="coach-main">
        <strong>${escapeHtml(coach.name || "—")}</strong>
        <span>${escapeHtml(coach.role || "教練")}</span>
      </div>
      <div class="coach-tag">${escapeHtml(SQUAD_TEXT[squadKey] || "一軍")}</div>
    </article>
  `;
}

/* =====================
   球員名單
===================== */
function renderPlayers(players, squadKey) {
  if (!playersContainer) return;

  if (playerHint) {
    playerHint.textContent = "";
  }

  playersContainer.innerHTML = "";

  if (!players || !Object.keys(players).length) {
    playersContainer.innerHTML = renderEmptyState("尚未建立球員資料", "目前沒有可顯示的球員名單。");
    if (playerCountPill) playerCountPill.textContent = "尚無資料";
    return;
  }

  const order = [
    `${squadKey}_投手`,
    `${squadKey}_捕手`,
    `${squadKey}_內野手`,
    `${squadKey}_外野手`
  ];

  let hasAny = false;
  let total = 0;

  order.forEach(key => {
    const group = players[key];
    const list = Array.isArray(group?.list) ? group.list : [];

    if (!group || !list.length) return;

    hasAny = true;
    total += list.length;

    const section = document.createElement("section");
    section.className = "roster-section roster-section-pro";

    const groupName = cleanGroupTitle(group.title || group.group || key);
    const icon = GROUP_ICON[groupName] || "🧢";

    section.innerHTML = `
      <div class="roster-group-head">
        <div>
          <span class="roster-kicker">${escapeHtml(SQUAD_TEXT[squadKey] || "一軍")}</span>
          <h3>${icon} ${escapeHtml(group.title || groupName)}</h3>
        </div>
        <span class="roster-mini-pill">${list.length} 人</span>
      </div>

      <div class="player-card-grid">
        ${list.map(p => renderPlayerCard(p, group, squadKey)).join("")}
      </div>
    `;

    playersContainer.appendChild(section);
  });

  if (playerCountPill) {
    playerCountPill.textContent = total ? `${total} 人` : "尚無資料";
  }

  if (!hasAny) {
    playersContainer.innerHTML = renderEmptyState("此軍別尚未建立球員資料", "可切換一軍 / 二軍或檢查 roster JSON。");
  }
}

function renderPlayerCard(player, group, squadKey) {
  const position = player.position || group.group || cleanGroupTitle(group.title || "球員");
  const number = player.number || "—";
  const name = player.name || "—";
  const playerUrl = makePlayerProfileUrl(name);

  return `
    <a class="player-card player-card-pro player-card-link"
       data-squad="${escapeHtml(squadKey)}"
       href="${escapeHtml(playerUrl)}"
       title="查看 ${escapeHtml(name)} 的個人頁">
      <div class="player-card-glow"></div>
      <div class="player-card-top">
        <span class="player-number-badge">#${escapeHtml(number)}</span>
        <span class="player-position-badge">${escapeHtml(position)}</span>
      </div>

      <div class="player-card-body">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(SQUAD_TEXT[squadKey] || "一軍")} ${escapeHtml(position)}</span>
      </div>

      <div class="player-card-footer">
        <span>查看個人頁 →</span>
      </div>
    </a>
  `;
}

function makePlayerProfileUrl(name) {
  const playerName = cleanText(name);

  if (!playerName || playerName === "—") {
    return "player.html";
  }

  return `player.html?name=${encodeURIComponent(playerName)}`;
}

function cleanGroupTitle(title = "") {
  const s = String(title || "");

  if (s.includes("投手")) return "投手";
  if (s.includes("捕手")) return "捕手";
  if (s.includes("內野")) return "內野手";
  if (s.includes("外野")) return "外野手";

  return s.replace(/^一軍|^二軍/g, "").trim() || "球員";
}

/* =====================
   球員異動
===================== */
function renderTransactions(transactions = []) {
  if (!playersContainer) return;

  const section = document.createElement("section");
  section.className = "roster-section roster-section-pro transaction-section-pro";

  const recent = Array.isArray(transactions) ? transactions.slice(0, 12) : [];

  section.innerHTML = `
    <div class="roster-group-head">
      <div>
        <span class="roster-kicker">TRANSACTIONS</span>
        <h3>🔁 最近球員異動</h3>
      </div>
      <span class="roster-mini-pill">${recent.length} 筆</span>
    </div>
    ${
      recent.length
        ? `
          <div class="transaction-list transaction-list-pro">
            ${recent.map(t => `
              <div class="transaction-item transaction-item-pro">
                <strong>${escapeHtml(t.date || "—")}</strong>
                <span>${escapeHtml(t.player || "—")}</span>
                <em>${escapeHtml(t.reason || "異動")}</em>
              </div>
            `).join("")}
          </div>
        `
        : renderEmptyState("目前沒有異動資料", "球員異動資料尚未建立或近期沒有異動。")
    }
  `;

  playersContainer.appendChild(section);
}

function renderEmptyState(title, desc) {
  return `
    <div class="roster-empty-state">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(desc || "")}</span>
    </div>
  `;
}

function renderError(message) {
  setText(pageTitle, "球隊名單載入失敗");
  setText(pageSub, message);

  if (heroCard) {
    heroCard.innerHTML = renderEmptyState("球隊名單載入失敗", message);
  }

  if (coachBox) coachBox.innerHTML = renderEmptyState("名單載入失敗", message);
  if (playerHint) playerHint.textContent = "";
  if (playersContainer) playersContainer.innerHTML = "";
}

/* =====================
   工具
===================== */
function formatDateTime(iso) {
  if (!iso) return "未知";

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function setText(el, value) {
  if (el) el.textContent = value;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
