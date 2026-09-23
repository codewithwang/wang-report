/**
 * Site-wide middleware (Cloudflare Pages Function, 2026-09-24).
 *
 * www.wangreport.com answered 200 with a full copy of the site, so every page
 * had a www twin in Google's index. 301 it to the apex, path and query intact.
 * Done here rather than as a zone Redirect Rule because the deploy token has
 * no rules scope; move it to a Redirect Rule if that scope is ever added.
 */
export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === 'www.wangreport.com') {
    url.hostname = 'wangreport.com';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
