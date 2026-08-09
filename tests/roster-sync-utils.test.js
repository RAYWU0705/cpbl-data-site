import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTransactions, validateRoster } from '../scripts/lib/roster-sync-utils.js';

test('transaction merge preserves history and lets fresh correction win', () => {
  const oldList = [
    { date: '2026-08-01', player: '甲', reason: '降二軍' },
    { date: '2026-07-30', player: '乙', reason: '升一軍' }
  ];
  const fresh = [
    { date: '2026-08-01', player: '甲', reason: '升一軍' },
    { date: '2026-08-08', player: '丙', reason: '新註冊' }
  ];
  const result = mergeTransactions(fresh, oldList);
  assert.equal(result.length, 3);
  assert.equal(result[0].player, '丙');
  assert.equal(result.find(x => x.player === '甲').reason, '升一軍');
});

test('roster validation rejects suspicious empty/partial scrape', () => {
  const bad = { coaches: { first: { list: [] }, second: { list: [] } }, players: {} };
  assert.equal(validateRoster(bad).ok, false);
});

test('roster validation accepts populated first/second squads', () => {
  const mk = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));
  const good = {
    coaches: { first: { list: [{ name: 'C1' }] }, second: { list: [{ name: 'C2' }] } },
    players: {
      first_投手: { list: mk(8) }, first_捕手: { list: mk(2) }, first_內野手: { list: mk(5) }, first_外野手: { list: mk(4) },
      second_投手: { list: mk(8) }, second_捕手: { list: mk(2) }, second_內野手: { list: mk(5) }, second_外野手: { list: mk(4) }
    }
  };
  assert.equal(validateRoster(good).ok, true);
});
