CPBL Home Broadcast Frontpage v2
================================

覆蓋位置：
- index.html -> 專案根目錄 index.html
- css/*.css -> 專案 css/ 資料夾
- js/pages/index.js -> 專案 js/pages/index.js

這版改動：
1. 首頁從純卡片型改成「轉播首頁 + 資料入口 + 卡片內容區」混合排版。
2. 保留原本 live-boxscore / probable-pitchers / league-news 的 JSON 讀取流程。
3. 新增首頁 Hero 今日狀態：LIVE、未開打、FINAL、時鐘。
4. 新增資料中心入口列：賽程、戰績、球隊、搜尋、二軍、版本。
5. 保留原本 scoreTrack、systemStatus、todaySummary、focusTrack、top6List 等掛載點。

測試方式：
1. 用 VS Code Live Server 啟動專案。
2. 開啟 http://127.0.0.1:5500/index.html
3. 按 Ctrl + F5 強制重新整理。
4. 檢查 Console 是否有紅字。
5. 檢查 data/live/live-boxscore.json 是否 200。

建議：覆蓋前先備份原檔，或先用 git status 確認工作區乾淨。
