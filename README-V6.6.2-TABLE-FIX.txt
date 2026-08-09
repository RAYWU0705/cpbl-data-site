Ray CPBL Data Site v6.6.2 — Global Table System Fix

修正：
1. 移除全站所有 th 強制 sticky + 導覽列高度 offset，避免表首壓住第一列資料。
2. 未包在捲動容器的 table 由 v6-shell.js 自動包入 ui-table-scroll。
3. 寬表格允許水平捲動，不再撐爆整頁。
4. 手機取消所有儲存格強制 nowrap；文字欄可換行、數字欄維持單行。
5. sticky 第一欄仍保留支援；sticky 表首改成 opt-in。
6. 寬表格顯示「左右滑動查看更多」提示。

覆蓋檔案：
css/v6-ui.css
js/v6-shell.js

不包含任何 data JSON，不會覆蓋比分、戰績、球員資料。
