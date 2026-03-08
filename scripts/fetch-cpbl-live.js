/* =========================
   fetch-cpbl-live.js
   抓中職官網 → 轉成你自己的 JSON
   ========================= */

import fetch from "node-fetch";
import fs from "fs";
import path from "path";

// ===== 設定 =====
const YEAR = 2026;
const MONTH = "03"; // 可改 01~12
const OUTPUT_DIR = "./data/live";
const OUTPUT_FILE = `${OUTPUT_DIR}/live-${YEAR}-${MONTH}.json`;

const CPBL_API = "https://www.cpbl.com.tw/schedule/getgamedatas";

// 中職隊名 → 你系統的 teamId
const TEAM_NAME_MAP = {
  "中信兄弟": "brothers",
  "統一7-ELEVEn獅": "lions",
  "樂天桃猿": "monkeys",
  "味全龍": "dragons",
  "富邦悍將": "guardians",
  "台鋼雄鷹": "hawks"
};

// ===== 主程式 =====
async function fetchCPBL() {
  console.log("📡 抓取 CPBL 比賽資料中…");

  const body = new URLSearchParams({
    calendar: `${YEAR}/${MONTH}/01`,
    location: "",
    kindCode: "A" // A = 一軍
  });

  const res = await fetch(CPBL_API, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.cpbl.com.tw/schedule",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  },
  body
});


  
const text = await res.text();

console.log("HTTP 狀態碼:", res.status);
console.log("回傳前 500 字：");
console.log(text.slice(0, 500));

return;


// ⚠️ 真正的比賽陣列在 json.data
if (!Array.isArray(json.data)) {
  throw new Error("CPBL 回傳格式異常（找不到 data 陣列）");
}

const rawGames = json.data;

console.log(`✅ 共取得 ${rawGames.length} 筆賽事`);

const games = rawGames.map(g => {

    const homeName = g.HomeTeamName;
    const awayName = g.AwayTeamName;

    return {
      date: g.GameDate,               // 2026-02-05
      type: "regular",
      status: g.GameStatus === "已結束" ? "finished" : "scheduled",
      teams: {
        home: TEAM_NAME_MAP[homeName] || homeName,
        away: TEAM_NAME_MAP[awayName] || awayName
      },
      homeScore: g.HomeScore !== "" ? Number(g.HomeScore) : null,
      awayScore: g.AwayScore !== "" ? Number(g.AwayScore) : null,
      time: g.GameTime || null,
      venue: g.FieldName || null
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

// 執行
fetchCPBL().catch(err => {
  console.error("❌ 抓取失敗：", err.message);
});
