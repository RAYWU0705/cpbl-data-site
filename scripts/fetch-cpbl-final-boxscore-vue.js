import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import puppeteer from "puppeteer";

/* =========================================================
   Ray's CPBL Data Site
   fetch-cpbl-final-boxscore-vue.js
   v5.4.2-FIRST-TEAM-FINAL-VUE-FORCE-GAMESNO

   目標：
   - 一軍 FINAL boxscore Vue data 旁路偵查
   - 借用二軍 v5.3.4 成功經驗
   - 讀取 data/live/live-boxscore.json 當場次索引
   - 只處理 meta.status = final 的一軍場次
   - 開 CPBL 官方一軍 box 頁 kindCode=A
   - 從 DOM table 抓逐局 / RHE
   - 從 Vue data 抓雙隊打者 / 投手 / 戰況
   - 輸出 data/live/final-boxscore-vue-2026.json
   - 輸出 debug / snapshot
   - 不覆蓋 live-boxscore.json
   - 不接 update-all
========================================================= */

const VERSION = "v5.4.2-FIRST-TEAM-FINAL-VUE-FORCE-GAMESNO";

const YEAR = Number(getArg("--year", "2026"));
const LIMIT = Number(getArg("--limit", "0"));
const GAME_SNO = getArg("--gameSno", "");
const DATE = getArg("--date", "");
const FORCE_TARGET = hasArg("--force") || Boolean(GAME_SNO && DATE);
const DRY_RUN = hasArg("--dry-run");
const WRITE = hasArg("--write") || !DRY_RUN;
const KEEP_BROWSER = hasArg("--keep-browser");
const DEBUG_WRITE = hasArg("--debug-write") || hasArg("--write-debug");

const ROOT = process.cwd();

const LIVE_BOXSCORE_PATH = path.join(ROOT, "data", "live", "live-boxscore.json");
const OUT_PATH = path.join(ROOT, "data", "live", `final-boxscore-vue-${YEAR}.json`);
const DEBUG_PATH = path.join(ROOT, "data", "live", `final-boxscore-vue-${YEAR}.debug.json`);
const SNAPSHOT_PATH = path.join(ROOT, "data", "live", `final-boxscore-vue-${YEAR}.snapshot.json`);

console.log(`🧬 CPBL 一軍 FINAL Boxscore Vue 旁路偵查 ${VERSION}`);
console.log(`年份：${YEAR}`);
console.log(`指定 gameSno：${GAME_SNO || "未指定"}`);
console.log(`指定日期：${DATE || "未指定"}`);
console.log(`force 指定場次：${FORCE_TARGET ? "開啟" : "關閉"}`);
console.log(`limit：${LIMIT || "不限"}`);
console.log(`模式：${DRY_RUN ? "dry-run，不寫正式檔" : "write，會寫入 data/live/final-boxscore-vue"}`);
console.log(`debug-write：${DEBUG_WRITE ? "開啟" : "關閉"}`);
console.log("資料線：first-team final boxscore vue sidepath，不覆蓋 live-boxscore.json");
console.log("======================================");

main().catch(err => {
  console.error("❌ 一軍 FINAL Boxscore Vue 旁路失敗：", err);
  process.exit(1);
});

async function main() {
  const liveGames = await loadLiveBoxscore();
  const normalizedGames = liveGames
    .map(normalizeLiveGame)
    .filter(Boolean);

  let games = [];

  if (FORCE_TARGET) {
    games = normalizedGames
      .filter(g => String(g.gameSno) === String(GAME_SNO))
      .filter(g => g.meta.date === DATE)
      .map(forceAsFinalTarget);

    if (!games.length) {
      console.log("⚠️ force 指定場次模式：live-boxscore 找不到指定場次。");
      console.log("   請確認 --date 與 --gameSno 是否存在於 data/live/live-boxscore.json");
    }
  } else {
    games = normalizedGames
      .filter(g => g.meta.status === "final");

    if (GAME_SNO) {
      games = games.filter(g => String(g.gameSno) === String(GAME_SNO));
    }

    if (DATE) {
      games = games.filter(g => g.meta.date === DATE);
    }
  }

  games = games.sort(sortGames);

  if (LIMIT > 0) {
    games = games.slice(0, LIMIT);
  }

  console.log(`📦 待解析 final 一軍場次：${games.length}`);

  if (!games.length) {
    console.log("⚠️ 沒有符合條件的 final 一軍場次。");
    return;
  }

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
    headless: KEEP_BROWSER ? false : "new",
    executablePath,
    defaultViewport: {
      width: 1440,
      height: 1400
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

  const parsed = [];
  const debug = [];

  try {
    for (const game of games) {
      console.log(`🔎 解析 #${game.gameSno}｜${game.meta.date}｜${game.meta.away} vs ${game.meta.home}`);

      const result = await parseFirstTeamBoxscorePage(page, game);

      parsed.push(result.boxscore);
      debug.push(result.debug);

      const q = result.boxscore.dataQuality || {};

      console.log(
        `   lineScore ${q.lineScore}｜RHE ${q.rhe}｜batters ${q.batters}｜pitchers ${q.pitchers}｜status ${result.boxscore.parseStatus}`
      );
      console.log(
        `   batters ${result.boxscore.batters.away.length}/${result.boxscore.batters.home.length}｜pitchers ${result.boxscore.pitchers.away.length}/${result.boxscore.pitchers.home.length}`
      );
    }
  } finally {
    await browser.close();
  }

  const existingVueGames = DRY_RUN ? [] : await loadExistingVueBoxscores();
  const merged = mergeByGameKey([
    ...existingVueGames,
    ...parsed
  ]).sort(sortGames);
  const currentRunStatusCount = countBy(parsed, g => g.parseStatus || "unknown");
  const statusCount = countBy(merged, g => g.parseStatus || "unknown");

  console.log("======================================");
  console.log(`🎯 本次解析筆數：${parsed.length}`);
  console.log(`🎯 一軍 Vue boxscore 總筆數：${merged.length}`);
  console.log(`📊 本次解析狀態：${JSON.stringify(currentRunStatusCount)}`);
  console.log(`📊 總資料解析狀態：${JSON.stringify(statusCount)}`);

  if (merged.length) {
    console.log("📌 前 3 筆：");
    merged.slice(0, 3).forEach(g => {
      console.log(
        `   ${g.gameSno}｜${g.meta.date}｜${g.meta.away} ${formatScore(g.totals?.away?.R)}:${formatScore(g.totals?.home?.R)} ${g.meta.home}｜${g.parseStatus}｜RHE ${formatRHE(g, "away")} / ${formatRHE(g, "home")}`
      );
    });
  }

  if (DRY_RUN) {
    if (DEBUG_WRITE) {
      await fs.mkdir(path.dirname(DEBUG_PATH), {
        recursive: true
      });

      const meta = makeMeta(merged.length, true);

      await fs.writeFile(
        DEBUG_PATH,
        JSON.stringify({
          meta,
          games: debug
        }, null, 2),
        "utf8"
      );

      await fs.writeFile(
        SNAPSHOT_PATH,
        JSON.stringify({
          meta,
          games: merged.map(toSnapshotRow)
        }, null, 2),
        "utf8"
      );

      console.log(`🧪 dry-run debug 已寫入：${path.relative(ROOT, DEBUG_PATH)}`);
      console.log(`📸 dry-run snapshot 已寫入：${path.relative(ROOT, SNAPSHOT_PATH)}`);
    }

    console.log("🧪 dry-run：未寫入正式 Vue boxscore 檔案。");
    return;
  }

  await fs.mkdir(path.dirname(OUT_PATH), {
    recursive: true
  });

  await backupExistingFile(OUT_PATH);

  const meta = makeMeta(merged.length, false);

  await fs.writeFile(
    OUT_PATH,
    JSON.stringify(merged.map(g => ({
      ...g,
      crawler: {
        version: VERSION,
        generatedAt: meta.generatedAt,
        source: meta.source
      }
    })), null, 2),
    "utf8"
  );

  await fs.writeFile(
    DEBUG_PATH,
    JSON.stringify({
      meta,
      games: debug
    }, null, 2),
    "utf8"
  );

  await fs.writeFile(
    SNAPSHOT_PATH,
    JSON.stringify({
      meta,
      games: merged.map(toSnapshotRow)
    }, null, 2),
    "utf8"
  );

  console.log(`✅ 已寫入：${path.relative(ROOT, OUT_PATH)}`);
  console.log(`🧪 Debug：${path.relative(ROOT, DEBUG_PATH)}`);
  console.log(`📸 Snapshot：${path.relative(ROOT, SNAPSHOT_PATH)}`);
}

async function loadLiveBoxscore() {
  if (!fsSync.existsSync(LIVE_BOXSCORE_PATH)) {
    throw new Error(`找不到 ${path.relative(ROOT, LIVE_BOXSCORE_PATH)}。`);
  }

  const text = await fs.readFile(LIVE_BOXSCORE_PATH, "utf8");
  const data = JSON.parse(text);

  return toArray(data);
}

async function loadExistingVueBoxscores() {
  if (!fsSync.existsSync(OUT_PATH)) {
    return [];
  }

  try {
    const text = await fs.readFile(OUT_PATH, "utf8");
    const data = JSON.parse(text);

    return toArray(data)
      .map(game => normalizeExistingVueGame(game))
      .filter(Boolean);
  } catch (err) {
    console.log(`⚠️ 讀取既有 Vue boxscore 失敗，將只寫入本次解析：${err.message || err}`);
    return [];
  }
}

function normalizeExistingVueGame(game) {
  if (!game || typeof game !== "object") return null;

  return {
    ...game,
    gameSno: Number(game.gameSno),
    meta: {
      ...(game.meta || {}),
      status: normalizeStatus(game.meta?.status || "final", game.meta || {}),
      date: cleanText(game.meta?.date),
      away: cleanText(game.meta?.away),
      home: cleanText(game.meta?.home)
    }
  };
}

function forceAsFinalTarget(game) {
  return {
    ...game,
    gameSno: Number(game.gameSno),
    meta: {
      ...game.meta,
      status: "final",
      statusText: game.meta?.statusText || "force-final-target",
      forcedBy: "date-gameSno"
    }
  };
}

async function parseFirstTeamBoxscorePage(page, game) {
  const url = buildOfficialBoxUrl(game);

  const debug = {
    version: VERSION,
    gameSno: game.gameSno,
    date: game.meta.date,
    away: game.meta.away,
    home: game.meta.home,
    url,
    fetchedAt: new Date().toISOString(),
    ok: false,
    error: "",
    title: "",
    bodySample: "",
    tableMap: {},
    vueBoxscoreSummary: null,
    vueApplied: null,
    extractedState: null
  };

  const boxscore = createBaseBoxscore(game, url);

  try {
    await page.goto(url, {
      waitUntil: "networkidle2"
    });

    await sleep(1000);

    const state = await extractBoxState(page);
    debug.title = state.title;
    debug.bodySample = state.bodyTextSample;
    debug.extractedState = slimStateForDebug(state);

    parseScoreTablesFromState(state, game, boxscore, debug);

    const vueBoxscore = await extractVueBoxscoreData(page, game);
    debug.vueBoxscoreSummary = summarizeVueBoxscore(vueBoxscore);

    applyVueBoxscoreData(boxscore, game, vueBoxscore, debug);

    boxscore.decision = resolveDecisions(boxscore, game);
    boxscore.parseStatus = getParseStatus(boxscore);

    debug.ok = true;
    debug.finalSummary = {
      parseStatus: boxscore.parseStatus,
      lineScore: boxscore.lineScore,
      totals: boxscore.totals,
      batters: {
        away: boxscore.batters.away.length,
        home: boxscore.batters.home.length
      },
      pitchers: {
        away: boxscore.pitchers.away.length,
        home: boxscore.pitchers.home.length
      },
      decision: boxscore.decision
    };

    return {
      boxscore,
      debug
    };
  } catch (err) {
    debug.error = err.message || String(err);
    boxscore.parseStatus = "failed";
    boxscore.error = debug.error;

    return {
      boxscore,
      debug
    };
  }
}

async function extractBoxState(page) {
  return page.evaluate(() => {
    function clean(value) {
      return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function tableToData(table, index) {
      const rows = [...table.querySelectorAll("tr")].map(tr =>
        [...tr.querySelectorAll("th,td")].map(td => clean(td.innerText))
      ).filter(row => row.some(Boolean));

      const caption = clean(table.caption?.innerText || "");

      const nearbyTitle =
        clean(table.closest("section")?.querySelector("h1,h2,h3,h4")?.innerText || "") ||
        clean(table.previousElementSibling?.innerText || "");

      return {
        index,
        caption,
        nearbyTitle,
        rowCount: rows.length,
        maxCols: rows.reduce((max, row) => Math.max(max, row.length), 0),
        text: rows.map(r => r.join(" | ")).join("\n").slice(0, 5000),
        rows
      };
    }

    const tables = [...document.querySelectorAll("table")].map(tableToData);
    const bodyText = clean(document.body?.innerText || "");

    return {
      title: document.title || "",
      bodyTextSample: bodyText.slice(0, 8000),
      tables
    };
  });
}

function slimStateForDebug(state) {
  return {
    title: state.title,
    bodySample: state.bodyTextSample?.slice(0, 1200),
    tables: state.tables.map(t => ({
      index: t.index,
      rowCount: t.rowCount,
      maxCols: t.maxCols,
      header: t.rows[0] || [],
      text: t.text.slice(0, 800),
      rows: t.rows.slice(0, 8)
    }))
  };
}

function parseScoreTablesFromState(state, game, boxscore, debug) {
  const lineTable = findInningLineScoreTable(state.tables);
  const rheTable = findRheTable(state.tables);

  debug.tableMap.lineScoreIndex = lineTable?.index ?? null;
  debug.tableMap.rheIndex = rheTable?.index ?? null;

  if (lineTable) {
    const parsed = parseInningLineScoreTable(lineTable);

    if (parsed.away.length || parsed.home.length) {
      boxscore.lineScore = parsed;
      boxscore.dataQuality.lineScore = "confirmed";
    }
  }

  if (rheTable) {
    const parsed = parseRheTable(rheTable, game);

    if (parsed) {
      boxscore.totals = parsed;
      boxscore.dataQuality.rhe = "confirmed";
      boxscore.dataQuality.score = "confirmed";
    }
  }
}

function findInningLineScoreTable(tables) {
  return tables.find(table => {
    const rows = table.rows || [];

    if (rows.length < 3) return false;

    const header = rows[0] || [];

    const hasInnings =
      header[0] === "1" &&
      header.some(cell => cell === "2") &&
      header.some(cell => cell === "9");

    const noBattingWords = !header.some(cell =>
      /打數|安打|全壘打|打點|得分|打擊率/.test(cell)
    );

    return hasInnings && noBattingWords;
  });
}

function findRheTable(tables) {
  return tables.find(table => {
    const rows = table.rows || [];
    const header = rows[0] || [];

    return rows.length >= 3 &&
      header[0] === "R" &&
      header[1] === "H" &&
      header[2] === "E";
  });
}

function parseInningLineScoreTable(table) {
  const rows = table.rows || [];
  const header = rows[0] || [];
  const awayRow = rows[1] || [];
  const homeRow = rows[2] || [];

  return {
    innings: header.map(v => cleanText(v)),
    away: awayRow.map(toScoreCell),
    home: homeRow.map(toScoreCell)
  };
}

function parseRheTable(table, game) {
  const rows = table.rows || [];
  const awayRow = rows[1] || [];
  const homeRow = rows[2] || [];

  return {
    away: {
      R: toNumberOrNull(awayRow[0]) ?? game.totals?.away?.R ?? null,
      H: toNumberOrNull(awayRow[1]) ?? game.totals?.away?.H ?? null,
      E: toNumberOrNull(awayRow[2]) ?? game.totals?.away?.E ?? null
    },
    home: {
      R: toNumberOrNull(homeRow[0]) ?? game.totals?.home?.R ?? null,
      H: toNumberOrNull(homeRow[1]) ?? game.totals?.home?.H ?? null,
      E: toNumberOrNull(homeRow[2]) ?? game.totals?.home?.E ?? null
    }
  };
}

async function extractVueBoxscoreData(page, game) {
  return page.evaluate(game => {
    function clone(value) {
      try {
        return JSON.parse(JSON.stringify(value || []));
      } catch {
        return [];
      }
    }

    function findVueInstance() {
      const root = document.querySelector("#Center");
      if (root && root.__vue__) return root.__vue__;

      const all = [...document.querySelectorAll("*")];
      const found = all.find(el => el.__vue__);

      return found ? found.__vue__ : null;
    }

    const vm = findVueInstance();

    if (!vm) {
      return {
        ok: false,
        reason: "vue-not-found",
        away: game.meta.away,
        home: game.meta.home
      };
    }

    return {
      ok: true,
      activeTab: vm.activeTab,
      activeSeq: vm.activeSeq,
      curtVisitingHomeType: vm.curtVisitingHomeType,
      curtScoreBoardVisitingHomeType: vm.curtScoreBoardVisitingHomeType,
      away: game.meta.away,
      home: game.meta.home,
      gameDetail: clone(vm.curtGameDetail || {}),
      visitingHitterScores: clone(vm.visitingHitterScores || []),
      homeHitterScores: clone(vm.homeHitterScores || []),
      visitingPitcherScores: clone(vm.visitingPitcherScores || []),
      homePitcherScores: clone(vm.homePitcherScores || []),
      visitingBattleScores: clone(vm.visitingBattleScores || []),
      homeBattleScores: clone(vm.homeBattleScores || []),
      visitingReqInfos: clone(vm.visitingReqInfos || []),
      homeReqInfos: clone(vm.homeReqInfos || []),
      recordSeqs: clone(vm.recordSeqs || []),
      scoreboards: clone(vm.Scoreboards || []),
      gameDetails: clone(vm.GameDetails || []),
      sourceKeys: Object.keys(vm).filter(k => !k.startsWith("_") && !k.startsWith("$")).slice(0, 120)
    };
  }, game);
}

function summarizeVueBoxscore(vueData) {
  if (!vueData || !vueData.ok) {
    return {
      ok: false,
      reason: vueData?.reason || "unknown"
    };
  }

  return {
    ok: true,
    activeTab: vueData.activeTab,
    activeSeq: vueData.activeSeq,
    curtVisitingHomeType: vueData.curtVisitingHomeType,
    hitters: {
      away: vueData.visitingHitterScores?.length || 0,
      home: vueData.homeHitterScores?.length || 0
    },
    pitchers: {
      away: vueData.visitingPitcherScores?.length || 0,
      home: vueData.homePitcherScores?.length || 0
    },
    battle: {
      away: vueData.visitingBattleScores?.length || 0,
      home: vueData.homeBattleScores?.length || 0
    },
    records: vueData.recordSeqs?.length || 0,
    sourceKeys: vueData.sourceKeys || []
  };
}

function applyVueBoxscoreData(boxscore, game, vueData, debug) {
  if (!vueData || !vueData.ok) {
    return;
  }

  const awayBattleMap = makeBattleMap(vueData.visitingBattleScores || []);
  const homeBattleMap = makeBattleMap(vueData.homeBattleScores || []);

  const awayBatters = (vueData.visitingHitterScores || [])
    .map((row, index) => mapVueHitter(row, awayBattleMap, index, "away"))
    .filter(player => player.name);

  const homeBatters = (vueData.homeHitterScores || [])
    .map((row, index) => mapVueHitter(row, homeBattleMap, index, "home"))
    .filter(player => player.name);

  const awayPitchers = (vueData.visitingPitcherScores || [])
    .map((row, index) => mapVuePitcher(row, index, "away"))
    .filter(player => player.name);

  const homePitchers = (vueData.homePitcherScores || [])
    .map((row, index) => mapVuePitcher(row, index, "home"))
    .filter(player => player.name);

  if (awayBatters.length || homeBatters.length) {
    boxscore.batters.away = awayBatters;
    boxscore.batters.home = homeBatters;
    boxscore.dataQuality.batters = awayBatters.length && homeBatters.length
      ? "confirmed"
      : "partial";
  }

  if (awayPitchers.length || homePitchers.length) {
    boxscore.pitchers.away = awayPitchers;
    boxscore.pitchers.home = homePitchers;
    boxscore.dataQuality.pitchers = awayPitchers.length && homePitchers.length
      ? "confirmed"
      : "partial";
  }

  const detail = vueData.gameDetail || {};

  boxscore.meta = {
    ...boxscore.meta,
    duration: formatGameDuringTime(detail.GameDuringTime) || boxscore.meta.duration || "",
    audience: detail.AudienceCnt ?? detail.AudienceCntBackend ?? null,
    umpires: {
      head: detail.HeadUmpire || "",
      first: detail.OneBaseReferee || "",
      second: detail.TwoBaseReferee || "",
      third: detail.TrheeBaseReferee || ""
    },
    gameWinningRbiAcnt: detail.GameWinningRbiAcnt || "",
    mvpAcnt: detail.MvpAcnt || "",
    isLock: detail.IsLock || ""
  };

  debug.vueApplied = {
    batters: {
      away: awayBatters.length,
      home: homeBatters.length
    },
    pitchers: {
      away: awayPitchers.length,
      home: homePitchers.length
    },
    sample: {
      awayBatter: awayBatters[0] || null,
      homeBatter: homeBatters[0] || null,
      awayPitcher: awayPitchers[0] || null,
      homePitcher: homePitchers[0] || null
    }
  };
}

function makeBattleMap(rows) {
  const map = new Map();

  (rows || []).forEach(row => {
    const keys = [
      row.Acnt,
      row.HitterAcnt,
      row.HitterName,
      normalizeName(row.HitterName)
    ].filter(Boolean);

    keys.forEach(key => map.set(String(key), row));
  });

  return map;
}

function mapVueHitter(row, battleMap, index, side) {
  const battle =
    battleMap.get(String(row.HitterAcnt || "")) ||
    battleMap.get(String(row.HitterName || "")) ||
    battleMap.get(normalizeName(row.HitterName || "")) ||
    {};

  const ab = toNumberOrNull(row.HitCnt);
  const h = toNumberOrNull(row.HittingCnt);

  return {
    order: toNumberOrNull(battle.Lineup) || index + 1,
    side,
    name: cleanPlayerName(row.HitterName),
    uniformNo: row.HitterUniformNo || "",
    acnt: row.HitterAcnt || "",
    roleType: row.RoleType || "",
    position: battle.DefendStation || "",
    PA: toNumberOrNull(row.PlateAppearances),
    AB: ab,
    R: toNumberOrNull(row.ScoreCnt),
    H: h,
    RBI: toNumberOrNull(row.RunBattedINCnt),
    "2B": toNumberOrNull(row.TwoBaseHitCnt),
    "3B": toNumberOrNull(row.ThreeBaseHitCnt),
    HR: toNumberOrNull(row.HomeRunCnt),
    TB: toNumberOrNull(row.TotalBases),
    GDP: toNumberOrNull(row.DoublePlayBatCnt),
    BB: toNumberOrNull(row.BasesONBallsCnt),
    IBB: toNumberOrNull(row.IntentionalBasesONBallsCnt),
    HBP: toNumberOrNull(row.HitBYPitchCnt),
    SO: toNumberOrNull(row.StrikeOutCnt),
    SH: toNumberOrNull(row.SacrificeHitCnt),
    SF: toNumberOrNull(row.SacrificeFlyCnt),
    SB: toNumberOrNull(row.StealBaseOKCnt),
    CS: toNumberOrNull(row.StealBaseFailCnt),
    E: toNumberOrNull(row.ErrorCnt),
    LOB: toNumberOrNull(row.Lobs),
    AVG: calcAverage(h, ab),
    gameWinningRbi: Number(row.GameWinningRbiCnt || 0) > 0,
    isMvp: row.IsMvp === "1",
    plays: extractBattlePlays(battle),
    raw: row
  };
}

function mapVuePitcher(row, index, side) {
  const ip = formatIp(row.InningPitchedCnt, row.InningPitchedDiv3Cnt);
  const h = toNumberOrNull(row.HittingCnt);
  const bb = toNumberOrNull(row.BasesONBallsCnt);

  return {
    order: index + 1,
    side,
    name: cleanPlayerName(row.PitcherName),
    uniformNo: row.PitcherUniformNo || "",
    acnt: row.PitcherAcnt || "",
    roleType: row.RoleType || "",
    decision: parseVuePitcherDecision(row),
    IP: ip,
    BF: toNumberOrNull(row.PlateAppearances),
    NP: toNumberOrNull(row.PitchCnt),
    S: toNumberOrNull(row.StrikeCnt),
    B: toNumberOrNull(row.BallCnt),
    H: h,
    HR: toNumberOrNull(row.HomeRunCnt),
    BB: bb,
    IBB: toNumberOrNull(row.IntentionalBasesONBallsCnt),
    HBP: toNumberOrNull(row.HitBYPitchCnt),
    SO: toNumberOrNull(row.StrikeOutCnt),
    WP: toNumberOrNull(row.WildPitchCnt),
    BK: toNumberOrNull(row.BalkCnt),
    R: toNumberOrNull(row.RunCnt),
    ER: toNumberOrNull(row.EarnedRunCnt),
    E: toNumberOrNull(row.ErrorCnt),
    maxSpeed: toNumberOrNull(row.GameHigherSpeedPitch),
    ERA: toNumberOrNull(row.Era),
    WHIP: calcWhip(h, bb, row.InningPitchedCnt, row.InningPitchedDiv3Cnt),
    isMvp: row.IsMvp === "1",
    raw: row
  };
}

function parseVuePitcherDecision(row) {
  if (row.GameResult === "勝") {
    return {
      type: "W",
      text: "勝投",
      record: ""
    };
  }

  if (row.GameResult === "敗") {
    return {
      type: "L",
      text: "敗投",
      record: ""
    };
  }

  if (row.IsSaveOK === "1" || Number(row.SavePointCnt || 0) > 0) {
    return {
      type: "S",
      text: "救援成功",
      record: ""
    };
  }

  if (Number(row.ReliefPointCnt || 0) > 0) {
    return {
      type: "H",
      text: "中繼成功",
      record: ""
    };
  }

  return null;
}

function resolveDecisions(boxscore, game) {
  const pitchers = [
    ...boxscore.pitchers.away,
    ...boxscore.pitchers.home
  ];

  const win = pitchers.find(p => p.decision?.type === "W")?.name ||
    game.meta.win ||
    "";

  const lose = pitchers.find(p => p.decision?.type === "L")?.name ||
    game.meta.lose ||
    "";

  const save = pitchers.find(p => p.decision?.type === "S")?.name ||
    game.meta.save ||
    "";

  const mvp = findMvp(boxscore) || game.meta.mvp || "";

  return {
    win,
    lose,
    save,
    mvp
  };
}

function findMvp(boxscore) {
  const hitters = [
    ...boxscore.batters.away,
    ...boxscore.batters.home
  ];
  const pitchers = [
    ...boxscore.pitchers.away,
    ...boxscore.pitchers.home
  ];

  return hitters.find(p => p.isMvp)?.name ||
    pitchers.find(p => p.isMvp)?.name ||
    "";
}

function getParseStatus(boxscore) {
  const q = boxscore.dataQuality || {};

  if (
    q.lineScore === "confirmed" &&
    q.rhe === "confirmed" &&
    q.batters === "confirmed" &&
    q.pitchers === "confirmed"
  ) {
    return "confirmed";
  }

  if (
    q.lineScore === "confirmed" &&
    q.rhe === "confirmed" &&
    (q.batters === "partial" || q.pitchers === "partial" || q.batters === "confirmed" || q.pitchers === "confirmed")
  ) {
    return "partial";
  }

  if (q.lineScore === "confirmed" && q.rhe === "confirmed") {
    return "score-confirmed";
  }

  return "schedule-only";
}

function createBaseBoxscore(game, url) {
  return {
    gameSno: Number(game.gameSno),
    meta: {
      ...game.meta,
      officialUrl: url,
      type: game.meta.type || "regular",
      typeText: game.meta.typeText || "一軍例行賽",
      status: "final"
    },
    kindCode: "A",
    source: "cpbl-official-first-team-box-vue",
    officialUrl: url,
    totals: cloneJson(game.totals || {
      away: {
        R: null,
        H: null,
        E: null
      },
      home: {
        R: null,
        H: null,
        E: null
      }
    }),
    lineScore: {
      innings: [],
      away: [],
      home: []
    },
    batters: {
      away: [],
      home: []
    },
    pitchers: {
      away: [],
      home: []
    },
    decision: {
      win: game.meta.win || "",
      lose: game.meta.lose || "",
      save: game.meta.save || "",
      mvp: game.meta.mvp || ""
    },
    dataQuality: {
      score: "partial",
      rhe: "debug",
      lineScore: "debug",
      batters: "debug",
      pitchers: "debug",
      decision: "partial",
      source: "first-team-boxscore-vue-recon"
    },
    parseStatus: "base"
  };
}

function normalizeLiveGame(game) {
  if (!game || typeof game !== "object") return null;

  const meta = game.meta || {};

  if (!meta.date || !meta.home || !meta.away || game.gameSno === undefined || game.gameSno === null) {
    return null;
  }

  return {
    ...game,
    gameSno: Number(game.gameSno),
    meta: {
      ...meta,
      status: normalizeStatus(meta.status, meta),
      date: cleanText(meta.date),
      home: cleanText(meta.home),
      away: cleanText(meta.away),
      officialUrl: cleanText(meta.officialUrl),
      type: cleanText(meta.type || "regular"),
      typeText: cleanText(meta.typeText || "一軍例行賽"),
      duration: cleanText(meta.duration),
      win: cleanText(meta.win),
      lose: cleanText(meta.lose),
      save: cleanText(meta.save),
      mvp: cleanText(meta.mvp)
    },
    totals: game.totals || {
      away: {},
      home: {}
    },
    lineScore: game.lineScore || {
      away: [],
      home: []
    }
  };
}

function normalizeStatus(status, meta = {}) {
  const s = String(status || "").toLowerCase();

  if (s === "in_progress" || s === "playing" || s === "live") return "live";
  if (s === "final" || s === "finished") return "final";
  if (s === "postponed") return "postponed";
  if (s === "suspended") return "suspended";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "pregame") return "pregame";
  if (s === "scheduled") return "scheduled";

  const text = `${meta.statusText || ""} ${status || ""}`;

  if (/比賽中|進行中|LIVE/i.test(text)) return "live";
  if (/結束|FINAL|完賽/i.test(text)) return "final";
  if (/延賽/.test(text)) return "postponed";
  if (/保留/.test(text)) return "suspended";
  if (/取消/.test(text)) return "cancelled";

  return "scheduled";
}

function buildOfficialBoxUrl(game) {
  if (game.meta?.officialUrl) return game.meta.officialUrl;

  return `https://www.cpbl.com.tw/box/index?year=${YEAR}&kindCode=A&gameSno=${encodeURIComponent(game.gameSno)}`;
}

function extractBattlePlays(battle) {
  return Object.keys(battle || {})
    .filter(key => /^s\d+r\d+$/i.test(key))
    .sort((a, b) => {
      const ma = a.match(/^s(\d+)r(\d+)$/i);
      const mb = b.match(/^s(\d+)r(\d+)$/i);

      const ia = Number(ma?.[1] || 0);
      const ib = Number(mb?.[1] || 0);
      const ra = Number(ma?.[2] || 0);
      const rb = Number(mb?.[2] || 0);

      return ia - ib || ra - rb;
    })
    .map(key => ({
      inning: Number(key.match(/^s(\d+)r/i)?.[1] || 0),
      round: Number(key.match(/r(\d+)$/i)?.[1] || 0),
      result: battle[key]
    }))
    .filter(play => play.result);
}

function formatIp(outs, thirds) {
  const whole = Number(outs || 0);
  const div3 = Number(thirds || 0);

  if (!div3) return String(whole);

  return `${whole}.${div3}`;
}

function calcAverage(h, ab) {
  const hits = Number(h);
  const atBats = Number(ab);

  if (!Number.isFinite(hits) || !Number.isFinite(atBats) || atBats <= 0) {
    return null;
  }

  return (hits / atBats).toFixed(3).replace(/^0/, "");
}

function calcWhip(h, bb, ipWhole, ipDiv3) {
  const hits = Number(h || 0);
  const walks = Number(bb || 0);
  const outs = Number(ipWhole || 0) * 3 + Number(ipDiv3 || 0);

  if (!Number.isFinite(outs) || outs <= 0) return null;

  const innings = outs / 3;

  return ((hits + walks) / innings).toFixed(2);
}

function normalizeName(value) {
  return cleanText(value).replace(/[◎*]/g, "").trim();
}

function cleanPlayerName(value) {
  return normalizeName(value);
}

function toSnapshotRow(game) {
  return {
    gameSno: game.gameSno,
    date: game.meta?.date,
    away: game.meta?.away,
    home: game.meta?.home,
    venue: game.meta?.venue,
    parseStatus: game.parseStatus,
    score: {
      away: game.totals?.away?.R ?? null,
      home: game.totals?.home?.R ?? null
    },
    rhe: {
      away: {
        H: game.totals?.away?.H ?? null,
        E: game.totals?.away?.E ?? null
      },
      home: {
        H: game.totals?.home?.H ?? null,
        E: game.totals?.home?.E ?? null
      }
    },
    lineScoreLength: {
      away: game.lineScore?.away?.length || 0,
      home: game.lineScore?.home?.length || 0
    },
    batters: {
      away: game.batters?.away?.length || 0,
      home: game.batters?.home?.length || 0
    },
    pitchers: {
      away: game.pitchers?.away?.length || 0,
      home: game.pitchers?.home?.length || 0
    },
    decision: game.decision,
    officialUrl: game.officialUrl
  };
}

function makeMeta(total, dryRun) {
  return {
    version: VERSION,
    year: YEAR,
    generatedAt: new Date().toISOString(),
    total,
    source: "cpbl-official-first-team-box-vue",
    dryRun,
    dataFlow: {
      lane: "first-team-final-boxscore-vue-sidepath",
      readFrom: "data/live/live-boxscore.json",
      forceTarget: FORCE_TARGET,
      writeTarget: `data/live/final-boxscore-vue-${YEAR}.json`,
      doesNotTouch: [
        "data/live/live-boxscore.json",
        "scripts/update-all.js",
        "一軍 Match Center 主流程"
      ]
    }
  };
}

function mergeByGameKey(games) {
  const map = new Map();

  games.forEach(game => {
    const key = [
      game.kindCode || "A",
      game.gameSno || "",
      game.meta?.date || "",
      game.meta?.away || "",
      game.meta?.home || ""
    ].join("|");

    map.set(key, {
      ...map.get(key),
      ...game
    });
  });

  return [...map.values()];
}

function sortGames(a, b) {
  const ad = a.meta?.date || a.date || "";
  const bd = b.meta?.date || b.date || "";

  const d = String(ad).localeCompare(String(bd));
  if (d !== 0) return d;

  return Number(a.gameSno || 0) - Number(b.gameSno || 0);
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

function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.games)) return data.games;
  if (Array.isArray(data?.data)) return data.data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toScoreCell(value) {
  const s = cleanText(value);

  if (!s) return null;
  if (s.toUpperCase() === "X") return "X";

  return toNumberOrNull(s) ?? s;
}

function formatScore(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatRHE(game, side) {
  const t = game.totals?.[side] || {};
  return `${formatScore(t.R)}-${formatScore(t.H)}-${formatScore(t.E)}`;
}

function formatGameDuringTime(value) {
  const s = cleanText(value);

  if (!s) return "";

  if (/^\d{6}$/.test(s)) {
    const hh = Number(s.slice(0, 2));
    const mm = Number(s.slice(2, 4));

    return `${hh}H${String(mm).padStart(2, "0")}M`;
  }

  return s;
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
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    "-",
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0")
  ].join("");
}
