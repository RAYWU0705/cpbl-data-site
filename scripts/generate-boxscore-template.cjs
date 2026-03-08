// scripts/generate-boxscore-template.js
// 使用方式： node scripts/generate-boxscore-template.js 2026-03

const fs = require("fs");
const path = require("path");

const month = process.argv[2];
if (!month) {
  console.log("請輸入月份，例如：2026-03");
  process.exit(1);
}

const schedulePath = path.join(__dirname, `../data/schedule-${month}.json`);
const outputPath = path.join(__dirname, `../data/boxscore-${month}.json`);

if (!fs.existsSync(schedulePath)) {
  console.log("找不到賽程檔：", schedulePath);
  process.exit(1);
}

const games = JSON.parse(fs.readFileSync(schedulePath, "utf8"));

let boxData = {};
if (fs.existsSync(outputPath)) {
  boxData = JSON.parse(fs.readFileSync(outputPath, "utf8"));
}

let added = 0;
let skipped = 0;

games.forEach(g => {

  const home = g.teams?.home || g.home;
  const away = g.teams?.away || g.away;

  if (!g.date || !home || !away) {
    skipped++;
    return;
  }

  const gameId = `${g.date.replaceAll("-", "")}_${home}_${away}`;

  if (boxData[gameId]) return;

  boxData[gameId] = {
    lineScore: {
      home: Array(9).fill(null),
      away: Array(9).fill(null)
    },
    totals: {
      home: { R: null, H: null, E: null },
      away: { R: null, H: null, E: null }
    }
  };

  added++;
});

fs.writeFileSync(outputPath, JSON.stringify(boxData, null, 2));

console.log("✅ 完成：", outputPath);
console.log("新增模板：", added, "場");
console.log("跳過：", skipped, "場");
console.log("目前總筆數：", Object.keys(boxData).length, "場");
