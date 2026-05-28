// =========================
// CPBL Data Health Check v1
// 檢查 live-boxscore / rosters 資料健康狀態
// =========================

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, "..");

const LIVE_BOXSCORE_PATH = path.join(ROOT_DIR, "data/live/live-boxscore.json");
const ROSTERS_DIR = path.join(ROOT_DIR, "data/rosters");

const EXPECTED_GAMES = 360;

const TEAMS = {
  brothers: "中信兄弟",
  lions: "統一7-ELEVEn獅",
  monkeys: "樂天桃猿",
  guardians: "富邦悍將",
  dragons: "味全龍",
  hawks: "台鋼雄鷹"
};

let warningCount = 0;
let errorCount = 0;

async function main() {
  console.log("======================================");
  console.log("🩺 CPBL 資料健康檢查開始");
  console.log("======================================");

  const games = await checkLiveBoxscore();
  await checkRosters();

  console.log("");
  console.log("======================================");
  console.log("📦 健康檢查總結");
  console.log("======================================");

  if (games.length) {
    console.log(`📊 比賽資料：${games.length} 場`);
  }

  console.log(`⚠️ 警告：${warningCount}`);
  console.log(`❌ 錯誤：${errorCount}`);

  if (errorCount === 0 && warningCount === 0) {
    console.log("🎉 資料狀態完美，網站可以安心上場！");
  } else if (errorCount === 0) {
    console.log("✅ 沒有致命錯誤，但有一些資料可再補強。");
  } else {
    console.log("🛑 有資料錯誤，建議先修正後再使用網站。");
    process.exit(1);
  }
}

/* =========================
   live-boxscore 檢查
========================= */

async function checkLiveBoxscore() {
  console.log("");
  console.log("📁 檢查 live-boxscore.json");

  const exists = await fileExists(LIVE_BOXSCORE_PATH);

  if (!exists) {
    error(`找不到 ${relative(LIVE_BOXSCORE_PATH)}`);
    return [];
  }

  const raw = await fs.readFile(LIVE_BOXSCORE_PATH, "utf-8");

  let data;

  try {
    data = JSON.parse(raw);
  } catch (err) {
    error("live-boxscore.json 不是合法 JSON");
    return [];
  }

  const games = Array.isArray(data) ? data : Object.values(data || {});

  ok(`live-boxscore.json 可讀取，共 ${games.length} 場`);

  if (games.length < EXPECTED_GAMES) {
    warn(`總場次低於 ${EXPECTED_GAMES}，目前只有 ${games.length} 場`);
  } else if (games.length > EXPECTED_GAMES) {
    warn(`總場次高於 ${EXPECTED_GAMES}，目前有 ${games.length} 場，請確認是否含額外賽事`);
  } else {
    ok(`總場次符合預期：${EXPECTED_GAMES}`);
  }

  const statusCount = countBy(games, g => g.meta?.status || "unknown");

  console.log("");
  console.log("📌 狀態統計：");
  Object.entries(statusCount).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });

  checkGameBasic(games);
  checkFinalScores(games);
  checkRhe(games);
  checkLineScore(games);
  checkPlayerDetails(games);
  checkDuplicates(games);

  return games;
}

function checkGameBasic(games) {
  console.log("");
  console.log("🔎 檢查基本欄位");

  const missing = games.filter(g =>
    !g.gameSno ||
    !g.meta?.date ||
    !g.meta?.home ||
    !g.meta?.away
  );

  if (missing.length) {
    warn(`有 ${missing.length} 場缺少 gameSno/date/home/away`);
    printSampleGames(missing);
  } else {
    ok("所有比賽都有基本欄位");
  }
}

function checkFinalScores(games) {
  console.log("");
  console.log("🏁 檢查 final 比分");

  const finals = games.filter(g => g.meta?.status === "final");

  const missingScore = finals.filter(g =>
    typeof g.totals?.home?.R !== "number" ||
    typeof g.totals?.away?.R !== "number"
  );

  if (missingScore.length) {
    error(`有 ${missingScore.length} 場 final 缺少 R 分數`);
    printSampleGames(missingScore);
  } else {
    ok(`final 比賽都有比分，共 ${finals.length} 場`);
  }
}

function checkRhe(games) {
  console.log("");
  console.log("📊 檢查 R/H/E");

  const finals = games.filter(g => g.meta?.status === "final");

  const missingRhe = finals.filter(g =>
    typeof g.totals?.home?.R !== "number" ||
    typeof g.totals?.home?.H !== "number" ||
    typeof g.totals?.home?.E !== "number" ||
    typeof g.totals?.away?.R !== "number" ||
    typeof g.totals?.away?.H !== "number" ||
    typeof g.totals?.away?.E !== "number"
  );

  if (missingRhe.length) {
    warn(`有 ${missingRhe.length} 場 final 缺少完整 R/H/E`);
    printSampleGames(missingRhe);
  } else {
    ok("final 比賽都有完整 R/H/E");
  }
}

function checkLineScore(games) {
  console.log("");
  console.log("📋 檢查逐局比分");

  const finals = games.filter(g => g.meta?.status === "final");

  const missingLineScore = finals.filter(g =>
    !Array.isArray(g.lineScore?.home) ||
    !Array.isArray(g.lineScore?.away) ||
    g.lineScore.home.length === 0 ||
    g.lineScore.away.length === 0
  );

  if (missingLineScore.length) {
    warn(`有 ${missingLineScore.length} 場 final 缺少逐局比分`);
    printSampleGames(missingLineScore);
  } else {
    ok("final 比賽都有逐局比分");
  }
}

function checkPlayerDetails(games) {
  console.log("");
  console.log("👥 檢查打者 / 投手明細");

  const finals = games.filter(g => g.meta?.status === "final");

  const missingPlayers = finals.filter(g =>
    !Array.isArray(g.batters?.home) ||
    !Array.isArray(g.batters?.away) ||
    !Array.isArray(g.pitchers?.home) ||
    !Array.isArray(g.pitchers?.away) ||
    g.batters.home.length === 0 ||
    g.batters.away.length === 0 ||
    g.pitchers.home.length === 0 ||
    g.pitchers.away.length === 0
  );

  if (missingPlayers.length) {
    warn(`有 ${missingPlayers.length} 場 final 缺少打者 / 投手明細`);
    printSampleGames(missingPlayers);
  } else {
    ok("final 比賽都有打者 / 投手明細");
  }
}

function checkDuplicates(games) {
  console.log("");
  console.log("🧬 檢查重複 gameSno");

  const map = new Map();

  games.forEach(g => {
    const key = String(g.gameSno);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(g);
  });

  const duplicated = [...map.entries()].filter(([, list]) => list.length > 1);

  if (duplicated.length) {
    error(`發現 ${duplicated.length} 組重複 gameSno`);
    duplicated.slice(0, 10).forEach(([gameSno, list]) => {
      console.log(`   gameSno ${gameSno}: ${list.length} 筆`);
    });
  } else {
    ok("沒有重複 gameSno");
  }
}

/* =========================
   roster 檢查
========================= */

async function checkRosters() {
  console.log("");
  console.log("👕 檢查球隊名單 / 異動");

  const exists = await fileExists(ROSTERS_DIR);

  if (!exists) {
    error(`找不到 ${relative(ROSTERS_DIR)}`);
    return;
  }

  for (const [teamId, teamName] of Object.entries(TEAMS)) {
    const file = path.join(ROSTERS_DIR, `${teamId}.json`);
    const okFile = await fileExists(file);

    if (!okFile) {
      error(`${teamName} 缺少 roster 檔案：data/rosters/${teamId}.json`);
      continue;
    }

    let data;

    try {
      data = JSON.parse(await fs.readFile(file, "utf-8"));
    } catch {
      error(`${teamName} roster JSON 格式錯誤`);
      continue;
    }

    const firstCoach = data.coaches?.first?.list?.length || 0;
    const secondCoach = data.coaches?.second?.list?.length || 0;

    const firstPlayers = countSquadPlayers(data.players, "first");
    const secondPlayers = countSquadPlayers(data.players, "second");

    const transactions = Array.isArray(data.transactions)
      ? data.transactions.length
      : 0;

    console.log("");
    console.log(`📌 ${teamName}`);
    console.log(`   一軍教練：${firstCoach}`);
    console.log(`   二軍教練：${secondCoach}`);
    console.log(`   一軍球員：${firstPlayers}`);
    console.log(`   二軍球員：${secondPlayers}`);
    console.log(`   球員異動：${transactions}`);

    if (firstPlayers === 0) warn(`${teamName} 一軍球員數為 0`);
    if (secondPlayers === 0) warn(`${teamName} 二軍球員數為 0`);
    if (transactions === 0) warn(`${teamName} 球員異動數為 0`);
  }
}

function countSquadPlayers(players = {}, squad) {
  return Object.values(players)
    .filter(group => group?.squad === squad)
    .reduce((sum, group) => sum + (group.list?.length || 0), 0);
}

/* =========================
   工具
========================= */

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function countBy(list, fn) {
  const map = {};

  list.forEach(item => {
    const key = fn(item);
    map[key] = (map[key] || 0) + 1;
  });

  return map;
}

function printSampleGames(games) {
  games.slice(0, 10).forEach(g => {
    console.log(
      `   gameSno=${g.gameSno}｜${g.meta?.date || "?"}｜${g.meta?.away || "?"} vs ${g.meta?.home || "?"}`
    );
  });

  if (games.length > 10) {
    console.log(`   ……另有 ${games.length - 10} 場`);
  }
}

function relative(file) {
  return path.relative(ROOT_DIR, file);
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function warn(msg) {
  warningCount++;
  console.log(`⚠️ ${msg}`);
}

function error(msg) {
  errorCount++;
  console.log(`❌ ${msg}`);
}

main().catch(err => {
  console.error("❌ 健康檢查發生錯誤：", err);
  process.exit(1);
});