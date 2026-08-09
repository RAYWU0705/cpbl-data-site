import test from "node:test";
import assert from "node:assert/strict";
import { analyzeGame, findTurningPoint, rankMvpCandidates } from "../js/intelligence/baseball-intelligence.js";

const game = {
  gameSno: 999,
  meta: { status: "final", away: "中信兄弟", home: "統一7-ELEVEn獅" },
  lineScore: { innings:["1","2","3","4","5","6","7","8","9"], away:[0,0,0,0,0,0,4,0,0], home:[0,1,0,0,0,3,0,0,0] },
  totals: { away:{R:4}, home:{R:4} },
  batters: { away:[{name:"測試打者",H:3,RBI:3,HR:1,gameWinningRbi:true}], home:[] },
  pitchers: { away:[], home:[] }
};

test("turning point detects late four-run lead change", () => {
  const point = findTurningPoint(game);
  assert.equal(point.inning, 7);
  assert.equal(point.runs, 4);
});

test("MVP ranking returns productive batter", () => {
  const list = rankMvpCandidates(game);
  assert.equal(list[0].name, "測試打者");
  assert.ok(list[0].score >= 8);
});

test("analysis returns stable structured output", () => {
  const result = analyzeGame(game);
  assert.equal(result.version, "6.0.0");
  assert.ok(result.summary.length > 10);
  assert.equal(result.dataConfidence, "HIGH");
});
