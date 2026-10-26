'use strict';
const archiveUrl=e=>e.archiveUrl||`/sports/events/${e.id}`;
function state(event,data,now=Date.now()){
 const override=event.status;
 const eventState=['postponed','cancelled'].includes(override)?override:now<Date.parse(event.actualStartsAt||event.startsAt)?'scheduled':now<Date.parse(event.actualEndsAt||event.endsAt)?'live':'ended';
 const races=data?.races||[],reported=races.filter(r=>r.entries.length).length,complete=!!races.length&&races.every(r=>r.complete);
 const authoritative=event.verification?.status==='verified'&&event.verification?.sourceUrl&&event.verification?.verifiedAt;
 const evidence=complete?(authoritative?'verified':'provisional'):reported?'incomplete':'awaiting';
 const stalled=eventState==='live'&&data?.changedAt&&reported<races.length&&now-Date.parse(data.changedAt)>(event.expectedUpdateMinutes||30)*60000;
 const sourceState=data?.stale?'unavailable':stalled?'unchanged':'healthy';
 const roundup=event.roundup?.url?'published':eventState==='ended'?(complete?'due':'held'):'not-due';
 return {event:eventState,evidence,source:sourceState,reported,total:races.length,roundup,archiveUrl:archiveUrl(event),owners:event.owners||{editorial:'Sports / Dev Chatterjee',review:'Walter Wang',operations:'Site operations'},reason:roundup==='held'?'Awaiting sufficient outcomes for the round-up':roundup==='due'?'Complete source results available; editorial and source review required before publication.':null,nextReview:event.reconcileUntil||new Date(Date.parse(event.actualEndsAt||event.endsAt)+72*3600000).toISOString()};
}
module.exports={state,archiveUrl};
