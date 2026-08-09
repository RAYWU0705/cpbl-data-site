# Low-Maintenance Roadmap / Phase 1

日期：2026-08-08

## 本次盤點

- 一軍正式比賽主檔：`data/live/live-boxscore.json`（目前 360 場例行賽）。
- `standings.html` 原本已直接由 `live-boxscore.json` 即時計算戰績，因此根目錄三份 `standings-2026*.json` 並非前端正式來源，且原內容仍是 0 勝 0 敗舊資料。
- 自動抓取已存在：pregame、LIVE、FINAL Vue、roster、farm、league news。
- GitHub Actions 已存在，每 5 分鐘觸發並由 preflight 判斷是否真的啟動 Puppeteer。
- 原 workflow 只提交 `data/live/live-boxscore.json`，衍生 standings 沒有自動重建。
- 2026 半季分界原本同時寫死在 `standings.html`、`js/season.js`、Release Gate。
- `data/manual/manual-boxscore-overrides.json` 是刻意保留的人工例外層，適合延賽、補賽、官方異常等特殊事件，不應完全移除。

## Phase 1 已完成

1. 新增 `config/season-settings.json`，集中管理賽季與半季日期。
2. 新增 `scripts/build-standings.js`，只從 `data/live/live-boxscore.json` 推導全年、上半季、下半季戰績。
3. standings 產物加入 `updatedAt`、`source`、`dataStatus`、`isCached`、`lastSuccessfulAt`。
4. Builder 採 atomic write；來源或 final 比分不合法時拒絕覆蓋，保留最近一次成功 standings 作 fallback。
5. 沒有實質戰績變化時不重寫檔案，避免 Actions 只因 timestamp 製造 commit。
6. `update-all.js` 新增 standings stage，fast/postgame/maintenance/all 等流程都會帶入。
7. GitHub Actions LIVE 更新後會重建 standings，並精準 commit 三份 standings JSON。
8. `standings.html` 與 `js/season.js` 改讀 season settings，不再各自維護 7/2、7/3。
9. Release Gate 新增 season config 與衍生 standings metadata 檢查。

## 仍需人工維護

- 球隊名稱、隊徽、UI 與特殊規則。
- `manual-boxscore-overrides.json`：只在官方資料錯誤、延賽/補賽等例外才用。
- 目前 GitHub Actions 只涵蓋 LIVE window；「隔天自動補 FINAL / 整季賽程異動重抓」仍需 Phase 2/3 完成。
- `live-boxscore.json` 本身尚未有檔案級 `dataStatus / lastSuccessfulAt / cache state` envelope；目前只能靠 committed JSON 當靜態 fallback。這是 Phase 4 的核心工作。

## 下一階段最低風險順序

- Phase 2：新增每日固定 FINAL reconciliation（不依賴正在比賽），自動補昨天/最近未完成場次。
- Phase 3：建立 data-source adapter，把 schedule/pregame/live/final 抽成穩定介面，並增加整季 schedule reconciliation。
- Phase 4：加入正式 cache metadata / stale warning，前端在來源失敗時顯示最近成功資料與警告。
- Phase 5：調整 Actions 排程與健康檢查，達成一週不碰仍可自行修補。

## 驗證

```powershell
npm run build:standings
npm run test:crawler
node scripts/release-gate.js --strict
```

2026-08-08 驗證結果：Strict Release Gate 16 PASS / 0 WARN / 0 ERROR。
