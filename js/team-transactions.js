console.log("✅ team-transactions.js v5.0.9-TEAM-TRANSACTIONS-PRO 已載入");

/* =========================================================
   Ray's CPBL Data Site
   team-transactions.js
   v5.0.9-TEAM-TRANSACTIONS-PRO

   來源：data/rosters/<teamId>.json
   支援：
   - transactions: [{ date, player, reason, note, from, to, type, squad }]
   - 自動分類：升一軍 / 降二軍 / 新註冊 / 註銷 / 其他
   - 月份、異動原因、球員搜尋
========================================================= */

const TEAM_INFO = {
  brothers: {
    name: "中信兄弟",
    short: "兄弟",
    color: "#f6c400",
    dark: "#101820",
    logo: "assets/logo/brothers.png"
  },
  lions: {
    name: "統一7-ELEVEn獅",
    short: "統一",
    color: "#f26b21",
    dark: "#3a1b05",
    logo: "assets/logo/lions.png"
  },
  monkeys: {
    name: "樂天桃猿",
    short: "樂天",
    color: "#8a1538",
    dark: "#2a0613",
    logo: "assets/logo/monkeys.png"
  },
  dragons: {
    name: "味全龍",
    short: "味全",
    color: "#c8102e",
    dark: "#310710",
    logo: "assets/logo/dragons.png"
  },
  guardians: {
    name: "富邦悍將",
    short: "富邦",
    color: "#0047ab",
    dark: "#061a36",
    logo: "assets/logo/guardians.png"
  },
  hawks: {
    name: "台鋼雄鷹",
    short: "台鋼",
    color: "#007f7a",
    dark: "#062c2b",
    logo: "assets/logo/hawks.png"
  }
};

const params = new URLSearchParams(location.search);
const teamId = cleanText(params.get("team"));

const pageTitle = document.getElementById("pageTitle");
const pageSub = document.getElementById("pageSub");
const listBox = document.getElementById("transactionsList");
const summaryBox = document.getElementById("transactionsSummary");
const statsBox = document.getElementById("transactionStats");
const activeFiltersBox = document.getElementById("activeTransactionFilters");

const monthFilter = document.getElementById("monthFilter");
const reasonFilter = document.getElementById("reasonFilter");
const playerSearch = document.getElementById("playerSearch");
const clearFilterBtn = document.getElementById("btnClearTransactionFilter");

const tabFirst = document.getElementById("tabFirst");
const tabSecond = document.getElementById("tabSecond");
const tabTransactions = document.getElementById("tabTransactions");
const backToTeam = document.getElementById("backToTeam");
const teamLogo = document.getElementById("teamLogo");
const teamBadgeText = document.getElementById("teamBadgeText");

let rosterData = null;
let transactions = [];

document.addEventListener("DOMContentLoaded", initTransactionsPage);

async function initTransactionsPage() {
  try {
    if (!teamId) {
      showMissingTeam();
      return;
    }

    setupLinks();
    applyTeamTheme();

    const res = await fetch(`data/rosters/${encodeURIComponent(teamId)}.json?ts=${Date.now()}`, {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`roster not found: HTTP ${res.status}`);
    }

    rosterData = await res.json();
    transactions = normalizeTransactions(rosterData.transactions);

    renderHeader();
    initFilters();
    render();

  } catch (err) {
    console.error("❌ 球員異動載入失敗：", err);
    pageSub.textContent = "資料載入失敗";
    listBox.innerHTML = `
      <div class="transaction-empty">
        <strong>球員異動載入失敗</strong>
        <p>請確認 data/rosters/${escapeHtml(teamId || "team")}.json 是否存在，且 transactions 欄位格式正確。</p>
      </div>
    `;
  }
}

function showMissingTeam() {
  pageTitle.textContent = "球員異動";
  pageSub.textContent = "缺少 team 參數";
  listBox.innerHTML = `
    <div class="transaction-empty">
      <strong>缺少球隊參數</strong>
      <p>請從球隊頁進入，例如：team-transactions.html?team=brothers</p>
      <a class="card-link" href="teams.html">返回球隊列表</a>
    </div>
  `;
}

function setupLinks() {
  if (tabFirst) tabFirst.href = `team-roster.html?team=${encodeURIComponent(teamId)}&squad=first`;
  if (tabSecond) tabSecond.href = `team-roster.html?team=${encodeURIComponent(teamId)}&squad=second`;
  if (tabTransactions) tabTransactions.href = `team-transactions.html?team=${encodeURIComponent(teamId)}`;
  if (backToTeam) backToTeam.href = `team.html?team=${encodeURIComponent(teamId)}`;
}

function applyTeamTheme() {
  const info = TEAM_INFO[teamId] || {
    name: teamId,
    short: teamId,
    color: "#0b3c5d",
    dark: "#0f172a",
    logo: "assets/logo/cpbl.png"
  };

  document.body.style.setProperty("--team-color", info.color);
  document.body.style.setProperty("--team-dark", info.dark);
  document.body.style.setProperty("--team-color-soft", `${info.color}22`);
  document.body.style.setProperty("--team-color-mid", `${info.color}55`);

  if (teamLogo) {
    teamLogo.src = info.logo;
    teamLogo.alt = info.name;
  }

  if (teamBadgeText) {
    teamBadgeText.textContent = `${info.short} 異動`;
  }
}

function renderHeader() {
  const info = TEAM_INFO[teamId] || {};
  const teamName = rosterData.teamName || info.name || "球隊";

  pageTitle.textContent = `${teamName}｜球員異動`;
  pageSub.textContent = `官方異動資料｜更新時間：${formatDateTime(rosterData.updatedAt)}`;
}

function normalizeTransactions(input) {
  const arr = Array.isArray(input) ? input : [];

  return arr
    .filter(item => item && typeof item === "object")
    .map((item, index) => {
      const date = cleanText(item.date || item.createdAt || item.updateDate);
      const player = cleanText(item.player || item.name || item.playerName);
      const reason = cleanText(item.reason || item.type || item.action || item.move);
      const note = cleanText(item.note || item.memo || item.remark || item.description);
      const from = cleanText(item.from || item.fromSquad || item.source);
      const to = cleanText(item.to || item.toSquad || item.target);
      const squad = cleanText(item.squad || item.level || item.roster);
      const category = getTransactionCategory(reason, note, from, to, squad);

      return {
        id: `${date}-${player}-${reason}-${index}`,
        date,
        month: date ? date.slice(0, 7) : "",
        player,
        reason,
        note,
        from,
        to,
        squad,
        category,
        raw: item
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function initFilters() {
  const months = [...new Set(
    transactions
      .map(t => t.month)
      .filter(Boolean)
  )].sort().reverse();

  monthFilter.innerHTML = `
    <option value="">全部月份</option>
    ${months.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")}
  `;

  const reasons = [...new Set(
    transactions
      .map(t => t.category)
      .filter(Boolean)
  )];

  const preferredOrder = ["升一軍", "降二軍", "新註冊", "註銷", "其他"];
  const sortedReasons = preferredOrder.filter(x => reasons.includes(x))
    .concat(reasons.filter(x => !preferredOrder.includes(x)));

  reasonFilter.innerHTML = `
    <option value="">全部異動</option>
    ${sortedReasons.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("")}
  `;

  monthFilter.addEventListener("change", render);
  reasonFilter.addEventListener("change", render);
  playerSearch.addEventListener("input", render);

  if (clearFilterBtn) {
    clearFilterBtn.addEventListener("click", () => {
      monthFilter.value = "";
      reasonFilter.value = "";
      playerSearch.value = "";
      render();
    });
  }
}

function getFilteredTransactions() {
  const month = monthFilter.value;
  const reason = reasonFilter.value;
  const q = playerSearch.value.trim().toLowerCase();

  return transactions.filter(t => {
    const haystack = [
      t.player,
      t.reason,
      t.note,
      t.from,
      t.to,
      t.squad,
      t.category
    ].join(" ").toLowerCase();

    if (month && t.month !== month) return false;
    if (reason && t.category !== reason) return false;
    if (q && !haystack.includes(q)) return false;

    return true;
  });
}

function render() {
  const rows = getFilteredTransactions();

  renderSummary(rows);
  renderStats(rows);
  renderActiveFilters();

  if (!rows.length) {
    listBox.innerHTML = `
      <div class="transaction-empty">
        <strong>目前沒有符合條件的異動資料</strong>
        <p>可以清除篩選，或確認該隊目前是否尚未建立 transactions 資料。</p>
      </div>
    `;
    return;
  }

  const grouped = groupByMonth(rows);

  listBox.innerHTML = Object.entries(grouped).map(([month, items]) => `
    <section class="transaction-month-group">
      <div class="transaction-month-head">
        <h3>${escapeHtml(month || "日期未定")}</h3>
        <span>${items.length} 筆</span>
      </div>

      <div class="transaction-card-grid">
        ${items.map(renderTransactionCard).join("")}
      </div>
    </section>
  `).join("");
}

function renderSummary(rows) {
  if (!summaryBox) return;

  summaryBox.innerHTML = `
    共 <strong>${transactions.length}</strong> 筆異動｜
    目前顯示 <strong>${rows.length}</strong> 筆
  `;
}

function renderStats(rows) {
  if (!statsBox) return;

  const all = transactions.length;
  const up = transactions.filter(t => t.category === "升一軍").length;
  const down = transactions.filter(t => t.category === "降二軍").length;
  const latestMonth = transactions[0]?.month || "—";
  const showing = rows.length;

  statsBox.innerHTML = `
    <div class="transaction-stat-card">
      <span>全部異動</span>
      <strong>${all}</strong>
      <em>資料庫總筆數</em>
    </div>

    <div class="transaction-stat-card move-up">
      <span>升一軍</span>
      <strong>${up}</strong>
      <em>登錄 / 升上一軍</em>
    </div>

    <div class="transaction-stat-card move-down">
      <span>降二軍</span>
      <strong>${down}</strong>
      <em>下放 / 降二軍</em>
    </div>

    <div class="transaction-stat-card">
      <span>目前顯示</span>
      <strong>${showing}</strong>
      <em>最近月份：${escapeHtml(latestMonth)}</em>
    </div>
  `;
}

function renderActiveFilters() {
  if (!activeFiltersBox) return;

  const chips = [];

  if (monthFilter.value) chips.push(`月份：${monthFilter.value}`);
  if (reasonFilter.value) chips.push(`異動：${reasonFilter.value}`);
  if (playerSearch.value.trim()) chips.push(`搜尋：${playerSearch.value.trim()}`);

  if (!chips.length) {
    activeFiltersBox.innerHTML = "";
    return;
  }

  activeFiltersBox.innerHTML = chips.map(chip => `
    <span>${escapeHtml(chip)}</span>
  `).join("");
}

function groupByMonth(rows) {
  return rows.reduce((acc, row) => {
    const key = row.month || "日期未定";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function renderTransactionCard(t) {
  const cls = getReasonClass(t.category || t.reason);

  return `
    <article class="transaction-card ${cls}">
      <div class="transaction-card-top">
        <span class="transaction-date">${escapeHtml(t.date || "日期未知")}</span>
        <span class="transaction-type">${escapeHtml(t.category || t.reason || "異動")}</span>
      </div>

      <div class="transaction-player-row">
        <div class="transaction-player-avatar">${escapeHtml(getInitial(t.player))}</div>
        <div>
          <strong>${escapeHtml(t.player || "球員未知")}</strong>
          <span>${escapeHtml(t.reason || "異動原因未知")}</span>
        </div>
      </div>

      ${
        t.from || t.to || t.squad
          ? `
            <div class="transaction-route">
              ${t.from ? `<span>From：${escapeHtml(t.from)}</span>` : ""}
              ${t.to ? `<span>To：${escapeHtml(t.to)}</span>` : ""}
              ${t.squad ? `<span>層級：${escapeHtml(t.squad)}</span>` : ""}
            </div>
          `
          : ""
      }

      ${
        t.note
          ? `<p class="transaction-note">${escapeHtml(t.note)}</p>`
          : ""
      }
    </article>
  `;
}

function getTransactionCategory(reason = "", note = "", from = "", to = "", squad = "") {
  const text = `${reason} ${note} ${from} ${to} ${squad}`;

  if (/升一軍|上一軍|登錄一軍|一軍登錄|升上/.test(text)) return "升一軍";
  if (/降二軍|下二軍|下放|註銷一軍|移出一軍/.test(text)) return "降二軍";
  if (/新註冊|新登錄|註冊|登錄/.test(text)) return "新註冊";
  if (/註銷|除役|移除|釋出/.test(text)) return "註銷";

  return cleanText(reason) || "其他";
}

function getReasonClass(reason = "") {
  const s = cleanText(reason);

  if (s.includes("升一軍")) return "move-up";
  if (s.includes("降二軍")) return "move-down";
  if (s.includes("新註冊")) return "move-new";
  if (s.includes("註銷")) return "move-out";

  return "move-other";
}

function getInitial(name = "") {
  const s = cleanText(name);

  if (!s) return "球";

  return s.slice(0, 1);
}

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

function cleanText(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
