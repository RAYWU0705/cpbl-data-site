# Low-Maintenance Phase 2 — Final Result Reconciliation

## Goal
每日賽果不再依賴人工補登。即使 LIVE workflow 某次漏抓、CPBL 官方頁面延遲、GitHub Actions 暫時失敗，隔日 reconciliation 仍會回查最近 7 天。

## Flow
`live-boxscore.json` → 找出最近 7 天仍為 scheduled/live 或 final 但缺合法比分 → CPBL 官方 boxscore Vue → confirmed merge → `live-boxscore.json` → standings rebuild → release gate → commit。

## Safety
- postponed / suspended / cancelled 不會被強制升級 final。
- Vue merge 仍要求 confirmed，不能確認就保留原資料。
- crawler 失敗不會清空或覆蓋既有 live-boxscore；Git 內最後成功資料就是 fallback。
- reconciliation 狀態寫入 `data/live/final-reconciliation-status.json`，保留 updatedAt / source / status / lastSuccessfulAt / remaining。

## Commands
- `npm run reconcile:final`
- `node scripts/reconcile-final-results.js --days=7 --dry-run`
- 測試固定日期：`node scripts/reconcile-final-results.js --today=2026-08-08 --days=7 --dry-run`
