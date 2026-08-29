// OANDA provenance check — follow-up to the education/data-foundations-notes.md
// (DF-01) review flagged in LEGO_MODULES.md (2026-08-29). The Fib Atlas
// backtests price every touch off OANDA's own mid-price stream, a single
// retail broker's quotes, not a consolidated/interbank composite -- FX spot
// has no official exchange tape the way equities do. This system trades tight
// intraday stop/target distances (median hold ~13min), so a broker-specific
// quote quirk near a fib level could plausibly matter more here than for a
// slower system. This script checks whether it actually does, rather than
// leaving it as a theoretical caveat.
//
// Method: take a sample of ALREADY-RECORDED touches for a pair (the real
// vote-margin backtest's own touch list, pulled from R2 -- the OANDA side of
// the comparison, no re-fetch needed), then pull the SAME UTC minute window
// from a second, independent vendor (Twelve Data) and check: (a) did the
// second feed's high/low actually cross the same fib level in that window
// (touch/no-touch agreement), and (b) how far apart are the two feeds' prices
// at the recorded touch minute. A high disagreement rate or a wide price gap
// right at the entry threshold would mean provenance is a live concern for
// this system, not just a documentation gap; close agreement would mean it
// isn't (for this pair/window, at least).
//
// Needs TWELVE_KEY (Twelve Data free tier: 1min FX candles, 8 req/min rate
// limit -- this script paces requests accordingly) and real network access to
// both R2 and api.twelvedata.com. NEITHER is available from this sandbox
// (OANDA-adjacent network egress is blocked here per CLAUDE.md's documented
// policy, and TWELVE_KEY isn't set in this environment) -- run this on
// Railway, or anywhere both R2 and outbound HTTPS to twelvedata.com work.
// `node --check` passed here; the network calls themselves are UNVALIDATED
// until run somewhere with real access -- do not report a result from this
// file without actually having run it.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getJSON } from '../js/r2Store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');

const PAIR = process.env.PROV_PAIR || 'eurusd';
const LADDER = process.env.PROV_LADDER || 'asia-fib-atlas'; // or 'monday-fib-atlas'
const SAMPLE_N = Number(process.env.PROV_SAMPLE_N || 60);   // touches to check; free-tier rate limit paces this
const TWELVE_SYMBOL = { eurusd: 'EUR/USD', gbpusd: 'GBP/USD', usdjpy: 'USD/JPY', audusd: 'AUD/USD', gold: 'XAU/USD' };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Twelve Data time_series, 1min interval, a tight window around one touch
// minute (start 2min before, end 2min after -- enough to see the touch
// bracket without pulling more than needed).
async function fetchTwelveWindow(symbol, isoMinute, apiKey) {
  const center = new Date(isoMinute);
  const start = new Date(center.getTime() - 2 * 60_000);
  const end = new Date(center.getTime() + 2 * 60_000);
  const fmt = d => d.toISOString().slice(0, 16).replace('T', ' ');
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1min&start_date=${encodeURIComponent(fmt(start))}&end_date=${encodeURIComponent(fmt(end))}&apikey=${apiKey}&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const j = await res.json();
  if (j.status === 'error') throw new Error(`Twelve Data error: ${j.message}`);
  return Array.isArray(j.values) ? j.values : [];
}

async function main() {
  const apiKey = process.env.TWELVE_KEY;
  if (!apiKey) { console.error('TWELVE_KEY not set — cannot run this check here.'); process.exit(1); }
  const symbol = TWELVE_SYMBOL[PAIR];
  if (!symbol) { console.error(`No Twelve Data symbol mapped for pair "${PAIR}" — add one to TWELVE_SYMBOL.`); process.exit(1); }

  const stored = await getJSON(`${LADDER}/${PAIR}-votetrades.json`);
  if (!stored) { console.error(`No stored touches for ${LADDER}/${PAIR} in R2.`); process.exit(1); }

  // Sample spread across the OOS period (not clustered on one week), so the
  // comparison isn't accidentally reading one broker outage as "provenance risk".
  const oosTouches = stored.trades.filter(t => t.time && t.price > 0);
  const step = Math.max(1, Math.floor(oosTouches.length / SAMPLE_N));
  const sample = oosTouches.filter((_, i) => i % step === 0).slice(0, SAMPLE_N);

  const rows = [];
  for (const t of sample) {
    const isoMinute = new Date(t.time).toISOString();
    try {
      const candles = await fetchTwelveWindow(symbol, isoMinute, apiKey);
      // Twelve Data returns most-recent-first; find the candle matching this minute.
      const match = candles.find(c => new Date(c.datetime + 'Z').getTime() === Math.floor(t.time / 60000) * 60000);
      const oandaPrice = t.price;
      const twelveClose = match ? Number(match.close) : null;
      const twelveHigh = match ? Number(match.high) : null;
      const twelveLow = match ? Number(match.low) : null;
      // "Touch confirmed" by the second feed: the rung's price level fell
      // within [low, high] of the same-minute candle -- same criterion the
      // OANDA-based walk itself uses to register a touch, just against a
      // different vendor's bar.
      const rungPrice = t.price; // the recorded touch price IS the rung level at touch time
      const secondFeedConfirms = match ? (twelveLow <= rungPrice && rungPrice <= twelveHigh) : null;
      rows.push({
        date: t.date, time: t.time, instrument: t.instrument, side: t.side, level: t.level,
        oandaPrice, twelveClose, twelveHigh, twelveLow,
        priceDiffPips: twelveClose != null ? +((oandaPrice - twelveClose) / t.pip).toFixed(2) : null,
        secondFeedConfirms,
      });
    } catch (e) {
      rows.push({ date: t.date, time: t.time, error: e.message });
    }
    await sleep(7700); // 8 req/min free-tier ceiling -> ~7.5s between calls, small margin
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `oanda_provenance_${PAIR}_${LADDER}.json`);
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));

  const withDiff = rows.filter(r => r.priceDiffPips != null);
  const confirmed = rows.filter(r => r.secondFeedConfirms === true).length;
  const disconfirmed = rows.filter(r => r.secondFeedConfirms === false).length;
  const errored = rows.filter(r => r.error).length;
  const avgAbsDiff = withDiff.length ? +(withDiff.reduce((s, r) => s + Math.abs(r.priceDiffPips), 0) / withDiff.length).toFixed(3) : null;

  console.log(JSON.stringify({
    pair: PAIR, ladder: LADDER, sampled: rows.length,
    secondFeedConfirmsTouch: confirmed, secondFeedDisagrees: disconfirmed, errors: errored,
    avgAbsPriceDiffPips: avgAbsDiff,
    disagreementRate: rows.length ? +((disconfirmed / (rows.length - errored)) || 0).toFixed(3) : null,
    outFile: outPath,
  }, null, 2));
}

main();
