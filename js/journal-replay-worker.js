// journal-replay-worker.js — M1 bar replay for journal day analysis
// Messages in:
//   { type:'fetch',  payload:{ symbol, date } }          — load M1 from Oanda API
//   { type:'parse',  payload:{ symbol, text } }          — load M1 from CSV (fallback)
//   { type:'replay', payload:{ symbol, date, levels, rrRatio, pipSize } }

const _m1 = {}; // _m1[symbol][date] = bars[] oldest→newest (London datetime)

self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === 'fetch')  handleFetch(payload);
  if (type === 'parse')  handleParse(payload);
  if (type === 'replay') handleReplay(payload);
};

function post(type, payload) { self.postMessage({ type, payload }); }

// ── Fetch M1 from Oanda via worker.js API proxy ───────────────────────────────

async function handleFetch({ symbol, date, pair }) {
  post('progress', { msg: `Fetching ${symbol} M1 for ${date}…` });
  try {
    const url = `/api/oanda_ohlc1m?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(date)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      post('error', `Oanda M1 fetch failed (${res.status}): ${txt.slice(0, 200)}`);
      return;
    }
    const data = await res.json();
    if (!data.values || !data.values.length) {
      post('error', `No M1 bars returned for ${symbol} on ${date} — market may have been closed.`);
      return;
    }
    const bars = data.values.map(v => parseDatetime(v));
    if (!_m1[symbol]) _m1[symbol] = {};
    _m1[symbol][date] = bars;
    post('fetched', { symbol, date, pair, count: bars.length });
  } catch (e) {
    post('error', `Fetch error: ${e.message}`);
  }
}

function parseDatetime(v) {
  // datetime: "2025-05-09 08:00:00" (London local, sv-SE format)
  const dt   = v.datetime || '';
  const date = dt.slice(0, 10);
  const hour = parseInt(dt.slice(11, 13), 10);
  const min  = parseInt(dt.slice(14, 16), 10);
  const ts   = Math.floor(new Date(dt.replace(' ', 'T') + 'Z').getTime() / 1000);
  return { ts, o: +v.open, h: +v.high, l: +v.low, c: +v.close, date, hour, min };
}

// ── Parse M1 from CSV (offline fallback) ─────────────────────────────────────

function handleParse({ symbol, text }) {
  post('progress', { msg: `Parsing ${symbol} M1 CSV…` });
  const lines = text.split('\n');
  const byDate = {};
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const p = raw.split(',');
    if (p.length < 5) continue;
    const ts = parseInt(p[0], 10);
    if (isNaN(ts)) continue;
    const o = +p[1], h = +p[2], l = +p[3], c = +p[4];
    if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) continue;
    const d = londonDate(ts);
    if (!byDate[d.date]) byDate[d.date] = [];
    byDate[d.date].push({ ts, o, h, l, c, date: d.date, hour: d.hour, min: d.min });
  }
  if (!_m1[symbol]) _m1[symbol] = {};
  let total = 0;
  for (const [date, bars] of Object.entries(byDate)) {
    bars.sort((a, b) => a.ts - b.ts);
    _m1[symbol][date] = bars;
    total += bars.length;
  }
  post('parsed', { symbol, count: total, dates: Object.keys(byDate).length });
}

function londonDate(ts) {
  const d = new Date(ts * 1000);
  const s = d.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  // "dd/mm/yyyy, hh:mm"
  const [datePart, timePart] = s.split(', ');
  const [dd, mm, yyyy] = datePart.split('/');
  const [hh, mn] = timePart.split(':');
  return { date: `${yyyy}-${mm}-${dd}`, hour: +hh, min: +mn };
}

// ── Replay ────────────────────────────────────────────────────────────────────

function handleReplay({ symbol, date, pair, levels, rrRatio, pipSize, noEod = false }) {
  const dateBars = (_m1[symbol] || {})[date];
  if (!dateBars || !dateBars.length) {
    post('error', `No M1 data loaded for ${symbol} on ${date}.`);
    return;
  }

  const pip = pipSize;
  const results = [];
  let runningR = 0;
  const equity = [{ label: 'Start', r: 0, cumR: 0 }];

  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
    const entryPrice = level.price;
    const dir        = level.direction;   // 'long' | 'short'
    const sl         = level.slOverride  ?? level.sl;
    const tp         = level.tpOverride  ?? level.tp;
    const stars      = level.stars || 1;

    if (!entryPrice || !dir || !sl || !tp) {
      results.push({ level, touched: false, result: 'no-data', r: null, touchTime: null, exitTime: null, maxFav: null, maxAdv: null });
      continue;
    }

    const slDist = Math.abs(entryPrice - sl);
    const tpDist = Math.abs(entryPrice - tp);
    if (slDist <= 0) {
      results.push({ level, touched: false, result: 'no-sl', r: null, touchTime: null, exitTime: null, maxFav: null, maxAdv: null });
      continue;
    }

    // Scan the 08:00–21:00 London window (or full day when noEod is set)
    const windowBars = dateBars.filter(b => {
      const mins = b.hour * 60 + b.min;
      return mins >= 8 * 60 && (noEod || mins < 21 * 60);
    });

    let touched      = false;
    let touchTime    = null;
    let result       = 'untouched';
    let r            = null;
    let exitTime     = null;
    let maxFav       = 0;
    let maxAdv       = 0;
    let inTrade      = false;
    let touchBarIdx  = -1;   // index into windowBars where touch first occurred
    let exitBarIdx   = -1;

    for (let bi = 0; bi < windowBars.length; bi++) {
      const bar     = windowBars[bi];
      const barMins = bar.hour * 60 + bar.min;

      if (!inTrade) {
        // Touch = wick overlaps level within 0.5 pip
        const prox = pip * 0.5;
        if (bar.l <= entryPrice + prox && bar.h >= entryPrice - prox) {
          touched      = true;
          touchTime    = hhmm(bar);
          inTrade      = true;
          touchBarIdx  = bi;
          continue; // don't check SL/TP on the entry bar itself
        }
      }

      if (inTrade) {
        if (dir === 'long') {
          const fav = (bar.h - entryPrice) / pip;
          const adv = (entryPrice - bar.l) / pip;
          if (fav > maxFav) maxFav = fav;
          if (adv > maxAdv) maxAdv = adv;
          if (bar.l <= sl) { result = 'sl'; r = -1; exitTime = hhmm(bar); exitBarIdx = bi; break; }
          if (bar.h >= tp) { result = 'tp'; r = tpDist / slDist; exitTime = hhmm(bar); exitBarIdx = bi; break; }
        } else {
          const fav = (entryPrice - bar.l) / pip;
          const adv = (bar.h - entryPrice) / pip;
          if (fav > maxFav) maxFav = fav;
          if (adv > maxAdv) maxAdv = adv;
          if (bar.h >= sl) { result = 'sl'; r = -1; exitTime = hhmm(bar); exitBarIdx = bi; break; }
          if (bar.l <= tp) { result = 'tp'; r = tpDist / slDist; exitTime = hhmm(bar); exitBarIdx = bi; break; }
        }
        if (!noEod && barMins >= 21 * 60 - 1) {
          const eodPnl = dir === 'long' ? bar.c - entryPrice : entryPrice - bar.c;
          r = Math.max(-1, Math.min(tpDist / slDist, eodPnl / slDist));
          result   = 'eod';
          exitTime = '21:00';
          exitBarIdx = bi;
          break;
        }
      }
    }

    // Slice bars for the chart: 12 before touch → exit + 8 after
    let chartBars = null;
    if (touchBarIdx >= 0) {
      const pre  = 12;
      const post = exitBarIdx >= 0 ? 8 : 30;  // if no exit yet, show 30 more bars
      const from = Math.max(0, touchBarIdx - pre);
      const to   = exitBarIdx >= 0
        ? Math.min(windowBars.length, exitBarIdx + post + 1)
        : Math.min(windowBars.length, touchBarIdx + 60);
      chartBars = windowBars.slice(from, to).map(b => ({
        h: b.h, l: b.l, o: b.o, c: b.c,
        t: hhmm(b),
        isTouchBar: hhmm(b) === touchTime,
        isExitBar:  exitBarIdx >= 0 && hhmm(b) === exitTime,
      }));
    }

    if (inTrade && result === 'untouched') result = 'open';
    if (!touched) { result = 'untouched'; r = null; }

    if (r !== null) {
      runningR += r;
      equity.push({
        label: `${stars}★ ${level.todayFib != null ? 'SD' + level.todayFib : ''}`,
        r: +r.toFixed(2),
        cumR: +runningR.toFixed(2),
        result,
        touchTime,
      });
    }

    results.push({
      level,
      touched,
      result,
      r:        r !== null ? +r.toFixed(2) : null,
      touchTime,
      exitTime,
      maxFav:   maxFav > 0 ? +maxFav.toFixed(1) : null,
      maxAdv:   maxAdv > 0 ? +maxAdv.toFixed(1) : null,
      chartBars,   // null when untouched, array of {h,l,o,c,t,isTouchBar,isExitBar} otherwise
      entryPrice,
      sl, tp, dir,
    });
  }

  // ── Aggregate stats ──────────────────────────────────────────────────────────
  const touched = results.filter(r => r.touched);
  const traded  = touched.filter(r => r.result === 'tp' || r.result === 'sl' || r.result === 'eod');
  const wins    = traded.filter(r => r.result === 'tp');
  const losses  = traded.filter(r => r.result === 'sl');
  const eods    = traded.filter(r => r.result === 'eod');
  const totalR  = traded.reduce((s, r) => s + (r.r || 0), 0);

  const byFib = {}, byStar = {};
  for (const res of results) {
    const fib = res.level.todayFib != null ? String(res.level.todayFib) : 'other';
    if (!byFib[fib]) byFib[fib] = { touched: 0, tp: 0, sl: 0, eod: 0, r: 0 };
    if (res.touched) byFib[fib].touched++;
    if (res.result === 'tp')  { byFib[fib].tp++;  byFib[fib].r += res.r; }
    if (res.result === 'sl')  { byFib[fib].sl++;  byFib[fib].r -= 1; }
    if (res.result === 'eod') { byFib[fib].eod++; byFib[fib].r += res.r; }

    const s = String(res.level.stars || 1);
    if (!byStar[s]) byStar[s] = { touched: 0, tp: 0, sl: 0, r: 0 };
    if (res.touched) byStar[s].touched++;
    if (res.result === 'tp')  { byStar[s].tp++;  byStar[s].r += res.r; }
    if (res.result === 'sl')  { byStar[s].sl++;  byStar[s].r -= 1; }
  }

  post('result', {
    symbol, date, pair, results, equity,
    stats: {
      total:   results.length,
      touched: touched.length,
      traded:  traded.length,
      wins:    wins.length,
      losses:  losses.length,
      eods:    eods.length,
      totalR:  +totalR.toFixed(2),
      winRate: traded.length > 0 ? Math.round(wins.length / traded.length * 100) : null,
    },
    byFib,
    byStar,
  });
}

function hhmm(bar) {
  return `${String(bar.hour).padStart(2, '0')}:${String(bar.min).padStart(2, '0')}`;
}
