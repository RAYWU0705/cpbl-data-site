import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SEASON_YEAR = 2026;
const KIND_CODE = "A";
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

async function snapshotTables(page, label) {
  return await page.evaluate((label) => {
    const bodyText = document.body?.innerText || "";

    const lines = bodyText
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    const tables = Array.from(document.querySelectorAll("table")).map((table, tableIndex) => {
      const headers = Array.from(table.querySelectorAll("thead th, tr th"))
        .map(th => th.innerText.trim())
        .filter(Boolean);

      const rows = Array.from(table.querySelectorAll("tr"))
        .map((tr, rowIndex) => {
          const cells = Array.from(tr.querySelectorAll("th, td"))
            .map(td => td.innerText.trim())
            .filter(Boolean);

          return {
            rowIndex,
            cells
          };
        })
        .filter(row => row.cells.length);

      return {
        tableIndex,
        className: table.className,
        headers,
        rowCount: rows.length,
        rows: rows.slice(0, 25)
      };
    });

    const buttons = Array.from(document.querySelectorAll("button, a, li, span, div"))
      .map((el, index) => ({
        index,
        tag: el.tagName,
        text: el.innerText?.trim()?.slice(0, 80) || "",
        className: typeof el.className === "string" ? el.className : "",
        href: el.href || "",
        role: el.getAttribute("role") || "",
        aria: el.getAttribute("aria-label") || ""
      }))
      .filter(x =>
        x.text &&
        (
          x.text.includes("樂天桃猿") ||
          x.text.includes("統一7-ELEVEn獅") ||
          x.text.includes("打擊") ||
          x.text.includes("投手") ||
          x.text.includes("打者") ||
          x.text.includes("野手") ||
          x.text.includes("Box") ||
          x.text.includes("BOX")
        )
      );

    return {
      label,
      title: document.title,
      url: location.href,
      textLength: bodyText.length,
      preview: bodyText.slice(0, 1500),
      importantLines: lines.filter(line =>
        line.includes("樂天桃猿") ||
        line.includes("統一7-ELEVEn獅") ||
        line.includes("打數") ||
        line.includes("投球局數") ||
        line.includes("打擊率") ||
        line.includes("防禦率")
      ).slice(0, 120),
      tableCount: tables.length,
      tables,
      buttons
    };
  }, label);
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

  const snapshots = [];

  snapshots.push(await snapshotTables(page, "initial"));

  // 嘗試點所有跟隊名 / 打者 / 投手相關的可點元素
  const clickableCandidates = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("button, a, li, span, div"))
      .map((el, index) => ({
        index,
        tag: el.tagName,
        text: el.innerText?.trim() || "",
        className: typeof el.className === "string" ? el.className : ""
      }))
      .filter(x =>
        x.text &&
        x.text.length <= 80 &&
        (
          x.text.includes("樂天桃猿") ||
          x.text.includes("統一7-ELEVEn獅") ||
          x.text.includes("打擊") ||
          x.text.includes("投手") ||
          x.text.includes("打者") ||
          x.text.includes("野手")
        )
      )
      .slice(0, 30);
  });

  console.log("🔎 可疑可點元素：");
  console.table(clickableCandidates);

  for (const candidate of clickableCandidates) {
    try {
      console.log(`🖱 嘗試點擊：${candidate.index} ${candidate.tag} ${candidate.text}`);

      await page.evaluate((targetIndex) => {
        const elements = Array.from(document.querySelectorAll("button, a, li, span, div"));
        const el = elements[targetIndex];
        if (el) el.click();
      }, candidate.index);

      await sleep(1500);

      snapshots.push(await snapshotTables(page, `clicked-${candidate.index}-${candidate.text}`));

    } catch (err) {
      console.log(`⚠️ 點擊失敗：${candidate.text}｜${err.message}`);
    }
  }

  await fs.writeFile(
    path.join(DEBUG_DIR, `player-tables-${TEST_GAME_SNO}.json`),
    JSON.stringify(
      {
        gameSno: TEST_GAME_SNO,
        url,
        snapshots
      },
      null,
      2
    ),
    "utf-8"
  );

  await page.screenshot({
    path: path.join(DEBUG_DIR, `player-tables-${TEST_GAME_SNO}.png`),
    fullPage: true
  });

  console.log("\n✅ 已輸出：");
  console.log(`debug/player-tables-${TEST_GAME_SNO}.json`);
  console.log(`debug/player-tables-${TEST_GAME_SNO}.png`);

  console.log("\n========== initial 表格摘要 ==========");
  const initial = snapshots[0];
  initial.tables.forEach(table => {
    console.log(`\n--- table ${table.tableIndex} ---`);
    console.log("headers:", table.headers);
    console.log("rowCount:", table.rowCount);
    console.log("rows sample:", table.rows.slice(0, 4));
  });

  console.log("\n========== 偵錯完成 ==========");
  console.log("先不要關瀏覽器，可以看畫面是否有隊伍切換或打者/投手 tab。");
}

main().catch(err => {
  console.error("❌ 失敗：", err);
  process.exit(1);
});