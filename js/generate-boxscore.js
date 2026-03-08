async function generate(month) {
  const scheduleUrl = `data/schedule-${month}.json`;
  const res = await fetch(scheduleUrl);
  if (!res.ok) {
    alert("找不到 schedule 檔案");
    return;
  }

  const games = await res.json();
  const box = {};

  games.forEach(g => {
    const date = g.date.replaceAll("-", "");
    const home = g.teams.home;
    const away = g.teams.away;

    const gameId = `${date}_${home}_${away}`;

    box[gameId] = {
      meta: {
        date: g.date,
        home,
        away,
        time: g.time ?? null,
        venue: g.venue ?? null
      },
      lineScore: {
        away: Array(9).fill(null),
        home: Array(9).fill(null)
      },
      totals: {
        away: { R: null, H: null, E: null },
        home: { R: null, H: null, E: null }
      }
    };
  });

  const blob = new Blob(
    [JSON.stringify(box, null, 2)],
    { type: "application/json" }
  );

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `boxscore-${month}.json`;
  a.click();
}
