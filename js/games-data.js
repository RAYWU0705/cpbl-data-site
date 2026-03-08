// =========================
// v5 Games Data Engine
// =========================

import { getTeamIdByName } from "./services/teamService.js";

// =========================
// 狀態
// =========================

let gamesStore = [];
let currentMonth = "2026-03";

export function setMonth(month){
  currentMonth = month;
}

export function getGames(){
  return gamesStore;
}

// =========================
// 載入資料
// =========================

export async function loadGames(month = currentMonth){

  try {
    const res = await fetch(`data/schedule-${month}.json`);
    const data = await res.json();

    const rawGames = Object.values(data);

    gamesStore = rawGames.map(normalizeGame);

    return gamesStore;

  } catch(err){
    console.error("讀取 games 失敗", err);
    gamesStore = [];
    return [];
  }
}

// =========================
// 標準化資料（核心）
// =========================
function normalizeGame(g){

  const home = g.home ?? g.teams?.home ?? null;
  const away = g.away ?? g.teams?.away ?? null;

  const homeScore = g.score?.home ?? null;
  const awayScore = g.score?.away ?? null;

  const hasScore =
    typeof homeScore === "number" &&
    typeof awayScore === "number";

  return {

    id: buildGameId(g),

    date: g.date,
    weekday: getWeekday(g.date),
    month: g.date?.slice(0,7),

    home,
    away,

    homeId: getTeamIdByName(home),
    awayId: getTeamIdByName(away),

    score: hasScore ? {
      home: homeScore,
      away: awayScore
    } : null,

    status: g.status ?? (hasScore ? "final" : "scheduled"),

    type: g.type ?? "regular",

    time: g.time ?? "",
    venue: g.venue ?? "",

    raw: g
  };
}
// =========================
// 工具
// =========================

function buildGameId(g){
  const dateId = g.date?.replaceAll("-", "");
  const home = g.home ?? g.teams?.home;
  const away = g.away ?? g.teams?.away;
  return `${dateId}_${home}_${away}`;
}
function getWeekday(dateStr){
  if (!dateStr) return "";
  const days = ["日","一","二","三","四","五","六"];
  const d = new Date(dateStr);
  return `(${days[d.getDay()]})`;
}

// =========================
// 對外工具
// =========================

export function filterGames({ month, team, type, status } = {}){

  return gamesStore.filter(g => {
    if (type && type !== "ALL"){
     if (g.type !== type) return false;
    }
    if (month && g.month !== month) return false;

    if (team && team !== "ALL"){
      if (g.home !== team && g.away !== team) return false;
    }

    if (status && g.status !== status) return false;

    return true;
  });
}