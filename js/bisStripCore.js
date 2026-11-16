/**
 * BIS heat strip, the pure part (Desk Terminal, preview). /api/bank-credit (BIS Locational Banking Statistics, cross-border bank claims, quarterly with a lag of about four months) keeps the
 * year-on-year growth of five series back to 1999 (non-bank financials from 2014) and, for 14 borrowing countries, three points (a year ago, last quarter, the latest). This turns them into a heat strip
 * (series by quarter) and a small country table, coloured against the two regime bands the bank-credit study fixed (below the low band is slow, above the high band is fast).
 *
 * It DESCRIBES credit growth. It is context only: the Evidence Book found the dollar link underpowered (bank-credit-dollar-dxy) and the Nasdaq link "context" because it rests on the 2000-02 and
 * 2008-09 busts (bank-credit-dollar-nasdaq), so nothing here says where any market goes next. No model call.
 */
export const SERIES = [
  { key: 'total', label: 'All cross-border bank claims' }, { key: 'usd', label: 'US dollar claims' }, { key: 'nbfi', label: 'Non-bank financials' },
  { key: 'caymanUsd', label: 'Cayman USD claims' }, { key: 'yenOffshore', label: 'Yen to non-Japan borrowers' },
];
/** Episodes the study's Nasdaq link rests on, as quarter ranges (inclusive), so the strip can mark them. */
export const BUSTS = [{ from: '2000-Q1', to: '2002-Q4', label: '2000-02' }, { from: '2007-Q3', to: '2009-Q4', label: '2008-09' }];
const fin = v => typeof v === 'number' && Number.isFinite(v);
const qIndex = p => { const m = /^(\d{4})-Q([1-4])$/.exec(String(p ?? '')); return m ? +m[1] * 4 + (+m[2] - 1) : null; };
export const qLabel = i => `${Math.floor(i / 4)}-Q${(i % 4) + 1}`;

/** "slow" below the low band, "fast" above the high band, "normal" between; null when there is no value. */
export function band(g, bands = { low: 2.68, high: 7.6 }) { return !fin(g) ? null : g < bands.low ? 'slow' : g > bands.high ? 'fast' : 'normal'; }
/** 0..1 strength of a colour: how far past its band the value is (a value just past the band is pale, one 10 points past is solid). */
export function strength(g, bands = { low: 2.68, high: 7.6 }) { const b = band(g, bands); return b === 'fast' ? Math.min(1, 0.35 + (g - bands.high) / 12) : b === 'slow' ? Math.min(1, 0.35 + (bands.low - g) / 12) : b === 'normal' ? 0 : null; }

/** The model for the board from a /api/bank-credit answer, or { ok:false, why }. */
export function model(j) {
  if (!j?.ok || !j.history) return { ok: false, why: j?.error ?? 'the bank-credit record is not available' };
  const bands = j.headline?.regimeBands && fin(j.headline.regimeBands.low) && fin(j.headline.regimeBands.high) ? j.headline.regimeBands : { low: 2.68, high: 7.6 };
  const idx = SERIES.flatMap(s => (j.history[s.key] ?? []).map(p => qIndex(p.period))).filter(fin);
  if (!idx.length) return { ok: false, why: 'the bank-credit history is empty' };
  const lo = Math.min(...idx), hi = Math.max(...idx), n = hi - lo + 1;
  const rows = SERIES.map(s => {
    const byQ = new Map((j.history[s.key] ?? []).map(p => [qIndex(p.period), p.g])), cells = Array.from({ length: n }, (_, i) => { const g = byQ.get(lo + i); return { q: lo + i, period: qLabel(lo + i), g: fin(g) ? g : null, band: band(g, bands), strength: strength(g, bands) }; });
    const read = cells.filter(c => c.g !== null), fast = read.filter(c => c.band === 'fast').length, slow = read.filter(c => c.band === 'slow').length, last = read.at(-1) ?? null;
    return { key: s.key, label: s.label, cells, n: read.length, first: read[0]?.period ?? null, last, fast, slow, text: `${s.label}: ${last ? `${last.g.toFixed(1)}% a year on ${last.period} (${last.band})` : 'no reading'}; fast in ${fast} of ${read.length} quarters, slow in ${slow}.` };
  });
  const countries = (j.borrowers ?? []).map(b => ({ code: b.code, name: b.name, stockBn: b.stockBn, pts: [['A year ago', b.gYearAgo], ['Last quarter', b.gPrev], [j.latest ?? 'Latest', b.g]].map(([label, g]) => ({ label, g: fin(g) ? g : null, band: band(g, bands), strength: strength(g, bands) })) }));
  return { ok: true, rows, countries, bands, lo, hi, n, latest: j.latest ?? qLabel(hi), firstSeen: j.firstSeen ?? null, line: j.line ?? null, evidence: j.evidence ?? {},
    busts: BUSTS.map(b => ({ ...b, a: qIndex(b.from) - lo, b: qIndex(b.to) - lo })).filter(b => b.b >= 0 && b.a < n), depth: `${n} quarters from ${qLabel(lo)} to ${qLabel(hi)}${rowsStart(rows)}. BIS publishes about four months after the quarter ends${j.firstSeen ? ` (the ${j.latest ?? qLabel(hi)} figures were first seen here on ${j.firstSeen})` : ''}.` };
}
const rowsStart = rows => { const late = rows.filter(r => r.first && r.first > rows[0].first); return late.length ? `; ${late.map(r => `${r.label.toLowerCase()} only from ${r.first}`).join(', ')}` : ''; };

/** Year ticks for the strip: every 5th year as { i, label }. */
export function yearTicks(m) { const out = []; for (let i = 0; i < m.n; i++) { const q = m.lo + i; if (q % 4 === 0 && Math.floor(q / 4) % 5 === 0) out.push({ i, label: String(Math.floor(q / 4)) }); } return out; }

/** The evidence words the board shows: the entries the route names, read from the Evidence Book so a changed verdict changes the chip. */
export function evidenceWords(j, book) {
  const ids = ['bank-credit-dollar-dxy', 'bank-credit-dollar-nasdaq'], what = { 'bank-credit-dollar-dxy': 'bank credit growth and the dollar', 'bank-credit-dollar-nasdaq': 'bank credit growth and the Nasdaq (rests on 2000-02 and 2008-09)' };
  return ids.map(id => { const e = (book ?? []).find(x => x.id === id); return e ? { id, verdict: String(e.verdict).toUpperCase(), what: what[id] } : null; }).filter(Boolean);
}

export function csv(m) {
  if (!m?.ok) return '';
  return [['quarter', ...m.rows.map(r => r.key)], ...Array.from({ length: m.n }, (_, i) => [qLabel(m.lo + i), ...m.rows.map(r => (r.cells[i].g === null ? '' : r.cells[i].g))])].map(r => r.join(',')).join('\n');
}
