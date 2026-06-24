// =========================================================
// CPBL Data Site Page Move Risk Scanner
// v5.6.1-B MOVE RISK SCAN
// 只分析，不移動、不修改任何檔案。
// =========================================================

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_FILE = path.join(ROOT, "config", "pages.json");

const JSON_MODE = process.argv.includes("--json");
const ONLY_RAW = getArg("only");
const ONLY = ONLY_RAW
  ? new Set(ONLY_RAW.split(",").map(v => v.trim()).filter(Boolean))
  : null;

const MOVE_TARGETS = {
  OPS: "ops",
  ADMIN: "admin",
  LOCAL_TOOL: "local-tools"
};

async function main() {
  const registry = JSON.parse(await fs.readFile(REGISTRY_FILE, "utf8"));
  const pages = Array.isArray(registry.pages) ? registry.pages : [];

  const targets = pages.filter(page => {
    if (page.target) return shouldInclude(page);
    if (!MOVE_TARGETS[page.type]) return false;
    return shouldInclude(page);
  });

  const reports = [];

  for (const page of targets) {
    const sourceFile = path.join(ROOT, page.file);

    if (!(await fileExists(sourceFile))) {
      reports.push({
        file: page.file,
        type: page.type,
        exists: false,
        error: "來源檔案不存在"
      });
      continue;
    }

    const futureTarget =
      page.target ||
      `${MOVE_TARGETS[page.type]}/${path.basename(page.file)}`;

    const html = await fs.readFile(sourceFile, "utf8");
    const references = extractReferences(html);

    const analyzed = references.map(ref => {
      return analyzeReference(page.file, futureTarget, ref);
    });

    reports.push({
      file: page.file,
      name: page.name,
      type: page.type,
      exists: true,
      currentRoute: `/${normalize(page.file)}`,
      futureRoute: `/${normalize(futureTarget)}`,
      referenceCount: analyzed.length,
      affectedCount: analyzed.filter(item => item.requiresChange).length,
      references: analyzed
    });
  }

  const result = {
    version: "v5.6.1-B",
    root: ROOT,
    generatedAt: new Date().toISOString(),
    pages: reports,
    totals: {
      pages: reports.length,
      missing: reports.filter(r => !r.exists).length,
      references: reports.reduce((sum, r) => sum + (r.referenceCount || 0), 0),
      affected: reports.reduce((sum, r) => sum + (r.affectedCount || 0), 0)
    }
  };

  if (JSON_MODE) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printReport(result);
}

function printReport(result) {
  console.log("======================================");
  console.log("🚚 CPBL 頁面搬移風險掃描 v5.6.1-B");
  console.log("======================================");
  console.log(`待評估頁面：${result.totals.pages}`);
  console.log(`引用總數：${result.totals.references}`);
  console.log(`搬移後需調整：${result.totals.affected}`);
  console.log("");

  for (const page of result.pages) {
    if (!page.exists) {
      console.log(`❌ ${page.file}｜${page.error}`);
      continue;
    }

    console.log("--------------------------------------");
    console.log(`📄 ${page.file}｜${page.name}`);
    console.log(`類型：${page.type}`);
    console.log(`目前：${page.currentRoute}`);
    console.log(`建議：${page.futureRoute}`);
    console.log(`引用：${page.referenceCount}`);
    console.log(`需改：${page.affectedCount}`);

    const groups = groupBy(page.references, item => item.kind);

    for (const [kind, items] of groups.entries()) {
      console.log(`   ${kind}：`);

      for (const item of items) {
        const icon = item.requiresChange ? "⚠️" : "✅";
        console.log(
          `      ${icon} ${item.raw} → ${item.suggested}`
        );
      }
    }

    if (!page.references.length) {
      console.log("   無可分析引用");
    }
  }

  console.log("");
  console.log("======================================");
  console.log("📌 判讀原則");
  console.log("======================================");
  console.log("⚠️ 相對路徑搬到子資料夾後通常需要加 ../");
  console.log("✅ 絕對網址、#anchor、mailto、tel、javascript 不需修改");
  console.log("✅ 本腳本不會移動或修改任何檔案");
}

function extractReferences(html) {
  const output = [];

  const patterns = [
    {
      kind: "CSS",
      regex: /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi
    },
    {
      kind: "SCRIPT",
      regex: /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
    },
    {
      kind: "IMAGE",
      regex: /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
    },
    {
      kind: "LINK",
      regex: /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi
    },
    {
      kind: "FETCH",
      regex: /\bfetch\s*\(\s*[`"']([^`"']+)[`"']/gi
    },
    {
      kind: "LOCATION",
      regex: /\b(?:location\.href|window\.location)\s*=\s*[`"']([^`"']+)[`"']/gi
    },
    {
      kind: "WINDOW_OPEN",
      regex: /\bwindow\.open\s*\(\s*[`"']([^`"']+)[`"']/gi
    },
    {
      kind: "FORM_ACTION",
      regex: /<form\b[^>]*\baction=["']([^"']+)["'][^>]*>/gi
    },
    {
      kind: "MANIFEST",
      regex: /<link\b[^>]*\brel=["']manifest["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi
    }
  ];

  for (const pattern of patterns) {
    let match;

    while ((match = pattern.regex.exec(html)) !== null) {
      output.push({
        kind: pattern.kind,
        raw: match[1]
      });
    }
  }

  return dedupe(output);
}

function analyzeReference(currentFile, futureFile, ref) {
  const raw = String(ref.raw || "").trim();

  if (isExternalOrSpecial(raw)) {
    return {
      ...ref,
      requiresChange: false,
      suggested: raw,
      reason: "外部或特殊網址"
    };
  }

  const [pathPart, suffix = ""] = splitSuffix(raw);

  if (!pathPart) {
    return {
      ...ref,
      requiresChange: false,
      suggested: raw,
      reason: "空路徑"
    };
  }

  const currentDir = path.dirname(path.join(ROOT, currentFile));
  const futureDir = path.dirname(path.join(ROOT, futureFile));
  const absoluteTarget = path.resolve(currentDir, pathPart);

  let suggestedPath = normalize(
    path.relative(futureDir, absoluteTarget)
  );

  if (!suggestedPath.startsWith(".") && !suggestedPath.startsWith("/")) {
    suggestedPath = suggestedPath || path.basename(absoluteTarget);
  }

  const suggested = `${suggestedPath}${suffix}`;
  const requiresChange = normalize(raw) !== normalize(suggested);

  return {
    ...ref,
    requiresChange,
    suggested,
    reason: requiresChange
      ? "搬到子資料夾後相對路徑改變"
      : "搬移後路徑不變"
  };
}

function splitSuffix(value) {
  const index = value.search(/[?#]/);

  if (index === -1) {
    return [value, ""];
  }

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

function dedupe(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = `${item.kind}|${item.raw}`;

    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

function groupBy(items, getKey) {
  const map = new Map();

  for (const item of items) {
    const key = getKey(item);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(item);
  }

  return map;
}

function shouldInclude(page) {
  if (!ONLY) return true;
  return (
    ONLY.has(page.file) ||
    ONLY.has(page.type) ||
    ONLY.has(page.name)
  );
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

function normalize(value) {
  return String(value || "").replaceAll("\\", "/");
}

main().catch(error => {
  console.error("❌ 搬移風險掃描失敗：");
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
