import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  diffMeaningfulGame,
  selectChangedOnlyLiveGames
} from "../scripts/lib/crawler-change-selector.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixture = JSON.parse(
  await fs.readFile(path.join(__dirname, "fixtures/live-changed-only.json"), "utf8")
);

test("changed-only selector separates recent, incomplete, stale, final and new games", () => {
  const result = selectChangedOnlyLiveGames({
    candidates: fixture.candidates,
    existingGames: fixture.existingGames,
    nowMs: Date.parse(fixture.now),
    minRefreshMs: fixture.minRefreshMs
  });

  assert.deepEqual(
    result.selected.map(row => [row.gameSno, row.reason]),
    [
      [202, "data-incomplete"],
      [203, "refresh-window"],
      [205, "new-game"]
    ]
  );

  assert.deepEqual(
    result.skipped.map(row => [row.gameSno, row.reason]),
    [
      [201, "recent-unchanged"],
      [204, "final-guard"]
    ]
  );
});

test("official score change bypasses recent refresh guard", () => {
  const candidates = fixture.candidates.map(game =>
    game.gameSno === 201 ? { ...game, awayScore: 2 } : game
  );

  const result = selectChangedOnlyLiveGames({
    candidates,
    existingGames: fixture.existingGames,
    nowMs: Date.parse(fixture.now),
    minRefreshMs: fixture.minRefreshMs
  });

  const row = result.selected.find(item => item.gameSno === 201);
  assert.equal(row?.reason, "official-signal-changed");
  assert.deepEqual(row?.signalChanges, ["away.R:1->2"]);
});

test("force gameSno bypasses final and recent guards", () => {
  const result = selectChangedOnlyLiveGames({
    candidates: fixture.candidates,
    existingGames: fixture.existingGames,
    nowMs: Date.parse(fixture.now),
    minRefreshMs: fixture.minRefreshMs,
    forceGameSnos: [201, 204]
  });

  assert.equal(result.selected.find(row => row.gameSno === 201)?.reason, "forced");
  assert.equal(result.selected.find(row => row.gameSno === 204)?.reason, "forced");
});

test("meaningful diff ignores debug and timestamps", () => {
  const before = {
    gameSno: 201,
    meta: { status: "live" },
    totals: { away: { R: 1 }, home: { R: 2 } },
    dataQuality: { score: "confirmed", updatedAt: "2026-07-10T10:00:00Z" },
    debug: { parser: "old" }
  };

  const after = {
    ...before,
    dataQuality: { score: "confirmed", updatedAt: "2026-07-10T10:05:00Z" },
    debug: { parser: "new", fetchedAt: "2026-07-10T10:05:00Z" }
  };

  assert.equal(diffMeaningfulGame(before, after).changed, false);
});

test("meaningful diff detects public score and live-state changes", () => {
  const before = {
    gameSno: 201,
    totals: { away: { R: 1 }, home: { R: 2 } },
    liveState: { inningText: "3局上", pitchCount: 42 }
  };

  const after = {
    gameSno: 201,
    totals: { away: { R: 2 }, home: { R: 2 } },
    liveState: { inningText: "3局上", pitchCount: 43 }
  };

  const diff = diffMeaningfulGame(before, after);
  assert.equal(diff.changed, true);
  assert.deepEqual(diff.paths, ["liveState.pitchCount", "totals.away.R"]);
});
