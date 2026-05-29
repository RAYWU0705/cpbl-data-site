/* =========================================================
   Ray's CPBL Data Site
   player.js
   v5.5.1-PLAYER-TEAM-FALLBACK

   不碰 fetch：
   - 只讀 data/live/live-boxscore.json
   - 從既有 batters / pitchers 統計球員
========================================================= */

const LIVE_BOXSCORE_URL = "data/live/live-boxscore.json";

const TEAM_SLUGS = {
  "中信兄弟": "brothers",
  "統一7-ELEVEn獅": "lions",
  "樂天桃猿": "monkeys",
  "味全龍": "dragons",
  "富邦悍將": "guardians",
  "台鋼雄鷹": "hawks"
};

const QUICK_PLAYERS = [
  "江坤宇",
  "羅戈",
  "張育成",
  "陳子豪",
  "魔鷹",
  "林立",
  "陳傑憲",
  "曾頌恩"
];

document.addEventListener("DOMContentLoaded", initPlayerPage);

async function initPlayerPage() {
  renderQuickPlayers();
  bindSearchForm();

  const params = new URLSearchParams(location.search);
  const name = cleanName(params.get("name") || params.get("player") || "");

  if (name) {
    document.getElementById("playerSearchInput").value = name;
    await loadPlayer(name);
  } else {
    setLoading(false);
    showEmpty("請先輸入球員姓名。");
  }
}

function bindSearchForm() {
  const form = document.getElementById("playerSearchForm");
  const input = document.getElementById("playerSearchInput");

  form?.addEventListener("submit", event => {
    event.preventDefault();

    const name = cleanName(input?.value || "");

    if (!name) return;

    const url = new URL(location.href);
    url.searchParams.set("name", name);
    location.href = url.toString();
  });
}

function renderQuickPlayers() {
  const wrap = document.getElementById("playerQuickList");
  if (!wrap) return;

  wrap.innerHTML = QUICK_PLAYERS.map(name => {
    return `<a href="player.html?name=${encodeURIComponent(name)}">${escapeHtml(name)}</a>`;
  }).join("");
}

async function loadPlayer(name) {
  setLoading(true);

  try {
    const games = await fetchJson(LIVE_BOXSCORE_URL);
    const normalizedGames = toArray(games).map(normalizeGame).filter(Boolean);
    const profile = buildPlayerProfile(name, normalizedGames);

    setLoading(false);

    if (!profile.totalAppearances) {
      showEmpty(`找不到「${name}」的 boxscore 出賽資料。`);
      updateHeader(name, "尚未找到此球員的 boxscore 資料");
      return;
    }

    renderProfile(profile);
  } catch (err) {
    console.error("player page load failed", err);
    setLoading(false);
    showEmpty("球員資料讀取失敗，請稍後再試。");
  }
}

async function fetchJson(url) {
  const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`${url} ${res.status}`);
  }

  return res.json();
}

function buildPlayerProfile(targetName, games) {
  const batterRows = [];
  const pitcherRows = [];
  const gameCards = [];
  const teamCount = new Map();

  for (const game of games) {
    const batting = collectRows(game.batters, targetName, game);
    const pitching = collectRows(game.pitchers, targetName, game);

    if (!batting.length && !pitching.length) continue;

    const teams = [];

    batting.forEach(row => {
      if (row.team) teams.push(row.team);
      batterRows.push({ game, row });
    });

    pitching.forEach(row => {
      if (row.team) teams.push(row.team);
      pitcherRows.push({ game, row });
    });

    teams.forEach(team => teamCount.set(team, (teamCount.get(team) || 0) + 1));

    gameCards.push({
      game,
      batting,
      pitching
    });
  }

  gameCards.sort((a, b) => String(b.game.date).localeCompare(String(a.game.date)) || Number(b.game.gameSno || 0) - Number(a.game.gameSno || 0));

  const primaryTeam = [...teamCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const batterStats = aggregateBatterStats(batterRows);
  const pitcherStats = aggregatePitcherStats(pitcherRows);
  const primaryRole = pitcherRows.length > batterRows.length ? "投手" : "野手 / 打者";

  return {
    name: targetName,
    primaryTeam,
    primaryRole,
    batterRows,
    pitcherRows,
    batterStats,
    pitcherStats,
    gameCards,
    totalAppearances: gameCards.length
  };
}

function collectRows(sideData, targetName, game = {}) {
  const rows = [];
  const target = normalizeName(targetName);

  for (const side of ["away", "home"]) {
    const list = Array.isArray(sideData?.[side]) ? sideData[side] : [];

    for (const raw of list) {
      const rowName = normalizeName(getPlayerName(raw));

      if (!rowName) continue;

      if (rowName === target) {
        const fallbackTeam = side === "away" ? game.away : game.home;

        rows.push({
          ...raw,
          side,
          team: raw.team || raw.teamName || raw.club || fallbackTeam || ""
        });
      }
    }
  }

  return rows;
}

function normalizeGame(raw) {
  if (!raw || typeof raw !== "object") return null;

  const meta = raw.meta || {};

  return {
    raw,
    gameSno: raw.gameSno ?? meta.gameSno ?? "",
    date: meta.date || raw.date || "",
    away: meta.away || raw.away || "",
    home: meta.home || raw.home || "",
    status: meta.status || raw.status || "",
    totals: raw.totals || {},
    lineScore: raw.lineScore || {},
    batters: raw.batters || {},
    pitchers: raw.pitchers || {}
  };
}

function aggregateBatterStats(rows) {
  const s = {
    games: rows.length,
    pa: 0,
    ab: 0,
    r: 0,
    h: 0,
    double: 0,
    triple: 0,
    hr: 0,
    rbi: 0,
    bb: 0,
    so: 0
  };

  rows.forEach(({ row }) => {
    s.pa += num(pick(row, ["PA", "pa", "打席"]));
    s.ab += num(pick(row, ["AB", "ab", "打數"]));
    s.r += num(pick(row, ["R", "run", "runs", "得分"]));
    s.h += num(pick(row, ["H", "hit", "hits", "安打"]));
    s.double += num(pick(row, ["2B", "double", "二壘打"]));
    s.triple += num(pick(row, ["3B", "triple", "三壘打"]));
    s.hr += num(pick(row, ["HR", "hr", "homerun", "全壘打"]));
    s.rbi += num(pick(row, ["RBI", "rbi", "打點"]));
    s.bb += num(pick(row, ["BB", "bb", "walk", "四壞", "保送"]));
    s.so += num(pick(row, ["SO", "so", "K", "strikeout", "三振"]));
  });

  if (!s.pa && s.ab) {
    s.pa = s.ab + s.bb;
  }

  s.avg = s.ab ? (s.h / s.ab).toFixed(3).replace(/^0/, "") : ".000";

  return s;
}

function aggregatePitcherStats(rows) {
  const s = {
    games: rows.length,
    outs: 0,
    ipText: "0.0",
    h: 0,
    r: 0,
    er: 0,
    bb: 0,
    so: 0,
    hr: 0,
    np: 0,
    era: "0.00"
  };

  rows.forEach(({ row }) => {
    s.outs += ipToOuts(pick(row, ["IP", "ip", "局數"]));
    s.h += num(pick(row, ["H", "hit", "hits", "被安打"]));
    s.r += num(pick(row, ["R", "run", "runs", "失分"]));
    s.er += num(pick(row, ["ER", "er", "earnedRun", "責失"]));
    s.bb += num(pick(row, ["BB", "bb", "walk", "四壞", "保送"]));
    s.so += num(pick(row, ["SO", "so", "K", "strikeout", "三振"]));
    s.hr += num(pick(row, ["HR", "hr", "homerun", "被全壘打"]));
    s.np += num(pick(row, ["NP", "np", "pitchCount", "球數"]));
  });

  s.ipText = outsToIp(s.outs);
  s.era = s.outs ? ((s.er * 27) / s.outs).toFixed(2) : "0.00";

  return s;
}

function renderProfile(profile) {
  updateHeader(profile.name, `${profile.primaryTeam || "未知球隊"}｜${profile.primaryRole}`);

  document.getElementById("playerEmpty").hidden = true;
  document.getElementById("playerProfile").hidden = false;

  const avatar = document.getElementById("playerAvatar");
  avatar.textContent = profile.name.slice(0, 1);

  document.getElementById("playerName").textContent = profile.name;
  document.getElementById("playerMetaLine").textContent = `${profile.primaryTeam || "未知球隊"}｜${profile.primaryRole}`;

  const teamSlug = TEAM_SLUGS[profile.primaryTeam] || "";
  const tags = [
    profile.primaryTeam ? `<span class="player-tag">${escapeHtml(profile.primaryTeam)}</span>` : "",
    `<span class="player-tag">${escapeHtml(profile.primaryRole)}</span>`,
    `<span class="player-tag">出賽 ${profile.totalAppearances}</span>`,
    teamSlug ? `<a class="player-tag" href="team.html?team=${teamSlug}">球隊頁</a>` : ""
  ].filter(Boolean).join("");

  document.getElementById("playerTags").innerHTML = tags;

  renderSummary(profile);
  renderStats(profile);
  renderRecentGames(profile);
}

function updateHeader(name, subtitle) {
  document.title = `${name}｜球員頁｜Ray's CPBL Data Site`;
  document.getElementById("playerNameTitle").textContent = name;
  document.getElementById("playerSubtitle").textContent = subtitle;
}

function renderSummary(profile) {
  const grid = document.getElementById("playerSummaryGrid");
  const b = profile.batterStats;
  const p = profile.pitcherStats;

  const items = [
    ["出賽場次", profile.totalAppearances],
    ["主要球隊", profile.primaryTeam || "—"],
    ["打者 AVG", b.games ? b.avg : "—"],
    ["投手 ERA", p.games ? p.era : "—"]
  ];

  grid.innerHTML = items.map(([label, value]) => {
    return `
      <div class="player-stat-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}</strong>
      </div>
    `;
  }).join("");
}

function renderStats(profile) {
  const bBlock = document.getElementById("batterStatsBlock");
  const pBlock = document.getElementById("pitcherStatsBlock");
  const noBlock = document.getElementById("noStatsBlock");

  bBlock.hidden = !profile.batterStats.games;
  pBlock.hidden = !profile.pitcherStats.games;
  noBlock.hidden = !!(profile.batterStats.games || profile.pitcherStats.games);

  if (profile.batterStats.games) {
    const b = profile.batterStats;
    document.getElementById("batterStatsBody").innerHTML = `
      <tr>
        <td>${b.games}</td>
        <td>${b.pa}</td>
        <td>${b.ab}</td>
        <td>${b.r}</td>
        <td>${b.h}</td>
        <td>${b.double}</td>
        <td>${b.triple}</td>
        <td>${b.hr}</td>
        <td>${b.rbi}</td>
        <td>${b.bb}</td>
        <td>${b.so}</td>
        <td>${b.avg}</td>
      </tr>
    `;
  }

  if (profile.pitcherStats.games) {
    const p = profile.pitcherStats;
    document.getElementById("pitcherStatsBody").innerHTML = `
      <tr>
        <td>${p.games}</td>
        <td>${p.ipText}</td>
        <td>${p.h}</td>
        <td>${p.r}</td>
        <td>${p.er}</td>
        <td>${p.bb}</td>
        <td>${p.so}</td>
        <td>${p.hr}</td>
        <td>${p.np}</td>
        <td>${p.era}</td>
      </tr>
    `;
  }
}

function renderRecentGames(profile) {
  const wrap = document.getElementById("recentGamesList");
  const cards = profile.gameCards.slice(0, 12);

  if (!cards.length) {
    wrap.innerHTML = `<div class="player-empty">沒有最近出賽資料。</div>`;
    return;
  }

  wrap.innerHTML = cards.map(card => {
    const g = card.game;
    const score = formatScore(g);
    const matchUrl = makeMatchUrl(g);
    const batterLine = card.batting.length ? renderRowPills(card.batting, "打者") : "";
    const pitcherLine = card.pitching.length ? renderRowPills(card.pitching, "投手") : "";

    return `
      <article class="player-game-card">
        <div class="player-game-head">
          <div>
            <div class="player-game-title">${escapeHtml(g.away)} vs ${escapeHtml(g.home)}｜${escapeHtml(score)}</div>
            <div class="player-game-date">${escapeHtml(g.date)}｜#${escapeHtml(String(g.gameSno))}｜${escapeHtml(g.status || "")}</div>
          </div>
          <a class="player-game-pill" href="${matchUrl}">比賽中心</a>
        </div>

        <div class="player-game-lines">
          ${batterLine}
          ${pitcherLine}
        </div>
      </article>
    `;
  }).join("");
}

function renderRowPills(rows, label) {
  return rows.map(({ row }) => {
    const teamText = row.team ? `${row.team}｜` : "";
    const useful = label === "打者"
      ? [
          `AB ${display(pick(row, ["AB", "ab", "打數"]))}`,
          `H ${display(pick(row, ["H", "hit", "安打"]))}`,
          `RBI ${display(pick(row, ["RBI", "rbi", "打點"]))}`,
          `SO ${display(pick(row, ["SO", "so", "K", "三振"]))}`
        ]
      : [
          `IP ${display(pick(row, ["IP", "ip", "局數"]))}`,
          `H ${display(pick(row, ["H", "hit", "被安打"]))}`,
          `ER ${display(pick(row, ["ER", "er", "責失"]))}`,
          `SO ${display(pick(row, ["SO", "so", "K", "三振"]))}`
        ];

    return `<span class="player-game-pill">${teamText}${label}｜${useful.join("｜")}</span>`;
  }).join("");
}

function makeMatchUrl(g) {
  const params = new URLSearchParams();

  if (g.date) params.set("date", g.date);
  if (g.gameSno) params.set("gameSno", g.gameSno);
  if (g.home) params.set("home", g.home);
  if (g.away) params.set("away", g.away);

  return `match.html?${params.toString()}`;
}

function formatScore(g) {
  const away = g.totals?.away?.R ?? g.raw?.awayScore ?? "—";
  const home = g.totals?.home?.R ?? g.raw?.homeScore ?? "—";
  return `${away}:${home}`;
}

function setLoading(isLoading) {
  const loading = document.getElementById("playerLoading");
  if (loading) loading.hidden = !isLoading;
}

function showEmpty(message) {
  const empty = document.getElementById("playerEmpty");
  const profile = document.getElementById("playerProfile");

  if (profile) profile.hidden = true;

  if (empty) {
    empty.hidden = false;
    empty.querySelector("p").textContent = message;
  }
}

function getPlayerName(row) {
  return pick(row, [
    "name",
    "player",
    "playerName",
    "batter",
    "pitcher",
    "姓名",
    "球員"
  ]);
}

function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return "";

  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }

  return "";
}

function num(value) {
  if (value === undefined || value === null || value === "") return 0;

  const text = String(value).replace(/[^\d.-]/g, "");
  const n = Number(text);

  return Number.isFinite(n) ? n : 0;
}

function ipToOuts(value) {
  if (value === undefined || value === null || value === "") return 0;

  const text = String(value).trim();

  if (!text) return 0;

  const [wholeRaw, fracRaw = "0"] = text.split(".");
  const whole = Number(wholeRaw) || 0;
  const frac = Number(fracRaw) || 0;

  return whole * 3 + Math.min(frac, 2);
}

function outsToIp(outs) {
  const whole = Math.floor(outs / 3);
  const rem = outs % 3;
  return `${whole}.${rem}`;
}

function display(value) {
  return value === undefined || value === null || value === "" ? "—" : escapeHtml(String(value));
}

function cleanName(value) {
  return String(value || "").trim();
}

function normalizeName(value) {
  return cleanName(value).replace(/\s+/g, "");
}

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.games)) return data.games;
  if (Array.isArray(data?.data)) return data.data;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
