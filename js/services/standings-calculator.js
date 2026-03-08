export function calculateStandings(games) {
  const table = {};

  games.forEach(game => {
    if (game.status !== "final") return;

    const { homeId, awayId, homeScore, awayScore } = game;

    if (!table[homeId]) {
      table[homeId] = { id: homeId, wins: 0, losses: 0 };
    }

    if (!table[awayId]) {
      table[awayId] = { id: awayId, wins: 0, losses: 0 };
    }

    if (homeScore > awayScore) {
      table[homeId].wins++;
      table[awayId].losses++;
    } else if (awayScore > homeScore) {
      table[awayId].wins++;
      table[homeId].losses++;
    }
  });

  return Object.values(table);
}
