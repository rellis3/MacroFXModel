/**
 * OI drills, the pure part (Desk Terminal, preview). Click a level of the OI terrain (the biggest call strike, the biggest put strike, max pain, the gamma flip) and see its history from the
 * stored option-OI captures (/api/replay/oi-days): how many days it has held, how its open interest changed, how far price was from it each day in average daily ranges, and on how many
 * days price traded through it. The archive keeps only the 8 biggest strikes per side and the primary expiry, so a strike that left the top 8 is "below the top 8", never zero.
 *
 * Futures option strikes are shifted onto the CFD price scale by a basis that changes day to day, so a strike is matched across days by its place on that day's own strike grid, not by its
 * price. It DESCRIBES where a level was and what price did against it. The Evidence Book found walls are no better than a mirrored placebo (wall-placebo NULL) and max pain no target, so nothing
 * here says price is drawn to a level or where it will go. No model call.
 */
const fin = v => typeof v === 'number' && Number.isFinite(v);
const median = a => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export const TARGETS = [
  { id: 'callwall', label: 'Biggest call strike', side: 'calls', what: 'the strike with the most call open interest' },
  { id: 'putwall', label: 'Biggest put strike', side: 'puts', what: 'the strike with the most put open interest' },
  { id: 'maxpain', label: 'Max pain', what: 'the price where option buyers lose the most at expiry' },
  { id: 'gammaflip', label: 'Gamma flip', what: 'the price where dealer gamma changes sign' },
];
export const targetById = id => TARGETS.find(t => t.id === id) ?? null;
/** A word a person typed -> a target id, or null. */
export const targetFromWord = w => { const t = String(w ?? '').toLowerCase().replace(/[^a-z]/g, ''); return { call: 'callwall', callwall: 'callwall', calls: 'callwall', put: 'putwall', putwall: 'putwall', puts: 'putwall', maxpain: 'maxpain', pain: 'maxpain', gamma: 'gammaflip', gammaflip: 'gammaflip', flip: 'gammaflip' }[t] ?? null; };

/** The spacing of the strike grid: the smallest gap between two strikes of the same day that occurs often enough to be the grid (at least 3% of all gaps and 3 times), null when none does. */
export function gridStep(days) {
  const c = new Map(); let tot = 0;
  for (const d of days ?? []) {
    const ks = [...new Set([...(d.calls ?? []), ...(d.puts ?? [])].map(x => x.k).filter(fin))].sort((a, b) => a - b);
    for (let i = 1; i < ks.length; i++) { const g = +(ks[i] - ks[i - 1]).toPrecision(6); if (g > 0) { c.set(g, (c.get(g) ?? 0) + 1); tot++; } }
  }
  const need = Math.max(3, tot * 0.03), ok = [...c.entries()].filter(([, n]) => n >= need).map(([g]) => g).sort((x, y) => x - y);
  return ok.length ? ok[0] : null;
}
/** The day's candidate offsets on the grid (its basis), busiest first: remainders of its strikes, grouped; a few weekly strikes sit between the main grid, so the busiest group may be the wrong one. */
export function offsetCandidates(day, step, keep = 3) {
  const r = [...(day.calls ?? []), ...(day.puts ?? [])].map(x => x.k).filter(fin).map(k => k - Math.floor(k / step) * step);
  if (!r.length) return [0];
  const bins = 50, w = step / bins, cnt = new Array(bins).fill(0), at = v => Math.min(bins - 1, Math.floor(v / w));
  for (const v of r) cnt[at(v)]++;
  const order = Array.from({ length: bins }, (_, i) => i).sort((x, y) => (cnt[y] + cnt[(y + 1) % bins]) - (cnt[x] + cnt[(x + 1) % bins]) || x - y), out = [];
  for (const i of order) {
    if (out.length >= keep || !cnt[i] && !cnt[(i + 1) % bins]) break;
    const j = (i + 1) % bins, vals = r.filter(v => at(v) === i || at(v) === j), ref = vals[0];
    const c = median(vals.map(v => { let d = v - ref; if (d > step / 2) d -= step; if (d < -step / 2) d += step; return ref + d; }));
    if (!out.some(o => Math.abs(((o - c + step * 1.5) % step) - step / 2) < w * 2.5)) out.push(c);   // skip a group that is the same place as one already taken
  }
  return out.length ? out : [0];
}
/** The best single offset of a day (the busiest group). */
export const offsetOf = (day, step) => offsetCandidates(day, step, 1)[0];
const circ = (a, b, step) => { const d = Math.abs(a - b) % step; return Math.min(d, step - d); };
/** One offset per day, chosen so the basis drifts smoothly: each day takes the candidate nearest to the previous day's offset. */
export function offsetSeries(days, step) {
  const out = []; let prev = null;
  for (const d of days) { const c = offsetCandidates(d, step); const pick = prev == null ? c[0] : c.reduce((b, x) => (circ(x, prev, step) < circ(b, prev, step) ? x : b), c[0]); out.push(pick); prev = pick; }
  return out;
}
const idOf = (k, off, step) => Math.round((k - off) / step);

/** Average daily range (high minus low) of the `n` sessions before day index i, from the payload's own candles; null with fewer than 5. */
export function adrBefore(days, i, n = 20) {
  const r = days.slice(Math.max(0, i - n), i).map(d => (fin(d.px?.h) && fin(d.px?.l) ? d.px.h - d.px.l : null)).filter(fin);
  return r.length >= 5 ? r.reduce((a, b) => a + b, 0) / r.length : null;
}

/** The history of one target over the days held (oldest first): level, open interest, rank, distance from that day's close, and whether price traded through it. */
export function drill(days, targetId, { last = 30 } = {}) {
  const ds = (days ?? []).filter(d => d && d.date).sort((a, b) => (a.date < b.date ? -1 : 1)), t = targetById(targetId);
  if (!t || ds.length < 3) return { ok: false, why: ds.length ? 'Too few stored captures to follow a level yet.' : 'No stored option-OI captures were found for this market.' };
  const step = gridStep(ds), isStrike = !!t.side;
  if (isStrike && !step) return { ok: false, why: 'The strike grid could not be worked out from the stored captures.' };
  const offs = isStrike ? offsetSeries(ds, step) : [], anchorDay = ds.at(-1), near = (d, x) => { const ref = d.px?.c ?? d.spot; return !fin(ref) || Math.abs(x.k / ref - 1) <= 0.6; };   // strikes far from price (the archive holds a few at 0 and 2000 on the S&P) are not walls
  let anchorId = null, anchorLevel = null;
  if (isStrike) { const top = [...(anchorDay[t.side] ?? [])].filter(x => near(anchorDay, x)).sort((a, b) => b.oi - a.oi)[0]; if (!top) return { ok: false, why: `The latest capture has no ${t.side} ladder.` }; anchorId = idOf(top.k, offs.at(-1), step); anchorLevel = top.k; }
  else { anchorLevel = anchorDay[t.id === 'maxpain' ? 'maxPain' : 'gammaFlip']; if (!fin(anchorLevel)) return { ok: false, why: `The latest capture has no ${t.label.toLowerCase()}.` }; }
  const rows = ds.map((d, i) => {
    const adr = adrBefore(ds, i), c = d.px?.c, h = d.px?.h, l = d.px?.l;
    let level = null, oi = null, rank = null, top = false, inLadder = null;
    if (isStrike) {
      const ladder = [...(d[t.side] ?? [])].filter(x => near(d, x)).sort((a, b) => b.oi - a.oi), at = ladder.findIndex(x => idOf(x.k, offs[i], step) === anchorId);
      level = anchorId * step + offs[i]; inLadder = at >= 0; if (inLadder) { oi = ladder[at].oi; rank = at + 1; top = at === 0; }
    } else level = d[t.id === 'maxpain' ? 'maxPain' : 'gammaFlip'];
    const dist = fin(level) && fin(c) && adr ? (level - c) / adr : null, through = fin(level) && fin(h) && fin(l) ? l <= level && level <= h : null;
    return { date: d.date, level: fin(level) ? level : null, oi, rank, top, inLadder, close: fin(c) ? c : null, dist, through, regime: d.regime ?? null, dte: d.dte ?? null };
  });
  const tail = rows.slice(-last), heldDays = (() => { let n = 0; for (let i = rows.length - 1; i >= 0 && (isStrike ? rows[i].top : true); i--) n++; return isStrike ? n : null; })();
  const inTop = isStrike ? tail.filter(r => r.inLadder).length : null, oiNow = rows.at(-1).oi, oi5 = rows.at(-6)?.oi ?? null;
  const closeBy = tail.filter(r => fin(r.dist) && Math.abs(r.dist) <= 0.5).length, thr = tail.filter(r => r.through === true).length, withPx = tail.filter(r => r.through !== null).length;
  const firstSeen = isStrike ? (rows.find(r => r.inLadder)?.date ?? null) : null;
  return { ok: true, target: t, rows: tail, all: rows.length, step, anchorLevel, summary: { heldDays, inTop, window: tail.length, oiNow, oi5, oiChange: fin(oiNow) && fin(oi5) ? oiNow - oi5 : null, near: closeBy, thr, withPx, firstSeen, from: ds[0].date, to: ds.at(-1).date, captures: ds.length } };
}

const f0 = v => (fin(v) ? Math.round(v).toLocaleString('en-GB') : '–');
export const fmtLevel = (v, dp = 1) => (fin(v) ? Number(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '–');
export const fmtAdr = v => (fin(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}` : '–');

/** The plain-words summary of a drill: what we can say about the level and what we cannot. */
export function words(m, label, dp = 1) {
  if (!m.ok) return m.why;
  const s = m.summary, t = m.target, lv = fmtLevel(m.anchorLevel, dp), out = [];
  if (t.side) {
    out.push(`The ${t.label.toLowerCase()} in the latest capture is ${lv} (${t.what}). It has been the biggest ${t.side === 'calls' ? 'call' : 'put'} strike for ${s.heldDays} straight capture${s.heldDays === 1 ? '' : 's'}, and in the top 8 on ${s.inTop} of the last ${s.window}.`);
    if (fin(s.oiChange)) out.push(`Its open interest is ${f0(s.oiNow)} contracts, ${s.oiChange >= 0 ? 'up' : 'down'} ${f0(Math.abs(s.oiChange))} on five captures ago.`);
    else if (fin(s.oiNow)) out.push(`Its open interest is ${f0(s.oiNow)} contracts; five captures ago it was below the top 8 or not yet held.`);
  } else out.push(`${t.label} in the latest capture is ${lv} (${t.what}), and it has been followed over the last ${s.window} captures.`);
  if (s.withPx) out.push(`Price traded through ${t.side ? 'it' : 'that level'} on ${s.thr} of ${s.withPx} sessions, and closed within half an average daily range of it on ${s.near}.`);
  out.push(`${label ? `${label}: ` : ''}${s.captures} captures held, from ${s.from}.${t.side ? ' The archive keeps only the 8 biggest strikes per side, so "below the top 8" is not zero.' : ''}`);
  return out.join(' ');
}

/** The evidence chips from the Evidence Book. */
export function evidenceWords(book) {
  const want = [['wall-placebo', 'walls against a mirrored placebo'], ['oi-max-pain', 'max pain'], ['gex-range-es', 'gamma and the size of the day (S&P)']];
  return want.map(([id, what]) => { const e = (book ?? []).find(x => x.id === id); return e ? { id, verdict: String(e.verdict).toUpperCase(), what } : null; }).filter(Boolean);
}

/** CSV of the drill rows. */
export function drillCsv(m) {
  if (!m?.ok) return '';
  return [['date', 'level', 'oi', 'rank_in_top8', 'close', 'distance_adr', 'traded_through'], ...m.rows.map(r => [r.date, fin(r.level) ? r.level.toFixed(2) : '', r.oi ?? '', r.rank ?? '', r.close ?? '', fin(r.dist) ? r.dist.toFixed(3) : '', r.through === null ? '' : r.through ? 1 : 0])].map(r => r.join(',')).join('\n');
}
