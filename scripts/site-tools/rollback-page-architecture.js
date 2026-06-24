// =========================================================
// CPBL Data Site Page Architecture Rollback
// v5.6.1-C
//
// 用法：
// node scripts/rollback-page-architecture.js --backup=page-architecture-YYYYMMDD-HHMMSS
// =========================================================

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const backupName = getArg("backup");

if (!backupName) {
  console.error("❌ 請指定 --backup=page-architecture-時間");
  process.exit(1);
}

const backupRoot = path.join(ROOT, "scripts", "backup", backupName);

async function main() {
  const manifestFile = path.join(
    backupRoot,
    "migration-manifest.json"
  );

  const manifest = JSON.parse(
    await fs.readFile(manifestFile, "utf8")
  );

  console.log("======================================");
  console.log("↩️ CPBL 頁面架構回復");
  console.log("======================================");
  console.log(`備份：${backupName}`);

  // 移除搬移後檔案。
  for (const move of manifest.moves || []) {
    await fs.rm(path.join(ROOT, move.target), { force: true });
  }

  await fs.rm(path.join(ROOT, "ops", "index.html"), { force: true });
  await fs.rm(path.join(ROOT, "admin", "index.html"), { force: true });

  // 還原備份內所有檔案，排除 manifest。
  await restoreDirectory(backupRoot);

  console.log("✅ 已完成回復。");
}

async function restoreDirectory(current) {
  const entries = await fs.readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(current, entry.name);
    const relative = path.relative(backupRoot, full);

    if (relative === "migration-manifest.json") continue;

    if (entry.isDirectory()) {
      await restoreDirectory(full);
      continue;
    }

    const target = path.join(ROOT, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(full, target);
  }
}

function getArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : "";
}

main().catch(error => {
  console.error("❌ 回復失敗：");
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
