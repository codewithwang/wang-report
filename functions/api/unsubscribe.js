/**
 * GET /api/unsubscribe?e=<email>&t=<token>  (Cloudflare Pages Function, 2026-09-09)
 *
 * One click, no login, no confirmation step. The token is the one minted when
 * the address was confirmed, so a stranger cannot unsubscribe someone else by
 * guessing an address, and the subscriber never has to prove anything.
 *
 * Removal is a delete, not a flag. Nothing is kept behind to suppress later
 * sends, because nothing later is sent.
 */

import {
  KV_BINDING, normaliseEmail, wantsJson, json, page, HOME_LINKS, missingBinding,
} from './_shared.js';

export async function onRequestGet({ request, env }) {
  const notReady = missingBinding(request, env);
  if (notReady) return notReady;
  const kv = env[KV_BINDING];
  const asJson = wantsJson(request);

  const params = new URL(request.url).searchParams;
  const email = normaliseEmail(params.get('e'));
  const token = params.get('t') || '';

  const done = page({
    title: 'Unsubscribed',
    heading: 'Removed',
    lines: [
      'That address is off the list and no further email will be sent to it.',
      'The <a href="/cyber-brief/">Executive Brief</a> and every desk stay open to read on the site, with nothing to sign up for.',
    ],
    links: HOME_LINKS,
  });

  if (!email || !/^[0-9a-f]{32}$/.test(token)) {
    // Say nothing about whether the address exists.
    return asJson ? json({ ok: true, status: 'removed' }) : done;
  }

  const raw = await kv.get(`sub:${email}`);
  if (raw) {
    let record;
    try { record = JSON.parse(raw); } catch { record = null; }
    if (record && record.unsubscribe_token === token) await kv.delete(`sub:${email}`);
  }

  return asJson ? json({ ok: true, status: 'removed' }) : done;
}

/** Some mail clients turn a one-click unsubscribe into a POST. Accept both. */
export const onRequestPost = onRequestGet;
