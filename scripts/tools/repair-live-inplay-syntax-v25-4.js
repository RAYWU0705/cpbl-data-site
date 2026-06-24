import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

/* =========================================================
   repair-live-inplay-syntax-v25-4.js
   v5.0-25.4-LIVE-INPLAY-SYNTAX-REPAIR

   專修：
   - function 參數有預設值 = {} 時，上一版 repair 誤把參數的 { } 當函式本體
   - 導致殘留 ") {"，產生 Unexpected token ')'

   本版策略：
   1. 若目前 fetch-cpbl-live-inplay-today.js 語法壞掉，優先從 scripts/backup 最新 before-syntax-repair 備份恢復
   2. 移除所有 hasZeroAwareLiveLineScore / isOfficialLineScoreCell / hasOfficialLineScoreRow 函式宣告
   3. 把所有 hasZeroAwareLiveLineScore(...) 呼叫改回 hasAsymmetricLiveLineScore(...)
   4. 只修改既有 hasAsymmetricLiveLineScore() 內容，讓 0 / X 都算有效逐局
   5. node --check 驗證
========================================================= */

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "scripts", "fetch-cpbl-live-inplay-today.js");
const BACKUP_DIR = path.join(ROOT, "scripts", "backup");

if (!fs.existsSync(TARGET)) {
  console.error(`❌ 找不到目標檔案：${TARGET}`);
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

function stamp() {
  return new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .replace(/\..+$/, "");
}

function checkSyntax(file) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    return { ok: true, output: "" };
  } catch (err) {
    return {
      ok: false,
      output: String(err.stderr || err.stdout || err.message || err)
    };
  }
}

function findLatestBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null;

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(name =>
      name.startsWith("fetch-cpbl-live-inplay-today.before-syntax-repair-") &&
      name.endsWith(".js")
    )
    .map(name => path.join(BACKUP_DIR, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return files[0] || null;
}

const preRepairBackup = path.join(
  BACKUP_DIR,
  `fetch-cpbl-live-inplay-today.before-v25-4-repair-${stamp()}.js`
);

fs.copyFileSync(TARGET, preRepairBackup);
console.log(`🛡️ 已備份目前檔案：${path.relative(ROOT, preRepairBackup)}`);

let initialCheck = checkSyntax(TARGET);

if (!initialCheck.ok) {
  console.log("⚠️ 目前 LIVE 腳本語法已壞，嘗試從最新 before-syntax-repair 備份恢復...");

  const latestBackup = findLatestBackup();

  if (!latestBackup) {
    console.error("❌ 找不到可恢復的 scripts/backup/*before-syntax-repair*.js");
    console.error(initialCheck.output);
    process.exit(1);
  }

  fs.copyFileSync(latestBackup, TARGET);
  console.log(`↩️ 已先恢復：${path.relative(ROOT, latestBackup)}`);
}

let code = fs.readFileSync(TARGET, "utf8");

function findMatching(text, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (ch === quote) {
        quote = null;
      }

      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;

    if (depth === 0) return i;
  }

  return -1;
}

function findFunctionSpan(text, funcName, fromIndex = 0) {
  const re = new RegExp(`function\\s+${funcName}\\s*\\(`, "g");
  re.lastIndex = fromIndex;

  const m = re.exec(text);
  if (!m) return null;

  const start = m.index;
  const openParen = text.indexOf("(", re.lastIndex - 1);
  const closeParen = findMatching(text, openParen, "(", ")");

  if (closeParen < 0) {
    throw new Error(`找不到 ${funcName}() 參數結尾 )`);
  }

  const openBrace = text.indexOf("{", closeParen);

  if (openBrace < 0) {
    throw new Error(`找不到 ${funcName}() 函式本體 {`);
  }

  const closeBrace = findMatching(text, openBrace, "{", "}");

  if (closeBrace < 0) {
    throw new Error(`找不到 ${funcName}() 函式本體結尾 }`);
  }

  let end = closeBrace + 1;

  while (end < text.length && /\s/.test(text[end])) {
    end++;
  }

  return {
    start,
    openBrace,
    closeBrace,
    end
  };
}

function removeAllFunctions(text, funcName) {
  while (true) {
    const span = findFunctionSpan(text, funcName);

    if (!span) return text;

    text = text.slice(0, span.start) + "\n" + text.slice(span.end);
  }
}

function replaceFunctionBody(text, funcName, body) {
  const span = findFunctionSpan(text, funcName);

  if (!span) {
    throw new Error(`找不到 ${funcName}()，無法套用修補`);
  }

  return (
    text.slice(0, span.openBrace + 1) +
    "\n" +
    body.trimEnd() +
    "\n" +
    text.slice(span.closeBrace)
  );
}

// 不再使用 zero-aware helper，全部移除。
for (const fn of [
  "isOfficialLineScoreCell",
  "hasOfficialLineScoreRow",
  "hasZeroAwareLiveLineScore"
]) {
  code = removeAllFunctions(code, fn);
}

// 所有呼叫改回既有 hasAsymmetricLiveLineScore，避免 undefined / 重複宣告。
code = code.replace(/\bhasZeroAwareLiveLineScore\s*\(/g, "hasAsymmetricLiveLineScore(");

const zeroAwareBody = `
  const officialCell = value => {
    if (value === "X") return true;
    if (value === null || value === undefined || value === "") return false;

    const n = numberOrNull(value);

    // 0 是有效逐局分數；不能把 0:0 比賽的逐局當成空。
    return n !== null;
  };

  const away = Array.isArray(lineScore.away) ? lineScore.away : [];
  const home = Array.isArray(lineScore.home) ? lineScore.home : [];

  return away.some(officialCell) || home.some(officialCell);
`;

code = replaceFunctionBody(code, "hasAsymmetricLiveLineScore", zeroAwareBody);

code = code.replace(
  /const VERSION = "v[^"]+";/,
  'const VERSION = "v5.0-25-4-LIVE-LINESCORE-ZERO-GAME-SAFE-REPAIR";'
);

fs.writeFileSync(TARGET, code, "utf8");

console.log("🔧 已移除 zero-aware 重複 helper，並套用 0 分逐局有效判斷。");

const finalCheck = checkSyntax(TARGET);

if (!finalCheck.ok) {
  console.error("❌ node --check 仍失敗：");
  console.error(finalCheck.output);
  console.error(`目前檔案備份：${path.relative(ROOT, preRepairBackup)}`);
  process.exit(1);
}

console.log("✅ node --check 通過");
console.log("下一步請跑：");
console.log("node scripts/fetch-cpbl-live-inplay-today.js");
