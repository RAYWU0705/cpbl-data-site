import fs from "fs/promises";

const checks = [];
async function check(name, fn) {
  try { await fn(); checks.push({name, ok:true}); console.log(`✅ ${name}`); }
  catch (error) { checks.push({name, ok:false, error:error.message}); console.error(`❌ ${name}：${error.message}`); }
}

await check("Node.js 版本 >= 20", async () => {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) throw new Error(`目前為 ${process.version}`);
});
await check("package.json", async () => JSON.parse(await fs.readFile("package.json", "utf8")));
await check("Puppeteer 套件", async () => import("puppeteer"));
await check("正式 LIVE JSON", async () => {
  const games = JSON.parse(await fs.readFile("data/live/live-boxscore.json", "utf8"));
  if (!Array.isArray(games)) throw new Error("live-boxscore.json 必須是陣列");
});

if (checks.some(item => !item.ok)) {
  console.error("\n修復建議：刪除 node_modules 後執行 npm ci。若 Chromium 下載被中斷，執行 npx puppeteer browsers install chrome。");
  process.exitCode = 1;
} else {
  console.log("\n🚀 執行環境正常，可以開始更新。\n");
}
