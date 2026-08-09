import test from "node:test";
import assert from "node:assert/strict";
import { selectReconciliationTargets } from "../scripts/lib/final-reconciliation-selector.js";

const game = (date, status, sno, awayR=null, homeR=null) => ({
  gameSno: sno,
  meta: { date, status, away: "A", home: "B" },
  totals: { away: { R: awayR }, home: { R: homeR } }
});

test("reconciliation selects recent past unresolved games only", () => {
  const rows = [
    game("2026-08-07", "scheduled", 1),
    game("2026-08-07", "live", 2),
    game("2026-08-07", "final", 3, 4, 2),
    game("2026-08-07", "final", 4, null, null),
    game("2026-08-07", "postponed", 5),
    game("2026-08-08", "scheduled", 6),
    game("2026-07-20", "scheduled", 7)
  ];
  const selected = selectReconciliationTargets(rows, { today: "2026-08-08", lookbackDays: 7 });
  assert.deepEqual(selected.map(x => x.gameSno), [1,2,4]);
});

test("reconciliation preserves ties as valid finals", () => {
  const selected = selectReconciliationTargets([
    game("2026-08-07", "final", 1, 3, 3)
  ], { today: "2026-08-08", lookbackDays: 7 });
  assert.equal(selected.length, 0);
});
