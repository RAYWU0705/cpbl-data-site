import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SEASON_YEAR = 2026;
const KIND_CODE = "A";

// 3～9 月一軍例行賽
const MONTHS = [3, 4, 5, 6, 7, 8, 9];

const TEAM_NAMES = [
  "中信兄弟",
  "統一7-ELEVEn獅",
  "樂天桃猿",
  "富邦悍將",
  "味全龍",
  "台鋼雄鷹"
];
const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

async function fileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function getChromeExecutablePath() {
  for (const chromePath of CHROME_PATHS) {
    if (await fileExists(chromePath)) {
      return chromePath;
    }
  }

  return null;
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "../data/live/live-boxscore.json");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function buildOfficialUrl(gameSno) {
  return `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`;
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

function getStatusFromSchedule(g) {
  if (
    typeof g.awayScore === "number" &&
    typeof g.homeScore === "number"
  ) {
    return "final";
  }

  const statusText = String(g.statusText || "");
  const time = String(g.time || "");
  const duration = String(g.duration || "");
  const rawTime = String(g.rawTime || "");

  if (
    statusText.includes("延賽") ||
    time.includes("時間未定") ||
    duration.includes("時間未定") ||
    rawTime.includes("時間未定") ||
    rawTime.includes("延賽")
  ) {
    return "postponed";
  }

  if (statusText.includes("保留")) return "suspended";
  if (statusText.includes("取消")) return "cancelled";

  return "scheduled";
}

function getStatusText(status) {
  if (status === "final") return "比賽結束";
  if (status === "postponed") return "延賽";
  if (status === "suspended") return "保留比賽";
  if (status === "cancelled") return "取消";
  if (status === "live") return "LIVE";
  return "比賽尚未開始";
}

function parseDecisionLine(line = "") {
  const result = {
    win: null,
    lose: null,
    save: null,
    mvp: null
  };

  if (!line) return result;

  const winMatch = line.match(/勝投[:：]\s*([^\s]+)/);
  const loseMatch = line.match(/敗投[:：]\s*([^\s]+)/);

  const saveMatch =
    line.match(/救援成功[:：]\s*([^\s]+)/) ||
    line.match(/救援[:：]\s*([^\s]+)/);

  const mvpMatch = line.match(/MVP[:：]\s*(.+)$/i);

  result.win = winMatch?.[1] || null;
  result.lose = loseMatch?.[1] || null;
  result.save = saveMatch?.[1] || null;
  result.mvp = mvpMatch?.[1]?.trim() || null;

  return result;
}

async function readExistingGames() {
  try {
    const text = await fs.readFile(DATA_FILE, "utf-8");
    const data = JSON.parse(text);

    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") return Object.values(data);

    return [];
  } catch {
    return [];
  }
}

async function writeGames(games) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(games, null, 2), "utf-8");
}

async function setupPage(browser) {
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  return page;
}

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
    }
  };
}

function createGameFromSchedule(g) {
  const empty = emptyBoxscore();

  const status = getStatusFromSchedule(g);
  const decisions = parseDecisionLine(g.decisionLine);

  return {
    gameSno: Number(g.gameSno),

    meta: {
      date: g.date,
      home: g.home,
      away: g.away,
      status,
      statusText: getStatusText(status),
      type: normalizeType("一軍例行賽"),
      typeText: "一軍例行賽",
      time: g.time || "",
      duration: g.duration || "",
      venue: g.venue || "",
      officialUrl: buildOfficialUrl(g.gameSno),
      urlMode: "schedule",

      win: decisions.win,
      lose: decisions.lose,
      save: decisions.save,
      mvp: decisions.mvp
    },

    lineScore: empty.lineScore,

    totals: status === "final"
      ? {
          away: { R: g.awayScore, H: null, E: null },
          home: { R: g.homeScore, H: null, E: null }
        }
      : empty.totals,

    batters: empty.batters,
    pitchers: empty.pitchers
  };
}

function mergeScheduleScore(oldGame, g) {
  const oldMeta = oldGame.meta || {};
  const oldTotals = oldGame.totals || {};
  const oldLineScore = oldGame.lineScore || { home: [], away: [] };
  const oldBatters = oldGame.batters || { home: [], away: [] };
  const oldPitchers = oldGame.pitchers || { home: [], away: [] };

  const status = getStatusFromSchedule(g);
  const decisions = parseDecisionLine(g.decisionLine);

  const isFinal =
    typeof g.awayScore === "number" &&
    typeof g.homeScore === "number";

  return {
    ...oldGame,

    gameSno: Number(oldGame.gameSno ?? g.gameSno),

    meta: {
      ...oldMeta,

      date: g.date || oldMeta.date,
      home: g.home || oldMeta.home,
      away: g.away || oldMeta.away,

      status,
      statusText: getStatusText(status),

      type: oldMeta.type || "regular",
      typeText: oldMeta.typeText || "一軍例行賽",

      // 不保留舊 time，避免延賽被舊的時間蓋掉
      time: g.time || "",
      duration: g.duration || "",
      venue: g.venue || oldMeta.venue || "",

      officialUrl: oldMeta.officialUrl || buildOfficialUrl(g.gameSno),
      urlMode: oldMeta.urlMode || "schedule",

      win: decisions.win ?? oldMeta.win ?? null,
      lose: decisions.lose ?? oldMeta.lose ?? null,
      save: decisions.save ?? oldMeta.save ?? null,
      mvp: decisions.mvp ?? oldMeta.mvp ?? null
    },

    lineScore: oldLineScore,

    totals: isFinal
      ? {
          away: {
            R: g.awayScore,
            H: oldTotals.away?.H ?? null,
            E: oldTotals.away?.E ?? null
          },
          home: {
            R: g.homeScore,
            H: oldTotals.home?.H ?? null,
            E: oldTotals.home?.E ?? null
          }
        }
      : oldTotals,

    batters: oldBatters,
    pitchers: oldPitchers
  };
}

/* =========================
   操作官方下拉選單
   select[0] = 賽程別
   select[1] = 年份
   select[2] = 月份，value = 月份 - 1
   select[3] = 場地
========================= */
async function setScheduleFilters(page, month) {
  const monthValue = String(month - 1);

  console.log(`🔧 切換官方頁面：kind=${KIND_CODE} year=${SEASON_YEAR} month=${month}`);

  await page.evaluate(
    ({ KIND_CODE, SEASON_YEAR, monthValue }) => {
      const selects = Array.from(document.querySelectorAll("select"));

      const kindSelect = selects[0];
      const yearSelect = selects[1];
      const monthSelect = selects[2];
      const venueSelect = selects[3];

      if (kindSelect) {
        kindSelect.value = KIND_CODE;
        kindSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (yearSelect) {
        yearSelect.value = String(SEASON_YEAR);
        yearSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (monthSelect) {
        monthSelect.value = monthValue;
        monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (venueSelect) {
        venueSelect.value = "";
        venueSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    {
      KIND_CODE,
      SEASON_YEAR,
      monthValue
    }
  );

  await sleep(2500);

  await page.waitForFunction(
    ({ SEASON_YEAR, month }) => {
      const text = document.body?.innerText || "";
      return text.includes(`${SEASON_YEAR} / ${String(month).padStart(2, "0")}`);
    },
    {
      timeout: 10000
    },
    {
      SEASON_YEAR,
      month
    }
  ).catch(() => {
    console.warn(`⚠️ 等待 ${SEASON_YEAR}/${pad2(month)} 標題超時，仍繼續解析`);
  });

  await sleep(1200);
}

/* =========================
   從目前畫面解析指定月份
========================= */
async function parseCurrentSchedulePage(page, targetMonth) {
  return await page.evaluate(
    (TEAM_NAMES, SEASON_YEAR, targetMonth) => {
      const text = document.body?.innerText || "";

      const lines = text
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean);

      const teamPattern = TEAM_NAMES
        .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");

      const result = [];

      let currentDate = null;

      function isTimeLike(s) {
        return /^\d{1,2}:\d{2}$/.test(String(s || ""));
      }

      function isDurationLike(s) {
        return /^\d+H\d+M$/i.test(String(s || ""));
      }

      function isPostponedLike(s) {
        const value = String(s || "");
        return value.includes("時間未定") || value.includes("延賽");
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 日期格式：5/2(六)
        const dateMatch = line.match(/^(\d{1,2})\/(\d{1,2})\(.+?\)$/);

        if (dateMatch) {
          const mm = Number(dateMatch[1]);
          const dd = Number(dateMatch[2]);

          currentDate = `${SEASON_YEAR}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
          continue;
        }

        if (!currentDate) continue;

        // 避免切換失敗時，把其他月份資料收進來
        const currentMonth = Number(currentDate.slice(5, 7));
        if (currentMonth !== Number(targetMonth)) continue;

        // 場次編號，例如 57
        if (!/^\d{1,3}$/.test(line)) {
          continue;
        }

        const gameSno = Number(line);

        const matchupLine = lines[i + 1] || "";
        const lineA = lines[i + 2] || "";
        const lineB = lines[i + 3] || "";
        const lineC = lines[i + 4] || "";

        let away = "";
        let home = "";
        let awayScore = null;
        let homeScore = null;
        let statusText = "比賽尚未開始";
        let time = "";
        let duration = "";
        let venue = "";
        let decisionLine = "";

        // 已結束：樂天桃猿 2 : 9 統一7-ELEVEn獅
        const scoreMatch = matchupLine.match(
          new RegExp(`^(${teamPattern})\\s+(\\d+)\\s*:\\s*(\\d+)\\s+(${teamPattern})$`)
        );

        // 未開賽 / 延賽：樂天桃猿  VS.  統一7-ELEVEn獅
        const vsMatch = matchupLine.match(
          new RegExp(`^(${teamPattern})\\s+VS\\.?\\s+(${teamPattern})$`, "i")
        );

        if (scoreMatch) {
          away = scoreMatch[1];
          awayScore = Number(scoreMatch[2]);
          homeScore = Number(scoreMatch[3]);
          home = scoreMatch[4];
          statusText = "比賽結束";

          venue = lineA;

          if (isDurationLike(lineB)) {
            duration = lineB;
            decisionLine = lineC;
          } else {
            decisionLine = lineB;
          }

        } else if (vsMatch) {
          away = vsMatch[1];
          home = vsMatch[2];

          // 一般未開賽：
          // matchupLine
          // venue
          // 18:35
          //
          // 延賽可能：
          // matchupLine
          // 時間未定
          // venue
          // 或
          // matchupLine
          // venue
          // 時間未定

          if (isPostponedLike(lineA) || isPostponedLike(lineB)) {
            statusText = "延賽";
            time = "時間未定";

            if (isPostponedLike(lineA)) {
              venue = lineB || "";
            } else {
              venue = lineA || "";
            }

          } else {
            statusText = "比賽尚未開始";

            if (isTimeLike(lineA)) {
              time = lineA;
              venue = lineB || "";
            } else {
              venue = lineA || "";

              if (isTimeLike(lineB)) {
                time = lineB;
              }
            }
          }

        } else {
          continue;
        }

        result.push({
          gameSno,
          date: currentDate,
          away,
          home,
          awayScore,
          homeScore,
          venue,
          time,
          duration,
          rawTime: `${lineA} ${lineB}`.trim(),
          statusText,
          decisionLine
        });
      }

      return {
        titleText: lines.find(line => /^\d{4}\s*\/\s*\d{2}$/.test(line)) || "",
        games: result
      };
    },
    TEAM_NAMES,
    SEASON_YEAR,
    targetMonth
  );
}

/* =========================
   抓指定月份
========================= */
async function fetchMonthScheduleScores(page, month) {
  await setScheduleFilters(page, month);

  const parsed = await parseCurrentSchedulePage(page, month);

  console.log(`📌 畫面月份標題：${parsed.titleText || "未偵測到"}`);

  return parsed.games;
}

/* =========================
   主程式
========================= */
async function main() {
  const games = await readExistingGames();

  console.log("📊 從官方賽程頁補比分 / 勝敗投 / MVP");
  console.log("原本場次：", games.length);

  const updatedMap = new Map(
    games.map(g => [Number(g.gameSno), g])
  );

  const executablePath = await getChromeExecutablePath();

  const launchOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  console.log("Chrome:", executablePath || "puppeteer default");

  const browser = await puppeteer.launch(launchOptions);

  const page = await setupPage(browser);

  await page.goto("https://www.cpbl.com.tw/schedule", {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(3000);

  let totalFound = 0;
  let totalFinal = 0;
  let totalAdded = 0;
  let totalUpdated = 0;

  for (const month of MONTHS) {
    console.log(`🌐 抓官方賽程頁：${SEASON_YEAR}/${pad2(month)}`);

    const monthGames = await fetchMonthScheduleScores(page, month);

    console.log(`✅ ${SEASON_YEAR}/${pad2(month)} 解析到 ${monthGames.length} 場`);

    totalFound += monthGames.length;

    for (const g of monthGames) {
      const gameSno = Number(g.gameSno);

      const isFinal =
        typeof g.awayScore === "number" &&
        typeof g.homeScore === "number";

      if (isFinal) totalFinal++;

      const oldGame = updatedMap.get(gameSno);

      if (oldGame) {
        updatedMap.set(gameSno, mergeScheduleScore(oldGame, g));
        totalUpdated++;
      } else {
        updatedMap.set(gameSno, createGameFromSchedule(g));
        totalAdded++;
        console.log(`➕ 新增：${gameSno} ${g.date} ${g.away} vs ${g.home}`);
      }
    }
  }

  await page.close();
  await browser.close();

  const result = [...updatedMap.values()]
    .sort((a, b) => {
      const da = a.meta?.date || "9999-12-31";
      const db = b.meta?.date || "9999-12-31";

      if (da !== db) return da.localeCompare(db);

      return Number(a.gameSno || 0) - Number(b.gameSno || 0);
    });

  await writeGames(result);

  console.log("==============");
  console.log("📦 賽程頁比分補強完成");
  console.log("官方賽程解析總場次：", totalFound);
  console.log("已結束比分場次：", totalFinal);
  console.log("新增場次：", totalAdded);
  console.log("更新場次：", totalUpdated);
  console.log("最後總場次：", result.length);
}

main().catch(err => {
  console.error("❌ 失敗：", err);
  process.exit(1);
});