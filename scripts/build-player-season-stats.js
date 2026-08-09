import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const YEAR = Number(process.argv.find(x => x.startsWith('--year='))?.split('=')[1] || 2026);
const INPUT = path.join(ROOT, 'data', 'live', 'live-boxscore.json');
const OUT = path.join(ROOT, 'data', 'players', `season-stats-${YEAR}.json`);

const TEAM_SLUGS = {
  '中信兄弟': 'brothers', '統一7-ELEVEn獅': 'lions', '樂天桃猿': 'monkeys',
  '味全龍': 'dragons', '富邦悍將': 'guardians', '台鋼雄鷹': 'hawks'
};

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const pick = (o, ks) => { for (const k of ks) if (o?.[k] !== undefined && o?.[k] !== null && o?.[k] !== '') return o[k]; return 0; };
const text = v => String(v ?? '').trim();
function ipToOuts(v) {
  const s = text(v);
  if (!s) return 0;
  if (/^\d+\.\d$/.test(s)) { const [i, f] = s.split('.').map(Number); return i * 3 + Math.min(2, f); }
  if (/^\d+\s+\d\/3$/.test(s)) { const [i, frac] = s.split(/\s+/); return Number(i) * 3 + Number(frac[0]); }
  if (/^\d+\/3$/.test(s)) return Number(s.split('/')[0]);
  const x = Number(s); return Number.isFinite(x) ? Math.round(x * 3) : 0;
}
function outsToIp(outs) { return `${Math.floor(outs / 3)}.${outs % 3}`; }
function safeRate(a, b, d=3) { return b ? (a / b).toFixed(d) : (0).toFixed(d); }
function rateNoZero(v) { return Number(v).toFixed(3).replace(/^0/, ''); }
function playerKey(row) { return text(row?.acnt || row?.playerAcnt || row?.raw?.HitterAcnt || row?.raw?.PitcherAcnt) || `name:${text(row?.name)}`; }
function playerName(row) { return text(row?.name || row?.playerName || row?.HitterName || row?.PitcherName); }
function ensure(map, row, team) {
  const key = playerKey(row); const name = playerName(row); if (!name) return null;
  if (!map.has(key)) map.set(key, {
    id: key.startsWith('name:') ? '' : key, name, team: team || '', teams: {},
    batting: { G:0, PA:0, AB:0, R:0, H:0, '2B':0, '3B':0, HR:0, TB:0, RBI:0, BB:0, IBB:0, HBP:0, SO:0, SH:0, SF:0, SB:0, CS:0, GDP:0 },
    pitching: { G:0, GS:0, W:0, L:0, SV:0, HLD:0, outs:0, BF:0, NP:0, H:0, HR:0, BB:0, IBB:0, HBP:0, SO:0, R:0, ER:0, WP:0, BK:0, maxSpeed:0 }
  });
  const p = map.get(key); if (team) { p.teams[team]=(p.teams[team]||0)+1; if (!p.team) p.team=team; }
  return p;
}

const raw = JSON.parse(await fs.readFile(INPUT, 'utf8'));
const games = Array.isArray(raw) ? raw : Object.values(raw || {});
const map = new Map();
let finalGames=0, detailedFinalGames=0;
for (const g of games) {
  const meta=g.meta||{}; const year=Number(text(meta.date||g.date).slice(0,4));
  if ((meta.status||g.status)!=='final' || year!==YEAR) continue;
  finalGames++;
  const hasDetail=['away','home'].some(side => (g.batters?.[side]?.length||0) || (g.pitchers?.[side]?.length||0));
  if (hasDetail) detailedFinalGames++;
  for (const side of ['away','home']) {
    const team = side==='away' ? (meta.away||g.away||'') : (meta.home||g.home||'');
    const seenBat=new Set();
    for (const row of (g.batters?.[side]||[])) {
      const p=ensure(map,row,team); if(!p) continue; const k=playerKey(row); if(!seenBat.has(k)){p.batting.G++;seenBat.add(k);}
      const b=p.batting;
      b.PA+=n(pick(row,['PA','pa','打席'])); b.AB+=n(pick(row,['AB','ab','打數'])); b.R+=n(pick(row,['R','run','runs','得分'])); b.H+=n(pick(row,['H','hit','hits','安打']));
      b['2B']+=n(pick(row,['2B','double','二壘打'])); b['3B']+=n(pick(row,['3B','triple','三壘打'])); b.HR+=n(pick(row,['HR','hr','全壘打'])); b.TB+=n(pick(row,['TB','totalBases','壘打數']));
      b.RBI+=n(pick(row,['RBI','rbi','打點'])); b.BB+=n(pick(row,['BB','bb','保送'])); b.IBB+=n(pick(row,['IBB','故意四壞'])); b.HBP+=n(pick(row,['HBP','觸身'])); b.SO+=n(pick(row,['SO','K','三振']));
      b.SH+=n(pick(row,['SH','犧牲觸擊'])); b.SF+=n(pick(row,['SF','犧牲飛球'])); b.SB+=n(pick(row,['SB','盜壘'])); b.CS+=n(pick(row,['CS','盜壘失敗'])); b.GDP+=n(pick(row,['GDP','雙殺打']));
    }
    const seenPit=new Set();
    for (const row of (g.pitchers?.[side]||[])) {
      const p=ensure(map,row,team); if(!p) continue; const k=playerKey(row); const q=p.pitching; if(!seenPit.has(k)){q.G++;seenPit.add(k);}
      if (text(row.roleType).includes('先發') || Number(row.order)===1) q.GS++;
      q.outs+=ipToOuts(pick(row,['IP','ip','局數'])); q.BF+=n(pick(row,['BF','bf','面對打者'])); q.NP+=n(pick(row,['NP','np','球數'])); q.H+=n(pick(row,['H','被安打'])); q.HR+=n(pick(row,['HR','被全壘打']));
      q.BB+=n(pick(row,['BB','保送'])); q.IBB+=n(pick(row,['IBB','故意四壞'])); q.HBP+=n(pick(row,['HBP','觸身'])); q.SO+=n(pick(row,['SO','K','三振'])); q.R+=n(pick(row,['R','失分'])); q.ER+=n(pick(row,['ER','責失']));
      q.WP+=n(pick(row,['WP','暴投'])); q.BK+=n(pick(row,['BK','投手犯規'])); q.maxSpeed=Math.max(q.maxSpeed,n(pick(row,['maxSpeed','MaxSpeed','最快球速'])));
    }
  }
  // 勝敗救援以「比賽層級 decision」為準，避免投手列本身沒有 decision 時全部算成 0。
  const decision = g.decision || {};
  for (const [field, stat] of [['win','W'], ['lose','L'], ['save','SV']]) {
    const target = text(decision[field]);
    if (!target) continue;
    for (const player of map.values()) {
      if (player.name === target) { player.pitching[stat]++; break; }
    }
  }
}
const players=[...map.values()].map(p=>{
  const b=p.batting, q=p.pitching;
  if(!b.TB) b.TB=b.H + b['2B'] + 2*b['3B'] + 3*b.HR;
  const avg=b.AB?b.H/b.AB:0; const obpDen=b.AB+b.BB+b.HBP+b.SF; const obp=obpDen?(b.H+b.BB+b.HBP)/obpDen:0; const slg=b.AB?b.TB/b.AB:0;
  Object.assign(b,{AVG:rateNoZero(avg),OBP:rateNoZero(obp),SLG:rateNoZero(slg),OPS:(obp+slg).toFixed(3).replace(/^0/,'')});
  const ip=q.outs/3; const whip=q.outs?((q.BB+q.H)/ip):0; const era=q.outs?((q.ER*9)/ip):0;
  Object.assign(q,{IP:outsToIp(q.outs),ERA:era.toFixed(2),WHIP:whip.toFixed(2),K9:ip?(q.SO*9/ip).toFixed(2):'0.00',BB9:ip?(q.BB*9/ip).toFixed(2):'0.00',KBB:q.BB?(q.SO/q.BB).toFixed(2):(q.SO?'∞':'0.00')});
  p.team=Object.entries(p.teams).sort((a,b)=>b[1]-a[1])[0]?.[0]||p.team;
  p.teamSlug=TEAM_SLUGS[p.team]||'';
  return p;
}).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));
const now=new Date().toISOString();
const out={season:YEAR,updatedAt:now,source:'derived:data/live/live-boxscore.json',dataStatus:{status:detailedFinalGames===finalGames?'ok':'partial',isCached:false,lastSuccessfulAt:now,finalGames,detailedFinalGames,missingDetailGames:finalGames-detailedFinalGames,coveragePct:finalGames?Number((detailedFinalGames/finalGames*100).toFixed(1)):0},players};
await fs.mkdir(path.dirname(OUT),{recursive:true});
await fs.writeFile(OUT,JSON.stringify(out,null,2),'utf8');
console.log(`✅ ${path.relative(ROOT,OUT)}：${players.length} 名球員`);
console.log(`📦 已完賽 ${finalGames}｜含球員明細 ${detailedFinalGames}｜涵蓋率 ${out.dataStatus.coveragePct}%`);
