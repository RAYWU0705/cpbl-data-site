# CPBL Data Site 頁面總表

版本：v5.6.1-A  
狀態：已完成 OPS／ADMIN／LOCAL TOOL 安全分區；公開舊網址保留轉址。

## 類型定義

| 類型 | 意義 | 是否部署 | 一般導覽 |
|---|---|---:|---:|
| PUBLIC | 一般使用者正式頁面 | 是 | 可 |
| OPS_PUBLIC | 可公開的戰情／營運頁 | 是 | 可 |
| OPS | 維運監控頁 | 是 | 不建議 |
| ADMIN | 內部管理頁 | 可選 | 否 |
| LOCAL_TOOL | 只在本機使用的工具 | 否 | 否 |
| GENERATED | 腳本產生的 Debug／Snapshot | 否 | 否 |
| VENDOR | node_modules 等第三方檔案 | 否 | 否 |

## PUBLIC

| 檔案 | 名稱 | 導覽 |
|---|---|---|
| `index.html` | 首頁 | MAIN |
| `schedule.html` | 一軍賽程 | MAIN |
| `standings.html` | 戰績排名 | MAIN |
| `match.html` | 比賽中心 | CONTEXT |
| `teams.html` | 球隊列表 | MAIN |
| `team.html` | 球隊總覽 | CONTEXT |
| `team-roster.html` | 球隊名單 | CONTEXT |
| `team-schedule.html` | 球隊賽程 | CONTEXT |
| `team-stats.html` | 球隊分析 | CONTEXT |
| `team-transactions.html` | 球員異動 | CONTEXT |
| `season.html` | 賽季中心 | MAIN |
| `h2h.html` | 對戰分析 | CONTEXT |
| `search.html` | 搜尋 | CONTEXT |
| `about.html` | 網站介紹 | MAIN |
| `version.html` | 版本紀錄 | MAIN |
| `rules.html` | 棒球規則 | MAIN |
| `farm-schedule.html` | 二軍賽程 | CONTEXT |
| `farm-match.html` | 二軍比賽中心 | CONTEXT |
| `player.html` | 球員頁 | CONTEXT |
| `report.html` | 報告模式 | CONTEXT |

## OPS_PUBLIC

| 檔案 | 名稱 | 說明 |
|---|---|---|
| `game-day.html` | 今日戰情中心 | 可公開查看，但兼具維運用途 |

## OPS

| 檔案 | 名稱 | 狀態 |
|---|---|---|
| `ops/data-quality.html` | 資料品質中心 | ACTIVE |
| `ops/teams-dashboard.html` | 球隊資料 Dashboard | ACTIVE |
| `ops/live-logger.html` | LIVE Logger | REVIEW |

## ADMIN

| 現在檔案 | 名稱 | 未來建議路徑 |
|---|---|---|
| `admin/ops-center.html` | Admin Ops Center | `admin/ops-center.html` |

## LOCAL TOOL

| 現在檔案 | 名稱 | 未來建議路徑 | 部署 |
|---|---|---|---:|
| `local-tools/manual-override.html` | Manual Override Generator | `local-tools/manual-override.html` | 否 |

## 不屬於網站頁面的 HTML

以下來源不應列入正式頁面清單：

- `debug/**/*.html`：爬蟲快照、官方頁面存檔、除錯資料。
- `node_modules/**/*.html`：第三方套件內容。
- `server/node_modules/**/*.html`：伺服器端第三方套件內容。

## 下一階段候選

v5.6.1-B 才會評估實際搬移：

- `game-day.html` → 是否維持公開根目錄。
- `ops/data-quality.html` → `ops/data-quality.html`
- `ops/teams-dashboard.html` → `ops/teams-dashboard.html`
- `admin/ops-center.html` → `admin/ops-center.html`
- `local-tools/manual-override.html` → `local-tools/manual-override.html`

在搬移前，必須先掃描 CSS、JS、圖片、JSON、HTML 互連與 `fetch()` 相對路徑。
