\# data/rosters 說明



此資料夾存放一軍球隊名單資料。



\## 正式資料



\- brothers.json：中信兄弟名單

\- lions.json：統一7-ELEVEn獅名單

\- monkeys.json：樂天桃猿名單

\- dragons.json：味全龍名單

\- guardians.json：富邦悍將名單

\- hawks.json：台鋼雄鷹名單

\- team-rosters.json：整合版球隊名單



\## 維護原則



1\. 不直接刪除球隊個別 JSON。

2\. 若未來 crawler 改版，先輸出 debug 檔確認格式。

3\. team-rosters.json 若為整合入口，前端頁面應優先確認是否讀取此檔。

4\. 若新增二軍名單，不混入此資料夾，應另設 data/farm/rosters 或 data/farm-rosters。

