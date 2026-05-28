import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SEASON_YEAR = 2026;
const KIND_CODE = "A";

// 先用已結束、有資料的比賽測
const TEST_GAME_SNO = 74;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEBUG_DIR = path.join(__dirname, "../debug");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildOfficialUrl(gameSno) {
  return `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`;
}

async function main() {
  await fs.mkdir(DEBUG_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  const url = buildOfficialUrl(TEST_GAME_SNO);

  console.log("🌐 打開：", url);

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await sleep(4000);

  const data = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";

    const lines = bodyText
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    const tables = Array.from(document.querySelectorAll("table")).map((table, tableIndex) => {
      const caption = table.querySelector("caption")?.innerText?.trim() || "";

      const headers = Array.from(table.querySelectorAll("thead th, tr th"))
        .map(th => th.innerText.trim())
        .filter(Boolean);

      const rows = Array.from(table.querySelectorAll("tr")).map((tr, rowIndex) => {
        const cells = Array.from(tr.querySelectorAll("th, td"))
          .map(td => td.innerText.trim())
          .filter(Boolean);

        return {
          rowIndex,
          cells
        };
      }).filter(row => row.cells.length);

      return {
        tableIndex,
        caption,
        className: table.className,
        headers,
        rowCount: rows.length,
        rows: rows.slice(0, 20)
      };
    });

    const possibleScoreLines = lines.filter(line =>
      /\d+\s*:\s*\d+/.test(line) ||
      line.includes("勝投") ||
      line.includes("敗投") ||
      line.includes("MVP") ||
      line.includes("救援")
    );

    const allClasses = Array.from(document.querySelectorAll("*"))
      .map(el => el.className)
      .filter(v => typeof v === "string" && v.trim())
      .flatMap(v => v.split(/\s+/))
      .filter(Boolean);

    const classCounts = {};
    allClasses.forEach(cls => {
      classCounts[cls] = (classCounts[cls] || 0) + 1;
    });

    const topClasses = Object.entries(classCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([className, count]) => ({ className, count }));

    return {
      title: document.title,
      url: location.href,
      textLength: bodyText.length,
      preview: bodyText.slice(0, 2500),
      lines: lines.slice(0, 180),
      possibleScoreLines,
      tableCount: tables.length,
      tables,
      topClasses
    };
  });

  const html = await page.content();

  await fs.writeFile(
    path.join(DEBUG_DIR, `boxscore-${TEST_GAME_SNO}.html`),
    html,
    "utf-8"
  );

  await fs.writeFile(
    path.join(DEBUG_DIR, `boxscore-${TEST_GAME_SNO}.json`),
    JSON.stringify(data, null, 2),
    "utf-8"
  );

  await page.screenshot({
    path: path.join(DEBUG_DIR, `boxscore-${TEST_GAME_SNO}.png`),
    fullPage: true
  });

  console.log("📄 title:", data.title);
  console.log("📌 url:", data.url);
  console.log("🧾 textLength:", data.textLength);
  console.log("📊 tableCount:", data.tableCount);

  console.log("\n========== 可能比分 / 勝敗投 / MVP 行 ==========");
  console.log(data.possibleScoreLines);

  console.log("\n========== 表格摘要 ==========");
  data.tables.forEach(table => {
    console.log(`\n--- table ${table.tableIndex} ---`);
    console.log("class:", table.className);
    console.log("caption:", table.caption);
    console.log("headers:", table.headers);
    console.log("rowCount:", table.rowCount);
    console.log("rows sample:", table.rows.slice(0, 5));
  });

  console.log("\n✅ 已輸出偵錯檔：");
  console.log(`debug/boxscore-${TEST_GAME_SNO}.html`);
  console.log(`debug/boxscore-${TEST_GAME_SNO}.json`);
  console.log(`debug/boxscore-${TEST_GAME_SNO}.png`);
  console.log("\n先不要關瀏覽器，你也可以直接看頁面有哪些表格。");
}

main().catch(err => {
  console.error("❌ 失敗：", err);
  process.exit(1);
});