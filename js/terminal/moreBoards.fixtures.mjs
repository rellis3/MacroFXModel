// Test fixtures for the newer Macro boards (js/terminal/moreBoards.js). Synthetic but shaped exactly like the live feeds (checked against
// production on 2026-11-13); each builder returns the inputs of that board's pure core. Never imported by the page.
const DAY = 864e5, iso = t => new Date(t).toISOString().slice(0, 10);
const wk = d => { const x = new Date(`${d}T00:00:00Z`).getUTCDay(); return x === 0 || x === 6; };
function days(from, to) { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) if (!wk(iso(t))) out.push(iso(t)); return out; }

export const moreFixtures = {
  creditLiquidity(now) {
    const ds = days('2004-01-01', '2026-11-14');
    const credit = ds.map((d, i) => ({ d, v: 2 + 1.2 * Math.sin(i / 400) + 0.5 * Math.sin(i / 37) + (i > ds.length - 300 ? -0.4 : 0) }));
    credit.push({ d: '2026-11-14', v: 1.48 });   // Moody's stamps point-in-time two days late: the last stamp is a Saturday
    const quality = credit.map((p, i) => ({ d: p.d, v: 0.6 + 0.25 * Math.sin(i / 450) }));
    const sd = days('2004-06-01', '2026-11-12');
    const series = sd.map((d, i) => ({ d, v: Math.sin(i / 300) * 1.4 + (i === sd.length - 1 ? 0 : 0) }));
    series[series.length - 1].v = -0.89;
    const hist = days('2023-11-27', '2026-11-16').filter((_, i) => i % 5 === 0).map((d, i) => ({ date: d, value: -1 + 0.8 * Math.sin(i / 14) }));
    return {
      components: { credit, quality },
      csi: { series, componentZ: { quality: -1.2759, credit: -1.3068, vix: -0.1016 } },
      state: { layers: { liquidity: {
        g4: { asOf: '2026-11-16', level: -1.068, impulse: -1.139, cycle: 0.276, phase: 'Falling', regime: 'GOLDILOCKS_LATE', history: hist,
          perCcy: { USD: -0.549, EUR: -0.306, JPY: 0.521, CNY: -0.417, GBP: -0.228, CHF: 0.911, AUD: -1.025, NZD: -1.025, CAD: -0.684, XAU: -0.797 } },
        net: { last: 5844.3, asOf: '2026-11-11', chg4w: -27.7, chg13w: 49.1, chg52w: 223.6, pctAll: 67, impulse: 'flat', today: { tga: 933.1, rrp: 0.3 } } } } },
      gate: { ok: true, instruments: { NAS100_USD: { asOf: '2026-11-13', gate1: 'NEUTRAL', gate2Pass: false, netliqZ: -0.028, curveZ: -1.688, creditZ: -1.47, composite: 'BLOCKED' } } },
      pulse: { ok: true, stats: { n: 2035, corrSameDay: -0.0176, corrNextDay: -0.0024, hitRateNextDay: 0.4959, hitRateSettlement: 0.5223, hitRateNonSettlement: 0.4776 } },
    };
  },
  curve(now) {
    const ds = days('2013-01-01', '2026-11-12');
    const mk = (base, amp, ph) => ds.map((d, i) => ({ date: d, value: Math.max(0.05, base + amp * Math.sin(i / 380 + ph) + 0.4 * Math.sin(i / 53 + ph)) }));
    const S = { effr: mk(2.2, 1.9, 0), us2y: mk(2.4, 1.7, 0.2), us5y: mk(2.7, 1.4, 0.35), us10y: mk(3.0, 1.1, 0.5), us30y: mk(3.4, 0.9, 0.6) };
    S.us2y[S.us2y.length - 1].value = 4.86; S.us10y[S.us10y.length - 1].value = 5.10; S.us30y[S.us30y.length - 1].value = 5.43; S.us5y[S.us5y.length - 1].value = 4.95; S.effr[S.effr.length - 1].value = 3.88;
    const coupling = { symbol: 'EUR/USD', availability: [{ last: '2026-11-13T21:55:00.000000000Z' }], spreads: [
      { tenor: '10Y', label: 'DE-US 10Y (Bund vs T-Note)', available: true, bars: 1229, coincident: 0.78, state: { regimeCorr: -0.07, state: 'decoupled', note: 'rates not driving price right now' } },
      { tenor: '2Y', label: 'US 2Y only', available: true, bars: 1360, coincident: 0.84, state: { regimeCorr: 0.45, state: 'divergent', note: 'price running against rates' } }] };
    const episodes = { ok: true, stale: false, asOfT: 1794603600, now: { spread: 79.75, link20: 0.076, pending: { legDir: -1, retraced: 0 } },
      events: [...Array(17)].map((_, i) => ({ outcome: { '4h': i % 3 === 0 ? 'follow' : i % 3 === 1 ? 'revert' : 'flat' } })) };
    return { S, coupling, episodes };
  },
  regime(now) {
    const frames = [['quadrant', 'Growth × inflation quadrant', 'Goldilocks', 'growth above trend (US surprises 0.45σ), inflation cooling (breakevens)', { met: 1, judged: 2, of: 4 }, 'theory'],
      ['smile', 'Dollar smile', 'Right side (US outperformance)', 'VIX 18.7, credit down', { met: 0, judged: 1, of: 2 }, 'theory'], ['credit', 'Credit cycle', 'Repair (wide but tightening)', 'HY -18bp over 20d', { met: 2, judged: 2, of: 3 }, 'theory'],
      ['vol', 'Volatility regime', 'Normal', 'VIX 18.7, VIX/VIX3M 0.932', { met: 1, judged: 1, of: 3 }, 'theory'], ['curve', 'Policy & the curve', 'Bear flattener', 'a hawkish central bank repricing the front end: 2Y +17bp, 10Y +10bp over 20d', null, 'theory'],
      ['risk', 'Risk-on / risk-off', 'Mixed: barometers disagree', '3 of 5 moving barometers read risk-on', null, null], ['flow', 'Capital-flow order', 'Out of order', 'Moved first: Rates then Credit then Equities', null, null]]
      .map(([id, name, state, why, conformity, ev]) => ({ id, name, state, why, expectations: [{ key: 'spx', label: 'Broad stocks', expected: 'up', actual: 'flat', ok: null }], conformity, evidence: ev ? { status: ev } : undefined }));
    const state = { asOf: '2026-11-12', playbook: { frames, overall: null }, global: { regime: { describe: 'real yields falling, credit spreads widening, and a normally-sloped curve' },
      risk: { level: 'CALM', active: 0, available: 5, asOf: '2026-11-13T22:58:12Z', note: 'Cross-asset risk backdrop calm: pair-specific drivers dominate.',
        flags: [{ key: 'vix_level', label: 'VIX elevated', on: false, value: 18.7, detail: 'VIX 18.7 (flag >= 25)' }, { key: 'vix_term', label: 'VIX curve backwardated', on: false, value: 0.932, detail: '' }, { key: 'hy_speed', label: 'Credit widening fast', on: false, value: -12, detail: '' },
          { key: 'jpy_bid', label: 'JPY safe-haven bid', on: false, value: 0.48, detail: '' }, { key: 'evz_stress', label: 'FX implied vol stressed', on: null, value: null, detail: 'no 5y percentile wired' }], move: { level: 98.79, pct1y: 89, chg20: -3.7 } } },
      layers: { vol: { rows: [{ sym: 'NQ', volPct: 97, volAnnual: 28.6 }, { sym: 'SPX500', volPct: 97, volAnnual: 21.3 }, { sym: 'EURUSD', volPct: 72, volAnnual: 6.4 }, { sym: 'USDJPY', volPct: 13, volAnnual: 5.6 }, { sym: 'GOLD', volPct: 16, volAnnual: 18.9 }, { sym: 'CHFJPY', volPct: 4, volAnnual: 5.5 }] } },
      edges: [{ id: 'forecast-miss-shock-fx', label: 'Equity/vol stress → FX ranges beat the forecast', applies: 'FX', active: false, grade: 'ROBUST', standing: 'edge', why: '2 of 5 stress conditions on' }, { id: 'vix-inversion', label: 'VIX inverted → a wider week', applies: 'indices', active: false, grade: 'PLAUSIBLE', standing: 'edge', why: 'VIX/VIX3M 0.93' }, { id: 'nq-down-week', label: 'NQ down-week follow', applies: 'NQ', active: null, grade: 'FRAGILE', standing: 'research only', why: '' }] };
    const hmm = Object.fromEntries(['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD', 'NAS100_USD'].map((k, i) => [k, { regime: i % 3 === 1 ? 'TREND' : 'RANGE', rangeProb: 0.5 + 0.08 * i, trendProb: 0.5 - 0.08 * i, reliable: true, sigmaRatio: 1.4 }]));
    const q = n => [...Array(30)].map((_, i) => (i % 7 === 0 || i % 7 === 6 ? '.' : (i * n) % 5 < 2 ? 'a' : 'q')).join('');
    const hist = { ok: true, days: [...Array(30)].map((_, i) => '2026-10-' + String(15 + (i % 16)).padStart(2, '0')), pairs: { GOLD: q(2), NQ: q(3), SPX500: q(4), US30: q(1), EURUSD: q(5) } };
    const lc = {}, av = {}, sd = {}; ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((k, i) => { lc[k] = (i % 2 ? -1 : 1) * (0.4 + 0.05 * i); av[k] = 0.4; sd[k] = 0.15; });
    return { state, hmm, hist, hedge: { generated: '2026-11-13T23:03:20Z', last_corr: lc, avg_corr: av, corr_std: sd } };
  },
  releases(now) {
    const H = 3600e3, mk = (country, event, dh, est, prev, actual = null) => ({ country, event, impact: 'high', ms: now + dh * H, estimate: est, prev, actual, time: '' });
    const events = [mk('US', 'Core CPI m/m', -2, '0.2%', '0.3%', '0.3%'), mk('US', 'CPI m/m', -2, '0.3%', '0.6%', '0.3%'), mk('EU', 'ECB President Lagarde Speaks', 20, null, null), mk('GB', 'GDP m/m', 30, '0.0%', '0.1%'), mk('AU', 'Employment Change', 40, '20K', '15K'), mk('JP', 'Core CPI y/y', 90, '2.9%', '2.8%'), { ...mk('US', 'Retail Sales m/m', 300, '0.4%', '0.1%') }];
    const fxRow = (sym, pct, share) => ({ sym, label: sym, group: 'fx', specPct: pct, specSharePct: pct, specNet: share * 1000, specShare: share });
    const cot = { ok: true, reportDate: '2026-11-03', instruments: [fxRow('EUR', 0, -8.97), fxRow('GBP', 32, 10.86), fxRow('JPY', 21, 3.89), fxRow('AUD', 82, 15.25), fxRow('CAD', 75, 24.75), fxRow('CHF', 81, 12.65), fxRow('NZD', 19, -17.47), fxRow('MXN', 81, 25.2)] };
    const mkt = (id, label, m30, l30) => ({ id, label, unit: '%', m30, label30: l30, m240: m30 * 2, label240: l30 });
    const reactions = { studyN: 159, live: [{ source: 'live', country: 'CA', event: 'Employment Change', ms: now - 170 * H, surprise: { ok: true, direction: 'below', z: -0.34, size: 'in line', actual: '-4.7K', estimate: '14.6K' }, regime: { tone: 'normal' }, markets: [mkt('gold', 'Gold', -0.366, null)] }],
      recent: [{ source: 'study', family: 'CPI', country: 'US', event: 'Core CPI m/m', ms: now - 80 * H, surprise: { ok: true, direction: 'above', z: 1.11, actual: 0.3, estimate: 0.2 }, regime: { tone: 'normal' }, markets: [mkt('eurusd', 'EUR/USD', -0.232, 'in line'), mkt('usdjpy', 'USD/JPY', 0.221, 'in line'), mkt('gold', 'Gold', -0.486, 'overreaction')] },
        { source: 'study', family: 'CPI', country: 'US', event: 'CPI m/m', ms: now - 80 * H, surprise: { ok: true, direction: 'above', z: 0.8, actual: 0.3, estimate: 0.3 }, regime: { tone: 'normal' }, markets: [mkt('eurusd', 'EUR/USD', -0.232, 'in line')] }],
      summary: ['calm', 'normal', 'stressed'].map((regime, i) => ({ family: 'ALL', regime, n: 39 + i * 20, m30: { n: 23, nClear: 3, expected: 0.67, labels: { overreaction: 4, 'in line': 15 + i, 'priced in': 1, underreaction: 2, opposite: 1 } } })) };
    const eventDay = { ok: true, frontEnds: { stale: false, asOf: '2026-11-13T21:00:00.000Z', rows: [{ label: 'Euro STR Dec26', area: 'euro area', unit: 'bp', d1: -0.25, d5: 3.75 }, { label: 'Bund future', area: 'euro area', unit: '%', d1: -0.2, d5: -0.5 }] } };
    return { events, cot, reactions, eventDay };
  },
};
