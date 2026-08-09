const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = value => String(value ?? "").trim();

function inningValue(value) {
  if (String(value).toUpperCase() === "X") return 0;
  return n(value);
}

export function buildScoreTimeline(game = {}) {
  const innings = game.lineScore?.innings || [];
  const away = game.lineScore?.away || [];
  const home = game.lineScore?.home || [];
  const timeline = [];
  let awayScore = 0;
  let homeScore = 0;

  innings.forEach((inning, index) => {
    const beforeAway = awayScore;
    const beforeHome = homeScore;
    const awayRuns = inningValue(away[index]);
    const homeRuns = inningValue(home[index]);

    awayScore += awayRuns;
    if (awayRuns > 0) timeline.push({
      inning: n(inning) || index + 1, half: "TOP", runs: awayRuns,
      before: { away: beforeAway, home: beforeHome },
      after: { away: awayScore, home: homeScore }
    });

    const beforeHomeHalf = { away: awayScore, home: homeScore };
    homeScore += homeRuns;
    if (homeRuns > 0) timeline.push({
      inning: n(inning) || index + 1, half: "BOTTOM", runs: homeRuns,
      before: beforeHomeHalf,
      after: { away: awayScore, home: homeScore }
    });
  });
  return timeline;
}

function leader(score) {
  if (score.away === score.home) return "TIE";
  return score.away > score.home ? "AWAY" : "HOME";
}

export function findTurningPoint(game = {}) {
  const timeline = buildScoreTimeline(game);
  if (!timeline.length) return null;

  const enriched = timeline.map(event => {
    const beforeLeader = leader(event.before);
    const afterLeader = leader(event.after);
    const leadChange = beforeLeader !== afterLeader;
    const lateBonus = Math.max(0, event.inning - 5) * 4;
    const scoreImpact = event.runs * 12;
    const type = afterLeader === "TIE" ? "TIE_GAME" :
      beforeLeader === "TIE" ? "TAKE_LEAD" :
      leadChange ? "LEAD_CHANGE" : "BIG_INNING";
    const importance = Math.min(100, scoreImpact + lateBonus + (leadChange ? 35 : 0) + (afterLeader === "TIE" ? 20 : 0));
    return { ...event, type, importance };
  });

  return enriched.sort((a, b) => b.importance - a.importance || b.inning - a.inning)[0];
}

function batterRating(player = {}) {
  let raw = 5;
  raw += n(player.H) * 0.75 + n(player["2B"]) * 0.35 + n(player["3B"]) * 0.7;
  raw += n(player.HR) * 1.5 + n(player.RBI) * 0.55 + n(player.R) * 0.25;
  raw += n(player.BB) * 0.25 + n(player.SB) * 0.25;
  raw -= n(player.SO) * 0.15 + n(player.GDP) * 0.35;
  if (player.gameWinningRbi) raw += 1.2;
  if (player.isMvp) raw += 0.8;
  return Math.max(0, Math.min(10, raw));
}

function pitcherRating(player = {}) {
  const ip = n(player.IP ?? player.InningsPitched ?? player.inningsPitched);
  const er = n(player.ER ?? player.EarnedRun ?? player.earnedRuns);
  const h = n(player.H ?? player.Hits ?? player.hits);
  const bb = n(player.BB ?? player.BasesOnBalls ?? player.walks);
  const so = n(player.SO ?? player.StrikeOut ?? player.strikeouts);
  let raw = 5 + ip * 0.45 + so * 0.18 - er * 0.75 - h * 0.12 - bb * 0.2;
  const decision = text(player.decision ?? player.Decision).toUpperCase();
  if (["W", "SV", "HLD"].includes(decision)) raw += 0.7;
  return Math.max(0, Math.min(10, raw));
}

export function rankMvpCandidates(game = {}, limit = 3) {
  const candidates = [];
  for (const side of ["away", "home"]) {
    for (const player of game.batters?.[side] || []) {
      if (!text(player.name)) continue;
      candidates.push({
        name: text(player.name), side, type: "BATTER", score: batterRating(player),
        reasons: [
          n(player.H) ? `${n(player.H)} 安打` : "",
          n(player.RBI) ? `${n(player.RBI)} 打點` : "",
          n(player.HR) ? `${n(player.HR)} 全壘打` : "",
          player.gameWinningRbi ? "勝利打點" : ""
        ].filter(Boolean)
      });
    }
    for (const player of game.pitchers?.[side] || []) {
      if (!text(player.name)) continue;
      const ip = n(player.IP ?? player.InningsPitched ?? player.inningsPitched);
      const er = n(player.ER ?? player.EarnedRun ?? player.earnedRuns);
      const so = n(player.SO ?? player.StrikeOut ?? player.strikeouts);
      candidates.push({
        name: text(player.name), side, type: "PITCHER", score: pitcherRating(player),
        reasons: [ip ? `${ip} 局` : "", `${er} 自責分`, so ? `${so} 三振` : ""].filter(Boolean)
      });
    }
  }
  return candidates.sort((a,b) => b.score-a.score).slice(0, limit).map(item => ({...item, score: Number(item.score.toFixed(1))}));
}

function statusOf(game) { return text(game.meta?.status || game.status).toLowerCase(); }
function teamName(game, side) { return text(game.meta?.[side]) || (side === "away" ? "客隊" : "主隊"); }

export function generateGameStory(game = {}) {
  const away = teamName(game, "away");
  const home = teamName(game, "home");
  const awayR = n(game.totals?.away?.R);
  const homeR = n(game.totals?.home?.R);
  const status = statusOf(game);
  const turningPoint = findTurningPoint(game);
  const final = status === "final";
  const winner = awayR === homeR ? "雙方" : awayR > homeR ? away : home;
  const loser = awayR === homeR ? "" : awayR > homeR ? home : away;

  let headline = `${away} 對 ${home}`;
  let summary = `目前比分 ${away} ${awayR}：${homeR} ${home}。`;
  if (final) {
    headline = awayR === homeR ? `${away}與${home}戰成平手` : `${winner}以${Math.max(awayR, homeR)}：${Math.min(awayR, homeR)}擊敗${loser}`;
    summary = `${winner}${awayR === homeR ? "與對手戰成平手" : `以 ${Math.max(awayR, homeR)}：${Math.min(awayR, homeR)} 擊敗${loser}`}。`;
  }
  if (turningPoint) {
    const half = turningPoint.half === "TOP" ? "上" : "下";
    summary += ` ${turningPoint.inning} 局${half}攻下 ${turningPoint.runs} 分，是本場重要轉折。`;
  }
  return { headline, summary };
}

export function analyzeGame(game = {}) {
  const turningPoint = findTurningPoint(game);
  const mvpCandidates = rankMvpCandidates(game);
  const story = generateGameStory(game);
  const status = statusOf(game);
  const hasLineScore = Array.isArray(game.lineScore?.innings) && game.lineScore.innings.length > 0;
  return {
    version: "6.0.0",
    gameSno: game.gameSno ?? null,
    status,
    ...story,
    turningPoint,
    mvpCandidates,
    tags: [
      turningPoint?.type === "LEAD_CHANGE" ? "逆轉／領先交換" : "",
      turningPoint?.runs >= 3 ? "大局攻勢" : "",
      status === "final" ? "比賽結束" : status === "live" ? "比賽進行中" : ""
    ].filter(Boolean),
    dataConfidence: hasLineScore ? "HIGH" : "LIMITED"
  };
}
