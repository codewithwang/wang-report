/**
 * Prefer the frequently refreshed KV homepage unless the deployed homepage
 * carries a newer edition/revision. KV write limits must not hide an edition
 * that was successfully published to Pages. KV read failures use Pages too.
 */
function editionVersion(html) {
  const slug=html.match(/data-edition="(\d{4}-\d{2}-\d{2}-(?:am|pm))"/)?.[1]||'';
  const revision=html.match(/data-edition-revision="([^"]+)"/)?.[1]||'';
  return slug?slug+'|'+revision:'';
}
export async function onRequestGet({ env, next }) {
  const deployed=await next();
  let html;
  try { html=await env.SUBSCRIBERS?.get('board:html'); } catch { return deployed; }
  if(!html)return deployed;
  if(deployed.ok){
    const staticHtml=await deployed.clone().text();
    if(editionVersion(staticHtml)>editionVersion(html)){
      const headers=new Headers(deployed.headers);
      headers.set('x-wr-front','static-newer-edition');
      headers.set('cache-control','public, max-age=60');
      return new Response(staticHtml,{status:deployed.status,headers});
    }
  }
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=60','x-wr-front':'kv'}});
}
