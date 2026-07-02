# CPBL Home Live Center vNext

這包是首頁前端大改版覆蓋包。

## 覆蓋位置

- `index.html` → 專案根目錄 `index.html`
- `css/*.css` → 專案 `css/` 資料夾
- `js/pages/index.js` → 專案 `js/pages/index.js`

## 測試方式

使用 VS Code Live Server：

```txt
http://127.0.0.1:5500/index.html
```

建議測試：

1. Ctrl + F5 強制重新整理
2. Console 沒紅字
3. Network 裡 `data/live/live-boxscore.json`、`probable-pitchers.json`、`league-news.json` 正常讀取
4. 首頁 Hero、資料中心入口、今日賽事面板、手機版不爆版

## 主要變更

- 新增首頁 `CPBL LIVE CENTER` 大型 Hero
- 新增 Hero 即時狀態儀表板
- 新增資料中心入口 Hub
- 強化今日賽事主面板視覺
- `index.js` 新增 `renderHeroDashboard()`，不改 JSON 資料格式
