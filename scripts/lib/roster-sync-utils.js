export function transactionKey(item = {}) {
  return `${String(item.date || '').trim()}|${String(item.player || '').trim()}`;
}

export function mergeTransactions(fresh = [], previous = []) {
  const map = new Map();

  // 舊資料先放；官方本次 fresh 後放，若同日同球員原因有修正，以 fresh 為準。
  for (const item of Array.isArray(previous) ? previous : []) {
    if (!item?.date || !item?.player) continue;
    map.set(transactionKey(item), { ...item });
  }

  for (const item of Array.isArray(fresh) ? fresh : []) {
    if (!item?.date || !item?.player) continue;
    map.set(transactionKey(item), { ...item });
  }

  return [...map.values()].sort((a, b) => {
    const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(a.player || '').localeCompare(String(b.player || ''), 'zh-Hant');
  });
}

export function getRosterCounts(roster = {}) {
  const playerGroups = roster?.players || {};
  const countSquad = squad => ["投手", "捕手", "內野手", "外野手"]
    .reduce((sum, group) => sum + (playerGroups?.[`${squad}_${group}`]?.list?.length || 0), 0);

  return {
    firstPlayers: countSquad('first'),
    secondPlayers: countSquad('second'),
    firstCoaches: roster?.coaches?.first?.list?.length || 0,
    secondCoaches: roster?.coaches?.second?.list?.length || 0
  };
}

export function validateRoster(roster = {}) {
  const counts = getRosterCounts(roster);
  const missingGroups = [];

  for (const squad of ['first', 'second']) {
    for (const group of ["投手", "捕手", "內野手", "外野手"]) {
      if (!Array.isArray(roster?.players?.[`${squad}_${group}`]?.list)) {
        missingGroups.push(`${squad}_${group}`);
      }
    }
  }

  const reasons = [];
  if (missingGroups.length) reasons.push(`缺少群組: ${missingGroups.join(', ')}`);
  if (counts.firstPlayers < 8) reasons.push(`一軍球員僅 ${counts.firstPlayers}`);
  if (counts.secondPlayers < 8) reasons.push(`二軍球員僅 ${counts.secondPlayers}`);
  if (counts.firstCoaches < 1) reasons.push('一軍教練為 0');
  if (counts.secondCoaches < 1) reasons.push('二軍教練為 0');

  return {
    ok: reasons.length === 0,
    reasons,
    counts
  };
}
