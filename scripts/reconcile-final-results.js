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
const INCLUDE_TODAY = process.argv.includes("--include-today");

main().catch(async error => {
  console.error("❌ FINAL reconciliation failed:", error.message);

  try {
    await writeReport("error", [], [], error.message);
  } catch {}

  process.exit(1);
});

function shouldReconcileTodayGame(game) {
  const status = game?.meta?.status || "";
  const statusText = game?.meta?.statusText || "";

  if (
    status === "final" ||
    status === "postponed" ||
    status === "cancelled" ||
    status === "suspended" ||
    statusText.includes("比賽結束")
  ) {
    return false;
  }

  // 曾經進入 LIVE：很可能只是尚未被 FINAL crawler 收尾。
  if (
    status === "live" ||
    statusText.includes("LIVE") ||
    statusText.includes("比賽中") ||
    statusText.includes("進行中")
  ) {
    return true;
  }

  // 若 LIVE 沒有抓到，但 scheduled 已超過合理完賽時間，
  // 也允許進 FINAL reconciliation。
  const date = game?.meta?.date || "";
  const time = game?.meta?.time || "";

  if (
    status === "scheduled" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    /^\d{1,2}:\d{2}$/.test(time)
  ) {
    const start = new Date(`${date}T${time}:00+08:00`).getTime();

    if (!Number.isFinite(start)) return false;

    const fourHoursMs = 4 * 60 * 60 * 1000;

    return Date.now() >= start + fourHoursMs;
  }

  return false;
}

function mergeUniqueTargets(base = [], extra = []) {
  const map = new Map();

  for (const game of [...base, ...extra]) {
    if (!game?.date || !game?.gameSno) continue;

    const key = `${game.date}#${game.gameSno}`;

    if (!map.has(key)) {
      map.set(key, {
        date: game.date,
        gameSno: Number(game.gameSno)
      });
    }
  }

  return [...map.values()];
}

function buildTodayTargets(games = []) {
  if (!INCLUDE_TODAY) return [];

  return games
    .filter(game => game?.meta?.date === TODAY)
    .filter(shouldReconcileTodayGame)
    .map(game => ({
      date: game.meta.date,
      gameSno: Number(game.gameSno)
    }));
}

async function main() {
  const source = JSON.parse(
    await fs.readFile(LIVE, "utf8")
  );

  let beforeTargets = selectReconciliationTargets(source, {
    today: TODAY,
    lookbackDays: LOOKBACK
  });

  if (INCLUDE_TODAY) {
    const todayTargets = buildTodayTargets(source);

    beforeTargets = mergeUniqueTargets(
      beforeTargets,
      todayTargets
    );
  }

  const dates = [
    ...new Set(
      beforeTargets
        .map(game => game.date)
        .filter(Boolean)
    )
  ].sort();

  console.log("======================================");
  console.log("🧹 CPBL FINAL Reconciliation v6.2.1");
  console.log(`台北基準日：${TODAY}`);

  console.log(
    `回查範圍：最近 ${LOOKBACK} 天` +
    `${INCLUDE_TODAY ? "（含今天）" : "（不含今天）"}`
  );

  console.log(`待修復場次：${beforeTargets.length}`);
  console.log(`待修復日期：${dates.join(", ") || "無"}`);

  if (beforeTargets.length) {
    console.log(
      `待修復 gameSno：${
        beforeTargets
          .map(game => `${game.date}#${game.gameSno}`)
          .join(", ")
      }`
    );
  }

  if (!beforeTargets.length) {
    await writeReport(
      "ok",
      [],
      [],
      INCLUDE_TODAY
        ? "no unresolved games including today"
        : "no unresolved past games"
    );

    console.log("✅ 沒有漏抓賽果，不需啟動瀏覽器。");
    return;
  }

  if (DRY_RUN) {
    await writeReport(
      "dry-run",
      beforeTargets,
      beforeTargets,
      "dry-run only"
    );

    console.log("🧪 Dry Run：僅列出待修復場次，不啟動 FINAL crawler。");
    return;
  }

  const runs = [];

  for (const date of dates) {
    console.log("");
    console.log(`📅 回查 ${date}`);

    await runNode(
      "scripts/fetch-cpbl-final-boxscore-vue.js",
      [
        "--write",
        `--date=${date}`,
        "--force",
        "--refresh-confirmed"
      ]
    );

    await runNode(
      "scripts/merge-first-team-final-vue-boxscore.js",
      [
        "--write",
        `--date=${date}`,
        "--force"
      ]
    );

    runs.push(date);
  }

  const after = JSON.parse(
    await fs.readFile(LIVE, "utf8")
  );

  let remaining = selectReconciliationTargets(after, {
    today: TODAY,
    lookbackDays: LOOKBACK
  });

  if (INCLUDE_TODAY) {
    const todayRemaining = buildTodayTargets(after);

    remaining = mergeUniqueTargets(
      remaining,
      todayRemaining
    );
  }

  const remainingKeys = new Set(
    remaining.map(keyOf)
  );

  const repaired = beforeTargets.filter(
    game => !remainingKeys.has(keyOf(game))
  );

  const status =
    remaining.length > 0
      ? "degraded"
      : "ok";

  await writeReport(
    status,
    beforeTargets,
    remaining,
    remaining.length
      ? `${remaining.length} unresolved games remain`
      : `${repaired.length} games reconciled`
  );

  console.log("");
  console.log("======================================");
  console.log(`✅ 已修復：${repaired.length}`);
  console.log(`⚠️ 仍待修復：${remaining.length}`);

  if (repaired.length) {
    console.log(
      `已修復 gameSno：${
        repaired
          .map(game => `${game.date}#${game.gameSno}`)
          .join(", ")
      }`
    );
  }

  if (remaining.length) {
    console.log(
      `仍待修復 gameSno：${
        remaining
          .map(game => `${game.date}#${game.gameSno}`)
          .join(", ")
      }`
    );

    process.exitCode = 2;
  }
}

async function runNode(script, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [script, ...args],
      {
        cwd: ROOT,
        stdio: "inherit",
        env: {
          ...process.env,
          CI: process.env.CI || "true"
        }
      }
    );

    child.on("error", reject);

    child.on("exit", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`${script} exited ${code}`)
        );
      }
    });
  });
}

async function writeReport(
  status,
  before,
  remaining,
  message
) {
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
      includeToday: INCLUDE_TODAY,
      todayTaipei: TODAY,
      targetCount: before.length,
      remainingCount: remaining.length,

      lastSuccessfulAt:
        successful
          ? now
          : previous?.dataStatus?.lastSuccessfulAt || null,

      message
    },

    targets: before,
    remaining
  };

  await fs.mkdir(
    path.dirname(REPORT),
    {
      recursive: true
    }
  );

  await fs.writeFile(
    REPORT,
    JSON.stringify(report, null, 2) + "\n",
    "utf8"
  );
}

async function readPreviousReport() {
  try {
    return JSON.parse(
      await fs.readFile(REPORT, "utf8")
    );
  } catch {
    return null;
  }
}

function keyOf(game) {
  return `${game.date}#${game.gameSno}`;
}

function getArg(name, fallback = "") {
  const prefix = `${name}=`;

  return (
    process.argv
      .find(arg => arg.startsWith(prefix))
      ?.slice(prefix.length) ||
    fallback
  );
}

function getTodayTaipei() {
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter(part =>
        ["year", "month", "day"].includes(part.type)
      )
      .map(part => [
        part.type,
        part.value
      ])
  );

  return `${values.year}-${values.month}-${values.day}`;
}