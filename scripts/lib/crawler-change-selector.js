// =========================================================
// Ray's CPBL Data Site
// Changed-Only Crawler Core v1
//
// 純函式模組：
// - 選出真正需要重新抓 LIVE detail 的場次
// - 忽略 updatedAt / debug 等非實質差異
// - 列出會影響公開資料的變動路徑
// =========================================================

const VOLATILE_KEYS = new Set([
  "debug",
  "raw",
  "updatedAt",
  "fetchedAt",
  "generatedAt",
  "appliedAt",
  "rescuedAt",
  "manualOverrideAt",
  "postponedAt",
  "rescheduledAt"
]);

export function selectChangedOnlyLiveGames(options = {}) {
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const existingGames = Array.isArray(options.existingGames) ? options.existingGames : [];
  const liveCardMap = options.liveCardMap instanceof Map ? options.liveCardMap : new Map();
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const minRefreshMs = Number.isFinite(Number(options.minRefreshMs))
    ? Math.max(0, Number(options.minRefreshMs))
    : 120000;
  const forceGameSnos = new Set(
    [...(options.forceGameSnos || [])]
      .map(Number)
      .filter(Number.isFinite)
  );

  const existingMap = new Map(
    existingGames
      .map(game => [getGameSno(game), game])
      .filter(([gameSno]) => gameSno > 0)
  );

  const selected = [];
  const skipped = [];

  for (const game of candidates) {
    const gameSno = getGameSno(game);
    const oldGame = existingMap.get(gameSno) || null;
    const liveCard = liveCardMap.get(gameSno) || null;

    const decision = decideLiveDetailFetch({
      game,
      oldGame,
      liveCard,
      nowMs,
      minRefreshMs,
      force: forceGameSnos.has(gameSno)
    });

    const row = {
      game,
      gameSno,
      oldGame,
      liveCard,
      reason: decision.reason,
      ageMs: decision.ageMs,
      signalChanges: decision.signalChanges
    };

    if (decision.fetch) selected.push(row);
    else skipped.push(row);
  }

  return {
    selected,
    skipped,
    summary: {
      candidates: candidates.length,
      selected: selected.length,
      skipped: skipped.length,
      reasons: countBy([...selected, ...skipped], row => row.reason)
    }
  };
}

export function decideLiveDetailFetch(options = {}) {
  const game = options.game || null;
  const oldGame = options.oldGame || null;
  const liveCard = options.liveCard || null;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const minRefreshMs = Number.isFinite(Number(options.minRefreshMs))
    ? Math.max(0, Number(options.minRefreshMs))
    : 120000;

  if (!game) {
    return decision(false, "invalid-game", null, []);
  }

  if (options.force) {
    return decision(true, "forced", getAgeMs(oldGame, nowMs), []);
  }

  const oldStatus = normalizeStatus(oldGame?.meta?.status || oldGame?.status);
  if (oldStatus === "final") {
    return decision(false, "final-guard", getAgeMs(oldGame, nowMs), []);
  }

  if (!oldGame) {
    return decision(true, "new-game", null, []);
  }

  const signalChanges = getScheduleSignalChanges(game, oldGame, liveCard);
  if (signalChanges.length) {
    return decision(true, "official-signal-changed", getAgeMs(oldGame, nowMs), signalChanges);
  }

  if (isLiveDataIncomplete(oldGame)) {
    return decision(true, "data-incomplete", getAgeMs(oldGame, nowMs), []);
  }

  const ageMs = getAgeMs(oldGame, nowMs);
  if (ageMs === null || ageMs >= minRefreshMs) {
    return decision(true, "refresh-window", ageMs, []);
  }

  return decision(false, "recent-unchanged", ageMs, []);
}

export function diffMeaningfulGame(before, after, options = {}) {
  const beforeSnapshot = createMeaningfulSnapshot(before, options);
  const afterSnapshot = createMeaningfulSnapshot(after, options);
  const paths = [];
  collectDiffPaths(beforeSnapshot, afterSnapshot, "", paths, options.maxPaths || 40);

  return {
    changed: paths.length > 0,
    paths,
    before: beforeSnapshot,
    after: afterSnapshot
  };
}

export function createMeaningfulSnapshot(value, options = {}) {
  const ignoredKeys = new Set([
    ...VOLATILE_KEYS,
    ...(options.ignoredKeys || [])
  ]);

  return normalizeValue(value, ignoredKeys);
}

export function getScheduleSignalChanges(game, oldGame, liveCard = null) {
  const changes = [];
  const oldStatus = normalizeStatus(oldGame?.meta?.status || oldGame?.status);
  const newStatus = normalizeStatus(game?.status || game?.meta?.status);

  if (newStatus && newStatus !== "scheduled" && newStatus !== oldStatus) {
    changes.push(`status:${oldStatus || "unknown"}->${newStatus}`);
  }

  compareNumberSignal(changes, "away.R", firstDefinedNumber(game?.awayScore, liveCard?.awayScore), oldGame?.totals?.away?.R);
  compareNumberSignal(changes, "home.R", firstDefinedNumber(game?.homeScore, liveCard?.homeScore), oldGame?.totals?.home?.R);
  compareNumberSignal(changes, "away.H", game?.awayH, oldGame?.totals?.away?.H);
  compareNumberSignal(changes, "home.H", game?.homeH, oldGame?.totals?.home?.H);
  compareNumberSignal(changes, "away.E", game?.awayE, oldGame?.totals?.away?.E);
  compareNumberSignal(changes, "home.E", game?.homeE, oldGame?.totals?.home?.E);

  return changes;
}

export function isLiveDataIncomplete(game) {
  if (!game) return true;

  const awayR = Number(game?.totals?.away?.R);
  const homeR = Number(game?.totals?.home?.R);
  if (!Number.isFinite(awayR) || !Number.isFinite(homeR)) return true;

  const quality = game.dataQuality || {};
  const weak = new Set(["", "debug", "missing", "unknown", "error"]);
  if (weak.has(String(quality.score || "").toLowerCase())) return true;

  const hasLineScore =
    Array.isArray(game?.lineScore?.away) &&
    Array.isArray(game?.lineScore?.home) &&
    (game.lineScore.away.length > 0 || game.lineScore.home.length > 0);

  const hasPlayers =
    (game?.batters?.away?.length || 0) > 0 &&
    (game?.batters?.home?.length || 0) > 0 &&
    (game?.pitchers?.away?.length || 0) > 0 &&
    (game?.pitchers?.home?.length || 0) > 0;

  return !hasLineScore || !hasPlayers;
}

function decision(fetch, reason, ageMs, signalChanges) {
  return { fetch, reason, ageMs, signalChanges };
}

function getAgeMs(game, nowMs) {
  const candidates = [
    game?.debug?.liveInplay?.updatedAt,
    game?.dataQuality?.updatedAt,
    game?.meta?.updatedAt,
    game?.updatedAt
  ];

  for (const value of candidates) {
    const timestamp = Date.parse(value || "");
    if (Number.isFinite(timestamp)) return Math.max(0, nowMs - timestamp);
  }

  return null;
}

function getGameSno(game) {
  const value = Number(game?.gameSno || game?.meta?.gameSno || 0);
  return Number.isFinite(value) ? value : 0;
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["in_progress", "playing"].includes(status)) return "live";
  if (status === "pregame") return "scheduled";
  return status;
}

function compareNumberSignal(changes, label, incoming, existing) {
  const next = toFiniteNumber(incoming);
  if (next === null) return;

  const old = toFiniteNumber(existing);
  if (old === null || next !== old) {
    changes.push(`${label}:${old === null ? "null" : old}->${next}`);
  }
}

function firstDefinedNumber(...values) {
  for (const value of values) {
    const number = toFiniteNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeValue(value, ignoredKeys) {
  if (Array.isArray(value)) {
    return value.map(item => normalizeValue(item, ignoredKeys));
  }

  if (!value || typeof value !== "object") return value;

  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (ignoredKeys.has(key)) continue;
    output[key] = normalizeValue(value[key], ignoredKeys);
  }
  return output;
}

function collectDiffPaths(before, after, prefix, paths, maxPaths) {
  if (paths.length >= maxPaths) return;

  if (Object.is(before, after)) return;

  const beforeObject = before && typeof before === "object";
  const afterObject = after && typeof after === "object";

  if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
    paths.push(prefix || "$");
    return;
  }

  if (Array.isArray(before)) {
    if (before.length !== after.length) {
      paths.push(`${prefix || "$"}.length`);
      if (paths.length >= maxPaths) return;
    }

    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length && paths.length < maxPaths; index++) {
      collectDiffPaths(before[index], after[index], `${prefix || "$"}[${index}]`, paths, maxPaths);
    }
    return;
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of [...keys].sort()) {
    if (paths.length >= maxPaths) break;
    collectDiffPaths(
      before[key],
      after[key],
      prefix ? `${prefix}.${key}` : key,
      paths,
      maxPaths
    );
  }
}

function countBy(items, selector) {
  const output = {};
  for (const item of items) {
    const key = selector(item) || "unknown";
    output[key] = (output[key] || 0) + 1;
  }
  return output;
}
