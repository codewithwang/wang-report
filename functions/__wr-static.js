/** Deployment verification only. ASSETS bypasses homepage/desk KV functions. */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const route = url.searchParams.get('route');
  if (!/^[a-z0-9-]+\.wangreport\.pages\.dev$/.test(url.hostname) ||
      !(route === '/' || /^\/desk\/[a-z-]{2,20}$/.test(route || ''))) {
    return new Response('Not found', { status: 404 });
  }
  url.pathname = route;
  url.search = '';
  const asset = await env.ASSETS.fetch(new Request(url, { headers: { 'cache-control': 'no-cache' } }));
  const headers = new Headers(asset.headers);
  headers.set('x-wr-front', 'pages-assets');
  headers.set('cache-control', 'no-store');
  return new Response(asset.body, { status: asset.status, headers });
}
