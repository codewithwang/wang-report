/**
 * GET /api/confirm?t=<token>  (Cloudflare Pages Function, 2026-09-09)
 *
 * The second half of the double opt-in. The token is single use: the pending
 * record is deleted whether or not the subscriber record already existed, so a
 * link cannot be replayed and a leaked link cannot be used twice.
 *
 * The confirmed record keeps its own unsubscribe token, so every later email
 * can carry a one-click unsubscribe that needs no login and no lookup table.
 */

import {
  KV_BINDING, makeToken, normaliseEmail, wantsJson, json, page, HOME_LINKS, missingBinding,
} from './_shared.js';

export async function onRequestGet({ request, env }) {
  const notReady = missingBinding(request, env);
  if (notReady) return notReady;
  const kv = env[KV_BINDING];
  const asJson = wantsJson(request);

  const token = new URL(request.url).searchParams.get('t') || '';
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return asJson
      ? json({ ok: false, error: 'bad token' }, 400)
      : page({
          title: 'Link not recognised',
          heading: 'That link is not one of ours',
          lines: ['Confirmation links look like a long string of letters and numbers. Try copying the whole link out of the email, or start again on the <a href="/subscribe.html">subscribe page</a>.'],
          status: 400,
          links: HOME_LINKS,
        });
  }

  const raw = await kv.get(`pending:${token}`);
  if (!raw) {
    return asJson
      ? json({ ok: false, error: 'expired or already used' }, 410)
      : page({
          title: 'Link expired',
          heading: 'That link has expired or was already used',
          lines: [
            'Confirmation links last seven days and work once. If you have already clicked it, you are on the list and there is nothing more to do.',
            'Otherwise, <a href="/subscribe.html">start again</a> and a fresh link will follow.',
          ],
          status: 410,
          links: HOME_LINKS,
        });
  }

  let record;
  try { record = JSON.parse(raw); } catch { record = null; }
  const email = record && normaliseEmail(record.email);
  await kv.delete(`pending:${token}`);            // single use, whatever happens next

  if (!email) {
    return asJson
      ? json({ ok: false, error: 'record unreadable' }, 500)
      : page({
          title: 'Something went wrong',
          heading: 'That request could not be read',
          lines: ['Please <a href="/subscribe.html">try again</a>, or write to <a href="mailto:editor@wangreport.com">editor@wangreport.com</a>.'],
          status: 500,
          links: HOME_LINKS,
        });
  }

  const existing = await kv.get(`sub:${email}`);
  if (!existing) {
    await kv.put(`sub:${email}`, JSON.stringify({
      email,
      unsubscribe_token: makeToken(),
      note: record.note || null,
      source: record.source || null,
      created_at: record.created_at || null,
      confirmed_at: new Date().toISOString(),
    }));
  }

  return asJson
    ? json({ ok: true, status: 'confirmed' })
    : page({
        title: 'Confirmed',
        heading: 'You are on the list',
        lines: [
          'The Executive Brief arrives on the first Monday of the month: what moved on each standing theme, what it means for a regulated stack in Asia, and the question worth asking next.',
          'One email a month, nothing else. Every one carries an unsubscribe link that works in a single click.',
          'The <a href="/cyber-brief/">back issues</a> are open to read now.',
        ],
        links: HOME_LINKS,
      });
}
