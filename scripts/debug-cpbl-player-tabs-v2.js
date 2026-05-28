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

async function snapshot(page, label) {
  return await page.evaluate((label) => {
    function getRows(table) {
      return Array.from(table.querySelectorAll("tr"))
        .map((tr, rowIndex) => ({
          rowIndex,
          cells: Array.from(tr.querySelectorAll("th, td"))
            .map(td => td.innerText.trim())
            .filter(Boolean)
        }))
        .filter(row => row.cells.length);
    }

    const tabs = Array.from(document.querySelectorAll(".GameBoxDetail .tabs li"))
      .map((li, index) => ({
        index,
        text: li.innerText.trim(),
        className: li.className
      }));

    const tables = Array.from(document.querySelectorAll(".GameBoxDetail table"))
      .map((table, tableIndex) => {
        const rows = getRows(table);
        const headers = rows[0]?.cells || [];

        return {
          tableIndex,
          headers,
          rowCount: rows.length,
          rows: rows.slice(0, 8)
        };
      });

    return {
      label,
      url: location.href,
      tabs,
      tableCount: tables.length,
      tables
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

  const tabs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".GameBoxDetail .tabs li a"))
      .map((a, index) => ({
        index,
        text: a.innerText.trim(),
        href: a.getAttribute("href")
      }));
  });

  console.log("🔎 GameBoxDetail tabs：");
  console.table(tabs);

  snapshots.push(await snapshot(page, "initial"));

  for (let i = 0; i < tabs.length; i++) {
    console.log(`🖱 點 GameBoxDetail tab ${i}: ${tabs[i].text}`);

    await page.evaluate((tabIndex) => {
      const links = Array.from(document.querySelectorAll(".GameBoxDetail .tabs li a"));
      links[tabIndex]?.click();
    }, i);

    await sleep(1500);

    snapshots.push(await snapshot(page, `tab-${i}-${tabs[i].text}`));
  }

  const output = {
    gameSno: TEST_GAME_SNO,
    url,
    snapshots
  };

  await fs.writeFile(
    path.join(DEBUG_DIR, `player-tabs-v2-${TEST_GAME_SNO}.json`),
    JSON.stringify(output, null, 2),
    "utf-8"
  );

  await page.screenshot({
    path: path.join(DEBUG_DIR, `player-tabs-v2-${TEST_GAME_SNO}.png`),
    fullPage: true
  });

  console.log("\n========== snapshots 摘要 ==========");

  snapshots.forEach(s => {
    console.log(`\n--- ${s.label} ---`);
    console.log("tabs:", s.tabs);
    console.log("tableCount:", s.tableCount);

    s.tables.forEach(t => {
      console.log(`table ${t.tableIndex}`);
      console.log("headers:", t.headers);
      console.log("first rows:", t.rows.slice(0, 3));
    });
  });

  console.log("\n✅ 已輸出：");
  console.log(`debug/player-tabs-v2-${TEST_GAME_SNO}.json`);
  console.log(`debug/player-tabs-v2-${TEST_GAME_SNO}.png`);
}

main().catch(err => {
  console.error("❌ 失敗：", err);
  process.exit(1);
});