// =========================
// Standings Engine v4
// for data/live/live-boxscore.json
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

  // 初始化球隊
  seasonGames.forEach(g => {
    const home = g.meta.home;
    const away = g.meta.away;

    if (!table[home]) table[home] = createTeam(home);
    if (!table[away]) table[away] = createTeam(away);
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

      home.last10.push("W");
      away.last10.push("L");

      updateStreak(home, "W");
      updateStreak(away, "L");

    } else if (awayScore > homeScore) {
      away.wins++;
      away.awayWins++;

      home.losses++;
      home.homeLosses++;

      away.last10.push("W");
      home.last10.push("L");

      updateStreak(away, "W");
      updateStreak(home, "L");

    } else {
      home.ties++;
      away.ties++;

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

  // 排名：勝率 > 勝場 > 得失分差 > 隊名
  arr.sort((a, b) => {
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.runDiff !== a.runDiff) return b.runDiff - a.runDiff;
    return a.team.localeCompare(b.team, "zh-Hant");
  });

  const leader = arr[0];

  arr.forEach((t, i) => {
    t.rank = i + 1;

    if (i === 0) {
      t.gb = "-";
    } else {
      const gb = ((leader.wins - t.wins) + (t.losses - leader.losses)) / 2;
      t.gb = gb.toFixed(1);
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
    wins: 0,
    losses: 0,
    ties: 0,

    homeWins: 0,
    homeLosses: 0,
    awayWins: 0,
    awayLosses: 0,

    runsFor: 0,
    runsAgainst: 0,
    runDiff: 0,

    streakType: null,
    streakCount: 0,

    last10: [],
    last10Wins: 0,
    last10Losses: 0,
    last10Ties: 0,
    last10Display: "-",

    winPct: 0,
    gb: "-",
    trend: "flat"
  };
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