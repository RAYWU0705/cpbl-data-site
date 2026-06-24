\# data 資料夾說明



Ray CPBL Data Site 的資料主目錄。



\## 根目錄正式資料



\- teams.json：球隊基本資料

\- standings-2026.json：全年戰績

\- standings-2026-first.json：上半季戰績

\- standings-2026-second.json：下半季戰績



\## 子資料夾



\- live/：一軍賽前、即時、賽後與聯盟快訊資料

\- farm/：二軍賽程與二軍 boxscore 資料

\- rosters/：一軍球隊名單資料

\- manual/：手動補洞與人工修正資料

\- games/：單場比賽資料或早期測試資料



\## 維護原則



1\. 前端正式讀取的 JSON 優先留在原路徑，不輕易搬移。

2\. debug、snapshot、incident、archive 類資料應移入子資料夾。

3\. backup 類資料不急著整理，避免破壞復原線索。

4\. 搬移資料前，先確認是否有前端或 scripts 直接讀取該路徑。

