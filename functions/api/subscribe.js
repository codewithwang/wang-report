/**
 * POST /api/subscribe  (Cloudflare Pages Function, 2026-09-09)
 *
 * Takes an email address from the subscribe form and writes a PENDING record.
 * Nothing reaches the list here: the address is on the list only after the
 * confirm link in the opt-in email is clicked, which is what double opt-in
 * means and what makes the list defensible under the PDPO.
 *
 * The confirmation email is NOT sent from this function. pages/subscribe-send.js
 * drains the pending records from a cron on Harry's machine through the gog
 * CLI, so no third-party mail provider is signed up for and no credential lives
 * at the edge. A pending record therefore waits minutes, not seconds, and the
 * reply page says so plainly rather than promising an instant email.
 */

import {
  KV_BINDING, PENDING_TTL_SECONDS, makeToken, sha256Hex, normaliseEmail,
  wantsJson, json, page, HOME_LINKS, readSubmission, rateLimited, missingBinding,
} from './_shared.js';

export async function onRequestPost({ request, env }) {
  const notReady = missingBinding(request, env);
  if (notReady) return notReady;
  const kv = env[KV_BINDING];
  const asJson = wantsJson(request);

  const { email: rawEmail, note } = await readSubmission(request);
  const email = normaliseEmail(rawEmail);
  if (!email) {
    return asJson
      ? json({ ok: false, error: 'that does not look like an email address' }, 400)
      : page({
          title: 'Check the address',
          heading: 'That does not look like an email address',
          lines: ['Go back and try again, or write to <a href="mailto:editor@wangreport.com">editor@wangreport.com</a> and you will be added by hand.'],
          status: 400,
          links: [{ href: '/subscribe.html', label: 'Back to the form' }, ...HOME_LINKS],
        });
  }

  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const ipHash = await sha256Hex(`wr:${ip}`);
  if (await rateLimited(kv, ipHash)) {
    return asJson
      ? json({ ok: false, error: 'too many attempts, try again later' }, 429)
      : page({
          title: 'Too many attempts',
          heading: 'Too many attempts from this connection',
          lines: ['Try again in an hour, or write to <a href="mailto:editor@wangreport.com">editor@wangreport.com</a>.'],
          status: 429,
          links: HOME_LINKS,
        });
  }

  // Already confirmed: say so, and do not create a second pending record.
  const existing = await kv.get(`sub:${email}`);
  if (existing) {
    return asJson
      ? json({ ok: true, status: 'already-subscribed' })
      : page({
          title: 'Already on the list',
          heading: 'You are already on the list',
          lines: [
            'That address is confirmed, so nothing needed doing. The next Executive Brief arrives on the first Monday of the month.',
            'Every brief carries an unsubscribe link, and you can write to <a href="mailto:editor@wangreport.com">editor@wangreport.com</a> at any time.',
          ],
          links: HOME_LINKS,
        });
  }

  const token = makeToken();
  const record = {
    email,
    token,
    note: String(note || '').slice(0, 280) || null,
    source: request.headers.get('referer') || null,
    ua_hash: await sha256Hex(request.headers.get('user-agent') || ''),
    ip_hash: ipHash,
    created_at: new Date().toISOString(),
    confirm_sent_at: null,
  };
  await kv.put(`pending:${token}`, JSON.stringify(record), { expirationTtl: PENDING_TTL_SECONDS });

  return asJson
    ? json({ ok: true, status: 'pending' })
    : page({
        title: 'Check your inbox',
        heading: 'One more step',
        lines: [
          'A confirmation email is on its way. Click the link inside it and you are on the list. Until you do, nothing is stored against your name beyond this request.',
          'The email is sent from Hong Kong within the hour, not instantly. If it has not arrived by tomorrow, check the spam folder, then write to <a href="mailto:editor@wangreport.com">editor@wangreport.com</a>.',
          'What arrives after that: the Executive Brief, once a month, on the first Monday. Nothing else.',
        ],
        links: HOME_LINKS,
      });
}

/** A GET on this path is someone poking at it; send them to the form. */
export async function onRequestGet() {
  return Response.redirect('https://wangreport.com/subscribe.html', 302);
}
