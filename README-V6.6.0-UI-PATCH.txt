Ray's CPBL Data Site v6.6.0 — CPBL Six-Team Neutral UI

這是 UI Patch，不包含 live-boxscore / standings / roster 等大型資料檔。

設計原則：
1. 全站基礎色由藍色改為暖白 / 炭黑 / 中性灰。
2. 首頁、賽程、戰績、賽季等聯盟頁，以六隊色平均做低透明度背景氛圍。
3. 首頁與賽程的比賽卡，依實際主客隊各自生成淡色雙邊漸層。
4. 戰績表每隊使用自己的隊色 accent，但表格仍維持中性底。
5. 球員頁依所屬球隊自動設定整頁淡色氣氛與卡片 accent。
6. 球隊頁依該隊主題色帶入背景，但避免整頁高飽和染色。
7. 比賽中心依主客隊兩色共同呈現，不偏任一隊。
8. Navbar 改成中性炭黑，底部六隊色條作為 CPBL 聯盟識別。
9. 卡片架構保留；資料、crawler、standings、球員統計引擎不改。

覆蓋後：
- Ctrl + F5 強制重新整理。
- 可依序檢查 index.html、schedule.html、standings.html、player.html、match.html、team.html。
