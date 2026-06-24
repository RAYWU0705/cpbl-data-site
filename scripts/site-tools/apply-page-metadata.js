// =========================================================
// CPBL Data Site Page Metadata Applier
// v5.6.1-B PAGE METADATA
// 依 config/pages.json 自動加入或更新 HTML 頁首用途標記。
// =========================================================

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_FILE = path.join(ROOT, "config", "pages.json");
const BACKUP_DIR = path.join(
  ROOT,
  "scripts",
  "backup",
  `page-metadata-${timestamp()}`
);

const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("--dry");
const ONLY_RAW = getArg("only");
const ONLY = ONLY_RAW
  ? new Set(ONLY_RAW.split(",").map(v => v.trim()).filter(Boolean))
  : null;

async function main() {
  const registry = JSON.parse(await fs.readFile(REGISTRY_FILE, "utf8"));
  const pages = Array.isArray(registry.pages) ? registry.pages : [];

  const targets = pages.filter(page => {
    if (!ONLY) return true;
    return ONLY.has(page.file) || ONLY.has(page.type);
  });

  console.log("======================================");
  console.log("🏷️ CPBL 頁面用途標記 v5.6.1-B");
  console.log("======================================");
  console.log(`模式：${DRY_RUN ? "dry-run，不寫入" : "write，會修改 HTML"}`);
  console.log(`目標頁面：${targets.length}`);
  console.log("");

  if (!DRY_RUN) {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  }

  let changed = 0;
  let unchanged = 0;
  let missing = 0;

  for (const page of targets) {
    const file = path.join(ROOT, page.file);

    if (!(await fileExists(file))) {
      console.log(`❌ 不存在：${page.file}`);
      missing++;
      continue;
    }

    const original = await fs.readFile(file, "utf8");
    const metadata = buildMetadata(page);
    const next = upsertMetadata(original, metadata);

    if (next === original) {
      console.log(`⏭️ 無需修改：${page.file}`);
      unchanged++;
      continue;
    }

    console.log(`✅ ${DRY_RUN ? "將更新" : "已更新"}：${page.file}`);

    if (!DRY_RUN) {
      const backupFile = path.join(BACKUP_DIR, page.file);
      await fs.mkdir(path.dirname(backupFile), { recursive: true });
      await fs.writeFile(backupFile, original, "utf8");
      await fs.writeFile(file, next, "utf8");
    }

    changed++;
  }

  console.log("");
  console.log("--------------------------------------");
  console.log(`修改：${changed}`);
  console.log(`未變更：${unchanged}`);
  console.log(`不存在：${missing}`);

  if (!DRY_RUN) {
    console.log(`備份：${path.relative(ROOT, BACKUP_DIR)}`);
  }
}

function buildMetadata(page) {
  const route = `/${String(page.file || "").replaceAll("\\", "/")}`;
  const deploy = page.deploy === false ? "NO" : "YES";
  const gitTracking =
    page.type === "LOCAL_TOOL" ? "NO" : "YES";

  const lines = [
    "<!--",
    "=========================================================",
    "CPBL Data Site Page Metadata",
    `Page Type: ${page.type || "UNKNOWN"}`,
    `Page Name: ${page.name || page.file}`,
    `Route: ${route}`,
    `Deploy: ${deploy}`,
    `Navigation: ${page.navigation || "NONE"}`,
    "Maintainer: Ray",
    `Status: ${page.status || "ACTIVE"}`
  ];

  if (page.type === "LOCAL_TOOL") {
    lines.push(`Git Tracking: ${gitTracking}`);
  }

  if (page.target) {
    lines.push(`Future Target: /${page.target}`);
  }

  if (page.notes) {
    lines.push(`Notes: ${page.notes}`);
  }

  lines.push(
    "=========================================================",
    "-->"
  );

  return lines.join("\n");
}

function upsertMetadata(html, metadata) {
  const normalized = String(html || "").replace(/^\uFEFF/, "");

  const existing = /<!--\s*\n?=+\nCPBL Data Site Page Metadata[\s\S]*?=+\n-->\s*/i;

  if (existing.test(normalized)) {
    return normalized.replace(existing, `${metadata}\n`);
  }

  const doctype = normalized.match(/^<!DOCTYPE html>\s*/i);

  if (doctype) {
    const index = doctype[0].length;
    return (
      normalized.slice(0, index) +
      "\n" +
      metadata +
      "\n" +
      normalized.slice(index)
    );
  }

  return `${metadata}\n${normalized}`;
}

function getArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : "";
}

async function fileExists(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch {
    return false;
  }
}

function timestamp() {
  const d = new Date();
  const parts = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    "-",
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0")
  ];

  return parts.join("");
}

main().catch(error => {
  console.error("❌ Page Metadata 發生錯誤：");
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
