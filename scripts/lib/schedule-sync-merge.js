const PROTECTED = new Set(['live','final']);

export function hasText(v){ return typeof v === 'string' && v.trim() !== ''; }

export function normalizeScheduleStatus(raw='') {
  const s=String(raw||'').trim();
  if (/延賽|延期|postpon/i.test(s)) return 'postponed';
  if (/保留|中止|suspend/i.test(s)) return 'suspended';
  if (/取消|cancel/i.test(s)) return 'cancelled';
  return 'scheduled';
}

export function mergeOfficialSchedule(existingGames, officialGames, nowIso = new Date().toISOString()) {
  const map = new Map((existingGames||[]).map(g=>[Number(g.gameSno), g]));
  const changes=[];
  let inserted=0, updated=0, protectedCount=0;

  for (const off of officialGames||[]) {
    const sno=Number(off.gameSno); if(!sno) continue;
    const old=map.get(sno);
    if(!old){
      map.set(sno, {
        gameSno:sno,
        sourceStage:'schedule-sync',
        meta:{date:off.date||'',home:off.home||'',away:off.away||'',status:off.status||'scheduled',statusText:off.statusText||'比賽尚未開始',type:off.type||'regular',typeText:off.typeText||'一軍例行賽',time:off.time||'',duration:'',venue:off.venue||'',officialUrl:off.officialUrl||'',urlMode:'schedule',win:null,lose:null,save:null,mvp:null},
        lineScore:{home:[],away:[]}, totals:{home:{R:null,H:null,E:null},away:{R:null,H:null,E:null}}, batters:{home:[],away:[]}, pitchers:{home:[],away:[]},
        scheduleSync:{source:'cpbl-official-schedule',updatedAt:nowIso}
      }); inserted++; changes.push({gameSno:sno,kind:'inserted'}); continue;
    }
    const oldStatus=old?.meta?.status||old?.status||'';
    const locked=PROTECTED.has(oldStatus) || old?.finalLock?.locked===true;
    if(locked){ protectedCount++; continue; }
    const nextMeta={...(old.meta||{})};
    const fields=['date','home','away','time','venue','type','typeText','officialUrl'];
    const diff={};
    for(const f of fields){ if(hasText(off[f]) && off[f]!==nextMeta[f]){diff[f]={from:nextMeta[f]??'',to:off[f]}; nextMeta[f]=off[f];} }
    if(off.status && off.status!==nextMeta.status){diff.status={from:nextMeta.status||'',to:off.status}; nextMeta.status=off.status; nextMeta.statusText=off.statusText||nextMeta.statusText;}
    if(Object.keys(diff).length){
      map.set(sno,{...old,sourceStage:'schedule-sync',meta:nextMeta,status:nextMeta.status,statusText:nextMeta.statusText,scheduleSync:{source:'cpbl-official-schedule',updatedAt:nowIso,diff}});
      updated++; changes.push({gameSno:sno,kind:'updated',diff});
    }
  }
  const games=[...map.values()].sort((a,b)=>(a.meta?.date||'9999').localeCompare(b.meta?.date||'9999')||Number(a.gameSno)-Number(b.gameSno));
  return {games,summary:{officialCount:(officialGames||[]).length,inserted,updated,protected:protectedCount,changed:inserted+updated,changes}};
}
