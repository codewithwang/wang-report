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

  // A link that does not check out is NOT reported as a removal (fixed
  // 2026-09-10 after a local test: the endpoint used to answer "removed" to
  // every request, so a reader whose link had been wrapped or truncated by
  // their mail client would be told they were off the list and then keep
  // receiving the Brief). The wording is identical whether the address is
  // absent or the token is wrong, so nothing here can be used to test whether
  // an address is on the list.
  const notValid = () => asJson
    ? json({ ok: false, status: 'not-removed', error: 'that unsubscribe link is not valid' }, 400)
    : page({
        title: 'Link not valid',
        heading: 'That unsubscribe link is not valid',
        lines: [
          'Nothing was changed. Mail clients sometimes wrap or shorten a long link, so the surest fix is to open the most recent Executive Brief and click the unsubscribe line at the bottom of it.',
          'Or write one line to <a href="mailto:editor@wangreport.com">editor@wangreport.com</a> and a person will take the address off by hand, same day.',
        ],
        status: 400,
        links: HOME_LINKS,
      });

  if (!email || !/^[0-9a-f]{32}$/.test(token)) return notValid();

  const raw = await kv.get(`sub:${email}`);
  if (!raw) return notValid();
  let record;
  try { record = JSON.parse(raw); } catch { record = null; }
  if (!record || record.unsubscribe_token !== token) return notValid();

  await kv.delete(`sub:${email}`);
  return asJson ? json({ ok: true, status: 'removed' }) : done;
}

/** Some mail clients turn a one-click unsubscribe into a POST. Accept both. */
export const onRequestPost = onRequestGet;
