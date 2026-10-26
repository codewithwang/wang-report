'use strict';
const model = require('./live-sports.cjs');
function cadence(event, now=Date.now()) {
  if(now<Date.parse(event.startsAt))return {phase:'scheduled',seconds:0};
  if(now<Date.parse(event.endsAt))return {phase:'live',seconds:event.refreshSeconds||60};
  const until=Date.parse(event.reconcileUntil||new Date(Date.parse(event.endsAt)+72*3600000).toISOString());
  return now<until?{phase:'reconciling',seconds:event.reconcileSeconds||3600}:{phase:'archived',seconds:0};
}
async function refresh(event,seed,kv,{now=Date.now(),fetcher=fetch}={}) {
  const key=`live-sports:${event.id}:latest`, policy=cadence(event,now);
  let snapshot;
  try{snapshot=kv&&await kv.get(key,'json');}catch{}
  if(!snapshot || Date.parse(seed?.checkedAt)>Date.parse(snapshot.checkedAt))snapshot=seed;
  let stale=false,error=null;
  const due=policy.seconds && (!snapshot || now-Date.parse(snapshot.checkedAt)>=policy.seconds*1000);
  // A final catch-up fetch also runs when no request arrived during reconciliation.
  const finalDue=policy.phase==='archived' && (!snapshot || Date.parse(snapshot.checkedAt)<Date.parse(event.reconcileUntil||new Date(Date.parse(event.endsAt)+72*3600000).toISOString()));
  if(due||finalDue){
    try{
      const response=await fetcher(event.feedUrl,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error(`Provider HTTP ${response.status}`);
      const raw=await response.json(),checkedAt=new Date(now).toISOString();
      model.normalize(event,raw,checkedAt);
      const changed=!snapshot||JSON.stringify(raw)!==JSON.stringify(snapshot.raw);
      const next={raw,checkedAt,changedAt:changed?checkedAt:snapshot.changedAt||snapshot.checkedAt,sourceUrl:event.sourceUrl};
      if(kv){
        if(changed){
          if(snapshot)await kv.put(`live-sports:${event.id}:history:${snapshot.checkedAt}`,JSON.stringify(snapshot));
          await kv.put(`live-sports:${event.id}:history:${checkedAt}`,JSON.stringify(next));
        }
        await kv.put(key,JSON.stringify(next));
      }
      snapshot=next;
    }catch(e){stale=true;error=e.message;}
  }
  if(!snapshot)throw Error('Results unavailable');
  const data={...model.normalize(event,snapshot.raw,snapshot.checkedAt),stale,changedAt:snapshot.changedAt||snapshot.checkedAt,lifecycle:policy.phase,refreshSeconds:policy.seconds};
  if(kv)await kv.put(`live-sports:${event.id}:health`,JSON.stringify({attemptedAt:new Date(now).toISOString(),checkedAt:snapshot.checkedAt,changedAt:data.changedAt,lifecycle:policy.phase,reported:data.races.filter(r=>r.entries.length).length,total:data.races.length,error}));
  return data;
}
module.exports={cadence,refresh};
