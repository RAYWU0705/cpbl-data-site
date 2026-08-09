import { spawn } from "child_process";
import fs from "fs/promises";

const dry = process.argv.includes("--dry-run");
await run("scripts/scan-missing-games.js", []);
const report = JSON.parse(await fs.readFile("data/reports/missing-games.json","utf8"));
const dates = [...new Set(report.firstTeam.map(x=>x.date).filter(Boolean))].sort();
console.log(`🩹 待補一軍日期：${dates.length ? dates.join(", ") : "無"}`);
for (const date of dates) {
  if (dry) continue;
  await run("scripts/fetch-cpbl-final-boxscore-vue.js", ["--write",`--date=${date}`,"--force"]);
  await run("scripts/merge-first-team-final-vue-boxscore.js", ["--write",`--date=${date}`,"--force"]);
}
if (report.farm.length && !dry) {
  await run("scripts/fetch-cpbl-farm-final-boxscore.js", ["--write"]);
}
await run("scripts/scan-missing-games.js", []);
console.log("✅ 缺漏修補流程完成");
function run(file,args){return new Promise((resolve,reject)=>{const c=spawn(process.execPath,[file,...args],{stdio:"inherit"});c.on("exit",code=>code===0?resolve():reject(new Error(`${file} exit ${code}`)));c.on("error",reject)})}
