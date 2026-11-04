/**
 * The forward shadow tracker (plans/DESK_ANALYST_PIPELINE.md §9ae): the honest test of a filter the post-mortem found.
 *
 * A filter chosen on a backtest has only been scored on data the researchers saw. A shadow applies it to a bot's NEW
 * live trades only (closed after the shadow started), so every trade it is scored on is out of sample. The bot itself
 * is not changed: the shadow keeps two records side by side, the bot as traded and the bot as filtered.
 *
 * A rule is a list of conditions on what is known when the trade opens: { dim, values, op } with dim one of
 * instrument, direction, hour (London entry-hour bucket: 00-07, 07-12, 12-16, 16-21, 21-24), weekday, month, hold
 * (holding-time bucket; known only at the exit, so a hold rule is a description, flagged), and op 'keep' (take only
 * these) or 'drop' (skip these). The js/systemReview.js slice strings ("instrument = EURUSD") convert directly.
 *
 * Score: the kept trades' mean R against the same bot's trades as traded, and a placebo: random filters that keep
 * the same number of trades (2,000 draws, seeded). Verdict once at least `minKept` kept and `minSkipped` skipped
 * trades have closed: helping (the kept mean beats 95% of random filters), hurting (below 5%), or no difference.
 *
 * Pure. Tested in js/shadowTracker.test.mjs.
 */
import { mulberry32 } from './statsCore.js';

export const DIMS = ['instrument', 'direction', 'hour', 'weekday', 'month', 'hold'];
const LDN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
const hourBucket = h => (h < 7 ? '00-07' : h < 12 ? '07-12' : h < 16 ? '12-16' : h < 21 ? '16-21' : '21-24');
const holdBucket = ms => { const h = ms / 3600e3; return h < 1 ? '<1h' : h < 4 ? '1-4h' : h < 24 ? '4-24h' : h < 120 ? '1-5d' : '>5d'; };

/** The slice keys of a live trade (same buckets as js/systemReview.js). t: { inst|instrument, dir|direction, openMs|entryMs, closeMs|exitMs }. */
export function keysOf(t) {
  const open = t.openMs ?? t.entryMs, close = t.closeMs ?? t.exitMs ?? open;
  const p = Object.fromEntries(LDN.formatToParts(new Date(open)).map(x => [x.type, x.value]));
  const dir = t.direction ?? (t.dir > 0 ? 'Long' : t.dir < 0 ? 'Short' : null);
  return { instrument: String(t.inst ?? t.instrument ?? '').toUpperCase(), direction: dir, hour: hourBucket(+p.hour), weekday: p.weekday, month: p.month, hold: holdBucket(close - open) };
}

/** "instrument = EURUSD" (a systemReview slice) + keep/drop → a rule. Throws on a slice a live trade cannot carry. */
export function ruleFromSlice(slice, op) {
  const m = String(slice).match(/^\s*([a-z]+)\s*=\s*(.+?)\s*$/);
  if (!m || !DIMS.includes(m[1])) throw new Error(`a shadow can only use ${DIMS.join(', ')} (got "${slice}")`);
  if (!['keep', 'drop'].includes(op)) throw new Error('op must be keep or drop');
  return [{ dim: m[1], op, values: [m[2]] }];
}

export function validateRule(rule) {
  if (!Array.isArray(rule) || !rule.length) throw new Error('a rule is a non-empty list of conditions');
  return rule.map(c => {
    if (!DIMS.includes(c?.dim)) throw new Error(`unknown dimension ${c?.dim}`);
    if (!['keep', 'drop'].includes(c?.op)) throw new Error('op must be keep or drop');
    const values = (Array.isArray(c.values) ? c.values : [c.values]).map(v => String(v)).filter(Boolean);
    if (!values.length) throw new Error('a condition needs values');
    return { dim: c.dim, op: c.op, values: c.dim === 'instrument' ? values.map(v => v.toUpperCase()) : values };
  });
}
/** Does the rule take this trade? Every condition must allow it. */
export const takes = (rule, t) => { const k = keysOf(t); return rule.every(c => (c.op === 'keep' ? c.values.includes(String(k[c.dim])) : !c.values.includes(String(k[c.dim])))); };
export const describe = rule => rule.map(c => `${c.op === 'keep' ? 'only' : 'skip'} ${c.dim} ${c.values.join(' or ')}`).join(', ');

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r3 = x => (Number.isFinite(x) ? +x.toFixed(3) : null);

/**
 * Score a shadow on a bot's trades. shadow: { rule, startedAt (ms) }; trades: closed live trades with R.
 * Only trades closed after startedAt count.
 */
export function evaluate(shadow, trades, { minKept = 30, minSkipped = 10, draws = 2000, seed = 0x9e3779b9 } = {}) {
  const rule = validateRule(shadow.rule);
  const fwd = (trades ?? []).filter(t => Number.isFinite(t.R) && (t.closeMs ?? t.exitMs ?? t.openMs ?? t.entryMs) > shadow.startedAt);
  const kept = fwd.filter(t => takes(rule, t)), skipped = fwd.filter(t => !takes(rule, t));
  const all = fwd.map(t => t.R), kR = kept.map(t => t.R), sR = skipped.map(t => t.R);
  const out = { rule: describe(rule), since: new Date(shadow.startedAt).toISOString().slice(0, 10), trades: fwd.length, kept: kept.length, skipped: skipped.length,
    asTraded: { meanR: r3(mean(all)), totalR: r3(all.reduce((a, b) => a + b, 0)) }, filtered: { meanR: r3(mean(kR)), totalR: r3(kR.reduce((a, b) => a + b, 0)) }, skippedMeanR: r3(mean(sR)) };
  if (kept.length < minKept || skipped.length < minSkipped) return { ...out, verdict: 'collecting', need: `${Math.max(0, minKept - kept.length)} more kept and ${Math.max(0, minSkipped - skipped.length)} more skipped trades` };
  const rng = mulberry32(seed >>> 0), k = kept.length, m = mean(kR); let below = 0;
  for (let d = 0; d < draws; d++) { const idx = new Set(); while (idx.size < k) idx.add((rng() * all.length) | 0); let s = 0; for (const i of idx) s += all[i]; if (s / k < m) below++; }
  const pct = below / draws;
  return { ...out, placeboPercentile: r3(pct), verdict: pct >= 0.95 ? 'helping' : pct <= 0.05 ? 'hurting' : 'no difference yet',
    note: rule.some(c => c.dim === 'hold') ? 'a holding-time rule is known only at the exit: descriptive, not tradeable as written' : null };
}
