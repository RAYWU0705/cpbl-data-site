# Low Maintenance Phase 3 — Full Schedule Sync

Phase 3 adds full-season official schedule synchronization on top of the existing LIVE, FINAL reconciliation and standings pipeline.

## Data flow

CPBL official schedule -> `scripts/sync-cpbl-schedule.js` -> `data/live/schedule-2026.json` -> safe merge into `data/live/live-boxscore.json` -> standings rebuild -> frontend.

## Safety rules

- `gameSno` is the merge key, so a moved game is updated rather than duplicated.
- LIVE / FINAL / finalLock games are protected from schedule metadata overwrite.
- A source parse with fewer than 100 games is rejected and cached data is preserved.
- Schedule sync status is recorded in `data/live/schedule-sync-status.json`.
- Scheduled/postponed/suspended/cancelled games may receive official schedule metadata updates; boxscore data is never fabricated.

## Automation

`.github/workflows/sync-schedule.yml` runs at 11:05 and 14:35 Asia/Taipei daily, then refreshes today's pregame data, rebuilds standings and runs the release gate.
