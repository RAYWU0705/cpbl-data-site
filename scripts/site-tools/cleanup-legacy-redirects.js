// =========================================================
// CPBL Data Site Legacy Redirect Cleanup
// v5.6.1-C3 LOCAL TOOL EXCLUSION
//
// 只保留真的存在於根目錄的 Legacy Redirect。
// LOCAL_TOOL 若沒有舊轉址頁，就不登錄。
// =========================================================

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const REGISTRY_FILE = path.join(ROOT, "config", "pages.json");

async function main() {
  console.log("======================================");
  console.log("🧹 CPBL Legacy Redirect 清理 v5.6.1-C3");
  console.log("======================================");

  const registry = JSON.parse(
    await fs.readFile(REGISTRY_FILE, "utf8")
  );

  const legacyRedirects = [];

  for (const page of registry.pages || []) {
    if (!page.legacyRoute) continue;

    const legacyFile = path.join(ROOT, page.legacyRoute);

    if (!(await fileExists(legacyFile))) {
      console.log(
        `⏭️ 不登錄不存在的舊頁：${page.legacyRoute}`
      );
      continue;
    }

    legacyRedirects.push({
      file: page.legacyRoute,
      target: page.file,
      type: "LEGACY_REDIRECT",
      deploy: true,
      status: "ACTIVE"
    });
  }

  registry.legacyRedirects = legacyRedirects;
  registry.version = "v5.6.1-C3";
  registry.description =
    "CPBL Data Site registry with existing legacy redirects only.";

  await fs.writeFile(
    REGISTRY_FILE,
    JSON.stringify(registry, null, 2) + "\n",
    "utf8"
  );

  console.log("");
  console.log(`✅ Legacy Redirect：${legacyRedirects.length}`);

  for (const item of legacyRedirects) {
    console.log(`   ${item.file} → ${item.target}`);
  }

  console.log("✅ 已更新：config/pages.json");
  console.log("");
  console.log("接著執行：");
  console.log("node scripts/check-page-structure.js");
}

async function fileExists(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch {
    return false;
  }
}

main().catch(error => {
  console.error("❌ Legacy Redirect 清理失敗：");
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
