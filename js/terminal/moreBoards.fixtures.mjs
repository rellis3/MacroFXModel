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
};
