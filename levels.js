// levels.js — server-side Fibonacci confluence level computation
//
// Every REFRESH_LEVELS_MS (30 min), refreshAllPairs():
//   1. Fetches OANDA M5 + M30 bars per pair
//   2. Extracts the two most recent complete Asia sessions (M5, London hours 0-5)
//      and the two most recent complete Monday sessions (M30)
//   3. Projects Fibonacci levels from body ranges, detects cross-session confluences
//   4. Assigns a simplified star rating (isTight, density, crossSessionMatch)
//   5. Computes ATR-based SL/TP and writes ai_entries_{PAIR} to KV
//
// This fully replaces browser-side level computation — no browser needs to be open.
//
// Env vars required: OANDA_KEY  (+ OANDA_ENV, OANDA_ACCOUNT_ID for live pricing)

import * as kv from './kv.js';

// ── Constants (mirrors js/config.js + js/utils.js, no browser deps) ──────────

const FIB_LEVELS = [
  -10.5,-10,-9.5,-9,-8.5,-8,-7.5,-7,-6.5,-6,-5.5,-5,-4.5,-4,-3.5,-3,-2.5,-2,-1.5,-1,
  -0.75,-0.5,-0.25, 0, 0.25,0.5,0.75,
   1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5
];

function getPipSize(sym) {
  if (sym.includes('JPY'))                          return 0.01;
  if (sym.includes('XAU') || sym.includes('GOLD')) return 0.1;
  if (sym === 'NAS100_USD')                         return 1.0;
  return 0.0001;
}

function getDigits(sym) {
  if (sym.includes('JPY'))                          return 3;
  if (sym.includes('XAU') || sym.includes('GOLD')) return 2;
  if (sym === 'NAS100_USD')                         return 1;
  return 5;
}

// Max pip distance for two Fibs to count as a confluence (CAP_DEFAULTS.confluencePips)
function getConfluenceThreshold(sym) {
  if (sym.includes('XAU') || sym.includes('GOLD')) return 200;
  if (sym === 'NAS100_USD')                         return 100;
  return 2;
}

// ── Bar helpers (matches barLondonHour / barLondonDay in js/utils.js) ─────────

function barLondonHour(bar) {
  // datetime is London-local "YYYY-MM-DD HH:MM:SS" — extract HH directly
  const dt = bar.datetime;
  return dt.length >= 13 ? parseInt(dt.substring(11, 13), 10) : 0;
}

function barLondonDay(bar) {
  // Parse as noon UTC for stable day-of-week across DST transitions
  const datePart = bar.datetime.length >= 10 ? bar.datetime.substring(0, 10) : bar.datetime;
  return new Date(datePart + 'T12:00:00Z').getUTCDay(); // 0=Sun … 6=Sat
}

// ── OANDA fetch + bar conversion ──────────────────────────────────────────────

function convertBars(candles) {
  return candles
    .filter(c => c.complete !== false)
    .map(c => ({
      // Convert UTC ISO → London local "YYYY-MM-DD HH:MM:SS" so barLondonHour/Day work
      datetime: new Date(c.time)
        .toLocaleString('sv-SE', { timeZone: 'Europe/London' })
        .substring(0, 19),
      open:  c.mid.o,
      high:  c.mid.h,
      low:   c.mid.l,
      close: c.mid.c,
    }));
}

function oandaBase() {
  return (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
}

async function fetchOandaBars(sym, granularity, count) {
  const instrument = sym.replace('/', '_');
  const url = `${oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles?count=${count}&granularity=${granularity}&price=M`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` } });
  if (!r.ok) throw new Error(`OANDA ${sym} ${granularity}: ${r.status}`);
  const d = await r.json();
  return convertBars(d.candles || []);
}

// ── Fibonacci computation (ported from js/ranges.js) ─────────────────────────

function computeBodyRange(bars) {
  if (!bars?.length) return null;
  let bodyHigh = -Infinity, bodyLow = Infinity;
  for (const bar of bars) {
    const o = parseFloat(bar.open), c = parseFloat(bar.close);
    bodyHigh = Math.max(bodyHigh, Math.max(o, c));
    bodyLow  = Math.min(bodyLow,  Math.min(o, c));
  }
  return { high: bodyHigh, low: bodyLow, range: bodyHigh - bodyLow, barCount: bars.length };
}

function projectFibLevels(range) {
  if (!range) return [];
  return FIB_LEVELS.map(fib => ({ fib, price: range.low + range.range * fib }));
}

function detectConfluences(todayLevels, yesterdayLevels, sym, source) {
  const pipSize        = getPipSize(sym);
  const normalDistance = getConfluenceThreshold(sym) * pipSize;
  const tightDistance  = normalDistance * 0.10;
  const mergeDistance  = normalDistance * 0.30; // CAP_DEFAULTS.mergeFactor = 0.30

  const rawPairs = [];
  for (const today of todayLevels) {
    for (const yesterday of yesterdayLevels) {
      const diff = Math.abs(today.price - yesterday.price);
      if (diff <= normalDistance) {
        rawPairs.push({
          price:        (today.price + yesterday.price) / 2,
          todayFib:     today.fib,
          yesterdayFib: yesterday.fib,
          pipDiff:      diff / pipSize,
          isTight:      diff <= tightDistance || today.fib === yesterday.fib,
          source,
        });
      }
    }
  }

  if (!rawPairs.length) return [];

  rawPairs.sort((a, b) => a.price - b.price);

  const clusters = [];
  let bucket = [rawPairs[0]];
  for (let i = 1; i < rawPairs.length; i++) {
    const centre = bucket.reduce((s, p) => s + p.price, 0) / bucket.length;
    if (rawPairs[i].price - centre <= mergeDistance) {
      bucket.push(rawPairs[i]);
    } else {
      clusters.push(bucket);
      bucket = [rawPairs[i]];
    }
  }
  clusters.push(bucket);

  return clusters.map(cluster => ({
    price:         cluster.reduce((s, p) => s + p.price, 0) / cluster.length,
    density:       cluster.length,
    pipDiff:       Math.min(...cluster.map(p => p.pipDiff)),
    isTight:       cluster.some(p => p.isTight),
    source,
    todayFibs:     [...new Set(cluster.map(p => p.todayFib))],
    yesterdayFibs: [...new Set(cluster.map(p => p.yesterdayFib))],
  })).sort((a, b) => a.price - b.price);
}

// Mark Asia and Monday confluences that land within threshold of each other
function detectCrossSessionClusters(asiaConfs, mondayConfs, sym) {
  const threshold = getConfluenceThreshold(sym) * getPipSize(sym);
  for (const ac of asiaConfs) {
    for (const mc of mondayConfs) {
      if (Math.abs(ac.price - mc.price) <= threshold) {
        ac.crossSessionMatch = true;
        mc.crossSessionMatch = true;
      }
    }
  }
}

// ── Session extraction ────────────────────────────────────────────────────────

function extractAsiaSessions(bars5m) {
  const sessionsByDate = {};
  for (const bar of bars5m) {
    const hour = barLondonHour(bar);
    if (hour < 0 || hour >= 6) continue;
    const dateKey = bar.datetime.substring(0, 10);
    const dow     = new Date(dateKey + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;
    (sessionsByDate[dateKey] ??= []).push(bar);
  }
  return Object.entries(sessionsByDate)
    .filter(([, bars]) => bars.length >= 36)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, bars]) => ({ date, bars }));
}

function extractMondaySessions(bars30m) {
  const weekData = {};
  for (const bar of bars30m) {
    if (barLondonDay(bar) !== 1) continue;
    const dateKey = bar.datetime.substring(0, 10);
    (weekData[dateKey] ??= []).push(bar);
  }

  const sorted = Object.entries(weekData)
    .filter(([, bars]) => bars.length >= 20)
    .sort(([a], [b]) => b.localeCompare(a));

  // If today is Monday (London), the current Monday session is still in progress — skip it
  const londonWeekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short',
  }).formatToParts(new Date()).find(p => p.type === 'weekday')?.value;

  const startIdx = (londonWeekday === 'Mon' && sorted.length >= 2) ? 1 : 0;
  return sorted.slice(startIdx).map(([date, bars]) => ({ date, bars }));
}

// ── EMA-ATR (alpha=0.15, oldest-first, TR = max(H-L, |H-PrevC|, |L-PrevC|)) ─

function computeEmaAtr(bars30m) {
  if (!bars30m || bars30m.length < 2) return null;
  const alpha = 0.15;
  const chron = [...bars30m].reverse(); // oldest-first
  let ema = Math.abs(parseFloat(chron[1].high) - parseFloat(chron[1].low));
  for (let i = 2; i < Math.min(chron.length, 120); i++) {
    const h  = parseFloat(chron[i].high);
    const l  = parseFloat(chron[i].low);
    const pc = parseFloat(chron[i - 1].close);
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (isFinite(tr) && tr > 0) ema = alpha * tr + (1 - alpha) * ema;
  }
  return isFinite(ema) && ema > 0 ? ema : null;
}

// ── Current price ─────────────────────────────────────────────────────────────

async function fetchCurrentPrice(sym) {
  const instrument = sym.replace('/', '_');
  const auth = { Authorization: `Bearer ${process.env.OANDA_KEY}` };

  if (process.env.OANDA_ACCOUNT_ID) {
    try {
      const r = await fetch(
        `${oandaBase()}/v3/accounts/${process.env.OANDA_ACCOUNT_ID}/pricing?instruments=${encodeURIComponent(instrument)}`,
        { headers: auth }
      );
      if (r.ok) {
        const d = await r.json();
        const p = d.prices?.[0];
        if (p?.bids?.[0] && p?.asks?.[0]) {
          return (parseFloat(p.bids[0].price) + parseFloat(p.asks[0].price)) / 2;
        }
      }
    } catch {}
  }

  try {
    const r = await fetch(
      `${oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles?count=2&granularity=M1&price=M`,
      { headers: auth }
    );
    if (!r.ok) return null;
    const d    = await r.json();
    const last = d.candles?.slice(-1)[0];
    return last?.mid?.c ? parseFloat(last.mid.c) : null;
  } catch {
    return null;
  }
}

// ── Entry builder ─────────────────────────────────────────────────────────────

function buildEntries(allConfs, currentPrice, atr, sym) {
  const pipSize = getPipSize(sym);
  const digits  = getDigits(sym);
  const tick    = pipSize * 0.5;
  const slMult  = 1.25;
  const tpMult  = 2.2;

  return allConfs.map(c => {
    let direction = null;
    if (currentPrice != null) {
      if      (c.price > currentPrice + tick) direction = 'short';
      else if (c.price < currentPrice - tick) direction = 'long';
    }

    // Simplified server-side star rating (no OI/pivots/daily-opens/structural-fibs)
    let stars = 1;
    if (c.isTight)             stars++;
    if ((c.density || 1) >= 2) stars++;
    if ((c.density || 1) >= 3) stars++;
    if (c.crossSessionMatch)   stars++;

    let sl = null, tp = null, tpNote = null, rrRatio = null;
    if (atr && direction) {
      const slDist = atr * slMult;
      const tpDist = slDist * tpMult;
      sl      = direction === 'long'  ? c.price - slDist : c.price + slDist;
      tp      = direction === 'long'  ? c.price + tpDist : c.price - tpDist;
      tpNote  = '2.2R';
      rrRatio = tpMult.toFixed(1);
    }

    const tags = [];
    if (c.isTight)              tags.push('Tight Fib');
    if (c.source === 'asia')    tags.push('Asia Fib');
    if (c.source === 'monday')  tags.push('Monday Fib');
    if (c.crossSessionMatch)    tags.push('Cross-Session');
    if ((c.density || 1) >= 3)  tags.push('Dense Zone');

    return {
      price:         parseFloat(c.price.toFixed(digits)),
      direction,
      totalStars:    stars,
      sl:            sl != null ? parseFloat(sl.toFixed(digits)) : null,
      tp:            tp != null ? parseFloat(tp.toFixed(digits)) : null,
      tpNote,
      rrRatio,
      tags,
      signalAligned: false, // no macro bias on server; browser re-enhances on load
    };
  }).filter(e => e.direction != null);
}

// ── Per-pair refresh ──────────────────────────────────────────────────────────

export async function refreshPair(sym) {
  const t0 = Date.now();
  try {
    // 1500 M5 bars ≈ 5+ trading days — enough for 2 complete Asia sessions
    // 500  M30 bars ≈ 10 trading days — enough for 2 complete Monday sessions
    const [bars5m, bars30m] = await Promise.all([
      fetchOandaBars(sym, 'M5',  1500),
      fetchOandaBars(sym, 'M30', 500),
    ]);

    const asiaSessions   = extractAsiaSessions(bars5m);
    const mondaySessions = extractMondaySessions(bars30m);

    let asiaConfs = [], mondayConfs = [];

    if (asiaSessions.length >= 2) {
      const todayRange      = computeBodyRange(asiaSessions[0].bars);
      const yesterdayRange  = computeBodyRange(asiaSessions[1].bars);
      asiaConfs = detectConfluences(
        projectFibLevels(todayRange),
        projectFibLevels(yesterdayRange),
        sym, 'asia',
      );
    }

    if (mondaySessions.length >= 2) {
      const curRange  = computeBodyRange(mondaySessions[0].bars);
      const prevRange = computeBodyRange(mondaySessions[1].bars);
      mondayConfs = detectConfluences(
        projectFibLevels(curRange),
        projectFibLevels(prevRange),
        sym, 'monday',
      );
    }

    if (!asiaConfs.length && !mondayConfs.length) {
      console.log(`[LEVELS] ${sym}: no confluences (asia sessions=${asiaSessions.length}, monday sessions=${mondaySessions.length})`);
      return null;
    }

    detectCrossSessionClusters(asiaConfs, mondayConfs, sym);

    const atr          = computeEmaAtr(bars30m);
    const currentPrice = await fetchCurrentPrice(sym);
    const entries      = buildEntries([...asiaConfs, ...mondayConfs], currentPrice, atr, sym);

    if (!entries.length) {
      console.log(`[LEVELS] ${sym}: confluences found but no entries with direction (price=${currentPrice})`);
      return null;
    }

    await kv.put(`ai_entries_${sym.replace('/', '')}`, JSON.stringify({ data: entries, timestamp: Date.now() }));

    const ms = Date.now() - t0;
    console.log(`[LEVELS] ${sym}: ${entries.length} entries saved (${ms} ms, price=${currentPrice?.toFixed(getDigits(sym)) ?? '?'})`);
    return entries.length;
  } catch (e) {
    console.error(`[LEVELS] ${sym} error:`, e.message);
    return null;
  }
}

// ── Refresh all pairs (called every 30 min from server.js) ───────────────────

export async function refreshAllPairs(pairs) {
  console.log(`[LEVELS] Starting refresh — ${pairs.length} pairs`);
  const results = {};
  for (const sym of pairs) {
    results[sym] = await refreshPair(sym);
    // Brief pause between pairs to avoid OANDA rate-limit (120 req/s)
    await new Promise(r => setTimeout(r, 500));
  }
  const ok = Object.values(results).filter(v => v != null).length;
  console.log(`[LEVELS] Done — ${ok}/${pairs.length} pairs refreshed`);
  return results;
}
