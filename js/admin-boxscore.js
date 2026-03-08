// js/admin-boxscore.js
// =========================
// Boxscore Admin Tool (純前端)
// - 載入 data/boxscore-YYYY-MM.json
// - 編輯：R/H/E + 逐局(1-9)
// - 下載更新後 JSON（手動覆蓋回 data）
// =========================

let month = "2026-03";
let boxscoreData = {};      // 整個 boxscore-YYYY-MM.json
let currentGameId = "";
let currentBox = null;

// DOM
const monthInput = document.getElementById("monthInput");
const btnLoad = document.getElementById("btnLoad");
const loadStatus = document.getElementById("loadStatus");
const gameSelect = document.getElementById("gameSelect");
const gameMeta = document.getElementById("gameMeta");
const btnDownload = document.getElementById("btnDownload");
const btnClearGame = document.getElementById("btnClearGame");

const awayTitle = document.getElementById("awayTitle");
const homeTitle = document.getElementById("homeTitle");

const awayR = document.getElementById("awayR");
const awayH = document.getElementById("awayH");
const awayE = document.getElementById("awayE");
const homeR = document.getElementById("homeR");
const homeH = document.getElementById("homeH");
const homeE = document.getElementById("homeE");

const btnApplyTotals = document.getElementById("btnApplyTotals");
const saveHint = document.getElementById("saveHint");

const linescoreTable = document.getElementById("linescoreTable");
const btnApplyLine = document.getElementById("btnApplyLine");
const lineHint = document.getElementById("lineHint");

// 工具
function toNullOrInt(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}

function sumNullable(arr) {
  // 只加總已填的數字（null 不算）
  let s = 0;
  let hasAny = false;
  for (const x of arr) {
    if (typeof x === "number") {
      s += x;
      hasAny = true;
    }
  }
  return hasAny ? s : null;
}

function parseTeamsFromMeta(box, gameId) {
  // 優先 meta，其次用 gameId 拆
  const meta = box?.meta;
  const home = meta?.home || null;
  const away = meta?.away || null;

  if (home && away) return { home, away };

  // gameId: YYYYMMDD_客隊_主隊 or YYYYMMDD_home_away (你目前用 date_home_away)
  // 你 generator 用：date_home_away（home/away 是 schedule 的 home/away）
  // 所以這裡以「第2段=home，第3段=away」來回推比較合理
  const parts = String(gameId).split("_");
  if (parts.length >= 3) {
    const p1 = parts[1];
    const p2 = parts[2];
    // 你的 gameId 格式：date_home_away
    return { home: p1, away: p2 };
  }

  return { home: "主隊", away: "客隊" };
}

function setStatus(msg, ok = true) {
  loadStatus.textContent = msg;
  loadStatus.className = ok ? "ok" : "warn";
}

function clearInputsToNull() {
  [awayR, awayH, awayE, homeR, homeH, homeE].forEach(i => i.value = "");
}

function makeEmptyLineScoreInputs() {
  // Header
  linescoreTable.innerHTML = `
    <div class="th cell">隊伍</div>
    ${[1,2,3,4,5,6,7,8,9].map(i => `<div class="th cell">${i}</div>`).join("")}
    <div class="th cell">R</div>

    <div class="cell" id="lsAwayName">客隊</div>
    ${[1,2,3,4,5,6,7,8,9].map(i => `<div class="cell"><input id="awayIn${i}" type="number" min="0" step="1" placeholder="null"></div>`).join("")}
    <div class="cell"><input id="awayInR" type="number" min="0" step="1" placeholder="auto" disabled></div>

    <div class="cell" id="lsHomeName">主隊</div>
    ${[1,2,3,4,5,6,7,8,9].map(i => `<div class="cell"><input id="homeIn${i}" type="number" min="0" step="1" placeholder="null"></div>`).join("")}
    <div class="cell"><input id="homeInR" type="number" min="0" step="1" placeholder="auto" disabled></div>
  `;

  // 綁定逐局輸入 → 自動算 R
  for (let i = 1; i <= 9; i++) {
    document.getElementById(`awayIn${i}`).addEventListener("input", recalcRFromInnings);
    document.getElementById(`homeIn${i}`).addEventListener("input", recalcRFromInnings);
  }
}

function getInnings(team) {
  const arr = [];
  for (let i = 1; i <= 9; i++) {
    const v = document.getElementById(`${team}In${i}`).value;
    arr.push(toNullOrInt(v));
  }
  return arr;
}

function setInnings(team, arr) {
  for (let i = 1; i <= 9; i++) {
    const v = arr?.[i-1];
    const el = document.getElementById(`${team}In${i}`);
    el.value = (typeof v === "number") ? String(v) : "";
  }
}

function recalcRFromInnings() {
  const awayArr = getInnings("away");
  const homeArr = getInnings("home");

  const awaySum = sumNullable(awayArr);
  const homeSum = sumNullable(homeArr);

  document.getElementById("awayInR").value = (awaySum === null) ? "" : String(awaySum);
  document.getElementById("homeInR").value = (homeSum === null) ? "" : String(homeSum);

  // 同步到上方 R（但不強迫覆蓋：只有當逐局有填時才同步）
  if (awaySum !== null) awayR.value = String(awaySum);
  if (homeSum !== null) homeR.value = String(homeSum);
}

function renderGameSelect() {
  const ids = Object.keys(boxscoreData || {});
  ids.sort();

  gameSelect.innerHTML = `<option value="">（選擇 gameId）</option>` +
    ids.map(id => `<option value="${id}">${id}</option>`).join("");
}

function loadGame(gameId) {
  currentGameId = gameId;
  currentBox = boxscoreData?.[gameId] || null;

  if (!currentBox) {
    gameMeta.textContent = "—";
    awayTitle.textContent = "客隊";
    homeTitle.textContent = "主隊";
    clearInputsToNull();
    makeEmptyLineScoreInputs();
    return;
  }

  const t = parseTeamsFromMeta(currentBox, gameId);

  const metaDate = currentBox?.meta?.date || "";
  const metaTime = currentBox?.meta?.time || null;
  const metaVenue = currentBox?.meta?.venue || null;

  const venueText = metaVenue ? `｜${metaVenue}` : "";
  const timeText = metaTime ? `｜${metaTime}` : "";

  gameMeta.textContent = `${metaDate}｜${t.away} vs ${t.home}${timeText}${venueText}`;
  awayTitle.textContent = t.away;
  homeTitle.textContent = t.home;

  // RHE
  const totals = currentBox?.totals || {};
  awayR.value = (typeof totals?.away?.R === "number") ? String(totals.away.R) : "";
  awayH.value = (typeof totals?.away?.H === "number") ? String(totals.away.H) : "";
  awayE.value = (typeof totals?.away?.E === "number") ? String(totals.away.E) : "";
  homeR.value = (typeof totals?.home?.R === "number") ? String(totals.home.R) : "";
  homeH.value = (typeof totals?.home?.H === "number") ? String(totals.home.H) : "";
  homeE.value = (typeof totals?.home?.E === "number") ? String(totals.home.E) : "";

  // 逐局
  makeEmptyLineScoreInputs();
  document.getElementById("lsAwayName").textContent = t.away;
  document.getElementById("lsHomeName").textContent = t.home;

  const ls = currentBox?.lineScore || {};
  setInnings("away", ls.away);
  setInnings("home", ls.home);
  recalcRFromInnings();

  saveHint.textContent = "";
  lineHint.textContent = "";
}

function applyTotalsToCurrent() {
  if (!currentGameId || !currentBox) return;

  currentBox.totals = currentBox.totals || { away:{}, home:{} };

  // 如果逐局有填 → 以逐局加總為準（避免 R 不一致）
  const awayArr = getInnings("away");
  const homeArr = getInnings("home");
  const awaySum = sumNullable(awayArr);
  const homeSum = sumNullable(homeArr);

  const awayRVal = (awaySum !== null) ? awaySum : toNullOrInt(awayR.value);
  const homeRVal = (homeSum !== null) ? homeSum : toNullOrInt(homeR.value);

  currentBox.totals.away = {
    R: awayRVal,
    H: toNullOrInt(awayH.value),
    E: toNullOrInt(awayE.value),
  };
  currentBox.totals.home = {
    R: homeRVal,
    H: toNullOrInt(homeH.value),
    E: toNullOrInt(homeE.value),
  };

  saveHint.textContent = "✅ 已套用 RHE（尚未下載檔案）";
}

function applyLineToCurrent() {
  if (!currentGameId || !currentBox) return;

  currentBox.lineScore = currentBox.lineScore || { away: [], home: [] };

  const awayArr = getInnings("away");
  const homeArr = getInnings("home");

  currentBox.lineScore.away = awayArr;
  currentBox.lineScore.home = homeArr;

  // 同步 totals.R（只要逐局有填就同步；都沒填就維持原本）
  const awaySum = sumNullable(awayArr);
  const homeSum = sumNullable(homeArr);

  currentBox.totals = currentBox.totals || { away:{R:null,H:null,E:null}, home:{R:null,H:null,E:null} };
  if (awaySum !== null) currentBox.totals.away.R = awaySum;
  if (homeSum !== null) currentBox.totals.home.R = homeSum;

  // 更新上方欄位顯示
  if (awaySum !== null) awayR.value = String(awaySum);
  if (homeSum !== null) homeR.value = String(homeSum);

  lineHint.textContent = "✅ 已套用逐局（尚未下載檔案）";
}

function clearCurrentGameToNull() {
  if (!currentGameId || !currentBox) return;

  // 清成「完全未知」
  currentBox.lineScore = { away: Array(9).fill(null), home: Array(9).fill(null) };
  currentBox.totals = {
    away: { R: null, H: null, E: null },
    home: { R: null, H: null, E: null }
  };

  loadGame(currentGameId);
  saveHint.textContent = "✅ 已清空此場（尚未下載檔案）";
  lineHint.textContent = "";
}

function downloadJson() {
  if (!month) return;

  const fileName = `boxscore-${month}.json`;
  const jsonStr = JSON.stringify(boxscoreData, null, 2);

  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

async function loadMonthData(m) {
  month = m;
  setStatus(`載入中：data/boxscore-${month}.json`, true);

  // 讀 boxscore
  const url = `data/boxscore-${month}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("boxscore 檔載入失敗：" + url);

  const data = await res.json();
  boxscoreData = (data && typeof data === "object") ? data : {};

  renderGameSelect();

  setStatus(`✅ 已載入 ${month}（${Object.keys(boxscoreData).length} 場）`, true);

  // 清空目前選擇
  currentGameId = "";
  currentBox = null;
  gameMeta.textContent = "—";
  clearInputsToNull();
  makeEmptyLineScoreInputs();
}

// 事件
btnLoad.addEventListener("click", async () => {
  const v = monthInput.value; // yyyy-mm
  if (!v) return;
  try {
    await loadMonthData(v);
  } catch (e) {
    console.error(e);
    setStatus("❌ 載入失敗（確認 data/boxscore-YYYY-MM.json 是否存在）", false);
  }
});

gameSelect.addEventListener("change", () => {
  const id = gameSelect.value;
  if (!id) return;
  loadGame(id);
});

btnApplyTotals.addEventListener("click", () => {
  if (!currentBox) {
    saveHint.textContent = "⚠️ 請先選一場比賽";
    return;
  }
  applyTotalsToCurrent();
});

btnApplyLine.addEventListener("click", () => {
  if (!currentBox) {
    lineHint.textContent = "⚠️ 請先選一場比賽";
    return;
  }
  applyLineToCurrent();
});

btnClearGame.addEventListener("click", () => {
  if (!currentBox) return;
  clearCurrentGameToNull();
});

btnDownload.addEventListener("click", () => {
  downloadJson();
});

// 初始化（先畫逐局表格空殼）
makeEmptyLineScoreInputs();
const btnGenerate = document.getElementById("btnGenerate");

btnGenerate.addEventListener("click", async () => {
  const m = monthInput.value;
  if (!m) return;

  try {
    const scheduleUrl = `data/schedule-${m}.json`;
    const res = await fetch(scheduleUrl);
    if (!res.ok) {
      alert("❌ 找不到 schedule 檔案");
      return;
    }

    const games = await res.json();
    const box = {};

    games.forEach(g => {
      const date = g.date.replaceAll("-", "");
      const home = g.teams.home;
      const away = g.teams.away;

      const gameId = `${date}_${home}_${away}`;

      box[gameId] = {
        meta: {
          date: g.date,
          home,
          away,
          time: g.time ?? null,
          venue: g.venue ?? null
        },
        lineScore: {
          away: Array(9).fill(null),
          home: Array(9).fill(null)
        },
        totals: {
          away: { R: null, H: null, E: null },
          home: { R: null, H: null, E: null }
        }
      };
    });

    const blob = new Blob(
      [JSON.stringify(box, null, 2)],
      { type: "application/json" }
    );

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `boxscore-${m}.json`;
    a.click();

  } catch (e) {
    console.error(e);
    alert("❌ 產生失敗");
  }
});
function getJsonOrEmpty(id){
  try{
    const val = document.getElementById(id).value.trim();
    return val ? JSON.parse(val) : [];
  }catch(e){
    alert("JSON 格式錯誤：" + id);
    return [];
  }
}
box.batters = {
  home: getJsonOrEmpty("homeBatters"),
  away: getJsonOrEmpty("awayBatters")
};

box.pitchers = {
  home: getJsonOrEmpty("homePitchers"),
  away: getJsonOrEmpty("awayPitchers")
};
