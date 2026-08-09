import fs from "fs/promises";

const FILE = "data/live/live-boxscore.json";

const ORIGINAL_DATE = "2026-07-10";
const NEW_DATE = "2026-09-22";
const KEEP_ORIGINAL_GAME_SNOS = new Set([198]);

const text = await fs.readFile(FILE, "utf8");
const games = JSON.parse(text);

let moved = [];

for (const game of games) {
  const gameSno = Number(game?.gameSno || game?.meta?.gameSno || game?.officialGameSno || 0);
  const date = game?.meta?.date || game?.date || "";
  const status = game?.meta?.status || game?.status || "";

  if (date !== ORIGINAL_DATE) continue;
  if (KEEP_ORIGINAL_GAME_SNOS.has(gameSno)) continue;

  const isPostponed =
    status === "postponed" ||
    game?.status === "postponed" ||
    /延賽/.test(String(game?.meta?.statusText || game?.statusText || ""));

  if (!isPostponed) continue;

  const oldMeta = game.meta || {};

  game.date = NEW_DATE;
  game.status = "scheduled";
  game.statusText = "比賽尚未開始";

  game.meta = {
    ...oldMeta,
    date: NEW_DATE,
    originalDate: ORIGINAL_DATE,
    rescheduledFrom: ORIGINAL_DATE,
    rescheduledTo: NEW_DATE,
    rescheduledReason: "因颱風延賽，補賽日改至2026-09-22",
    status: "scheduled",
    statusText: "比賽尚未開始",
    rescheduledAt: new Date().toISOString()
  };

  delete game.meta.postponedReason;
  delete game.meta.postponedAt;

  game.totals = {
    away: { R: null, H: null, E: null },
    home: { R: null, H: null, E: null }
  };

  game.lineScore = {
    away: [],
    home: []
  };

  game.liveState = null;

  game.dataQuality = {
    ...(game.dataQuality || {}),
    stage: "pregame",
    source: "manual-reschedule",
    score: "debug",
    rhe: "debug",
    lineScore: "debug",
    batters: "debug",
    pitchers: "debug",
    finalLock: "debug",
    message: "因颱風延賽，補賽日改至2026-09-22",
    updatedAt: new Date().toISOString()
  };

  moved.push({
    gameSno,
    away: game?.meta?.away || "",
    home: game?.meta?.home || "",
    from: ORIGINAL_DATE,
    to: NEW_DATE
  });
}

games.sort((a, b) => {
  const ad = `${a?.meta?.date || a?.date || ""} ${a?.meta?.time || a?.time || ""} ${Number(a?.gameSno || 0)}`;
  const bd = `${b?.meta?.date || b?.date || ""} ${b?.meta?.time || b?.time || ""} ${Number(b?.gameSno || 0)}`;
  return ad.localeCompare(bd);
});

await fs.writeFile(FILE, JSON.stringify(games, null, 2), "utf8");

console.log(`已移動 ${moved.length} 場：`);
for (const row of moved) {
  console.log(`#${row.gameSno} ${row.away} vs ${row.home}：${row.from} -> ${row.to}`);
}
