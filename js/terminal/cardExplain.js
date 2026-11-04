/**
 * "What drives this": why a card in the Desk Terminal says what it says (owner-approved fix, 2026-11-04).
 *
 * From the stored desk run only (nothing fetched, nothing modelled):
 *   - which analysts' points moved the card: every point whose impact map names the market itself, one of its
 *     currency legs (an FX pair: + for the base, − for the quote; a dollar-priced commodity or crypto: − for USD) or
 *     risk appetite (RISK, for the markets in the attribution's risk basket that are not FX pairs). Each point's push on
 *     the market is impact × that sign; a push the card's way is "for", the other way "against";
 *   - the data behind it: when the Desk Pack was built, when the book was written, the day of the forecast lines, and
 *     every feed the moving analysts read that was stale or empty that morning (from the run's data-quality gaps), so a
 *     driver that rests on old data says so;
 *   - the invalidation, as the card states it.
 * Pure. Tested in js/terminal/terminal.test.mjs.
 */
import { RISK } from '../deskAttribution.js';
import { instrumentLegs, groupOf } from '../deskPack.js';

const DIRN = { STRONG_LONG: 1, LONG: 1, FLAT: 0, NEUTRAL: 0, SHORT: -1, STRONG_SHORT: -1 };
const FXG = new Set(['fx_majors', 'fx_crosses']);

/** How an impact key pushes this market: [{ key, sign, via }]. */
export function channels(inst) {
  const n = String(inst ?? '').toUpperCase(), g = groupOf(n), out = [{ key: n, sign: 1, via: 'direct' }];
  if (FXG.has(g)) { const [b, q] = instrumentLegs(n); out.push({ key: b, sign: 1, via: `${b} leg` }, { key: q, sign: -1, via: `${q} leg (quote)` }); }
  else if (g && g !== 'indices') out.push({ key: 'USD', sign: -1, via: 'the dollar (priced in USD)' });
  if (RISK.includes(n) && !FXG.has(g)) out.push({ key: 'RISK', sign: 1, via: 'risk appetite' });
  return out;
}

/** The card's drivers from a desk run ({ analysts, head.book.instruments, dataQuality, packBuiltAt, finishedAt, date }). */
export function cardDrivers(run, inst, { cap = 8 } = {}) {
  const n = String(inst ?? '').toUpperCase(), card = run?.head?.book?.instruments?.[n] ?? null, dir = DIRN[card?.rating] ?? 0;
  const ch = channels(n), gaps = run?.dataQuality?.gaps ?? [];
  const analysts = [];
  for (const [id, a] of Object.entries(run?.analysts ?? {})) {
    if (!a?.ok || !a.report) continue;
    const pts = [];
    for (const p of a.report.points ?? []) {
      let push = 0; const via = [];
      for (const c of ch) { const v = Number(p?.impact?.[c.key]); if (Number.isFinite(v) && v) { push += c.sign * v; via.push(c.via); } }
      if (!push) continue;
      const ev = String(p.evidence ?? ''), stale = gaps.filter(g => g.skill === id && ev && ev.toLowerCase().includes(String(g.id).toLowerCase()));
      pts.push({ claim: String(p.claim ?? ''), evidence: ev || null, push, via, side: dir ? (Math.sign(push) === dir ? 'for' : 'against') : null, staleFeeds: stale.map(g => `${g.id} (${g.status}${g.ageH != null ? `, ${Math.round(g.ageH)}h` : ''})`) });
    }
    if (!pts.length) continue;
    const net = pts.reduce((s, p) => s + p.push, 0);
    analysts.push({ id, layer: a.layer ?? null, confidence: a.report.confidence ?? null, net, points: pts.sort((x, y) => Math.abs(y.push) - Math.abs(x.push)),
      forN: pts.filter(p => p.side === 'for').length, againstN: pts.filter(p => p.side === 'against').length,
      gaps: gaps.filter(g => g.skill === id).map(g => ({ id: g.id, status: g.status, ageH: g.ageH ?? null })) });
  }
  const gross = a => a.points.reduce((s, p) => s + Math.abs(p.push), 0);
  analysts.sort((x, y) => Math.abs(y.net) - Math.abs(x.net) || gross(y) - gross(x) || x.id.localeCompare(y.id));
  const forPush = analysts.flatMap(a => a.points).filter(p => p.side === 'for').reduce((s, p) => s + Math.abs(p.push), 0);
  const againstPush = analysts.flatMap(a => a.points).filter(p => p.side === 'against').reduce((s, p) => s + Math.abs(p.push), 0);
  const moving = new Set(analysts.map(a => a.id));
  return {
    inst: n, rating: card?.rating ?? null, dir, channels: ch.map(c => c.via),
    analysts: analysts.slice(0, cap), more: Math.max(0, analysts.length - cap),
    net: analysts.reduce((s, a) => s + a.net, 0), forPush, againstPush,
    data: { packBuiltAt: run?.packBuiltAt ?? null, bookAt: run?.finishedAt ?? null, linesFor: card?.levels ? run?.date ?? null : null,
      gaps: gaps.filter(g => moving.has(g.skill)).map(g => ({ id: g.id, skill: g.skill, status: g.status, ageH: g.ageH ?? null })) },
    invalidation: card?.plan?.invalidation ?? card?.invalidation ?? null,
  };
}
