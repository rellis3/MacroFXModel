// js/terminal/spreadsTemplates.js: the per-pair "template table" behind the Spreads & ratios board. Pure data and pure sentence builders.
//
// EVERY pair in spreadsLibrary.js MUST have a row here (spreadsTemplates.test.mjs loops over all of them and fails on a missing template, a missing kind, a
// blank sentence or the word "undefined"), so adding a pair forces a KIND and its reference lines. The kind says what the number's NATURAL LEVEL is, which
// often matters more than its percentile:
//   spread       one yield or rate minus another (basis points or dollars): a zero line and named zones (inverted / flat / steep ...), or the percentile bands
//   volratio     one volatility index over another: the 1.0 line (front above back) where 1.0 means something, otherwise its own median and bands
//   relstrength  X over Y: its own 50-day and 200-day average (above / below trend), with the two legs rebased beside it
//   riskccy      a risk currency over a haven: the same trend lines, plus today's move
//   correlation  how two things move together: the zero line (where it has one) and its usual range
//   level        one series on its own: the percentile bands (and a zero line where the sign matters)
//   divergence   two related lines each against its own last two years: zero is "in line", one and two standard deviations are "stretched" and "far out"
// Everything here DESCRIBES state. Nothing is a signal; direction wording is only as strong as the Evidence Book's verdict, which the chips carry.
import { PAIRS } from './spreadsLibrary.js';

const MINUS = '−';
export const KINDS = {
  spread: { label: 'Spread', ref: 'a zero line and named zones', blurb: 'one yield or rate minus another: the zero line and the zones matter more than the percentile' },
  volratio: { label: 'Vol ratio', ref: 'the 1.0 line', blurb: 'one volatility index over another: above 1.0 means the first is priced higher than the second' },
  relstrength: { label: 'Relative strength', ref: 'its 50- and 200-day average', blurb: 'X over Y: above its trend averages means X has been out-running Y; the two legs are drawn beside it' },
  riskccy: { label: 'Risk currency', ref: 'its trend averages and today\'s move', blurb: 'a risk-sensitive currency over a haven: the same trend lines, with the day\'s move' },
  correlation: { label: 'Correlation', ref: 'a zero line and its usual range', blurb: 'how two things move together: positive means together, negative means apart' },
  level: { label: 'Level', ref: 'the percentile bands', blurb: 'one series on its own: where it sits in its own history' },
  divergence: { label: 'Divergence', ref: 'zero = in line; 1 and 2 standard deviations', blurb: 'two related lines, each against its own last two years: zero means they are in line with each other' },
};

const Z = (below, label, says) => ({ below, label, says });
const INF = Infinity;
const spread = (zones, extra = {}) => ({ kind: 'spread', zones, ref: { zero: true }, ...extra });
const spreadBands = () => ({ kind: 'spread', zones: null, ref: { band: true } });
const vol1 = (above, below) => ({ kind: 'volratio', ref: { one: { above, below } } });
const volBand = () => ({ kind: 'volratio', ref: { band: true } });
const rel = (extra = {}) => ({ kind: 'relstrength', ref: { trend: true }, ...extra });
const rccy = (extra = {}) => ({ kind: 'riskccy', ref: { trend: true }, ...extra });
const level = (zero = null) => ({ kind: 'level', ref: zero ? { zero } : { band: true } });
const curve = flat => spread([Z(0, 'inverted', 'the shorter-dated yield is above the longer-dated one'), Z(flat, 'flat', 'the long end yields only a little more than the short end'), Z(INF, 'steep', 'the long end yields clearly more than the short end')]);
const div = () => ({ kind: 'divergence', ref: { zero: true, sigma: [1, 2] }, zones: [Z(1, 'in line', 'they are moving as they usually do against each other'), Z(2, 'stretched', 'they have come apart by more than usual'), Z(INF, 'far out of line', 'they are further apart than they usually get')] });

export const TEMPLATES = {
  'rsp-spy': rel(), 'smh-spy': rel(), 'nvda-smh': rel(), 'nvda-spy': rel(), 'r2k-spx': rel(), 'nq-spx': rel(), 'xly-xlp': rel(), 'xle-oil': rel(),
  'xli-xlu': rel(), 'xlk-xlu': rel(), 'xlf-spy': rel(), 'xlk-spy': rel(), 'btc-nq': rel(), 'copper-gold': rel(), 'gold-silver': rel(), 'gold-dxy': rel(),
  'btc-gold': rel(), 'gold-oil': rel(), 'plat-gold': rel(),
  'curve-2s10s': curve(50), 'curve-5s30s': curve(60), 'curve-10s5s': curve(25), 'curve-30s10s': curve(20), 'y3m10y': curve(50), 'y10-dff': curve(100),
  'y2-dff': spread([Z(-15, 'cuts priced', 'the market is pricing the Fed lower over two years'), Z(15, 'about neutral', 'the 2-year is about where overnight rates are'), Z(INF, 'hikes priced', 'the market is pricing the Fed higher over two years')]),
  'real-bei': spread([Z(0, 'inflation-led', 'inflation expectations are the bigger part of the 10-year'), Z(INF, 'real-yield-led', 'the real yield is the bigger part of the 10-year')]),
  'sofr-iorb': spread([Z(-5, 'below the floor', 'overnight cash is plentiful'), Z(5, 'at the floor', 'calm: SOFR sits at the Fed\'s floor'), Z(INF, 'above the floor', 'overnight cash is getting scarcer')]),
  'brent-wti': spread([Z(0, 'Brent below WTI', 'unusual: the world benchmark is cheaper than the US one'), Z(INF, 'Brent above WTI', 'the world benchmark costs more than the US one')]),
  'hy-ig': spreadBands(), 'ccc-hy': spreadBands(),
  'vix-vix3m': vol1('near-term fear is priced above the 3-month: the vol curve is inverted', 'the vol curve slopes upward: calm'),
  'vix9d-vix': vol1('the next few days are priced as busier than the month', 'the next few days are priced as calmer than the month'),
  'vxn-vix': vol1('Nasdaq is priced as riskier than the S&P 500', 'Nasdaq is priced as calmer than the S&P 500'),
  'rvx-vix': vol1('small caps are priced as riskier than the S&P 500', 'small caps are priced as calmer than the S&P 500'),
  'vvix-vix': volBand(), 'move-vix': volBand(),
  audjpy: rccy(), nzdjpy: rccy({ legs: { x: 'nzdusd', y: 'usdjpy', op: 'mul' } }), chfjpy: rccy({ legs: { x: 'usdjpy', y: 'usdchf', op: 'div' } }),
  sbcorr: { kind: 'correlation', ref: { zero: { above: 'stocks and yields are moving together (growth-driven)', below: 'stocks and yields are moving opposite ways (inflation or rates-driven)' } } },
  cor3m: { kind: 'correlation', ref: { band: true } },
  skew: level(), rrp: level(), netliq: level(),
  vrp: level({ above: 'protection costs more than the market has moved', below: 'the market has moved as much as protection costs, or more' }), tp10: level({ above: 'investors ask to be paid extra to hold long bonds', below: 'investors accept less than rolling short bonds' }),
  'dx-dxy-tips': div(), 'dx-usdjpy-10y': div(), 'dx-gold-tips': div(), 'dx-dxy-vix': div(), 'dx-aud-copper': div(), 'dx-cad-oil': div(), 'dx-oil-bei': div(), 'dx-spx-vix': div(),
};
// vrp has its two legs in the bundle (VIX and the realised vol built from the S&P 500): a gap of two volatility numbers
TEMPLATES.vrp.legs = { x: 'vix', y: 'rv21', op: 'sub' };

/** The two legs of a pair as bundle keys, and how they combine ('div' = x over y, 'mul' = x times y, 'sub' = x minus y). null for a single series or a correlation. */
export function legsOf(pair) {
  const t = TEMPLATES[pair.id]; if (t?.legs) return t.legs;
  if (pair.op === 'ratio') return { x: pair.x, y: pair.y, op: 'div' };
  if (pair.op === 'diff' || pair.op === 'usd') return { x: pair.x, y: pair.y, op: 'sub' };
  return null;
}
export const kindOf = id => TEMPLATES[id]?.kind ?? null;
/** The reference numbers a pair's chart draws, in the units of its line (bp, dollars, sigma, a ratio). */
export function refLines(id) {
  const t = TEMPLATES[id]; if (!t) return {};
  const r = t.ref ?? {};
  return { zero: !!r.zero, one: !!r.one, trend: !!r.trend, band: !!r.band, sigma: r.sigma ?? null, zones: t.zones ?? null, zeroSays: typeof r.zero === 'object' ? r.zero : null, oneSays: r.one ?? null };
}

const nthOf = p => { const n = Math.round(p * 100), t = n % 100; return `${n}${t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')}`; };
const cap1 = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const zoneFor = (zones, v) => (zones ?? []).find(z => v < z.below) ?? null;
const part = side => (side === 'high' ? 'near the top of its own range' : side === 'low' ? 'near the bottom of its own range' : 'inside its usual range');

/** The state of a pair against its own trend: the last value against its 50-day and 200-day average. */
export function trendState(vals) {
  const n = vals.length, avg = k => { if (n < k) return null; let s = 0; for (let i = n - k; i < n; i++) s += vals[i]; return s / k; };
  const a50 = avg(50), a200 = avg(200), last = vals[n - 1];
  if (a50 == null) return { state: 'none', a50, a200, last };
  const above50 = last >= a50, above200 = a200 == null ? null : last >= a200;
  return { state: a200 == null ? (above50 ? 'above50' : 'below50') : above50 && above200 ? 'above' : !above50 && !above200 ? 'below' : 'mixed', a50, a200, last };
}

/**
 * ONE plain sentence of what the pair's number means right now, rule-built from the template's kind and the live state. Describes, never forecasts.
 * row: a ranked row from spreadsCore.rankPairs (pair, last, lastFmt, pct, side, series, c1, n ...).
 */
export function meaningOf(row) {
  const p = row.pair, t = TEMPLATES[p.id], v = row.last, val = row.lastFmt, side = row.side;
  const pctSay = () => (row.pct >= 0.66 ? `${cap1(part(side === 'mid' ? 'high' : side))}: ${p.up}.` : row.pct <= 0.34 ? `${cap1(part(side === 'mid' ? 'low' : side))}: ${p.down}.` : `Inside its usual range, so neither story is strong right now.`);
  if (!t) return pctSay();
  const sayRef = r => r?.above ? (v >= 0 ? `${cap1(r.above)}.` : `${cap1(r.below)}.`) : null;
  switch (t.kind) {
    case 'spread': {
      const z = zoneFor(t.zones, v);
      if (z) return `At ${val} it is ${z.label}: ${z.says}.`;
      return `At ${val}, ${pctSay().replace(/^./, c => c.toLowerCase())}`;
    }
    case 'volratio': {
      if (t.ref.one) return v >= 1 ? `At ${val}, above 1: ${t.ref.one.above}.` : `At ${val}, below 1: ${t.ref.one.below}.`;
      return `At ${val}, ${pctSay().replace(/^./, c => c.toLowerCase())}`;
    }
    case 'relstrength':
    case 'riskccy': {
      const ts = trendState(row.series.vals);
      let s;
      if (ts.state === 'above') s = `Above its 50-day and 200-day average: ${p.up}.`;
      else if (ts.state === 'below') s = `Below its 50-day and 200-day average: ${p.down}.`;
      else if (ts.state === 'mixed') s = `Between its 50-day and 200-day average, so the trend is mixed.`;
      else if (ts.state === 'above50') s = `Above its 50-day average: ${p.up}.`;
      else if (ts.state === 'below50') s = `Below its 50-day average: ${p.down}.`;
      else s = pctSay();
      return t.kind === 'riskccy' && row.c1 ? `${s} Today ${row.c1.text}.` : s;
    }
    case 'correlation': {
      if (t.ref.zero) return `At ${val}, ${v >= 0.15 ? t.ref.zero.above : v <= -0.15 ? t.ref.zero.below : 'close to zero, so the two are not moving together or apart in any steady way'}.`;
      return `At ${val}, ${pctSay().replace(/^./, c => c.toLowerCase())}`;
    }
    case 'level': return sayRef(t.ref.zero) ? `At ${val}, ${sayRef(t.ref.zero).replace(/^./, c => c.toLowerCase())}` : `At ${val}, ${pctSay().replace(/^./, c => c.toLowerCase())}`;
    case 'divergence': {
      const z = zoneFor(t.zones, Math.abs(v)), dir = v >= 0 ? 'higher' : 'lower';
      return `${cap1(p.xname)} is ${Math.abs(v).toFixed(1)}σ ${dir} than ${p.yname} would suggest: ${z.label} (${z.says}).`;
    }
    default: return pctSay();
  }
}
export const ALL_TEMPLATE_IDS = () => PAIRS.map(p => p.id);
export { MINUS, nthOf };
