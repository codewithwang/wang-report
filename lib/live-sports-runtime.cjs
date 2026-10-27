'use strict';
const model = require('./live-sports.cjs');
const governance = require('./event-governance.cjs');
function cadence(event, now=Date.now()) {
  if(event.closure?.closedAt && now>=Date.parse(event.closure.closedAt))return {phase:'archived',seconds:0};
  if(['cancelled','postponed'].includes(event.status))return {phase:event.status,seconds:0};
  if(now<Date.parse(event.actualStartsAt||event.startsAt))return {phase:'scheduled',seconds:0};
  if(now<Date.parse(event.actualEndsAt||event.endsAt))return {phase:'live',seconds:event.refreshSeconds||60};
  return {phase:'archived',seconds:0};
}
async function refresh(event,seed,kv,{now=Date.now(),fetcher=fetch,trigger='request'}={}) {
  const key=`live-sports:${event.id}:latest`, policy=cadence(event,now);
  let snapshot;
  try{snapshot=kv&&await kv.get(key,'json');}catch{}
  if(!snapshot || Date.parse(seed?.checkedAt)>Date.parse(snapshot.checkedAt)){
    const same=snapshot&&seed&&JSON.stringify(snapshot.raw)===JSON.stringify(seed.raw);
    snapshot=seed?{...seed,changedAt:seed.changedAt||(same?(snapshot.changedAt||snapshot.checkedAt):seed.checkedAt)}:snapshot;
  }
  let priorHealth=null;try{priorHealth=policy.seconds&&kv&&await kv.get(`live-sports:${event.id}:health`,'json');}catch{}
  let stale=!!priorHealth?.error,error=priorHealth?.error||null;
  const retryDue=!error||!priorHealth.lastAttemptAt||now-Date.parse(priorHealth.lastAttemptAt)>=Math.max(policy.seconds||3600,60)*1000;
  const due=policy.seconds && (!snapshot || now-Date.parse(snapshot.checkedAt)>=policy.seconds*1000);
  // Closure is a hard collection boundary, including reader-triggered requests.
  const attempted=!!(due&&retryDue);
  if(attempted){
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
      snapshot=next;stale=false;error=null;
    }catch(e){stale=true;error=e.message;}
  }
  if(!snapshot)throw Error('Results unavailable');
  const data={...model.normalize(event,snapshot.raw,snapshot.checkedAt),stale,changedAt:snapshot.changedAt||snapshot.checkedAt,lifecycle:policy.phase,refreshSeconds:policy.seconds};
  data.governance=governance.state(event,data,now);
  if(kv&&attempted){
    const observedAt=new Date(now).toISOString();
    await kv.put(`live-sports:${event.id}:health`,JSON.stringify({observedAt,lastAttemptAt:observedAt,lastScheduledAt:trigger==='scheduled'?observedAt:priorHealth?.lastScheduledAt||null,checkedAt:snapshot.checkedAt,changedAt:data.changedAt,lifecycle:policy.phase,governance:data.governance,reported:data.governance.reported,total:data.races.length,error}));
  }
  return data;
}
module.exports={cadence,refresh};
