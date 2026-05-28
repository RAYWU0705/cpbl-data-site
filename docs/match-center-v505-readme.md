# Match Center v5.0-5 UI STABLE

覆蓋位置：

- `match.html` → 專案根目錄 `match.html`
- `js/pages/match.js` → `E:\cpbl-website\js\pages\match.js`
- `css/match.css` → `E:\cpbl-website\css\match.css`

這版重點：

1. 保留原本 Match Center 功能，不砍功能。
2. 修正前端 `dataQuality` normalize 太少欄位，導致 FINAL v5 的 `score / rhe / lineScore / batters / pitchers / result` 沒被完整顯示。
3. Data Quality 卡新增：stats fallback、manual override、duplicate guard、finalLock 顯示。
4. FINAL / 延賽 / 取消場次不再每 30 秒自動刷新，避免已鎖定資料畫面一直重讀。
5. CSS 補強 Data Quality 卡、手機版表格、長文字不爆版。

建議測試：

```powershell
# 用瀏覽器打開
match.html?gameSno=102
match.html?gameSno=103
match.html?gameSno=104
match.html?gameSno=105
match.html?gameSno=106
match.html?gameSno=107
```

確認：

- Data Quality 卡不是 unknown，而是能顯示 confirmed / fallback / finalLock。
- 打者、投手主客隊切換正常。
- 手機版不爆版。
