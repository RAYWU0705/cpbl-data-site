import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const YEAR = Number(arg("year", new Date().getFullYear()));
const livePath = path.join(ROOT, "data/live/live-boxscore.json");
const finalPath = path.join(ROOT, `data/live/final-boxscore-vue-${YEAR}.json`);
const farmSchedulePath = path.join(ROOT, `data/farm/farm-schedule-${YEAR}.json`);
const farmBoxPath = path.join(ROOT, `data/farm/farm-boxscore-${YEAR}.json`);
const outPath = path.join(ROOT, "data/reports/missing-games.json");

const live = await readArray(livePath);
const finals = await readArray(finalPath);
const farmSchedule = await readArray(farmSchedulePath);
const farmBox = await readArray(farmBoxPath);
const finalMap = new Map(finals.map(g => [String(g.gameSno || ""), g]));
const farmMap = new Map(farmBox.map(g => [String(g.gameSno || ""), g]));
const today = taipeiDate();

const firstTeam = live.filter(g => {
  const m = g.meta || g;
  return String(m.date || g.date || "") < today && !isProtected(m.status || g.status);
}).map(g => {
  const m = g.meta || g;
  const v = finalMap.get(String(g.gameSno || m.gameSno || ""));
  const missing = [];
  if (!v) missing.push("boxscore");
  else {
    if (v.parseStatus !== "confirmed") missing.push("confirmed");
    if (!((Array.isArray(v.lineScore) && v.lineScore.length > 0) || (v.lineScore?.innings?.length > 0))) missing.push("lineScore");
    if (!(v.batters?.away?.length > 0 && v.batters?.home?.length > 0)) missing.push("batters");
    if (!(v.pitchers?.away?.length > 0 && v.pitchers?.home?.length > 0)) missing.push("pitchers");
  }
  return {gameSno:String(g.gameSno || m.gameSno || ""), date:m.date || g.date, away:m.away || g.away, home:m.home || g.home, missing};
}).filter(x => x.missing.length);

const farm = farmSchedule.filter(g => g.status === "final").map(g => {
  const b = farmMap.get(String(g.gameSno || ""));
  const missing = [];
  if (!b) missing.push("boxscore");
  else {
    if (b.parseStatus !== "confirmed") missing.push("confirmed");
    if (!(b.batters?.away?.length > 0 && b.batters?.home?.length > 0)) missing.push("batters");
    if (!(b.pitchers?.away?.length > 0 && b.pitchers?.home?.length > 0)) missing.push("pitchers");
  }
  return {gameSno:String(g.gameSno || ""), date:g.date, away:g.away, home:g.home, missing};
}).filter(x => x.missing.length);

const report = {generatedAt:new Date().toISOString(), year:YEAR, summary:{firstTeam:firstTeam.length, farm:farm.length}, firstTeam, farm};
await fs.mkdir(path.dirname(outPath), {recursive:true});
await fs.writeFile(outPath, JSON.stringify(report,null,2), "utf8");
console.log(`🔎 一軍缺漏：${firstTeam.length}｜二軍缺漏：${farm.length}`);
console.log(`🧾 ${path.relative(ROOT,outPath)}`);
if (process.argv.includes("--json")) console.log(JSON.stringify(report));

function arg(name, fallback="") { const x=process.argv.find(v=>v.startsWith(`--${name}=`)); return x?x.split("=").slice(1).join("="):fallback; }
async function readArray(file){ try{const x=JSON.parse(await fs.readFile(file,"utf8")); return Array.isArray(x)?x:Array.isArray(x?.games)?x.games:[]}catch{return []} }
function isProtected(s){return ["postponed","cancelled","canceled","suspended"].includes(String(s||"").toLowerCase())}
function taipeiDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
