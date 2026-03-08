/* =========================
   2026 CPBL Season Center V1.3
   - 主/客戰績
   - 近10場
   - 連勝/連敗
   - 最近一場比分
   - 對戰戰績表 (H2H) 可點擊
   - 對戰明細清單（可點進 match）
   - 我的球隊高亮（中信兄弟）
   ========================= */

let allSeasonGames = [];

const MY_TEAM = "中信兄弟";

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

const TOTAL_GAMES = 360;

const months = ["2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09"];

/* =========================
   入口：載入全部月份
   ========================= */
Promise.all(
  months.map(m =>
    fetch(`data/schedule-${m}.json`)
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
  )
).then(results => {
  allSeasonGames = results.flat();

  // 只取 final 且分數齊全
  const finals = allSeasonGames.filter(g =>
    g?.status === "final" &&
    typeof g?.homeScore === "number" &&
    typeof g?.awayScore === "number" &&
    g?.teams?.home && g?.teams?.away
  );

  updateProgress(finals);

  const base = calculateStandings(finals);
  const extras = calculateExtras(finals);            // 近10 + 連勝/連敗
  const lastGame = calculateLastGame(finals);        // 最近一場
  const merged = mergeStandings(base, extras, lastGame);
  const ranked = rankStandings(merged);

  renderTeamCards(ranked);

  const h2h = calculateHeadToHead(finals);
  renderHeadToHeadTable(h2h);

  // 預設：顯示我的球隊 vs 任一隊（如果有）
  if (h2hDetailList) {
    h2hDetailList.innerHTML = `
      <div class="muted">提示：點上方對戰表任一格，就會列出比賽（可點進比賽中心）</div>
    `;
  }
});

/* =========================
   賽季進度
   ========================= */
function updateProgress(finalGames) {
  if (!progressBox) return;

  const played = finalGames.length;
  const percent = Math.round((played / TOTAL_GAMES) * 100);

  progressBox.innerHTML = `
    <div style="margin-bottom:6px;">
      已完成 ${played} / ${TOTAL_GAMES} 場（${percent}%）
    </div>
    <div style="background:#ddd; border-radius:10px; overflow:hidden;">
      <div style="
        width:${percent}%;
        background:#0b3c5d;
        color:#fff;
        padding:6px;
        font-weight:700;
      ">
        ${percent}%
      </div>
    </div>
  `;
}

/* =========================
   基本戰績（含主/客）
   ========================= */
function calculateStandings(finals) {
  const teams = {};
  TEAM_LIST.forEach(t => {
    teams[t] = {
      team: t,
      W:0, L:0, T:0,
      homeW:0, homeL:0, homeT:0,
      awayW:0, awayL:0, awayT:0
    };
  });

  for (const g of finals) {
    const home = g.teams.home;
    const away = g.teams.away;

    if (!teams[home] || !teams[away]) continue;

    if (g.homeScore > g.awayScore) {
      teams[home].W++; teams[home].homeW++;
      teams[away].L++; teams[away].awayL++;
    } else if (g.homeScore < g.awayScore) {
      teams[away].W++; teams[away].awayW++;
      teams[home].L++; teams[home].homeL++;
    } else {
      teams[home].T++; teams[home].homeT++;
      teams[away].T++; teams[away].awayT++;
    }
  }

  return teams;
}

/* =========================
   近10場 + 連勝/連敗
   ========================= */
function calculateExtras(finals) {
  const sorted = [...finals].sort((a,b) => (a.date || "").localeCompare(b.date || ""));

  const seq = {};
  TEAM_LIST.forEach(t => seq[t] = []);

  for (const g of sorted) {
    const home = g.teams.home;
    const away = g.teams.away;

    const homeRes = g.homeScore > g.awayScore ? "W" : (g.homeScore < g.awayScore ? "L" : "T");
    const awayRes = g.homeScore > g.awayScore ? "L" : (g.homeScore < g.awayScore ? "W" : "T");

    if (seq[home]) seq[home].push(homeRes);
    if (seq[away]) seq[away].push(awayRes);
  }

  const extras = {};
  TEAM_LIST.forEach(t => {
    const s = seq[t];
    const last10 = s.slice(-10);

    const last10W = last10.filter(x => x==="W").length;
    const last10L = last10.filter(x => x==="L").length;
    const last10T = last10.filter(x => x==="T").length;

    let streakType = "";
    let streakCount = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      const r = s[i];
      if (r === "T") break;
      if (!streakType) {
        streakType = r; streakCount = 1;
      } else if (r === streakType) {
        streakCount++;
      } else {
        break;
      }
    }
    const streak = !streakType ? "—" : `${streakType === "W" ? "連勝" : "連敗"} ${streakCount}`;

    extras[t] = {
      last10: s.length ? `${last10W}-${last10L}-${last10T}` : "—",
      streak
    };
  });

  return extras;
}

/* =========================
   最近一場（只取 final）
   ========================= */
function calculateLastGame(finals) {
  // 依日期排序，取最後一場（每隊各自最後）
  const sorted = [...finals].sort((a,b) => (a.date || "").localeCompare(b.date || ""));

  const last = {};
  TEAM_LIST.forEach(t => last[t] = null);

  for (const g of sorted) {
    const home = g.teams.home;
    const away = g.teams.away;
    if (last[home] !== undefined) last[home] = g;
    if (last[away] !== undefined) last[away] = g;
  }

  // 轉成文字（每隊視角）
  const out = {};
  TEAM_LIST.forEach(t => {
    const g = last[t];
    if (!g) {
      out[t] = "—";
      return;
    }
    const home = g.teams.home;
    const away = g.teams.away;

    const isHome = (t === home);
    const meScore = isHome ? g.homeScore : g.awayScore;
    const oppScore = isHome ? g.awayScore : g.homeScore;
    const opp = isHome ? away : home;

    const wl = meScore > oppScore ? "勝" : (meScore < oppScore ? "敗" : "和");
    out[t] = `${g.date} vs ${opp}（${wl} ${meScore}-${oppScore}）`;
  });

  return out;
}

/* =========================
   合併戰績 + 附加資訊
   ========================= */
function mergeStandings(base, extras, lastGameText) {
  const out = {};
  TEAM_LIST.forEach(t => {
    const b = base[t];
    const e = extras[t] || { last10:"—", streak:"—" };

    const total = b.W + b.L + b.T;
    const pct = total ? b.W / total : 0;

    out[t] = {
      ...b,
      total,
      pct,
      last10: e.last10,
      streak: e.streak,
      lastGame: lastGameText?.[t] ?? "—"
    };
  });
  return out;
}

/* =========================
   排名 + 勝差
   ========================= */
function rankStandings(standings) {
  const arr = Object.values(standings);
  arr.sort((a,b) => b.pct - a.pct);

  const leader = arr[0] || null;
  arr.forEach(t => {
    if (!leader || t.total === 0) {
      t.GB = "—";
      return;
    }
    const gb = ((leader.W - t.W) + (t.L - leader.L)) / 2;
    t.GB = gb === 0 ? "-" : gb.toFixed(1);
  });

  return arr;
}

/* =========================
   渲染球隊卡片（新增最近一場、我的球隊高亮）
   ========================= */
function renderTeamCards(teams) {
  if (!teamGrid) return;

  injectV13CssOnce();

  teamGrid.innerHTML = teams.map((t, idx) => {
    const pctText = t.total ? t.pct.toFixed(3) : "—";

    let status = "普通";
    if (t.total === 0) status = "⚠️ 待調整";
    else if (t.pct >= 0.6) status = "🔥 強勢";
    else if (t.pct <= 0.4) status = "⚠️ 待調整";

    const isMine = t.team === MY_TEAM;

    return `
      <div class="home-card team-card ${isMine ? "my-team-card" : ""}" data-team="${t.team}">
        <div style="display:flex; align-items:center; gap:12px;">
          <img
            src="assets/logo/${TEAM_ID_MAP[t.team]}.png"
            style="width:48px; height:48px; object-fit:contain;"
            onerror="this.style.display='none'"
          >
          <div>
            <strong>${idx + 1}. ${t.team}</strong><br>
            <span class="muted record">${t.W}-${t.L}-${t.T}</span><br>
            <span class="muted status">勝率 ${pctText} ｜ 勝差 ${t.GB}</span>
          </div>
        </div>

        <div style="margin-top:10px; display:grid; gap:6px;">
          <div class="muted">主場 ${t.homeW}-${t.homeL}-${t.homeT} ｜ 客場 ${t.awayW}-${t.awayL}-${t.awayT}</div>
          <div class="muted">近10場 ${t.last10} ｜ ${t.streak}</div>
          <div class="muted">最近一場比賽：${t.lastGame}</div>
          <div style="font-weight:700;">狀態：${status}</div>
        </div>
      </div>
    `;
  }).join("");
}

/* =========================
   對戰戰績（H2H）
   h2h[A][B] = {W,L,T}
   ========================= */
function calculateHeadToHead(finals) {
  const h2h = {};
  TEAM_LIST.forEach(a => {
    h2h[a] = {};
    TEAM_LIST.forEach(b => {
      h2h[a][b] = { W:0, L:0, T:0 };
    });
  });

  for (const g of finals) {
    const home = g.teams.home;
    const away = g.teams.away;
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

/* =========================
   渲染對戰表（可點擊）
   ========================= */
function renderHeadToHeadTable(h2h) {
  if (!h2hWrap) return;

  injectV13CssOnce();

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
      const text = total ? `${x.W}-${x.L}-${x.T}` : "—";

      const isMineLine = (a === MY_TEAM || b === MY_TEAM);

      return `
        <div class="h2h-cell h2h-click ${isMineLine ? "h2h-mine" : ""}"
             data-a="${a}" data-b="${b}">
          ${text}
        </div>
      `;
    }).join("");

    const rowMine = a === MY_TEAM ? "h2h-row-mine" : "";

    return `
      <div class="h2h-row ${rowMine}">
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

  // 綁定點擊：顯示對戰明細
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
   對戰明細（列出所有 final 的比賽，可點 match）
   ========================= */
function renderHeadToHeadDetail(teamA, teamB) {
  if (!h2hDetailList || !h2hDetailHint) return;

  const games = allSeasonGames
    .filter(g =>
      g?.teams?.home && g?.teams?.away &&
      ((g.teams.home === teamA && g.teams.away === teamB) ||
       (g.teams.home === teamB && g.teams.away === teamA))
    )
    .sort((a,b) => (a.date || "").localeCompare(b.date || ""));

  h2hDetailHint.textContent = `目前顯示：${teamA} vs ${teamB}（共 ${games.length} 場）`;

  if (!games.length) {
    h2hDetailList.innerHTML = `<div class="muted">目前沒有這組對戰資料</div>`;
    return;
  }

  h2hDetailList.innerHTML = games.map(g => {
    const home = g.teams.home;
    const away = g.teams.away;

    const isFinal = g.status === "final" &&
      typeof g.homeScore === "number" && typeof g.awayScore === "number";

    const scoreText = isFinal ? `${away} ${g.awayScore} : ${g.homeScore} ${home}` : `${away} vs ${home}`;

    const params = new URLSearchParams();
    params.set("date", g.date);
    params.set("home", home);
    params.set("away", away);

    // 若你未來有用 gameId（現在先不強迫）
    const gid = buildGameId(g);
    if (gid) params.set("gameId", gid);

    return `
      <div class="h2h-game-item" data-url="match.html?${params.toString()}">
        <div style="font-weight:700;">${g.date}</div>
        <div class="muted">${scoreText}</div>
        <div class="muted" style="font-size:12px;">點我進比賽中心</div>
      </div>
    `;
  }).join("");

  h2hDetailList.querySelectorAll(".h2h-game-item").forEach(item => {
    item.addEventListener("click", () => {
      const url = item.dataset.url;
      window.location.href = url;
    });
  });
}

/* =========================
   高亮目前選到的格子（可看得到）
   ========================= */
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
   gameId：和 match.js 同規格
   ========================= */
function buildGameId(game) {
  const home = game?.teams?.home;
  const away = game?.teams?.away;
  if (!game?.date || !home || !away) return null;
  const dateId = game.date.replaceAll("-", "");
  return `${dateId}_${home}_${away}`;
}

/* =========================
   縮寫顯示
   ========================= */
function shortName(team) {
  if (team.includes("中信")) return "兄弟";
  if (team.includes("統一")) return "統一";
  if (team.includes("樂天")) return "樂天";
  if (team.includes("味全")) return "味全";
  if (team.includes("富邦")) return "富邦";
  if (team.includes("台鋼")) return "台鋼";
  return team;
}

/* =========================
   注入 CSS（一次）
   ========================= */
function injectV13CssOnce() {
  if (document.getElementById("seasonV13Style")) return;
  const style = document.createElement("style");
  style.id = "seasonV13Style";
  style.textContent = `
    /* 我的球隊卡片高亮 */
    .my-team-card{
      border:2px solid #0b3c5d;
      box-shadow: 0 8px 20px rgba(11,60,93,0.18);
    }

    /* H2H 表格 */
    .h2h-table{ display:grid; gap:6px; overflow:auto; }
    .h2h-row{ display:grid; grid-template-columns: 90px repeat(6, minmax(70px,1fr)); gap:6px; }
    .h2h-cell{
      background:#f6f7f9; border:1px solid #eceef2; border-radius:10px;
      padding:8px; text-align:center; font-size:13px;
      user-select:none;
    }
    .h2h-head .h2h-cell{ background:#0b3c5d; color:#fff; font-weight:700; }
    .h2h-team{ background:#fff; font-weight:700; }
    .h2h-self{ background:#fff; color:#999; }

    .h2h-click{ cursor:pointer; transition: transform .08s ease; }
    .h2h-click:hover{ transform: translateY(-1px); }

    /* 我的球隊相關格子淡淡提示 */
    .h2h-mine{ border-color: rgba(11,60,93,0.45); }

    /* 被選中的格子 */
    .h2h-selected{
      background:#0b3c5d !important;
      color:#fff !important;
      border-color:#0b3c5d !important;
      font-weight:700;
    }

    /* 我的球隊那一列 */
    .h2h-row-mine .h2h-team{
      border:2px solid rgba(11,60,93,0.45);
    }

    /* 對戰明細 */
    #h2hDetailList{ display:grid; gap:10px; }
    .h2h-game-item{
      background:#fff;
      border:1px solid #eceef2;
      border-radius:14px;
      padding:12px 14px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.06);
      cursor:pointer;
    }
    .h2h-game-item:hover{
      border-color: rgba(11,60,93,0.45);
    }
  `;
  document.head.appendChild(style);
}

/* =========================
   今日賽事（保留原功能：點去 schedule 篩日期）
   ========================= */
const todayBox = document.querySelector("#todayGamesCard .today-content");

if (todayBox) {
  const today = new Date().toISOString().slice(0,10);

  Promise.all(
    months.map(m =>
      fetch(`data/schedule-${m}.json`).then(r => r.ok ? r.json() : []).catch(() => [])
    )
  ).then(results => {
    const games = results.flat();
    const todayGames = games.filter(g => g.date === today);

    if (!todayGames.length) {
      todayBox.textContent = "今天沒有比賽";
      return;
    }

    todayBox.innerHTML = todayGames.map(g => `
      <div class="today-game today-game-link" data-date="${g.date}">
        ${g.teams?.home ?? "—"} vs ${g.teams?.away ?? "—"}
      </div>
    `).join("");

    todayBox.querySelectorAll(".today-game-link").forEach(el => {
      el.style.cursor = "pointer";
      el.addEventListener("click", () => {
        window.location.href = `schedule.html?date=${el.dataset.date}`;
      });
    });
  }).catch(() => {
    todayBox.textContent = "賽事載入失敗";
  });
}
