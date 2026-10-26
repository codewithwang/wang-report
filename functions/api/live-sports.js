import runtime from '../../lib/live-sports-runtime.cjs';
import registry from '../../data/live-sports/events.json';
import galaSeed from '../../data/live-sports/db-dragon-boat-2026.json';
const seeds={'db-dragon-boat-2026':galaSeed};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function onRequestGet({request,env,waitUntil}) {
 const event=registry.events.find(e=>e.id===new URL(request.url).searchParams.get('event'));
 if(!event)return json({error:'Unknown event'},404);
 const phase=runtime.cadence(event).phase;
 const cacheKey=new Request(`${new URL(request.url).origin}/api/live-sports/cache/v2/${event.id}/${phase}`);
 const cache=typeof caches!=='undefined'?caches.default:null;
 const hit=cache&&await cache.match(cacheKey);if(hit)return json(await hit.json());
 try{
  const data=await runtime.refresh(event,seeds[event.id],env.SUBSCRIBERS);
  if(cache)waitUntil(cache.put(cacheKey,new Response(JSON.stringify(data),{headers:{'cache-control':`public, max-age=${data.stale?20:60}`}})));
  return json(data);
 }catch{return json({error:'Results unavailable'},503);}
}
