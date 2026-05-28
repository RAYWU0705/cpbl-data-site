import puppeteer from "puppeteer";

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.goto("https://www.cpbl.com.tw/schedule", {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await new Promise(r => setTimeout(r, 3000));

  const selects = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("select")).map((select, index) => ({
      index,
      value: select.value,
      options: Array.from(select.options).map(opt => ({
        value: opt.value,
        text: opt.textContent.trim()
      }))
    }));
  });

  console.log(JSON.stringify(selects, null, 2));

  console.log("✅ 看終端機輸出，確認哪個 select 是年份、哪個是月份");
}

main().catch(err => {
  console.error("❌ 失敗：", err);
});