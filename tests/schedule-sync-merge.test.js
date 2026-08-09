import test from 'node:test'; import assert from 'node:assert/strict';
import {mergeOfficialSchedule, normalizeScheduleStatus} from '../scripts/lib/schedule-sync-merge.js';

test('scheduled game can move date/time/venue without duplication',()=>{
 const old=[{gameSno:99,meta:{date:'2026-07-10',time:'18:35',venue:'洲際',status:'scheduled',home:'中信兄弟',away:'味全龍'}}];
 const off=[{gameSno:99,date:'2026-09-22',time:'18:35',venue:'洲際',status:'scheduled',home:'中信兄弟',away:'味全龍'}];
 const r=mergeOfficialSchedule(old,off,'x'); assert.equal(r.games.length,1); assert.equal(r.games[0].meta.date,'2026-09-22'); assert.equal(r.summary.updated,1);
});
test('final game is protected from schedule overwrite',()=>{
 const old=[{gameSno:1,meta:{date:'2026-03-28',status:'final',home:'A',away:'B'},totals:{home:{R:3},away:{R:2}}}];
 const off=[{gameSno:1,date:'2026-04-01',status:'scheduled',home:'A',away:'B'}]; const r=mergeOfficialSchedule(old,off,'x'); assert.equal(r.games[0].meta.date,'2026-03-28'); assert.equal(r.summary.protected,1);
});
test('new official game is inserted',()=>{const r=mergeOfficialSchedule([], [{gameSno:361,date:'2026-10-01',home:'A',away:'B',status:'scheduled'}],'x'); assert.equal(r.summary.inserted,1);});
test('special status normalization',()=>{assert.equal(normalizeScheduleStatus('延賽'),'postponed');assert.equal(normalizeScheduleStatus('保留比賽'),'suspended');assert.equal(normalizeScheduleStatus('取消'),'cancelled');});

import { findSpecialScheduleStatus, applyScheduleStatusOverrides } from '../scripts/lib/schedule-sync-status.js';

test('schedule parser can discover 延賽 from unknown nested field',()=>{
  const row={GameSno:254, Extra:{Whatever:'官方公告：本場延賽'}};
  assert.deepEqual(findSpecialScheduleStatus(row, normalizeScheduleStatus), {status:'postponed',statusText:'官方公告：本場延賽'});
});

test('confirmed schedule override patches #254 only while stale date/status matches',()=>{
  const cfg={years:{'2026':{'254':{matchDates:['2026-08-08','2026-08-09'],onlyWhenStatus:'scheduled',date:'2026-08-08',status:'postponed',statusText:'延賽'}}}};
  const stale=applyScheduleStatusOverrides([{gameSno:254,date:'2026-08-09',status:'scheduled'}],cfg,2026);
  assert.equal(stale.games[0].date,'2026-08-08');
  assert.equal(stale.games[0].status,'postponed');
  assert.equal(stale.applied.length,1);
  const future=applyScheduleStatusOverrides([{gameSno:254,date:'2026-09-30',status:'scheduled'}],cfg,2026);
  assert.equal(future.games[0].date,'2026-09-30');
  assert.equal(future.games[0].status,'scheduled');
  assert.equal(future.applied.length,0);
});
