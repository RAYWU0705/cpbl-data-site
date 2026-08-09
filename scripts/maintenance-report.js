import fs from "fs/promises";
import path from "path";
const ROOT=process.cwd();
const year=new Date().getFullYear();
const live=await read("data/live/live-boxscore.json");
const final=await read(`data/live/final-boxscore-vue-${year}.json`);
const farm=await read(`data/farm/farm-boxscore-${year}.json`);
let missing={summary:{firstTeam:0,farm:0}};try{missing=JSON.parse(await fs.readFile("data/reports/missing-games.json","utf8"))}catch{}
const report={generatedAt:new Date().toISOString(),counts:{schedule:live.length,firstTeamConfirmed:final.filter(g=>g.parseStatus==="confirmed").length,farmConfirmed:farm.filter(g=>g.parseStatus==="confirmed").length,missingFirstTeam:missing.summary?.firstTeam||0,missingFarm:missing.summary?.farm||0}};
await fs.mkdir("data/reports",{recursive:true});await fs.writeFile("data/reports/latest-maintenance.json",JSON.stringify(report,null,2));
const md=`# CPBL 維護報告\n\n- 產生時間：${report.generatedAt}\n- 一軍賽程骨架：${report.counts.schedule}\n- 一軍 confirmed：${report.counts.firstTeamConfirmed}\n- 二軍 confirmed：${report.counts.farmConfirmed}\n- 一軍缺漏：${report.counts.missingFirstTeam}\n- 二軍缺漏：${report.counts.missingFarm}\n`;
await fs.writeFile("data/reports/latest-maintenance.md",md);console.log(md);
async function read(f){try{const x=JSON.parse(await fs.readFile(path.join(ROOT,f),"utf8"));return Array.isArray(x)?x:Array.isArray(x?.games)?x.games:[]}catch{return[]}}
