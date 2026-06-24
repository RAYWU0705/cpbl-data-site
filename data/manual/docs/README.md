\# data/manual 說明



此資料夾存放手動補洞與人工修正資料。



\## 正式資料



\- manual-boxscore-overrides.json：正式手動覆蓋資料

\- manual-boxscore-overrides.example.json：範例格式



\## 維護原則



1\. manual-boxscore-overrides.json 是正式人工補洞入口，不可隨意刪除。

2\. 修改前建議先備份。

3\. 修改後應重新執行合併或健康檢查。

4\. 若只是在測試格式，請先改 example，不要直接動正式 overrides。

