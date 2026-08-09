import fs from "fs/promises";import path from "path";
const ROOT=process.cwd();const rows=[];
const rules=[
  ["data/live/backups","保留最近 10 份，其餘封存/刪除","中","大量逐次備份，正式資料不在此"],
  ["data/live/backup","與 backups 整併；保留 latest-checkpoints 與人工救援點","中","兩套備份結構重疊"],
  ["data/farm/backup","每類保留最近 5 份","低","二軍正式 JSON 可重抓"],
  ["debug/pregame","完成問題排查後可清空","低","單次 HTML/TXT/JSON 除錯輸出"],
  ["debug/live-inplay","完成問題排查後可清空","低","單次即時爬蟲除錯輸出"],
  ["data/farm/farm-boxscore-2026.debug.json","可刪，除錯時再產生","低","非前端正式資料"],
  ["data/farm/farm-boxscore-2026.snapshot.json","保留最新一份或刪除","低","可由正式資料重建"],
  ["scripts/legacy","先封存，不直接刪","中","可能用於人工救援"],
  ["scripts/danger","保留但禁止主流程引用","高","高風險舊爬蟲"],
  ["archive","確認無舊頁面需求後可刪","中","歷史頁面封存"]
];
for(const [rel,suggestion,risk,reason] of rules){const abs=path.join(ROOT,rel);const size=await dirSize(abs);rows.push({path:rel,sizeBytes:size,sizeMB:(size/1048576).toFixed(2),suggestion,risk,reason})}
await fs.mkdir("data/reports",{recursive:true});await fs.writeFile("data/reports/deletion-review.json",JSON.stringify(rows,null,2));
let md="# 待刪除／封存審核清單\n\n> 本報告只提出建議，未刪除任何檔案。\n\n| 路徑 | 大小 MB | 風險 | 建議 | 理由 |\n|---|---:|---|---|---|\n";for(const r of rows)md+=`| \`${r.path}\` | ${r.sizeMB} | ${r.risk} | ${r.suggestion} | ${r.reason} |\n`;await fs.writeFile("data/reports/deletion-review.md",md);console.log(md);
async function dirSize(p){try{const st=await fs.stat(p);if(st.isFile())return st.size;let n=0;for(const x of await fs.readdir(p))n+=await dirSize(path.join(p,x));return n}catch{return 0}}
