import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { spawn } from "child_process";

/* =========================================================
   Ray's CPBL Data Site
   rescue-final-vue-range.js
   v5.4.3-FINAL-VUE-RESCUE-RANGE

   用途：
   - 批次補洞指定日期 / 指定 gameSno 的 FINAL Vue boxscore
   - 呼叫：
     1. scripts/fetch-cpbl-final-boxscore-vue.js --date=YYYY-MM-DD --gameSno=XXX
     2. scripts/merge-first-team-final-vue-boxscore.js --force
   - 不直接解析 CPBL 頁面，把已驗證成功的兩支正式腳本串起來
   - 預設 dry-run，必須加 --write 才正式寫入

   範例：
   node scripts/rescue-final-vue-range.js --from=2026-05-22 --to=2026-05-27 --dry-run
   node scripts/rescue-final-vue-range.js --from=2026-05-22 --to=2026-05-27 --write

   指定日期：
   node scripts/rescue-final-vue-range.js --dates=2026-05-22,2026-05-23 --write

   指定 gameSno：
   node scripts/rescue-final-vue-range.js --date=2026-05-22 --gameSno=113 --write
========================================================= */

const VERSION = "v5.4.3-FINAL-VUE-RESCUE-RANGE";

const ROOT = process.cwd();
const YEAR = Number(getArg("--year", "2026"));

const DATE = getArg("--date", "");
const DATES_ARG = getArg("--dates", "");
const FROM = getArg("--from", "");
const TO = getArg("--to", "");
const GAME_SNO = getArg("--gameSno", "");
const GAMES_ARG = getArg("--games", "");
const LIMIT = Number(getArg("--limit", "0"));

const WRITE = hasArg("--write");
const DRY_RUN = hasArg("--dry-run") || !WRITE;
const MERGE_EACH = hasArg("--merge-each");
const SKIP_MERGE = hasArg("--skip-merge");

const LIVE_BOXSCORE_PATH = path.join(ROOT, "data", "live", "live-boxscore.json");
const REPORT_PATH = path.join(ROOT, "data", "live", `final-vue-rescue-${YEAR}.report.json`);

const FETCH_SCRIPT = "scripts/fetch-cpbl-final-boxscore-vue.js";
const MERGE_SCRIPT = "scripts/merge-first-team-final-vue-boxscore.js";

console.log(`🛟 CPBL FINAL Vue 補洞工具 ${VERSION}`);
console.log(`年份：${YEAR}`);
console.log(`date：${DATE || "未指定"}`);
console.log(`dates：${DATES_ARG || "未指定"}`);
console.log(`from/to：${FROM || "未指定"} → ${TO || "未指定"}`);
console.log(`gameSno：${GAME_SNO || "未指定"}`);
console.log(`games：${GAMES_ARG || "未指定"}`);
console.log(`limit：${LIMIT || "不限"}`);
console.log(`模式：${DRY_RUN ? "dry-run，只測不寫" : "write，會寫入 Vue boxscore 並 force merge"}`);
console.log(`merge-each：${MERGE_EACH ? "開啟" : "關閉"}`);
console.log(`skip-merge：${SKIP_MERGE ? "開啟" : "關閉"}`);
console.log("======================================");

main().catch(err => {
  console.error("❌ FINAL Vue 補洞工具失敗：", err);
  process.exit(1);
});

async function main() {
  await ensureScriptExists(FETCH_SCRIPT);
  await ensureScriptExists(MERGE_SCRIPT);

  const liveGames = await readLiveGames();
  let targets = pickTargets(liveGames);

  targets = targets.sort(sortTargets);

  if (LIMIT > 0) {
    targets = targets.slice(0, LIMIT);
  }

  console.log(`📦 待補洞場次：${targets.length}`);

  if (!targets.length) {
    console.log("⚠️ 沒有符合條件的場次。");
    console.log("請確認 --date / --dates / --from --to / --gameSno 是否正確。");
    return;
  }

  targets.forEach((g, i) => {
    console.log(
      `   ${i + 1}. ${g.date}｜#${g.gameSno}｜${g.away || "?"} vs ${g.home || "?"}｜status=${g.status || "unknown"}`
    );
  });

  const report = {
    version: VERSION,
    year: YEAR,
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    write: WRITE,
    mergeEach: MERGE_EACH,
    skipMerge: SKIP_MERGE,
    args: {
      date: DATE,
      dates: DATES_ARG,
      from: FROM,
      to: TO,
      gameSno: GAME_SNO,
      games: GAMES_ARG,
      limit: LIMIT
    },
    targets,
    steps: [],
    summary: {
      targets: targets.length,
      fetchOk: 0,
      fetchFailed: 0,
      mergeOk: 0,
      mergeFailed: 0
    }
  };

  for (const target of targets) {
    console.log("");
    console.log("======================================");
    console.log(`🛟 補 FINAL Vue：${target.date} / gameSno=${target.gameSno}`);
    console.log("======================================");

    const fetchArgs = [
      FETCH_SCRIPT,
      DRY_RUN ? "--dry-run" : "--write",
      `--date=${target.date}`,
      `--gameSno=${target.gameSno}`
    ];

    const fetchStep = await runNode(fetchArgs);

    report.steps.push({
      type: "fetch",
      target,
      ok: fetchStep.ok,
      code: fetchStep.code,
      durationMs: fetchStep.durationMs
    });

    if (fetchStep.ok) report.summary.fetchOk++;
    else report.summary.fetchFailed++;

    if (MERGE_EACH && !SKIP_MERGE) {
      const mergeStep = await runMerge();

      report.steps.push({
        type: "merge",
        target,
        ok: mergeStep.ok,
        code: mergeStep.code,
        durationMs: mergeStep.durationMs
      });

      if (mergeStep.ok) report.summary.mergeOk++;
      else report.summary.mergeFailed++;
    }
  }

  if (!MERGE_EACH && !SKIP_MERGE) {
    console.log("");
    console.log("======================================");
    console.log("🧩 最後合併 FINAL Vue Boxscore → live-boxscore");
    console.log("======================================");

    const mergeStep = await runMerge();

    report.steps.push({
      type: "merge-final",
      ok: mergeStep.ok,
      code: mergeStep.code,
      durationMs: mergeStep.durationMs
    });

    if (mergeStep.ok) report.summary.mergeOk++;
    else report.summary.mergeFailed++;
  }

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log("======================================");
  console.log(`🎯 補洞完成`);
  console.log(`📦 目標場次：${report.summary.targets}`);
  console.log(`✅ fetch 成功：${report.summary.fetchOk}`);
  console.log(`❌ fetch 失敗：${report.summary.fetchFailed}`);
  console.log(`✅ merge 成功：${report.summary.mergeOk}`);
  console.log(`❌ merge 失敗：${report.summary.mergeFailed}`);
  console.log(`🧾 Report：${path.relative(ROOT, REPORT_PATH)}`);
  console.log("======================================");

  if (report.summary.fetchFailed || report.summary.mergeFailed) {
    process.exitCode = 1;
  }
}

async function runMerge() {
  const mergeArgs = [
    MERGE_SCRIPT,
    DRY_RUN ? "--dry-run" : "--write",
    "--force"
  ];

  return runNode(mergeArgs);
}

function pickTargets(liveGames) {
  const dateSet = buildDateSet();
  const gameSnoSet = buildGameSnoSet();

  return liveGames
    .map(normalizeLiveGame)
    .filter(Boolean)
    .filter(g => {
      if (dateSet.size && !dateSet.has(g.date)) return false;
      if (gameSnoSet.size && !gameSnoSet.has(String(g.gameSno))) return false;
      return true;
    });
}

function buildDateSet() {
  const set = new Set();

  if (DATE) set.add(DATE);

  if (DATES_ARG) {
    DATES_ARG
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(d => set.add(d));
  }

  if (FROM && TO) {
    eachDate(FROM, TO).forEach(d => set.add(d));
  }

  return set;
}

function buildGameSnoSet() {
  const set = new Set();

  if (GAME_SNO) set.add(String(GAME_SNO));

  if (GAMES_ARG) {
    GAMES_ARG
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(g => set.add(String(g)));
  }

  return set;
}

async function readLiveGames() {
  if (!fsSync.existsSync(LIVE_BOXSCORE_PATH)) {
    throw new Error(`找不到 ${path.relative(ROOT, LIVE_BOXSCORE_PATH)}`);
  }

  const text = await fs.readFile(LIVE_BOXSCORE_PATH, "utf8");
  const data = JSON.parse(text);

  return toArray(data);
}

function normalizeLiveGame(game) {
  if (!game || typeof game !== "object") return null;

  const meta = game.meta || {};
  const gameSno = game.gameSno ?? meta.gameSno;

  if (gameSno === undefined || gameSno === null) return null;

  const date = meta.date || game.date || "";

  if (!date) return null;

  return {
    gameSno: Number(gameSno),
    date,
    away: meta.away || game.away || "",
    home: meta.home || game.home || "",
    status: normalizeStatus(meta.status || game.status || ""),
    score: {
      away: game.totals?.away?.R ?? game.awayScore ?? null,
      home: game.totals?.home?.R ?? game.homeScore ?? null
    }
  };
}

function normalizeStatus(status) {
  const s = String(status || "").toLowerCase();

  if (s === "final" || s === "finished" || s === "gameover") return "final";
  if (s === "live" || s === "playing" || s === "in_progress") return "live";
  if (s === "pregame" || s === "scheduled") return s;
  if (/final|結束|完賽/.test(s)) return "final";
  if (/live|比賽中|進行中/.test(s)) return "live";

  return s || "scheduled";
}

function sortTargets(a, b) {
  const d = String(a.date).localeCompare(String(b.date));
  if (d !== 0) return d;
  return Number(a.gameSno || 0) - Number(b.gameSno || 0);
}

function eachDate(from, to) {
  const out = [];
  const start = parseDate(from);
  const end = parseDate(to);

  if (!start || !end || start > end) return out;

  const d = new Date(start);

  while (d <= end) {
    out.push(formatDate(d));
    d.setDate(d.getDate() + 1);
  }

  return out;
}

function parseDate(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!m) return null;

  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDate(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

async function ensureScriptExists(script) {
  const file = path.join(ROOT, script);

  if (!fsSync.existsSync(file)) {
    throw new Error(`找不到必要腳本：${script}`);
  }
}

function runNode(args) {
  return new Promise(resolve => {
    const startedAt = Date.now();

    console.log(`▶️ node ${args.join(" ")}`);

    const child = spawn(
      "node",
      args,
      {
        cwd: ROOT,
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          CPBL_FINAL_RESCUE_RUN_ID: String(Date.now())
        }
      }
    );

    child.stdout.on("data", data => {
      process.stdout.write(data.toString());
    });

    child.stderr.on("data", data => {
      process.stderr.write(data.toString());
    });

    child.on("close", code => {
      const durationMs = Date.now() - startedAt;

      if (code === 0) {
        console.log(`✅ 子任務完成｜${Math.round(durationMs / 1000)} 秒`);
      } else {
        console.log(`❌ 子任務失敗｜exit code ${code}｜${Math.round(durationMs / 1000)} 秒`);
      }

      resolve({
        ok: code === 0,
        code,
        durationMs
      });
    });

    child.on("error", err => {
      const durationMs = Date.now() - startedAt;
      console.error("❌ 子任務無法啟動：", err);

      resolve({
        ok: false,
        code: -1,
        durationMs
      });
    });
  });
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.games)) return data.games;
  if (Array.isArray(data?.data)) return data.data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function getArg(name, fallback = "") {
  const prefix = `${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}
