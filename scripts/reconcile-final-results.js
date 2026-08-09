import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { selectReconciliationTargets } from "./lib/final-reconciliation-selector.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const LIVE = path.join(ROOT, "data/live/live-boxscore.json");
const REPORT = path.join(ROOT, "data/live/final-reconciliation-status.json");
const LOOKBACK = Math.max(1, Number(getArg("--days", "7")));
const TODAY = getArg("--today", getTodayTaipei());
const DRY_RUN = process.argv.includes("--dry-run");

main().catch(async error => {
  console.error("❌ FINAL reconciliation failed:", error.message);
  try { await writeReport("error", [], [], error.message); } catch {}
  process.exit(1);
});

async function main() {
  const source = JSON.parse(await fs.readFile(LIVE, "utf8"));
  const beforeTargets = selectReconciliationTargets(source, { today: TODAY, lookbackDays: LOOKBACK });
  const dates = [...new Set(beforeTargets.map(g => g.date))];

  console.log("======================================");
  console.log("🧹 CPBL FINAL Reconciliation v6.2.0");
  console.log(`台北基準日：${TODAY}`);
  console.log(`回查範圍：最近 ${LOOKBACK} 天（不含今天）`);
  console.log(`待修復場次：${beforeTargets.length}`);
  console.log(`待修復日期：${dates.join(", ") || "無"}`);

  if (!beforeTargets.length) {
    await writeReport("ok", [], [], "no unresolved past games");
    console.log("✅ 沒有漏抓賽果，不需啟動瀏覽器。 ");
    return;
  }

  if (DRY_RUN) {
    await writeReport("dry-run", beforeTargets, beforeTargets, "dry-run only");
    return;
  }

  const runs = [];
  for (const date of dates) {
    console.log(`\n📅 回查 ${date}`);
    await runNode("scripts/fetch-cpbl-final-boxscore-vue.js", [
      "--write", `--date=${date}`, "--force", "--refresh-confirmed"
    ]);
    await runNode("scripts/merge-first-team-final-vue-boxscore.js", [
      "--write", `--date=${date}`, "--force"
    ]);
    runs.push(date);
  }

  const after = JSON.parse(await fs.readFile(LIVE, "utf8"));
  const remaining = selectReconciliationTargets(after, { today: TODAY, lookbackDays: LOOKBACK });
  const repairedKeys = new Set(beforeTargets.map(keyOf));
  remaining.forEach(g => repairedKeys.delete(keyOf(g)));
  const repaired = beforeTargets.filter(g => repairedKeys.has(keyOf(g)));

  const status = remaining.length ? "degraded" : "ok";
  await writeReport(status, beforeTargets, remaining,
    remaining.length ? `${remaining.length} unresolved games remain` : `${repaired.length} games reconciled`);

  console.log("\n======================================");
  console.log(`✅ 已修復：${repaired.length}`);
  console.log(`⚠️ 仍待修復：${remaining.length}`);

  if (remaining.length) process.exitCode = 2;
}

async function runNode(script, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, CI: process.env.CI || "true" }
    });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
  });
}

async function writeReport(status, before, remaining, message) {
  const previous = await readPreviousReport();
  const now = new Date().toISOString();
  const successful = status === "ok";
  const report = {
    updatedAt: now,
    source: "cpbl-official-boxscore-vue",
    dataStatus: {
      status,
      isCached: false,
      lookbackDays: LOOKBACK,
      todayTaipei: TODAY,
      targetCount: before.length,
      remainingCount: remaining.length,
      lastSuccessfulAt: successful ? now : (previous?.dataStatus?.lastSuccessfulAt || null),
      message
    },
    targets: before,
    remaining
  };
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  await fs.writeFile(REPORT, JSON.stringify(report, null, 2) + "\n", "utf8");
}

async function readPreviousReport() {
  try { return JSON.parse(await fs.readFile(REPORT, "utf8")); } catch { return null; }
}

function keyOf(g) { return `${g.date}#${g.gameSno}`; }
function getArg(name, fallback="") {
  const prefix = `${name}=`;
  return process.argv.find(x => x.startsWith(prefix))?.slice(prefix.length) || fallback;
}
function getTodayTaipei() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const o = Object.fromEntries(parts.filter(p => ["year","month","day"].includes(p.type)).map(p => [p.type,p.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
