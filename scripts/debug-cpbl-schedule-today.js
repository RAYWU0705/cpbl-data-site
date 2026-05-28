import puppeteer from "puppeteer";

const SEASON_YEAR = 2026;

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  const url = `https://www.cpbl.com.tw/schedule?year=${SEASON_YEAR}`;

  console.log("🌐 打開：", url);

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await new Promise(r => setTimeout(r, 5000));

  const today = getToday();

  const info = await page.evaluate((today) => {
    const text = document.body.innerText || "";

    const lines = text
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    const todayLines = lines.filter(line => line.includes(today));

    const gameSnoMatches = [...text.matchAll(/gameSno=(\d+)/g)]
      .map(m => Number(m[1]));

    const uniqueGameSnos = [...new Set(gameSnoMatches)];

    return {
      title: document.title,
      url: location.href,
      textLength: text.length,
      today,
      todayLines,
      uniqueGameSnos,
      preview: text.slice(0, 1500)
    };
  }, today);

  console.log("📄 title:", info.title);
  console.log("📌 url:", info.url);
  console.log("🧾 textLength:", info.textLength);
  console.log("📅 today:", info.today);
  console.log("📅 含今天日期的行:", info.todayLines);
  console.log("🎮 頁面找到 gameSno:", info.uniqueGameSnos);
  console.log("----- preview -----");
  console.log(info.preview);

  console.log("✅ 瀏覽器先不要關，請看畫面是不是官方賽程頁。");
}

main().catch(err => {
  console.error("❌ 失敗：", err);
});