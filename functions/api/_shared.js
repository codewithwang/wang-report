/**
 * Shared helpers for the subscriber Pages Functions (2026-09-09).
 *
 * Cloudflare Pages ignores files prefixed with an underscore when it builds its
 * routing table, so this module is importable but never reachable as a URL.
 *
 * Every response here is written twice: as HTML for a browser that posted a
 * plain form, and as JSON for anything that asked for JSON. The form works with
 * JavaScript switched off, which is the point: a subscribe box that needs a
 * script is a subscribe box that silently fails for some readers.
 */

export const KV_BINDING = 'SUBSCRIBERS';
export const PENDING_TTL_SECONDS = 7 * 24 * 60 * 60;   // a confirm link lives seven days
export const RATE_WINDOW_SECONDS = 60 * 60;
export const RATE_MAX_PER_WINDOW = 5;
export const SITE = 'https://wangreport.com';

/** 32 hex characters from the platform CSPRNG. */
export function makeToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deliberately conservative. This is not RFC 5322; it is the shape of an
 * address a person actually types, with the lengths capped so a hostile body
 * cannot write a large key into KV.
 */
export function normaliseEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!/^[^\s@,;:<>"'\\]+@[^\s@,;:<>"'\\]+\.[a-z]{2,24}$/.test(email)) return null;
  if (email.includes('..')) return null;
  const [local, domain] = email.split('@');
  if (!local || local.length > 64 || !domain || domain.length > 189) return null;
  return email;
}

export function wantsJson(request) {
  const accept = (request.headers.get('accept') || '').toLowerCase();
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (accept.includes('application/json') && !accept.includes('text/html')) return true;
  if (type.includes('application/json')) return true;
  return false;
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * A small page in the house type system. It links the real stylesheet, so it
 * inherits the paper's type rather than inventing any, and carries only the
 * handful of rules the stylesheet has no class for.
 */
export function page({ title, heading, lines = [], status = 200, links = [] }) {
  const body = lines.map(l => `<p>${l}</p>`).join('\n    ');
  const nav = links.map(l => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join(' &middot; ');
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} &middot; The Wang Report</title>
<meta name="robots" content="noindex,follow">
<link rel="stylesheet" href="/style.css">
<style>
  .sub-reply { max-width: 640px; margin: 0 auto; padding: 48px 20px 64px; }
  .sub-reply h1 { font-family: var(--wr-display, Georgia, serif); font-size: 30px; line-height: 1.15; color: var(--wr-ink, #0B1F3A); margin: 0 0 18px; }
  .sub-reply p { font-family: var(--wr-text, Georgia, serif); font-size: 16px; line-height: 1.6; color: var(--wr-ink, #0B1F3A); margin: 0 0 14px; }
  .sub-reply .sub-links { font-family: var(--wr-meta, Arial, sans-serif); font-size: 13px; color: var(--wr-slate, #5A6470); margin-top: 28px; padding-top: 14px; border-top: 1px solid var(--wr-rule, #C8C0B0); }
  .sub-reply a { color: var(--wr-seal, #B0241E); }
</style>
</head>
<body>
  <main class="sub-reply">
    <h1>${esc(heading)}</h1>
    ${body}
    ${nav ? `<div class="sub-links">${nav}</div>` : ''}
  </main>
</body>
</html>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export const HOME_LINKS = [
  { href: '/', label: 'The Wang Report' },
  { href: '/cyber-brief/', label: 'The Executive Brief' },
  { href: '/privacy.html', label: 'Privacy' },
];

/** Read email and note from either a posted form or a JSON body. */
export async function readSubmission(request) {
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (type.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    return { email: body.email, note: body.note };
  }
  const form = await request.formData().catch(() => null);
  if (!form) return { email: null, note: null };
  return { email: form.get('email'), note: form.get('note') };
}

/** Five submissions an hour from one address, counted against a hashed IP. */
export async function rateLimited(kv, ipHash) {
  const key = `rate:${ipHash}`;
  const current = Number(await kv.get(key)) || 0;
  if (current >= RATE_MAX_PER_WINDOW) return true;
  await kv.put(key, String(current + 1), { expirationTtl: RATE_WINDOW_SECONDS });
  return false;
}

export function missingBinding(request, env) {
  if (env && env[KV_BINDING]) return null;
  const message = 'The subscribe list is not connected yet. Write to editor@wangreport.com and you will be added by hand.';
  return wantsJson(request)
    ? json({ ok: false, error: 'store unavailable' }, 503)
    : page({ title: 'Not ready', heading: 'The list is not open yet', lines: [message], status: 503, links: HOME_LINKS });
}
