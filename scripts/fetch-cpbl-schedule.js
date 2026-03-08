/* =========================
   fetch-cpbl-schedule.js
   穩定 CPBL 賽程 JSON → 你自己的格式
   （已處理 BOM / 非乾淨 JSON）
   ========================= */

import fetch from "node-fetch";
import fs from "fs";

// ===== 設定 =====
const SEASON_YEAR = 2026;

// ===== 資料來源年（暫時用 2025）=====
const SOURCE_YEAR = 2025;
const MONTH = "03"; // 01 ~ 12
const OUTPUT_DIR = "./data/live";
const OUTPUT_FILE = `${OUTPUT_DIR}/live-${SEASON_YEAR}-${MONTH}.json`;
console.log("DEBUG SOURCE_URL =", SOURCE_URL);


const SOURCE_URL =
  `https://raw.githubusercontent.com/yuehhua/cpbl-data/master/schedule/${SOURCE_YEAR}.json`;
// ===== 產生唯一 gameId =====
function createGameId(date, homeId, awayId) {
  // date: "2026-03-14"
  const ymd = date.replace(/-/g, "");
  return `${ymd}-${homeId}-${awayId}`;
}




// 中職隊名 → 你系統的 teamId
const TEAM_NAME_MAP = {
  "中信兄弟": "brothers",
  "統一7-ELEVEn獅": "lions",
  "樂天桃猿": "monkeys",
  "味全龍": "dragons",
  "富邦悍將": "guardians",
  "台鋼雄鷹": "hawks"
};
// ===== 日期轉成系統賽季年（2026）=====
function shiftToSeasonYear(dateStr) {
  // 例如：2025-03-15 → 2026-03-15
  return dateStr.replace(/^\d{4}/, String(SEASON_YEAR));
}

// ===== 主程式 =====
async function fetchSchedule() {
  console.log("📡 抓取穩定 CPBL 賽程資料中…");

  const res = await fetch(SOURCE_URL);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  // ⚠️ 不用 res.json()，避免 BOM / 非標準字元問題
  const text = await res.text();

  // 移除 BOM（如果有）
  const cleanedText = text.replace(/^\uFEFF/, "");

  let allGames;
  try {
    allGames = JSON.parse(cleanedText);
  } catch (err) {
    throw new Error("JSON 解析失敗（來源格式異常）");
  }

  if (!Array.isArray(allGames)) {
    throw new Error("來源資料不是陣列");
  }

  // 篩選指定年月
  const gamesOfMonth = allGames.filter(g =>
    typeof g.date === "string" &&
    g.date.startsWith(`${YEAR}-${MONTH}`)
  );

  console.log(`✅ ${YEAR}-${MONTH} 共 ${gamesOfMonth.length} 筆賽事`);

  const games = gamesOfMonth.map(g => {
    const homeName = g.home;
    const awayName = g.away;

    return {
      gameId: createGameId(
        shiftToSeasonYear(g.date),
        homeId,
        awayId

      
),

      date: shiftToSeasonYear(g.date),
               // YYYY-MM-DD
      type: "regular",
      status: g.result ? "finished" : "scheduled",
      teams: {
        home: TEAM_NAME_MAP[homeName] || homeName,
        away: TEAM_NAME_MAP[awayName] || awayName
      },
      homeScore: g.result ? g.result.home : null,
      awayScore: g.result ? g.result.away : null,
      time: g.time || null,
      venue: g.stadium || null
    };
  });

  // 確保資料夾存在
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(games, null, 2),
    "utf-8"
  );

  console.log(`💾 已輸出：${OUTPUT_FILE}`);
}

// ===== 執行 =====
fetchSchedule().catch(err => {
  console.error("❌ 失敗：", err.message);
});
