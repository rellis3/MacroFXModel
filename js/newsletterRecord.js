import { buildIdea } from './macroIdea.js';
/**
 * The newsletter's memory: what each issue said, what changed since the last one, and how its one checkable claim fared.
 *
 * WHAT IS CHECKABLE. This desk's tests keep finding that direction cannot be forecast, so an issue makes no direction call
 * to score. What it does publish, for every market, is the EXPECTED size of the day: the median high-to-low range from the
 * calibrated forecast. That is a falsifiable claim. After the day closes, the stored session audit says how big the day
 * really was, so each issue can be marked on one question: did the days come out the size it said?
 *   - ratio     = realised high-to-low / the expected range the issue printed
 *   - a well-calibrated median says: about half the markets run past it (ratio > 1) and the median ratio sits near 1.
 * The score is therefore a calibration check, not a hit rate. It never says "right" or "wrong" about direction.
 *
 * Pure: no fetch, no DOM, no clock. Shared by the page (to build snapshots and diffs) and server.js (to score).
 * Tested in js/newsletterRecord.test.mjs.
 */

const num = v => (v == null || v === '' ? null : Number.isFinite(+v) ? +v : null);
const r2 = v => Math.round(v * 100) / 100;

/** The small, stable record of one issue. Stored with the issue; never holds prose the page cannot re-derive. */
export function snapshotOf(n, { date, kind = 'daily' } = {}) {
  const idea = (() => { try { const i = buildIdea({ links: n?.links ?? [] }); const l = i && (n.links ?? []).find(x => x.id === i.storyId); return i && l ? { id: `${l.a.key}>${l.b.key}`, name: `${l.a.label} → ${l.b.label}`, verdict: l.verdict, headline: i.headline } : null; } catch { return null; } })();
  const links = (n?.links ?? []).filter(l => l?.a?.key && l?.b?.key);
  const id = l => `${l.a.key}>${l.b.key}`, nm = l => `${l.a.label} → ${l.b.label}`;
  const ranges = {};
  for (const r of n?.assets ?? n?.ranges ?? []) { const k = r.key ?? r.label; const e = num(r.hlMed); if (k && e != null && e > 0) ranges[k] = { expected: r2(e), usedAtWrite: num(r.used) != null ? r2(r.used) : null }; }
  const cb = {}; for (const c of n?.cb ?? []) if (c?.ccy && num(c.latest) != null) cb[c.ccy] = r2(c.latest);
  return {
    date: date ?? null, kind,
    headline: n?.headline ?? n?.brief?.headline ?? null,
    regime: n?.regimeCard?.label ?? null,
    broken: links.filter(l => l.verdict === 'broken').map(l => ({ id: id(l), name: nm(l) })),
    holding: links.filter(l => l.verdict === 'holding').map(l => ({ id: id(l), name: nm(l) })),
    flagsOn: (n?.riskFlags?.flags ?? []).filter(f => f.on === true).map(f => f.label),
    flagsTotal: n?.riskFlags?.total ?? null,
    cb, ranges, idea,
    crowd: Object.fromEntries((n?.crowding ?? []).filter(c => c?.sym && c.state).map(c => [c.sym, c.state])),
  };
}

/** What changed between two snapshots, as plain lines the reader wants first. Empty when there is nothing to say. */
export function diffSnapshots(prev, cur) {
  if (!prev || !cur) return { items: [], from: null, first: !prev };
  const items = [], pb = new Map((prev.broken ?? []).map(x => [x.id, x.name])), cb = new Map((cur.broken ?? []).map(x => [x.id, x.name]));
  for (const [k, v] of cb) if (!pb.has(k)) items.push({ kind: 'link-broke', text: `New broken link: ${v}. Both ends moved the wrong way round.` });
  for (const [k, v] of pb) if (!cb.has(k)) items.push({ kind: 'link-healed', text: `Link back to normal: ${v}.` });
  if (prev.idea) {   // the scorecard: what became of the last issue's idea
    const id = prev.idea.id, now = (cur.broken ?? []).some(x => x.id === id) ? 'broken' : (cur.holding ?? []).some(x => x.id === id) ? 'holding' : 'quiet';
    items.unshift({ kind: 'idea-followup', text: `Last issue's idea, ${prev.idea.name}, was ${prev.idea.verdict === 'broken' ? 'a broken link' : 'a holding link'}. It is now ${now === 'quiet' ? 'quiet: one end has drifted back inside its noise band, so the story has faded or paused' : now === prev.idea.verdict ? `still ${now}: the story carried on` : `${now}: it ${now === 'holding' ? 'has repaired' : 'has broken'}`}.` });
  }
  for (const [sym, st] of Object.entries(cur.crowd ?? {})) {   // positioning is weekly, so a change here is the new CFTC report
    const was = prev.crowd?.[sym]; if (!was || was === st) continue;
    items.push({ kind: 'crowd-change', text: `Positioning, ${sym}: speculators went from ${was} to ${st}.` });
  }
  const pf = new Set(prev.flagsOn ?? []), cf = new Set(cur.flagsOn ?? []);
  for (const f of cf) if (!pf.has(f)) items.push({ kind: 'flag-on', text: `Stress warning switched on: ${f}.` });
  for (const f of pf) if (!cf.has(f)) items.push({ kind: 'flag-off', text: `Stress warning cleared: ${f}.` });
  if (prev.regime && cur.regime && prev.regime !== cur.regime) items.push({ kind: 'regime', text: `The economic backdrop moved from ${prev.regime} to ${cur.regime}.` });
  for (const [ccy, v] of Object.entries(cur.cb ?? {})) { const p = prev.cb?.[ccy]; if (p != null && Math.abs(v - p) >= 0.01) items.push({ kind: 'cb', text: `${ccy} central-bank tone score ${p} → ${v}.` }); }
  return { items, from: prev.date ?? null, first: false };
}

/**
 * Mark one issue against the realised day. audit = the stored session audit for the issue's date
 * ({ instruments: { KEY: { hl: <realised high-to-low %> } } }). Returns null when nothing can be matched.
 */
export function scoreIssue(snapshot, audit) {
  const rows = [];
  for (const [key, r] of Object.entries(snapshot?.ranges ?? {})) {
    const real = num(audit?.instruments?.[key]?.hl); if (real == null || !(r.expected > 0)) continue;
    rows.push({ key, expected: r.expected, realised: r2(real), ratio: r2(real / r.expected) });
  }
  if (rows.length < 3) return null;
  const rs = rows.map(x => x.ratio).sort((a, b) => a - b), mid = rs.length >> 1;
  const median = rs.length % 2 ? rs[mid] : r2((rs[mid - 1] + rs[mid]) / 2);
  return { n: rows.length, median, pastShare: Math.round(100 * rows.filter(x => x.ratio > 1).length / rows.length), withinShare: Math.round(100 * rows.filter(x => x.ratio >= 0.5 && x.ratio <= 1.5).length / rows.length), rows };
}

/** One honest sentence for a score. A median near 1 and about half past the expected range is what calibrated looks like. */
export function scoreLine(s) {
  if (!s) return 'Not scored yet: the day has to close and its audit has to be stored.';
  return `${s.n} markets: the median day came out ${s.median}x the expected size, ${s.pastShare}% ran past it, ${s.withinShare}% landed within half to one-and-a-half times. A well-calibrated forecast has the median near 1 and about half past it.`;
}

/** Roll several scored issues into one week line. */
export function weekRecord(issues) {
  const sc = (issues ?? []).map(i => i.score).filter(Boolean);
  if (!sc.length) return null;
  const all = sc.flatMap(s => s.rows.map(r => r.ratio)).sort((a, b) => a - b), mid = all.length >> 1;
  return { days: sc.length, n: all.length, median: all.length % 2 ? all[mid] : r2((all[mid - 1] + all[mid]) / 2), pastShare: Math.round(100 * all.filter(x => x > 1).length / all.length), withinShare: Math.round(100 * all.filter(x => x >= 0.5 && x <= 1.5).length / all.length) };
}

/**
 * A market read may describe what happened and what it fits. It may not predict or advise: this desk's tests find no direction edge, and
 * the page says so. The model is told not to, and this is the check that does not rely on it obeying. "expected" (a consensus figure) is
 * fine; "expect extension", "likely", "should", "leans", "squeeze", "fade", "target" and a will-verb are not.
 */
const _PREDICTS = /\b(likely|unlikely|should|leans?\s+(against|towards?|to|on)|squeez\w*|extension|fade[ds]?|price target|bullish|bearish|upside|downside|breakout|buy|sell)\b|\bexpect\s+(?!ed\b)\w+|\bwill\s+(rise|fall|go|move|drop|rally|extend|push|break|reverse|continue)\b/i;
export const readIsSafe = text => typeof text === 'string' && text.trim().length > 0 && !_PREDICTS.test(text);

/**
 * Market reads are for a reader who is not a quant. The model is told to avoid the desk's internal vocabulary; this is the pass that does
 * not rely on it obeying. Known jargon is swapped for a plain word. A read that still carries a raw field name (camelCase such as
 * `rateDiff`) cannot be fixed by substitution, so it is refused and the card falls back to the data-written line.
 */
export function plainRead(text) {
  if (typeof text !== 'string') return null;
  const t = text
    .replace(/\bmacro scorecard\b/gi, 'economic score').replace(/\bscorecard\b/gi, 'score')
    .replace(/\bcomposite\b/gi, 'overall score').replace(/\bdimensions?\b/gi, m => (/s$/i.test(m) ? 'factors' : 'factor'))
    .replace(/\bturn-of-month\b/gi, 'month-end').replace(/\bversus its own baseline\b/gi, 'against its normal pace')
    .replace(/\bdesk-?watch\b/gi, 'watched').replace(/\bgamma walls?\b/gi, 'option levels').replace(/\b(?:put|call) walls?\b/gi, 'option level')
    .replace(/\brateDiff\b/g, 'interest-rate gap')
    .replace(/\s+/g, ' ').trim();
  return /\b[a-z]+[A-Z][A-Za-z]+\b/.test(t.replace(/\b(?:iPhone|iPad|eBay)\b/g, '')) ? null : t;
}
