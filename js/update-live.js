// =========================
// 一鍵更新今日比分（新版🔥）
// =========================

async function updateLiveGames() {
  try {
    alert("開始更新比分...");

    // 🔥 改成打你自己的 server
    const res = await fetch("http://localhost:3002/api/live");

    if (!res.ok) throw new Error("API失敗");

    const data = await res.json();

    console.log("🔥 LIVE DATA:", data);

    // 🔥 存到 localStorage（給 match.js 用）
    localStorage.setItem("liveBoxscore", JSON.stringify(data));

    alert("✅ 更新成功！");

    // 🔥 重新整理畫面（讓比分出現）
    location.reload();

  } catch (err) {
    console.error(err);
    alert("❌ 更新失敗");
  }
}