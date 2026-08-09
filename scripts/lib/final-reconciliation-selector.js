const SPECIAL = new Set(["postponed", "suspended", "cancelled"]);

export function selectReconciliationTargets(games, options = {}) {
  const today = String(options.today || "").trim();
  const lookbackDays = Math.max(1, Number(options.lookbackDays || 7));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error(`invalid today: ${today}`);
  }

  const earliest = addDays(today, -(lookbackDays - 1));
  const rows = (Array.isArray(games) ? games : Object.values(games || {}))
    .map(normalize)
    .filter(Boolean)
    .filter(g => g.date >= earliest && g.date < today)
    .filter(g => !SPECIAL.has(g.status))
    .filter(g => needsReconciliation(g));

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.gameSno - b.gameSno);
}

export function needsReconciliation(game) {
  if (game.status !== "final") return true;
  return !hasValidFinalScore(game);
}

export function hasValidFinalScore(game) {
  if (game?.awayR === null || game?.awayR === undefined || game?.awayR === "") return false;
  if (game?.homeR === null || game?.homeR === undefined || game?.homeR === "") return false;
  const away = Number(game.awayR);
  const home = Number(game.homeR);
  return Number.isFinite(away) && Number.isFinite(home) && away >= 0 && home >= 0;
}

function normalize(game) {
  const date = String(game?.meta?.date || game?.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    gameSno: Number(game?.gameSno || game?.meta?.gameSno || 0),
    date,
    status: String(game?.meta?.status || game?.status || "scheduled").trim().toLowerCase(),
    away: String(game?.meta?.away || game?.away || ""),
    home: String(game?.meta?.home || game?.home || ""),
    awayR: game?.totals?.away?.R,
    homeR: game?.totals?.home?.R
  };
}

function addDays(dateText, days) {
  const [y, m, d] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
