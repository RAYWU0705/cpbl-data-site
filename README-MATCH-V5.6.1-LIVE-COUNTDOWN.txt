Match Center v5.6.1 LIVE COUNTDOWN

修改內容：
- 修正 Hero 開賽倒數只 render 一次、無法逐秒跳動的問題。
- 新增 HERO_COUNTDOWN_TIMER，每秒更新 #gameCountdownClock。
- 比賽到點後停在 00:00:00，等待 live refresh 切換 LIVE。
- final/live/postponed/suspended/cancelled 不啟動倒數計時器。

覆蓋：
match.html -> 專案根目錄 match.html
css/match.css -> css/match.css
js/pages/match.js -> js/pages/match.js
