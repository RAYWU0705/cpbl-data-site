// =========================================================
// CPBL Site Root Installer
// v5.6.1-D
//
// 預設 dry-run。
// 加 --write 才會修改 HTML。
// =========================================================

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const REGISTRY_FILE = path.join(ROOT, "config", "pages.json");
const WRITE = process.argv.includes("--write");
const RUN_ID = timestamp();
const BACKUP_DIR = path.join(
  ROOT,
  "scripts",
  "backup",
  `site-root-install-${RUN_ID}`
);

async function main() {
  const registry = JSON.parse(
    await fs.readFile(REGISTRY_FILE, "utf8")
  );

  const pages = Array.isArray(registry.pages)
    ? registry.pages
    : [];

  console.log("======================================");
  console.log("🧭 CPBL Site Root Installer v5.6.1-D");
  console.log("======================================");
  console.log(`模式：${WRITE ? "WRITE" : "DRY-RUN"}`);
  console.log(`登錄頁面：${pages.length}`);
  console.log("");

  let changed = 0;
  let skipped = 0;
  let missing = 0;

  if (WRITE) {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  }

  for (const page of pages) {
    const file = path.join(ROOT, page.file);

    if (!(await fileExists(file))) {
      console.log(`❌ 不存在：${page.file}`);
      missing++;
      continue;
    }

    const html = await fs.readFile(file, "utf8");

    if (/js\/site-root\.js/i.test(html)) {
      console.log(`⏭️ 已安裝：${page.file}`);
      skipped++;
      continue;
    }

    const relativeScript = normalize(
      path.relative(
        path.dirname(file),
        path.join(ROOT, "js", "site-root.js")
      )
    );

    const scriptTag =
      `<script src="${relativeScript}?v=561d"></script>\n`;

    const next = injectBeforePageScripts(html, scriptTag);

    console.log(
      `✅ ${WRITE ? "已安裝" : "將安裝"}：${page.file} → ${relativeScript}`
    );

    if (WRITE) {
      const backup = path.join(BACKUP_DIR, page.file);
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.writeFile(backup, html, "utf8");
      await fs.writeFile(file, next, "utf8");
    }

    changed++;
  }

  console.log("");
  console.log("--------------------------------------");
  console.log(`修改：${changed}`);
  console.log(`已存在：${skipped}`);
  console.log(`不存在：${missing}`);

  if (WRITE) {
    console.log(`備份：${path.relative(ROOT, BACKUP_DIR)}`);
  }
}

function injectBeforePageScripts(html, scriptTag) {
  const bodyEnd = html.lastIndexOf("</body>");

  if (bodyEnd === -1) {
    return `${html}\n${scriptTag}`;
  }

  const beforeBodyEnd = html.slice(0, bodyEnd);
  const afterBodyEnd = html.slice(bodyEnd);

  const scriptMatches = [
    ...beforeBodyEnd.matchAll(
      /<script\b[^>]*\bsrc=["'][^"']+["'][^>]*><\/script>/gi
    )
  ];

  if (!scriptMatches.length) {
    return (
      beforeBodyEnd +
      scriptTag +
      afterBodyEnd
    );
  }

  const firstScript = scriptMatches[0];
  const index = firstScript.index;

  return (
    beforeBodyEnd.slice(0, index) +
    scriptTag +
    beforeBodyEnd.slice(index) +
    afterBodyEnd
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
  console.error("❌ Site Root 安裝失敗：");
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
