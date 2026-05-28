import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import puppeteer from "puppeteer";

/* =========================================================
   Ray's CPBL Data Site
   fetch-cpbl-farm-schedule-static.js
   v5.2.3-FARM-SCHEDULE-WORKFLOW-STABLE

   定位：
   - 二軍賽程旁路正式穩定版
   - kindCode = D
   - 輸出 data/farm/farm-schedule-2026.json
   - 另輸出 data/farm/farm-schedule-2026.debug.json
   - 不動一軍 live-boxscore.json
   - 不接 update-all
========================================================= */

const VERSION = "v5.2.3-FARM-SCHEDULE-WORKFLOW-STABLE";

const YEAR = Number(getArg("--year", "2026"));
const MONTH_ARG = getArg("--month", "");
const DRY_RUN = hasArg("--dry-run");
const WRITE = hasArg("--write") || !DRY_RUN;
const PRETTY_RAW = hasArg("--pretty-raw");

const ROOT = process.cwd();
const OUT_PATH = path.join(ROOT, "data", "farm", `farm-schedule-${YEAR}.json`);
const DEBUG_PATH = path.join(ROOT, "data", "farm", `farm-schedule-${YEAR}.debug.json`);
const SNAPSHOT_PATH = path.join(ROOT, "data", "farm", `farm-schedule-${YEAR}.snapshot.json`);

const CPBL_SCHEDULE_URL = "https://www.cpbl.com.tw/schedule";

const MONTHS = MONTH_ARG
  ? MONTH_ARG.split(",").map(v => Number(v.trim())).filter(v => v >= 1 && v <= 12)
  : Array.from({ length: 12 }, (_, i) => i + 1);

console.log(`📡 CPBL 二軍賽程旁路更新 ${VERSION}`);
console.log(`年份：${YEAR}`);
console.log(`月份：${MONTHS.join(", ")}`);
console.log(`模式：${DRY_RUN ? "dry-run，不寫檔" : "write，會寫入 data/farm"}`);
console.log("資料線：旁路 farm，不動一軍主流程");
console.log("======================================");

main().catch(err => {
  console.error("❌ 二軍賽程更新失敗：", err);
  process.exit(1);
});

async function main() {
  const executablePath = getBrowserExecutablePath();

  if (!executablePath) {
    throw new Error(
      [
        "找不到可用瀏覽器。",
        "請確認 Chrome 或 Edge 已安裝在以下其中一個位置：",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      ].join("\n")
    );
  }

  console.log(`🧭 使用瀏覽器：${executablePath}`);

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath,
    defaultViewport: {
      width: 1440,
      height: 1200
    },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  const page = await browser.newPage();

  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(45000);

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  const all = [];
  const debugMonths = [];

  try {
    for (const month of MONTHS) {
      console.log(`🔎 爬取二軍 ${YEAR}-${pad2(month)}...`);

      const result = await crawlMonth(page, YEAR, month);

      console.log(
        `   Vue: ${result.vueFound ? "OK" : "NO"}｜raw ${result.rawCount}｜normalized ${result.games.length}`
      );

      const statusCount = countBy(result.games, g => g.status);
      console.log(
        `   狀態：scheduled ${statusCount.scheduled || 0}｜live ${statusCount.live || 0}｜final ${statusCount.final || 0}｜postponed ${statusCount.postponed || 0}｜cancelled ${statusCount.cancelled || 0}`
      );

      all.push(...result.games);
      debugMonths.push({
        year: YEAR,
        month,
        vueFound: result.vueFound,
        rawCount: result.rawCount,
        normalizedCount: result.games.length,
        statusCount,
        sample: result.games.slice(0, 3).map(toDebugSample),
        notes: result.notes
      });
    }
  } finally {
    await browser.close();
  }

  const merged = mergeByKey(all).sort(sortGames);
  const statusCount = countBy(merged, g => g.status);

  const meta = {
    version: VERSION,
    year: YEAR,
    kindCode: "D",
    source: "cpbl-official-schedule",
    sourceUrl: CPBL_SCHEDULE_URL,
    generatedAt: new Date().toISOString(),
    total: merged.length,
    months: MONTHS,
    statusCount,
    dataFlow: {
      lane: "farm-sidepath",
      writeTarget: `data/farm/farm-schedule-${YEAR}.json`,
      doesNotTouch: [
        "data/live/live-boxscore.json",
        "scripts/update-all.js",
        "一軍 PREGAME / LIVE / FINAL 主流程"
      ]
    },
    statusRules: [
      'IsPlayBall === "Y" → live',
      "GameDateTimeE 或 GameDuringTime 有值 → final",
      "0:0 不自動判 final",
      "IsDelay / 延賽 → postponed",
      "IsCancel / 取消 → cancelled"
    ]
  };

  console.log("======================================");
  console.log(`🎯 二軍賽程總筆數：${merged.length}`);
  console.log(
    `📊 狀態統計：scheduled ${statusCount.scheduled || 0}｜live ${statusCount.live || 0}｜final ${statusCount.final || 0}｜postponed ${statusCount.postponed || 0}｜cancelled ${statusCount.cancelled || 0}`
  );

  if (merged.length) {
    console.log("📌 前 5 筆：");
    merged.slice(0, 5).forEach(g => {
      console.log(
        `   ${g.gameSno}｜${g.date} ${g.time || "--:--"}｜${g.away} vs ${g.home}｜${g.venue}｜${g.status}｜${formatScoreLog(g)}`
      );
    });
  } else {
    console.log("⚠️ 沒有抓到資料。先看 debug.json，再調 Vue 欄位或 kindCode。");
  }

  if (DRY_RUN) {
    console.log("🧪 dry-run：未寫入檔案。");
    return;
  }

  await fs.mkdir(path.dirname(OUT_PATH), {
    recursive: true
  });

  await backupExistingFile(OUT_PATH);

  // 主頁面吃陣列格式，避免 farm-schedule.js / farm-match.js 需要再改。
  await fs.writeFile(
    OUT_PATH,
    JSON.stringify(merged.map(game => ({
      ...game,
      crawler: {
        version: VERSION,
        generatedAt: meta.generatedAt,
        source: meta.source
      }
    })), null, 2),
    "utf8"
  );

  // Debug 保留完整 meta + 月份摘要。
  await fs.writeFile(
    DEBUG_PATH,
    JSON.stringify({
      meta,
      months: debugMonths,
      games: merged.map(game => PRETTY_RAW ? game : stripHeavyRawForDebug(game))
    }, null, 2),
    "utf8"
  );

  // Snapshot 是給人類檢查與未來 workflow 對照用。
  await fs.writeFile(
    SNAPSHOT_PATH,
    JSON.stringify({
      meta,
      statusCount,
      games: merged.map(toSnapshotRow)
    }, null, 2),
    "utf8"
  );

  console.log(`✅ 已寫入：${path.relative(ROOT, OUT_PATH)}`);
  console.log(`🧪 Debug：${path.relative(ROOT, DEBUG_PATH)}`);
  console.log(`📸 Snapshot：${path.relative(ROOT, SNAPSHOT_PATH)}`);
}

async function crawlMonth(page, year, month) {
  await page.goto(CPBL_SCHEDULE_URL, {
    waitUntil: "networkidle2"
  });

  await sleep(1000);

  const result = await page.evaluate(async ({ year, month }) => {
    function sleepInPage(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function findVueInstance() {
      const preferred = [
        document.querySelector("#Center"),
        document.querySelector("#app"),
        document.querySelector(".PageContent"),
        document.body
      ].filter(Boolean);

      const stack = [...preferred, ...document.querySelectorAll("*")];
      const seen = new Set();

      for (const node of stack) {
        if (!node || seen.has(node)) continue;
        seen.add(node);

        if (node.__vue__) return node.__vue__;
      }

      return null;
    }

    function collectGameArrays(obj, depth = 0, seen = new Set()) {
      if (!obj || typeof obj !== "object" || depth > 6 || seen.has(obj)) return [];

      seen.add(obj);

      const arrays = [];

      if (Array.isArray(obj)) {
        const looksLikeGames = obj.some(item =>
          item &&
          typeof item === "object" &&
          (
            item.GameSno != null ||
            item.gameSno != null ||
            item.HomeTeamName ||
            item.VisitingTeamName ||
            item.KindCode
          )
        );

        if (looksLikeGames) arrays.push(obj);

        obj.forEach(item => {
          arrays.push(...collectGameArrays(item, depth + 1, seen));
        });

        return arrays;
      }

      Object.keys(obj).forEach(key => {
        const value = obj[key];

        if (
          key.startsWith("$") ||
          key.startsWith("_") ||
          typeof value === "function"
        ) {
          return;
        }

        arrays.push(...collectGameArrays(value, depth + 1, seen));
      });

      return arrays;
    }

    const vm = findVueInstance();

    if (!vm) {
      return {
        vueFound: false,
        raw: [],
        notes: ["找不到 Vue instance"]
      };
    }

    const notes = [];

    try {
      vm.filters ??= {};
      vm.filters.kindCode = "D";

      if (vm.calendar) {
        vm.calendar.year = year;
        vm.calendar.month = month - 1;
      }

      if (typeof vm.getGameDatas === "function") {
        await vm.getGameDatas();
        notes.push("called vm.getGameDatas()");
      } else {
        notes.push("vm.getGameDatas 不存在");
      }

      await sleepInPage(1800);
    } catch (err) {
      notes.push(`設定 Vue filter 失敗：${err.message || err}`);
    }

    const arrays = collectGameArrays(vm);
    const flat = arrays.flat();

    const unique = [];
    const keys = new Set();

    flat.forEach(item => {
      if (!item || typeof item !== "object") return;

      const kindCode = String(item.KindCode || item.kindCode || "");
      const gameSno = item.GameSno ?? item.gameSno ?? "";
      const date = item.GameDate || item.PreExeDate || item.gameDate || "";

      if (kindCode && kindCode !== "D") return;
      if (!gameSno && !item.HomeTeamName && !item.VisitingTeamName) return;

      const key = [
        kindCode || "D",
        gameSno,
        date,
        item.VisitingTeamName || "",
        item.HomeTeamName || ""
      ].join("|");

      if (keys.has(key)) return;

      keys.add(key);
      unique.push(item);
    });

    return {
      vueFound: true,
      raw: unique,
      notes
    };
  }, {
    year,
    month
  });

  const games = (result.raw || [])
    .map(raw => normalizeOfficialFarmGame(raw, year))
    .filter(Boolean)
    .filter(game => {
      if (!game.date) return false;
      return Number(game.date.slice(0, 4)) === year &&
        Number(game.date.slice(5, 7)) === month;
    });

  return {
    vueFound: !!result.vueFound,
    rawCount: result.raw?.length || 0,
    games,
    notes: result.notes || []
  };
}

function normalizeOfficialFarmGame(raw, year) {
  const kindCode = String(raw.KindCode || raw.kindCode || "D");

  if (kindCode && kindCode !== "D") return null;

  const gameSno = raw.GameSno ?? raw.gameSno ?? "";
  const date = normalizeDate(raw.GameDate || raw.PreExeDate || raw.gameDate || "");
  const time = normalizeTime(raw.PreExeDate || raw.GameDate || raw.GameDateTimeS || raw.gameTime || "");

  const away = cleanTeam(raw.VisitingTeamName || raw.away || raw.awayTeam || "");
  const home = cleanTeam(raw.HomeTeamName || raw.home || raw.homeTeam || "");

  if (!away && !home) return null;

  const awayScore = toNumberOrNull(
    raw.VisitingScore ??
    raw.VisitingTotalScore ??
    raw.awayScore ??
    raw.awayR
  );

  const homeScore = toNumberOrNull(
    raw.HomeScore ??
    raw.HomeTotalScore ??
    raw.homeScore ??
    raw.homeR
  );

  const status = normalizeGameStatus(raw);

  return {
    gameSno: String(gameSno || ""),
    officialGameSno: gameSno === "" ? null : Number(gameSno),
    kindCode: "D",
    date,
    time,
    away,
    home,
    venue: cleanText(raw.FieldAbbe || raw.FieldName || raw.venue || ""),
    status,
    awayScore,
    homeScore,
    type: "farm",
    note: cleanText(raw.GameRemark || raw.Remark || raw.StatusNote || ""),
    source: "cpbl-official-schedule",
    officialUrl: gameSno
      ? `https://www.cpbl.com.tw/box/index?gameSno=${encodeURIComponent(gameSno)}&kindCode=D&year=${year}`
      : "",
    statusDebug: {
      IsPlayBall: cleanText(raw.IsPlayBall),
      GameDateTimeS: cleanText(raw.GameDateTimeS),
      GameDateTimeE: cleanText(raw.GameDateTimeE),
      GameDuringTime: cleanText(raw.GameDuringTime),
      PresentStatus: raw.PresentStatus ?? null,
      GameResult: raw.GameResult ?? null
    },
    raw
  };
}

function normalizeGameStatus(raw) {
  const text = [
    raw.GameStatus,
    raw.GameStatusName,
    raw.Status,
    raw.StatusText,
    raw.GameRemark,
    raw.Remark,
    raw.StatusNote,
    raw.GameNote
  ].map(cleanText).join(" ");

  const isPlayBall = cleanText(raw.IsPlayBall);
  const gameDateTimeE = cleanText(raw.GameDateTimeE);
  const gameDuringTime = cleanText(raw.GameDuringTime || raw.Duration || raw.ElapsedTime);

  // ① 特殊狀態優先
  if (raw.IsCancel === true || /取消/.test(text)) return "cancelled";
  if (raw.IsDelay === true || /延賽/.test(text)) return "postponed";
  if (/保留/.test(text)) return "suspended";

  // ② 二軍目前最準：IsPlayBall = Y 代表比賽中
  if (isPlayBall === "Y") return "live";

  // ③ 有結束時間或比賽時間長度，代表已完賽
  if (gameDateTimeE || gameDuringTime) return "final";

  // ④ 文字備援
  if (/比賽中|進行中|LIVE|Live|live|局上|局下/.test(text)) return "live";
  if (/結束|Final|FINAL|完賽|比賽結束/i.test(text)) return "final";

  // ⑤ 只有 0:0 或比分欄位存在，不判 final
  return "scheduled";
}

function mergeByKey(games) {
  const map = new Map();

  games.forEach(game => {
    const key = [
      game.kindCode || "D",
      game.gameSno || "",
      game.date || "",
      game.away || "",
      game.home || ""
    ].join("|");

    map.set(key, {
      ...map.get(key),
      ...game
    });
  });

  return [...map.values()];
}

function sortGames(a, b) {
  const d = String(a.date || "").localeCompare(String(b.date || ""));
  if (d !== 0) return d;

  const t = String(a.time || "99:99").localeCompare(String(b.time || "99:99"));
  if (t !== 0) return t;

  return Number(a.officialGameSno || a.gameSno || 0) - Number(b.officialGameSno || b.gameSno || 0);
}

async function backupExistingFile(filePath) {
  if (!fsSync.existsSync(filePath)) return;

  const backupDir = path.join(path.dirname(filePath), "backup");
  const backupName = `${path.basename(filePath)}.${timestampForFilename()}.bak`;

  await fs.mkdir(backupDir, {
    recursive: true
  });

  await fs.copyFile(filePath, path.join(backupDir, backupName));

  console.log(`🧷 已備份舊檔：${path.relative(ROOT, path.join(backupDir, backupName))}`);
}

function stripHeavyRawForDebug(game) {
  return {
    ...game,
    raw: {
      GameSno: game.raw?.GameSno,
      KindCode: game.raw?.KindCode,
      GameDate: game.raw?.GameDate,
      PreExeDate: game.raw?.PreExeDate,
      VisitingTeamName: game.raw?.VisitingTeamName,
      HomeTeamName: game.raw?.HomeTeamName,
      VisitingScore: game.raw?.VisitingScore,
      HomeScore: game.raw?.HomeScore,
      FieldAbbe: game.raw?.FieldAbbe,
      FieldName: game.raw?.FieldName,
      IsPlayBall: game.raw?.IsPlayBall,
      GameDateTimeS: game.raw?.GameDateTimeS,
      GameDateTimeE: game.raw?.GameDateTimeE,
      GameDuringTime: game.raw?.GameDuringTime,
      PresentStatus: game.raw?.PresentStatus,
      GameResult: game.raw?.GameResult,
      VisitingPitcherName: game.raw?.VisitingPitcherName,
      HomePitcherName: game.raw?.HomePitcherName,
      WinningPitcherName: game.raw?.WinningPitcherName,
      LoserPitcherName: game.raw?.LoserPitcherName,
      CloserName: game.raw?.CloserName
    }
  };
}

function toSnapshotRow(game) {
  return {
    gameSno: game.gameSno,
    date: game.date,
    time: game.time,
    away: game.away,
    home: game.home,
    venue: game.venue,
    status: game.status,
    score: {
      away: game.awayScore,
      home: game.homeScore
    },
    IsPlayBall: game.statusDebug?.IsPlayBall || "",
    GameDateTimeE: game.statusDebug?.GameDateTimeE || "",
    GameDuringTime: game.statusDebug?.GameDuringTime || "",
    officialUrl: game.officialUrl
  };
}

function toDebugSample(game) {
  return {
    gameSno: game.gameSno,
    date: game.date,
    time: game.time,
    away: game.away,
    home: game.home,
    venue: game.venue,
    status: game.status,
    score: `${formatScore(game.awayScore)}:${formatScore(game.homeScore)}`,
    statusDebug: game.statusDebug
  };
}

function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function formatScoreLog(game) {
  if (game.awayScore === null && game.homeScore === null) return "VS";
  if (game.status === "scheduled" && Number(game.awayScore) === 0 && Number(game.homeScore) === 0) return "VS";
  return `${formatScore(game.awayScore)}:${formatScore(game.homeScore)}`;
}

function formatScore(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function normalizeDate(value) {
  if (!value) return "";

  const d = new Date(value);

  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  const s = String(value);
  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);

  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  return "";
}

function normalizeTime(value) {
  if (!value) return "";

  const d = new Date(value);

  if (!Number.isNaN(d.getTime())) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  const s = String(value);
  const m = s.match(/(\d{1,2}):(\d{2})/);

  if (m) return `${pad2(m[1])}:${m[2]}`;

  return "";
}

function cleanTeam(value) {
  const text = cleanText(value)
    .replace("7-ELEVEN", "7-ELEVEn")
    .trim();

  if (!text) return "";

  return /二軍$/.test(text) ? text : `${text}二軍`;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getArg(name, fallback = "") {
  const prefix = `${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));

  if (!found) return fallback;

  return found.slice(prefix.length);
}

function hasArg(name) {
  return process.argv.includes(name);
}

function getBrowserExecutablePath() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];

  return candidates.find(file => {
    try {
      return fsSync.existsSync(file);
    } catch {
      return false;
    }
  });
}

function timestampForFilename() {
  const d = new Date();

  return [
    d.getFullYear(),
    pad2(d.getMonth() + 1),
    pad2(d.getDate()),
    "-",
    pad2(d.getHours()),
    pad2(d.getMinutes()),
    pad2(d.getSeconds())
  ].join("");
}
