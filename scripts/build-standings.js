// =========================================================
// Ray's CPBL Data Site
// Derived Standings Builder v1
//
// Source of truth: data/live/live-boxscore.json
// Rules: config/season-settings.json
// Output: data/standings-<season>[-first|-second].json
//
// Important: this script never edits live-boxscore.json. If source data or
// config is invalid, existing standings files are preserved as fallback.
// =========================================================

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { calculateStandings } from "../js/standingsEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const SOURCE_FILE = path.join(ROOT, "data/live/live-boxscore.json");
const SETTINGS_FILE = path.join(ROOT, "config/season-settings.json");
const SOURCE_LABEL = "derived:data/live/live-boxscore.json";

async function main() {
  const settings = await readJson(SETTINGS_FILE);
  const source = await readJson(SOURCE_FILE);
  const games = Array.isArray(source) ? source : Object.values(source || {});

  if (!games.length) throw new Error("live-boxscore.json 沒有任何比賽資料，保留既有 standings fallback");

  const seasonArg = getArg("season");
  const seasons = seasonArg ? [seasonArg] : Object.keys(settings.seasons || {});
  if (!seasons.length) throw new Error("season-settings.json 沒有 season 設定");

  let changed = 0;
  for (const season of seasons) {
    const seasonConfig = settings.seasons?.[season];
    if (!seasonConfig) throw new Error(`找不到 season 設定：${season}`);

    for (const split of ["full", "first", "second"]) {
      const range = seasonConfig.splits?.[split];
      if (!range) continue;
      const result = await buildOne({ season, split, range, games });
      if (result.changed) changed++;
      console.log(`${result.changed ? "✅" : "⏭️"} ${result.file}: ${result.message}`);
    }
  }

  console.log(`Standings build 完成：${changed} 個檔案有實質變更。`);
}

async function buildOne({ season, split, range, games }) {
  validateRange(season, split, range);

  const scoped = games.filter(game => {
    const meta = game?.meta || {};
    return meta.type === "regular" && isDateInRange(meta.date, range);
  });

  if (!scoped.length) {
    throw new Error(`${season}/${split} 在 ${range.start} ~ ${range.end} 找不到例行賽資料`);
  }

  const table = calculateStandings(scoped);
  const finalGames = scoped.filter(game => game?.meta?.status === "final" && hasValidScore(game));
  const invalidFinalGames = scoped.filter(game => game?.meta?.status === "final" && !hasValidScore(game));

  if (invalidFinalGames.length) {
    const ids = invalidFinalGames.slice(0, 10).map(game => game?.gameSno).join(", ");
    throw new Error(`${season}/${split} 有 ${invalidFinalGames.length} 場 final 缺少合法比分（${ids}），拒絕重建 standings`);
  }

  const file = split === "full"
    ? `data/standings-${season}.json`
    : `data/standings-${season}-${split}.json`;
  const outputPath = path.join(ROOT, file);

  const core = {
    schemaVersion: 1,
    season,
    split,
    range,
    source: SOURCE_LABEL,
    dataStatus: {
      status: "ok",
      isCached: false,
      completedGames: finalGames.length,
      scheduledGames: scoped.filter(game => game?.meta?.status === "scheduled").length,
      liveGames: scoped.filter(game => game?.meta?.status === "live").length,
      sourceGameCount: scoped.length
    },
    standings: table
  };

  const existing = await readJsonIfExists(outputPath);
  if (existing && sameCore(existing, core)) {
    return { changed: false, file, message: `無實質變更，保留 updatedAt=${existing.updatedAt || "unknown"}` };
  }

  const now = new Date().toISOString();
  const payload = {
    ...core,
    updatedAt: now,
    lastSuccessfulAt: now,
    dataStatus: {
      ...core.dataStatus,
      lastSuccessfulAt: now
    }
  };

  await atomicWriteJson(outputPath, payload);
  return { changed: true, file, message: `${finalGames.length} 場 final 已重新計算` };
}

function hasValidScore(game) {
  return Number.isFinite(Number(game?.totals?.home?.R)) && Number.isFinite(Number(game?.totals?.away?.R));
}

function isDateInRange(date, range) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) && date >= range.start && date <= range.end;
}

function validateRange(season, split, range) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range?.start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(range?.end || "")) {
    throw new Error(`${season}/${split} 日期格式錯誤`);
  }
  if (range.start > range.end) throw new Error(`${season}/${split} start 晚於 end`);
}

function sameCore(existing, nextCore) {
  const strip = value => {
    const clone = JSON.parse(JSON.stringify(value || {}));
    delete clone.updatedAt;
    delete clone.lastSuccessfulAt;
    if (clone.dataStatus) delete clone.dataStatus.lastSuccessfulAt;
    return clone;
  };
  return JSON.stringify(strip(existing)) === JSON.stringify(strip(nextCore));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readJsonIfExists(file) {
  try { return await readJson(file); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function atomicWriteJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
}

function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(item => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : "";
}

main().catch(error => {
  console.error(`❌ Standings build 失敗：${error.message}`);
  console.error("既有 standings JSON 未被覆蓋，可繼續作為最近一次成功快取。 ");
  process.exitCode = 1;
});
