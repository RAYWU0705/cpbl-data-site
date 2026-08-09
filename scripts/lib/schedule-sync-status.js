export function flattenPrimitiveText(value, out = [], depth = 0) {
  if (depth > 5 || value == null) return out;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    if (text) out.push(text);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) flattenPrimitiveText(item, out, depth + 1);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) flattenPrimitiveText(item, out, depth + 1);
  }
  return out;
}

export function findSpecialScheduleStatus(record, normalizeStatus) {
  const values = flattenPrimitiveText(record);
  for (const text of values) {
    const status = normalizeStatus(text);
    if (status !== 'scheduled') return { status, statusText: text };
  }
  return null;
}

export function applyScheduleStatusOverrides(games, config = {}, year = 2026) {
  const rules = config?.years?.[String(year)] || config?.[String(year)] || {};
  const applied = [];
  const next = (games || []).map(game => {
    const rule = rules[String(game.gameSno)];
    if (!rule) return game;

    const allowedDates = Array.isArray(rule.matchDates) ? rule.matchDates : [];
    const dateMatches = allowedDates.length === 0 || allowedDates.includes(game.date);
    const statusMatches = !rule.onlyWhenStatus || game.status === rule.onlyWhenStatus;
    if (!dateMatches || !statusMatches) return game;

    const patched = {
      ...game,
      date: rule.date || game.date,
      status: rule.status || game.status,
      statusText: rule.statusText || game.statusText,
      scheduleOverride: {
        source: rule.source || 'config/schedule-status-overrides.json',
        reason: rule.reason || '',
        appliedAt: new Date().toISOString()
      }
    };
    applied.push({gameSno: game.gameSno, from: {date: game.date, status: game.status}, to: {date: patched.date, status: patched.status}});
    return patched;
  });
  return { games: next, applied };
}
