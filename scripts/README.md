\# scripts 說明



此資料夾存放 Ray CPBL Data Site 的資料抓取、合併、修復與維護腳本。



\## 根目錄主線腳本



根目錄只保留目前正式資料流程會使用，或高頻維護需要直接執行的腳本。



目前主線包含：



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



\## 子資料夾



\- lib/：共用模組

\- debug/：偵錯、結構探測、頁面檢查工具

\- tools/：修復、救援、補洞工具

\- site-tools/：網站頁面架構、搬移、rollback 相關工具

\- legacy/：舊版流程，保留備查，不作為主線

\- danger/：高風險腳本，未確認前不要執行

\- backup/：歷史備份檔



\## 維護原則



1\. 新增主線腳本前，要確認它是否真的屬於日常更新流程。

2\. debug、probe、check 類腳本優先放入 debug/。

3\. repair、rescue、fix 類腳本優先放入 tools/。

4\. migration、rollback、page、site-root 類腳本優先放入 site-tools/。

5\. 舊流程不要直接刪除，先放 legacy/。

6\. 可能改壞大量正式資料的腳本放 danger/。

7\. 搬移腳本後，必須跑 health check。

