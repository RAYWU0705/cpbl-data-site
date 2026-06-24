import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SEASON_YEAR = 2026;
const KIND_CODE = "A";

/*
  建議流程：
  第一次先測小範圍，例如 1~30 或 60~80。
  確認正常後再改成 1~120 或更大。
*/
const START_GAME_SNO = 1;
const END_GAME_SNO = 90;

const TEAM_NAMES = [
  "中信兄弟",
  "統一7-ELEVEn獅",
  "樂天桃猿",
  "富邦悍將",
  "味全龍",
  "台鋼雄鷹"
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fixDate(dateStr) {
  if (!dateStr) return null;

  const raw = dateStr.replace(/\//g, "-");
  const parts = raw.split("-");

  if (parts.length < 3) return null;

  return `${SEASON_YEAR}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
}

function buildUrls(gameSno) {
  return [
    {
      mode: "normal",
      url: `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`
    },
    {
      mode: "presentStatus",
      url: `https://www.cpbl.com.tw/box?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}&presentStatus=0`
    }
  ];
}

function normalizeGameSno(text) {
  if (!text) return null;

  const n = Number(String(text).replace(/^0+/, ""));

  return Number.isFinite(n) ? n : null;
}

function normalizeType(typeText) {
  if (!typeText) return "regular";

  if (typeText.includes("熱身")) return "exhibition";
  if (typeText.includes("例行")) return "regular";
  if (typeText.includes("總冠軍")) return "championship";
  if (typeText.includes("季後")) return "playoff";
  if (typeText.includes("明星")) return "allstar";
  if (typeText.includes("二軍")) return "minor";

  return "regular";
}

function getStatusFromText(text) {
  if (!text) return "scheduled";

  if (text.includes("延賽")) return "postponed";
  if (text.includes("保留")) return "suspended";
  if (text.includes("取消")) return "cancelled";

  if (text.includes("比賽尚未開始")) return "scheduled";
  if (text.includes("比賽結束")) return "final";
  if (text.includes("比賽終了")) return "final";
  if (text.includes("進行中")) return "live";
  if (text.includes("LIVE")) return "live";

  return "scheduled";
}

function getStatusText(status) {
  if (status === "live") return "LIVE";
  if (status === "final") return "比賽結束";
  if (status === "postponed") return "延賽";
  if (status === "suspended") return "保留比賽";
  if (status === "cancelled") return "取消";
  return "比賽尚未開始";
}

/* =========================
   抓官方比賽中心 metadata
========================= */
async function fetchGameMeta(page, gameSno, entry) {
  await page.goto(entry.url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(2200);

  return await page.evaluate((TEAM_NAMES, entryMode, entryUrl) => {
    const bodyText = document.body?.innerText || "";

    if (!bodyText || bodyText.length < 180) {
      return {
        ok: false,
        reason: "頁面文字太短",
        entryMode,
        entryUrl
      };
    }

    if (
      bodyText.includes("查無資料") ||
      bodyText.includes("目前無資料") ||
      bodyText.includes("系統發生錯誤")
    ) {
      return {
        ok: false,
        reason: "頁面顯示無資料",
        entryMode,
        entryUrl
      };
    }

    const lines = bodyText
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    /*
      抓 matchup 行：
      2026/04/30 樂天桃猿 VS. 中信兄弟
    */
    const matchupLine = lines.find(line =>
      /\d{4}\/\d{1,2}\/\d{1,2}/.test(line) &&
      /VS\.?|vs\.?/i.test(line) &&
      TEAM_NAMES.some(team => line.includes(team))
    );

    if (!matchupLine) {
      return {
        ok: false,
        reason: "找不到 matchupLine",
        entryMode,
        entryUrl,
        preview: bodyText.slice(0, 1000)
      };
    }

    const dateMatch = matchupLine.match(/\d{4}\/\d{1,2}\/\d{1,2}/);
    const date = dateMatch ? dateMatch[0] : null;

    const teams = TEAM_NAMES
      .filter(team => matchupLine.includes(team))
      .sort((a, b) => matchupLine.indexOf(a) - matchupLine.indexOf(b));

    if (teams.length < 2) {
      return {
        ok: false,
        reason: "matchupLine 找不到兩隊",
        entryMode,
        entryUrl,
        matchupLine
      };
    }

    const away = teams[0];
    const home = teams[1];

    /*
      找主要比賽卡區塊：
      2026/04/30 (星期四)
      070
      樂天桃猿
      VS.
      洲際 18:35
      中信兄弟
      比賽尚未開始
    */
    const dateBlockIndex = lines.findIndex(line =>
      /\d{4}\/\d{1,2}\/\d{1,2}\s*\(星期/.test(line)
    );

    const block = dateBlockIndex >= 0
      ? lines.slice(dateBlockIndex, dateBlockIndex + 18)
      : lines;

    /*
      比賽編號通常是 3 碼：070
      有些情況可能是 70，所以兩種都接受。
    */
    const gameSnoLine =
      block.find(line => /^\d{3}$/.test(line)) ||
      block.find(line => /^\d{1,3}$/.test(line)) ||
      null;

    /*
      場地時間通常像：
      洲際 18:35
      亞太主 16:05
      大巨蛋 15:05
    */
    let venue = "";
    let time = "";

    const venueTimeLine = block.find(line =>
      /\d{1,2}:\d{2}/.test(line) &&
      !line.includes("/") &&
      !line.includes("年")
    ) || "";

    const venueTimeMatch = venueTimeLine.match(/^(.+?)\s+(\d{1,2}:\d{2})$/);

    if (venueTimeMatch) {
      venue = venueTimeMatch[1].trim();
      time = venueTimeMatch[2].trim();
    }

    /*
      狀態
    */
    const statusLine =
      block.find(line => line.includes("比賽尚未開始")) ||
      block.find(line => line.includes("比賽結束")) ||
      block.find(line => line.includes("比賽終了")) ||
      block.find(line => line.includes("進行中")) ||
      block.find(line => line.includes("延賽")) ||
      block.find(line => line.includes("保留")) ||
      block.find(line => line.includes("取消")) ||
      "";

    /*
      賽程別
      注意頁面有選單，所以這裡目前抓到的通常是頁面中的賽程別文字。
      如果未來要更精準，可再用 DOM class 進一步定位。
    */
    const typeLine =
      lines.find(line => line.includes("一軍例行賽")) ||
      lines.find(line => line.includes("一軍熱身賽")) ||
      lines.find(line => line.includes("一軍總冠軍賽")) ||
      lines.find(line => line.includes("一軍季後挑戰賽")) ||
      lines.find(line => line.includes("一軍明星賽")) ||
      lines.find(line => line.includes("二軍例行賽")) ||
      "";

    return {
      ok: true,
      entryMode,
      entryUrl,
      matchupLine,
      date,
      away,
      home,
      gameSnoText: gameSnoLine,
      venue,
      time,
      statusText: statusLine,
      typeText: typeLine,
      debugBlock: block
    };
  }, TEAM_NAMES, entry.mode, entry.url);
}

/* =========================
   對同一個 gameSno 試雙網址
========================= */
async function fetchMetaByGameSno(page, gameSno) {
  const entries = buildUrls(gameSno);
  const failures = [];

  for (const entry of entries) {
    try {
      const meta = await fetchGameMeta(page, gameSno, entry);

      if (!meta || !meta.ok) {
        failures.push(`${entry.mode}: ${meta?.reason || "無資料"}`);
        continue;
      }

      const displayedSno = normalizeGameSno(meta.gameSnoText);

      /*
        關鍵防呆：
        頁面顯示編號必須跟網址 gameSno 一致。
        否則代表官網導去上一場 / 其他場。
      */
      if (displayedSno != null && displayedSno !== Number(gameSno)) {
        failures.push(`${entry.mode}: 此查詢值導向 gameSno=${displayedSno}`);
        continue;
      }

      /*
        如果頁面沒有顯示 gameSno，但 matchup 有抓到，
        先允許收下，但會在 log 標示。
      */
      return {
        ...meta,
        displayedSno,
        usedUrl: entry.url,
        usedMode: entry.mode
      };

    } catch (err) {
      failures.push(`${entry.mode}: ${err.message}`);
    }
  }

  return {
    ok: false,
    reason: failures.join("｜")
  };
}

/* =========================
   安全 boxscore 空資料
   這一版先不 parse 比分，避免污染未開賽資料
========================= */
function emptyBoxscore() {
  return {
    lineScore: {
      home: [],
      away: []
    },
    totals: {
      home: { R: null, H: null, E: null },
      away: { R: null, H: null, E: null }
    },
    batters: {
      home: [],
      away: []
    },
    pitchers: {
      home: [],
      away: []
    },
    metaExtra: {
      win: null,
      lose: null,
      save: null,
      mvp: null
    }
  };
}

/* =========================
   主程式
========================= */
async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  console.log("📡 掃描 CPBL 官方比賽中心 metadata（雙網址版）...");
  console.log(`範圍：gameSno ${START_GAME_SNO} ~ ${END_GAME_SNO}`);

  const full = [];

  for (let gameSno = START_GAME_SNO; gameSno <= END_GAME_SNO; gameSno++) {
    try {
      console.log("檢查:", gameSno);

      const meta = await fetchMetaByGameSno(page, gameSno);

      if (!meta || !meta.ok) {
        console.log("略過:", gameSno, meta?.reason || "兩種網址都抓不到");
        continue;
      }

      const status = getStatusFromText(meta.statusText);
      const box = emptyBoxscore();

      console.log(
        `✅ ${gameSno}: ${fixDate(meta.date)} ${meta.away} vs ${meta.home} ` +
        `${meta.venue || ""} ${meta.time || ""} ${meta.statusText || getStatusText(status)} ` +
        `[${meta.usedMode}]`
      );

      full.push({
        gameSno: Number(gameSno),

        meta: {
          date: fixDate(meta.date),
          home: meta.home,
          away: meta.away,
          status,
          statusText: meta.statusText || getStatusText(status),
          type: normalizeType(meta.typeText),
          typeText: meta.typeText || "",
          time: meta.time || "",
          venue: meta.venue || "",
          officialUrl: meta.usedUrl,
          urlMode: meta.usedMode,

          win: box.metaExtra.win,
          lose: box.metaExtra.lose,
          save: box.metaExtra.save,
          mvp: box.metaExtra.mvp
        },

        lineScore: box.lineScore,
        totals: box.totals,
        batters: box.batters,
        pitchers: box.pitchers
      });

    } catch (err) {
      console.warn(`⚠️ gameSno ${gameSno} 失敗：${err.message}`);
    }
  }

  const output = path.join(__dirname, "../data/live/live-boxscore.json");

  if (!full.length) {
    console.warn("⚠️ 這次沒有成功資料，為避免清空 live-boxscore.json，不寫檔。");
    await browser.close();
    return;
  }

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(full, null, 2), "utf-8");

  console.log("🔥 成功比賽數:", full.length);
  console.log("💾 已輸出:", output);

  await browser.close();
}

main().catch(err => {
  console.error("❌ 失敗：", err);
  process.exit(1);
});