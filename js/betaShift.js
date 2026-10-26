/**
 * Shifting beta for the newsletter: which markets have changed how they move with the Nasdaq, the US 10-year yield, the dollar index and oil.
 *
 * The figures come from the weekly market review (analysis/output/market-review/beta_shift.json), passed in whole. Beta here is a market's move per move in a driver,
 * over the last 20 sessions against the 60 before. A pair's line is shown only when a link flipped sign or shifted by more than the market's own normal change.
 * It says what moves together right now and which hedges are working. It is context, never a direction: same-day links are real, and the desk's tests found no
 * forward edge in them.
 *
 * Pure. Tested in js/betaShift.test.mjs.
 */
export const MAX_AGE_DAYS = 8;
const MINUS = '−';
/** Newsletter market keys to the keys the review uses, first match wins. */
const ALIASES = { GOLD: ['GOLD', 'XAUUSD'], NQ: ['NQ', 'NAS100'], SPX500: ['SPX500', 'US500'], US2000: ['US2000'], DE30: ['DE30'], UK100: ['UK100'], BTCUSD: ['BTCUSD', 'BTC'] };
const FACTOR = { '^NDX': 'the Nasdaq 100', US10Y: 'the US 10-year yield', 'DX-Y.NYB': 'the dollar index', 'CL=F': 'oil' };
const SHORT = { '^NDX': 'the Nasdaq', US10Y: 'the 10-year yield', 'DX-Y.NYB': 'the dollar', 'CL=F': 'oil' };

const dayNum = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; };
const move = (v, unit) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(2)}${unit === 'bp' ? 'bp' : '%'}`;
const list = a => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

/** The review's record for a market, or null when it is missing or its date is older than the allowed age. */
function marketOf(beta, key, today) {
  const mk = (ALIASES[key] ?? [key]).map(k => beta?.markets?.[k]).find(Boolean), asof = mk?.asof ?? beta?.asof, t = dayNum(today), a = dayNum(asof);
  if (!mk || t == null || a == null || t - a > MAX_AGE_DAYS || t - a < 0) return null;
  return { mk, asof };
}

/** The factors of one market that flipped or shifted, flips first, then by size of the shift against the market's own norm. */
function changed(mk) {
  // `extreme` (build.py): the 20-day beta sits outside its own 5th-95th percentile of the past year with |corr| >= 0.3,
  // the third leg of the alert rule today.html's Beta alerts card uses.
  return Object.entries(mk.factors ?? {}).filter(([, f]) => f && (f.flip || f.shift || f.extreme) && Number.isFinite(f.now) && Number.isFinite(f.prior))
    .map(([k, f]) => ({ k, f, kind: f.flip ? 'flipped' : f.shift ? (Math.abs(f.now) > Math.abs(f.prior) ? 'stronger' : 'weaker') : 'unusual' }))
    .sort((x, y) => (y.f.flip ? 1 : 0) - (x.f.flip ? 1 : 0) || Math.abs(y.f.z ?? 0) - Math.abs(x.f.z ?? 0));
}

/** One plain sentence for one changed link. */
function sentence(name, c, unit) {
  const f = c.f, per = /10bp/.test(f.unit ?? '') ? '10bp' : '1%', drv = FACTOR[c.k] ?? f.label ?? c.k, head = c.kind === 'flipped' ? 'Flipped' : c.kind === 'stronger' ? 'Stronger' : c.kind === 'weaker' ? 'Weaker' : 'Unusual level';
  if (c.kind === 'unusual') return `${head}: for each ${per} that ${drv} moves, ${name} now moves ${move(f.now, unit)}, outside its normal range for the past year (${move(f.prior, unit)} over the 60 sessions before).`;
  return `${head}: for each ${per} that ${drv} moves, ${name} now moves ${move(f.now, unit)}, against ${move(f.prior, unit)} over the 60 sessions before.`;
}

/**
 * What to print in one market's block: { asof, sentences } when a link flipped or shifted, null when the betas are stable, missing or stale.
 * `name` is how the issue names the market, so the sentence matches the card it sits on.
 */
export function betaFor(beta, key, today, name = key) {
  const r = marketOf(beta, key, today);
  if (!r) return null;
  const ch = changed(r.mk);
  if (!ch.length) return null;
  return { asof: r.asof, sentences: ch.slice(0, 2).map(c => sentence(name, c, r.mk.units)), flipped: ch.filter(c => c.kind === 'flipped').length };
}

/**
 * The biggest changes across the markets the issue shows: up to `max` of them, flips first. Returns { asof, text, items } or null when nothing changed.
 * `names` maps a market key to its label.
 */
export function betaTop(beta, keys, today, names = {}, max = 3) {
  const items = [];
  let asof = null;
  for (const key of keys ?? []) {
    const r = marketOf(beta, key, today);
    if (!r) continue;
    for (const c of changed(r.mk)) { items.push({ key, name: names[key] ?? r.mk.name ?? key, factor: c.k, kind: c.kind, z: Math.abs(c.f.z ?? 0) }); asof = r.asof; }
  }
  if (!items.length) return null;
  items.sort((x, y) => (y.kind === 'flipped' ? 1 : 0) - (x.kind === 'flipped' ? 1 : 0) || y.z - x.z);
  const top = items.slice(0, max);
  return { asof, items: top, text: `The biggest changes in what moves together: ${list(top.map(i => `${i.name} to ${SHORT[i.factor] ?? i.factor} (${i.kind})`))}.` };
}
