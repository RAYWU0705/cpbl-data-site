import { TEAM_MAP } from "../data/teamMap.js";

/* 中文 ➜ teamId */
export function getTeamIdByName(name) {
  const entry = Object.entries(TEAM_MAP)
    .find(([id, data]) => data.name === name);

  return entry ? entry[0] : null;
}

/* teamId ➜ 中文 */
export function getTeamNameById(id) {
  return TEAM_MAP[id]?.name ?? "未知球隊";
}
