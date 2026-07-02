CPBL Home No Card Broadcast Layout v4

覆蓋位置：
- index.html → E:\cpbl-website\index.html
- css/*.css → E:\cpbl-website\css\
- js/pages/index.js → E:\cpbl-website\js\pages\index.js

測試：
1. 用 VS Code Live Server 開啟專案。
2. 開 http://127.0.0.1:5500/index.html
3. 按 Ctrl + F5 強制重新整理。
4. 看 Console 是否有紅字。

本版重點：
- 拿掉首頁 dashboard-grid 卡片牆。
- 改成轉播資訊台 + 比分牆 + 新聞式版面。
- 保留原 live-boxscore / probable-pitchers / league-news 流程。
- 保留必要掛載點：scoreTrack、watchGuideContent、todaySummary、top6List、leagueNewsContent、scheduleRadarContent、systemStatus、fanDatabaseContent。
