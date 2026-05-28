import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

/* =========================================================
   Ray's CPBL Data Site
   merge-first-team-final-vue-boxscore.js
   v5.4.2-FIRST-TEAM-FINAL-VUE-MERGE-FORCE-SCHEDULED

   一軍 FINAL Vue boxscore 旁路補強合併：
   - 讀 data/live/live-boxscore.json
   - 讀 data/live/final-boxscore-vue-2026.json
   - 預設只補強 final 場次
   - --force / --include-scheduled-with-vue：若 Vue confirmed，可將 scheduled 場次升級 final
   - 只在找到同場 confirmed Vue boxscore 時補強
   - 不改三大主爬蟲
========================================================= */

const VERSION = "v5.4.2-FIRST-TEAM-FINAL-VUE-MERGE-FORCE-SCHEDULED";
const YEAR = Number(getArg("--year", "2026"));
const DRY_RUN = hasArg("--dry-run");
const WRITE = hasArg("--write") || !DRY_RUN;
const FORCE = hasArg("--force") || hasArg("--include-scheduled-with-vue");

const ROOT = process.cwd();

const LIVE_BOXSCORE_PATH = path.join(ROOT, "data", "live", "live-boxscore.json");
const VUE_BOXSCORE_PATH = path.join(ROOT, "data", "live", `final-boxscore-vue-${YEAR}.json`);
const REPORT_PATH = path.join(ROOT, "data", "live", `final-boxscore-vue-merge-${YEAR}.report.json`);
const BACKUP_DIR = path.join(ROOT, "data", "live", "backups");

console.log(`🧩 CPBL 一軍 FINAL Vue Boxscore 合併 ${VERSION}`);
console.log(`年份：${YEAR}`);
console.log(`模式：${DRY_RUN ? "dry-run，不寫 live-boxscore.json" : "write，會補強 live-boxscore.json"}`);
console.log(`force scheduled merge：${FORCE ? "開啟" : "關閉"}`);
console.log("資料線：final-boxscore-vue → live-boxscore 補強，不改三大主爬蟲");
console.log("======================================");

main().catch(err => {
  console.error("❌ 一軍 FINAL Vue Boxscore 合併失敗：", err);
  process.exit(1);
});

async function main() {
  const liveGames = await readJsonArray(LIVE_BOXSCORE_PATH, "live-boxscore.json");
  const vueGames = await readJsonArray(VUE_BOXSCORE_PATH, `final-boxscore-vue-${YEAR}.json`);
  const vueMap = buildVueMap(vueGames);

  const report = {
    version: VERSION,
    year: YEAR,
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    force: FORCE,
    source: {
      live: path.relative(ROOT, LIVE_BOXSCORE_PATH),
      vue: path.relative(ROOT, VUE_BOXSCORE_PATH)
    },
    counts: {
      liveTotal: liveGames.length,
      vueTotal: vueGames.length,
      liveFinal: 0,
      matched: 0,
      merged: 0,
      skippedNotFinal: 0,
      forcedScheduledToFinal: 0,
      skippedNoVue: 0,
      skippedVueNotConfirmed: 0
    },
    mergedGames: [],
    skippedGames: [],
    warnings: []
  };

  const mergedGames = liveGames.map(game => {
    const status = normalizeStatus(game?.meta?.status || game?.status || "");
    const vue = findVueGame(game, vueMap);

    if (status !== "final") {
      if (!FORCE || !vue) {
        report.counts.skippedNotFinal++;
        if (vue && !FORCE) {
          report.skippedGames.push(makeSkipRow(game, "not-final-use-force-to-merge"));
        }
        return game;
      }

      report.counts.forcedScheduledToFinal++;
    } else {
      report.counts.liveFinal++;
    }

    if (!vue) {
      report.counts.skippedNoVue++;
      report.skippedGames.push(makeSkipRow(game, "no-matching-vue-boxscore"));
      return game;
    }

    report.counts.matched++;

    if ((vue.parseStatus || "") !== "confirmed") {
      report.counts.skippedVueNotConfirmed++;
      report.skippedGames.push(makeSkipRow(game, `vue-parseStatus-${vue.parseStatus || "unknown"}`));
      return game;
    }

    const before = summarizeGame(game);
    const merged = mergeGame(game, vue, { force: FORCE, originalStatus: status });
    const after = summarizeGame(merged);

    report.counts.merged++;
    report.mergedGames.push({
      gameSno: pickGameSno(game),
      date: game?.meta?.date || vue?.meta?.date || "",
      away: game?.meta?.away || vue?.meta?.away || "",
      home: game?.meta?.home || vue?.meta?.home || "",
      before,
      after,
      vueStatus: vue.parseStatus,
      vueCrawler: vue.crawler?.version || vue.source || ""
    });

    return merged;
  });

  validateMergedGames(mergedGames, report);

  console.log(`📦 live-boxscore 總筆數：${report.counts.liveTotal}`);
  console.log(`📦 Vue boxscore 總筆數：${report.counts.vueTotal}`);
  console.log(`🏁 live final 場次：${report.counts.liveFinal}`);
  console.log(`🧲 force scheduled→final：${report.counts.forcedScheduledToFinal}`);
  console.log(`🔗 匹配 Vue 場次：${report.counts.matched}`);
  console.log(`✅ 補強完成：${report.counts.merged}`);
  console.log(`⚠️ 無 Vue 對應：${report.counts.skippedNoVue}`);
  console.log(`⚠️ Vue 非 confirmed：${report.counts.skippedVueNotConfirmed}`);
  console.log(`🧪 warnings：${report.warnings.length}`);

  if (report.mergedGames.length) {
    console.log("📌 前 5 筆補強：");
    report.mergedGames.slice(0, 5).forEach(row => {
      console.log(
        `   ${row.gameSno}｜${row.date}｜${row.away} vs ${row.home}｜` +
        `打者 ${row.after.batters.away}/${row.after.batters.home}｜` +
        `投手 ${row.after.pitchers.away}/${row.after.pitchers.home}｜` +
        `RHE ${formatRHE(row.after, "away")} / ${formatRHE(row.after, "home")}`
      );
    });
  }

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(`🧾 Report：${path.relative(ROOT, REPORT_PATH)}`);

  if (DRY_RUN) {
    console.log("🧪 dry-run：未寫入 live-boxscore.json。");
    return;
  }

  await backupExistingFile(LIVE_BOXSCORE_PATH);

  await fs.writeFile(
    LIVE_BOXSCORE_PATH,
    JSON.stringify(mergedGames, null, 2),
    "utf8"
  );

  console.log(`✅ 已補強寫入：${path.relative(ROOT, LIVE_BOXSCORE_PATH)}`);
}

async function readJsonArray(filePath, label) {
  if (!fsSync.existsSync(filePath)) {
    throw new Error(`找不到 ${path.relative(ROOT, filePath)}，請先建立 ${label}`);
  }

  const text = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(text);
  return toArray(data);
}

function buildVueMap(vueGames) {
  const map = new Map();

  vueGames.forEach(game => {
    getGameKeys(game).forEach(key => {
      if (key) map.set(key, game);
    });
  });

  return map;
}

function findVueGame(game, vueMap) {
  for (const key of getGameKeys(game)) {
    if (vueMap.has(key)) return vueMap.get(key);
  }

  return null;
}

function getGameKeys(game) {
  const gameSno = pickGameSno(game);
  const date = game?.meta?.date || game?.date || "";
  const away = normalizeTeamKey(game?.meta?.away || game?.away || "");
  const home = normalizeTeamKey(game?.meta?.home || game?.home || "");
  const kindCode = game?.kindCode || game?.meta?.kindCode || "A";

  return [
    `${kindCode}|${gameSno}|${date}|${away}|${home}`,
    `${kindCode}|${gameSno}|${date}`,
    `${gameSno}|${date}|${away}|${home}`,
    `${gameSno}|${date}`
  ].filter(key => !key.includes("undefined") && !key.includes("null"));
}

function mergeGame(game, vue, options = {}) {
  const merged = cloneJson(game);

  merged.gameSno = pickGameSno(game) || pickGameSno(vue);

  const oldMeta = merged.meta || {};
  const vueMeta = vue.meta || {};
  const oldStatus = oldMeta.status || "final";
  const forceFinal = Boolean(options.force);
  const nextStatus = forceFinal ? "final" : oldStatus;

  merged.meta = {
    ...oldMeta,
    // 一般模式保留原本狀態；force 模式允許 Vue confirmed 反向升級 scheduled → final
    duration: vueMeta.duration || oldMeta.duration || "",
    audience: vueMeta.audience ?? oldMeta.audience ?? null,
    umpires: vueMeta.umpires || oldMeta.umpires || null,
    status: nextStatus,
    statusBeforeFinalVueMerge: oldStatus,
    finalLock: oldMeta.finalLock ?? true,
    finalLockSource: oldMeta.finalLockSource || (forceFinal ? "final-vue-force-merge" : "fetch-cpbl-final-today"),
    finalVueEnhanced: true,
    finalVueForceMerged: forceFinal,
    finalVueForcedFromStatus: forceFinal ? oldStatus : "",
    finalVueEnhancedAt: new Date().toISOString(),
    finalVueEnhancedVersion: VERSION,
    officialUrl: oldMeta.officialUrl || vue.officialUrl || vueMeta.officialUrl || "",
    win: vue.decision?.win || oldMeta.win || "",
    lose: vue.decision?.lose || oldMeta.lose || "",
    save: vue.decision?.save || oldMeta.save || "",
    mvp: vue.decision?.mvp || oldMeta.mvp || ""
  };

  merged.kindCode = merged.kindCode || "A";
  merged.source = merged.source || "live-boxscore";

  merged.enhancements = [
    ...toArray(merged.enhancements),
    {
      version: VERSION,
      source: "final-boxscore-vue",
      appliedAt: new Date().toISOString(),
      file: `data/live/final-boxscore-vue-${YEAR}.json`
    }
  ];

  if (vue.totals) merged.totals = cloneJson(vue.totals);
  if (vue.lineScore) merged.lineScore = cloneJson(vue.lineScore);

  if (vue.batters) {
    merged.batters = {
      away: cloneJson(vue.batters.away || []),
      home: cloneJson(vue.batters.home || [])
    };
  }

  if (vue.pitchers) {
    merged.pitchers = {
      away: cloneJson(vue.pitchers.away || []),
      home: cloneJson(vue.pitchers.home || [])
    };
  }

  if (vue.decision) {
    merged.decision = cloneJson(vue.decision);
  }

  // 不強制清掉 liveState，避免破壞原本資料相容。
  if (game.liveState !== undefined) merged.liveState = game.liveState;

  merged.dataQuality = buildMergedDataQuality(merged, game, vue);

  return merged;
}

function buildMergedDataQuality(merged, original, vue) {
  const oldQ = original?.dataQuality || {};

  const batterAway = merged?.batters?.away?.length || 0;
  const batterHome = merged?.batters?.home?.length || 0;
  const pitcherAway = merged?.pitchers?.away?.length || 0;
  const pitcherHome = merged?.pitchers?.home?.length || 0;

  const hasRHE =
    Number.isFinite(Number(merged?.totals?.away?.R)) &&
    Number.isFinite(Number(merged?.totals?.home?.R)) &&
    merged?.totals?.away?.H !== null &&
    merged?.totals?.away?.E !== null &&
    merged?.totals?.home?.H !== null &&
    merged?.totals?.home?.E !== null;

  const hasLineScore =
    (merged?.lineScore?.away?.length || 0) > 0 &&
    (merged?.lineScore?.home?.length || 0) > 0;

  return {
    ...oldQ,
    version: VERSION,
    source: "merge-first-team-final-vue-boxscore",
    stage: "final",
    score: hasRHE ? "confirmed" : oldQ.score || "partial",
    rhe: hasRHE ? "confirmed" : oldQ.rhe || "partial",
    lineScore: hasLineScore ? "confirmed" : oldQ.lineScore || "partial",
    batters: batterAway > 0 && batterHome > 0 ? "confirmed" : (batterAway || batterHome ? "partial" : oldQ.batters || "debug"),
    pitchers: pitcherAway > 0 && pitcherHome > 0 ? "confirmed" : (pitcherAway || pitcherHome ? "partial" : oldQ.pitchers || "debug"),
    result: merged?.decision?.win || merged?.meta?.win ? "confirmed" : oldQ.result || "partial",
    finalLock: oldQ.finalLock || "confirmed",
    finalVue: vue?.parseStatus === "confirmed" ? "confirmed" : "partial",
    mode: merged?.meta?.finalVueForceMerged ? "final-vue-boxscore-force-merged" : "final-vue-boxscore-enhanced",
    message: merged?.meta?.finalVueForceMerged
      ? "FINAL Vue force merge：Vue confirmed 時，將 scheduled/live-boxscore 場次升級為 final 並補上完整打者 / 投手 / RHE / 逐局。"
      : "FINAL Vue 旁路補強：保留原本一軍主流程狀態，補上完整打者 / 投手 / RHE / 逐局。",
    updatedAt: new Date().toISOString()
  };
}

function validateMergedGames(games, report) {
  games.forEach(game => {
    if (normalizeStatus(game?.meta?.status) !== "final") return;
    if (!game?.meta?.finalVueEnhanced) return;

    const summary = summarizeGame(game);

    if (!summary.batters.away || !summary.batters.home) {
      report.warnings.push({
        gameSno: pickGameSno(game),
        date: game?.meta?.date || "",
        type: "batters-not-both-sides",
        summary
      });
    }

    if (!summary.pitchers.away || !summary.pitchers.home) {
      report.warnings.push({
        gameSno: pickGameSno(game),
        date: game?.meta?.date || "",
        type: "pitchers-not-both-sides",
        summary
      });
    }

    if (!summary.lineScore.away || !summary.lineScore.home) {
      report.warnings.push({
        gameSno: pickGameSno(game),
        date: game?.meta?.date || "",
        type: "lineScore-missing",
        summary
      });
    }
  });
}

function summarizeGame(game) {
  return {
    status: game?.meta?.status || "",
    finalLock: game?.meta?.finalLock ?? null,
    finalVueEnhanced: game?.meta?.finalVueEnhanced ?? false,
    totals: cloneJson(game?.totals || {}),
    lineScore: {
      away: game?.lineScore?.away?.length || 0,
      home: game?.lineScore?.home?.length || 0
    },
    batters: {
      away: game?.batters?.away?.length || 0,
      home: game?.batters?.home?.length || 0
    },
    pitchers: {
      away: game?.pitchers?.away?.length || 0,
      home: game?.pitchers?.home?.length || 0
    },
    decision: cloneJson(game?.decision || {
      win: game?.meta?.win || "",
      lose: game?.meta?.lose || "",
      save: game?.meta?.save || "",
      mvp: game?.meta?.mvp || ""
    })
  };
}

function makeSkipRow(game, reason) {
  return {
    gameSno: pickGameSno(game),
    date: game?.meta?.date || "",
    away: game?.meta?.away || "",
    home: game?.meta?.home || "",
    status: game?.meta?.status || "",
    reason
  };
}

async function backupExistingFile(filePath) {
  if (!fsSync.existsSync(filePath)) return;

  await fs.mkdir(BACKUP_DIR, { recursive: true });

  const backupName = `${path.basename(filePath, ".json")}-before-vue-merge-${timestampForFilename()}.json`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  await fs.copyFile(filePath, backupPath);
  console.log(`🛡️ 已備份舊 live-boxscore：${path.relative(ROOT, backupPath)}`);
}

function pickGameSno(game) {
  return Number(game?.gameSno || game?.meta?.gameSno || game?.officialGameSno || 0);
}

function normalizeStatus(status) {
  const s = String(status || "").toLowerCase();

  if (s === "final" || s === "finished" || s === "gameover") return "final";
  if (s === "live" || s === "playing" || s === "in_progress") return "live";
  if (s === "pregame" || s === "scheduled") return s;

  if (/final|結束|完賽/.test(s)) return "final";
  if (/live|比賽中|進行中/.test(s)) return "live";

  return s || "scheduled";
}

function normalizeTeamKey(team) {
  return String(team || "")
    .replace(/\s+/g, "")
    .replace(/統一7-ELEVEN獅/gi, "統一7-ELEVEn獅")
    .replace(/統一獅/g, "統一7-ELEVEn獅")
    .trim();
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

function formatScore(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatRHE(summary, side) {
  const t = summary?.totals?.[side] || {};
  return `${formatScore(t.R)}-${formatScore(t.H)}-${formatScore(t.E)}`;
}

function getArg(name, fallback = "") {
  const prefix = `${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
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
