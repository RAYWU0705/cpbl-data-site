console.log("✅ team.js v5.0.6-TEAM-HOME-PRO 已載入");

/* =========================================================
   Ray's CPBL Data Site
   team.js
   v5.0.6-TEAM-HOME-PRO

   覆蓋位置：js/team.js

   重點：
   - 球隊總覽頁視覺升級
   - 不使用假資料
   - teams.json + live-boxscore.json + schedule-2026-03~11.json
   - 下一場、最近 5 場、球隊快速入口
   - 缺資料時顯示明確提示，不讓頁面空白
========================================================= */

document.addEventListener("DOMContentLoaded", initTeam);

function initTeam() {
  const VERSION = "v5.0.6-TEAM-HOME-PRO";

  const TEAM_ID_TO_NAME = {
    brothers: "中信兄弟",
    lions: "統一7-ELEVEn獅",
    monkeys: "樂天桃猿",
    dragons: "味全龍",
    guardians: "富邦悍將",
    hawks: "台鋼雄鷹"
  };

  const TEAM_ALIASES = {
    "中信兄弟": "brothers",
    "兄弟": "brothers",
    "統一7-ELEVEn獅": "lions",
    "統一7-ELEVEN獅": "lions",
    "統一獅": "lions",
    "樂天桃猿": "monkeys",
    "桃猿": "monkeys",
    "味全龍": "dragons",
    "富邦悍將": "guardians",
    "悍將": "guardians",
    "台鋼雄鷹": "hawks",
    "雄鷹": "hawks"
  };

  const TEAM_COLOR = {
    brothers: "#f6c400",
    lions: "#f26b21",
    monkeys: "#8a1538",
    dragons: "#c8102e",
    guardians: "#0047ab",
    hawks: "#007f7a"
  };

  const TEAM_COLOR_DARK = {
    brothers: "#9a7200",
    lions: "#b84300",
    monkeys: "#4d0619",
    dragons: "#7d0017",
    guardians: "#052e6d",
    hawks: "#00504e"
  };

  const TEAM_SHORT = {
    brothers: "Brothers",
    lions: "Uni-Lions",
    monkeys: "Monkeys",
    dragons: "Dragons",
    guardians: "Guardians",
    hawks: "Hawks"
  };

  const MONTH_FILES = [
    "03", "04", "05", "06", "07", "08", "09", "10", "11"
  ];

  const params = new URLSearchParams(location.search);
  const teamId = cleanText(params.get("team"));

  const pageTitle = document.getElementById("pageTitle");
  const pageSub = document.getElementById("pageSub");
  const detailBox = document.getElementById("teamDetail");
  const nextBox = document.querySelector("#nextGame .next-content");
  const recentBox = document.querySelector("#recentGames .next-content");

  if (!teamId) {
    renderFatal("缺少 team 參數，例如 team.html?team=brothers");
    return;
  }

  let teamsData = [];
  let scheduleGames = [];
  let liveGames = [];
  let allGames = [];

  bootstrap();

  async function bootstrap() {
    try {
      setPageTheme(teamId);

      const [teams, live, schedules] = await Promise.all([
        readJson("data/teams.json", []),
        readJson("data/live/live-boxscore.json", []),
        loadScheduleFiles()
      ]);

      teamsData = toArray(teams);
      liveGames = normalizeGameArray(live);
      scheduleGames = normalizeGameArray(schedules);
      allGames = mergeGames(scheduleGames, liveGames);

      renderTeamPage();

      console.log(`🏟 ${VERSION}｜${teamId}｜schedule=${scheduleGames.length}｜live=${liveGames.length}｜merged=${allGames.length}`);

    } catch (err) {
      console.error("❌ team.js 初始化失敗：", err);
      renderFatal(`球隊資料載入失敗：${err.message}`);
    }
  }

  async function loadScheduleFiles() {
    const results = await Promise.allSettled(
      MONTH_FILES.map(month => readJson(`data/live/live-boxscore.json`, []))
    );

    return results
      .filter(result => result.status === "fulfilled")
      .flatMap(result => toArray(result.value));
  }

  async function readJson(url, fallback) {
    try {
      const res = await fetch(`${url}?ts=${Date.now()}`, {
        cache: "no-store"
      });

      if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);

      return await res.json();

    } catch (err) {
      console.warn(`⚠️ ${url} 讀取失敗：`, err.message);
      return fallback;
    }
  }

  function renderTeamPage() {
    const team = findTeam(teamId);

    if (!team) {
      renderFatal(`找不到球隊：${escapeHtml(teamId)}`);
      return;
    }

    const teamName = team.name || TEAM_ID_TO_NAME[teamId] || teamId;
    const teamColor = TEAM_COLOR[teamId] || "#0b3c5d";
    const teamColorDark = TEAM_COLOR_DARK[teamId] || "#08263d";

    setPageTheme(teamId);
    setText(pageTitle, teamName);
    setText(pageSub, `${team.city || "城市待補"}｜${team.home || "主場待補"}｜${TEAM_SHORT[teamId] || "Team Home"}`);

    setLink("heroScheduleLink", `schedule.html?team=${encodeURIComponent(teamId)}`);
    setLink("heroRosterLink", `team-roster.html?team=${encodeURIComponent(teamId)}&squad=first`);
    setLink("heroStatsLink", `team-stats.html?team=${encodeURIComponent(teamId)}`);

    const teamGames = getTeamGames(teamId);
    const stat = buildTeamStat(teamGames, teamId);
    const nextGame = getNextGame(teamGames);
    const recent = getRecentGames(teamGames, 5);

    detailBox.innerHTML = `
      <article class="team-home-hero-card" style="--team-color:${teamColor}; --team-color-dark:${teamColorDark};">
        <div class="team-home-hero-bg">${escapeHtml(TEAM_SHORT[teamId] || "CPBL")}</div>

        <div class="team-home-hero-main">
          <div class="team-home-logo-wrap">
            <img src="assets/logo/${escapeAttr(teamId)}.png" alt="${escapeHtml(teamName)} Logo">
          </div>

          <div class="team-home-hero-info">
            <span class="team-home-kicker">TEAM HOME</span>
            <h2>${escapeHtml(teamName)}</h2>
            <p>${escapeHtml(team.city || "城市待補")}｜${escapeHtml(team.home || "主場待補")}｜${escapeHtml(team.founded || "成立年份待補")}</p>

            <div class="team-home-hero-actions">
              <a href="team-roster.html?team=${escapeAttr(teamId)}&squad=first">👥 一軍名單</a>
              <a href="team-roster.html?team=${escapeAttr(teamId)}&squad=second">🌱 二軍名單</a>
              <a href="team-stats.html?team=${escapeAttr(teamId)}">📊 球隊分析</a>
              <a href="schedule.html?team=${escapeAttr(teamId)}">📅 球隊賽程</a>
            </div>
          </div>
        </div>

        <div class="team-home-info-grid">
          <div>
            <span>城市</span>
            <strong>${escapeHtml(team.city || "—")}</strong>
          </div>
          <div>
            <span>主場</span>
            <strong>${escapeHtml(team.home || "—")}</strong>
          </div>
          <div>
            <span>成立</span>
            <strong>${escapeHtml(team.founded || "—")}</strong>
          </div>
          <div>
            <span>資料狀態</span>
            <strong>${teamGames.length ? "賽程已串接" : "等待賽程"}</strong>
          </div>
        </div>
      </article>

      <section class="team-home-entry-grid">
        <a class="team-home-entry-card" href="team-roster.html?team=${escapeAttr(teamId)}&squad=first">
          <span>ROSTER</span>
          <strong>球隊名單</strong>
          <em>教練團、一軍與二軍球員</em>
        </a>

        <a class="team-home-entry-card" href="team-stats.html?team=${escapeAttr(teamId)}">
          <span>STATS</span>
          <strong>球隊分析</strong>
          <em>近期表現、主客場與對戰成績</em>
        </a>

        <a class="team-home-entry-card" href="schedule.html?team=${escapeAttr(teamId)}">
          <span>SCHEDULE</span>
          <strong>球隊賽程</strong>
          <em>查詢未來賽事與歷史場次</em>
        </a>
      </section>

      <section class="team-home-snapshot-card">
        <div class="team-section-head">
          <div>
            <span class="team-section-kicker">SEASON SNAPSHOT</span>
            <h2>📌 球隊快速摘要</h2>
          </div>
          <span class="team-home-version">${VERSION}</span>
        </div>

        <div class="team-home-stat-grid">
          ${renderStatItem("已知場次", stat.totalGames, "含賽程與 live-boxscore")}
          ${renderStatItem("已完成", stat.finishedGames, "FINAL 場次")}
          ${renderStatItem("勝 / 敗", `${stat.wins} / ${stat.losses}`, "依已完成比分估算")}
          ${renderStatItem("得失分", `${stat.runsFor} / ${stat.runsAgainst}`, "已完成場次")}
        </div>
      </section>
    `;

    renderNextGame(nextGame, teamName);
    renderRecentGames(recent, teamName);
  }

  function renderNextGame(game, teamName) {
    if (!nextBox) return;

    if (!game) {
      nextBox.innerHTML = `
        <div class="team-home-empty">
          <strong>目前沒有下一場比賽</strong>
          <span>${escapeHtml(teamName)} 尚未有可顯示的未來賽程。</span>
        </div>
      `;
      return;
    }

    const side = getTeamSide(game, teamId);
    const opponent = getOpponentName(game, teamId);
    const venue = cleanText(game.venue || game.meta?.venue);
    const status = getGameStatusText(game);
    const score = getScoreText(game);

    nextBox.innerHTML = `
      <a class="team-next-game-card" href="${escapeAttr(buildMatchUrl(game))}">
        <div class="team-game-date">
          <span>${escapeHtml(formatDate(game.date))}</span>
          <strong>${escapeHtml(game.time || game.meta?.time || "時間未定")}</strong>
        </div>

        <div class="team-game-main">
          <span class="team-game-side">${side === "home" ? "主場" : side === "away" ? "客場" : "賽程"}</span>
          <strong>${escapeHtml(TEAM_ID_TO_NAME[teamId] || teamName)} vs ${escapeHtml(opponent)}</strong>
          <em>${escapeHtml(venue || "球場待定")}｜${escapeHtml(status)}${score ? `｜${escapeHtml(score)}` : ""}</em>
        </div>

        <div class="team-game-arrow">›</div>
      </a>
    `;
  }

  function renderRecentGames(list, teamName) {
    if (!recentBox) return;

    if (!list.length) {
      recentBox.innerHTML = `
        <div class="team-home-empty">
          <strong>尚無近期比賽</strong>
          <span>${escapeHtml(teamName)} 目前沒有已完成或過去賽程可顯示。</span>
        </div>
      `;
      return;
    }

    recentBox.innerHTML = `
      <div class="team-recent-game-list">
        ${list.map(game => renderRecentGameItem(game)).join("")}
      </div>
    `;
  }

  function renderRecentGameItem(game) {
    const opponent = getOpponentName(game, teamId);
    const side = getTeamSide(game, teamId);
    const result = getResultBadge(game, teamId);
    const score = getScoreText(game);
    const venue = game.venue || game.meta?.venue || "球場待定";

    return `
      <a class="team-recent-game-item ${escapeAttr(result.tone)}" href="${escapeAttr(buildMatchUrl(game))}">
        <div class="team-recent-date">${escapeHtml(formatDate(game.date))}</div>
        <div class="team-recent-main">
          <strong>${escapeHtml(side === "home" ? "主場" : side === "away" ? "客場" : "賽程")} vs ${escapeHtml(opponent)}</strong>
          <span>${escapeHtml(venue)}${score ? `｜${escapeHtml(score)}` : ""}</span>
        </div>
        <div class="team-result-badge">${escapeHtml(result.label)}</div>
      </a>
    `;
  }

  function renderStatItem(label, value, hint) {
    return `
      <div class="team-home-stat-item">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value ?? "—")}</strong>
        <em>${escapeHtml(hint || "")}</em>
      </div>
    `;
  }

  function findTeam(id) {
    const found = teamsData.find(team => String(team.id) === String(id));

    if (found) return found;

    if (TEAM_ID_TO_NAME[id]) {
      return {
        id,
        name: TEAM_ID_TO_NAME[id],
        city: "城市待補",
        home: "主場待補",
        founded: "—"
      };
    }

    return null;
  }

  function setPageTheme(id) {
    const color = TEAM_COLOR[id] || "#0b3c5d";
    const dark = TEAM_COLOR_DARK[id] || "#08263d";

    document.body.dataset.team = id;
    document.body.style.setProperty("--team-color", color);
    document.body.style.setProperty("--team-color-dark", dark);
    document.body.style.setProperty("--team-color-soft", `${color}22`);
  }

  function normalizeGameArray(data) {
    return toArray(data)
      .map(normalizeGame)
      .filter(game => game.date && (game.home || game.away));
  }

  function normalizeGame(game) {
    const meta = game.meta || {};
    const rawHome = cleanText(game.home || meta.home || game.homeTeam || game.HomeTeam || "");
    const rawAway = cleanText(game.away || meta.away || game.awayTeam || game.AwayTeam || "");

    const homeId = resolveTeamId(rawHome);
    const awayId = resolveTeamId(rawAway);

    return {
      raw: game,
      gameSno: game.gameSno ?? game.GameSno ?? game.id ?? "",
      date: normalizeDate(game.date || meta.date || game.GameDate || game.GameDateS || ""),
      time: cleanText(game.time || meta.time || game.GameTime || ""),
      home: homeId || rawHome,
      away: awayId || rawAway,
      homeName: TEAM_ID_TO_NAME[homeId] || rawHome,
      awayName: TEAM_ID_TO_NAME[awayId] || rawAway,
      venue: cleanText(game.venue || meta.venue || game.stadium || game.FieldName || ""),
      status: cleanText(meta.status || game.status || game.GameStatus || ""),
      statusText: cleanText(meta.statusText || game.statusText || game.GameStatusChi || ""),
      totals: normalizeTotals(game.totals, game)
    };
  }

  function normalizeTotals(totals = {}, raw = {}) {
    return {
      away: {
        R: toNumberOrNull(totals.away?.R ?? raw.awayScore ?? raw.AwayScore ?? raw.VisitingScore)
      },
      home: {
        R: toNumberOrNull(totals.home?.R ?? raw.homeScore ?? raw.HomeScore)
      }
    };
  }

  function mergeGames(scheduleList, liveList) {
    const map = new Map();

    for (const game of scheduleList) {
      map.set(gameKey(game), game);
    }

    for (const game of liveList) {
      const key = gameKey(game);
      const old = map.get(key) || {};

      map.set(key, {
        ...old,
        ...game,
        raw: {
          ...(old.raw || {}),
          ...(game.raw || {})
        }
      });
    }

    return [...map.values()]
      .filter(game => game.date)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return String(a.time || "").localeCompare(String(b.time || ""));
      });
  }

  function gameKey(game) {
    return `${game.date}_${game.gameSno || ""}_${game.away}_${game.home}`;
  }

  function getTeamGames(id) {
    return allGames
      .filter(game => sameTeam(game.home, id) || sameTeam(game.away, id))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return String(a.time || "").localeCompare(String(b.time || ""));
      });
  }

  function getNextGame(teamGames) {
    const today = getTodayLocal();

    return teamGames
      .filter(game => game.date >= today && !isFinalGame(game))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return String(a.time || "").localeCompare(String(b.time || ""));
      })[0] || null;
  }

  function getRecentGames(teamGames, limit = 5) {
    const today = getTodayLocal();

    return teamGames
      .filter(game => game.date < today || isFinalGame(game))
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return String(b.time || "").localeCompare(String(a.time || ""));
      })
      .slice(0, limit);
  }

  function buildTeamStat(teamGames, id) {
    const finalGames = teamGames.filter(game => {
      const a = game.totals?.away?.R;
      const h = game.totals?.home?.R;

      return isFinalGame(game) && Number.isFinite(a) && Number.isFinite(h);
    });

    let wins = 0;
    let losses = 0;
    let runsFor = 0;
    let runsAgainst = 0;

    for (const game of finalGames) {
      const side = getTeamSide(game, id);
      const teamR = side === "home" ? game.totals.home.R : game.totals.away.R;
      const oppR = side === "home" ? game.totals.away.R : game.totals.home.R;

      runsFor += teamR;
      runsAgainst += oppR;

      if (teamR > oppR) wins++;
      if (teamR < oppR) losses++;
    }

    return {
      totalGames: teamGames.length,
      finishedGames: finalGames.length,
      wins,
      losses,
      runsFor,
      runsAgainst
    };
  }

  function getTeamSide(game, id) {
    if (sameTeam(game.home, id)) return "home";
    if (sameTeam(game.away, id)) return "away";

    return "";
  }

  function getOpponentName(game, id) {
    const side = getTeamSide(game, id);

    if (side === "home") return game.awayName || TEAM_ID_TO_NAME[game.away] || game.away || "對手待定";
    if (side === "away") return game.homeName || TEAM_ID_TO_NAME[game.home] || game.home || "對手待定";

    return "對手待定";
  }

  function getResultBadge(game, id) {
    const side = getTeamSide(game, id);
    const awayR = game.totals?.away?.R;
    const homeR = game.totals?.home?.R;

    if (!Number.isFinite(awayR) || !Number.isFinite(homeR)) {
      return {
        label: getGameStatusText(game),
        tone: "neutral"
      };
    }

    const teamR = side === "home" ? homeR : awayR;
    const oppR = side === "home" ? awayR : homeR;

    if (teamR > oppR) return { label: "勝", tone: "win" };
    if (teamR < oppR) return { label: "敗", tone: "loss" };

    return { label: "和", tone: "neutral" };
  }

  function getScoreText(game) {
    const a = game.totals?.away?.R;
    const h = game.totals?.home?.R;

    if (!Number.isFinite(a) || !Number.isFinite(h)) return "";

    return `${game.awayName || TEAM_ID_TO_NAME[game.away] || "客隊"} ${a} : ${h} ${game.homeName || TEAM_ID_TO_NAME[game.home] || "主隊"}`;
  }

  function isFinalGame(game) {
    const text = `${game.status || ""} ${game.statusText || ""}`.toLowerCase();

    return (
      text.includes("final") ||
      text.includes("結束") ||
      text.includes("完賽") ||
      game.raw?.finalLock?.locked === true ||
      game.raw?.meta?.status === "final"
    );
  }

  function getGameStatusText(game) {
    const text = `${game.status || ""} ${game.statusText || ""}`;

    if (/final|結束|完賽/i.test(text) || game.raw?.finalLock?.locked) return "FINAL";
    if (/live|比賽中|進行中/i.test(text)) return "LIVE";
    if (/延賽/.test(text)) return "延賽";
    if (/保留/.test(text)) return "保留";

    return "賽前";
  }

  function buildMatchUrl(game) {
    if (game.gameSno) return `match.html?gameSno=${encodeURIComponent(game.gameSno)}`;

    return `match.html?date=${encodeURIComponent(game.date)}&away=${encodeURIComponent(game.awayName || game.away)}&home=${encodeURIComponent(game.homeName || game.home)}`;
  }

  function resolveTeamId(value) {
    const s = cleanTeam(value);

    if (!s) return "";

    if (TEAM_ID_TO_NAME[s]) return s;

    for (const [name, id] of Object.entries(TEAM_ALIASES)) {
      if (cleanTeam(name) === s || s.includes(cleanTeam(name)) || cleanTeam(name).includes(s)) {
        return id;
      }
    }

    for (const [id, name] of Object.entries(TEAM_ID_TO_NAME)) {
      if (cleanTeam(name) === s || s.includes(cleanTeam(name)) || cleanTeam(name).includes(s)) {
        return id;
      }
    }

    return "";
  }

  function sameTeam(value, id) {
    const resolved = resolveTeamId(value);

    if (resolved && resolved === id) return true;

    return cleanTeam(value) === cleanTeam(id);
  }

  function cleanTeam(value) {
    return String(value || "")
      .replace(/\s+/g, "")
      .replace(/7-ELEVEN/gi, "7-ELEVEn")
      .trim();
  }

  function normalizeDate(value) {
    const raw = cleanText(value).replace(/\//g, "-");

    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) {
      const [y, m, d] = raw.split(/[ T]/)[0].split("-");

      return `${y}-${pad2(m)}-${pad2(d)}`;
    }

    return raw.slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return "日期待定";

    const parts = value.split("-");

    if (parts.length === 3) return `${Number(parts[1])}/${Number(parts[2])}`;

    return value;
  }

  function getTodayLocal() {
    const d = new Date();

    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function toArray(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.games)) return data.games;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.items)) return data.items;

    if (data && typeof data === "object") {
      return Object.values(data).filter(item => item && typeof item === "object");
    }

    return [];
  }

  function toNumberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;

    const n = Number(value);

    return Number.isFinite(n) ? n : null;
  }

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function setLink(id, href) {
    const el = document.getElementById(id);

    if (el) el.href = href;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function renderFatal(message) {
    if (detailBox) {
      detailBox.innerHTML = `
        <div class="team-home-empty is-error">
          <strong>球隊總覽載入失敗</strong>
          <span>${escapeHtml(message)}</span>
          <a href="teams.html" class="card-link">返回球隊列表</a>
        </div>
      `;
    }

    setText(pageTitle, "球隊總覽");
    setText(pageSub, "資料載入失敗");
  }
}

document.addEventListener("DOMContentLoaded", initTeam);
