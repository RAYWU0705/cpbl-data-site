import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, "..");

const LIVE_BOX_FILE = path.join(ROOT_DIR, "data/live/live-boxscore.json");
const PROBABLE_FILE = path.join(ROOT_DIR, "data/live/probable-pitchers.json");
const OUTPUT_FILE = path.join(ROOT_DIR, "data/live/league-news.json");

const MAX_ITEMS = 12;

/* =========================
   日期工具
========================= */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getTodayTaipei() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;

  return `${y}-${m}-${d}`;
}

function addDays(dateText, days) {
  const [y, m, d] = String(dateText).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getTargetDate() {
  const dateArg = process.argv.find(arg => arg.startsWith("--date="));

  if (dateArg) {
    const value = dateArg.replace("--date=", "").trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    console.log(`⚠️ --date 格式錯誤，改用今日：${value}`);
  }

  return getTodayTaipei();
}

/* =========================
   檔案工具
========================= */

async function readJsonFile(filepath, fallback) {
  try {
    const text = await fs.readFile(filepath, "utf-8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filepath, data) {
  await fs.mkdir(path.dirname(filepath), {
    recursive: true
  });

  await fs.writeFile(
    filepath,
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

function toArray(data) {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    return Object.values(data);
  }

  return [];
}

/* =========================
   基礎格式
========================= */

function cleanText(v) {
  return String(v || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function valueOrNull(v) {
  if (v === null || v === undefined || v === "") return null;

  const n = Number(v);

  return Number.isFinite(n) ? n : null;
}

function getMeta(game) {
  return game?.meta || {};
}

function getGameSno(game) {
  return Number(game?.gameSno || 0);
}

function getDate(game) {
  return cleanText(getMeta(game).date);
}

function getAway(game) {
  return cleanText(getMeta(game).away);
}

function getHome(game) {
  return cleanText(getMeta(game).home);
}

function getVenue(game) {
  return cleanText(getMeta(game).venue);
}

function getTime(game) {
  return cleanText(getMeta(game).time || getMeta(game).duration);
}

function getStatus(game) {
  return cleanText(getMeta(game).status || "scheduled").toLowerCase();
}

function getAwayScore(game) {
  return valueOrNull(game?.totals?.away?.R);
}

function getHomeScore(game) {
  return valueOrNull(game?.totals?.home?.R);
}

function hasScore(game) {
  return getAwayScore(game) !== null && getHomeScore(game) !== null;
}

function formatScore(game) {
  const awayScore = getAwayScore(game);
  const homeScore = getHomeScore(game);

  if (awayScore === null || homeScore === null) {
    return "—：—";
  }

  return `${awayScore}：${homeScore}`;
}

function getWinnerTeam(game) {
  const awayScore = getAwayScore(game);
  const homeScore = getHomeScore(game);

  if (awayScore === null || homeScore === null) return "";

  if (awayScore > homeScore) return getAway(game);
  if (homeScore > awayScore) return getHome(game);

  return "";
}

function getLoserTeam(game) {
  const awayScore = getAwayScore(game);
  const homeScore = getHomeScore(game);

  if (awayScore === null || homeScore === null) return "";

  if (awayScore > homeScore) return getHome(game);
  if (homeScore > awayScore) return getAway(game);

  return "";
}

function getAwayStarter(game, probableMap = {}) {
  const gameSno = String(getGameSno(game));
  const probable = probableMap?.[gameSno] || {};

  return (
    probable.away ||
    game?.pregame?.starters?.away ||
    ""
  );
}

function getHomeStarter(game, probableMap = {}) {
  const gameSno = String(getGameSno(game));
  const probable = probableMap?.[gameSno] || {};

  return (
    probable.home ||
    game?.pregame?.starters?.home ||
    ""
  );
}

function makeItem({
  type,
  tag,
  title,
  desc,
  priority = 50,
  game = null
}) {
  return {
    id: `${type}-${game ? getGameSno(game) : Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    tag,
    title: cleanText(title),
    desc: cleanText(desc),
    priority,
    gameSno: game ? getGameSno(game) : null,
    date: game ? getDate(game) : null,
    away: game ? getAway(game) : null,
    home: game ? getHome(game) : null,
    venue: game ? getVenue(game) : null,
    time: game ? getTime(game) : null,
    status: game ? getStatus(game) : null,
    createdAt: new Date().toISOString()
  };
}

/* =========================
   快訊產生：FINAL
========================= */

function buildFinalItems(games) {
  const items = [];

  const finals = games
    .filter(game => getStatus(game) === "final")
    .filter(hasScore)
    .sort((a, b) => {
      const dateSort = getDate(b).localeCompare(getDate(a));

      if (dateSort !== 0) return dateSort;

      return getGameSno(b) - getGameSno(a);
    });

  for (const game of finals) {
    const away = getAway(game);
    const home = getHome(game);
    const score = formatScore(game);
    const winner = getWinnerTeam(game);
    const loser = getLoserTeam(game);

    const win = cleanText(getMeta(game).win);
    const lose = cleanText(getMeta(game).lose);
    const save = cleanText(getMeta(game).save);
    const mvp = cleanText(getMeta(game).mvp);

    const title = winner
      ? `${winner} ${score} 擊敗 ${loser}`
      : `${away} ${score} ${home} 比賽結束`;

    const descParts = [];

    if (win) descParts.push(`${win}奪勝投`);
    if (lose) descParts.push(`${lose}承擔敗投`);
    if (save) descParts.push(`${save}收下救援成功`);
    if (mvp) descParts.push(`${mvp}獲選單場 MVP`);

    const desc = descParts.length
      ? `${descParts.join("，")}。`
      : `${away} 與 ${home} 完成賽事，終場比分 ${score}。`;

    items.push(makeItem({
      type: "final",
      tag: "FINAL",
      title,
      desc,
      priority: 100,
      game
    }));
  }

  return items;
}

/* =========================
   快訊產生：LIVE
========================= */

function buildLiveItems(games) {
  const items = [];

  const liveGames = games
    .filter(game => getStatus(game) === "live")
    .sort((a, b) => getGameSno(a) - getGameSno(b));

  for (const game of liveGames) {
    const away = getAway(game);
    const home = getHome(game);

    const liveState = game?.liveState || {};

    const inning =
      liveState.inningText ||
      getMeta(game).statusText ||
      "比賽進行中";

    const batter = cleanText(liveState.batter);
    const pitcher = cleanText(liveState.pitcher);

    const descParts = [inning];

    if (batter) descParts.push(`打者 ${batter}`);
    if (pitcher) descParts.push(`投手 ${pitcher}`);

    const title = hasScore(game)
      ? `${away} ${formatScore(game)} ${home} LIVE`
      : `${away} vs ${home} LIVE`;

    items.push(makeItem({
      type: "live",
      tag: "LIVE",
      title,
      desc: descParts.join("｜"),
      priority: 95,
      game
    }));
  }

  return items;
}

/* =========================
   快訊產生：PREGAME / NEXT
========================= */

function buildPregameItems(games, probableMap, targetDate) {
  const items = [];

  const today = targetDate;
  const tomorrow = addDays(today, 1);

  const futureGames = games
    .filter(game => {
      const status = getStatus(game);
      const date = getDate(game);

      return (
        status === "scheduled" &&
        date >= today
      );
    })
    .sort((a, b) => {
      const dateSort = getDate(a).localeCompare(getDate(b));

      if (dateSort !== 0) return dateSort;

      const timeSort = getTime(a).localeCompare(getTime(b));

      if (timeSort !== 0) return timeSort;

      return getGameSno(a) - getGameSno(b);
    });

  const tomorrowGames = futureGames.filter(game => getDate(game) === tomorrow);
  const todayScheduledGames = futureGames.filter(game => getDate(game) === today);

  const focusGames = tomorrowGames.length
    ? tomorrowGames
    : todayScheduledGames.length
      ? todayScheduledGames
      : futureGames.slice(0, 3);

  for (const game of focusGames.slice(0, 4)) {
    const away = getAway(game);
    const home = getHome(game);
    const venue = getVenue(game);
    const time = getTime(game);

    const awayStarter = getAwayStarter(game, probableMap);
    const homeStarter = getHomeStarter(game, probableMap);

    const isTomorrow = getDate(game) === tomorrow;

    let title = "";

    if (awayStarter && homeStarter) {
      title = `${isTomorrow ? "明日" : "賽前"}先發：${away}${awayStarter} 對決 ${home}${homeStarter}`;
    } else {
      title = `${isTomorrow ? "明日" : "下一場"}賽程：${away} vs ${home}`;
    }

    const descParts = [];

    if (venue) descParts.push(venue);
    if (time) descParts.push(time);

    if (awayStarter || homeStarter) {
      descParts.push(`客場先發 ${awayStarter || "—"}`);
      descParts.push(`主場先發 ${homeStarter || "—"}`);
    } else {
      descParts.push("預告先發等待更新");
    }

    items.push(makeItem({
      type: "pregame",
      tag: isTomorrow ? "TOMORROW" : "NEXT",
      title,
      desc: descParts.join("｜"),
      priority: isTomorrow ? 82 : 80,
      game
    }));
  }

  return items;
}

/* =========================
   快訊產生：特殊狀態
========================= */

function buildSpecialStatusItems(games) {
  const items = [];

  const specialGames = games
    .filter(game => {
      const status = getStatus(game);

      return (
        status === "postponed" ||
        status === "suspended" ||
        status === "cancelled"
      );
    })
    .sort((a, b) => {
      const dateSort = getDate(b).localeCompare(getDate(a));

      if (dateSort !== 0) return dateSort;

      return getGameSno(b) - getGameSno(a);
    });

  for (const game of specialGames.slice(0, 5)) {
    const status = getStatus(game);

    const labelMap = {
      postponed: "延賽",
      suspended: "保留比賽",
      cancelled: "取消"
    };

    const tagMap = {
      postponed: "RAIN",
      suspended: "SUSPEND",
      cancelled: "CANCEL"
    };

    const title = `${getAway(game)} vs ${getHome(game)} ${labelMap[status] || "特殊狀態"}`;

    const desc = [
      getDate(game),
      getVenue(game),
      getTime(game)
    ].filter(Boolean).join("｜") || "等待聯盟後續公告。";

    items.push(makeItem({
      type: status,
      tag: tagMap[status] || "NOTICE",
      title,
      desc,
      priority: 90,
      game
    }));
  }

  return items;
}

/* =========================
   快訊產生：資料狀態
========================= */

function buildDataStatusItems(games, probableMap, targetDate) {
  const todayGames = games.filter(game => getDate(game) === targetDate);

  const finalCount = todayGames.filter(game => getStatus(game) === "final").length;
  const liveCount = todayGames.filter(game => getStatus(game) === "live").length;
  const scheduledCount = todayGames.filter(game => getStatus(game) === "scheduled").length;

  const withProbable = games.filter(game => {
    return getAwayStarter(game, probableMap) || getHomeStarter(game, probableMap);
  }).length;

  return [
    makeItem({
      type: "data",
      tag: "DATA",
      title: "資料中心已完成同步",
      desc: `目前載入 ${games.length} 場比賽｜今日 FINAL ${finalCount}｜LIVE ${liveCount}｜未開賽 ${scheduledCount}｜預告先發 ${withProbable} 場。`,
      priority: 40,
      game: null
    })
  ];
}

/* =========================
   組裝
========================= */

function dedupeItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = [
      item.type,
      item.gameSno || "",
      item.title
    ].join("|");

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(item);
  }

  return result;
}

function buildLeagueNews(games, probableMap, targetDate) {
  const items = [
    ...buildLiveItems(games),
    ...buildFinalItems(games),
    ...buildSpecialStatusItems(games),
    ...buildPregameItems(games, probableMap, targetDate),
    ...buildDataStatusItems(games, probableMap, targetDate)
  ];

  const sorted = dedupeItems(items)
    .filter(item => item.title)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;

      const da = b.date || "";
      const db = a.date || "";

      if (da !== db) return da.localeCompare(db);

      return Number(b.gameSno || 0) - Number(a.gameSno || 0);
    })
    .slice(0, MAX_ITEMS);

  const todayGames = games.filter(game => getDate(game) === targetDate);

  return {
    version: "v4.9.2",
    source: "build-league-news",
    updatedAt: new Date().toISOString(),
    targetDate,
    today: targetDate,
    tomorrow: addDays(targetDate, 1),
    summary: {
      totalGames: games.length,
      todayGames: todayGames.length,
      live: todayGames.filter(game => getStatus(game) === "live").length,
      final: todayGames.filter(game => getStatus(game) === "final").length,
      scheduled: todayGames.filter(game => getStatus(game) === "scheduled").length,
      special: todayGames.filter(game => {
        const status = getStatus(game);
        return status === "postponed" || status === "suspended" || status === "cancelled";
      }).length,
      probablePitcherGames: games.filter(game => {
        return getAwayStarter(game, probableMap) || getHomeStarter(game, probableMap);
      }).length
    },
    items: sorted
  };
}

/* =========================
   主程式
========================= */

async function main() {
  const targetDate = getTargetDate();

  console.log("📰 CPBL 聯盟快訊中心資料化...");
  console.log("目標日期：", targetDate);

  const liveData = await readJsonFile(LIVE_BOX_FILE, []);
  const probableData = await readJsonFile(PROBABLE_FILE, {});

  const games = toArray(liveData);

  if (!games.length) {
    console.log("⚠️ live-boxscore.json 沒有資料，仍輸出空 league-news.json");

    await writeJsonFile(OUTPUT_FILE, {
      version: "v4.9.2",
      source: "build-league-news",
      updatedAt: new Date().toISOString(),
      targetDate,
      today: targetDate,
      tomorrow: addDays(targetDate, 1),
      summary: {
        totalGames: 0,
        todayGames: 0,
        live: 0,
        final: 0,
        scheduled: 0,
        special: 0,
        probablePitcherGames: 0
      },
      items: [
        makeItem({
          type: "data",
          tag: "DATA",
          title: "資料尚未載入",
          desc: "live-boxscore.json 目前沒有可用比賽資料。",
          priority: 10
        })
      ]
    });

    return;
  }

  const output = buildLeagueNews(games, probableData || {}, targetDate);

  await writeJsonFile(OUTPUT_FILE, output);

  console.log(`✅ league-news.json 已輸出：${output.items.length} 則快訊`);
  console.log(`輸出：data/live/league-news.json`);

  output.items.forEach((item, index) => {
    console.log(`${index + 1}. [${item.tag}] ${item.title}`);
    console.log(`   ${item.desc}`);
  });
}

main().catch(err => {
  console.error("❌ 聯盟快訊產生失敗：", err);
  process.exit(1);
});