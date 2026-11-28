import withdrawnBriefings from '../lib/withdrawn-briefings.cjs';
const WITHDRAWN = new Set(withdrawnBriefings);
/**
 * Site-wide middleware (Cloudflare Pages Function, 2026-09-24).
 *
 * www.wangreport.com answered 200 with a full copy of the site, so every page
 * had a www twin in Google's index. 301 it to the apex, path and query intact.
 * Done here rather than as a zone Redirect Rule because the deploy token has
 * no rules scope; move it to a Redirect Rule if that scope is ever added.
 */
// Old desk pages -> the simple desk pages (2026-09-29, Harry: "apply to all
// remaining pages"). Permanent, so their search standing carries over.
// Revert: empty this map.
const DESK_MOVES = {
  '/hk-local': '/desk/hk', '/hk-finance': '/desk/finance', '/cyber': '/desk/cyber', '/geopolitical': '/desk/world',
  '/ai-focus': '/desk/ai', '/sports': '/desk/sports', '/science': '/desk/science', '/life': '/desk/life',
};

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const slug = url.pathname.match(/^\/briefings\/([a-z0-9-]+)(?:\.html|\/)?$/)?.[1];
  if (WITHDRAWN.has(slug)) return new Response(null, {
    status: 302, headers: { 'Location': 'https://wangreport.com/', 'Cache-Control': 'no-store' },
  });
  if (url.hostname === 'www.wangreport.com') {
    url.hostname = 'wangreport.com';
    return Response.redirect(url.toString(), 301);
  }
  const to = DESK_MOVES[url.pathname.replace(/\.html$/, '').replace(/\/$/, '')];
  if (to) return Response.redirect(`https://wangreport.com${to}`, 301);
  return next();
}
