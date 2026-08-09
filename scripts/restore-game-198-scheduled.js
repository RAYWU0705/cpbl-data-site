import fs from "fs/promises";

const FILE = "data/live/live-boxscore.json";
const TARGET_DATE = "2026-07-10";
const TARGET_GAME_SNO = 198;

const text = await fs.readFile(FILE, "utf8");
const games = JSON.parse(text);

let count = 0;

for (const game of games) {
  const gameSno = Number(game?.gameSno || game?.meta?.gameSno || game?.officialGameSno || 0);
  const date = game?.meta?.date || game?.date || "";

  if (gameSno !== TARGET_GAME_SNO || date !== TARGET_DATE) continue;

  game.status = "scheduled";
  game.statusText = "比賽尚未開始";

  game.meta = {
    ...(game.meta || {}),
    status: "scheduled",
    statusText: "比賽尚未開始"
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
    source: "manual-restore-scheduled",
    score: "debug",
    rhe: "debug",
    lineScore: "debug",
    batters: "debug",
    pitchers: "debug",
    finalLock: "debug",
    message: "編號198尚未宣布延賽，已改回比賽尚未開始",
    updatedAt: new Date().toISOString()
  };

  count++;
}

await fs.writeFile(FILE, JSON.stringify(games, null, 2), "utf8");

console.log(`已將 ${TARGET_DATE} 編號 ${TARGET_GAME_SNO} 改回 scheduled，共 ${count} 場`);
