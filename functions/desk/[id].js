/**
 * GET /desk/<id> (Cloudflare Pages Function, 2026-09-29).
 *
 * Serves the simple desk pages from Workers KV (key desk:<id>), which
 * pages/board-refresh.js rewrites every 30 minutes alongside the front, so the
 * headlines stay as fresh as "/". Falls through to the static desk/<id>.html
 * when the key is missing (deleting the keys is a complete rollback).
 */
export async function onRequestGet({ env, params, next }) {
  const kv = env.SUBSCRIBERS;
  const id = String(params.id || '').replace(/\.html$/, '');
  if (!kv || !/^[a-z-]{2,20}$/.test(id)) return next();
  const html = await kv.get(`desk:${id}`);
  if (!html) return next();
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-wr-front': 'kv' },
  });
}
