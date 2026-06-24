// =========================================================
// CPBL Data Site Legacy Redirect Registry Fix
// v5.6.1-C2 SAFE FIX
//
// 功能：
// 1. 將 pages.json 內的 legacyRoute 正式登錄。
// 2. 更新 check-page-structure.js。
// 3. 合法舊網址轉址頁不再被判定成未登錄。
// 4. 排除 scripts/backup 內的 HTML。
// =========================================================

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const REGISTRY_FILE = path.join(ROOT, "config", "pages.json");
const CHECKER_FILE = path.join(ROOT, "scripts", "check-page-structure.js");

async function main() {
  console.log("======================================");
  console.log("🔁 CPBL Legacy Redirect 修正 v5.6.1-C2");
  console.log("======================================");

  const registry = JSON.parse(
    await fs.readFile(REGISTRY_FILE, "utf8")
  );

  const legacyRedirects = [];

  for (const page of registry.pages || []) {
    if (!page.legacyRoute) continue;

    legacyRedirects.push({
      file: page.legacyRoute,
      target: page.file,
      type: "LEGACY_REDIRECT",
      deploy: true,
      status: "ACTIVE"
    });
  }

  registry.legacyRedirects = legacyRedirects;
  registry.version = "v5.6.1-C2";
  registry.description =
    "CPBL Data Site registry with explicit legacy redirect routes.";

  await fs.writeFile(
    REGISTRY_FILE,
    JSON.stringify(registry, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(
    CHECKER_FILE,
    buildChecker(),
    "utf8"
  );

  console.log(`✅ 已登錄 Legacy Redirect：${legacyRedirects.length}`);

  for (const item of legacyRedirects) {
    console.log(`   ${item.file} → ${item.target}`);
  }

  console.log("✅ 已更新：config/pages.json");
  console.log("✅ 已更新：scripts/check-page-structure.js");
  console.log("");
  console.log("接著執行：");
  console.log("node --check scripts/check-page-structure.js");
  console.log("node scripts/check-page-structure.js");
}

function buildChecker() {
  return String.raw`// =========================================================
// CPBL Data Site Page Structure Checker
// v5.6.1-C2 LEGACY REDIRECT AWARE
// =========================================================

import fs from "fs/promises";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const REGISTRY_FILE = path.join(ROOT, "config", "pages.json");

const STRICT = process.argv.includes("--strict");
const JSON_ONLY = process.argv.includes("--json");

async function main() {
  const registry = JSON.parse(
    await fs.readFile(REGISTRY_FILE, "utf8")
  );

  const pages = Array.isArray(registry.pages)
    ? registry.pages
    : [];

  const legacyRedirects = Array.isArray(registry.legacyRedirects)
    ? registry.legacyRedirects
    : [];

  const registered = new Map(
    pages.map(page => [normalize(page.file), page])
  );

  const registeredLegacy = new Map(
    legacyRedirects.map(item => [normalize(item.file), item])
  );

  const rootEntries = await fs.readdir(ROOT, {
    withFileTypes: true
  });

  const rootHtml = rootEntries
    .filter(entry =>
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".html")
    )
    .map(entry => entry.name)
    .sort();

  const allProjectHtml = await walkHtml(ROOT);

  const unregisteredRoot = rootHtml.filter(file => {
    const normalized = normalize(file);

    return (
      !registered.has(normalized) &&
      !registeredLegacy.has(normalized)
    );
  });

  const pageExistence = await Promise.all(
    pages.map(async page => ({
      page,
      exists: await fileExists(path.join(ROOT, page.file))
    }))
  );

  const redirectExistence = await Promise.all(
    legacyRedirects.map(async item => ({
      item,
      exists: await fileExists(path.join(ROOT, item.file))
    }))
  );

  const missingRegistered = pageExistence
    .filter(item => !item.exists)
    .map(item => item.page.file);

  const missingRedirects = redirectExistence
    .filter(item => !item.exists)
    .map(item => item.item.file);

  const checks = [];

  for (const item of pageExistence) {
    const page = item.page;
    if (!item.exists) continue;

    const html = await fs.readFile(
      path.join(ROOT, page.file),
      "utf8"
    );

    const requiresTheme =
      registry.rules?.themeRequiredFor?.includes(page.type);

    const requiresVersion =
      registry.rules?.versionRequiredFor?.includes(page.type);

    checks.push({
      file: page.file,
      name: page.name,
      type: page.type,
      exists: true,
      hasTheme: /js\/theme\.js/i.test(html),
      hasVersion: /js\/version\.js/i.test(html),
      hasMetadataComment:
        /CPBL Data Site Page Metadata/i.test(html),
      themeRequired: Boolean(requiresTheme),
      versionRequired: Boolean(requiresVersion)
    });
  }

  const redirectChecks = [];

  for (const entry of redirectExistence) {
    if (!entry.exists) continue;

    const html = await fs.readFile(
      path.join(ROOT, entry.item.file),
      "utf8"
    );

    const normalizedHtml = normalize(html);
    const normalizedTarget = normalize(entry.item.target);

    redirectChecks.push({
      file: entry.item.file,
      target: entry.item.target,
      exists: true,
      valid:
        normalizedHtml.includes(normalizedTarget) &&
        (
          html.includes("Legacy Redirect") ||
          /http-equiv=["']refresh/i.test(html)
        )
    });
  }

  const trackedLocalTools = pages
    .filter(page => page.type === "LOCAL_TOOL")
    .filter(page => isGitTracked(page.file))
    .map(page => page.file);

  const messages = [];

  for (const check of checks) {
    if (check.themeRequired && !check.hasTheme) {
      messages.push({
        level: "WARN",
        file: check.file,
        message: check.type + " 頁面缺少 js/theme.js"
      });
    }

    if (check.versionRequired && !check.hasVersion) {
      messages.push({
        level: "WARN",
        file: check.file,
        message: check.type + " 頁面缺少 js/version.js"
      });
    }

    if (!check.hasMetadataComment) {
      messages.push({
        level: "INFO",
        file: check.file,
        message: "尚未加入 Page Metadata 註解"
      });
    }
  }

  for (const redirect of redirectChecks) {
    if (!redirect.valid) {
      messages.push({
        level: "ERROR",
        file: redirect.file,
        message:
          "Legacy Redirect 無法確認指向 " +
          redirect.target
      });
    }
  }

  for (const file of unregisteredRoot) {
    messages.push({
      level: "ERROR",
      file,
      message: "根目錄 HTML 尚未登錄 config/pages.json"
    });
  }

  for (const file of missingRegistered) {
    messages.push({
      level: "ERROR",
      file,
      message: "登錄頁面不存在"
    });
  }

  for (const file of missingRedirects) {
    messages.push({
      level: "ERROR",
      file,
      message: "登錄的 Legacy Redirect 不存在"
    });
  }

  for (const file of trackedLocalTools) {
    messages.push({
      level: "WARN",
      file,
      message: "LOCAL_TOOL 目前仍被 Git 追蹤"
    });
  }

  const result = {
    version: "v5.6.1-C2",
    root: ROOT,
    totals: {
      registered: pages.length,
      legacyRedirects: legacyRedirects.length,
      rootHtml: rootHtml.length,
      allProjectHtml: allProjectHtml.length,
      unregisteredRoot: unregisteredRoot.length,
      missingRegistered: missingRegistered.length,
      missingRedirects: missingRedirects.length,
      warnings:
        messages.filter(item => item.level === "WARN").length,
      errors:
        messages.filter(item => item.level === "ERROR").length,
      info:
        messages.filter(item => item.level === "INFO").length
    },
    unregisteredRoot,
    missingRegistered,
    missingRedirects,
    checks,
    redirectChecks,
    warnings: messages
  };

  if (JSON_ONLY) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }

  if (
    result.totals.errors > 0 ||
    (STRICT && result.totals.warnings > 0)
  ) {
    process.exitCode = 1;
  }
}

function printReport(result) {
  console.log("======================================");
  console.log("🗂️ CPBL 頁面結構檢查 v5.6.1-C2");
  console.log("======================================");
  console.log("專案：" + result.root);
  console.log(
    "已登錄正式頁面：" + result.totals.registered
  );
  console.log(
    "Legacy Redirect：" +
    result.totals.legacyRedirects
  );
  console.log(
    "根目錄 HTML：" + result.totals.rootHtml
  );
  console.log(
    "專案內 HTML：" + result.totals.allProjectHtml
  );
  console.log(
    "未登錄根目錄 HTML：" +
    result.totals.unregisteredRoot
  );
  console.log(
    "登錄但不存在：" +
    result.totals.missingRegistered
  );
  console.log("");

  const groups = new Map();

  for (const check of result.checks) {
    if (!groups.has(check.type)) {
      groups.set(check.type, []);
    }

    groups.get(check.type).push(check);
  }

  for (const [type, items] of groups.entries()) {
    console.log("📁 " + type + "（" + items.length + "）");

    for (const item of items) {
      const theme = item.hasTheme ? "theme✅" : "theme—";
      const version = item.hasVersion
        ? "version✅"
        : "version—";

      console.log(
        "   " +
        item.file +
        "｜" +
        item.name +
        "｜" +
        theme +
        "｜" +
        version
      );
    }

    console.log("");
  }

  if (result.redirectChecks.length) {
    console.log(
      "🔁 LEGACY_REDIRECT（" +
      result.redirectChecks.length +
      "）"
    );

    for (const item of result.redirectChecks) {
      console.log(
        "   " +
        (item.valid ? "✅" : "❌") +
        " " +
        item.file +
        " → " +
        item.target
      );
    }

    console.log("");
  }

  if (!result.warnings.length) {
    console.log("✅ 沒有發現結構問題。");
  } else {
    console.log("======================================");
    console.log("📋 檢查訊息");
    console.log("======================================");

    for (const item of result.warnings) {
      const icon =
        item.level === "ERROR"
          ? "❌"
          : item.level === "WARN"
            ? "⚠️"
            : "ℹ️";

      console.log(
        icon +
        " [" +
        item.level +
        "] " +
        item.file +
        "｜" +
        item.message
      );
    }
  }

  console.log("");
  console.log("--------------------------------------");
  console.log("錯誤：" + result.totals.errors);
  console.log("警告：" + result.totals.warnings);
  console.log("資訊：" + result.totals.info);
  console.log("--------------------------------------");
}

async function walkHtml(startDir) {
  const output = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, {
      withFileTypes: true
    });

    for (const entry of entries) {
      const full = path.join(currentDir, entry.name);
      const relative = normalize(
        path.relative(ROOT, full)
      );

      if (entry.isDirectory()) {
        if (entry.name === ".git") continue;

        if (
          relative === "scripts/backup" ||
          relative.startsWith("scripts/backup/")
        ) {
          continue;
        }

        await walk(full);
        continue;
      }

      if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".html")
      ) {
        output.push(relative);
      }
    }
  }

  await walk(startDir);
  return output.sort();
}

async function fileExists(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch {
    return false;
  }
}

function isGitTracked(relativeFile) {
  const result = spawnSync(
    "git",
    ["ls-files", "--error-unmatch", relativeFile],
    {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true
    }
  );

  return result.status === 0;
}

function normalize(value) {
  return String(value || "").replaceAll("\\", "/");
}

main().catch(error => {
  console.error("❌ 頁面結構檢查失敗：");
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
`;
}

main().catch(error => {
  console.error("❌ Legacy Redirect 修正失敗：");
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
