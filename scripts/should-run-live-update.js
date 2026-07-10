// =========================================================
// Ray's CPBL Data Site
// GitHub Actions LIVE Preflight v1
//
// 依 Asia/Taipei 時間與 live-boxscore.json 判斷是否值得啟動 Puppeteer。
// 不修改資料；判斷失敗時採 fail-open，讓工作流程繼續執行。
// =========================================================

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const LIVE_FILE = path.join(ROOT, "data/live/live-boxscore.json");

const FORCE =
  process.argv.includes("--force") ||
  String(process.env.CPBL_FORCE_LIVE_UPDATE || "").toLowerCase() === "true";

const JSON_MODE = process.argv.includes("--json");
const BEFORE_MINUTES = numberEnv("CPBL_LIVE_BEFORE_MINUTES", 180);
const AFTER_MINUTES = numberEnv("CPBL_LIVE_AFTER_MINUTES", 420);
const NOW_ARG = process.argv.find(arg => arg.startsWith("--now="))?.slice(6) || "";

async function main() {
  if (FORCE) {
    return finish(true, "manual-force", []);
  }

  let games;
  try {
    const raw = JSON.parse(await fs.readFile(LIVE_FILE, "utf8"));
    games = Array.isArray(raw) ? raw : Object.values(raw || {});
  } catch (cause) {
    return finish(true, `fail-open: ${cause.message}`, []);
  }

  const now = NOW_ARG ? new Date(NOW_ARG) : new Date();
  if (Number.isNaN(now.getTime())) {
    return finish(true, `fail-open: invalid --now=${NOW_ARG}`, []);
  }
  const taipei = getTaipeiParts(now);
  const today = `${taipei.year}-${taipei.month}-${taipei.day}`;

  const todayGames = games.filter(game => getDate(game) === today);
  const activeGames = todayGames.filter(game => isLiveStatus(getStatus(game)));

  if (activeGames.length) {
    return finish(true, "active-live-game", activeGames);
  }

  const runnable = todayGames.filter(game => {
    const status = getStatus(game);
    if (["final", "postponed", "suspended", "cancelled"].includes(status)) return false;

    const start = parseTaipeiStart(getDate(game), getTime(game));
    if (!start) return false;

    const before = BEFORE_MINUTES * 60 * 1000;
    const after = AFTER_MINUTES * 60 * 1000;
    return now.getTime() >= start - before && now.getTime() <= start + after;
  });

  if (runnable.length) {
    return finish(true, "within-game-window", runnable);
  }

  return finish(false, todayGames.length ? "outside-game-window" : "no-games-today", todayGames);
}

async function finish(shouldRun, reason, games) {
  const result = {
    version: "v1-SMART-LIVE-PREFLIGHT",
    shouldRun,
    reason,
    gameCount: games.length,
    games: games.map(game => ({
      gameSno: Number(game?.gameSno || game?.meta?.gameSno || 0),
      date: getDate(game),
      time: getTime(game),
      status: getStatus(game),
      away: game?.meta?.away || game?.away || "",
      home: game?.meta?.home || game?.home || ""
    }))
  };

  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(
      process.env.GITHUB_OUTPUT,
      `should_run=${shouldRun ? "true" : "false"}\nreason=${reason}\n`,
      "utf8"
    );
  }

  if (JSON_MODE) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("======================================");
    console.log("⚾ CPBL LIVE Update Preflight");
    console.log("======================================");
    console.log(`執行：${shouldRun ? "YES" : "NO"}`);
    console.log(`原因：${reason}`);
    console.log(`相關場次：${games.length}`);
  }
}

function getTaipeiParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter(part => ["year", "month", "day"].includes(part.type))
      .map(part => [part.type, part.value])
  );
}

function getDate(game) {
  return String(game?.meta?.date || game?.date || "").trim();
}

function getTime(game) {
  return String(game?.meta?.time || game?.time || "").trim();
}

function getStatus(game) {
  return String(game?.meta?.status || game?.status || "scheduled").trim().toLowerCase();
}

function isLiveStatus(status) {
  return ["live", "in_progress", "playing"].includes(status);
}

function parseTaipeiStart(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{1,2}:\d{2}$/.test(time)) return null;

  const [hour, minute] = time.split(":").map(Number);
  const normalized = `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
  const value = new Date(normalized).getTime();
  return Number.isFinite(value) ? value : null;
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

main().catch(cause => {
  console.error("⚠️ preflight 失敗，採 fail-open：", cause.message);
  finish(true, `fail-open: ${cause.message}`, []).catch(() => {});
});
