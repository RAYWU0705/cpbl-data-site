# CPBL Wide Layout v7 Desktop Shell

覆蓋位置：

- base.css -> E:\cpbl-website\css\base.css
- nav.css -> E:\cpbl-website\css\nav.css
- hero.css -> E:\cpbl-website\css\hero.css
- components.css -> E:\cpbl-website\css\components.css
- home.css -> E:\cpbl-website\css\home.css
- schedule.css -> E:\cpbl-website\css\schedule.css
- match.css -> E:\cpbl-website\css\match.css
- about.css -> E:\cpbl-website\css\about.css
- data-quality.css -> E:\cpbl-website\css\data-quality.css
- farm-schedule.css -> E:\cpbl-website\css\farm-schedule.css
- game-day.css -> E:\cpbl-website\css\game-day.css
- rules.css -> E:\cpbl-website\css\rules.css
- player.css -> E:\cpbl-website\css\player.css
- report.css -> E:\cpbl-website\css\report.css
- search.css -> E:\cpbl-website\css\search.css

重點：

1. 桌機版容器改為 96vw / 1760px，1500px 以上可到 97vw / 1840px。
2. nav / hero / container 同步放寬。
3. 首頁改成更寬的 12 欄 Dashboard，不再集中在中間。
4. 賽程頁桌機版可顯示更多卡片欄位。
5. match / 二軍 / 規則 / 資料品質 / 搜尋等頁只做低侵入寬版補強。
6. 900px 以下大致保留原本手機版邏輯。

建議測試：

http://127.0.0.1:5500/index.html
http://127.0.0.1:5500/schedule.html
http://127.0.0.1:5500/match.html?gameSno=165
http://127.0.0.1:5500/standings.html
http://127.0.0.1:5500/teams.html
http://127.0.0.1:5500/version.html
