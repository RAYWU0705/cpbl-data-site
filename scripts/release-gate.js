// =========================================================
// Ray's CPBL Data Site
// Release Gate v5.6.2
//
// 只讀式部署前檢查，不修改網站或資料檔。
// 使用：
//   node scripts/release-gate.js
//   node scripts/release-gate.js --strict
//   node scripts/release-gate.js --json
// =========================================================

import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const STRICT = process.argv.includes("--strict");
const JSON_MODE = process.argv.includes("--json");
const LIVE_UPDATE_MODE = process.argv.includes("--live-update");

const MAIN_PAGES = [
  "index.html",
  "schedule.html",
  "standings.html",
  "teams.html",
  "rules.html",
  "season.html",
  "version.html",
  "about.html"
];

const REQUIRED_ROADMAP = [
  "Override 修正紀錄 Timeline",
  "Override 衝突偵測",
  "公開延賽／補賽異動卡片",
  "Release Gate 擴充",
  "Data Dependency Map"
];

const RETIRED_ROADMAP = [
  "Manual Override Priority Guard",
  "Site Health Check",
  "Update Console",
  "Season Rule Config",
  "Crawler Cache & Changed-Only Update",
  "GITHUB ACTIONS LIVE AUTO UPDATE"
];

const findings = [];

function add(level, check, message, details = null) {
  findings.push({ level, check, message, details });
}

function pass(check, message, details = null) {
  add("PASS", check, message, details);
}

function warn(check, message, details = null) {
  add("WARN", check, message, details);
}

function error(check, message, details = null) {
  add("ERROR", check, message, details);
}

async function main() {
  await checkRequiredFiles();
  await checkJsonFiles();
  await checkPackageLock();
  await checkPageRegistry();
  await checkPublicNavigation();
  await checkPublicVersionPage();
  await checkHtmlEncoding();
  await checkStaticLinks();
  await checkSeasonBoundary();
  await checkSpecialSchedule();
  await checkLiveWorkflow();
  await checkCriticalJavaScript();
  await checkStandingsBehavior();

  const totals = {
    pass: findings.filter(item => item.level === "PASS").length,
    warnings: findings.filter(item => item.level === "WARN").length,
    errors: findings.filter(item => item.level === "ERROR").length
  };

  const blocked = totals.errors > 0 || (STRICT && totals.warnings > 0);
  const result = {
    version: "v5.6.2-RELEASE-GATE",
    root: ROOT,
    strict: STRICT,
    blocked,
    totals,
    findings
  };

  if (JSON_MODE) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }

  if (blocked) process.exitCode = 1;
}

async function checkRequiredFiles() {
  const files = [
    ...MAIN_PAGES,
    "config/pages.json",
    ".github/workflows/update-live.yml",
    "package.json",
    "package-lock.json",
    "docs/data-dependency-map.md",
    "data/live/live-boxscore.json",
    "data/manual/manual-boxscore-overrides.json",
    "js/standingsEngine.js",
    "js/season.js",
    "scripts/update-all.js",
    "scripts/should-run-live-update.js"
  ];

  const missing = [];
  for (const file of files) {
    if (!(await exists(file))) missing.push(file);
  }

  if (missing.length) {
    error("必要檔案", `缺少 ${missing.length} 個必要檔案`, missing);
  } else {
    pass("必要檔案", `必要檔案 ${files.length} 個皆存在`);
  }
}

async function checkPackageLock() {
  try {
    const pkg = await readJson("package.json");
    const lock = await readJson("package-lock.json");
    const root = lock?.packages?.[""] || {};
    const expected = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {})
    };
    const actual = {
      ...(root.dependencies || {}),
      ...(root.devDependencies || {})
    };

    const mismatch =
      pkg.name !== lock.name ||
      pkg.version !== lock.version ||
      Object.keys(expected).length !== Object.keys(actual).length ||
      Object.entries(expected).some(([name, version]) => actual[name] !== version);

    if (mismatch) {
      error("套件鎖定", "package.json 與 package-lock.json 不一致", {
        package: { name: pkg.name, version: pkg.version, dependencies: expected },
        lock: { name: lock.name, version: lock.version, dependencies: actual }
      });
    } else {
      pass("套件鎖定", `package-lock 與 ${pkg.name}@${pkg.version} 一致`);
    }
  } catch (cause) {
    error("套件鎖定", "無法檢查 package / lock", cause.message);
  }
}

async function checkJsonFiles() {
  const roots = ["config", "data"];
  const files = [];

  for (const root of roots) {
    if (await exists(root)) {
      files.push(...await walkFiles(path.join(ROOT, root), file => file.endsWith(".json")));
    }
  }

  const formalFiles = files.filter(file => {
    const relative = normalize(path.relative(ROOT, file));
    const parts = relative.split("/");
    const excludedFolders = new Set(["backup", "backups", "archive", "incidents"]);
    if (parts.some(part => excludedFolders.has(part))) return false;
    return !/\.(debug|snapshot)\.json$/i.test(relative);
  });

  const invalid = [];
  for (const file of formalFiles) {
    try {
      JSON.parse(await fs.readFile(file, "utf8"));
    } catch (cause) {
      invalid.push({
        file: normalize(path.relative(ROOT, file)),
        error: cause.message
      });
    }
  }

  if (invalid.length) {
    error("JSON", `${invalid.length} 個正式 JSON 無法解析`, invalid);
  } else {
    pass("JSON", `正式 JSON ${formalFiles.length} 個全部可解析`);
  }
}

async function checkPageRegistry() {
  let registry;
  try {
    registry = await readJson("config/pages.json");
  } catch (cause) {
    error("頁面登錄", "config/pages.json 無法讀取", cause.message);
    return;
  }

  const pages = Array.isArray(registry.pages) ? registry.pages : [];
  const redirects = Array.isArray(registry.legacyRedirects) ? registry.legacyRedirects : [];
  const missing = [];

  for (const item of [...pages, ...redirects]) {
    if (!item?.file || !(await exists(item.file))) missing.push(item?.file || "(未命名)");
  }

  const mainRegistered = pages
    .filter(page => page.navigation === "MAIN" && page.status === "ACTIVE")
    .map(page => normalize(page.file));

  const mainMismatch = diffSet(MAIN_PAGES, mainRegistered);
  const retiredActive = pages
    .filter(page => ["report.html", "ops/teams-dashboard.html"].includes(normalize(page.file)))
    .map(page => page.file);

  if (missing.length) {
    error("頁面登錄", `登錄表中有 ${missing.length} 個不存在的頁面`, missing);
  }

  if (mainMismatch) {
    error("頁面登錄", "MAIN 頁面清單與公開主導覽規格不一致", {
      expected: MAIN_PAGES,
      actual: mainRegistered
    });
  }

  if (retiredActive.length) {
    error("頁面登錄", "已封存頁面仍被登錄為 active", retiredActive);
  }

  if (!missing.length && !mainMismatch && !retiredActive.length) {
    pass("頁面登錄", `正式頁面 ${pages.length} 個、Legacy Redirect ${redirects.length} 個皆有效`);
  }
}

async function checkPublicNavigation() {
  const failures = [];

  for (const file of MAIN_PAGES) {
    const html = await safeRead(file);
    if (html === null) continue;

    const nav = html.match(/<nav\b[^>]*class=["'][^"']*\bnav\b[^"']*["'][^>]*>[\s\S]*?<\/nav>/i)?.[0] || "";
    const links = [];

    for (const match of nav.matchAll(/<a\b([^>]*)>/gi)) {
      const attributes = match[1];
      const className = getAttribute(attributes, "class");
      const href = getAttribute(attributes, "href");
      if (/\bnav-link\b/.test(className) && href) links.push(stripQuery(href));
    }

    if (diffOrdered(MAIN_PAGES, links)) {
      failures.push({ file, expected: MAIN_PAGES, actual: links });
    }
  }

  if (failures.length) {
    error("公開主導覽", `${failures.length} 個主頁面的導覽不一致`, failures);
  } else {
    pass("公開主導覽", `8 個公開主頁面皆只保留指定 ${MAIN_PAGES.length} 個入口`);
  }
}

async function checkPublicVersionPage() {
  const html = await safeRead("version.html");
  if (html === null) return;

  const forbiddenLinks = [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map(match => match[1])
    .filter(href => /(?:^|\/)(?:local-tools|admin|ops)\//i.test(href));

  if (forbiddenLinks.length) {
    error("公開版本頁", "version.html 含有維運或本機工具入口", forbiddenLinks);
  } else {
    pass("公開版本頁", "version.html 未公開 local-tools / admin / ops 入口");
  }

  const roadmap = html.match(/下一階段 Roadmap[\s\S]*?<h2>📌 更新紀錄<\/h2>/i)?.[0] || "";
  const missing = REQUIRED_ROADMAP.filter(item => !roadmap.includes(item));
  const retired = RETIRED_ROADMAP.filter(item => roadmap.includes(item));

  if (!roadmap) {
    error("Roadmap", "找不到下一階段 Roadmap 區塊");
  } else if (missing.length || retired.length) {
    error("Roadmap", "Roadmap 未正確整理為第二階段項目", { missing, retired });
  } else {
    pass("Roadmap", "Roadmap 已改為第二階段五項優化");
  }
}

async function checkHtmlEncoding() {
  const files = await walkFiles(ROOT, file => file.endsWith(".html"));
  const formal = files.filter(file => {
    const relative = normalize(path.relative(ROOT, file));
    return !relative.startsWith("archive/") && !relative.startsWith("debug/");
  });

  const suspicious = [];
  const mojibake = /\uFFFD|Ã.|Â.|â(?:€|™|œ|ž)|ðŸ/;

  for (const file of formal) {
    const text = await fs.readFile(file, "utf8");
    if (mojibake.test(text)) suspicious.push(normalize(path.relative(ROOT, file)));
  }

  if (suspicious.length) {
    error("HTML 編碼", `${suspicious.length} 個正式 HTML 疑似含亂碼`, suspicious);
  } else {
    pass("HTML 編碼", `正式 HTML ${formal.length} 個未發現常見 mojibake`);
  }
}

async function checkStaticLinks() {
  const broken = [];

  for (const file of MAIN_PAGES) {
    const html = await safeRead(file);
    if (html === null) continue;

    const references = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)]
      .map(match => match[1])
      .filter(isLocalReference);

    for (const reference of references) {
      const clean = decodeURIComponent(stripQuery(reference));
      const target = path.resolve(ROOT, path.dirname(file), clean);
      if (!isInsideRoot(target) || !(await fileExistsAbsolute(target))) {
        broken.push({ file, reference });
      }
    }
  }

  const unique = uniqueObjects(broken);
  if (unique.length) {
    error("靜態連結", `${unique.length} 個公開主頁面本機連結找不到目標`, unique);
  } else {
    pass("靜態連結", "公開主頁面的本機 href / src 皆有對應檔案");
  }
}

async function checkSeasonBoundary() {
  const standings = await safeRead("standings.html");
  const season = await safeRead("js/season.js");
  if (standings === null || season === null) return;

  const correct =
    /first\s*:\s*\{[\s\S]*?end\s*:\s*["']2026-07-02["']/.test(standings) &&
    /second\s*:\s*\{[\s\S]*?start\s*:\s*["']2026-07-03["']/.test(standings) &&
    season.includes('(g.date || "") <= "2026-07-02"') &&
    season.includes('(g.date || "") >= "2026-07-03"');

  if (correct) {
    pass("上下半季", "standings 與 season 皆以 7/2、7/3 為 2026 分界");
  } else {
    error("上下半季", "2026 分界不一致：7/2 應屬上半季，7/3 才是下半季");
  }
}

async function checkSpecialSchedule() {
  let games;
  try {
    const data = await readJson("data/live/live-boxscore.json");
    games = Array.isArray(data) ? data : Object.values(data || {});
  } catch (cause) {
    error("特殊賽程", "live-boxscore.json 無法讀取", cause.message);
    return;
  }

  const bySno = number => games.filter(game => Number(game?.gameSno) === number);
  const game198 = bySno(198);
  const moved = [196, 197].flatMap(bySno);
  const issues = [];

  if (game198.length !== 1) {
    issues.push(`編號 198 筆數應為 1，目前為 ${game198.length}`);
  } else {
    const game = game198[0];
    const allowed198Statuses = LIVE_UPDATE_MODE
      ? ["scheduled", "live", "final"]
      : ["scheduled"];

    if (
      game?.meta?.date !== "2026-07-10" ||
      !allowed198Statuses.includes(game?.meta?.status)
    ) {
      issues.push(
        LIVE_UPDATE_MODE
          ? "編號 198 必須留在 2026-07-10，且只能是 scheduled / live / final"
          : "編號 198 必須維持 2026-07-10 scheduled"
      );
    }
  }

  for (const gameSno of [196, 197]) {
    const rows = bySno(gameSno);
    if (rows.length !== 1) {
      issues.push(`編號 ${gameSno} 筆數應為 1，目前為 ${rows.length}`);
      continue;
    }

    const game = rows[0];
    if (
      game?.meta?.date !== "2026-09-22" ||
      game?.meta?.status !== "scheduled" ||
      game?.meta?.originalDate !== "2026-07-10" ||
      game?.meta?.rescheduledTo !== "2026-09-22"
    ) {
      issues.push(`編號 ${gameSno} 的 9/22 補賽欄位不完整`);
    }
  }

  if (moved.some(game => game?.meta?.date === "2026-07-10")) {
    issues.push("編號 196 或 197 仍殘留在 2026-07-10");
  }

  if (issues.length) {
    error("特殊賽程", "7/10 颱風延賽／9/22 補賽資料不符合保護規則", issues);
  } else {
    pass(
      "特殊賽程",
      LIVE_UPDATE_MODE
        ? "#198 保留於 7/10 並允許正常賽態；#196、#197 固定於 9/22"
        : "#198 維持 7/10 scheduled；#196、#197 已移至 9/22"
    );
  }
}

async function checkCriticalJavaScript() {
  const files = [
    "scripts/release-gate.js",
    "scripts/update-all.js",
    "scripts/fetch-cpbl-pregame-today.js",
    "scripts/fetch-cpbl-live-inplay-today.js",
    "scripts/should-run-live-update.js",
    "scripts/merge-first-team-final-vue-boxscore.js",
    "scripts/lib/manual-overrides.js",
    "scripts/debug/check-page-structure.js",
    "scripts/debug/check-relative-path-risks.js",
    "js/standingsEngine.js",
    "js/season.js"
  ];

  const failures = [];
  for (const file of files) {
    if (!(await exists(file))) continue;
    const run = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], {
      encoding: "utf8"
    });
    if (run.status !== 0) {
      failures.push({ file, error: (run.stderr || run.stdout || "語法錯誤").trim() });
    }
  }

  if (failures.length) {
    error("JavaScript 語法", `${failures.length} 個核心 JavaScript 未通過 node --check`, failures);
  } else {
    pass("JavaScript 語法", `核心 JavaScript ${files.length} 個皆通過 node --check`);
  }
}

async function checkLiveWorkflow() {
  const workflow = await safeRead(".github/workflows/update-live.yml");
  if (workflow === null) return;

  const required = [
    "concurrency:",
    "cancel-in-progress: false",
    "cache: npm",
    "scripts/should-run-live-update.js",
    "steps.preflight.outputs.should_run == 'true'",
    "npm ci",
    "scripts/release-gate.js --live-update"
  ];
  const missing = required.filter(text => !workflow.includes(text));
  const retired = [
    "npm install puppeteer",
    "run: npm install\n"
  ].filter(text => workflow.includes(text));

  if (missing.length || retired.length) {
    error("LIVE Workflow", "GitHub Actions 智慧啟動設定不完整", { missing, retired });
  } else {
    pass("LIVE Workflow", "preflight、npm cache、concurrency 與更新後 Release Gate 已啟用");
  }
}

async function checkStandingsBehavior() {
  try {
    const moduleUrl = `${pathToFileURL(path.join(ROOT, "js/standingsEngine.js")).href}?gate=${Date.now()}`;
    const { calculateStandings } = await import(moduleUrl);
    const games = [
      game(1, "2026-07-03", "A", "C", "final", 2, 1),
      game(2, "2026-07-03", "B", "D", "final", 3, 0),
      game(3, "2026-07-04", "A", "B", "scheduled", 99, 0)
    ];
    const table = calculateStandings(games);
    const a = table.find(team => team.team === "A");
    const b = table.find(team => team.team === "B");

    if (!a || !b || a.rank !== 1 || b.rank !== 1 || a.games !== 1 || b.games !== 1) {
      error("戰績引擎", "同勝率同名次或非 final 排除測試失敗", { a, b });
      return;
    }

    if (table.some(team => team.elimination === "E")) {
      error("戰績引擎", "淘汰指數仍出現固定 E");
      return;
    }

    pass("戰績引擎", "同勝率同名次、非 final 排除與淘汰指數測試通過");
  } catch (cause) {
    error("戰績引擎", "無法執行 standingsEngine 行為測試", cause.stack || cause.message);
  }
}

function game(gameSno, date, home, away, status, homeR, awayR) {
  return {
    gameSno,
    meta: { date, time: "18:35", home, away, status },
    totals: { home: { R: homeR }, away: { R: awayR } }
  };
}

function printReport(result) {
  console.log("==================================================");
  console.log("🚦 Ray's CPBL Data Site Release Gate v5.6.2");
  console.log("==================================================");
  console.log(`模式：${result.strict ? "STRICT" : "STANDARD"}`);
  console.log("");

  for (const item of result.findings) {
    const icon = item.level === "PASS" ? "✅" : item.level === "WARN" ? "⚠️" : "❌";
    console.log(`${icon} [${item.check}] ${item.message}`);
    if (item.details && item.level !== "PASS") {
      const details = Array.isArray(item.details) ? item.details : [item.details];
      for (const detail of details) {
        console.log(`   ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
      }
    }
  }

  console.log("");
  console.log("--------------------------------------------------");
  console.log(`通過 ${result.totals.pass}｜警告 ${result.totals.warnings}｜錯誤 ${result.totals.errors}`);
  console.log(result.blocked ? "🛑 RELEASE BLOCKED" : "🎉 RELEASE READY");
}

async function safeRead(relative) {
  try {
    return await fs.readFile(path.join(ROOT, relative), "utf8");
  } catch (cause) {
    error("檔案讀取", `${relative} 無法讀取`, cause.message);
    return null;
  }
}

async function readJson(relative) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relative), "utf8"));
}

async function exists(relative) {
  return fileExistsAbsolute(path.join(ROOT, relative));
}

async function fileExistsAbsolute(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile() || stat.isDirectory();
  } catch {
    return false;
  }
}

async function walkFiles(start, predicate) {
  const output = [];
  const entries = await fs.readdir(start, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(start, entry.name);
    const relative = normalize(path.relative(ROOT, full));
    if (entry.isDirectory()) {
      if (["node_modules", ".git"].includes(entry.name)) continue;
      output.push(...await walkFiles(full, predicate));
    } else if (entry.isFile() && predicate(relative)) {
      output.push(full);
    }
  }

  return output;
}

function getAttribute(attributes, name) {
  return attributes.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "";
}

function stripQuery(value) {
  return String(value || "").split(/[?#]/, 1)[0];
}

function isLocalReference(value) {
  const text = String(value || "").trim();
  if (!text || text.startsWith("#") || text.includes("${")) return false;
  if (/^(?:https?:|mailto:|tel:|javascript:|data:|blob:|\/\/)/i.test(text)) return false;
  return Boolean(stripQuery(text));
}

function isInsideRoot(target) {
  const relative = path.relative(ROOT, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function diffOrdered(expected, actual) {
  if (expected.length !== actual.length) return true;
  return expected.some((item, index) => item !== actual[index]);
}

function diffSet(expected, actual) {
  if (expected.length !== actual.length) return true;
  const expectedSet = new Set(expected);
  return actual.some(item => !expectedSet.has(item));
}

function normalize(value) {
  return String(value || "").replaceAll("\\", "/");
}

function uniqueObjects(items) {
  const map = new Map();
  for (const item of items) map.set(JSON.stringify(item), item);
  return [...map.values()];
}

main().catch(cause => {
  if (JSON_MODE) {
    console.log(JSON.stringify({
      version: "v5.6.2-RELEASE-GATE",
      blocked: true,
      fatal: cause.stack || cause.message
    }, null, 2));
  } else {
    console.error("❌ Release Gate 執行失敗");
    console.error(cause.stack || cause.message);
  }
  process.exitCode = 1;
});
