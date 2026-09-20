/**
 * The week, scored. Design frozen in MD files/WEEK_MAP.md.
 *
 * Three pure pieces: (1) weekly changes of a daily/weekly series and the z of
 * the latest against the series' whole history; (2) the histogram of those
 * changes with this week's bar; (3) the nearest past weeks in z-space with a
 * crowding rule, what followed them, and the placebo test that says whether
 * they carry any information. The server fetches; weekmap.html draws.
 */
const DAY = 864e5;
export const PANEL = [
  // id, label, source, kind (bp = change x100 | pt = change | pct = % change | bn = change in $bn), decimals, years of history required to join the analogue state
  { id: 'policy',  label: 'Policy',          fred: 'DFEDTARU',     kind: 'bp' },
  { id: 'us2y',    label: '2-year',          fred: 'DGS2',         kind: 'bp' },
  { id: 'us10y',   label: '10-year',         fred: 'DGS10',        kind: 'bp' },
  { id: 'us30y',   label: '30-year',         fred: 'DGS30',        kind: 'bp' },
  { id: 's2s10',   label: '2s10s',           derive: ['us10y', 'us2y'], kind: 'bp' },
  { id: 's2s30',   label: '2s30s',           derive: ['us30y', 'us2y'], kind: 'bp' },
  { id: 'real',    label: 'Real yields',     fred: 'DFII10',       kind: 'bp' },
  { id: 'bei',     label: 'Breakevens',      fred: 'T10YIE',       kind: 'bp' },
  { id: 'tp',      label: 'Term premium',    fred: 'THREEFYTP10',  kind: 'bp' },
  { id: 'dxy',     label: 'Dollar',          fred: 'DTWEXBGS',     kind: 'pct' },
  { id: 'vix',     label: 'Volatility',      fred: 'VIXCLS',       kind: 'pt' },
  { id: 'hy',      label: 'HY OAS',          fred: 'BAMLH0A0HYM2', kind: 'bp', keyed: true },
  { id: 'ig',      label: 'IG OAS',          fred: 'BAMLC0A0CM',   kind: 'bp', keyed: true },
  { id: 'cpbill',  label: 'CP less bill',    derive: ['cp', 'bill'], kind: 'bp' },
  { id: 'cp',      label: 'CP 3m',           fred: 'DCPF3M',       kind: 'bp', hidden: true },
  { id: 'bill',    label: 'Bill 3m',         fred: 'DTB3',         kind: 'bp', hidden: true },
  { id: 'credit',  label: 'Bank credit',     fred: 'TOTBKCR',      kind: 'pct' },
  { id: 'reserves', label: 'Reserves',       fred: 'WRESBAL',      kind: 'pct' },
  { id: 'rrp',     label: 'RRP',             fred: 'RRPONTSYD',    kind: 'bn' },
  { id: 'netliq',  label: 'Net liquidity',   derive3: ['walcl', 'tga', 'rrp'], kind: 'bn' },
  { id: 'walcl',   label: 'Fed balance sheet', fred: 'WALCL',      kind: 'bn', hidden: true, scale: 1 / 1000 },
  { id: 'tga',     label: 'Treasury account', fred: 'WTREGEN',     kind: 'bn', hidden: true, scale: 1 / 1000 },
  { id: 'plumb',   label: 'Plumbing',        derive: ['sofr', 'iorb'], kind: 'bp', short: true },
  { id: 'sofr',    label: 'SOFR',            fred: 'SOFR',         kind: 'bp', hidden: true },
  { id: 'iorb',    label: 'IORB',            fred: 'IORB',         kind: 'bp', hidden: true },
  { id: 'oil',     label: 'Oil',             fred: 'DCOILWTICO',   kind: 'pct' },
  { id: 'gold',    label: 'Gold',            oanda: 'XAU_USD',     kind: 'pct' },
  { id: 'cugold',  label: 'Copper / gold',   ratio: ['copper', 'gold'], kind: 'pct' },
  { id: 'copper',  label: 'Copper',          oanda: 'XCU_USD',     kind: 'pct', hidden: true },
  { id: 'spx',     label: 'S&P 500',         oanda: 'SPX500_USD',  kind: 'pct' },
  { id: 'eurusd',  label: 'EUR/USD',         oanda: 'EUR_USD',     kind: 'pct' },
];
export const TARGETS = ['spx', 'eurusd', 'gold', 'us10y'];
export const HORIZONS = [4, 13, 26];
export const MIN_YEARS_FOR_STATE = 10;

// ── weekly values: the last observation on or before each Friday ──
export function fridays(fromMs, toMs) {
  const out = []; const d = new Date(toMs); d.setUTCHours(0, 0, 0, 0);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  for (let t = d.getTime(); t >= fromMs; t -= 7 * DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out.reverse();
}
export function weekly(obs, fris) {
  const rows = (obs ?? []).filter(o => o && Number.isFinite(o.value)).sort((a, b) => a.date < b.date ? -1 : 1);
  const out = []; let i = 0, last = null;
  for (const f of fris) { while (i < rows.length && rows[i].date <= f) { last = rows[i]; i++; } out.push(last && (Date.parse(f) - Date.parse(last.date)) <= 10 * DAY ? last.value : null); }
  return out;
}
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const sd = a => { const m = mean(a); return a.length > 2 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : null; };
export const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

// weekly changes in the series' unit
export function changes(vals, kind, scale = 1) {
  return vals.map((v, i) => { const p = vals[i - 1]; if (v == null || p == null) return null; if (kind === 'pct') return p ? (v / p - 1) * 100 : null; if (kind === 'bp') return (v - p) * 100; return (v - p) * scale; });
}
// z of each week's change against all changes up to and including it (walk-forward), plus the full-history z
export function zSeries(ch) {
  const out = new Array(ch.length).fill(null); const hist = [];
  for (let i = 0; i < ch.length; i++) { if (ch[i] == null) continue; hist.push(ch[i]); if (hist.length >= 52) { const m = mean(hist), s = sd(hist); out[i] = s ? (ch[i] - m) / s : null; } }
  return out;
}
export function zWord(z) { const a = Math.abs(z ?? 0); return z == null ? 'no read' : a < 1 ? 'ordinary' : a < 2 ? 'notable' : a < 3 ? 'unusual' : 'rare'; }
export function histogram(ch, bins = 41, span = 3.5) {
  const v = ch.filter(x => x != null); const m = mean(v), s = sd(v); if (!s) return null;
  const counts = new Array(bins).fill(0); for (const x of v) { const z = (x - m) / s; const b = Math.max(0, Math.min(bins - 1, Math.floor((z + span) / (2 * span) * bins))); counts[b]++; }
  return { counts, mean: m, sd: s, span, n: v.length };
}

// ── analogues ──
// state[t] = array of z over the state series (null where missing); a week is a
// candidate when every state z is present. Distance is Euclidean.
export function analogues(states, t, { k = 10, crowd = 8, dims = null, maxIdx = null } = {}) {
  const cur = states[t]; if (!cur || cur.some(x => x == null)) return [];
  const useDims = dims ?? cur.map((_, i) => i);
  const cand = []; const lim = maxIdx ?? t;
  for (let i = 0; i < lim; i++) { const s = states[i]; if (!s || useDims.some(d => s[d] == null)) continue; let dd = 0; for (const d of useDims) dd += (s[d] - cur[d]) ** 2; cand.push({ i, d: Math.sqrt(dd) }); }
  cand.sort((a, b) => a.d - b.d || b.i - a.i);   // ties: the more recent first
  const chosen = [];
  for (const c of cand) { if (chosen.some(x => Math.abs(x.i - c.i) < crowd)) continue; chosen.push(c); if (chosen.length >= k) break; }
  return chosen;
}
// forward change of a target over h weeks from index i (in the target's unit)
export function forward(vals, kind, i, h) { const a = vals[i], b = vals[i + h]; if (a == null || b == null) return null; return kind === 'pct' ? (b / a - 1) * 100 : (b - a) * 100; }

// ── W1: the placebo test, walk-forward ──
export function placeboTest(states, targets, { weeks = 400, h = 13, k = 10, crowd = 8, reps = 200, seed = 20260920, minHist = 260 } = {}) {
  let a = seed; const rnd = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = states.length; const from = Math.max(minHist, n - h - weeks), to = n - h;
  const out = {};
  for (const [name, { vals, kind }] of Object.entries(targets)) {
    let hits = 0, tot = 0, uncondHits = 0, errA = [], errU = []; const plac = new Array(reps).fill(0); let placTot = 0;
    for (let t = from; t < to; t++) {
      const actual = forward(vals, kind, t, h); if (actual == null) continue;
      const an = analogues(states, t, { k, crowd, maxIdx: t - h });   // analogues whose outcome was known at t
      if (an.length < k) continue;
      const fw = an.map(x => forward(vals, kind, x.i, h)).filter(x => x != null); if (fw.length < k / 2) continue;
      const call = median(fw); const uncond = median(Array.from({ length: t - h }, (_, i) => forward(vals, kind, i, h)).filter(x => x != null));
      tot++; if (Math.sign(call) === Math.sign(actual)) hits++; if (Math.sign(uncond) === Math.sign(actual)) uncondHits++;
      errA.push(Math.abs(actual - call)); errU.push(Math.abs(actual - uncond));
      // placebo: ten random past weeks with the same crowding rule
      placTot++;
      for (let r = 0; r < reps; r++) { const pick = []; let guard = 0; while (pick.length < k && guard++ < 200) { const i = Math.floor(rnd() * (t - h)); if (states[i] && !pick.some(x => Math.abs(x - i) < crowd)) pick.push(i); } const pf = pick.map(i => forward(vals, kind, i, h)).filter(x => x != null); if (pf.length && Math.sign(median(pf)) === Math.sign(actual)) plac[r]++; }
    }
    const placRates = plac.map(x => placTot ? x / placTot : null).filter(x => x != null).sort((x, y) => x - y);
    out[name] = { n: tot, hitRate: tot ? +(hits / tot).toFixed(3) : null, unconditional: tot ? +(uncondHits / tot).toFixed(3) : null, placebo: placRates.length ? { p50: +placRates[Math.floor(placRates.length / 2)].toFixed(3), p95: +placRates[Math.floor(placRates.length * 0.95)].toFixed(3), p05: +placRates[Math.floor(placRates.length * 0.05)].toFixed(3) } : null, medErrAnalogue: errA.length ? +median(errA).toFixed(3) : null, medErrUnconditional: errU.length ? +median(errU).toFixed(3) : null };
    out[name].verdict = out[name].n < 100 ? 'insufficient' : (out[name].hitRate > out[name].placebo.p95 && out[name].medErrAnalogue < out[name].medErrUnconditional) ? 'PASS' : 'NULL';
  }
  return out;
}
