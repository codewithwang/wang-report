import runtime from '../../../lib/live-sports-runtime.cjs';
import model from '../../../lib/live-sports.cjs';
import css from '../../../lib/live-sports-style.cjs';
import registry from '../../../data/live-sports/events.json';
import galaSeed from '../../../data/live-sports/db-dragon-boat-2026.json';
const seeds={'db-dragon-boat-2026':galaSeed};
export async function onRequestGet({params,env}) {
 const event=registry.events.find(e=>e.id===String(params.id).replace(/\.html$/,''));
 if(!event)return new Response('Event not found',{status:404});
 let data;try{data=await runtime.refresh(event,seeds[event.id],env.SUBSCRIBERS);}catch{return new Response('Event record temporarily unavailable',{status:503});}
 const esc=model.esc;
 const historical=Date.now()>=Date.parse(event.actualEndsAt||event.endsAt);
 const label=historical?'Historical programme and available results':'Programme and results';
 return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(event.title)}: ${historical?'event record':'programme and results'} | The Wang Report</title><meta name="description" content="${label} for ${esc(event.title)}. Incomplete and provisional results are identified."><link rel="canonical" href="https://wangreport.com/sports/events/${esc(event.id)}"><style>body{margin:0;background:#f7f5ef;color:#172b37;font:16px/1.6 Arial,sans-serif}header,main,footer{max-width:900px;margin:auto;padding:20px}header{border-bottom:1px solid #d8d8cc}header a{color:inherit}h1{font:700 36px/1.15 Georgia,serif}a{color:#1e5c46}${css}</style></head><body><header><a href="/">The Wang Report</a> / <a href="/desk/sports">Sports</a></header><main><h1>${esc(event.title)}</h1><p>${esc(event.date)} · ${label}</p><section class="ls-event ls-full" data-live-sport="${esc(event.id)}" data-live-mode="full" data-live-archive="true">${model.render(data,'full')}</section></main><footer><a href="/desk/sports">Back to Sports</a> · <a href="/about">About The Wang Report</a></footer><script src="/live-sports-model.js"></script><script src="/live-sports-client.js"></script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
