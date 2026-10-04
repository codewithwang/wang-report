/**
 * GET / (Cloudflare Pages Function, 2026-09-27).
 *
 * Serves the front page from Workers KV (key board:html), which
 * pages/board-refresh.js rewrites every 30 minutes and deploy.sh rewrites on
 * every deploy. Falls through to the static index.html when the key is
 * missing, so deleting the key is a complete rollback.
 */
export async function onRequestGet({ env, next }) {
  const kv = env.SUBSCRIBERS;
  if (!kv) return next();
  const html = await kv.get('board:html');
  if (!html) return next();
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'x-wr-front': 'kv',
    },
  });
}
