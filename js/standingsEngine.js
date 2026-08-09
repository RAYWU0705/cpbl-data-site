// =========================
// Standings Engine v5.2-CARD-EMBED-ELIMINATION-SPLIT-START-FIX
// for data/live/live-boxscore.json
// CPBL official-style standings support
// =========================

export function calculateStandings(games) {
  const table = {};

  const seasonGames = games
    .filter(g => g && g.meta && g.meta.home && g.meta.away)
    .sort((a, b) => {
      const ad = `${getDate(a)} ${getTime(a)}`;
      const bd = `${getDate(b)} ${getTime(b)}`;
      return ad.localeCompare(bd);
    });

  // 初始化球隊，並統計本視圖內每隊總賽程數。
  // 淘汰指數需要知道「這個 split 裡最多還能打幾場」，
  // 因此不能只看已完成 final 場次。
  seasonGames.forEach(g => {
    const home = g.meta.home;
    const away = g.meta.away;

    if (!table[home]) table[home] = createTeam(home);
    if (!table[away]) table[away] = createTeam(away);

    table[home].totalGames++;
    table[away].totalGames++;

    ensureH2H(table[home], away);
    ensureH2H(table[away], home);
  });

  // 只計算 final
  seasonGames.forEach(g => {
    if (g.meta?.status !== "final") return;

    const homeName = g.meta.home;
    const awayName = g.meta.away;

    const home = table[homeName];
    const away = table[awayName];

    const homeScore = Number(g.totals?.home?.R);
    const awayScore = Number(g.totals?.away?.R);

    if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return;

    ensureH2H(home, awayName);
    ensureH2H(away, homeName);

    home.games++;
    away.games++;

    home.runsFor += homeScore;
    home.runsAgainst += awayScore;

    away.runsFor += awayScore;
    away.runsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.wins++;
      home.homeWins++;

      away.losses++;
      away.awayLosses++;

      home.h2h[awayName].wins++;
      away.h2h[homeName].losses++;

      home.last10.push("W");
      away.last10.push("L");

      updateStreak(home, "W");
      updateStreak(away, "L");

    } else if (awayScore > homeScore) {
      away.wins++;
      away.awayWins++;

      home.losses++;
      home.homeLosses++;

      away.h2h[homeName].wins++;
      home.h2h[awayName].losses++;

      away.last10.push("W");
      home.last10.push("L");

      updateStreak(away, "W");
      updateStreak(home, "L");

    } else {
      home.ties++;
      away.ties++;

      home.homeTies++;
      away.awayTies++;

      home.h2h[awayName].ties++;
      away.h2h[homeName].ties++;

      home.last10.push("T");
      away.last10.push("T");

      updateStreak(home, "T");
      updateStreak(away, "T");
    }
  });

  const arr = Object.values(table);

  arr.forEach(t => {
    const decisionGames = t.wins + t.losses;

    t.winPct = decisionGames ? t.wins / decisionGames : 0;
    t.runDiff = t.runsFor - t.runsAgainst;
    t.remainingGames = Math.max(0, t.totalGames - t.games);

    const last10 = t.last10.slice(-10);

    t.last10Wins = last10.filter(x => x === "W").length;
    t.last10Losses = last10.filter(x => x === "L").length;
    t.last10Ties = last10.filter(x => x === "T").length;

    t.last10Display = last10.length ? last10.join(" ") : "-";

    const last10DecisionGames = t.last10Wins + t.last10Losses;
    const last10Pct = last10DecisionGames
      ? t.last10Wins / last10DecisionGames
      : 0.5;

    if (last10Pct > t.winPct + 0.05) {
      t.trend = "up";
    } else if (last10Pct < t.winPct - 0.05) {
      t.trend = "down";
    } else {
      t.trend = "flat";
    }
  });

  // 排名：勝率為唯一名次依據；勝率相同即同名。
  // 顯示順序仍用勝場 / 得失分差 / 隊名當輔助排序，但不影響 rank。
  arr.sort((a, b) => {
    if (!sameWinPct(a.winPct, b.winPct)) return b.winPct - a.winPct;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.runDiff !== a.runDiff) return b.runDiff - a.runDiff;
    return a.team.localeCompare(b.team, "zh-Hant");
  });

  const leader = arr[0];
  const targetGames = Math.max(...arr.map(t => Number(t.totalGames || 0)), 0);

  arr.forEach((t, i) => {
    if (i === 0) {
      t.rank = 1;
    } else {
      const prev = arr[i - 1];
      t.rank = sameWinPct(t.winPct, prev.winPct) ? prev.rank : i + 1;
    }

    if (t.rank === 1) {
      t.gb = "-";
      t.elimination = "-";
    } else {
      const gb = ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2;
      t.gb = Number.isInteger(gb) ? String(gb) : gb.toFixed(1);

      // 淘汰指數 / Tragic Number：
      // 代表「領先隊再贏 + 本隊再輸」合計還差幾次，本隊就無法追上第一名。
      // 使用本視圖內的總賽程數，讓全年 / 上半季 / 下半季各自獨立計算。
      const tragicNumber = targetGames > 0
        ? targetGames + 1 - leader.wins - t.losses
        : null;

      if (tragicNumber === null) {
        t.elimination = "-";
      } else if (tragicNumber <= 0) {
        t.elimination = "淘汰";
      } else {
        t.elimination = String(tragicNumber);
      }
    }
  });

  return arr;
}

/* ========= 工具 ========= */

function createTeam(name) {
  return {
    team: name,
    rank: 0,

    games: 0,
    totalGames: 0,
    remainingGames: 0,
    wins: 0,
    losses: 0,
    ties: 0,

    homeWins: 0,
    homeLosses: 0,
    homeTies: 0,
    awayWins: 0,
    awayLosses: 0,
    awayTies: 0,

    runsFor: 0,
    runsAgainst: 0,
    runDiff: 0,

    h2h: {},

    streakType: null,
    streakCount: 0,

    last10: [],
    last10Wins: 0,
    last10Losses: 0,
    last10Ties: 0,
    last10Display: "-",

    winPct: 0,
    gb: "-",
    elimination: "-",
    trend: "flat"
  };
}

function sameWinPct(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0)) < 0.000001;
}

function ensureH2H(team, opponentName) {
  if (!team || !opponentName) return;
  if (!team.h2h[opponentName]) {
    team.h2h[opponentName] = { wins: 0, losses: 0, ties: 0 };
  }
}

function updateStreak(team, result) {
  if (team.streakType === result) {
    team.streakCount++;
  } else {
    team.streakType = result;
    team.streakCount = 1;
  }
}

function getDate(g) {
  return g?.meta?.date || "";
}

function getTime(g) {
  return g?.meta?.time || "00:00";
}
