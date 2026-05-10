// journal-replay-worker.js — M1 bar replay for journal day analysis
// Accepts: { type:'parse', payload:{symbol,text} }
//          { type:'replay', payload:{symbol,date,levels,rrRatio,pipSize} }

const _m1 = {}; // _m1[symbol] = sorted bars oldest→newest

self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === 'parse')  handleParse(payload);
  if (type === 'replay') handleReplay(payload);
};

function post(type, payload) { self.postMessage({ type, payload }); }

// ── Parse M1 CSV ──────────────────────────────────────────────────────────────

function handleParse({ symbol, text }) {
  post('progress', { msg: `Parsing ${symbol} M1…` });
  const lines = text.split('\n');
  const bars  = [];
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
    bars.push({ ts, o, h, l, c, date: d.date, hour: d.hour, min: d.min });
  }
  bars.sort((a, b) => a.ts - b.ts);
  _m1[symbol] = bars;
  post('parsed', { symbol, count: bars.length });
}

function londonDate(ts) {
  const d = new Date(ts * 1000);
  const s = d.toLocaleString('en-GB', { timeZone: 'Europe/London',
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12: false });
  // "dd/mm/yyyy, hh:mm"
  const [datePart, timePart] = s.split(', ');
  const [dd, mm, yyyy] = datePart.split('/');
  const [hh, mn] = timePart.split(':');
  return { date: `${yyyy}-${mm}-${dd}`, hour: +hh, min: +mn };
}

// ── Replay ────────────────────────────────────────────────────────────────────

function handleReplay({ symbol, date, levels, rrRatio, pipSize }) {
  const bars = (_m1[symbol] || []).filter(b => b.date === date);
  if (!bars.length) {
    post('error', `No M1 data for ${symbol} on ${date}. Load the M1 CSV first.`);
    return;
  }

  const pip = pipSize;
  const results = [];
  let runningR = 0;
  const equity = [{ label: 'Start', r: 0, cumR: 0 }];

  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
    const entryPrice = level.price;
    const dir        = level.direction;  // 'long' | 'short'
    const sl         = level.slOverride ?? level.sl;
    const tp         = level.tpOverride ?? level.tp;
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

    // Only scan bars from entry window start (08:00 London) to EOD (21:00)
    const windowBars = bars.filter(b => {
      const mins = b.hour * 60 + b.min;
      return mins >= 8 * 60 && mins < 21 * 60;
    });

    let touched   = false;
    let touchTime = null;
    let result    = 'untouched';
    let r         = null;
    let exitTime  = null;
    let maxFav    = 0;  // maximum favourable excursion in pips
    let maxAdv    = 0;  // maximum adverse excursion in pips (positive = how far it went against)
    let inTrade   = false;

    for (const bar of windowBars) {
      const barMins = bar.hour * 60 + bar.min;

      if (!inTrade) {
        // Detect touch: bar's wick overlaps level price within 0.5pip
        const prox = pip * 0.5;
        const touched_now = bar.l <= entryPrice + prox && bar.h >= entryPrice - prox;
        if (touched_now) {
          touched   = true;
          touchTime = `${String(bar.hour).padStart(2,'0')}:${String(bar.min).padStart(2,'0')}`;
          inTrade   = true;
        }
      }

      if (inTrade) {
        // Check SL/TP hit
        if (dir === 'long') {
          const fav = (bar.h - entryPrice) / pip;
          const adv = (entryPrice - bar.l) / pip;
          if (fav > maxFav) maxFav = fav;
          if (adv > maxAdv) maxAdv = adv;
          if (bar.l <= sl) {
            result   = 'sl';
            r        = -1;
            exitTime = `${String(bar.hour).padStart(2,'0')}:${String(bar.min).padStart(2,'0')}`;
            break;
          }
          if (bar.h >= tp) {
            result   = 'tp';
            r        = tpDist / slDist;
            exitTime = `${String(bar.hour).padStart(2,'0')}:${String(bar.min).padStart(2,'0')}`;
            break;
          }
        } else {
          const fav = (entryPrice - bar.l) / pip;
          const adv = (bar.h - entryPrice) / pip;
          if (fav > maxFav) maxFav = fav;
          if (adv > maxAdv) maxAdv = adv;
          if (bar.h >= sl) {
            result   = 'sl';
            r        = -1;
            exitTime = `${String(bar.hour).padStart(2,'0')}:${String(bar.min).padStart(2,'0')}`;
            break;
          }
          if (bar.l <= tp) {
            result   = 'tp';
            r        = tpDist / slDist;
            exitTime = `${String(bar.hour).padStart(2,'0')}:${String(bar.min).padStart(2,'0')}`;
            break;
          }
        }

        // EOD: 21:00 — close at market
        if (barMins >= 21 * 60 - 1) {
          const eodPnl = dir === 'long' ? bar.c - entryPrice : entryPrice - bar.c;
          r = eodPnl / slDist;
          // Clamp to SL..TP
          r = Math.max(-1, Math.min(tpDist / slDist, r));
          result   = 'eod';
          exitTime = `21:00`;
          break;
        }
      }
    }

    if (inTrade && result === 'untouched') result = 'open'; // touched but no exit yet
    if (!touched) { result = 'untouched'; r = null; }

    if (r !== null) {
      runningR += r;
      equity.push({
        label: `${stars}★ ${level.todayFib != null ? 'SD'+level.todayFib : ''}`,
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
      r: r !== null ? +r.toFixed(2) : null,
      touchTime,
      exitTime,
      maxFav: maxFav > 0 ? +maxFav.toFixed(1) : null,
      maxAdv: maxAdv > 0 ? +maxAdv.toFixed(1) : null,
    });
  }

  // ── Aggregate stats ────────────────────────────────────────────────────────

  const touched    = results.filter(r => r.touched);
  const traded     = touched.filter(r => r.result === 'tp' || r.result === 'sl' || r.result === 'eod');
  const wins       = traded.filter(r => r.result === 'tp');
  const losses     = traded.filter(r => r.result === 'sl');
  const eods       = traded.filter(r => r.result === 'eod');
  const totalR     = traded.reduce((s, r) => s + (r.r || 0), 0);

  // By fib/SD level
  const byFib = {};
  for (const res of results) {
    const fib = res.level.todayFib != null ? String(res.level.todayFib) : 'other';
    if (!byFib[fib]) byFib[fib] = { touched: 0, tp: 0, sl: 0, eod: 0, r: 0 };
    if (res.touched) byFib[fib].touched++;
    if (res.result === 'tp')  { byFib[fib].tp++; byFib[fib].r += res.r; }
    if (res.result === 'sl')  { byFib[fib].sl++; byFib[fib].r -= 1; }
    if (res.result === 'eod') { byFib[fib].eod++; byFib[fib].r += res.r; }
  }

  // By star rating
  const byStar = {};
  for (const res of results) {
    const s = String(res.level.stars || 1);
    if (!byStar[s]) byStar[s] = { touched: 0, tp: 0, sl: 0, r: 0 };
    if (res.touched) byStar[s].touched++;
    if (res.result === 'tp')  { byStar[s].tp++; byStar[s].r += res.r; }
    if (res.result === 'sl')  { byStar[s].sl++; byStar[s].r -= 1; }
  }

  post('result', {
    symbol, date, results, equity,
    stats: {
      total: results.length,
      touched: touched.length,
      traded: traded.length,
      wins: wins.length,
      losses: losses.length,
      eods: eods.length,
      totalR: +totalR.toFixed(2),
      winRate: traded.length > 0 ? Math.round(wins.length / traded.length * 100) : null,
    },
    byFib,
    byStar,
  });
}
