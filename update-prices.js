#!/usr/bin/env node
/**
 * Stocks price tape refresh — runs in GitHub Actions (Phase 4).
 *
 * Reads stocks-tickers.json (shipped by the daily site build), fetches a live
 * Yahoo Finance quote per symbol, and writes stocks-prices.json. The Stocks page
 * client script polls that file to keep the Portfolio Tape fresh between the
 * twice-daily full rebuilds. Dependency-free (Node 20 global fetch).
 */
const fs = require('fs');

async function quote(sym) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const j = await r.json();
    const m = j.chart.result[0];
    const closes = (m.indicators.quote[0].close || []).filter(x => x != null);
    const price = (m.meta && m.meta.regularMarketPrice != null) ? m.meta.regularMarketPrice : closes[closes.length - 1];
    const prev = (m.meta && m.meta.chartPreviousClose != null) ? m.meta.chartPreviousClose : (closes[closes.length - 2] != null ? closes[closes.length - 2] : price);
    if (price == null) return null;
    const pct = prev ? ((price - prev) / prev) * 100 : 0;
    return { price, pct, dir: pct >= 0 ? 'up' : 'down' };
  } catch { return null; }
}

(async () => {
  let tickers;
  try { tickers = JSON.parse(fs.readFileSync('stocks-tickers.json', 'utf8')); }
  catch { console.log('no stocks-tickers.json, nothing to do'); process.exit(0); }

  const prices = {};
  for (const t of tickers) {
    const q = await quote(t.yahoo || t.ticker);
    if (q) prices[t.ticker] = q;
    await new Promise(r => setTimeout(r, 150));
  }
  fs.writeFileSync('stocks-prices.json', JSON.stringify({ prices, updated: new Date().toISOString() }));
  console.log(`wrote ${Object.keys(prices).length}/${tickers.length} prices`);
})();
