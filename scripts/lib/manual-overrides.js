/* =========================================================
   Ray's CPBL Data Site
   scripts/lib/manual-overrides.js
   v5.1.4-MANUAL-OVERRIDE-INTEGRATION

   用途：
   - 讀取 data/manual/manual-boxscore-overrides.json
   - 支援 Array 格式與 Object keyed 格式
   - 依 gameSno / date_gameSno / date_away_home 套用人工修正
   - 深層合併 meta / totals / lineScore / batters / pitchers / liveState / pregame
   - 不抓網路、不寫主資料，只回傳套用後物件
========================================================= */

import fs from "fs/promises";
import path from "path";

const DEFAULT_FILE = "data/manual/manual-boxscore-overrides.json";

function cleanOneLine(v) {
  return String(v || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function compactObject(obj) {
  const out = {};

  for (const [key, value] of Object.entries(obj || {})) {
    if (value === undefined || value === null || value === "") continue;

    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = compactObject(value);
      if (Object.keys(nested).length) out[key] = nested;
      continue;
    }

    out[key] = value;
  }

  return out;
}

export function getManualOverrideFile(rootDir) {
  return path.join(rootDir, DEFAULT_FILE);
}

export async function ensureManualOverrideFile(rootDir, options = {}) {
  const filepath = options.filepath || getManualOverrideFile(rootDir);

  try {
    await fs.access(filepath);
    return filepath;
  } catch {
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify([], null, 2), "utf-8");

    console.log(`📝 已建立人工修正檔：${path.relative(rootDir, filepath)}`);
    return filepath;
  }
}

export async function readManualOverrides(rootDir, options = {}) {
  const filepath = options.filepath || getManualOverrideFile(rootDir);

  try {
    const raw = JSON.parse(await fs.readFile(filepath, "utf-8"));
    const normalized = normalizeManualOverrides(raw);

    console.log(`🧰 manual override 讀取完成：${normalized.list.length} 筆｜${path.relative(rootDir, filepath)}`);

    return normalized;
  } catch (err) {
    console.log(`⚠️ manual override 讀取失敗或不存在，略過：${err.message}`);
    return normalizeManualOverrides([]);
  }
}

export function normalizeManualOverrides(raw) {
  const list = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      list.push(normalizeOneOverride(item));
    }
  } else if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      if (!value || typeof value !== "object") continue;
      list.push(normalizeOneOverride({ ...value, key: value.key || key }));
    }
  }

  const byKey = new Map();

  for (const item of list) {
    for (const key of overrideKeysFromPatch(item)) {
      byKey.set(key, item);
    }
  }

  return { list, byKey };
}

function normalizeOneOverride(item) {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  const override = item.override && typeof item.override === "object" ? item.override : {};

  return compactObject({
    ...item,
    gameSno: item.gameSno ?? meta.gameSno,
    key: item.key,
    reason: item.reason ?? override.reason,
    note: item.note ?? override.note,
    enabled: item.enabled,
    meta,
    totals: item.totals,
    lineScore: item.lineScore,
    batters: item.batters,
    pitchers: item.pitchers,
    liveState: item.liveState,
    pregame: item.pregame,
    finalLock: item.finalLock,
    manualOverride: item.manualOverride ?? true,
    override
  });
}

function overrideKeysFromPatch(patch) {
  const date = cleanOneLine(patch?.meta?.date || patch?.date || "");
  const gameSno = Number(patch?.gameSno || patch?.meta?.gameSno || 0);
  const away = cleanOneLine(patch?.meta?.away || patch?.away || "");
  const home = cleanOneLine(patch?.meta?.home || patch?.home || "");
  const explicitKey = cleanOneLine(patch?.key || "");

  return [
    explicitKey,
    gameSno ? String(gameSno) : "",
    date && gameSno ? `${date}_${gameSno}` : "",
    date && away && home ? `${date}_${away}_${home}` : ""
  ].filter(Boolean);
}

function keysForGame(game) {
  const date = cleanOneLine(game?.meta?.date || game?.date || "");
  const gameSno = Number(game?.gameSno || game?.meta?.gameSno || 0);
  const away = cleanOneLine(game?.meta?.away || game?.away || "");
  const home = cleanOneLine(game?.meta?.home || game?.home || "");

  return [
    gameSno ? String(gameSno) : "",
    date && gameSno ? `${date}_${gameSno}` : "",
    date && away && home ? `${date}_${away}_${home}` : ""
  ].filter(Boolean);
}

export function findManualOverrideForGame(game, manualOverrides) {
  const normalized =
    manualOverrides?.byKey
      ? manualOverrides
      : normalizeManualOverrides(manualOverrides || []);

  for (const key of keysForGame(game)) {
    if (normalized.byKey.has(key)) {
      return {
        key,
        patch: normalized.byKey.get(key)
      };
    }
  }

  return null;
}

function deepMergeDefined(target, patch, actions, prefix = "") {
  const next = Array.isArray(target)
    ? [...target]
    : { ...(target || {}) };

  if (!patch || typeof patch !== "object") return next;

  if (Array.isArray(patch)) {
    actions.push(`${prefix || "value"} replaced by manual override`);
    return clonePlain(patch);
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    const label = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      next[key] = clonePlain(value);
      actions.push(`${label} replaced by manual override`);
      continue;
    }

    if (value && typeof value === "object") {
      next[key] = deepMergeDefined(next[key] || {}, value, actions, label);
      continue;
    }

    next[key] = value;
    actions.push(`${label} replaced by manual override`);
  }

  return next;
}

function normalizeFinalLock(oldFinalLock, patchFinalLock, matchedKey) {
  if (patchFinalLock === undefined) return oldFinalLock;

  if (patchFinalLock === false) return false;

  if (patchFinalLock === true) {
    return {
      ...(oldFinalLock && typeof oldFinalLock === "object" ? oldFinalLock : {}),
      locked: true,
      source: `${oldFinalLock?.source || "manual-override"}`,
      manualOverrideKey: matchedKey,
      manualOverrideAt: new Date().toISOString()
    };
  }

  if (patchFinalLock && typeof patchFinalLock === "object") {
    return {
      ...(oldFinalLock && typeof oldFinalLock === "object" ? oldFinalLock : {}),
      ...patchFinalLock,
      manualOverrideKey: matchedKey,
      manualOverrideAt: new Date().toISOString()
    };
  }

  return oldFinalLock;
}

export function applyManualOverrideToGame(game, manualOverrides, options = {}) {
  const match = findManualOverrideForGame(game, manualOverrides);
  if (!match) return game;

  const patch = match.patch;

  if (patch?.enabled === false) {
    console.log(`🛠️ ${game?.gameSno || "?"}: manual override 已停用｜key=${match.key}`);
    return game;
  }

  const actions = [];

  let next = {
    ...game,
    meta: { ...(game?.meta || {}) },
    totals: {
      away: { ...(game?.totals?.away || {}) },
      home: { ...(game?.totals?.home || {}) }
    },
    lineScore: {
      away: Array.isArray(game?.lineScore?.away) ? [...game.lineScore.away] : [],
      home: Array.isArray(game?.lineScore?.home) ? [...game.lineScore.home] : []
    },
    batters: {
      away: Array.isArray(game?.batters?.away) ? [...game.batters.away] : [],
      home: Array.isArray(game?.batters?.home) ? [...game.batters.home] : []
    },
    pitchers: {
      away: Array.isArray(game?.pitchers?.away) ? [...game.pitchers.away] : [],
      home: Array.isArray(game?.pitchers?.home) ? [...game.pitchers.home] : []
    },
    debug: { ...(game?.debug || {}) }
  };

  if (patch.meta) next.meta = deepMergeDefined(next.meta, patch.meta, actions, "meta");
  if (patch.totals) next.totals = deepMergeDefined(next.totals, patch.totals, actions, "totals");
  if (patch.lineScore) next.lineScore = deepMergeDefined(next.lineScore, patch.lineScore, actions, "lineScore");
  if (patch.batters) next.batters = deepMergeDefined(next.batters, patch.batters, actions, "batters");
  if (patch.pitchers) next.pitchers = deepMergeDefined(next.pitchers, patch.pitchers, actions, "pitchers");
  if (patch.pregame) next.pregame = deepMergeDefined(next.pregame || {}, patch.pregame, actions, "pregame");
  if (hasOwn(patch, "liveState")) {
    next.liveState = patch.liveState === null
      ? null
      : deepMergeDefined(next.liveState || {}, patch.liveState, actions, "liveState");
  }

  if (hasOwn(patch, "finalLock")) {
    next.finalLock = normalizeFinalLock(next.finalLock, patch.finalLock, match.key);
    actions.push("finalLock applied by manual override");
  }

  if (patch.manualOverride !== false) {
    next.manualOverride = true;
  }

  next.debug = {
    ...next.debug,
    manualOverride: {
      applied: true,
      key: match.key,
      gameSno: patch.gameSno || next.gameSno || null,
      reason: patch.reason || patch.override?.reason || "",
      note: patch.note || patch.override?.note || "",
      actions,
      appliedAt: new Date().toISOString()
    }
  };

  const dq = next.dataQuality || {};
  const flags = Array.isArray(dq.flags) ? [...dq.flags] : [];
  const warnings = Array.isArray(dq.warnings) ? [...dq.warnings] : [];

  if (!flags.includes("manualOverride")) flags.push("manualOverride");

  const reason = patch.reason || patch.override?.reason || "";
  if (reason) warnings.push(`人工修正：${reason}`);

  next.dataQuality = {
    ...dq,
    manualOverride: "applied",
    flags,
    warnings,
    message: dq.message || "此場含人工修正資料。",
    updatedAt: new Date().toISOString(),
    manualOverrideActions: actions
  };

  console.log(`🛠️ ${next.gameSno || patch.gameSno || "?"}: 已套用人工修正｜key=${match.key}`);
  actions.forEach(action => console.log(`   ↳ ${action}`));

  return next;
}

export function applyManualOverridesToGames(games, manualOverrides, options = {}) {
  const list = Array.isArray(games) ? games : [];
  const normalized =
    manualOverrides?.byKey
      ? manualOverrides
      : normalizeManualOverrides(manualOverrides || []);

  return list.map(game => applyManualOverrideToGame(game, normalized, options));
}
