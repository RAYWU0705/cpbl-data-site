// =========================
// CPBL Data Update All v5.2.5-BUILD-ARGS-HOTFIX
// 一鍵更新：players / transactions / pregame / live-inplay / final-vue+merge / league-news
// 穩定性重點：不中斷、備份、summary、dry-run、soft-exit
// =========================

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, "..");

const LOG_DIR = path.join(ROOT_DIR, "logs");
const BACKUP_DIR = path.join(ROOT_DIR, "data/live/backups");

const RUN_ID = getTimestampForFile();
const LOG_FILE = path.join(LOG_DIR, `update-all-${RUN_ID}.log`);
const SUMMARY_FILE = path.join(LOG_DIR, `update-all-${RUN_ID}.summary.json`);

const startedAt = Date.now();

const IMPORTANT_DATA_FILES = [
  "data/live/live-boxscore.json",
  "data/live/pregame-today.json",
  "data/live/probable-pitchers.json",
  "data/live/league-news.json",
  "data/players/players.json",
  "data/players/player-list.json",
  "data/players/roster.json",
  "data/player-list.json",
  "data/transactions/transactions.json",
  "data/player-transactions.json",
  "data/live/player-transactions.json"
];

const STAGES = [
  {
    key: "players",
    aliases: ["player", "roster", "player-list", "players-list"],
    name: "球員名單 PLAYERS：球員基本資料 / 背號 / 守位",
    candidateScripts: [
      "scripts/fetch-cpbl-rosters.js",
      "scripts/fetch-cpbl-player-detail.js",
      "scripts/fetch-cpbl-players.js",
      "scripts/fetch-cpbl-player-list.js",
      "scripts/fetch-cpbl-roster.js",
      "scripts/build-player-list.js",
      "scripts/update-player-list.js"
    ],
    required: false,
    risk: "safe"
  },
  {
    key: "transactions",
    aliases: ["transaction", "moves", "player-moves", "異動", "球員異動"],
    name: "球員異動 TRANSACTIONS：登錄 / 註銷 / 升降一二軍",
    candidateScripts: [
      "scripts/fetch-cpbl-player-transactions.js",
      "scripts/fetch-cpbl-transactions.js",
      "scripts/build-player-transactions.js",
      "scripts/update-player-transactions.js"
    ],
    required: false,
    risk: "safe"
  },
  {
    key: "pregame",
    aliases: ["pre", "preview", "scheduled"],
    name: "賽前 PREGAME：賽程 / 預告先發 / 先發打序",
    script: "scripts/fetch-cpbl-pregame-today.js",
    required: false,
    risk: "safe"
  },
  {
    key: "live",
    aliases: ["inplay", "live-inplay", "game"],
    name: "比賽中 LIVE：即時比分 / boxscore / 安全攻守狀態",
    script: "scripts/fetch-cpbl-live-inplay-today.js",
    required: false,
    risk: "medium"
  },
  {
    key: "final",
    aliases: ["postgame", "result", "final-vue"],
    name: "賽後 FINAL：Vue boxscore 補強 / 合併 live-boxscore",
    scripts: [
      "scripts/fetch-cpbl-final-boxscore-vue.js",
      "scripts/merge-first-team-final-vue-boxscore.js"
    ],
    required: false,
    risk: "important"
  },
  {
    key: "news",
    aliases: ["league-news", "headline", "headlines"],
    name: "聯盟快訊 NEWS：首頁快訊中心資料化",
    script: "scripts/build-league-news.js",
    required: false,
    risk: "safe"
  }
];

const PIPELINES = {
  all: ["players", "transactions", "pregame", "live", "final", "news"],
  core: ["players", "transactions", "pregame", "live", "final", "news"],
  data: ["players", "transactions", "pregame", "live", "final", "news"],

  game: ["pregame", "live", "final", "news"],
  safe: ["players", "transactions", "pregame", "final", "news"],
  report: ["players", "transactions", "pregame", "final", "news"],
  demo: ["pregame", "final", "news"],

  players: ["players"],
  player: ["players"],
  roster: ["players"],
  "player-list": ["players"],

  transactions: ["transactions"],
  transaction: ["transactions"],
  moves: ["transactions"],
  "player-moves": ["transactions"],

  pregame: ["pregame"],
  pre: ["pregame"],

  live: ["live"],
  inplay: ["live"],
  "live-inplay": ["live"],

  final: ["final"],
  postgame: ["final"],
  result: ["final"],
  "final-vue": ["final"],

  news: ["news"],
  "league-news": ["news"]
};

/* =========================
   CLI
========================= */

function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(item => item.startsWith(prefix));

  if (!arg) return "";

  return arg.slice(prefix.length).trim();
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getOnlyStage() {
  return getArgValue("only") || getArgValue("stage") || "";
}

function getTargetDate() {
  return getArgValue("date");
}

function isDryRun() {
  return hasFlag("dry-run") || hasFlag("dry");
}

function isSoftExit() {
  return hasFlag("soft-exit") || hasFlag("no-fail-exit");
}

function shouldStopOnFail() {
  if (hasFlag("stop-on-fail")) return true;
  if (hasFlag("strict")) return true;

  // v5 穩定版：預設不中斷，讓其他階段有機會成功
  return false;
}

function shouldSkipBackup() {
  return hasFlag("no-backup");
}

function shouldRunHealthOnly() {
  return hasFlag("health") || hasFlag("check");
}

function normalizeStageKey(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (!raw) return "core";
  if (PIPELINES[raw]) return raw;

  const found = STAGES.find(stage => {
    if (stage.key === raw) return true;
    return stage.aliases.includes(raw);
  });

  if (found) return found.key;

  return raw;
}

function resolveTasks() {
  const onlyRaw = getOnlyStage();
  const only = normalizeStageKey(onlyRaw || "core");

  // 支援 --only=pregame,final,news
  if (onlyRaw.includes(",")) {
    const keys = onlyRaw
      .split(",")
      .map(item => normalizeStageKey(item))
      .filter(Boolean);

    return keys.map(key => {
      const task = STAGES.find(stage => stage.key === key);

      if (!task) {
        throw new Error(`找不到階段：${key}`);
      }

      return task;
    });
  }

  const pipelineKeys = PIPELINES[only];

  if (!pipelineKeys) {
    const valid = [
      ...Object.keys(PIPELINES),
      ...STAGES.flatMap(stage => stage.aliases)
    ];

    throw new Error(
      `未知 --only=${onlyRaw}。可用值：${[...new Set(valid)].join(", ")}`
    );
  }

  return pipelineKeys.map(key => {
    const task = STAGES.find(stage => stage.key === key);

    if (!task) {
      throw new Error(`找不到階段：${key}`);
    }

    return task;
  });
}

function buildArgsForTask(task) {
  const args = [];
  const date = getTargetDate();

  if (date) {
    args.push(`--date=${date}`);
  }

  if (hasFlag("tomorrow") && task.key === "pregame" && !date) {
    args.push("--tomorrow");
  }

  return args;
}

function buildArgsForScript(task, script) {
  const args = buildArgsForTask(task);

  if (task.key === "final") {
    if (
      script.includes("fetch-cpbl-final-boxscore-vue.js") ||
      script.includes("merge-first-team-final-vue-boxscore.js")
    ) {
      if (!args.includes("--write")) args.unshift("--write");
    }
  }

  return args;
}

function getTaskScripts(task) {
  if (Array.isArray(task.scripts) && task.scripts.length) return task.scripts;
  if (task.script) return [task.script];
  if (Array.isArray(task.candidateScripts) && task.candidateScripts.length) return task.candidateScripts;
  return [];
}

function getTaskScriptLabel(task) {
  return getTaskScripts(task).join(" + ");
}

async function resolveTaskScripts(task) {
  if (Array.isArray(task.scripts) && task.scripts.length) return task.scripts;
  if (task.script) return [task.script];

  if (Array.isArray(task.candidateScripts) && task.candidateScripts.length) {
    const existing = [];

    for (const script of task.candidateScripts) {
      if (await fileExists(path.join(ROOT_DIR, script))) {
        existing.push(script);
      }
    }

    return existing;
  }

  return [];
}

function isCandidateOnlyTask(task) {
  return !task.script && !Array.isArray(task.scripts) && Array.isArray(task.candidateScripts);
}



/* =========================
   主程式
========================= */

async function main() {
  await fs.mkdir(LOG_DIR, { recursive: true });

  const tasks = resolveTasks();
  const date = getTargetDate();
  const only = getOnlyStage() || "core";

  logHeader(tasks, date, only);

  const health = await runHealthCheck(tasks);

  if (shouldRunHealthOnly()) {
    await writeSummary({
      mode: "health-only",
      health,
      tasks,
      results: [],
      backups: [],
      startedAt,
      endedAt: Date.now()
    });

    logLine("");
    logLine("✅ 健康檢查完成，未執行任何更新。");
    process.exit(health.ok ? 0 : 1);
  }

  if (!health.ok) {
    logLine("");
    logLine("⚠️ 健康檢查發現問題：");

    for (const item of health.items) {
      if (!item.ok) {
        logLine(`   ❌ ${item.label}：${item.message}`);
      }
    }

    if (hasFlag("strict")) {
      logLine("🛑 strict 模式：健康檢查未通過，停止。");

      await writeSummary({
        mode: "strict-health-failed",
        health,
        tasks,
        results: [],
        backups: [],
        startedAt,
        endedAt: Date.now()
      });

      process.exit(1);
    }

    logLine("🟡 非 strict 模式：繼續執行可執行的階段。");
  }

  const backups = shouldSkipBackup()
    ? []
    : await backupImportantDataFiles();

  if (isDryRun()) {
    logLine("");
    logLine("🧪 dry-run 模式：只檢查與列出任務，不實際執行。");

    await writeSummary({
      mode: "dry-run",
      health,
      tasks,
      results: [],
      backups,
      startedAt,
      endedAt: Date.now()
    });

    logSummary(tasks, []);
    process.exit(0);
  }

  const results = [];

  for (const task of tasks) {
    const result = await runTask(task);
    results.push(result);

    if (!result.ok && (task.required || shouldStopOnFail())) {
      logLine("");
      logLine(`🛑 任務失敗，停止後續更新：${task.name}`);
      break;
    }
  }

  logSummary(tasks, results);

  await writeSummary({
    mode: "run",
    health,
    tasks,
    results,
    backups,
    startedAt,
    endedAt: Date.now()
  });

  const failed = results.some(result => !result.ok);
  const notRunCount = tasks.length - results.length;

  if ((failed || notRunCount > 0) && !isSoftExit()) {
    process.exit(1);
  }

  process.exit(0);
}

/* =========================
   Health Check
========================= */

async function runHealthCheck(tasks) {
  const items = [];

  items.push(await checkDirectory(ROOT_DIR, "專案根目錄"));
  items.push(await checkDirectory(LOG_DIR, "Log 目錄", true));

  for (const task of tasks) {
    if (isCandidateOnlyTask(task)) {
      const found = await resolveTaskScripts(task);

      items.push({
        label: `${task.key} candidate scripts`,
        ok: found.length > 0,
        message: found.length
          ? `找到：${found.join(", ")}`
          : `找不到任何候選：${getTaskScripts(task).join(", ")}`
      });

      continue;
    }

    for (const script of getTaskScripts(task)) {
      const scriptPath = path.join(ROOT_DIR, script);

      items.push({
        label: script,
        ok: await fileExists(scriptPath),
        message: await fileExists(scriptPath)
          ? "存在"
          : "找不到"
      });
    }
  }

  for (const file of IMPORTANT_DATA_FILES) {
    const filepath = path.join(ROOT_DIR, file);

    items.push({
      label: file,
      ok: true,
      message: await fileExists(filepath)
        ? "存在"
        : "目前不存在，若腳本成功可能會建立"
    });
  }

  const ok = items
    .filter(item => {
      return !IMPORTANT_DATA_FILES.includes(item.label);
    })
    .every(item => item.ok);

  logLine("");
  logLine("======================================");
  logLine("🩺 更新前健康檢查");
  logLine("======================================");

  for (const item of items) {
    logLine(`${item.ok ? "✅" : "❌"} ${item.label}｜${item.message}`);
  }

  return {
    ok,
    items
  };
}

async function checkDirectory(dir, label, create = false) {
  try {
    if (create) {
      await fs.mkdir(dir, { recursive: true });
    }

    const stat = await fs.stat(dir);

    return {
      label,
      ok: stat.isDirectory(),
      message: stat.isDirectory() ? "存在" : "不是資料夾"
    };
  } catch (err) {
    return {
      label,
      ok: false,
      message: err.message
    };
  }
}

/* =========================
   Backup
========================= */

async function backupImportantDataFiles() {
  const backups = [];

  await fs.mkdir(BACKUP_DIR, { recursive: true });

  logLine("");
  logLine("======================================");
  logLine("🛡️ 更新前資料備份");
  logLine("======================================");

  for (const relativeFile of IMPORTANT_DATA_FILES) {
    const source = path.join(ROOT_DIR, relativeFile);

    if (!(await fileExists(source))) {
      logLine(`⏭️ 略過：${relativeFile} 不存在`);
      continue;
    }

    const parsed = path.parse(relativeFile.replace(/[\\/]/g, "_"));
    const backupName = `${parsed.name}-${RUN_ID}${parsed.ext || ".json"}`;
    const target = path.join(BACKUP_DIR, backupName);

    try {
      await fs.copyFile(source, target);

      const sourceStat = await fs.stat(source);

      backups.push({
        source: relativeFile,
        target: path.relative(ROOT_DIR, target),
        sizeBytes: sourceStat.size,
        ok: true
      });

      logLine(`✅ 備份：${relativeFile} → ${path.relative(ROOT_DIR, target)}`);
    } catch (err) {
      backups.push({
        source: relativeFile,
        target: path.relative(ROOT_DIR, target),
        ok: false,
        error: err.message
      });

      logLine(`⚠️ 備份失敗：${relativeFile}｜${err.message}`);
    }
  }

  return backups;
}

/* =========================
   Run Task
========================= */

function runTask(task) {
  return new Promise(async (resolve) => {
    const taskStart = Date.now();
    const scripts = await resolveTaskScripts(task);

    logLine("");
    logLine("======================================");
    logLine(`▶️ 開始：${task.name}`);
    logLine(`📄 腳本：${scripts.length ? scripts.join(" → ") : "無可執行腳本"}`);
    logLine("======================================");

    if (!scripts.length) {
      const message = isCandidateOnlyTask(task)
        ? `此階段沒有找到可執行候選腳本：${getTaskScripts(task).join(", ")}`
        : "此階段沒有設定 script/scripts";

      logLine(`⏭️ 跳過：${task.name}`);
      logLine(`   ${message}`);

      resolve({
        ...task,
        script: "",
        ok: !task.required,
        skipped: true,
        code: task.required ? -1 : 0,
        duration: "0 秒",
        output: "",
        errorOutput: task.required ? message : "",
        stats: {},
        steps: []
      });

      return;
    }

    let output = "";
    let errorOutput = "";
    const steps = [];

    for (const script of scripts) {
      const scriptPath = path.join(ROOT_DIR, script);

      if (!(await fileExists(scriptPath))) {
        const msg = `找不到腳本：${script}`;

        errorOutput += `${msg}\n`;

        steps.push({
          script,
          ok: false,
          skipped: true,
          code: -1,
          duration: "0 秒",
          output: "",
          errorOutput: msg,
          stats: {}
        });

        logLine("");
        logLine(`❌ 跳過子任務：${script}`);
        logLine(`   ${msg}`);

        if (task.required || shouldStopOnFail()) break;

        continue;
      }

      const stepStart = Date.now();
      const args = buildArgsForScript(task, script);

      logLine("");
      logLine(`▶️ 子任務：${script}`);
      logLine(`🧩 參數：${args.length ? args.join(" ") : "無"}`);

      const step = await runNodeScript(script, args, stepStart);

      output += step.output || "";
      errorOutput += step.errorOutput || "";
      steps.push(step);

      if (!step.ok && (task.required || shouldStopOnFail())) break;
    }

    const duration = formatDuration(Date.now() - taskStart);
    const ok = steps.length > 0 && steps.every(step => step.ok);
    const code = ok ? 0 : (steps.find(step => !step.ok)?.code ?? -1);
    const stats = extractStats(output + "\n" + errorOutput);

    if (ok) {
      logLine("");
      logLine(`✅ 完成：${task.name}｜耗時 ${duration}`);
    } else {
      logLine("");
      logLine(`❌ 失敗或部分失敗：${task.name}｜exit code ${code}｜耗時 ${duration}`);
    }

    resolve({
      ...task,
      script: scripts.join(" + "),
      ok,
      code,
      duration,
      durationMs: Date.now() - taskStart,
      output,
      errorOutput,
      stats,
      steps
    });
  });
}

function runNodeScript(script, args, startedAtMs) {
  return new Promise((resolve) => {
    const child = spawn(
      "node",
      [script, ...args],
      {
        cwd: ROOT_DIR,
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          CPBL_UPDATE_ALL_RUN_ID: RUN_ID
        }
      }
    );

    let output = "";
    let errorOutput = "";

    child.stdout.on("data", data => {
      const text = data.toString();
      output += text;
      printAndLog(text);
    });

    child.stderr.on("data", data => {
      const text = data.toString();
      errorOutput += text;
      printAndLog(text);
    });

    child.on("close", code => {
      const duration = formatDuration(Date.now() - startedAtMs);
      const stats = extractStats(output + "\n" + errorOutput);

      if (code === 0) {
        logLine(`✅ 子任務完成：${script}｜耗時 ${duration}`);
      } else {
        logLine(`❌ 子任務失敗：${script}｜exit code ${code}｜耗時 ${duration}`);
      }

      resolve({
        script,
        ok: code === 0,
        code,
        duration,
        durationMs: Date.now() - startedAtMs,
        output,
        errorOutput,
        stats
      });
    });

    child.on("error", err => {
      const duration = formatDuration(Date.now() - startedAtMs);
      const errorText = String(err);

      logLine(`❌ 無法執行子任務：${script}`);
      logLine(errorText);

      resolve({
        script,
        ok: false,
        code: -1,
        duration,
        durationMs: Date.now() - startedAtMs,
        output,
        errorOutput: errorText,
        stats: {}
      });
    });
  });
}

/* =========================
   Stats
========================= */

function extractStats(text) {
  const stats = {};

  const patterns = [
    {
      key: "updatedGames",
      regexes: [
        /資料更新完成：\s*(\d+)\s*場/,
        /本次更新 FINAL 場次：\s*(\d+)/,
        /LIVE 更新完成.*?(\d+)/,
        /更新完成：\s*(\d+)\s*場/
      ]
    },
    {
      key: "keptGames",
      regexes: [
        /共保留場次：\s*(\d+)/,
        /LIVE 更新完成，共保留場次：\s*(\d+)/
      ]
    },
    {
      key: "candidateGames",
      regexes: [
        /比賽中候選：\s*(\d+)/,
        /賽後檢查候選：\s*(\d+)/
      ]
    },
    {
      key: "newsCount",
      regexes: [
        /快訊.*?(\d+)\s*則/,
        /NEWS.*?(\d+)\s*則/,
        /league-news.*?(\d+)/i
      ]
    }
  ];

  for (const group of patterns) {
    for (const regex of group.regexes) {
      const match = text.match(regex);

      if (match) {
        stats[group.key] = Number(match[1]);
        break;
      }
    }
  }

  const warningCount = (text.match(/⚠️/g) || []).length;
  const shieldCount = (text.match(/🛡️/g) || []).length;
  const errorCount = (text.match(/❌/g) || []).length;

  stats.warningCount = warningCount;
  stats.shieldCount = shieldCount;
  stats.errorCount = errorCount;

  return stats;
}

/* =========================
   Summary
========================= */

function logHeader(tasks, date, only) {
  logLine("======================================");
  logLine("🚀 CPBL 一鍵更新開始 v5.2.5-BUILD-ARGS-HOTFIX");
  logLine(`時間：${new Date().toLocaleString("zh-TW")}`);
  logLine(`專案根目錄：${ROOT_DIR}`);
  logLine(`Log：${path.relative(ROOT_DIR, LOG_FILE)}`);
  logLine(`Summary：${path.relative(ROOT_DIR, SUMMARY_FILE)}`);

  if (date) {
    logLine(`指定日期：${date}`);
  } else {
    logLine("指定日期：未指定，交給各腳本判斷今日");
  }

  logLine(`只跑階段：${only}`);
  logLine(`失敗策略：${shouldStopOnFail() ? "失敗即停止" : "失敗不中斷"}`);
  logLine(`資料備份：${shouldSkipBackup() ? "關閉" : "開啟"}`);

  if (isDryRun()) {
    logLine("模式：dry-run，只檢查不執行");
  }

  if (isSoftExit()) {
    logLine("退出策略：soft-exit，有失敗也回傳 exit 0");
  }

  logLine("======================================");
  logLine("");
  logLine("本次任務：");

  tasks.forEach((task, index) => {
    logLine(`${index + 1}. ${task.name}`);
    for (const script of getTaskScripts(task)) {
      logLine(`   ${script}`);
    }
  });
}

function logSummary(tasks, results) {
  const totalDuration = formatDuration(Date.now() - startedAt);

  logLine("");
  logLine("======================================");
  logLine("📦 一鍵更新總結 v5.2.5-BUILD-ARGS-HOTFIX");
  logLine("======================================");

  tasks.forEach(task => {
    const result = results.find(r => r.script === task.script);

    if (!result) {
      logLine(`⏭️ 未執行：${task.name}`);
      return;
    }

    const statusIcon = result.ok ? "✅" : "❌";
    const countText = buildStatsText(result.stats);

    logLine(`${statusIcon} ${task.name}｜${result.duration}${countText ? `｜${countText}` : ""}`);
  });

  logLine("--------------------------------------");
  logLine(`總耗時：${totalDuration}`);

  const successCount = results.filter(r => r.ok).length;
  const failCount = results.filter(r => !r.ok).length;
  const notRunCount = tasks.length - results.length;

  logLine(`成功：${successCount}`);
  logLine(`失敗：${failCount}`);
  logLine(`未執行：${notRunCount}`);
  logLine(`Log：${path.relative(ROOT_DIR, LOG_FILE)}`);
  logLine(`Summary：${path.relative(ROOT_DIR, SUMMARY_FILE)}`);

  if (failCount === 0 && notRunCount === 0) {
    logLine("");
    logLine("🎉 全部更新完成！");
  } else {
    logLine("");
    logLine("⚠️ 有任務未完成，但 v5 穩定版已保留 log / summary / 備份。");
  }
}

function buildStatsText(stats = {}) {
  const parts = [];

  if (Number.isFinite(stats.updatedGames)) {
    parts.push(`更新 ${stats.updatedGames} 場`);
  }

  if (Number.isFinite(stats.keptGames)) {
    parts.push(`保留 ${stats.keptGames} 場`);
  }

  if (Number.isFinite(stats.candidateGames)) {
    parts.push(`候選 ${stats.candidateGames} 場`);
  }

  if (Number.isFinite(stats.newsCount)) {
    parts.push(`快訊 ${stats.newsCount} 則`);
  }

  if (Number.isFinite(stats.warningCount) && stats.warningCount > 0) {
    parts.push(`警告 ${stats.warningCount}`);
  }

  if (Number.isFinite(stats.shieldCount) && stats.shieldCount > 0) {
    parts.push(`保護 ${stats.shieldCount}`);
  }

  return parts.join("，");
}

async function writeSummary(payload) {
  const safeTasks = (payload.tasks || []).map(task => ({
    key: task.key,
    name: task.name,
    script: task.script,
    risk: task.risk,
    required: task.required
  }));

  const safeResults = (payload.results || []).map(result => ({
    key: result.key,
    name: result.name,
    script: result.script,
    ok: result.ok,
    skipped: !!result.skipped,
    code: result.code,
    duration: result.duration,
    durationMs: result.durationMs || 0,
    stats: result.stats || {},
    errorOutputSample: result.errorOutput
      ? result.errorOutput.slice(0, 1500)
      : ""
  }));

  const summary = {
    version: "v5.2.5-BUILD-ARGS-HOTFIX",
    runId: RUN_ID,
    mode: payload.mode,
    rootDir: ROOT_DIR,
    logFile: path.relative(ROOT_DIR, LOG_FILE),
    summaryFile: path.relative(ROOT_DIR, SUMMARY_FILE),
    startedAt: new Date(payload.startedAt).toISOString(),
    endedAt: new Date(payload.endedAt).toISOString(),
    durationMs: payload.endedAt - payload.startedAt,
    durationText: formatDuration(payload.endedAt - payload.startedAt),
    date: getTargetDate() || null,
    only: getOnlyStage() || "core",
    stopOnFail: shouldStopOnFail(),
    softExit: isSoftExit(),
    dryRun: isDryRun(),
    noBackup: shouldSkipBackup(),
    health: payload.health || null,
    tasks: safeTasks,
    results: safeResults,
    backups: payload.backups || [],
    totals: {
      success: safeResults.filter(r => r.ok).length,
      failed: safeResults.filter(r => !r.ok).length,
      notRun: safeTasks.length - safeResults.length
    }
  };

  await fs.writeFile(
    SUMMARY_FILE,
    JSON.stringify(summary, null, 2),
    "utf-8"
  );
}

/* =========================
   Log
========================= */

function printAndLog(text) {
  process.stdout.write(text);
  appendLog(text);
}

function logLine(text = "") {
  const line = `${text}\n`;
  process.stdout.write(line);
  appendLog(line);
}

function appendLog(text) {
  fs.appendFile(LOG_FILE, text, "utf-8").catch(() => {});
}

/* =========================
   Utils
========================= */

async function fileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes} 分 ${seconds} 秒`;
}

function getTimestampForFile() {
  const d = new Date();

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return `${y}${m}${day}-${hh}${mm}${ss}`;
}

main().catch(async err => {
  logLine("");
  logLine("❌ update-all 發生未預期錯誤：");
  logLine(err?.stack || String(err));

  try {
    await writeSummary({
      mode: "unexpected-error",
      health: null,
      tasks: [],
      results: [
        {
          key: "update-all",
          name: "update-all 主程式",
          script: "scripts/update-all.js",
          ok: false,
          code: -1,
          duration: formatDuration(Date.now() - startedAt),
          durationMs: Date.now() - startedAt,
          errorOutput: err?.stack || String(err),
          stats: {}
        }
      ],
      backups: [],
      startedAt,
      endedAt: Date.now()
    });
  } catch {
    // summary 寫入失敗就略過
  }

  process.exit(isSoftExit() ? 0 : 1);
});