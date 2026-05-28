console.log("✅ team-stats.js v5.0.5 TEAM STATS PRO 已載入");

/* =========================
   Ray's CPBL Data Site
   team-stats.js
   v5.0.5-TEAM-STATS-PRO
   來源：data/live/live-boxscore.json
========================= */

const LIVE_BOXSCORE_URL = "data/live/live-boxscore.json";
const VERSION = "v5.0.5-TEAM-STATS-PRO";

const TEAM_ID_TO_NAME = {
  brothers: "中信兄弟",
  lions: "統一7-ELEVEn獅",
  monkeys: "樂天桃猿",
  dragons: "味全龍",
  guardians: "富邦悍將",
  hawks: "台鋼雄鷹"
};

const TEAM_IDS = {
  "中信兄弟": "brothers",
  "統一7-ELEVEn獅": "lions",
  "樂天桃猿": "monkeys",
  "味全龍": "dragons",
  "富邦悍將": "guardians",
  "台鋼雄鷹": "hawks"
};

const TEAM_COLORS = {
  brothers: "#f6c400",
  lions: "#f26b21",
  monkeys: "#8a1538",
  dragons: "#c8102e",
  guardians: "#0047ab",
  hawks: "#007f7a"
};

const TEAM_SUBTITLE = {
  brothers: "Brothers",
  lions: "Uni-Lions",
  monkeys: "Rakuten Monkeys",
  dragons: "Wei Chuan Dragons",
  guardians: "Fubon Guardians",
  hawks: "TSG Hawks"
};

document.addEventListener("DOMContentLoaded", initTeamStats);

async function initTeamStats() {
  const params = new URLSearchParams(location.search);
  const teamId = cleanText(params.get("team"));
  const teamName = TEAM_ID_TO_NAME[teamId];

  const titleEl = document.getElementById("teamTitle");
  const subEl = document.getElementById("teamSub");

  if (!teamId || !teamName) {
    if (titleEl) titleEl.textContent = "球隊分析";
    if (subEl) subEl.textContent = "缺少或錯誤的 team 參數";
    renderError("缺少或錯誤的 team 參數，請從球隊列表重新進入。");
    return;
  }

  applyTeamTheme(teamId, teamName);

  if (titleEl) titleEl.textContent = `${teamName}｜球隊分析`;
  if (subEl) subEl.textContent = "近期表現統計";

  const scheduleLink = document.getElementById("linkSchedule");
  if (scheduleLink) {
    scheduleLink.href = `schedule.html?team=${encodeURIComponent(teamName)}`;
  }

  try {
    const games = await loadGames();
    const teamGames = games
      .filter(g => includesTeam(g, teamName))
      .sort(sortByDateTime);

    const model = buildTeamStatsModel(teamId, teamName, teamGames, games);

    renderTeamHero(model);
    renderSummary(model);
    renderRecentGames(model);
    renderHomeAway(model);
    renderVsTeams(model);

  } catch (err) {
    console.error("❌ team-stats 載入失敗：", err);
    renderError(`資料載入失敗：${err.message}`);
  }
}

/* =========================
   資料讀取 / 正規化
========================= */

async function loadGames() {
  const res = await fetch(`${LIVE_BOXSCORE_URL}?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const arr = Array.isArray(data) ? data : Object.values(data || {});

  return arr
    .filter(g => g && typeof g === "object")
    .map(g => ({
      ...g,
      gameSno: Number(g.gameSno || 0),
      meta: {
        ...(g.meta || {}),
        home: normalizeTeamName(g.meta?.home),
        away: normalizeTeamName(g.meta?.away),
        date: cleanText(g.meta?.date),
        time: cleanText(g.meta?.time),
        venue: cleanText(g.meta?.venue),
        status: normalizeStatus(g.meta?.status, g.meta?.statusText)
      },
      totals: normalizeTotals(g.totals)
    }));
}

function normalizeStatus(status, statusText = "") {
  const s = cleanText(status).toLowerCase();
  const text = `${status || ""} ${statusText || ""}`;

  if (["final", "finished"].includes(s) || /結束|FINAL|完賽/i.test(text)) return "final";
  if (["live", "in_progress", "playing"].includes(s) || /LIVE|比賽中|進行中/.test(text)) return "live";
  if (s === "postponed" || /延賽/.test(text)) return "postponed";
  if (s === "suspended" || /保留/.test(text)) return "suspended";
  if (s === "cancelled" || s === "canceled" || /取消/.test(text)) return "cancelled";
  if (s === "pregame") return "pregame";

  return "scheduled";
}

function normalizeTotals(totals = {}) {
  return {
    away: {
      R: toNumberOrNull(totals.away?.R),
      H: toNumberOrNull(totals.away?.H),
      E: toNumberOrNull(totals.away?.E)
    },
    home: {
      R: toNumberOrNull(totals.home?.R),
      H: toNumberOrNull(totals.home?.H),
      E: toNumberOrNull(totals.home?.E)
    }
  };
}

function normalizeTeamName(name) {
  return String(name || "")
    .replace("7-ELEVEN", "7-ELEVEn")
    .trim();
}

function includesTeam(g, teamName) {
  return (
    normalizeTeamName(g?.meta?.home) === teamName ||
    normalizeTeamName(g?.meta?.away) === teamName
  );
}

function isFinal(g) {
  return g?.meta?.status === "final";
}

function hasScore(g) {
  return (
    isFinal(g) &&
    typeof g?.totals?.home?.R === "number" &&
    typeof g?.totals?.away?.R === "number"
  );
}

function sortByDateTime(a, b) {
  const ad = `${a.meta?.date || ""} ${a.meta?.time || "00:00"}`;
  const bd = `${b.meta?.date || ""} ${b.meta?.time || "00:00"}`;
  return ad.localeCompare(bd);
}

/* =========================
   模型
========================= */

function buildTeamStatsModel(teamId, teamName, teamGames, allGames) {
  const finals = teamGames.filter(hasScore);
  const record = calcRecord(teamGames, teamName);
  const recent10 = finals.slice(-10);
  const recent5 = finals.slice(-5);
  const recentRecord = calcRecord(recent10, teamName);
  const results = finals.map(g => getTeamResult(g, teamName)).filter(Boolean);
  const homeGames = teamGames.filter(g => g.meta.home === teamName);
  const awayGames = teamGames.filter(g => g.meta.away === teamName);
  const homeRecord = calcRecord(homeGames, teamName);
  const awayRecord = calcRecord(awayGames, teamName);

  return {
    teamId,
    teamName,
    allGames,
    teamGames,
    finals,
    record,
    recent10,
    recent5,
    recentRecord,
    results,
    homeRecord,
    awayRecord,
    upcomingGames: teamGames.filter(g => !hasScore(g) && !["postponed", "cancelled"].includes(g.meta.status)),
    postponedGames: teamGames.filter(g => ["postponed", "suspended", "cancelled"].includes(g.meta.status)),
    color: TEAM_COLORS[teamId] || "#0b3c5d",
    logo: getTeamLogo(teamName),
    subtitle: TEAM_SUBTITLE[teamId] || "CPBL Team"
  };
}

function calcRecord(games, teamName) {
  const record = {
    games: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    runsFor: 0,
    runsAgainst: 0
  };

  games.forEach(g => {
    if (!hasScore(g)) return;

    const isHome = g.meta.home === teamName;
    const myScore = isHome ? g.totals.home.R : g.totals.away.R;
    const oppScore = isHome ? g.totals.away.R : g.totals.home.R;

    record.games++;
    record.runsFor += myScore;
    record.runsAgainst += oppScore;

    if (myScore > oppScore) record.wins++;
    else if (myScore < oppScore) record.losses++;
    else record.ties++;
  });

  record.winPct = (record.wins + record.losses)
    ? record.wins / (record.wins + record.losses)
    : null;

  record.runDiff = record.runsFor - record.runsAgainst;
  record.avgRunsFor = record.games ? record.runsFor / record.games : null;
  record.avgRunsAgainst = record.games ? record.runsAgainst / record.games : null;

  return record;
}

function getTeamResult(g, teamName) {
  if (!hasScore(g)) return null;

  const isHome = g.meta.home === teamName;
  const myScore = isHome ? g.totals.home.R : g.totals.away.R;
  const oppScore = isHome ? g.totals.away.R : g.totals.home.R;

  if (myScore > oppScore) return "W";
  if (myScore < oppScore) return "L";
  return "T";
}

function getOpponent(g, teamName) {
  return g.meta.home === teamName ? g.meta.away : g.meta.home;
}

function getScoreText(g) {
  if (!hasScore(g)) {
    if (g.meta?.status === "postponed") return "延賽";
    if (g.meta?.status === "cancelled") return "取消";
    if (g.meta?.status === "suspended") return "保留";
    return "未開賽";
  }

  return `${g.meta.away} ${g.totals.away.R} : ${g.totals.home.R} ${g.meta.home}`;
}

function getMyScorePair(g, teamName) {
  const isHome = g.meta.home === teamName;

  return {
    myScore: isHome ? g.totals.home.R : g.totals.away.R,
    oppScore: isHome ? g.totals.away.R : g.totals.home.R,
    side: isHome ? "主場" : "客場"
  };
}

function getStreak(results) {
  if (!results.length) return "—";

  const last = results[results.length - 1];
  let count = 1;

  for (let i = results.length - 2; i >= 0; i--) {
    if (results[i] === last) count++;
    else break;
  }

  const label = last === "W" ? "連勝" : last === "L" ? "連敗" : "連和";
  return `${count}${label}`;
}

/* =========================
   Render
========================= */

function renderTeamHero(model) {
  const box = document.getElementById("teamStatsHero");
  if (!box) return;

  const { teamName, subtitle, logo, record, recentRecord, finals, teamGames, upcomingGames, postponedGames } = model;

  box.innerHTML = `
    <div class="team-stats-hero-main">
      <div class="team-stats-logo-wrap">
        <img src="${escapeHtml(logo)}" alt="${escapeHtml(teamName)}">
      </div>

      <div class="team-stats-hero-text">
        <span class="team-stats-kicker">TEAM ANALYTICS</span>
        <h2>${escapeHtml(teamName)}</h2>
        <p>${escapeHtml(subtitle)}｜近期表現、主客場與對戰紀錄</p>

        <div class="team-stats-hero-pills">
          <span>${record.wins}-${record.losses}-${record.ties}</span>
          <span>勝率 ${formatPct(record.winPct)}</span>
          <span>近 10 場 ${recentRecord.wins}-${recentRecord.losses}-${recentRecord.ties}</span>
          <span>${getStreak(model.results)}</span>
        </div>
      </div>
    </div>

    <div class="team-stats-hero-grid">
      <div>
        <span>賽程總數</span>
        <strong>${teamGames.length}</strong>
      </div>
      <div>
        <span>已完賽</span>
        <strong>${finals.length}</strong>
      </div>
      <div>
        <span>未來賽事</span>
        <strong>${upcomingGames.length}</strong>
      </div>
      <div>
        <span>特殊狀態</span>
        <strong>${postponedGames.length}</strong>
      </div>
    </div>
  `;
}

function renderSummary(model) {
  const cards = document.getElementById("summaryCards");
  const legacy = document.getElementById("summaryList");

  const { record, recentRecord, teamGames, finals, results } = model;

  const items = [
    {
      label: "總戰績",
      value: `${record.wins}-${record.losses}-${record.ties}`,
      sub: `已完賽 ${finals.length} / 賽程 ${teamGames.length}`,
      tone: "primary"
    },
    {
      label: "勝率",
      value: formatPct(record.winPct),
      sub: "不含和局計算",
      tone: "good"
    },
    {
      label: "得失分差",
      value: formatSigned(record.runDiff),
      sub: `得 ${record.runsFor}｜失 ${record.runsAgainst}`,
      tone: record.runDiff >= 0 ? "good" : "bad"
    },
    {
      label: "平均得分",
      value: formatNumber(record.avgRunsFor, 2),
      sub: `平均失分 ${formatNumber(record.avgRunsAgainst, 2)}`,
      tone: "neutral"
    },
    {
      label: "最近 10 場",
      value: `${recentRecord.wins}-${recentRecord.losses}-${recentRecord.ties}`,
      sub: `勝率 ${formatPct(recentRecord.winPct)}`,
      tone: "primary"
    },
    {
      label: "近期狀態",
      value: getStreak(results),
      sub: "依最新完賽結果計算",
      tone: results.at(-1) === "W" ? "good" : results.at(-1) === "L" ? "bad" : "neutral"
    }
  ];

  if (cards) {
    cards.innerHTML = items.map(item => `
      <article class="team-stat-metric-card metric-${escapeHtml(item.tone)}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
        <em>${escapeHtml(item.sub)}</em>
      </article>
    `).join("");
  }

  if (legacy) {
    legacy.innerHTML = `
      <li>總場次：${teamGames.length}</li>
      <li>已完賽：${finals.length}</li>
      <li>勝：${record.wins}｜敗：${record.losses}｜和：${record.ties}</li>
      <li>勝率：${formatPct(record.winPct)}</li>
      <li>得分：${record.runsFor}｜失分：${record.runsAgainst}｜得失分差：${formatSigned(record.runDiff)}</li>
      <li>最近 10 場：${recentRecord.wins} 勝 ${recentRecord.losses} 敗 ${recentRecord.ties} 和（勝率 ${formatPct(recentRecord.winPct)}）</li>
      <li>近期狀態：${getStreak(results)}</li>
      <li>※ 僅統計已完賽且有比分的比賽</li>
    `;
  }
}

function renderRecentGames(model) {
  const box = document.getElementById("recentGames");
  if (!box) return;

  const recent = model.finals
    .slice()
    .sort((a, b) => sortByDateTime(b, a))
    .slice(0, 5);

  if (!recent.length) {
    box.innerHTML = renderEmptyState("目前沒有已完賽比賽");
    return;
  }

  box.innerHTML = recent.map(g => {
    const result = getTeamResult(g, model.teamName);
    const score = getMyScorePair(g, model.teamName);
    const opp = getOpponent(g, model.teamName);
    const resultText = result === "W" ? "勝" : result === "L" ? "敗" : "和";
    const tone = result === "W" ? "win" : result === "L" ? "loss" : "tie";

    return `
      <article class="team-stat-game-card ${tone}">
        <div class="team-stat-game-result">${escapeHtml(resultText)}</div>

        <div class="team-stat-game-main">
          <div class="team-stat-game-date">${escapeHtml(g.meta.date)}｜${escapeHtml(score.side)}｜${escapeHtml(g.meta.venue || "球場待定")}</div>
          <strong>${escapeHtml(model.teamName)} ${score.myScore}：${score.oppScore} ${escapeHtml(opp)}</strong>
          <span>${escapeHtml(getScoreText(g))}</span>
        </div>

        <a href="match.html?gameSno=${encodeURIComponent(g.gameSno)}">比賽中心</a>
      </article>
    `;
  }).join("");
}

function renderHomeAway(model) {
  const cards = document.getElementById("homeAwayCards");
  const legacy = document.getElementById("homeAwayStats");
  const home = model.homeRecord;
  const away = model.awayRecord;

  if (cards) {
    cards.innerHTML = `
      ${renderSplitCard("🏠 主場", home, "home")}
      ${renderSplitCard("✈️ 客場", away, "away")}
    `;
  }

  if (legacy) {
    legacy.innerHTML = `
      <li>🏠 主場：${home.wins} 勝 / ${home.losses} 敗 / ${home.ties} 和（勝率 ${formatPct(home.winPct)}）</li>
      <li>✈️ 客場：${away.wins} 勝 / ${away.losses} 敗 / ${away.ties} 和（勝率 ${formatPct(away.winPct)}）</li>
    `;
  }
}

function renderSplitCard(title, record, type) {
  return `
    <article class="team-stat-split-card ${escapeHtml(type)}">
      <div class="team-stat-split-head">
        <span>${escapeHtml(title)}</span>
        <strong>${record.wins}-${record.losses}-${record.ties}</strong>
      </div>

      <div class="team-stat-split-grid">
        <div>
          <span>勝率</span>
          <strong>${formatPct(record.winPct)}</strong>
        </div>
        <div>
          <span>得分</span>
          <strong>${record.runsFor}</strong>
        </div>
        <div>
          <span>失分</span>
          <strong>${record.runsAgainst}</strong>
        </div>
        <div>
          <span>得失分</span>
          <strong>${formatSigned(record.runDiff)}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderVsTeams(model) {
  const box = document.getElementById("vsTeams");
  if (!box) return;

  const opponents = {};

  Object.keys(TEAM_IDS).forEach(name => {
    if (name !== model.teamName) {
      opponents[name] = [];
    }
  });

  model.teamGames.forEach(g => {
    const opp = getOpponent(g, model.teamName);
    if (!opp || opp === model.teamName) return;
    if (!opponents[opp]) opponents[opp] = [];
    opponents[opp].push(g);
  });

  const rows = Object.entries(opponents).map(([opp, games]) => {
    const r = calcRecord(games, model.teamName);
    const oppId = TEAM_IDS[opp] || "";
    const diff = r.runDiff;

    return `
      <tr>
        <td>
          <div class="team-stat-opponent">
            <img src="${escapeHtml(getTeamLogo(opp))}" alt="${escapeHtml(opp)}">
            <span>${escapeHtml(opp)}</span>
          </div>
        </td>
        <td><strong>${r.wins}-${r.losses}-${r.ties}</strong></td>
        <td>${r.games}</td>
        <td>${formatPct(r.winPct)}</td>
        <td class="${diff >= 0 ? "positive" : "negative"}">${formatSigned(diff)}</td>
        <td>
          <a class="team-stat-mini-link" href="team-stats.html?team=${escapeHtml(oppId)}">查看</a>
        </td>
      </tr>
    `;
  }).join("");

  box.innerHTML = `
    <table class="team-stat-matchup-table">
      <thead>
        <tr>
          <th>對手</th>
          <th>勝-敗-和</th>
          <th>場次</th>
          <th>勝率</th>
          <th>得失分</th>
          <th>分析</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* =========================
   UI helpers
========================= */

function applyTeamTheme(teamId, teamName) {
  const color = TEAM_COLORS[teamId] || "#0b3c5d";

  document.body.style.setProperty("--team-color", color);
  document.body.style.setProperty("--team-color-soft", `${color}20`);
  document.body.style.setProperty("--team-color-faint", `${color}12`);
  document.body.classList.add(`team-theme-${teamId}`);

  const titleEl = document.getElementById("teamTitle");
  if (titleEl) titleEl.dataset.team = teamName;
}

function renderError(message) {
  const hero = document.getElementById("teamStatsHero");
  const summary = document.getElementById("summaryList");

  if (hero) {
    hero.innerHTML = `
      <div class="team-stats-empty-state">
        <strong>資料載入失敗</strong>
        <p>${escapeHtml(message)}</p>
        <a href="teams.html">返回球隊列表</a>
      </div>
    `;
  }

  if (summary) {
    summary.innerHTML = `<li>${escapeHtml(message)}</li>`;
  }
}

function renderEmptyState(text) {
  return `
    <div class="team-stats-empty-state">
      <strong>${escapeHtml(text)}</strong>
      <p>此區會在資料補齊後自動顯示。</p>
    </div>
  `;
}

function getTeamLogo(teamName) {
  const id = TEAM_IDS[teamName];

  return id
    ? `assets/logo/${id}.png`
    : "assets/logo/cpbl.png";
}

function formatPct(value) {
  return value == null ? "—" : value.toFixed(3);
}

function formatNumber(value, digits = 1) {
  return value == null ? "—" : Number(value).toFixed(digits);
}

function formatSigned(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return n > 0 ? `+${n}` : String(n);
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
