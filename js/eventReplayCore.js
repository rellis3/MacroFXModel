/**
 * Event replay, the pure part (Desk Terminal, preview). One past release (CPI, payrolls, a Fed / ECB / BoE / BoJ decision ...) replayed minute by minute from the record Release
 * Reaction keeps (/api/release-layer1 for the list and the surprise, /api/release-layer1/paths for the one-minute path of each market around the release), over the faint paths of the
 * last five releases of the same kind. Every path is the market's move since the release minute, in % of its price at that minute (the study's own unit), and the picture divides it by
 * the market's typical 30-minute reaction to this kind of release, so a "1" is an ordinary reaction and a "3" is a large one.
 *
 * It describes SIZE and TIMING. Which way a release moves a market is not predictable from the release alone (Evidence Book: surprise-size VALIDATED for the size of the move,
 * news-asymmetry NULL for any "bad news hits harder" claim), so nothing here, and no caption, says where the next one will go. No model call, nothing is invented.
 */

/** The window of the stored record, in minutes from the release: the study keeps 30 minutes before to 240 minutes after. */
export const OFFS = [-30, 240];
export const GHOSTS = 5;
export const MIN_GHOSTS = 2;

/** The markets whose stored path is in % of price (rates and futures in other units are left out so the unit is one thing). key = the key in the path record. */
export const MARKETS = [
  { k: 'nq', label: 'Nasdaq' }, { k: 'es', label: 'S&P 500' }, { k: 'eurusd', label: 'EURUSD' }, { k: 'gbpusd', label: 'GBPUSD' }, { k: 'usdjpy', label: 'USDJPY' },
  { k: 'gold', label: 'Gold' }, { k: 'dx', label: 'Dollar index' }, { k: 'vix', label: 'VIX' }, { k: 'gilt', label: 'Gilt future' }, { k: 'bund', label: 'Bund future' },
];

/** The family the record uses -> the words a person uses. */
export const FAMILY_LABEL = { CPI: 'US CPI', NFP: 'US payrolls', FOMC: 'Fed decision', ECB: 'ECB decision', BOE: 'BoE decision', BOJ: 'BoJ decision', PCE: 'US PCE', RETAIL: 'US retail sales', GDP: 'US GDP', REFUNDING: 'Treasury refunding', UKFISCAL: 'UK budget' };
/** A sensible first market for each family (where the release lands hardest), so the window opens on something readable. */
export const FAMILY_MARKET = { CPI: 'nq', NFP: 'eurusd', FOMC: 'nq', ECB: 'eurusd', BOE: 'gbpusd', BOJ: 'usdjpy', PCE: 'nq', RETAIL: 'eurusd', GDP: 'nq', REFUNDING: 'nq', UKFISCAL: 'gbpusd' };

export const fin = v => typeof v === 'number' && Number.isFinite(v);
export const marketLabel = k => MARKETS.find(m => m.k === k)?.label ?? k;
export const familyLabel = f => FAMILY_LABEL[String(f ?? '').toUpperCase()] ?? String(f ?? 'release');

/** The printed releases of the record, newest first. `rows` are /api/release-layer1 rows; only ones with a time, a family and an id, already printed (or history). */
export function listReleases(rows, now = Date.now()) {
  return (rows ?? []).filter(r => r && r.id && r.family && Date.parse(r.t) <= now && r.status !== 'upcoming' && !r.inProgress).sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
}

/** The pick list: the most recent `n` releases across every family, as { v: id, label }. */
export function releasePicks(rows, now = Date.now(), n = 18) {
  return listReleases(rows, now).slice(0, n).map(r => ({ v: r.id, label: `${familyLabel(r.family)} · ${r.name} · ${niceDay(r.t)}` }));
}

export const niceDay = t => { const d = new Date(t); return Number.isNaN(+d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
export const hhmm = t => { const d = new Date(t); return Number.isNaN(+d) ? '' : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

/** The previous releases of the same kind, strictly before the focus (point in time: nothing from after it), newest first, at most `n`. */
export function previousSameKind(rows, focus, n = GHOSTS) {
  return listReleases(rows, Date.parse(focus.t) - 1).filter(r => r.family === focus.family).slice(0, n);
}

const median = a => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quant = (a, q) => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

/** The unit of one market for one kind of release: the median absolute 30-minute move across the releases of that kind printed by `now` (from the rows' own m30), or null when fewer than 5.
 *  `now` is passed through by a replay (Helix review 0.8), so a past day is never sized with releases that came after it. */
export function unitFor(rows, family, mkt, now = Date.now()) {
  const v = listReleases(rows, now).filter(r => r.family === family).map(r => r.M?.[mkt]?.m30).filter(fin).map(Math.abs);
  return v.length >= 5 ? median(v) : null;
}

/** The value of a stored path at `min` minutes from the release (null outside the record or on a gap). The record's first sample is OFFS[0]. */
export function valueAt(path, min) {
  const v = path?.v; if (!Array.isArray(v) || !v.length) return null;
  const step = path.step > 0 ? path.step : 1, i = Math.round((min - OFFS[0]) / step);
  return i >= 0 && i < v.length && fin(v[i]) ? v[i] : null;
}

/** All the frames: one per minute from OFFS[0] to OFFS[1]. data = { min, y (focus, in units, null where the record has a gap), ghosts: [units...], lo, med, hi (the ghosts' middle 80%) }. */
export function makeFrames(focusPath, ghostPaths, unit) {
  const u = fin(unit) && unit > 0 ? unit : null, out = [];
  for (let min = OFFS[0]; min <= OFFS[1]; min++) {
    const raw = valueAt(focusPath, min), y = u != null && raw != null ? raw / u : null;
    const g = ghostPaths.map(p => { const x = valueAt(p, min); return u != null && x != null ? x / u : null; });
    const live = g.filter(fin);
    out.push({ t: min, data: { min, y, ghosts: g, n: live.length, lo: live.length >= MIN_GHOSTS ? quant(live, 0.1) : null, med: live.length >= MIN_GHOSTS ? median(live) : null, hi: live.length >= MIN_GHOSTS ? quant(live, 0.9) : null } });
  }
  return out;
}

/** The size of the focus move at a given minute in units, and where it sits among the ghosts' absolute moves at that minute ("larger than 3 of 5"). */
export function sizeAt(frames, min) {
  const f = frames.find(x => x.t === min)?.data; if (!f || !fin(f.y)) return null;
  const g = f.ghosts.filter(fin).map(Math.abs), a = Math.abs(f.y);
  return { y: f.y, abs: a, ghosts: g.length, larger: g.filter(x => a > x).length };
}

export const fmtU = v => (fin(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}` : '–');
export const fmtPct = v => (fin(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%` : '–');
const when = m => (m === 0 ? 'at the release' : m < 0 ? `${-m} minutes before the release` : `${m} minutes after the release`);

/** One plain sentence for a frame. Size and timing only: it never says which way the next release will go. */
export function captionFor(frames, i, extra) {
  const f = frames[i]?.data; if (!f) return '';
  const lab = `${marketLabel(extra.mkt)} ${when(f.min)}`;
  if (!fin(f.y)) return `${lab}: the record has a gap here.`;
  const s = sizeAt(frames, f.min);
  let t = `${lab}: ${fmtU(f.y)} typical reactions from where it was at the release (${fmtPct(f.y * extra.unit)})`;
  if (f.min <= 0) return `${t}. Before the release the market is only moving as it usually does.`;
  if (f.lo != null && f.hi != null) t += `; the last ${f.n} releases of this kind were between ${fmtU(f.lo)} and ${fmtU(f.hi)} at this minute`;
  if (s && s.ghosts >= MIN_GHOSTS) t += `, and this move is ${s.larger === s.ghosts ? 'larger than all' : s.larger === 0 ? 'smaller than all' : `larger than ${s.larger} of`} ${s.larger === s.ghosts || s.larger === 0 ? s.ghosts : s.ghosts} of them in size`;
  return `${t}.`;
}

/** What the record can say about depth, in one honest sentence. */
export function coverageText(rows, focus, ghosts, unit, mkt) {
  const all = listReleases(rows).filter(r => r.family === focus.family), first = all.at(-1);
  const pieces = [`${all.length} ${familyLabel(focus.family)} releases are held${first ? `, the oldest ${niceDay(first.t)}` : ''}`, `the record keeps ${-OFFS[0]} minutes before to ${OFFS[1] / 60} hours after each`,
    ghosts.length >= MIN_GHOSTS ? `${ghosts.length} earlier ones are drawn as ghosts` : `only ${ghosts.length} earlier ones had a stored path, so no ghosts are drawn`];
  if (unit == null) pieces.push(`fewer than 5 releases of this kind have a 30-minute move for ${marketLabel(mkt)}, so its unit is the median of all of them`);
  return `${pieces.join('; ')}.`;
}

/** The release's own facts as short strings: the time, and actual against consensus when they are stored. */
export function facts(focus) {
  const out = [`${familyLabel(focus.family)} · ${focus.name} · ${niceDay(focus.t)} ${hhmm(focus.t)} UTC`];
  if (fin(focus.actual) || fin(focus.consensus)) out.push(`actual ${fin(focus.actual) ? focus.actual : 'n/a'} against consensus ${fin(focus.consensus) ? focus.consensus : 'n/a'}${fin(focus.surprise) ? ` (surprise ${focus.surprise > 0 ? '+' : ''}${focus.surprise})` : ''}`);
  return out;
}

/** The evidence chips, read from the Evidence Book so a changed verdict changes the chip. */
export function evidenceWords(book) {
  const want = [['surprise-size', 'the size of the move grows with the size of the surprise'], ['news-asymmetry', '"bad news hits harder" claims']];
  return want.map(([id, what]) => { const e = (book ?? []).find(x => x.id === id); return e ? { id, verdict: String(e.verdict).toUpperCase(), what } : null; }).filter(Boolean);
}

/** The picture's y bound, one fixed scale for the whole replay. */
export function yBound(frames) {
  let m = 2;
  for (const f of frames) { const d = f.data; for (const v of [d.y, d.lo, d.hi, ...(d.ghosts ?? [])]) if (fin(v)) m = Math.max(m, Math.abs(v)); }
  return Math.min(12, Math.ceil(m * 2) / 2 + 0.5);
}

/** A CSV of what is on screen: one row per minute, the focus move and each ghost, in % and in units. */
export function eventCsv(frames, extra) {
  const head = ['minute', 'focus_pct', 'focus_units', ...extra.ghostIds.map((g, i) => `ghost${i + 1}_units_${g}`), 'ghost_lo_units', 'ghost_median_units', 'ghost_hi_units'];
  const rows = frames.map(f => { const d = f.data; return [d.min, fin(d.y) ? (d.y * extra.unit).toFixed(4) : '', fin(d.y) ? d.y.toFixed(3) : '', ...d.ghosts.map(g => (fin(g) ? g.toFixed(3) : '')), fin(d.lo) ? d.lo.toFixed(3) : '', fin(d.med) ? d.med.toFixed(3) : '', fin(d.hi) ? d.hi.toFixed(3) : '']; });
  return [head, ...rows].map(r => r.join(',')).join('\n');
}

const FAMILY_WORDS = { cpi: 'CPI', inflation: 'CPI', nfp: 'NFP', payrolls: 'NFP', jobs: 'NFP', fomc: 'FOMC', fed: 'FOMC', ecb: 'ECB', boe: 'BOE', boj: 'BOJ', pce: 'PCE', retail: 'RETAIL', gdp: 'GDP' };
/** A word a person typed -> a family key the record uses, or null. */
export const familyFromWord = w => FAMILY_WORDS[String(w ?? '').toLowerCase()] ?? null;
/** A word a person typed -> a market key of the path record, or null. */
export const marketFromWord = w => {
  const t = String(w ?? '').toLowerCase(), alias = { nasdaq: 'nq', spx: 'es', sp500: 'es', spx500: 'es', dollar: 'dx', dxy: 'dx', xauusd: 'gold' };
  const k = alias[t] ?? t; return MARKETS.some(m => m.k === k) ? k : null;
};

