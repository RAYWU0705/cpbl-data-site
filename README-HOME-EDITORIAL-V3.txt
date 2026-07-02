CPBL Home Editorial Frontpage v3

這版目的：
- 減少首頁卡片牆感
- 改成「轉播首頁 + 今日比分牆 + 新聞版面 + 側欄資訊」
- 保留既有資料讀取流程，不改 JSON 格式
- 保留 index.js 讀取 live-boxscore.json / probable-pitchers.json / league-news.json

覆蓋位置：
- index.html -> 專案根目錄 index.html
- css/*.css -> 專案 css 資料夾
- js/pages/index.js -> 專案 js/pages/index.js

測試：
1. VS Code 開啟 E:\cpbl-website
2. 使用 Live Server
3. 開 http://127.0.0.1:5500/index.html
4. Ctrl + F5 強制刷新

注意：
- 這版不是 dashboard 卡片牆
- 首頁內容改為上方主視覺、中段今日比分牆、下方新聞/側欄混合排版
- 若要更像新聞網站，可以下一版把「今日看球指南」改成更大的頭條版型
