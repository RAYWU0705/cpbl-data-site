// =========================
// v2 Standings Engine (升級版)
// =========================

export function calculateStandings(games){

  const table = {};

  // 初始化球隊
  games.forEach(g=>{
    if (!table[g.home]){
      table[g.home] = createTeam(g.home);
    }
    if (!table[g.away]){
      table[g.away] = createTeam(g.away);
    }
  });

  // 只處理已結束比賽
  games.forEach(g=>{

    if (g.status !== "final" || !g.score) return;

    const home = table[g.home];
    const away = table[g.away];

    home.games++;
    away.games++;

    if (g.score.home > g.score.away){

      home.wins++;
      home.homeWins++;

      away.losses++;
      away.awayLosses++;

      updateStreak(home, "W");
      updateStreak(away, "L");

    } else {

      away.wins++;
      away.awayWins++;

      home.losses++;
      home.homeLosses++;

      updateStreak(away, "W");
      updateStreak(home, "L");
    }
  });

  const arr = Object.values(table);

  // 勝率
  arr.forEach(t=>{
    t.winPct = t.games
      ? (t.wins / t.games)
      : 0;
  });

  // 排序
  arr.sort((a,b)=>{
    if (b.winPct !== a.winPct){
      return b.winPct - a.winPct;
    }
    return b.wins - a.wins;
  });

  // 勝差
  const leader = arr[0];

  arr.forEach((t,i)=>{
    if (i === 0){
      t.gb = "-";
    } else {
      const gb =
        ((leader.wins - t.wins) +
        (t.losses - leader.losses)) / 2;
      t.gb = gb.toFixed(1);
    }
  });

  return arr;
}

// 建立球隊物件
function createTeam(name){
  return {
    team: name,
    games: 0,
    wins: 0,
    losses: 0,

    homeWins: 0,
    homeLosses: 0,
    awayWins: 0,
    awayLosses: 0,

    streakType: null,
    streakCount: 0
  };
}

// 連勝 / 連敗
function updateStreak(team, result){

  if (team.streakType === result){
    team.streakCount++;
  } else {
    team.streakType = result;
    team.streakCount = 1;
  }
}