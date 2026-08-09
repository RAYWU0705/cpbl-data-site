# CPBL Crawler Pipeline

目前版本：`v5.7.0-CHANGED-ONLY-CRAWLER`

## Pipeline

| 模式 | 階段 | 指令 |
| --- | --- | --- |
| fast | pregame → live → news | `node scripts/update-all.js --only=fast --soft-exit` |
| postgame | final → news | `node scripts/update-all.js --only=postgame --date=YYYY-MM-DD --soft-exit` |
| maintenance | players → pregame → final → news | `node scripts/update-all.js --only=maintenance --soft-exit` |
| live | live only | `node scripts/fetch-cpbl-live-inplay-today.js` |

## Changed-Only LIVE

LIVE 預設分成兩層：

1. Detail 前：依新場次、官方狀態／比分變化、資料完整度與 refresh window 選擇候選。
2. 寫入前：排除 debug、raw、updatedAt 等非實質差異。

只有公開資料真正變化才備份並寫入 `data/live/live-boxscore.json`。

```powershell
# 預設 120 秒 refresh window
node scripts/fetch-cpbl-live-inplay-today.js

# 改為 180 秒
node scripts/fetch-cpbl-live-inplay-today.js --min-refresh-seconds=180

# 強制指定場次
node scripts/fetch-cpbl-live-inplay-today.js --gameSno=198 --force

# 回退舊行為
node scripts/fetch-cpbl-live-inplay-today.js --no-changed-only
```

## Metrics

每輪執行會輸出：

```text
logs/crawler-metrics/live-YYYYMMDD-HHMMSS.json
```

內容包含 browser launch、schedule、首頁備援、detail、write 耗時，以及各場 outcome 與 changed paths。

## 驗證

```powershell
node --check scripts/fetch-cpbl-live-inplay-today.js
npm run test:crawler
node scripts/update-all.js --only=fast --dry-run --no-backup --strict
node scripts/release-gate.js --strict
```

大型 HTML / TXT debug 預設不寫；需要診斷時才加 `--debug-write`。
