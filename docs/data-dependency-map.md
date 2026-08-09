# Ray's CPBL Data Site｜Data Dependency Map

版本：`v5.7.0-CHANGED-ONLY-CRAWLER`

## 更新管線

| Pipeline | 執行階段 | 建議用途 |
| --- | --- | --- |
| `fast` | pregame → live → news | 比賽日快速更新 |
| `postgame` | final → news | 指定日期賽後補強 |
| `maintenance` | players → pregame → final → news | 例行完整維護 |
| `live` | live | 比賽中單獨更新 |

## 寫入關係

| Script | 主要讀取 | 正式寫入 |
| --- | --- | --- |
| `fetch-cpbl-pregame-today.js` | CPBL schedule / home / box、既有 live-boxscore | `pregame-日期.json`、`pregame-today.json`、`probable-pitchers.json`、`live-boxscore.json` |
| `fetch-cpbl-live-inplay-today.js` | CPBL schedule API、必要時首頁、boxscore、manual overrides、changed-only selector | 有效差異存在時才寫 `live-boxscore.json` |
| `fetch-cpbl-final-boxscore-vue.js` | `live-boxscore.json`、CPBL Vue boxscore | `final-boxscore-vue-2026.json` 與 report |
| `merge-first-team-final-vue-boxscore.js` | `live-boxscore.json`、`final-boxscore-vue-2026.json` | `live-boxscore.json` 與 merge report |
| `build-league-news.js` | `live-boxscore.json`、`probable-pitchers.json` | `league-news.json` |
| `fetch-cpbl-rosters.js` | CPBL 球隊名單與異動 | `data/rosters/<team>.json`、`team-rosters.json` |

## 讀取關係

| 正式資料 | 主要使用頁面 |
| --- | --- |
| `data/live/live-boxscore.json` | 首頁、賽程、戰績、Match Center、球隊頁、賽季中心、搜尋 |
| `data/live/probable-pitchers.json` | 首頁、賽程、Match Center |
| `data/live/league-news.json` | 首頁快訊 |
| `data/rosters/*.json` | 球隊名單、球員異動 |
| `data/farm/*.json` | 二軍賽程與二軍 Match Center |

## 保護層

```text
manual override
  → 特殊狀態（postponed / suspended / cancelled）
  → finalLock / recentFinalGuard
  → crawler data
```

- LIVE 不覆蓋 FINAL。
- PREGAME 不覆蓋 LIVE / FINAL。
- FINAL Vue 先寫旁路資料，再由 merge 腳本補強 `live-boxscore.json`。
- debug、snapshot、backup、backups 與 incidents 不屬於公開正式資料。

## GitHub Actions LIVE 流程

```text
checkout
  → setup Node + npm cache
  → should-run-live-update preflight
  → npm ci（需要更新時才執行）
  → LIVE fetch
  → Changed-Only meaningful diff
  → Release Gate --live-update
  → 精準 git add 正式 JSON
  → commit / push
```

手動 `workflow_dispatch` 會強制通過 preflight，適合官方狀態延遲或需要立即補抓時使用。

## Changed-Only LIVE 流程

```text
schedule / home LIVE 候選
  → new game / official signal / data quality / refresh window
  → boxscore detail
  → manual override / lineScore rescue
  → meaningful diff（忽略 debug / raw / timestamps）
  → 有效差異：backup + write
  → 無有效差異：skip write + no commit
  → logs/crawler-metrics
```

固定測試樣本位於 `tests/fixtures/`，由 `npm run test:crawler` 與 Release Gate 執行。
