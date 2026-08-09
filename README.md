# Ray's CPBL Data Site

中華職棒非官方資料網站，以 CPBL 公開賽事資料為來源，提供賽程、戰績、球隊、Match Center、賽季中心與棒球規則等功能。

目前維護版本：`v5.7.0-CHANGED-ONLY-CRAWLER`

## 公開主導覽

- `index.html`：首頁
- `schedule.html`：賽程
- `standings.html`：戰績
- `teams.html`：球隊
- `rules.html`：棒球規則
- `season.html`：賽季中心
- `version.html`：版本紀錄
- `about.html`：網站介紹

`ops/`、`admin/`、`local-tools/` 僅供維護使用，不放入公開主導覽。

## 資料流程

```text
CPBL 公開資料
  → scripts/fetch-cpbl-*.js
  → data/live/*.json
  → 公開 HTML / JavaScript
```

正式比賽資料中心為 `data/live/live-boxscore.json`。`debug`、`snapshot`、`backup` 與 `backups` 內容不屬於公開正式資料。

## 日常維護（PowerShell）

先進入專案：

```powershell
Set-Location E:\cpbl-website
```

日常快速更新：

```powershell
node scripts/update-all.js --only=fast --soft-exit
```

只判斷目前是否需要啟動 LIVE Puppeteer：

```powershell
node scripts/should-run-live-update.js
```

手動執行 LIVE 更新仍可直接使用：

```powershell
node scripts/fetch-cpbl-live-inplay-today.js
```

LIVE 預設啟用 Changed-Only：短時間內官方訊號未變可跳過 detail，抓取後若只有時間戳或 debug 改變，也不會重寫正式 JSON。

```powershell
# 調整同場最短 detail 刷新間隔（秒）
node scripts/fetch-cpbl-live-inplay-today.js --min-refresh-seconds=180

# 指定場次強制抓取
node scripts/fetch-cpbl-live-inplay-today.js --gameSno=198 --force

# 緊急回退為舊的每輪寫入判斷
node scripts/fetch-cpbl-live-inplay-today.js --no-changed-only
```

賽後補強指定日期：

```powershell
node scripts/update-all.js --only=postgame --date=2026-07-10 --soft-exit
```

完整維護模式：

```powershell
node scripts/update-all.js --only=maintenance --soft-exit
```

## 發布前檢查

標準檢查：

```powershell
node scripts/release-gate.js
```

嚴格檢查：

```powershell
node scripts/release-gate.js --strict
```

Release Gate 會檢查：

- 八個公開主頁面的導覽一致性
- `version.html` 是否誤放維運工具入口
- 正式 JSON 與核心 JavaScript 語法
- HTML 亂碼與公開頁面靜態連結
- 2026 上下半季分界（7/2、7/3）
- 編號 198 的 7/10 scheduled 保護
- 編號 196、197 的 9/22 補賽狀態
- Changed-Only crawler fixtures 測試
- package.json 與 package-lock 一致性
- GitHub Actions preflight / cache / concurrency / Release Gate

GitHub Actions 的 LIVE workflow 會先執行 preflight。沒有當日比賽或不在賽前 3 小時至開賽後 7 小時的窗口時，會略過 npm ci 與 Puppeteer；手動 workflow_dispatch 不受此限制。

其他結構檢查：

```powershell
npm run check:pages
npm run check:paths
npm run test:crawler
```

每次 LIVE 執行的耗時與變動摘要會寫入 `logs/crawler-metrics/`；此資料夾已由 `logs/` 規則排除，不會進入 Git。

## Git 建議

請明確加入要提交的正式檔案，不要使用 `git add -A`，避免將 debug、snapshot 或備份檔加入版本控制。

```powershell
git status --short
git add <確認過的正式檔案>
git commit -m "更新說明"
git push
```

## 部署

- GitHub Pages：主站
- Vercel：備援站
- GitHub Actions：LIVE 資料自動更新

本網站為非官方資料專案；賽程、戰績與異動仍以中華職棒官方公告為準。

完整資料流向可參考 `docs/data-dependency-map.md`。

## v6.1.0 全站 UI 重建

- 23 個公開根頁面套用統一設計系統。
- 新增手機導覽、主題切換、麵包屑、返回頂端與鍵盤焦點。
- 統一卡片、表格、表單、Hero 與狀態提示。
- 保留原有資料 DOM 與功能接線，避免 UI 改版破壞資料功能。
- 詳情見 `UI-REBUILD-V6.1.md`。

## 低維護改造 Phase 1（2026-08-08）

戰績已正式改為衍生資料：`data/live/live-boxscore.json` → `scripts/build-standings.js` → 全年／上下半季 standings JSON。2026 半季分界集中於 `config/season-settings.json`；GitHub Actions LIVE 更新後也會同步重建 standings。詳細盤點與後續階段見 `docs/LOW-MAINTENANCE-PHASE1.md`。

## 低維護改造 Phase 2（2026-08-08）

第二階段加入賽後結果自動 reconciliation：每日台灣時間 00:35 由 GitHub Actions 回查最近 7 天，僅針對仍停在 scheduled/live 或 final 但缺合法比分的一軍場次重新抓 CPBL 官方 boxscore，confirmed 後才合併回 `data/live/live-boxscore.json`，再自動重建 standings。延賽、保留、取消場次不會被強制改成 final。詳細見 `docs/LOW-MAINTENANCE-PHASE2.md`。

## v6.3.0 Low-Maintenance Phase 3

- Added full-season CPBL schedule synchronization (`npm run sync:schedule`).
- Schedule changes are merged by `gameSno`, so postponements/reschedules do not create duplicate games.
- LIVE / FINAL games are protected from schedule overwrite.
- GitHub Actions syncs schedule daily at 11:05 and 14:35 Asia/Taipei, refreshes pregame, rebuilds standings and runs Release Gate.
- `data/live/schedule-sync-status.json` records source/cache/success state.

## v6.4.0 Low-Maintenance Personnel Sync

- 每日台灣時間 11:20、16:20 自動同步六隊一/二軍名單與官方球員異動。
- 每日台灣時間 22:40 自動抓隔日預告先發。
- roster 解析疑似空白/殘缺時保留最近一次成功快取，不覆蓋正確資料。
- 球員異動以 date + player 合併歷史，官方新資料優先修正同一筆紀錄。
- 狀態檔：data/rosters/roster-sync-status.json。
