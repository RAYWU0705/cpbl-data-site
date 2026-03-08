export function initHome() {
// 1️⃣ 取得首頁 TOP 6 的容器
const top6List = document.getElementById("top6List")

// 2️⃣ 複製資料（不要動原本 teamsData）
const sortedTeams = [...teamsData]

// 3️⃣ 排名排序規則
sortedTeams.sort((a, b) => {
  const gamesA = a.wins + a.losses
  const gamesB = b.wins + b.losses

  const pctA = gamesA === 0 ? 0 : a.wins / gamesA
  const pctB = gamesB === 0 ? 0 : b.wins / gamesB

  if (pctA !== pctB) {
    return pctB - pctA
  }

  return b.wins - a.wins
})

// 4️⃣ 只取前 6 名
const top6Teams = sortedTeams.slice(0, 6)

// 5️⃣ render 畫面
top6List.innerHTML = ""

top6Teams.forEach((team, index) => {
  const games = team.wins + team.losses
  const pct = games === 0 ? ".000" : (team.wins / games).toFixed(3)

  const li = document.createElement("li")
  li.style.cursor = "pointer"

  li.addEventListener("click", () => {
    window.location.href = `team.html?team=${team.id}`
  })

  li.innerHTML = `
    <span class="rank">${index + 1}</span>
    <span class="team">${team.name}</span>
    <span class="record">${team.wins}-${team.losses}</span>
    <span class="pct">${pct}</span>
  `
  top6List.appendChild(li)
})
}
initHome();

