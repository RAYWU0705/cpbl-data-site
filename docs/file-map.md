\# Ray CPBL Data Site 檔案地圖



本文件記錄專案主要資料夾與檔案用途。



\## 專案定位



Ray CPBL Data Site 是中華職棒非官方數據中心。



核心資料流：



CPBL 官網 → Puppeteer scripts → data/live JSON → 前端頁面 → admin/debug 維運檢查



\## scripts/



存放資料抓取、合併、救援、偵錯與維護腳本。



\### scripts 根目錄



根目錄只保留正式主線或高頻維護腳本。



\- update-all.js：主更新流程入口

\- check-data-health.js：資料健康檢查

\- fetch-cpbl-pregame-today.js：抓取今日賽前資料

\- fetch-cpbl-live-inplay-today.js：抓取即時比賽資料

\- fetch-cpbl-final-boxscore-vue.js：抓取一軍 FINAL Vue boxscore

\- merge-first-team-final-vue-boxscore.js：合併一軍 FINAL Vue boxscore

\- build-league-news.js：產生聯盟新聞資料

\- fetch-cpbl-player-detail.js：球員詳細資料抓取

\- fetch-cpbl-rosters.js：球隊名單抓取

\- fetch-cpbl-farm-schedule-static.js：二軍賽程抓取

\- fetch-cpbl-farm-final-boxscore.js：二軍 boxscore 抓取



\### scripts 子資料夾



\- lib/：共用模組

\- debug/：偵錯、結構探測、頁面檢查工具

\- tools/：修復、救援、補洞工具

\- site-tools/：網站頁面架構、搬移、rollback 相關工具

\- legacy/：舊版流程，保留備查

\- danger/：高風險腳本，未確認前不要執行

\- backup/：歷史備份



\## data/



存放網站正式資料與維護資料。



\### data 根目錄



\- teams.json：球隊基本資料

\- standings-2026.json：全年戰績

\- standings-2026-first.json：上半季戰績

\- standings-2026-second.json：下半季戰績



\### data/live/



一軍即時資料主區。



正式資料保留於根目錄：



\- live-boxscore.json

\- pregame-today.json

\- probable-pitchers.json

\- league-news.json

\- final-boxscore-vue-2026.json

\- final-boxscore-vue-merge-2026.report.json

\- final-vue-rescue-2026.report.json



子資料夾：



\- debug/：Vue final boxscore debug 與 snapshot

\- incidents/：事故與救援前後資料

\- archive/pregame/：日期版 pregame 歷史資料

\- backups/：大量更新備份

\- backup/：final-boxscore-vue bak 備份



\### data/farm/



二軍資料主區。



正式資料：



\- farm-schedule-2026.json

\- farm-boxscore-2026.json



子資料夾：



\- debug/：二軍 debug 與 snapshot

\- backup/：二軍備份



\### data/rosters/



一軍球隊名單。



\- brothers.json

\- lions.json

\- monkeys.json

\- dragons.json

\- guardians.json

\- hawks.json

\- team-rosters.json



\### data/manual/



人工補洞與手動覆蓋資料。



\- manual-boxscore-overrides.json

\- manual-boxscore-overrides.example.json



\### data/games/



單場比賽資料或早期測試資料。



\- 2026-04-01\_brothers\_dragons.json



\## admin / debug 頁面



admin 與 debug 頁面用於資料檢查與維護，不應與一般使用者頁面混在一起。



\## 不放入本專案本體的功能



以下功能應獨立為其他 project：



\- 洲際大螢幕／記分板模擬器

\- 球迷日記

\- 個人觀賽紀錄

\- 過度娛樂化功能

