import model from '../../lib/live-sports.cjs';
import registry from '../../data/live-sports/events.json';
import galaSeed from '../../data/live-sports/db-dragon-boat-2026.json';

const seeds = {'db-dragon-boat-2026':galaSeed};
const json = (body, status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});

export async function onRequestGet({request,env,waitUntil}) {
  const id = new URL(request.url).searchParams.get('event');
  const event = registry.events.find(e=>e.id===id);
  if (!event) return json({error:'Unknown event'},404);
  const now = Date.now(), phase = model.phase(event,now);
  const cacheKey = new Request(`${new URL(request.url).origin}/api/live-sports/cache/${event.id}/${phase}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const hit = cache && await cache.match(cacheKey);
  if (hit) return json(await hit.json());
  const key = `live-sports:${event.id}:latest`;
  let snapshot;
  try { snapshot = env.SUBSCRIBERS && await env.SUBSCRIBERS.get(key,'json'); } catch {}
  snapshot = snapshot || seeds[id];
  let stale = false;
  // No requests to the provider outside the configured event window. The last
  // successful snapshot remains available as an archive, never labelled final.
  if (phase === 'live' && (!snapshot || now-Date.parse(snapshot.checkedAt)>=event.refreshSeconds*1000)) {
    try {
      const upstream = await fetch(event.feedUrl,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
      if (!upstream.ok) throw Error(`Provider HTTP ${upstream.status}`);
      const raw = await upstream.json();
      const checkedAt = new Date().toISOString();
      model.normalize(event,raw,checkedAt); // Validate before replacing last good data.
      snapshot = {raw,checkedAt};
      if (env.SUBSCRIBERS) await env.SUBSCRIBERS.put(key,JSON.stringify(snapshot));
    } catch { stale = true; }
  }
  if (!snapshot) return json({error:'Results unavailable'},503);
  const data = {...model.normalize(event,snapshot.raw,snapshot.checkedAt),stale};
  if (cache) {
    const stored = new Response(JSON.stringify(data),{headers:{'content-type':'application/json','cache-control':`public, max-age=${stale?20:phase==='live'?60:300}`}});
    waitUntil(cache.put(cacheKey,stored));
  }
  return json(data);
}
