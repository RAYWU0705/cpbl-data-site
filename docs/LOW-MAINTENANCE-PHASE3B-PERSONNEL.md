# Low Maintenance Phase 3B — Pregame / Roster / Transactions

## 自動同步
- 22:40（台灣）：抓隔日預告先發，寫入 probable-pitchers 與 live-boxscore pregame 欄位。
- 11:20、16:20（台灣）：抓六隊一、二軍名單與 CPBL 官方球員異動。

## 安全機制
- roster 解析若疑似空白/殘缺，不覆蓋上次成功資料。
- 官方異動頁本次為 0 筆時，保留既有歷史異動。
- 新異動與舊歷史採 date+player 合併；官方 fresh 資料可修正同一筆原因。
- roster-sync-status.json 保存來源、快取狀態、最近成功時間與各隊狀態。
