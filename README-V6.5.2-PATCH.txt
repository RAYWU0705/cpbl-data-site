Ray CPBL Data Site v6.5.2 Patch

重點：
1. 球員頁重新接上 2026 球季累積數據。
2. season-stats 缺檔時仍會由 live-boxscore.json 即時計算。
3. standings 更新階段會同步重建 season-stats-2026.json。
4. 比賽中心 / 賽程 / 戰績 / 球員頁 / 球隊名單：球員姓名與主要隊名可點擊。

套用後建議：
  npm install
  npm run build:players
  node scripts/release-gate.js --strict

本 Patch 不含 live-boxscore.json，不會覆蓋你目前已補好的賽果。
