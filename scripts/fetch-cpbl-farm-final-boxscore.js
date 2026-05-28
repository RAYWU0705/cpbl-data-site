import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import puppeteer from "puppeteer";

/* =========================================================
   Ray's CPBL Data Site
   fetch-cpbl-farm-final-boxscore.js
   v5.3.4-FARM-FINAL-BOXSCORE-VUE-DATA

   目標：
   - 二軍 FINAL boxscore 解析器第一版修正
   - 依 debug 確認：
     table 1 = 逐局比分
     table 2 = R/H/E
     table 3 = 戰況表
     table 4 = 打者成績
     table 5 = 投手成績
   - 改用官方 Vue data 直接抓雙隊投打成績
   - DOM table 仍保留給逐局比分與 R/H/E
   - 不再依賴主客隊 tab 切換
   - 不碰一軍 live-boxscore.json
   - 不接 update-all
========================================================= */

const VERSION = "v5.3.4-FARM-FINAL-BOXSCORE-VUE-DATA";

const YEAR = Number(getArg("--year", "2026"));
const LIMIT = Number(getArg("--limit", "0"));
const GAME_SNO = getArg("--gameSno", "");
const DATE = getArg("--date", "");
const DRY_RUN = hasArg("--dry-run");
const WRITE = hasArg("--write") || !DRY_RUN;
const KEEP_BROWSER = hasArg("--keep-browser");
const DEBUG_WRITE = hasArg("--debug-write") || hasArg("--write-debug");
const SWITCH_RECON = hasArg("--switch-recon");

const ROOT = process.cwd();

const FARM_SCHEDULE_PATH = path.join(ROOT, "data", "farm", `farm-schedule-${YEAR}.json`);
const OUT_PATH = path.join(ROOT, "data", "farm", `farm-boxscore-${YEAR}.json`);
const DEBUG_PATH = path.join(ROOT, "data", "farm", `farm-boxscore-${YEAR}.debug.json`);
const SNAPSHOT_PATH = path.join(ROOT, "data", "farm", `farm-boxscore-${YEAR}.snapshot.json`);

console.log(`⛏️ CPBL 二軍 FINAL Boxscore 旁路解析 ${VERSION}`);
console.log(`年份：${YEAR}`);
console.log(`指定 gameSno：${GAME_SNO || "未指定"}`);
console.log(`指定日期：${DATE || "未指定"}`);
console.log(`limit：${LIMIT || "不限"}`);
console.log(`模式：${DRY_RUN ? "dry-run，不寫檔" : "write，會寫入 data/farm"}`);
console.log("資料線：farm boxscore sidepath，不動一軍主流程");
console.log(`debug-write：${DEBUG_WRITE ? "開啟" : "關閉"}｜switch-recon：${SWITCH_RECON ? "開啟" : "關閉"}`);
console.log("======================================");

main().catch(err => {
  console.error("❌ 二軍 FINAL Boxscore 旁路失敗：", err);
  process.exit(1);
});

async function main() {
  const schedule = await loadFarmSchedule();

  let games = schedule
    .map(normalizeFarmScheduleGame)
    .filter(Boolean)
    .filter(g => g.status === "final");

  if (GAME_SNO) {
    games = games.filter(g => String(g.gameSno) === String(GAME_SNO));
  }

  if (DATE) {
    games = games.filter(g => g.date === DATE);
  }

  games = games.sort(sortGames);

  if (LIMIT > 0) {
    games = games.slice(0, LIMIT);
  }

  console.log(`📦 待解析 final 二軍場次：${games.length}`);

  if (!games.length) {
    console.log("⚠️ 沒有符合條件的 final 二軍場次。");
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
      console.log(`🔎 解析 #${game.gameSno}｜${game.date}｜${game.away} vs ${game.home}`);

      const result = await parseFarmBoxscorePage(page, game);

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

  const merged = mergeByGameKey(parsed).sort(sortGames);
  const statusCount = countBy(merged, g => g.parseStatus || "unknown");

  console.log("======================================");
  console.log(`🎯 二軍 boxscore 筆數：${merged.length}`);
  console.log(`📊 解析狀態：${JSON.stringify(statusCount)}`);

  if (merged.length) {
    console.log("📌 前 3 筆：");
    merged.slice(0, 3).forEach(g => {
      console.log(
        `   ${g.gameSno}｜${g.date}｜${g.away} ${formatScore(g.totals?.away?.R)}:${formatScore(g.totals?.home?.R)} ${g.home}｜${g.parseStatus}｜RHE ${formatRHE(g, "away")} / ${formatRHE(g, "home")}`
      );
    });
  }

  if (DRY_RUN) {
    if (DEBUG_WRITE) {
      await fs.mkdir(path.dirname(DEBUG_PATH), {
        recursive: true
      });

      const meta = {
        version: VERSION,
        year: YEAR,
        generatedAt: new Date().toISOString(),
        total: merged.length,
        source: "cpbl-official-farm-box",
        dryRun: true,
        switchRecon: SWITCH_RECON,
        dataFlow: {
          lane: "farm-boxscore-sidepath",
          readFrom: `data/farm/farm-schedule-${YEAR}.json`,
          writeTarget: `data/farm/farm-boxscore-${YEAR}.debug.json`,
          doesNotTouch: [
            "data/live/live-boxscore.json",
            "scripts/update-all.js",
            "一軍 Match Center 主流程"
          ]
        }
      };

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

    console.log("🧪 dry-run：未寫入正式 boxscore 檔案。");
    return;
  }

  await fs.mkdir(path.dirname(OUT_PATH), {
    recursive: true
  });

  await backupExistingFile(OUT_PATH);

  const meta = {
    version: VERSION,
    year: YEAR,
    generatedAt: new Date().toISOString(),
    total: merged.length,
    source: "cpbl-official-farm-box",
    dataFlow: {
      lane: "farm-boxscore-sidepath",
      readFrom: `data/farm/farm-schedule-${YEAR}.json`,
      writeTarget: `data/farm/farm-boxscore-${YEAR}.json`,
      doesNotTouch: [
        "data/live/live-boxscore.json",
        "scripts/update-all.js",
        "一軍 Match Center 主流程"
      ]
    }
  };

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

async function loadFarmSchedule() {
  if (!fsSync.existsSync(FARM_SCHEDULE_PATH)) {
    throw new Error(`找不到 ${path.relative(ROOT, FARM_SCHEDULE_PATH)}，請先跑二軍賽程爬蟲。`);
  }

  const text = await fs.readFile(FARM_SCHEDULE_PATH, "utf8");
  const data = JSON.parse(text);

  return toArray(data);
}

async function parseFarmBoxscorePage(page, game) {
  const url = buildOfficialBoxUrl(game);

  const debug = {
    version: VERSION,
    gameSno: game.gameSno,
    date: game.date,
    away: game.away,
    home: game.home,
    url,
    fetchedAt: new Date().toISOString(),
    ok: false,
    error: "",
    title: "",
    bodySample: "",
    extractedStates: [],
    tableMap: {},
    switchAttempts: []
  };

  const boxscore = createBaseBoxscore(game, url);

  try {
    await page.goto(url, {
      waitUntil: "networkidle2"
    });

    await sleep(1000);

    // 第一次通常是客隊表。
    const first = await extractBoxState(page, "initial");
    debug.title = first.title;
    debug.bodySample = first.bodyTextSample;
    debug.extractedStates.push(slimStateForDebug(first));

    if (SWITCH_RECON) {
      debug.switchReconInitial = await extractSwitchRecon(page, game);
    }

    parseScoreTablesFromState(first, game, boxscore, debug);
    parseTeamStatTablesFromState(first, game, boxscore, debug);

    const vueBoxscore = await extractVueBoxscoreData(page, game);
    debug.vueBoxscoreSummary = summarizeVueBoxscore(vueBoxscore);
    applyVueBoxscoreData(boxscore, game, vueBoxscore, debug);

    // v5.3.4 主要改用 Vue data 抓雙隊投打表。
    // 若 Vue data 抓不到雙隊，才保留舊版 tab click 作為 fallback。
    if (hasBothSides(boxscore.batters) && hasBothSides(boxscore.pitchers)) {
      boxscore.decision = resolveDecisions(boxscore, game);
      boxscore.parseStatus = getParseStatus(boxscore);
      debug.ok = true;
      debug.fallbackTabSwitchSkipped = true;
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
    }

    // 嘗試切主隊表 fallback。
    const homeAttempt = await clickTeamTab(page, game.home);
    debug.switchAttempts.push(homeAttempt);

    if (SWITCH_RECON) {
      debug.switchReconAfterHomeAttempt = await extractSwitchRecon(page, game);
    }

    if (homeAttempt.clicked) {
      await sleep(800);
      const homeState = await extractBoxState(page, "after-home-click");
      debug.extractedStates.push(slimStateForDebug(homeState));
      parseTeamStatTablesFromState(homeState, game, boxscore, debug);

      if (SWITCH_RECON) {
        debug.switchReconAfterHomeState = await extractSwitchRecon(page, game);
      }
    }

    // 如果還是沒有主隊，嘗試用隊名去點一次。
    if (!boxscore.batters.home.length && !boxscore.pitchers.home.length) {
      const homeAttempt2 = await clickTeamTab(page, removeFarmSuffix(game.home));
      debug.switchAttempts.push(homeAttempt2);

      if (homeAttempt2.clicked) {
        await sleep(800);
        const homeState2 = await extractBoxState(page, "after-home-short-click");
        debug.extractedStates.push(slimStateForDebug(homeState2));
        parseTeamStatTablesFromState(homeState2, game, boxscore, debug);
      }
    }

    // 再嘗試切回客隊，避免某些頁面第一頁不是客隊。
    if (!boxscore.batters.away.length && !boxscore.pitchers.away.length) {
      const awayAttempt = await clickTeamTab(page, game.away);
      debug.switchAttempts.push(awayAttempt);

      if (awayAttempt.clicked) {
        await sleep(800);
        const awayState = await extractBoxState(page, "after-away-click");
        debug.extractedStates.push(slimStateForDebug(awayState));
        parseTeamStatTablesFromState(awayState, game, boxscore, debug);
      }
    }

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

async function extractBoxState(page, label) {
  return page.evaluate(label => {
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
      label,
      title: document.title || "",
      bodyTextSample: bodyText.slice(0, 8000),
      tables
    };
  }, label);
}

async function extractVueBoxscoreData(page, game) {
  return page.evaluate(game => {
    function clean(value) {
      return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function findVueInstance() {
      const root = document.querySelector("#Center");
      if (root && root.__vue__) return root.__vue__;

      const all = [...document.querySelectorAll("*")];
      const found = all.find(el => el.__vue__);

      return found ? found.__vue__ : null;
    }

    function clone(value) {
      try {
        return JSON.parse(JSON.stringify(value || []));
      } catch {
        return [];
      }
    }

    const vm = findVueInstance();

    if (!vm) {
      return {
        ok: false,
        reason: "vue-not-found",
        away: game.away,
        home: game.home
      };
    }

    return {
      ok: true,
      activeTab: vm.activeTab,
      activeSeq: vm.activeSeq,
      curtVisitingHomeType: vm.curtVisitingHomeType,
      curtScoreBoardVisitingHomeType: vm.curtScoreBoardVisitingHomeType,
      away: game.away,
      home: game.home,
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
    ...(boxscore.meta || {}),
    gameDuringTime: detail.GameDuringTime || "",
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
    ERA: null,
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


async function extractSwitchRecon(page, game) {
  return page.evaluate(game => {
    function clean(value) {
      return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      return rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none";
    }

    function slimEl(el) {
      const rect = el.getBoundingClientRect();

      return {
        tag: el.tagName,
        text: clean(el.innerText || el.textContent || "").slice(0, 160),
        cls: String(el.className || "").slice(0, 160),
        id: String(el.id || ""),
        role: el.getAttribute("role") || "",
        href: el.getAttribute("href") || "",
        data: [...el.attributes]
          .filter(attr => attr.name.startsWith("data-") || attr.name.startsWith("@") || attr.name.startsWith("v-"))
          .slice(0, 12)
          .map(attr => [attr.name, attr.value]),
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          w: Math.round(rect.width),
          h: Math.round(rect.height)
        }
      };
    }

    const away = game.away;
    const home = game.home;
    const awayShort = away.replace(/二軍$/, "");
    const homeShort = home.replace(/二軍$/, "");

    const wantedTexts = new Set([away, home, awayShort, homeShort]);

    const clickable = [...document.querySelectorAll("button,a,li,span,div,td,th,tr,label")]
      .filter(visible)
      .filter(el => {
        const text = clean(el.innerText || el.textContent || "");
        if (!text) return false;

        if (wantedTexts.has(text)) return true;

        if (
          text.includes(awayShort) ||
          text.includes(homeShort) ||
          /打擊成績|投手成績|BATTERS|PITCHERS|戰況表/.test(text)
        ) {
          const rect = el.getBoundingClientRect();
          return rect.top > 0 && rect.top < 1600 && text.length < 500;
        }

        return false;
      })
      .map(slimEl)
      .slice(0, 80);

    const vueRoots = [...document.querySelectorAll("*")]
      .filter(el => el.__vue__)
      .slice(0, 10)
      .map(el => {
        const vm = el.__vue__;
        const keys = Object.keys(vm || {}).filter(k => !k.startsWith("_") && !k.startsWith("$")).slice(0, 80);
        const data = {};
        keys.forEach(k => {
          try {
            const v = vm[k];
            if (typeof v === "function") {
              data[k] = "[Function]";
            } else if (Array.isArray(v)) {
              data[k] = {
                type: "array",
                length: v.length,
                sample: v.slice(0, 2)
              };
            } else if (v && typeof v === "object") {
              data[k] = {
                type: "object",
                keys: Object.keys(v).slice(0, 40)
              };
            } else {
              data[k] = v;
            }
          } catch {
            data[k] = "[Unreadable]";
          }
        });

        return {
          el: slimEl(el),
          keys,
          data
        };
      });

    const bodyAroundTeams = clean(document.body?.innerText || "")
      .split(/(?=戰況表|打擊成績BATTERS|投手成績PITCHERS|SCOREBOARD)/)
      .slice(0, 10)
      .map(s => s.slice(0, 1200));

    return {
      url: location.href,
      away,
      home,
      clickable,
      vueRoots,
      bodyAroundTeams
    };
  }, game);
}


async function clickTeamTab(page, teamName) {
  const direct = await page.evaluate(teamName => {
    function clean(value) {
      return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      return rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.top >= 0 &&
        rect.top <= window.innerHeight * 1.5;
    }

    function score(el) {
      const tag = el.tagName;
      const cls = String(el.className || "");
      const rect = el.getBoundingClientRect();
      let s = 0;

      if (["BUTTON", "A", "LI", "TD", "TH"].includes(tag)) s += 8;
      if (/active|tabs?|team|club|score|switch/i.test(cls)) s += 6;
      if (el.closest("table")) s += 2;
      if (el.closest("nav") || el.closest("footer")) s -= 20;
      if (rect.top < 900) s += 4;
      if (rect.width < 420) s += 2;

      return s;
    }

    const wanted = clean(teamName);
    const shortWanted = wanted.replace(/二軍$/, "");

    const selector = "button,a,li,span,div,td,th,tr,label";
    const candidates = [...document.querySelectorAll(selector)]
      .filter(visible)
      .map(el => ({
        el,
        text: clean(el.innerText || el.textContent || ""),
        tag: el.tagName,
        cls: String(el.className || ""),
        rect: el.getBoundingClientRect()
      }))
      .filter(item => {
        if (!item.text) return false;

        const exact =
          item.text === wanted ||
          item.text === shortWanted;

        if (exact) return true;

        // table 0 / score area sometimes has only two team names separated by linebreak.
        const compact = item.text.replace(/\s+/g, "");
        const wantedCompact = wanted.replace(/\s+/g, "");
        const shortCompact = shortWanted.replace(/\s+/g, "");

        return (
          compact === wantedCompact ||
          compact === shortCompact
        );
      })
      .map(item => ({
        ...item,
        score: score(item.el)
      }))
      .sort((a, b) => b.score - a.score);

    for (const item of candidates) {
      try {
        item.el.scrollIntoView({
          block: "center",
          inline: "center"
        });
        item.el.click();

        return {
          clicked: true,
          method: "dom-direct",
          teamName: wanted,
          clickedText: item.text,
          tag: item.tag,
          cls: item.cls,
          score: item.score
        };
      } catch {
        // try next
      }
    }

    return {
      clicked: false,
      method: "dom-direct",
      teamName: wanted,
      reason: "no-clickable-exact-candidate",
      candidates: candidates.slice(0, 8).map(item => ({
        text: item.text,
        tag: item.tag,
        cls: item.cls,
        score: item.score
      }))
    };
  }, teamName);

  if (direct.clicked) return direct;

  // Fallback：從 score 區附近找到隊名文字座標，用 mouse 點。
  const target = await page.evaluate(teamName => {
    function clean(value) {
      return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      return rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none";
    }

    const wanted = clean(teamName);
    const shortWanted = wanted.replace(/二軍$/, "");

    const all = [...document.querySelectorAll("body *")]
      .filter(visible)
      .map(el => {
        const rect = el.getBoundingClientRect();
        return {
          text: clean(el.innerText || el.textContent || ""),
          tag: el.tagName,
          cls: String(el.className || ""),
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          w: rect.width,
          h: rect.height,
          top: rect.top
        };
      })
      .filter(item =>
        (item.text === wanted || item.text === shortWanted) &&
        item.top > 0 &&
        item.top < 1100 &&
        item.w < 500 &&
        item.h < 120
      )
      .sort((a, b) => a.top - b.top);

    return all[0] || null;
  }, teamName);

  if (target) {
    await page.mouse.click(target.x, target.y);

    return {
      clicked: true,
      method: "mouse-coordinate",
      teamName,
      clickedText: target.text,
      tag: target.tag,
      cls: target.cls,
      x: target.x,
      y: target.y
    };
  }

  return direct;
}

function slimStateForDebug(state) {
  return {
    label: state.label,
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

function parseTeamStatTablesFromState(state, game, boxscore, debug) {
  const battingTables = state.tables.filter(isBattingStatTable);
  const pitchingTables = state.tables.filter(isPitchingStatTable);

  debug.tableMap.battingIndexes ??= [];
  debug.tableMap.pitchingIndexes ??= [];

  battingTables.forEach(table => {
    debug.tableMap.battingIndexes.push(table.index);
    const parsed = parseBattingStatTable(table, game);

    if (!parsed.side || !parsed.rows.length) return;

    boxscore.batters[parsed.side] = dedupeByNameAndRaw([
      ...boxscore.batters[parsed.side],
      ...parsed.rows
    ]);

    if (boxscore.batters[parsed.side].length) {
      boxscore.dataQuality.batters = hasBothSides(boxscore.batters)
        ? "confirmed"
        : "partial";
    }
  });

  pitchingTables.forEach(table => {
    debug.tableMap.pitchingIndexes.push(table.index);
    const parsed = parsePitchingStatTable(table, game);

    if (!parsed.side || !parsed.rows.length) return;

    boxscore.pitchers[parsed.side] = dedupeByNameAndRaw([
      ...boxscore.pitchers[parsed.side],
      ...parsed.rows
    ]);

    if (boxscore.pitchers[parsed.side].length) {
      boxscore.dataQuality.pitchers = hasBothSides(boxscore.pitchers)
        ? "confirmed"
        : "partial";
    }
  });
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
      R: toNumberOrNull(awayRow[0]) ?? game.awayScore,
      H: toNumberOrNull(awayRow[1]),
      E: toNumberOrNull(awayRow[2])
    },
    home: {
      R: toNumberOrNull(homeRow[0]) ?? game.homeScore,
      H: toNumberOrNull(homeRow[1]),
      E: toNumberOrNull(homeRow[2])
    }
  };
}

function isBattingStatTable(table) {
  const header = table.rows?.[0] || [];

  return header.some(cell => cell === "打數") &&
    header.some(cell => cell === "得分") &&
    header.some(cell => cell === "安打") &&
    header.some(cell => cell === "打點") &&
    header.some(cell => cell === "打擊率") &&
    !header.some(cell => cell === "投球局數");
}

function isPitchingStatTable(table) {
  const header = table.rows?.[0] || [];

  return header.some(cell => cell === "投球局數") &&
    header.some(cell => cell === "面對打席") &&
    header.some(cell => cell === "投球數") &&
    header.some(cell => cell === "防禦率");
}

function parseBattingStatTable(table, game) {
  const rows = table.rows || [];
  const header = rows[0] || [];
  const team = cleanText(header[0]);
  const side = guessSideFromTeamName(team, game);
  const dataRows = rows.slice(1);

  const parsedRows = dataRows
    .filter(row => row.some(Boolean))
    .filter(row => !isTotalRow(row[0]))
    .map((row, index) => {
      const identity = parsePlayerIdentity(row[0]);

      return {
        order: identity.order || index + 1,
        name: identity.name,
        position: identity.position,
        mark: identity.mark,
        AB: getByHeader(header, row, "打數"),
        R: getByHeader(header, row, "得分"),
        H: getByHeader(header, row, "安打"),
        RBI: getByHeader(header, row, "打點"),
        "2B": getByHeader(header, row, "二安"),
        "3B": getByHeader(header, row, "三安"),
        HR: getByHeader(header, row, "全壘打"),
        GDP: getByHeader(header, row, "雙殺打"),
        BB: getByHeader(header, row, "四壞"),
        IBB: cleanIntentionalWalk(getByHeader(header, row, "（故四）")),
        HBP: getByHeader(header, row, "死球"),
        SO: getByHeader(header, row, "被三振"),
        SH: getByHeader(header, row, "犧打"),
        SF: getByHeader(header, row, "犧飛"),
        SB: getByHeader(header, row, "盜壘"),
        CS: getByHeader(header, row, "盜壘刺"),
        E: getByHeader(header, row, "失誤"),
        AVG: getByHeader(header, row, "打擊率"),
        raw: rowToObject(header, row)
      };
    })
    .filter(row => row.name);

  return {
    side,
    team,
    rows: parsedRows
  };
}

function parsePitchingStatTable(table, game) {
  const rows = table.rows || [];
  const header = rows[0] || [];
  const team = cleanText(header[0]);
  const side = guessSideFromTeamName(team, game);
  const dataRows = rows.slice(1);

  const parsedRows = dataRows
    .filter(row => row.some(Boolean))
    .filter(row => !isTotalRow(row[0]))
    .map((row, index) => {
      const identity = parsePlayerIdentity(row[0]);

      return {
        order: identity.order || index + 1,
        name: identity.name,
        position: identity.position,
        mark: identity.mark,
        decision: parsePitcherDecision(row[0]),
        IP: getByHeader(header, row, "投球局數"),
        BF: getByHeader(header, row, "面對打席"),
        NP: getByHeader(header, row, "投球數"),
        S: getByHeader(header, row, "好球數"),
        H: getByHeader(header, row, "安打"),
        HR: getByHeader(header, row, "全壘打"),
        BB: getByHeader(header, row, "四壞"),
        IBB: cleanIntentionalWalk(getByHeader(header, row, "（故四）")),
        HBP: getByHeader(header, row, "死球"),
        SO: getByHeader(header, row, "奪三振"),
        WP: getByHeader(header, row, "暴投"),
        BK: getByHeader(header, row, "投手犯規"),
        R: getByHeader(header, row, "失分"),
        ER: getByHeader(header, row, "自責分"),
        E: getByHeader(header, row, "失誤"),
        ERA: getByHeader(header, row, "防禦率"),
        WHIP: getByHeader(header, row, "每局被上壘率"),
        raw: rowToObject(header, row)
      };
    })
    .filter(row => row.name);

  return {
    side,
    team,
    rows: parsedRows
  };
}

function resolveDecisions(boxscore, game) {
  const pitchers = [
    ...boxscore.pitchers.away,
    ...boxscore.pitchers.home
  ];

  const win = pitchers.find(p => p.decision?.type === "W")?.name ||
    game.raw?.WinningPitcherName ||
    game.decision?.win ||
    "";

  const lose = pitchers.find(p => p.decision?.type === "L")?.name ||
    game.raw?.LoserPitcherName ||
    game.decision?.lose ||
    "";

  const save = pitchers.find(p => p.decision?.type === "S")?.name ||
    game.raw?.CloserName ||
    game.decision?.save ||
    "";

  return {
    win,
    lose,
    save,
    mvp: game.raw?.MvpName || game.decision?.mvp || ""
  };
}

function parsePlayerIdentity(value) {
  let raw = cleanText(value);

  const orderMatch = raw.match(/^(\d+)\s+/);
  const order = orderMatch ? Number(orderMatch[1]) : null;

  raw = raw
    .replace(/^\d+\s+/, "")
    .replace(/[◎*]/g, "")
    .trim();

  const decisionText = raw.match(/\([WLSHBS][^)]*\)/g)?.join(" ") || "";
  raw = raw.replace(/\([WLSHBS][^)]*\)/g, "").trim();

  const positionMatch = raw.match(/\s+(\([A-Z0-9/]+\)|[A-Z0-9/]+(?:\([A-Z0-9/]+\))?)$/);
  let position = "";

  if (positionMatch) {
    position = positionMatch[1].replace(/[()]/g, "");
    raw = raw.slice(0, positionMatch.index).trim();
  }

  return {
    order,
    name: raw,
    position,
    mark: decisionText
  };
}

function parsePitcherDecision(value) {
  const text = cleanText(value);
  const m = text.match(/\(([WLSHBS]),?([^)]*)\)/);

  if (!m) return null;

  return {
    type: m[1],
    text: m[0],
    record: cleanText(m[2])
  };
}

function guessSideFromTeamName(team, game) {
  if (sameTeam(team, game.away)) return "away";
  if (sameTeam(team, game.home)) return "home";
  return "";
}

function sameTeam(a, b) {
  return normalizeTeamKey(a) === normalizeTeamKey(b);
}

function normalizeTeamKey(value) {
  return cleanText(value)
    .replace(/二軍/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function hasBothSides(group) {
  return group.away.length > 0 && group.home.length > 0;
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
    gameSno: String(game.gameSno || ""),
    officialGameSno: game.officialGameSno ?? Number(game.gameSno || 0),
    kindCode: "D",
    date: game.date || "",
    time: game.time || "",
    away: game.away || "",
    home: game.home || "",
    venue: game.venue || "",
    status: "final",
    type: "farm-final-boxscore",
    source: "cpbl-official-farm-box",
    officialUrl: url,
    totals: {
      away: {
        R: game.awayScore,
        H: null,
        E: null
      },
      home: {
        R: game.homeScore,
        H: null,
        E: null
      }
    },
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
      win: game.raw?.WinningPitcherName || "",
      lose: game.raw?.LoserPitcherName || "",
      save: game.raw?.CloserName || "",
      mvp: game.raw?.MvpName || ""
    },
    dataQuality: {
      score: "partial",
      rhe: "debug",
      lineScore: "debug",
      batters: "debug",
      pitchers: "debug",
      decision: "partial",
      source: "farm-boxscore-parser"
    },
    parseStatus: "base"
  };
}

function normalizeFarmScheduleGame(game) {
  if (!game || typeof game !== "object") return null;

  const raw = game.raw || {};

  return {
    ...game,
    raw,
    gameSno: String(game.gameSno || raw.GameSno || ""),
    officialGameSno: game.officialGameSno ?? raw.GameSno ?? null,
    date: game.date || normalizeDate(raw.GameDate || raw.PreExeDate || ""),
    time: game.time || normalizeTime(raw.PreExeDate || raw.GameDate || ""),
    away: game.away || addFarmSuffix(raw.VisitingTeamName || ""),
    home: game.home || addFarmSuffix(raw.HomeTeamName || ""),
    venue: game.venue || raw.FieldAbbe || raw.FieldName || "",
    status: game.status || "scheduled",
    awayScore: toNumberOrNull(game.awayScore ?? raw.VisitingScore),
    homeScore: toNumberOrNull(game.homeScore ?? raw.HomeScore),
    officialUrl: game.officialUrl || ""
  };
}

function buildOfficialBoxUrl(game) {
  if (game.officialUrl) return game.officialUrl;

  return `https://www.cpbl.com.tw/box/index?gameSno=${encodeURIComponent(game.gameSno)}&kindCode=D&year=${YEAR}`;
}

function mergeByGameKey(games) {
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

function toSnapshotRow(game) {
  return {
    gameSno: game.gameSno,
    date: game.date,
    time: game.time,
    away: game.away,
    home: game.home,
    venue: game.venue,
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

function removeFarmSuffix(team) {
  return String(team || "").replace(/二軍$/, "").trim();
}

function addFarmSuffix(team) {
  const clean = cleanText(team);

  if (!clean) return "";

  return /二軍$/.test(clean) ? clean : `${clean}二軍`;
}

function getByHeader(header, row, name) {
  const index = header.findIndex(cell => cleanText(cell) === name);
  if (index < 0) return null;

  return normalizeStatValue(row[index]);
}

function normalizeStatValue(value) {
  const s = cleanText(value);

  if (!s) return null;

  const n = Number(s);

  if (Number.isFinite(n)) return n;

  return s;
}

function cleanIntentionalWalk(value) {
  const s = cleanText(value);

  if (!s) return null;

  const m = s.match(/\d+/);

  return m ? Number(m[0]) : s;
}

function rowToObject(header, row) {
  const obj = {};

  row.forEach((value, i) => {
    const key = header[i] || `col${i}`;
    obj[key] = normalizeStatValue(value);
  });

  return obj;
}

function dedupeByNameAndRaw(rows) {
  const map = new Map();

  rows.forEach(row => {
    const key = [
      row.name,
      row.position,
      JSON.stringify(row.raw || {})
    ].join("|");

    map.set(key, row);
  });

  return [...map.values()];
}

function isTotalRow(value) {
  return /^Total|合計|總計$/i.test(cleanText(value));
}

function toScoreCell(value) {
  const s = cleanText(value);

  if (!s) return null;
  if (s.toUpperCase() === "X") return "X";

  return toNumberOrNull(s) ?? s;
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

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatScore(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatRHE(game, side) {
  const t = game.totals?.[side] || {};
  return `${formatScore(t.R)}-${formatScore(t.H)}-${formatScore(t.E)}`;
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
