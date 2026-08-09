Ray CPBL Data Site v6.5.3 Player Page Runtime Fix

修正：
- player.js makeTeamLink() 誤呼叫不存在的 cleanText()
- 改用既有 cleanName()
- player.html cache key 更新為 653-runtime-fix

覆蓋檔案：
- player.html
- js/pages/player.js

不包含任何 data JSON，不會覆蓋比賽、戰績或球員累積數據。
