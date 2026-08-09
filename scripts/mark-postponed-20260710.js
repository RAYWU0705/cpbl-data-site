import fs from "fs/promises";

const TARGET_DATE = "2026-07-10";
const REASON = "\u56e0\u98b1\u98a8\u5ef6\u8cfd"; // 因颱風延賽
const FILE = "data/live/live-boxscore.json";

const text = await fs.readFile(FILE, "utf8");
const games = JSON.parse(text);

let count = 0;

for (const game of games) {
  const date = game?.meta?.date || game?.date || "";

  if (date !== TARGET_DATE) continue;

  game.status = "postponed";
  game.statusText = "\u5ef6\u8cfd";

  game.meta = {
    ...(game.meta || {}),
    status: "postponed",
    statusText: "\u5ef6\u8cfd",
    postponedReason: REASON,
    postponedAt: new Date().toISOString()
  };

  game.totals = {
    away: { R: null, H: null, E: null },
    home: { R: null, H: null, E: null }
  };

  game.lineScore = {
    away: [],
    home: []
  };

  game.batters = game.batters || { away: [], home: [] };
  game.pitchers = game.pitchers || { away: [], home: [] };
  game.liveState = null;

  delete game.finalLock;
  delete game.finalLockSource;
  delete game.finalVueEnhanced;
  delete game.finalVueForceMerged;
  delete game.finalVueForcedFromStatus;
  delete game.finalVueEnhancedAt;
  delete game.finalVueEnhancedVersion;

  if (game.meta) {
    delete game.meta.finalLock;
    delete game.meta.finalLockSource;
    delete game.meta.finalVueEnhanced;
    delete game.meta.finalVueForceMerged;
    delete game.meta.finalVueForcedFromStatus;
    delete game.meta.finalVueEnhancedAt;
    delete game.meta.finalVueEnhancedVersion;
  }

  game.dataQuality = {
    ...(game.dataQuality || {}),
    stage: "postponed",
    source: "manual-postponement",
    score: "debug",
    rhe: "debug",
    lineScore: "debug",
    batters: "debug",
    pitchers: "debug",
    finalLock: "debug",
    message: REASON,
    updatedAt: new Date().toISOString()
  };

  count++;
}

await fs.writeFile(FILE, JSON.stringify(games, null, 2), "utf8");

console.log(`已將 ${TARGET_DATE} ${count} 場標記為延賽`);
