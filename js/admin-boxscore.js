// =========================
// CPBL ADMIN BOXSCORE v2
// JSON + localStorage 雙模式
// =========================

let month = "2026-03";
let boxscoreData = {};
let currentGameId = "";
let currentBox = null;

const LOCAL_KEY = "cpbl_boxscore";

// DOM
const monthInput = document.getElementById("monthInput");
const btnLoad = document.getElementById("btnLoad");
const btnSaveLocal = document.getElementById("btnSaveLocal"); // ⭐ 新增按鈕
const loadStatus = document.getElementById("loadStatus");
const gameSelect = document.getElementById("gameSelect");
const gameMeta = document.getElementById("gameMeta");

const btnDownload = document.getElementById("btnDownload");
const btnClearGame = document.getElementById("btnClearGame");

const awayR = document.getElementById("awayR");
const awayH = document.getElementById("awayH");
const awayE = document.getElementById("awayE");
const homeR = document.getElementById("homeR");
const homeH = document.getElementById("homeH");
const homeE = document.getElementById("homeE");

// =========================
// 🔧 工具
// =========================
function toInt(v){
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
}

function normalize(name){
  return String(name).replace(/\s/g,"").replace("7-ELEVEN","7-ELEVEn");
}

function buildKey(date, home, away){
  return `${date.replaceAll("-","")}_${normalize(home)}_${normalize(away)}`;
}

function setStatus(msg, ok=true){
  loadStatus.textContent = msg;
  loadStatus.style.color = ok ? "#0f0" : "#f33";
}

// =========================
// 📥 載入 JSON
// =========================
async function loadMonthData(m){
  month = m;

  try{
    const res = await fetch(`data/boxscore-${m}.json`);
    if (!res.ok) throw new Error();

    boxscoreData = await res.json();

    renderSelect();

    setStatus(`✅ 載入 ${m} (${Object.keys(boxscoreData).length}場)`);

  }catch{
    setStatus("❌ JSON載入失敗", false);
  }
}

// =========================
// 🎯 選單
// =========================
function renderSelect(){
  const ids = Object.keys(boxscoreData).sort();

  gameSelect.innerHTML =
    `<option value="">選擇比賽</option>` +
    ids.map(id => `<option value="${id}">${id}</option>`).join("");
}

// =========================
// 📊 載入比賽
// =========================
function loadGame(id){
  currentGameId = id;
  currentBox = boxscoreData[id];

  if (!currentBox) return;

  const m = currentBox.meta;

  gameMeta.textContent =
    `${m.date}｜${m.away} vs ${m.home}`;

  awayR.value = currentBox.totals.away.R ?? "";
  awayH.value = currentBox.totals.away.H ?? "";
  awayE.value = currentBox.totals.away.E ?? "";

  homeR.value = currentBox.totals.home.R ?? "";
  homeH.value = currentBox.totals.home.H ?? "";
  homeE.value = currentBox.totals.home.E ?? "";
}

// =========================
// 💾 套用 RHE
// =========================
function applyTotals(){
  if (!currentBox) return;

  currentBox.totals.away = {
    R: toInt(awayR.value),
    H: toInt(awayH.value),
    E: toInt(awayE.value)
  };

  currentBox.totals.home = {
    R: toInt(homeR.value),
    H: toInt(homeH.value),
    E: toInt(homeE.value)
  };

  setStatus("✅ 已套用（尚未儲存）");
}

// =========================
// ⭐⭐ 核心：寫入 localStorage ⭐⭐
// =========================
function saveToLocal(){

  if (!currentGameId || !currentBox){
    setStatus("⚠️ 請先選比賽", false);
    return;
  }

  const local = JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};

  // 🔥 同步 key（避免不一致）
  const meta = currentBox.meta;
  const newKey = buildKey(meta.date, meta.home, meta.away);

  local[newKey] = currentBox;

  localStorage.setItem(LOCAL_KEY, JSON.stringify(local));

  setStatus("🔥 已寫入 localStorage（全站同步）");
}

// =========================
// 📤 下載 JSON
// =========================
function downloadJson(){
  const blob = new Blob(
    [JSON.stringify(boxscoreData,null,2)],
    {type:"application/json"}
  );

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `boxscore-${month}.json`;
  a.click();
}

// =========================
// 🧹 清空
// =========================
function clearGame(){
  if (!currentBox) return;

  currentBox.totals = {
    away:{R:null,H:null,E:null},
    home:{R:null,H:null,E:null}
  };

  loadGame(currentGameId);
  setStatus("🧹 已清空");
}

// =========================
// 🎯 事件
// =========================
btnLoad.addEventListener("click", () => {
  const m = monthInput.value;
  if (!m) return;
  loadMonthData(m);
});

gameSelect.addEventListener("change", () => {
  if (gameSelect.value){
    loadGame(gameSelect.value);
  }
});

document.getElementById("btnApplyTotals")
  .addEventListener("click", applyTotals);

btnSaveLocal.addEventListener("click", saveToLocal);

btnDownload.addEventListener("click", downloadJson);

btnClearGame.addEventListener("click", clearGame);