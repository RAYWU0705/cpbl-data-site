/* =========================
   2026 CPBL Season Center V3.0
   來源：data/live/live-boxscore.json

   定位：
   - standings.html = 即時戰績查表
   - season.html = 賽季年鑑 / 球季儀表板
========================= */

let allSeasonGames = [];

const MY_TEAM = "中信兄弟";
const TOTAL_GAMES = 360;
const LIVE_BOXSCORE_URL = "data/live/live-boxscore.json";
const SEASON_SETTINGS_URL = "config/season-settings.json";
let seasonSettings = null;

const TEAM_ID_MAP = {
  "中信兄弟": "brothers",
  "統一7-ELEVEn獅": "lions",
  "樂天桃猿": "monkeys",
  "味全龍": "dragons",
  "富邦悍將": "guardians",
  "台鋼雄鷹": "hawks"
};

const TEAM_LIST = Object.keys(TEAM_ID_MAP);

const TEAM_SHORT = {
  "中信兄弟": "兄弟",
  "統一7-ELEVEn獅": "統一",
  "樂天桃猿": "樂天",
  "味全龍": "味全",
  "富邦悍將": "富邦",
  "台鋼雄鷹": "台鋼"
};

const SEASON_MONTHS = [
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09"
];

const progressBox = document.getElementById("seasonProgress");
const heroMain = document.getElementById("seasonHeroMain");
const heroSub = document.getElementById("seasonHeroSub");
const heroMeterFill = document.getElementById("seasonHeroMeterFill");
const overviewBox = document.getElementById("seasonOverviewStats");
const phaseBox = document.getElementById("seasonPhase");
const monthBox = document.getElementById("monthlyTimeline");
const teamGrid = document.getElementById("teamStatusGrid");
const h2hWrap = document.getElementById("h2hTableWrap");
const h2hDetailHint = document.getElementById("h2hDetailHint");
const h2hDetailList = document.getElementById("h2hDetailList");
const todayBox = document.querySelector("#todayGamesCard .today-content");
const storyBox = document.getElementById("seasonStoryList");
const reloadBtn = document.getElementById("seasonReloadBtn");

document.addEventListener("DOMContentLoaded", initSeason);
reloadBtn?.addEventListener("click", initSeason);

async function initSeason() {
  try {
    setLoading();

    [seasonSettings, allSeasonGames] = await Promise.all([
      loadSeasonSettings(),
      loadLiveBoxscoreGames()
    ]);

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

    const scheduled = regularGames.filter(g => g.status === "scheduled");
    const live = regularGames.filter(g => g.status === "live");

    const base = calculateStandings(finals);
    const extras = calculateExtras(finals);
    const lastGame = calculateLastGame(finals);
    const merged = mergeStandings(base, extras, lastGame);
    const ranked = rankStandings(merged);

    const monthStats = calculateMonthStats(regularGames, finals);

    renderHero(finals, regularGames);
    renderProgress(finals, regularGames, scheduled, live);
    renderPhase(finals, regularGames);
    renderOverview(ranked, finals, regularGames, scheduled, live);
    renderMonthTimeline(monthStats);
    renderTeamCards(ranked);

    const h2h = calculateHeadToHead(finals);
    renderHeadToHeadTable(h2h);
    renderTodayGames();
    renderStories(ranked, finals, regularGames, monthStats);

    if (h2hDetailList) {
      h2hDetailList.innerHTML = `
        <div class="season-empty-note">
          <strong>尚未選擇對戰組合</strong>
          <span>點左側任一對戰格，就會列出比賽明細。</span>
        </div>
      `;
    }

  } catch (err) {
    console.error(err);
    showError(err);
  }
}

function setLoading() {
  if (heroMain) heroMain.textContent = "讀取中";
  if (heroSub) heroSub.textContent = "正在整理賽季資料…";
  if (progressBox) progressBox.innerHTML = `<div class="muted">計算中…</div>`;
  if (teamGrid) teamGrid.innerHTML = `<div class="season-empty-note">資料讀取中…</div>`;
}


async function loadSeasonSettings() {
  const res = await fetch(`${SEASON_SETTINGS_URL}?ts=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`讀取 season-settings.json 失敗：HTTP ${res.status}`);
  return res.json();
}

function getSeasonSplitRange(split) {
  return seasonSettings?.seasons?.["2026"]?.splits?.[split] || null;
}

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

/* =========================
   賽季總覽
========================= */

function renderHero(finals, regularGames) {
  const played = finals.length;
  const total = regularGames.length || TOTAL_GAMES;
  const percent = clampPercent((played / TOTAL_GAMES) * 100);

  if (heroMain) heroMain.textContent = `${played}/${TOTAL_GAMES}`;
  if (heroSub) {
    heroSub.textContent = `例行賽已完成 ${percent}% ｜ 目前收錄 ${total} 場例行賽資料`;
  }
  if (heroMeterFill) heroMeterFill.style.width = `${percent}%`;
}

function renderProgress(finals, regularGames, scheduled, live) {
  if (!progressBox) return;

  const played = finals.length;
  const percent = clampPercent((played / TOTAL_GAMES) * 100);
  const remaining = Math.max(TOTAL_GAMES - played, 0);
  const dataGames = regularGames.length;

  progressBox.innerHTML = `
    <div class="season-progress-main">
      <strong>${percent}%</strong>
      <span>已完成 ${played} / ${TOTAL_GAMES} 場</span>
    </div>

    <div class="season-progress-bar">
      <div class="season-progress-fill" style="width:${percent}%;">
        ${percent}%
      </div>
    </div>

    <div class="season-progress-grid">
      <div><span>已結束</span><strong>${played}</strong></div>
      <div><span>未開打</span><strong>${scheduled.length}</strong></div>
      <div><span>LIVE</span><strong>${live.length}</strong></div>
      <div><span>剩餘估計</span><strong>${remaining}</strong></div>
      <div><span>資料場次</span><strong>${dataGames}</strong></div>
    </div>
  `;
}

function renderPhase(finals, regularGames) {
  if (!phaseBox) return;

  const played = finals.length;
  const pct = played / TOTAL_GAMES;

  let phase = "球季前段";
  let desc = "戰績還在拉開，樣本數正在累積。";
  let tone = "early";

  if (pct >= 0.72) {
    phase = "季末衝刺";
    desc = "排名與勝差已經很有參考價值，季後賽席次會開始白熱化。";
    tone = "late";
  } else if (pct >= 0.42) {
    phase = "球季中段";
    desc = "戰力輪廓逐漸成形，主客場與對戰戰績開始有故事性。";
    tone = "middle";
  } else if (pct >= 0.18) {
    phase = "上半季競爭期";
    desc = "各隊狀態逐漸穩定，連勝連敗會快速影響排名。";
    tone = "early";
  }

  // 2026 半季規則統一由 config/season-settings.json 管理。
  const firstRange = getSeasonSplitRange("first");
  const secondRange = getSeasonSplitRange("second");
  const firstHalf = regularGames.filter(g => firstRange && (g.date || "") >= firstRange.start && (g.date || "") <= firstRange.end);
  const secondHalf = regularGames.filter(g => secondRange && (g.date || "") >= secondRange.start && (g.date || "") <= secondRange.end);

  phaseBox.innerHTML = `
    <div class="season-phase-badge ${tone}">${phase}</div>
    <p>${desc}</p>
    <div class="season-phase-split">
      <div><span>上半季資料場次</span><strong>${firstHalf.length}</strong></div>
      <div><span>下半季資料場次</span><strong>${secondHalf.length}</strong></div>
    </div>
  `;
}

function renderOverview(ranked, finals, regularGames, scheduled, live) {
  if (!overviewBox) return;

  const leader = ranked[0];
  const hottest = ranked
    .slice()
    .sort((a, b) => (b.last10W - b.last10L) - (a.last10W - a.last10L))[0];

  const runLeader = ranked
    .slice()
    .sort((a, b) => b.RF - a.RF)[0];

  const diffLeader = ranked
    .slice()
    .sort((a, b) => b.runDiff - a.runDiff)[0];

  overviewBox.innerHTML = `
    ${overviewItem("目前龍頭", leader ? `${shortName(leader.team)} ${formatPct(leader.pct)}` : "—", leader ? `${leader.W}-${leader.L}-${leader.T}｜勝差 ${leader.GB}` : "資料不足")}
    ${overviewItem("近期最熱", hottest ? `${shortName(hottest.team)} ${hottest.last10}` : "—", hottest ? hottest.streak : "資料不足")}
    ${overviewItem("火力最佳", runLeader ? `${shortName(runLeader.team)} ${runLeader.RF} 分` : "—", "已結束比賽得分累計")}
    ${overviewItem("得失分差", diffLeader ? `${shortName(diffLeader.team)} ${signed(diffLeader.runDiff)}` : "—", "整季得分 - 失分")}
    ${overviewItem("已結束", `${finals.length} 場`, `LIVE ${live.length}｜未開打 ${scheduled.length}`)}
    ${overviewItem("收錄資料", `${regularGames.length} 場`, "例行賽資料來源 live-boxscore.json")}
  `;
}

function overviewItem(label, value, note) {
  return `
    <article class="season-overview-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(note)}</em>
    </article>
  `;
}

/* =========================
   月份節奏
========================= */

function calculateMonthStats(regularGames, finals) {
  return SEASON_MONTHS.map(month => {
    const all = regularGames.filter(g => g.date.startsWith(month));
    const done = finals.filter(g => g.date.startsWith(month));
    const live = all.filter(g => g.status === "live");
    const scheduled = all.filter(g => g.status === "scheduled");

    const topTeam = calculateMonthlyTopTeam(done);

    return {
      month,
      all: all.length,
      done: done.length,
      live: live.length,
      scheduled: scheduled.length,
      topTeam
    };
  });
}

function calculateMonthlyTopTeam(games) {
  if (!games.length) return null;

  const table = calculateStandings(games);
  const merged = mergeStandings(table, calculateExtras(games), calculateLastGame(games));
  return rankStandings(merged)[0] || null;
}

function renderMonthTimeline(months) {
  if (!monthBox) return;

  monthBox.innerHTML = months.map(m => {
    const percent = m.all ? clampPercent((m.done / m.all) * 100) : 0;
    const title = `${Number(m.month.slice(5, 7))} 月`;

    return `
      <article class="season-month-item ${m.done ? "has-games" : ""}">
        <div class="season-month-head">
          <strong>${title}</strong>
          <span>${m.done}/${m.all || 0}</span>
        </div>
        <div class="season-month-line">
          <i style="width:${percent}%"></i>
        </div>
        <p>
          ${m.topTeam
            ? `月最佳暫看 ${shortName(m.topTeam.team)}（${m.topTeam.W}-${m.topTeam.L}-${m.topTeam.T}）`
            : "尚無已結束比賽"}
        </p>
      </article>
    `;
  }).join("");
}

/* =========================
   戰績計算
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

function calculateExtras(finals) {
  const sorted = [...finals].sort(sortByDateTime);
  const seq = {};
  TEAM_LIST.forEach(t => seq[t] = []);

  for (const g of sorted) {
    const homeRes = g.homeScore > g.awayScore ? "W" : (g.homeScore < g.awayScore ? "L" : "T");
    const awayRes = g.homeScore > g.awayScore ? "L" : (g.homeScore < g.awayScore ? "W" : "T");

    if (seq[g.home]) seq[g.home].push(homeRes);
    if (seq[g.away]) seq[g.away].push(awayRes);
  }

  const extras = {};

  TEAM_LIST.forEach(t => {
    const s = seq[t];
    const last10 = s.slice(-10);

    const last10W = last10.filter(x => x === "W").length;
    const last10L = last10.filter(x => x === "L").length;
    const last10T = last10.filter(x => x === "T").length;

    extras[t] = {
      last10: s.length ? `${last10W}-${last10L}-${last10T}` : "—",
      last10W,
      last10L,
      last10T,
      streak: getStreakText(s)
    };
  });

  return extras;
}

function getStreakText(results) {
  if (!results.length) return "—";

  const last = results[results.length - 1];
  let count = 1;

  for (let i = results.length - 2; i >= 0; i--) {
    if (results[i] === last) count++;
    else break;
  }

  if (last === "W") return `連勝 ${count}`;
  if (last === "L") return `連敗 ${count}`;
  if (last === "T") return `和局 ${count}`;

  return "—";
}

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

function mergeStandings(base, extras, lastGameText) {
  const out = {};

  TEAM_LIST.forEach(t => {
    const b = base[t];
    const e = extras[t] || {
      last10: "—",
      last10W: 0,
      last10L: 0,
      last10T: 0,
      streak: "—"
    };

    const total = b.W + b.L + b.T;
    const decisionGames = b.W + b.L;
    const pct = decisionGames ? b.W / decisionGames : 0;

    out[t] = {
      ...b,
      total,
      pct,
      last10: e.last10,
      last10W: e.last10W,
      last10L: e.last10L,
      last10T: e.last10T,
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
   各隊摘要
========================= */

function renderTeamCards(teams) {
  if (!teamGrid) return;

  teamGrid.innerHTML = teams.map(t => {
    const pctText = t.total ? formatPct(t.pct) : "—";
    const isMine = t.team === MY_TEAM;
    const logo = TEAM_ID_MAP[t.team];

    let status = "穩定觀察";
    let statusClass = "normal";

    if (t.total === 0) {
      status = "待更多比賽";
      statusClass = "idle";
    } else if (t.pct >= 0.6) {
      status = "強勢領跑";
      statusClass = "hot";
    } else if (t.pct <= 0.4) {
      status = "需要反彈";
      statusClass = "warn";
    }

    return `
      <a class="season-team-card ${isMine ? "my-team-card" : ""}"
         href="team.html?team=${logo}"
         data-team="${escapeHtml(t.team)}">

        <div class="season-team-rank">#${t.rank}</div>

        <div class="season-team-head">
          <img src="assets/logo/${logo}.png" alt="${escapeHtml(t.team)}" onerror="this.style.display='none'">
          <div>
            <strong>${escapeHtml(t.team)}</strong>
            <span>${t.W}-${t.L}-${t.T}｜勝率 ${pctText}｜勝差 ${t.GB}</span>
          </div>
        </div>

        <div class="season-team-metrics">
          <div><span>主場</span><strong>${t.homeW}-${t.homeL}-${t.homeT}</strong></div>
          <div><span>客場</span><strong>${t.awayW}-${t.awayL}-${t.awayT}</strong></div>
          <div><span>得失分</span><strong>${signed(t.runDiff)}</strong></div>
          <div><span>近10場</span><strong>${t.last10}</strong></div>
        </div>

        <div class="season-team-footer">
          <span class="season-team-status ${statusClass}">${status}</span>
          <em>${escapeHtml(t.streak)}｜${escapeHtml(t.lastGame)}</em>
        </div>
      </a>
    `;
  }).join("");
}

/* =========================
   對戰格局
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
      if (a === b) return `<div class="h2h-cell h2h-self">—</div>`;

      const x = h2h[a][b];
      const total = x.W + x.L + x.T;
      const text = total ? `${x.W}-${x.T}-${x.L}` : "—";
      const className = x.W > x.L ? "good" : (x.W < x.L ? "bad" : "even");

      return `
        <button class="h2h-cell h2h-click ${className}"
                type="button"
                data-a="${escapeHtml(a)}"
                data-b="${escapeHtml(b)}">
          ${text}
        </button>
      `;
    }).join("");

    return `
      <div class="h2h-row ${a === MY_TEAM ? "h2h-row-mine" : ""}">
        <div class="h2h-cell h2h-team">${shortName(a)}</div>
        ${cells}
      </div>
    `;
  }).join("");

  h2hWrap.innerHTML = `<div class="h2h-table">${header}${rows}</div>`;

  h2hWrap.querySelectorAll(".h2h-click").forEach(cell => {
    cell.addEventListener("click", () => {
      const a = cell.dataset.a;
      const b = cell.dataset.b;

      renderHeadToHeadDetail(a, b);
      highlightSelectedH2H(a, b);
    });
  });
}

function renderHeadToHeadDetail(teamA, teamB) {
  if (!h2hDetailList || !h2hDetailHint) return;

  const games = allSeasonGames
    .filter(g =>
      (g.home === teamA && g.away === teamB) ||
      (g.home === teamB && g.away === teamA)
    )
    .sort(sortByDateTime);

  h2hDetailHint.textContent = `${teamA} vs ${teamB}｜共 ${games.length} 場`;

  if (!games.length) {
    h2hDetailList.innerHTML = `<div class="season-empty-note">目前沒有這組對戰資料。</div>`;
    return;
  }

  h2hDetailList.innerHTML = games.map(g => {
    const isFinal =
      g.status === "final" &&
      typeof g.homeScore === "number" &&
      typeof g.awayScore === "number";

    const scoreText = isFinal
      ? `${shortName(g.away)} ${g.awayScore}：${g.homeScore} ${shortName(g.home)}`
      : `${shortName(g.away)} vs ${shortName(g.home)}｜${getStatusText(g.status)}`;

    const url = g.gameSno ? `match.html?gameSno=${g.gameSno}` : "#";

    return `
      <a class="h2h-game-item" href="${url}">
        <strong>${escapeHtml(scoreText)}</strong>
        <span>${escapeHtml(g.date)}｜${escapeHtml(g.time || "時間未定")}｜${escapeHtml(g.venue || "球場待定")}</span>
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
   今日 / 看點
========================= */

function renderTodayGames() {
  if (!todayBox) return;

  const today = getToday();

  const todayGames = allSeasonGames
    .filter(g => g.date === today)
    .sort(sortByDateTime);

  if (!todayGames.length) {
    todayBox.innerHTML = `
      <div class="season-empty-note">
        <strong>今天沒有比賽</strong>
        <span>可以查看賽程中心或最近完賽。</span>
      </div>
    `;
    return;
  }

  todayBox.innerHTML = todayGames.map(g => {
    const scoreText =
      g.status === "final" && typeof g.homeScore === "number" && typeof g.awayScore === "number"
        ? `${shortName(g.away)} ${g.awayScore}：${g.homeScore} ${shortName(g.home)}`
        : `${shortName(g.away)} vs ${shortName(g.home)}`;

    return `
      <a class="today-game-link" href="match.html?gameSno=${g.gameSno}">
        <strong>${escapeHtml(scoreText)}</strong>
        <span>${escapeHtml(g.time || "時間未定")}｜${escapeHtml(g.venue || "球場待定")}｜${getStatusText(g.status)}</span>
      </a>
    `;
  }).join("");
}

function renderStories(ranked, finals, regularGames, months) {
  if (!storyBox) return;

  const leader = ranked[0];
  const bottom = ranked[ranked.length - 1];
  const closest = ranked
    .filter(t => t.rank !== 1 && t.GB !== "—")
    .slice()
    .sort((a, b) => Number(a.GB) - Number(b.GB))[0];

  const currentMonth = months.findLast?.(m => m.done > 0) || months.slice().reverse().find(m => m.done > 0);

  const stories = [
    {
      title: "龍頭觀察",
      text: leader ? `${leader.team} 目前以 ${leader.W}-${leader.L}-${leader.T} 排名第一。` : "目前還沒有足夠資料判斷龍頭。"
    },
    {
      title: "追趕壓力",
      text: closest ? `${closest.team} 距離榜首 ${closest.GB} 場勝差。` : "勝差仍待更多比賽拉開。"
    },
    {
      title: "反彈焦點",
      text: bottom ? `${bottom.team} 目前墊底，後續主客場表現會很關鍵。` : "目前尚無墊底隊伍資料。"
    },
    {
      title: "月份節奏",
      text: currentMonth?.topTeam
        ? `${currentMonth.month} 暫時由 ${currentMonth.topTeam.team} 表現最突出。`
        : "月份樣本還在累積中。"
    }
  ];

  storyBox.innerHTML = stories.map(s => `
    <article>
      <strong>${escapeHtml(s.title)}</strong>
      <span>${escapeHtml(s.text)}</span>
    </article>
  `).join("");
}

/* =========================
   Helpers
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
  return TEAM_SHORT[team] || team;
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

function getStatusText(status) {
  if (status === "final") return "已結束";
  if (status === "live") return "LIVE";
  if (status === "postponed") return "延賽";
  if (status === "suspended") return "保留比賽";
  if (status === "cancelled" || status === "canceled") return "取消";
  return "未開賽";
}

function formatPct(pct) {
  if (!Number.isFinite(pct)) return "—";
  return pct.toFixed(3);
}

function signed(n) {
  const value = Number(n) || 0;
  return `${value > 0 ? "+" : ""}${value}`;
}

function clampPercent(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showError(err) {
  if (progressBox) {
    progressBox.innerHTML = `<div class="season-empty-note">賽季資料載入失敗：${escapeHtml(err.message)}</div>`;
  }

  if (teamGrid) {
    teamGrid.innerHTML = `<div class="season-empty-note">資料載入失敗</div>`;
  }

  if (heroMain) heroMain.textContent = "載入失敗";
  if (heroSub) heroSub.textContent = err.message || "請確認資料檔是否存在。";
}
