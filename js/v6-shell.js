(() => {
  const THEME_KEY = "cpbl-theme";
  const VALID_THEMES = new Set(["light", "dark"]);

  function getPreferredTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (VALID_THEMES.has(saved)) return saved;
    } catch {}
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme, persist = false) {
    const next = VALID_THEMES.has(theme) ? theme : getPreferredTheme();
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    if (document.body) document.body.dataset.theme = next;
    if (persist) {
      try { localStorage.setItem(THEME_KEY, next); } catch {}
    }
    const button = document.getElementById("uiThemeToggle");
    if (button) {
      const isDark = next === "dark";
      const icon = isDark ? "☀" : "◐";
      const label = isDark ? "淺色模式" : "深色模式";
      button.innerHTML = `<span class="ui-theme-icon" aria-hidden="true">${icon}</span><span class="ui-theme-label">${label}</span>`;
      button.setAttribute("aria-label", isDark ? "切換為淺色模式" : "切換為深色模式");
      button.setAttribute("title", isDark ? "目前為深色模式，點擊切換淺色" : "目前為淺色模式，點擊切換深色");
      button.setAttribute("aria-pressed", String(isDark));
    }
    window.dispatchEvent(new CustomEvent("cpbl-theme-change", { detail: next }));
  }

  // theme-bootstrap.js 已在 <head> 同步套用；此處再保險校正一次。
  applyTheme(document.documentElement.dataset.theme || getPreferredTheme(), false);
  const pages = [
    ["index.html", "首頁", "home"], ["schedule.html", "賽程", "schedule"],
    ["standings.html", "戰績", "standings"], ["teams.html", "球隊", "teams"],
    ["rules.html", "棒球規則", "rules"], ["season.html", "賽季", "season"],
    ["version.html", "版本", "version"], ["about.html", "網站介紹", "about"]
  ];
  const pageMeta = {
    home: {
      eyebrow: "RAY'S CPBL DATA SITE",
      title: "中職非官方數據中心",
      subtitle: "即時比分、賽程、戰績、球隊資訊與智慧比賽分析，一站掌握中華職棒。",
      actions: [["schedule.html","查看今日賽程"],["standings.html","查看戰績"],["match.html","Match Center"]]
    },
    schedule: {
      eyebrow: "CPBL SCHEDULE",
      title: "賽程中心",
      subtitle: "查詢一軍賽程、比分、先發資訊與比賽狀態，支援列表、月曆與多條件篩選。",
      actions: [["#btnReloadGames","重新整理","proxy"],["farm-schedule.html","二軍賽程"],["index.html","回首頁"]]
    },
    standings: {
      eyebrow: "CPBL STANDINGS",
      title: "球隊戰績",
      subtitle: "全年、上下半季與對戰成績統一呈現，快速掌握排名、勝差與近期走勢。",
      actions: [["schedule.html","查看賽程"],["season.html","賽季中心"],["teams.html","球隊總覽"]]
    },
    teams: {
      eyebrow: "TEAMS & ROSTERS",
      title: "球隊列表",
      subtitle: "瀏覽六隊完整資訊、球員名單、球隊賽程、數據分析與異動紀錄。",
      actions: [["#teamSearch","搜尋球隊","focus"],["standings.html","查看戰績"],["schedule.html","查看賽程"]]
    },
    rules: {
      eyebrow: "BASEBALL RULEBOOK",
      title: "棒球規則教室",
      subtitle: "用清楚易懂的方式理解攻守交換、出局、跑壘、得分與常見判決。",
      actions: [["#rulesQuickStart","快速看懂棒球","anchor"],["assets/pdf/baseball-rules.pdf","開啟規則 PDF"],["schedule.html","查看賽程"]]
    },
    season: {
      eyebrow: "2026 CPBL SEASON",
      title: "賽季中心",
      subtitle: "整合上下半季進程、球隊表現與重要賽季節點，掌握 2026 賽季全貌。",
      actions: [["standings.html","查看戰績"],["schedule.html","查看賽程"],["teams.html","球隊總覽"]]
    },
    version: {
      eyebrow: "PRODUCT CHANGELOG",
      title: "CPBL Data Site 更新日誌",
      subtitle: "記錄網站功能升級、資料穩定化、Match Center 與自動更新架構。",
      actions: [["index.html","返回首頁"],["season.html","賽季中心"],["data-quality.html","資料品質"]]
    },
    about: {
      eyebrow: "ABOUT RAY'S CPBL DATA SITE",
      title: "網站介紹",
      subtitle: "以中華職棒資料整理、即時比分、比賽中心與球隊資訊為核心的非官方數據網站。",
      actions: [["index.html","進入首頁"],["match.html","Match Center"],["version.html","版本紀錄"]]
    }
  };
  const teamLinks = [
    ["brothers", "中信兄弟", "brothers.png"], ["lions", "統一獅", "lions.png"],
    ["monkeys", "樂天桃猿", "monkeys.png"], ["dragons", "味全龍", "dragons.png"],
    ["guardians", "富邦悍將", "guardians.png"], ["hawks", "台鋼雄鷹", "hawks.png"]
  ];
  const body = document.body;
  const rootPrefix = body.dataset.siteRoot || "";
  const href = path => `${rootPrefix}${path}`;
  const current = location.pathname.split("/").pop() || "index.html";
  const activePage = pages.find(([file]) => file === current)?.[2] || body.dataset.page || "";

  function rebuildNav() {
    const nav = document.querySelector("nav.nav");
    if (!nav) return;
    nav.innerHTML = `
      <div class="nav-inner">
        <div class="nav-left">
          <a class="brand" href="${href("index.html")}" aria-label="Ray's CPBL Data 首頁">CPBL</a>
          ${pages.map(([file,label,key]) => `<a class="nav-link${key===activePage?' active':''}" href="${href(file)}">${label}</a>`).join("")}
        </div>
        <div class="nav-teams" aria-label="球隊快速入口">
          ${teamLinks.map(([key,label,img]) => `<a href="${href(`team.html?team=${key}`)}" title="${label}"><img src="${href(`assets/logo/${img}`)}" alt="${label}"></a>`).join("")}
        </div>
        <div class="ui-nav-tools">
          <button class="ui-nav-btn ui-theme-toggle" id="uiThemeToggle" type="button" aria-label="切換深淺色"><span class="ui-theme-icon" aria-hidden="true">◐</span><span class="ui-theme-label">深色模式</span></button>
          <button class="ui-nav-btn ui-menu-btn" id="uiMenuToggle" type="button" aria-label="開啟選單" aria-expanded="false">☰</button>
        </div>
      </div>
      <div class="ui-mobile-menu" id="uiMobileMenu">
        ${pages.map(([file,label,key]) => `<a class="${key===activePage?'active':''}" href="${href(file)}">${label}</a>`).join("")}
        <a href="${href("match.html")}">比賽中心</a>
        <a href="${href("farm-schedule.html")}">二軍賽程</a>
        <a href="${href("search.html")}">全站搜尋</a>
      </div>`;
  }

  function buildAction([target, label, type]) {
    if (type === "proxy" || type === "focus") return `<button type="button" class="ui-masthead-action" data-ui-action="${type}" data-ui-target="${target}">${label}</button>`;
    if (type === "anchor") return `<a class="ui-masthead-action" href="${target}">${label}</a>`;
    return `<a class="ui-masthead-action" href="${href(target)}">${label}</a>`;
  }

  function rebuildMainMasthead() {
    const meta = pageMeta[activePage];
    const nav = document.querySelector("nav.nav");
    if (!meta || !nav || document.querySelector(".ui-main-masthead")) return;
    body.classList.add("ui-unified-main-page");
    const masthead = document.createElement("section");
    masthead.className = "ui-main-masthead";
    masthead.setAttribute("aria-labelledby", "uiMainPageTitle");
    masthead.innerHTML = `
      <div class="ui-main-masthead-inner">
        <p class="ui-main-eyebrow">${meta.eyebrow}</p>
        <h1 id="uiMainPageTitle">${meta.title}</h1>
        <p class="ui-main-subtitle">${meta.subtitle}</p>
        <div class="ui-main-actions">${meta.actions.map(buildAction).join("")}</div>
      </div>`;
    nav.insertAdjacentElement("afterend", masthead);

    const route = document.createElement("div");
    route.className = "ui-route-row";
    route.innerHTML = `<nav class="ui-route" aria-label="麵包屑"><a href="${href("index.html")}">首頁</a><span>›</span><strong>${meta.title}</strong></nav>`;
    masthead.insertAdjacentElement("afterend", route);

    document.querySelectorAll(".ui-masthead-action[data-ui-action]").forEach(control => {
      control.addEventListener("click", () => {
        const target = document.querySelector(control.dataset.uiTarget);
        if (!target) return;
        if (control.dataset.uiAction === "focus") {
          target.scrollIntoView({ behavior:"smooth", block:"center" });
          target.focus();
        } else target.click();
      });
    });
  }

  function addAccessibility() {
    if (!document.querySelector(".ui-skip-link")) {
      const skip = document.createElement("a");
      skip.className = "ui-skip-link";
      skip.href = "#mainContent";
      skip.textContent = "跳到主要內容";
      document.body.prepend(skip);
    }
    const main = document.querySelector("main");
    if (main && !main.id) main.id = "mainContent";
  }

  function addPageContext() {
    if (pageMeta[activePage]) return;
    const main = document.querySelector("main.container");
    if (!main || main.querySelector(":scope > .ui-page-context") || current === "index.html") return;
    const title = document.querySelector("h1")?.textContent?.trim() || document.title.split("｜")[0];
    const context = document.createElement("div");
    context.className = "ui-page-context";
    context.innerHTML = `<div class="ui-breadcrumb"><a href="${href("index.html")}">首頁</a><span>›</span><span>${title}</span></div><span class="ui-page-badge">● 資料驅動頁面</span>`;
    main.prepend(context);
  }

  function bindTools() {
    const themeBtn = document.getElementById("uiThemeToggle");
    applyTheme(document.documentElement.dataset.theme || getPreferredTheme(), false);
    themeBtn?.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next, true);
    });
    const menuBtn = document.getElementById("uiMenuToggle");
    const menu = document.getElementById("uiMobileMenu");
    menuBtn?.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.textContent = open ? "✕" : "☰";
    });
    document.addEventListener("click", e => {
      if (!menu?.classList.contains("open")) return;
      if (!menu.contains(e.target) && !menuBtn.contains(e.target)) {
        menu.classList.remove("open"); menuBtn.setAttribute("aria-expanded","false"); menuBtn.textContent="☰";
      }
    });
  }

  function bindThemeSynchronization() {
    window.addEventListener("storage", event => {
      if (event.key === THEME_KEY && VALID_THEMES.has(event.newValue)) {
        applyTheme(event.newValue, false);
      }
    });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", event => {
      let hasSaved = false;
      try { hasSaved = VALID_THEMES.has(localStorage.getItem(THEME_KEY)); } catch {}
      if (!hasSaved) applyTheme(event.matches ? "dark" : "light", false);
    });
  }

  function enhanceTables() {
    const knownScrollable = [
      ".ui-table-scroll", ".table-wrap", ".standings-table-wrap",
      ".standings-official-table-wrap", ".schedule-table-wrap",
      ".team-stats-table-wrap", ".match-table-wrap", ".stats-table-wrap"
    ].join(",");

    document.querySelectorAll("table").forEach((table, index) => {
      let wrapper = table.closest(knownScrollable);
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "ui-table-scroll";
        wrapper.setAttribute("role", "region");
        wrapper.setAttribute("aria-label", table.getAttribute("aria-label") || `資料表 ${index + 1}`);
        wrapper.tabIndex = 0;
        table.parentNode?.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      } else {
        wrapper.classList.add("ui-table-scroll");
        if (!wrapper.hasAttribute("tabindex")) wrapper.tabIndex = 0;
      }

      const updateOverflowState = () => {
        wrapper.dataset.overflowing = String(wrapper.scrollWidth > wrapper.clientWidth + 2);
      };
      updateOverflowState();
      requestAnimationFrame(updateOverflowState);
      if (window.ResizeObserver) new ResizeObserver(updateOverflowState).observe(wrapper);
    });
  }

  function addBackTop() {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "ui-back-top"; btn.textContent = "↑"; btn.setAttribute("aria-label", "回到頂端");
    document.body.append(btn);
    const update = () => btn.classList.toggle("visible", scrollY > 500);
    addEventListener("scroll", update, { passive:true }); update();
    btn.addEventListener("click", () => scrollTo({ top:0, behavior:"smooth" }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    rebuildNav(); rebuildMainMasthead(); addAccessibility(); addPageContext(); bindTools(); bindThemeSynchronization(); enhanceTables(); addBackTop();
    document.documentElement.classList.add("v6-ui-ready");
  });
})();
