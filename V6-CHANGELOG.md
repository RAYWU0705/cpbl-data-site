# v6.1.2 Theme & Readability Fix

- 修正棒球規則頁淺色模式白底白字。
- 修正版本頁「目前版本」卡片被全站卡片樣式覆蓋。
- 新增 head 階段主題初始化，重新整理與跨頁會保留深淺色選擇。
- 主題切換按鈕同步更新圖示、標題與 aria 狀態。
- 保留系統主題作為使用者尚未選擇時的預設值。

# v6.0.0 大整修摘要

- 將 Puppeteer 移至正式 dependencies，新增執行環境檢查與自動修復流程。
- 修正 `postgame` 管線同名鍵覆蓋，恢復 `final → news`。
- 新增二軍 FARM 至完整與 maintenance 管線。
- 新增 `maintain.ps1` 一鍵完整維護入口。
- 新增備份與 log 30 天保留清理工具。
- 修正 #198 過期錯誤 LIVE 狀態，通過特殊賽程保護。
- Match Center 新增免費 Baseball Intelligence：智慧戰報、轉折點、MVP 候選與資料可信度。
- 新增智慧引擎測試，全部測試 8/8 通過。
- Strict Release Gate 15/15 通過。
