/* Ray's CPBL Data Site - teams-dashboard.html
   v5.1.4-TEAMS-DASHBOARD-LIVE-FIRST-FIXED
   原則：
   1. live-boxscore 為主資料源
   2. 不讀舊 standings 當主戰績
   3. 從 live-boxscore 自算戰績、排名、近況、對戰摘要
   4. 只讀資料、不寫檔、不污染 fetch 主流程
*/
(() => {
  const VERSION = "v5.1.4-TEAMS-DASHBOARD-LIVE-FIRST-FIXED";

  const TEAMS = [
    { id: "brothers", name: "中信兄弟", short: "兄弟", color: "#f6c800", logo: "assets/logo/brothers.png" },
    { id: "lions", name: "統一7-ELEVEn獅", short: "統一", color: "#f05a28", logo: "assets/logo/lions.png" },
    { id: "monkeys", name: "樂天桃猿", short: "桃猿", color: "#7a1226", logo: "assets/logo/monkeys.png" },
    { id: "dragons", name: "味全龍", short: "味全", color: "#c8102e", logo: "assets/logo/dragons.png" },
    { id: "guardians", name: "富邦悍將", short: "富邦", color: "#004a98", logo: "assets/logo/guardians.png" },
    { id: "hawks", name: "台鋼雄鷹", short: "台鋼", color: "#116149", logo: "assets/logo/hawks.png" }
  ];

  const NAME_TO_ID = new Map();

  TEAMS.forEach(t => {
    [t.id, t.name, t.short, t.name.replace(/\s/g, "")].forEach(k => {
      NAME_TO_ID.set(k, t.id);
    });
  });

  NAME_TO_ID.set("中信", "brothers");
  NAME_TO_ID.set("兄弟", "brothers");
  NAME_TO_ID.set("中信兄弟", "brothers");

  NAME_TO_ID.set("統一", "lions");
  NAME_TO_ID.set("統一獅", "lions");
  NAME_TO_ID.set("統一7-ELEVEn獅", "lions");
  NAME_TO_ID.set("統一7-ELEVEN獅", "lions");
  NAME_TO_ID.set("統一7ELEVEN獅", "lions");

  NAME_TO_ID.set("樂天", "monkeys");
  NAME_TO_ID.set("桃猿", "monkeys");
  NAME_TO_ID.set("樂天桃猿", "monkeys");

  NAME_TO_ID.set("味全", "dragons");
  NAME_TO_ID.set("味全龍", "dragons");

  NAME_TO_ID.set("富邦", "guardians");
  NAME_TO_ID.set("悍將", "guardians");
  NAME_TO_ID.set("富邦悍將", "guardians");

  NAME_TO_ID.set("台鋼", "hawks");
  NAME_TO_ID.set("雄鷹", "hawks");
  NAME_TO_ID.set("台鋼雄鷹", "hawks");

  const $ = sel => document.querySelector(sel);

  const state = {
    games: [],
    standings: [],
    sources: [],
    sort: "rank"
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindSortButtons();

    try {
      await loadAllData();
      state.standings = buildStandingsFromGames(state.games);
      render();
      setStatus("ok", `Dashboard 已完成讀取｜${VERSION}`, loadedSourceText());
    } catch (err) {
      console.error("[teams-dashboard] load failed", err);
      setStatus("warn", "資料讀取失敗，請確認 live-boxscore 路徑", String(err?.message || err));
      renderEmpty("讀取資料時發生錯誤。請開 F12 Console 看詳細訊息。");
    }
  }

  function bindSortButtons() {
    document.querySelectorAll(".tabs button").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.sort = btn.dataset.sort || "rank";
        renderTeams();
      });
    });
  }

  async function loadAllData() {
    const liveRaw = await firstJson([
      "data/live/live-boxscore.json",
      "data/live-boxscore.json"
    ], "live-boxscore");

    state.games = normalizeLiveBoxscore(liveRaw);
  }

  async function firstJson(paths, type) {
    for (const path of paths) {
      const data = await fetchJson(path);
      if (data) {
        state.sources.push({ type, path });
        return data;
      }
    }
    return null;
  }

  async function fetchJson(path) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function normalizeLiveBoxscore(raw) {
    if (!raw) return [];

    let arr = [];

    if (Array.isArray(raw)) {
      arr = raw;
    } else if (Array.isArray(raw.games)) {
      arr = raw.games;
    } else if (Array.isArray(raw.data)) {
      arr = raw.data;
    } else if (Array.isArray(raw.items)) {
      arr = raw.items;
    } else if (raw && typeof raw === "object") {
      arr = Object.values(raw).filter(v => v && typeof v === "object");
    }

    return arr.map(normalizeGame).filter(g => g.awayId && g.homeId);
  }

  function normalizeGame(g) {
    const meta = g.meta || {};

    const awayId = getTeamId(
      meta.away ||
      g.away ||
      g.awayTeam ||
      g.awayTeamName ||
      g.visitor ||
      g.visitorTeam
    );

    const homeId = getTeamId(
      meta.home ||
      g.home ||
      g.homeTeam ||
      g.homeTeamName
    );

    const awayScore = score(
      g.totals?.away?.R ??
      g.total?.away?.R ??
      g.rhe?.away?.R ??
      g.score?.away ??
      g.awayScore
    );

    const homeScore = score(
      g.totals?.home?.R ??
      g.total?.home?.R ??
      g.rhe?.home?.R ??
      g.score?.home ??
      g.homeScore
    );

    const status = String(
      meta.status ||
      meta.statusText ||
      g.status ||
      g.statusText ||
      g.gameStatus ||
      ""
    ).toLowerCase();

    const date = normalizeDate(
      meta.date ||
      g.date ||
      g.gameDate ||
      g.startDate ||
      g.datetime
    );

    const time = meta.time || g.time || g.gameTime || g.startTime || "";

    return {
      key: g.gameSno || g.gameId || g.id || g.gameKey || `${date}_${awayId}_${homeId}`,
      gameSno: g.gameSno || g.gameNo || "",
      date,
      time,
      venue: meta.venue || g.venue || g.stadium || g.place || "",
      awayId,
      homeId,
      awayScore,
      homeScore,
      status,
      statusText: meta.statusText || g.statusText || "",
      finalLock: Boolean(g.finalLock || meta.finalLock || status.includes("final")),
      dataQuality: g.dataQuality || meta.dataQuality || null,
      liveState: g.liveState || meta.liveState || null,
      hasBatters: Boolean(g.batters?.away?.length || g.batters?.home?.length),
      hasPitchers: Boolean(g.pitchers?.away?.length || g.pitchers?.home?.length),
      hasTotals: Boolean(g.totals?.away && g.totals?.home),
      raw: g
    };
  }

  function buildStandingsFromGames(games) {
    const table = new Map();

    TEAMS.forEach(t => {
      table.set(t.id, {
        teamId: t.id,
        wins: 0,
        losses: 0,
        ties: 0,
        games: 0,
        pctValue: 0,
        pct: ".000",
        rank: 99
      });
    });

    games.filter(g => isFinalGame(g) && hasScore(g)).forEach(g => {
      const away = table.get(g.awayId);
      const home = table.get(g.homeId);
      if (!away || !home) return;

      away.games++;
      home.games++;

      if (g.awayScore > g.homeScore) {
        away.wins++;
        home.losses++;
      } else if (g.homeScore > g.awayScore) {
        home.wins++;
        away.losses++;
      } else {
        away.ties++;
        home.ties++;
      }
    });

    const rows = [...table.values()].map(row => {
      const decided = row.wins + row.losses;
      const pctValue = decided > 0 ? row.wins / decided : 0;
      return {
        ...row,
        pctValue,
        pct: pctValue.toFixed(3).replace(/^0/, "")
      };
    });

    rows.sort((a, b) => {
      if (b.pctValue !== a.pctValue) return b.pctValue - a.pctValue;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return a.teamId.localeCompare(b.teamId);
    });

    rows.forEach((row, idx) => {
      row.rank = idx + 1;
    });

    return rows;
  }

  function render() {
    renderSummary();
    renderTeams();
    renderH2H();
  }

  function renderSummary() {
    const finalGames = state.games.filter(g => isFinalGame(g) && hasScore(g));
    const qualities = TEAMS.map(t => calcQuality(t.id).score);

    $("#teamCount").textContent = TEAMS.length;
    $("#finalCount").textContent = finalGames.length;
    $("#avgQuality").textContent = qualities.length ? `${Math.round(avg(qualities))}%` : "--";
    $("#latestSource").textContent = state.sources.at(-1)?.path?.split("/").pop() || "--";
  }

  function renderTeams() {
    const grid = $("#teamGrid");
    const tpl = $("#teamCardTpl");

    grid.innerHTML = "";

    let rows = TEAMS.map(team => ({
      team,
      standing: findStanding(team.id),
      quality: calcQuality(team.id),
      recent: recentForm(team.id)
    }));

    if (state.sort === "quality") {
      rows.sort((a, b) => b.quality.score - a.quality.score);
    } else if (state.sort === "recent") {
      rows.sort((a, b) => formScore(b.recent) - formScore(a.recent));
    } else {
      rows.sort((a, b) => (a.standing?.rank || 99) - (b.standing?.rank || 99));
    }

    rows.forEach(({ team, standing, quality, recent }) => {
      const node = tpl.content.cloneNode(true);
      const card = node.querySelector(".team-card");

      card.dataset.team = team.id;
      card.dataset.rank = standing?.rank || "";
      card.style.setProperty("--team-color", team.color);

      node.querySelector(".team-logo").src = team.logo;
      node.querySelector(".team-logo").alt = team.name;

      node.querySelector(".team-name").textContent = team.name;
      node.querySelector(".team-rank").textContent = standing
        ? `目前排名：第 ${standing.rank} 名`
        : "目前排名：尚無資料";

      node.querySelector(".record-main").textContent = standing
        ? `${standing.wins}勝 ${standing.losses}敗 ${standing.ties}和`
        : "--勝 --敗 --和";

      node.querySelector(".record-pct").textContent = standing
        ? `勝率 ${standing.pct}`
        : "勝率 --";

      const formRow = node.querySelector(".form-row");
      formRow.innerHTML = "";

      if (recent.length) {
        recent.forEach(r => {
          const b = document.createElement("span");
          b.className = `form-badge ${r === "W" ? "win" : r === "L" ? "loss" : "other"}`;
          b.textContent = r;
          formRow.appendChild(b);
        });
      } else {
        formRow.innerHTML = `<span class="quality-note">近況資料不足</span>`;
      }

      node.querySelector(".last-game").textContent = formatGame(findLastGame(team.id), team.id, "last");
      node.querySelector(".next-game").textContent = formatGame(findNextGame(team.id), team.id, "next");

      node.querySelector(".quality-text").textContent = `${quality.score}%`;
      node.querySelector(".bar i").style.width = `${quality.score}%`;
      node.querySelector(".quality-note").textContent = quality.note;

      const link = node.querySelector(".team-link");
      link.href = `team.html?team=${team.id}`;
      link.textContent = `進入 ${team.short} 球隊頁`;

      grid.appendChild(node);
    });
  }

  function renderH2H() {
    const grid = $("#h2hGrid");
    const map = new Map();

    grid.innerHTML = "";

    state.games.filter(g => isFinalGame(g) && hasScore(g)).forEach(g => {
      const ids = [g.awayId, g.homeId].sort();
      const key = ids.join("__");

      if (!map.has(key)) {
        map.set(key, {
          a: ids[0],
          b: ids[1],
          games: 0,
          wins: {
            [ids[0]]: 0,
            [ids[1]]: 0
          },
          ties: 0
        });
      }

      const row = map.get(key);
      row.games++;

      const winner = getWinner(g);

      if (winner) {
        row.wins[winner] = (row.wins[winner] || 0) + 1;
      } else {
        row.ties++;
      }
    });

    const rows = [...map.values()].sort((a, b) => b.games - a.games);

    if (!rows.length) {
      grid.innerHTML = `<div class="empty">目前沒有足夠的已完成比分資料可產生對戰摘要。</div>`;
      return;
    }

    rows.forEach(r => {
      const a = getTeam(r.a);
      const b = getTeam(r.b);

      const el = document.createElement("article");
      el.className = "h2h-card";
      el.innerHTML = `
        <strong>${a.short} vs ${b.short}</strong>
        <span>${r.games} 場｜${a.short} ${r.wins[r.a] || 0} 勝、${b.short} ${r.wins[r.b] || 0} 勝${r.ties ? `、${r.ties} 和` : ""}</span>
      `;

      grid.appendChild(el);
    });
  }

  function renderEmpty(msg) {
    $("#teamGrid").innerHTML = `<div class="empty">${msg}</div>`;
    $("#h2hGrid").innerHTML = `<div class="empty">${msg}</div>`;
  }

  function findStanding(teamId) {
    return state.standings.find(s => s.teamId === teamId);
  }

  function teamGames(teamId) {
    return state.games.filter(g => g.awayId === teamId || g.homeId === teamId);
  }

  function findLastGame(teamId) {
    return teamGames(teamId)
      .filter(g => isFinalGame(g) && hasScore(g))
      .sort((a, b) => dateValue(b) - dateValue(a))[0];
  }

  function findNextGame(teamId) {
    return teamGames(teamId)
      .filter(g => !isFinalGame(g) && dateValue(g) >= startOfToday())
      .sort((a, b) => dateValue(a) - dateValue(b))[0];
  }

  function recentForm(teamId) {
    return teamGames(teamId)
      .filter(g => isFinalGame(g) && hasScore(g))
      .sort((a, b) => dateValue(b) - dateValue(a))
      .slice(0, 5)
      .map(g => {
        const w = getWinner(g);
        if (!w) return "T";
        return w === teamId ? "W" : "L";
      });
  }

  function calcQuality(teamId) {
    const games = teamGames(teamId);
    const played = games.filter(g => isFinalGame(g) && hasScore(g));
    const next = findNextGame(teamId);
    const standing = findStanding(teamId);

    let score = 0;
    const notes = [];

    if (standing && standing.games > 0) {
      score += 35;
      notes.push("戰績 OK");
    } else {
      notes.push("尚無戰績");
    }

    if (played.length) {
      score += 25;
      notes.push("最近一場 OK");
    } else {
      notes.push("缺最近一場");
    }

    if (next) {
      score += 15;
      notes.push("下一場 OK");
    } else {
      notes.push("缺下一場");
    }

    const hasRichBox = games.some(g => g.hasTotals && (g.hasBatters || g.hasPitchers));
    if (hasRichBox) {
      score += 25;
      notes.push("boxscore OK");
    } else {
      notes.push("boxscore 欄位不足");
    }

    return {
      score: Math.min(100, score),
      note: notes.join("｜")
    };
  }

  function isFinalGame(g) {
    const s = String(`${g.status || ""} ${g.statusText || ""}`).toLowerCase();
    return Boolean(g.finalLock) ||
      s.includes("final") ||
      s.includes("比賽結束") ||
      s.includes("已結束") ||
      s.includes("結束");
  }

  function hasScore(g) {
    return Number.isFinite(g.awayScore) && Number.isFinite(g.homeScore);
  }

  function getWinner(g) {
    if (!hasScore(g)) return null;
    if (g.awayScore === g.homeScore) return null;
    return g.awayScore > g.homeScore ? g.awayId : g.homeId;
  }

  function formatGame(g, teamId, mode) {
    if (!g) return "尚無資料";

    const oppId = g.awayId === teamId ? g.homeId : g.awayId;
    const side = g.awayId === teamId ? "客" : "主";
    const opp = getTeam(oppId)?.short || oppId;
    const d = g.date ? g.date.slice(5).replace("-", "/") : "日期未定";

    if (mode === "last" && hasScore(g)) {
      const myScore = g.awayId === teamId ? g.awayScore : g.homeScore;
      const oppScore = g.awayId === teamId ? g.homeScore : g.awayScore;
      return `${d} ${side} vs ${opp}｜${myScore}:${oppScore}`;
    }

    return `${d} ${g.time || "時間未定"}｜${side} vs ${opp}${g.venue ? `｜${g.venue}` : ""}`;
  }

  function getTeam(id) {
    return TEAMS.find(t => t.id === id) || {
      id,
      short: id,
      name: id,
      color: "#64748b"
    };
  }

  function getTeamId(v) {
    if (!v) return "";

    if (typeof v === "object") {
      v = v.id ||
          v.teamId ||
          v.name ||
          v.teamName ||
          v.fullName ||
          v.displayName ||
          "";
    }

    const s = String(v).trim();
    if (NAME_TO_ID.has(s)) return NAME_TO_ID.get(s);

    const compact = s.replace(/\s/g, "");
    if (NAME_TO_ID.has(compact)) return NAME_TO_ID.get(compact);

    return TEAMS.find(t =>
      compact.includes(t.short) ||
      compact.includes(t.name.replace(/\s/g, ""))
    )?.id || "";
  }

  function score(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeDate(v) {
    if (!v) return "";

    const s = String(v);

    const m = s.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

    return s.slice(0, 10);
  }

  function dateValue(g) {
    const date = g.date || "1900-01-01";
    const time = g.time || "00:00";
    return new Date(`${date}T${time}`).getTime() || 0;
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function avg(arr) {
    return arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  }

  function formScore(list) {
    return list.reduce((sum, x) => {
      if (x === "W") return sum + 2;
      if (x === "T") return sum + 1;
      return sum;
    }, 0);
  }

  function loadedSourceText() {
    if (!state.sources.length) return "沒有讀到任何資料來源。";
    return `已讀取 ${state.sources.length} 個來源：${state.sources.map(s => s.path).join("、")}`;
  }

  function setStatus(type, title, detail) {
    const dot = $(".status-dot");
    dot.className = `status-dot ${type === "ok" ? "" : type}`;
    $("#loadStatus").textContent = title;
    $("#sourceStatus").textContent = detail;
  }
})();