import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const SEASON_YEAR = 2026;
const KIND_CODE = "A";

const TARGET_GAMES = [99, 100, 101];

const TEAM_NAMES = [
  "中信兄弟",
  "統一7-ELEVEn獅",
  "樂天桃猿",
  "富邦悍將",
  "味全龍",
  "台鋼雄鷹"
];

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_DIR = path.join(__dirname, "../debug/probe");
const OUT_JSON = path.join(OUT_DIR, "cpbl-game-source-probe.json");
const OUT_TXT = path.join(OUT_DIR, "cpbl-game-source-probe-summary.txt");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function getChromeExecutablePath() {
  for (const chromePath of CHROME_PATHS) {
    if (await fileExists(chromePath)) {
      return chromePath;
    }
  }

  return null;
}

function cleanText(v) {
  return String(v || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildUrls(gameSno) {
  return [
    {
      name: "box-index",
      url: `https://www.cpbl.com.tw/box/index?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}`
    },
    {
      name: "box-presentStatus-0",
      url: `https://www.cpbl.com.tw/box?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}&presentStatus=0`
    },
    {
      name: "box-presentStatus-1",
      url: `https://www.cpbl.com.tw/box?year=${SEASON_YEAR}&kindCode=${KIND_CODE}&gameSno=${gameSno}&presentStatus=1`
    },
    {
      name: "schedule",
      url: `https://www.cpbl.com.tw/schedule?year=${SEASON_YEAR}`
    },
    {
      name: "home",
      url: "https://www.cpbl.com.tw/"
    }
  ];
}

function looksUsefulUrl(url) {
  const s = String(url || "").toLowerCase();

  return (
    s.includes("box") ||
    s.includes("game") ||
    s.includes("live") ||
    s.includes("score") ||
    s.includes("play") ||
    s.includes("record") ||
    s.includes("ajax") ||
    s.includes("api") ||
    s.includes("schedule") ||
    s.includes("json")
  );
}

function looksUsefulText(text, gameSno) {
  const s = cleanText(text);

  if (!s) return false;

  const hasGameSno =
    s.includes(String(gameSno)) ||
    s.includes(`"${gameSno}"`) ||
    s.includes(`:${gameSno}`) ||
    s.includes(`gameSno`);

  const hasTeam =
    TEAM_NAMES.some(team => s.includes(team));

  const hasBaseballWords =
    [
      "打者",
      "投手",
      "打數",
      "投球局數",
      "安打",
      "打點",
      "防禦率",
      "局上",
      "局下",
      "比賽中",
      "LIVE",
      "BOX",
      "Box",
      "score",
      "batter",
      "pitcher",
      "inning"
    ].some(k => s.includes(k));

  return hasGameSno || (hasTeam && hasBaseballWords);
}

function safeSlice(text, len = 1200) {
  return cleanText(text).slice(0, len);
}

async function setupPage(browser) {
  const page = await browser.newPage();

  await page.setViewport({
    width: 1500,
    height: 2200,
    deviceScaleFactor: 1
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  page.setDefaultTimeout(30000);

  return page;
}

async function probeOneUrl(browser, gameSno, target) {
  const page = await setupPage(browser);

  const network = [];
  const responses = [];

  page.on("request", req => {
    const url = req.url();

    if (looksUsefulUrl(url)) {
      network.push({
        type: "request",
        method: req.method(),
        url,
        resourceType: req.resourceType()
      });
    }
  });

  page.on("response", async res => {
    const url = res.url();
    const status = res.status();
    const headers = res.headers();
    const contentType = headers["content-type"] || "";

    if (!looksUsefulUrl(url)) return;

    const item = {
      type: "response",
      url,
      status,
      contentType,
      usefulByUrl: looksUsefulUrl(url),
      usefulByText: false,
      sample: ""
    };

    try {
      if (
        contentType.includes("json") ||
        contentType.includes("text") ||
        contentType.includes("html") ||
        contentType.includes("javascript")
      ) {
        const text = await res.text();

        item.usefulByText = looksUsefulText(text, gameSno);
        item.sample = safeSlice(text, 1500);
      }
    } catch {
      item.sample = "";
    }

    responses.push(item);
  });

  console.log("");
  console.log(`🔎 Probe gameSno=${gameSno}｜${target.name}`);
  console.log(target.url);

  let pageInfo = null;

  try {
    await page.goto(target.url, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    await sleep(3500);

    pageInfo = await page.evaluate((TEAM_NAMES_IN_PAGE) => {
      function cleanTextInPage(v) {
        return String(v || "")
          .replace(/\u00a0/g, " ")
          .replace(/\r/g, "\n")
          .replace(/[ \t]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      const bodyText = cleanTextInPage(document.body?.innerText || "");

      const tables = Array.from(document.querySelectorAll("table")).map((table, index) => {
        const rows = Array.from(table.querySelectorAll("tr"))
          .map(tr =>
            Array.from(tr.querySelectorAll("th, td"))
              .map(td => cleanTextInPage(td.innerText))
              .filter(Boolean)
          )
          .filter(row => row.length);

        return {
          index,
          rowCount: rows.length,
          text: rows.flat().join(" ").slice(0, 1500)
        };
      });

      const scripts = Array.from(document.scripts)
        .map(s => s.src || "")
        .filter(Boolean);

      const links = Array.from(document.querySelectorAll("a"))
        .map(a => ({
          text: cleanTextInPage(a.innerText || a.textContent || ""),
          href: a.href || ""
        }))
        .filter(a => a.href)
        .slice(0, 120);

      const teamHits = TEAM_NAMES_IN_PAGE.filter(team => bodyText.includes(team));

      return {
        finalUrl: location.href,
        title: document.title,
        bodyLength: bodyText.length,
        bodySample: bodyText.slice(0, 5000),
        teamHits,
        tableCount: tables.length,
        tables,
        scripts: scripts.slice(0, 100),
        links
      };
    }, TEAM_NAMES);

  } catch (err) {
    pageInfo = {
      error: err.message
    };
  }

  await page.close();

  const usefulResponses = responses.filter(r =>
    r.usefulByText ||
    r.contentType.includes("json") ||
    looksUsefulText(r.sample, gameSno)
  );

  const result = {
    gameSno,
    target,
    pageInfo,
    networkCount: network.length,
    responseCount: responses.length,
    usefulResponseCount: usefulResponses.length,
    network: network.slice(0, 200),
    usefulResponses: usefulResponses.slice(0, 80),
    responses: responses.slice(0, 120)
  };

  console.log(
    `   完成：network=${result.networkCount}｜responses=${result.responseCount}｜useful=${result.usefulResponseCount}`
  );

  if (pageInfo?.finalUrl && pageInfo.finalUrl !== target.url) {
    console.log(`   ⚠️ finalUrl: ${pageInfo.finalUrl}`);
  }

  if (usefulResponses.length) {
    console.log("   ✅ 發現可疑資料來源：");
    usefulResponses.slice(0, 5).forEach(r => {
      console.log(`      - ${r.status} ${r.contentType} ${r.url}`);
    });
  }

  return result;
}

function summarize(results) {
  const lines = [];

  lines.push("CPBL hidden source probe summary");
  lines.push(`season=${SEASON_YEAR}`);
  lines.push("");

  for (const group of results) {
    lines.push(`==============================`);
    lines.push(`gameSno=${group.gameSno}`);
    lines.push(`==============================`);

    for (const item of group.results) {
      lines.push("");
      lines.push(`[${item.target.name}]`);
      lines.push(item.target.url);

      if (item.pageInfo?.finalUrl) {
        lines.push(`finalUrl=${item.pageInfo.finalUrl}`);
      }

      if (item.pageInfo?.teamHits?.length) {
        lines.push(`teamHits=${item.pageInfo.teamHits.join(", ")}`);
      }

      lines.push(`tableCount=${item.pageInfo?.tableCount ?? "?"}`);
      lines.push(`usefulResponseCount=${item.usefulResponseCount}`);

      if (item.usefulResponses?.length) {
        lines.push("usefulResponses:");

        item.usefulResponses.slice(0, 10).forEach(r => {
          lines.push(`- ${r.status} ${r.contentType} ${r.url}`);
          if (r.sample) {
            lines.push(`  sample=${safeSlice(r.sample, 220)}`);
          }
        });
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  await fs.mkdir(OUT_DIR, {
    recursive: true
  });

  const executablePath = await getChromeExecutablePath();

  const launchOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  console.log("🧪 CPBL hidden source probe");
  console.log("Chrome:", executablePath || "puppeteer default");

  const browser = await puppeteer.launch(launchOptions);

  const allResults = [];

  for (const gameSno of TARGET_GAMES) {
    const targets = buildUrls(gameSno);
    const group = {
      gameSno,
      results: []
    };

    for (const target of targets) {
      const result = await probeOneUrl(browser, gameSno, target);
      group.results.push(result);
    }

    allResults.push(group);
  }

  await browser.close();

  await fs.writeFile(
    OUT_JSON,
    JSON.stringify(allResults, null, 2),
    "utf-8"
  );

  await fs.writeFile(
    OUT_TXT,
    summarize(allResults),
    "utf-8"
  );

  console.log("");
  console.log("✅ Probe 完成");
  console.log(`JSON：${OUT_JSON}`);
  console.log(`摘要：${OUT_TXT}`);
}

main().catch(err => {
  console.error("❌ Probe 失敗：", err);
  process.exit(1);
});