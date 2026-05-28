Ray's CPBL Data Site
v5.2.1-FARM-MATCH-CENTER

完整新增版：
1. farm-match.html → 專案根目錄
2. css/farm-match.css → css/
3. js/pages/farm-match.js → js/pages/

資料來源：
data/farm/farm-schedule-2026.json

使用方式：
farm-match.html?gameSno=83&date=2026-05-22

重要：
- 這是二軍旁路比賽中心。
- 不讀一軍 live-boxscore.json。
- 不動一軍 match.html。
- 不爬二軍 boxscore 明細。
- 不顯示假逐局 / 假打者 / 假投手表。

目前顯示內容：
- 主客隊
- 比分
- 狀態 scheduled / live / final
- 日期時間球場
- PresentStatus / IsPlayBall / GameResult
- 開始與結束時間
- 比賽時間
- 先發投手 / 勝敗救 / MVP
- 官方二軍 Box 連結
- 同隊相關二軍賽程
- Raw data 摘要

建議下一步：
如果這頁正常，再把 farm-schedule.js 的比賽卡加上 farm-match.html 連結。
