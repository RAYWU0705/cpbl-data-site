/* =========================
   CPBL Team Theme (Final)
   ========================= */

// ✅ 只在 team.html 且有 team 參數時才執行
if (
  !location.pathname.endsWith("team.html") ||
  !location.search.includes("team=")
) {
  // 不是球隊詳細頁，直接不做任何事
} else {

  /* ===== 讀取 team 參數 ===== */
  const urlParams = new URLSearchParams(location.search);
  const teamId = urlParams.get("team");

  /* ===== 六隊主題設定 ===== */
  const teamThemes = {
    brothers: {
      name: "中信兄弟",
      color: "#1b1b1b",     // 文字深色
      bg: "#ffe600"         // 黃色背景
    },
    lions: {
      name: "統一獅",
      color: "#ffffff",
      bg: "#e47600ff"
    },
    monkeys: {
      name: "樂天桃猿",
      color: "#ffffff",
      bg: "#6b0b0bff"
    },
    guardians: {
      name: "富邦悍將",
      color: "#ffffff",
      bg: "#003a8f"
    },
    dragons: {
      name: "味全龍",
      color: "#ffffff",
      bg: "#c40000"
    },
    hawks: {
      name: "台鋼雄鷹",
      color: "#f5c400",     // 金色字
      bg: "#1f1f1f"         // 黑灰底（黑金風）
    }
  };

  /* ===== fallback（理論上不會用到） ===== */
  const fallbackTheme = {
    color: "#222",
    bg: "#f4f6f8"
  };

  const theme = teamThemes[teamId] || fallbackTheme;

  /* ===== 套用 CSS 變數 ===== */
  const root = document.documentElement;

  root.style.setProperty("--team-color", theme.color);
  root.style.setProperty("--team-bg", theme.bg);

  /* ===== 限定只影響球隊主題區 ===== */
  document.body.classList.add("team-themed");
}
