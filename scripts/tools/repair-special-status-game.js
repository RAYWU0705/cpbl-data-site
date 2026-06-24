import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const gameSno = String(getArg("--gameSno", "150"));
const status = getArg("--status", "suspended");
const statusText = getArg("--statusText", status === "suspended" ? "保留比賽" : status === "postponed" ? "延賽" : "取消");
const liveFile = path.join(ROOT, "data", "live", "live-boxscore.json");
const vueFile = path.join(ROOT, "data", "live", "final-boxscore-vue-2026.json");

const liveData = JSON.parse(fs.readFileSync(liveFile, "utf8"));
const liveGames = toArray(liveData);
const game = liveGames.find(g => String(g?.gameSno ?? g?.meta?.gameSno ?? "") === gameSno);
if (!game) throw new Error(`live-boxscore 找不到 #${gameSno}`);

game.meta ??= {};
game.meta.status = status;
game.meta.statusText = statusText;
game.status = status;
game.statusText = statusText;

for (const key of [
  "finalLock", "finalLockSource", "finalVueEnhanced", "finalVueForceMerged",
  "finalVueForcedFromStatus", "finalVueEnhancedAt", "finalVueEnhancedVersion",
  "statusBeforeFinalVueMerge"
]) {
  delete game[key];
  delete game.meta[key];
}

game.dataQuality ??= {};
game.dataQuality.stage = status;
game.dataQuality.source = "special-status-repair-v5.5.0";
game.dataQuality.finalLock = "debug";
game.dataQuality.flags = Array.isArray(game.dataQuality.flags)
  ? game.dataQuality.flags.filter(flag => flag !== "finalLock")
  : [];
game.dataQuality.message = `#${gameSno} 已修正為 ${statusText}，並清除 FINAL 鎖。`;
game.dataQuality.updatedAt = new Date().toISOString();

fs.writeFileSync(liveFile, JSON.stringify(liveData, null, 2) + "\n", "utf8");
console.log(`✅ live-boxscore #${gameSno} → ${status} / ${statusText}`);

if (fs.existsSync(vueFile)) {
  const vueData = JSON.parse(fs.readFileSync(vueFile, "utf8"));
  if (Array.isArray(vueData)) {
    const next = vueData.filter(g => String(g?.gameSno ?? g?.meta?.gameSno ?? "") !== gameSno);
    fs.writeFileSync(vueFile, JSON.stringify(next, null, 2) + "\n", "utf8");
    console.log(`✅ FINAL Vue 已移除 #${gameSno}：${vueData.length} → ${next.length}`);
  } else if (Array.isArray(vueData.games)) {
    const before = vueData.games.length;
    vueData.games = vueData.games.filter(g => String(g?.gameSno ?? g?.meta?.gameSno ?? "") !== gameSno);
    fs.writeFileSync(vueFile, JSON.stringify(vueData, null, 2) + "\n", "utf8");
    console.log(`✅ FINAL Vue 已移除 #${gameSno}：${before} → ${vueData.games.length}`);
  }
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.games)) return data.games;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function getArg(name, fallback = "") {
  const prefix = `${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}
