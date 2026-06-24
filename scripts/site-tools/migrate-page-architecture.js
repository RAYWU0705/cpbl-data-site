// =========================================================
// CPBL Data Site Page Architecture Migrator
// v5.6.1-C SAFE PAGE MOVE
//
// 預設 dry-run。只有加上 --write 才會真的搬移。
// 會備份、修正相對路徑、建立舊網址轉址、更新 registry。
// =========================================================

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force");
const RUN_ID = timestamp();

const BACKUP_ROOT = path.join(
  ROOT,
  "scripts",
  "backup",
  `page-architecture-${RUN_ID}`
);

const REGISTRY_FILE = path.join(ROOT, "config", "pages.json");
const GITIGNORE_FILE = path.join(ROOT, ".gitignore");

const MOVES = [
  {
    source: "data-quality.html",
    target: "ops/data-quality.html",
    type: "OPS",
    redirect: true
  },
  {
    source: "teams-dashboard.html",
    target: "ops/teams-dashboard.html",
    type: "OPS",
    redirect: true
  },
  {
    source: "live-logger.html",
    target: "ops/live-logger.html",
    type: "OPS",
    redirect: true
  },
  {
    source: "admin-live-debug.html",
    target: "admin/ops-center.html",
    type: "ADMIN",
    redirect: true
  },
  {
    source: "admin-manual-override.html",
    target: "local-tools/manual-override.html",
    type: "LOCAL_TOOL",
    redirect: false
  }
];

const MOVE_MAP = new Map(
  MOVES.map(item => [normalize(item.source), normalize(item.target)])
);

async function main() {
  console.log("======================================");
  console.log("🚚 CPBL 頁面安全搬移 v5.6.1-C");
  console.log("======================================");
  console.log(`模式：${WRITE ? "WRITE，會修改檔案" : "DRY-RUN，只預覽"}`);
  console.log(`專案：${ROOT}`);
  console.log("");

  const validation = await validate();

  if (!validation.ok && !FORCE) {
    console.log("❌ 搬移前檢查未通過，停止。");
    console.log("如確定要忽略，可使用 --force，但不建議。");
    process.exitCode = 1;
    return;
  }

  for (const item of MOVES) {
    console.log(
      `${item.type.padEnd(10)} ${item.source} → ${item.target}` +
      `${item.redirect ? "｜保留舊網址轉址" : "｜不部署舊網址"}`
    );
  }

  console.log("");
  console.log("將同步：");
  console.log("- 修正搬移頁面的 CSS / JS / 圖片 / fetch / 連結");
  console.log("- 更新其他 HTML 指向新網址");
  console.log("- 更新 config/pages.json");
  console.log("- 加入 local-tools/ 到 .gitignore");
  console.log("- 修正 check-page-structure.js 忽略 scripts/backup");
  console.log("- 建立 ops/index.html 與 admin/index.html");
  console.log("");

  if (!WRITE) {
    console.log("🧪 目前只是預覽，沒有修改任何檔案。");
    console.log("正式執行請使用：");
    console.log("node scripts/migrate-page-architecture.js --write");
    return;
  }

  await fs.mkdir(BACKUP_ROOT, { recursive: true });

  const backupTargets = [
    ...MOVES.map(item => item.source),
    "config/pages.json",
    ".gitignore",
    "scripts/check-page-structure.js",
    "docs/PAGE-MAP.md"
  ];

  const rootHtml = await getRootHtmlFiles();
  backupTargets.push(...rootHtml);

  await backupFiles([...new Set(backupTargets)]);

  // 先讀取所有來源，避免搬到一半失敗。
  const sourceContents = new Map();

  for (const item of MOVES) {
    const sourcePath = path.join(ROOT, item.source);
    sourceContents.set(
      item.source,
      await fs.readFile(sourcePath, "utf8")
    );
  }

  // 搬移並重寫內容。
  for (const item of MOVES) {
    const original = sourceContents.get(item.source);
    const rewritten = rewriteMovedHtml(
      original,
      item.source,
      item.target
    );

    const targetPath = path.join(ROOT, item.target);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, rewritten, "utf8");

    if (item.redirect) {
      await fs.writeFile(
        path.join(ROOT, item.source),
        buildRedirectPage(item.source, item.target),
        "utf8"
      );
    } else {
      await fs.rm(path.join(ROOT, item.source), { force: true });
    }

    console.log(`✅ 已搬移：${item.source} → ${item.target}`);
  }

  // 更新所有仍在根目錄的 HTML 連結。
  const currentRootHtml = await getRootHtmlFiles();

  for (const file of currentRootHtml) {
    if (MOVES.some(item => item.source === file && item.redirect)) {
      continue;
    }

    const full = path.join(ROOT, file);
    const html = await fs.readFile(full, "utf8");
    const next = rewriteKnownPageLinks(html, file);

    if (next !== html) {
      await fs.writeFile(full, next, "utf8");
      console.log(`🔗 已更新頁面連結：${file}`);
    }
  }

  await updateRegistry();
  await updateGitignore();
  await updateChecker();
  await updatePageMap();
  await createSectionIndexes();

  const manifest = {
    version: "v5.6.1-C",
    runId: RUN_ID,
    backup: normalize(path.relative(ROOT, BACKUP_ROOT)),
    moves: MOVES,
    createdAt: new Date().toISOString()
  };

  await fs.writeFile(
    path.join(BACKUP_ROOT, "migration-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  console.log("");
  console.log("======================================");
  console.log("✅ 頁面安全搬移完成");
  console.log("======================================");
  console.log(`備份：${path.relative(ROOT, BACKUP_ROOT)}`);
  console.log("");
  console.log("接著執行：");
  console.log("node scripts/check-page-structure.js");
  console.log("node scripts/plan-page-moves.js");
  console.log("git status --short");
}

async function validate() {
  let ok = true;

  for (const item of MOVES) {
    const source = path.join(ROOT, item.source);
    const target = path.join(ROOT, item.target);

    if (!(await fileExists(source))) {
      console.log(`❌ 找不到來源：${item.source}`);
      ok = false;
    } else {
      console.log(`✅ 來源存在：${item.source}`);
    }

    if (await fileExists(target)) {
      console.log(`⚠️ 目標已存在：${item.target}`);
      if (!FORCE) ok = false;
    }
  }

  if (!(await fileExists(REGISTRY_FILE))) {
    console.log("❌ 找不到 config/pages.json");
    ok = false;
  }

  return { ok };
}

function rewriteMovedHtml(html, sourceFile, targetFile) {
  let output = html;

  output = rewriteHtmlAttributes(output, sourceFile, targetFile);
  output = rewriteJsStringReferences(output, sourceFile, targetFile);
  output = rewriteMetadataRoute(output, targetFile);

  // Admin Ops Center 不再公開連到 LOCAL TOOL。
  if (normalize(targetFile) === "admin/ops-center.html") {
    output = output.replace(
      /<a\b[^>]*href=["'](?:\.\.\/)?admin-manual-override\.html["'][^>]*>[\s\S]*?<\/a>/gi,
      '<span class="ops-local-only" title="此工具只保留在本機">Override 管理（本機限定）</span>'
    );

    output = output.replace(
      /<a\b[^>]*href=["'](?:\.\.\/)?local-tools\/manual-override\.html["'][^>]*>[\s\S]*?<\/a>/gi,
      '<span class="ops-local-only" title="此工具只保留在本機">Override 管理（本機限定）</span>'
    );
  }

  return output;
}

function rewriteHtmlAttributes(html, sourceFile, targetFile) {
  const regex = /\b(href|src|action)=["']([^"']+)["']/gi;

  return html.replace(regex, (full, attr, value) => {
    const next = rewriteReference(value, sourceFile, targetFile);
    return `${attr}="${next}"`;
  });
}

function rewriteJsStringReferences(html, sourceFile, targetFile) {
  const patterns = [
    /(\bfetch\s*\(\s*)([`"'])([^`"']+)(\2)/gi,
    /(\bwindow\.open\s*\(\s*)([`"'])([^`"']+)(\2)/gi,
    /(\blocation\.href\s*=\s*)([`"'])([^`"']+)(\2)/gi,
    /(\bwindow\.location\s*=\s*)([`"'])([^`"']+)(\2)/gi
  ];

  let output = html;

  for (const regex of patterns) {
    output = output.replace(
      regex,
      (full, prefix, quote, value) => {
        const next = rewriteReference(value, sourceFile, targetFile);
        return `${prefix}${quote}${next}${quote}`;
      }
    );
  }

  return output;
}

function rewriteReference(value, sourceFile, targetFile) {
  const raw = String(value || "").trim();

  if (isExternalOrSpecial(raw)) return raw;

  const [pathname, suffix] = splitSuffix(raw);
  if (!pathname) return raw;

  const sourceDir = path.dirname(path.join(ROOT, sourceFile));
  const targetDir = path.dirname(path.join(ROOT, targetFile));

  let absoluteTarget = path.resolve(sourceDir, pathname);
  let relativeFromRoot = normalize(path.relative(ROOT, absoluteTarget));

  // 若引用的是也要搬移的頁面，直接改到新位置。
  if (MOVE_MAP.has(relativeFromRoot)) {
    absoluteTarget = path.join(ROOT, MOVE_MAP.get(relativeFromRoot));
  }

  let next = normalize(path.relative(targetDir, absoluteTarget));

  if (!next) {
    next = path.basename(absoluteTarget);
  }

  return `${next}${suffix}`;
}

function rewriteKnownPageLinks(html, currentFile) {
  const currentDir = path.dirname(path.join(ROOT, currentFile));

  return html.replace(
    /\b(href|src)=["']([^"']+)["']/gi,
    (full, attr, value) => {
      if (isExternalOrSpecial(value)) return full;

      const [pathname, suffix] = splitSuffix(value);
      const absolute = path.resolve(currentDir, pathname);
      const relative = normalize(path.relative(ROOT, absolute));

      if (!MOVE_MAP.has(relative)) return full;

      const newAbsolute = path.join(ROOT, MOVE_MAP.get(relative));
      let next = normalize(path.relative(currentDir, newAbsolute));

      if (!next) next = path.basename(newAbsolute);

      return `${attr}="${next}${suffix}"`;
    }
  );
}

function rewriteMetadataRoute(html, targetFile) {
  return html.replace(
    /Route:\s*\/[^\r\n]+/i,
    `Route: /${normalize(targetFile)}`
  );
}

function buildRedirectPage(source, target) {
  const relativeTarget = normalize(
    path.relative(
      path.dirname(path.join(ROOT, source)),
      path.join(ROOT, target)
    )
  );

  return `<!DOCTYPE html>
<!--
=========================================================
CPBL Data Site Legacy Redirect
Old Route: /${normalize(source)}
New Route: /${normalize(target)}
Status: REDIRECT
=========================================================
-->
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="0; url=${relativeTarget}">
  <link rel="canonical" href="${relativeTarget}">
  <title>頁面已搬移｜CPBL Data Site</title>
  <script>
    location.replace(${JSON.stringify(relativeTarget)});
  </script>
</head>
<body>
  <p>頁面已搬移至 <a href="${relativeTarget}">${relativeTarget}</a>。</p>
</body>
</html>
`;
}

async function updateRegistry() {
  const registry = JSON.parse(await fs.readFile(REGISTRY_FILE, "utf8"));

  for (const page of registry.pages || []) {
    const moved = MOVES.find(item => item.source === page.file);
    if (!moved) continue;

    page.legacyRoute = page.file;
    page.file = moved.target;
    page.target = undefined;

    if (moved.type === "LOCAL_TOOL") {
      page.deploy = false;
      page.navigation = "NONE";
    }
  }

  registry.version = "v5.6.1-C";
  registry.description =
    "CPBL Data Site page registry after safe OPS / ADMIN / LOCAL_TOOL separation.";

  await fs.writeFile(
    REGISTRY_FILE,
    JSON.stringify(registry, null, 2) + "\n",
    "utf8"
  );

  console.log("✅ 已更新：config/pages.json");
}

async function updateGitignore() {
  let text = "";

  try {
    text = await fs.readFile(GITIGNORE_FILE, "utf8");
  } catch {
    text = "";
  }

  const lines = text.split(/\r?\n/);
  const required = [
    "local-tools/",
    "scripts/backup/"
  ];

  for (const item of required) {
    if (!lines.some(line => line.trim() === item)) {
      lines.push(item);
    }
  }

  const next = lines
    .filter((line, index, array) => {
      if (line.trim() !== "") return true;
      return index === 0 || array[index - 1].trim() !== "";
    })
    .join("\n")
    .replace(/\n+$/, "") + "\n";

  await fs.writeFile(GITIGNORE_FILE, next, "utf8");
  console.log("✅ 已更新：.gitignore");
}

async function updateChecker() {
  const file = path.join(ROOT, "scripts", "check-page-structure.js");
  if (!(await fileExists(file))) return;

  let code = await fs.readFile(file, "utf8");

  // 專案 HTML 統計排除 scripts/backup。
  code = code.replace(
    'if (entry.name === ".git") continue;',
    `if (entry.name === ".git") continue;

        const relDir = normalize(path.relative(ROOT, full));
        if (
          relDir === "scripts/backup" ||
          relDir.startsWith("scripts/backup/")
        ) {
          continue;
        }`
  );

  await fs.writeFile(file, code, "utf8");
  console.log("✅ 已更新：scripts/check-page-structure.js");
}

async function updatePageMap() {
  const file = path.join(ROOT, "docs", "PAGE-MAP.md");
  if (!(await fileExists(file))) return;

  let text = await fs.readFile(file, "utf8");

  for (const item of MOVES) {
    text = text.replaceAll(
      `\`${item.source}\``,
      `\`${item.target}\``
    );
  }

  text = text.replace(
    /狀態：只建立分類與檢查制度，\*\*目前不搬檔、不改網址\*\*。/,
    "狀態：已完成 OPS／ADMIN／LOCAL TOOL 安全分區；公開舊網址保留轉址。"
  );

  await fs.writeFile(file, text, "utf8");
  console.log("✅ 已更新：docs/PAGE-MAP.md");
}

async function createSectionIndexes() {
  const opsIndex = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OPS 維運中心｜CPBL Data Site</title>
  <link rel="stylesheet" href="../css/style.css">
  <link rel="stylesheet" href="../css/theme.css">
</head>
<body data-page="ops-index">
  <main class="container">
    <section class="home-card">
      <h1>OPS 維運中心</h1>
      <p class="muted">部署後可讀取的資料監控與戰情頁面。</p>
      <div class="hero-actions">
        <a href="data-quality.html">資料品質中心</a>
        <a href="teams-dashboard.html">球隊資料 Dashboard</a>
        <a href="live-logger.html">LIVE Logger</a>
        <a href="../game-day.html">今日戰情中心</a>
        <a href="../index.html">返回首頁</a>
      </div>
    </section>
  </main>
  <script src="../js/theme.js"></script>
  <script src="../js/version.js"></script>
</body>
</html>
`;

  const adminIndex = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Center｜CPBL Data Site</title>
  <link rel="stylesheet" href="../css/style.css">
  <link rel="stylesheet" href="../css/theme.css">
</head>
<body data-page="admin-index">
  <main class="container">
    <section class="home-card">
      <h1>Admin Center</h1>
      <p class="muted">內部維運入口。此資料夾是管理分類，不代表具有登入權限。</p>
      <div class="hero-actions">
        <a href="ops-center.html">Admin Ops Center</a>
        <a href="../ops/index.html">OPS 維運中心</a>
        <a href="../index.html">返回首頁</a>
      </div>
    </section>
  </main>
  <script src="../js/theme.js"></script>
  <script src="../js/version.js"></script>
</body>
</html>
`;

  await fs.mkdir(path.join(ROOT, "ops"), { recursive: true });
  await fs.mkdir(path.join(ROOT, "admin"), { recursive: true });

  await fs.writeFile(
    path.join(ROOT, "ops", "index.html"),
    opsIndex,
    "utf8"
  );

  await fs.writeFile(
    path.join(ROOT, "admin", "index.html"),
    adminIndex,
    "utf8"
  );

  console.log("✅ 已建立：ops/index.html");
  console.log("✅ 已建立：admin/index.html");
}

async function backupFiles(relativeFiles) {
  for (const relative of relativeFiles) {
    const source = path.join(ROOT, relative);

    if (!(await fileExists(source))) continue;

    const target = path.join(BACKUP_ROOT, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }

  console.log(`🛡️ 已建立備份：${path.relative(ROOT, BACKUP_ROOT)}`);
}

async function getRootHtmlFiles() {
  return (await fs.readdir(ROOT, { withFileTypes: true }))
    .filter(entry =>
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".html")
    )
    .map(entry => entry.name)
    .sort();
}

function splitSuffix(value) {
  const index = value.search(/[?#]/);
  if (index === -1) return [value, ""];
  return [value.slice(0, index), value.slice(index)];
}

function isExternalOrSpecial(value) {
  return (
    !value ||
    value.startsWith("#") ||
    value.startsWith("/") ||
    value.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

async function fileExists(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch {
    return false;
  }
}

function normalize(value) {
  return String(value || "").replaceAll("\\", "/");
}

function timestamp() {
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

main().catch(error => {
  console.error("❌ 頁面搬移失敗：");
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
