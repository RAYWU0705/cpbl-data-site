Ray's CPBL Data Site - Schedule Postponed Status Fix

修正：
1. schedule API 任意巢狀欄位只要包含「延賽 / 保留 / 取消」即可辨識特殊狀態。
2. #254 已依使用者提供的 CPBL 官方賽程畫面加入短期官方確認 override：2026/08/08 味全龍 vs 樂天桃猿 = 延賽。
3. override 只在官方仍回傳舊的 2026/08/08 或 2026/08/09 且 scheduled 時生效；未來官方改成新補賽日期後會自動停止套用。

覆蓋後執行：
node scripts/sync-cpbl-schedule.js
npm run build:standings
node scripts/release-gate.js --strict

預期 sync 輸出至少包含：
官方已確認特殊狀態 override：1 場
更新 1

之後 #254 應為 postponed / 延賽，不計入 standings。
