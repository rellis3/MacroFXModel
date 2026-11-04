/**
 * Transmission statistics on the Chain (owner, 2026-11-04, build list item 3).
 *
 * The chain (js/macroChain.js) judges each link holding / broken / quiet from the 1/5/20-day moves at its two ends.
 * This file adds, per link, from the daily history of both ends:
 *   - the rolling 20/60/120-day correlation of daily changes, and each one's 2-year average;
 *   - lead/lag: the cross-correlation at lags -5..+5 days, with its sample size and a band corrected for the ten
 *     non-zero lags looked at, so one lag poking out by chance is not called a lead;
 *   - a divergence z: the downstream end's move over 1, 5 and 20 days against what the upstream end's move and the
 *     rolling beta (fitted on the 120 days BEFORE the window) imply, in standard deviations of the residual;
 *   - strengthening / weakening / breaking down, from the change in the 60-day correlation;
 *   - a plain-English line when |z| >= 2.
 *
 * CONTEXT, NOT A SIGNAL. It describes what is coupled or broken now. It is not a forecast: yields -> FX forward
 * coupling is a banked null here (js/deskEvidence.js, project_yield_asset_coupling), and none of these links is a
 * validated forward signal. It is never fed to the desk as an impact; the desk alerts read the divergence events
 * only as "this link is unusual today".
 *
 * Honesty notes carried in the payload: the ends close at different times (FRED US close, OANDA 17:00 New York,
 * Yahoo US close), so a lag of +/-1 day can be an artefact of the clocks; the k-day residual SD assumes daily
 * residuals are independent (sigma * sqrt(k)).
 *
 * Pure: no fetch, no clock. Tested in js/chainStats.test.mjs.
 */

export const STATS_DEFAULTS = { windows: [20, 60, 120], avgDays: 504, maxLag: 5, lagDays: 504, fitDays: 120, divWindows: [1, 5, 20], trendGap: 20, trendDelta: 0.2, zLine: 2, zAlert: 2.5 };

const fin = Number.isFinite;
const r3 = x => (fin(x) ? +x.toFixed(3) : null);
const r2 = x => (fin(x) ? +x.toFixed(2) : null);

/** Two ascending [{date, value}] series → their levels on the dates both carry. */
export function alignLevels(a = [], b = []) {
  const m = new Map();
  for (const p of a ?? []) if (p && fin(p.value)) m.set(p.date, p.value);
  const dates = [], x = [], y = [];
  for (const p of b ?? []) if (p && fin(p.value) && m.has(p.date)) { dates.push(p.date); x.push(m.get(p.date)); y.push(p.value); }
  const idx = dates.map((_, i) => i).sort((i, j) => (dates[i] < dates[j] ? -1 : dates[i] > dates[j] ? 1 : 0));
  return { dates: idx.map(i => dates[i]), x: idx.map(i => x[i]), y: idx.map(i => y[i]) };
}

/** Daily change of a level series in the node's unit: pct = log return x100, bp = difference x100 (a %-quoted rate), anything else = difference. */
export function changesOf(levels, unit) {
  const out = [];
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i - 1], b = levels[i];
    out.push(unit === 'pct' ? (a > 0 && b > 0 ? Math.log(b / a) * 100 : NaN) : unit === 'bp' ? (b - a) * 100 : b - a);
  }
  return out;
}

/** The two ends' daily changes on common dates: { dates (the change's end date), x (upstream), y (downstream) }. */
export function alignedChanges(fromSeries, toSeries, fromUnit, toUnit) {
  const L = alignLevels(fromSeries, toSeries), x = changesOf(L.x, fromUnit), y = changesOf(L.y, toUnit), dates = L.dates.slice(1);
  const keep = x.map((v, i) => fin(v) && fin(y[i]));
  return { dates: dates.filter((_, i) => keep[i]), x: x.filter((_, i) => keep[i]), y: y.filter((_, i) => keep[i]), levels: L };
}

/** Pearson correlation; null with fewer than 3 points or no variance. */
export function corr(x, y) {
  const n = Math.min(x.length, y.length); if (n < 3) return null;
  let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n; let cxy = 0, cxx = 0, cyy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; cxy += a * b; cxx += a * a; cyy += b * b; }
  return cxx > 0 && cyy > 0 ? cxy / Math.sqrt(cxx * cyy) : null;
}

/** Rolling correlation over `w` points; entry i covers points i-w+1..i (null before there are w). */
export function rollingCorr(x, y, w) {
  const out = new Array(x.length).fill(null);
  for (let i = w - 1; i < x.length; i++) out[i] = corr(x.slice(i - w + 1, i + 1), y.slice(i - w + 1, i + 1));
  return out;
}

const mean = a => { const v = a.filter(fin); return v.length ? v.reduce((s, q) => s + q, 0) / v.length : null; };

/**
 * Cross-correlation of x and y at lags -maxLag..+maxLag. Lag k > 0 pairs x on day t with y on day t+k: the UPSTREAM
 * end (x) leads by k days. Lag k < 0: the downstream end leads. Each lag carries its own sample size.
 */
export function crossCorr(x, y, maxLag = 5) {
  const out = [];
  for (let k = -maxLag; k <= maxLag; k++) {
    const a = [], b = [];
    for (let t = 0; t < x.length; t++) { const u = t + k; if (u < 0 || u >= y.length) continue; a.push(x[t]); b.push(y[u]); }
    out.push({ lag: k, r: r3(corr(a, b)), n: a.length });
  }
  return out;
}

// two-sided normal critical values (Bonferroni over the non-zero lags looked at)
const Z_CRIT = { 1: 1.96, 2: 2.24, 4: 2.5, 6: 2.64, 8: 2.73, 10: 2.81, 12: 2.87 };
const zCrit = m => Z_CRIT[m] ?? (m > 12 ? 2.95 : 1.96);

/**
 * Which end leads, honestly. A non-zero lag counts only if |r| clears zCrit(2*maxLag)/sqrt(n) (about 2.8/sqrt(n) for
 * ten lags at 5%), so the chance one of the ten pokes out by luck stays near 5% rather than ~40%.
 * Returns { lags, n, band, lag0, best, verdict, text }.
 */
export function leadLag(x, y, { maxLag = 5 } = {}) {
  const lags = crossCorr(x, y, maxLag), n = lags.find(l => l.lag === 0)?.n ?? 0;
  if (n < 30) return { lags, n, band: null, lag0: null, best: null, verdict: 'too short', text: `only ${n} common days: too short to say which end leads` };
  const band = r3(zCrit(2 * maxLag) / Math.sqrt(n)), band0 = r3(1.96 / Math.sqrt(n));
  const lag0 = lags.find(l => l.lag === 0);
  const nz = lags.filter(l => l.lag !== 0 && fin(l.r)).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const best = nz[0] ?? null, sig = best && Math.abs(best.r) >= band;
  const same = fin(lag0?.r) && Math.abs(lag0.r) >= band0;
  let verdict, text;
  if (sig) {
    const up = best.lag > 0, k = Math.abs(best.lag);
    verdict = up ? 'upstream leads' : 'downstream leads';
    text = `${up ? 'the upstream end' : 'the downstream end'} leads by ${k} day${k === 1 ? '' : 's'} (r ${best.r > 0 ? '+' : ''}${best.r} at lag ${best.lag > 0 ? '+' : ''}${best.lag}, band ±${band} for ten lags, n ${best.n})`
      + (k === 1 ? '; a one-day lag can be the two ends closing at different times' : '');
  } else if (same) { verdict = 'same day'; text = `they move together on the same day (r ${lag0.r > 0 ? '+' : ''}${lag0.r}, n ${n}); no lag clears the ±${band} band, so neither end leads`; }
  else { verdict = 'no clear link'; text = `no lag, including the same day, clears its band (n ${n}): the daily changes are barely coupled`; }
  return { lags, n, band, band0, lag0: lag0?.r ?? null, best, verdict, text };
}

/** Ordinary least squares y = a + b x; residual SD with n-2 degrees of freedom. */
export function ols(x, y) {
  const n = Math.min(x.length, y.length); if (n < 10) return null;
  const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n)); let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  if (!(sxx > 0)) return null;
  const b = sxy / sxx, a = my - b * mx; let ss = 0;
  for (let i = 0; i < n; i++) ss += (y[i] - a - b * x[i]) ** 2;
  return { alpha: a, beta: b, sd: Math.sqrt(ss / (n - 2)), n };
}

/**
 * The divergence over the last `win` days: the downstream move against beta * the upstream move, with beta and the
 * residual sd fitted (with an intercept) on the `fitDays` daily changes BEFORE the window (no overlap: the window cannot
 * explain itself). The intercept is NOT carried into the window: it is the fit period's drift, and extrapolating a
 * trend would call every reversal a divergence. z = (actual - implied) / (sd * sqrt(win)).
 */
export function divergence(x, y, { win = 20, fitDays = 120 } = {}) {
  const n = x.length; if (n < win + Math.min(60, fitDays)) return null;
  const end = n, start = n - win, fit = ols(x.slice(Math.max(0, start - fitDays), start), y.slice(Math.max(0, start - fitDays), start));
  if (!fit || !(fit.sd > 0)) return null;
  let X = 0, Y = 0; for (let i = start; i < end; i++) { X += x[i]; Y += y[i]; }
  const implied = fit.beta * X, z = (Y - implied) / (fit.sd * Math.sqrt(win));
  return { win, fromMove: X, toMove: Y, implied, z: r2(z), beta: r3(fit.beta), residSd: fit.sd * Math.sqrt(win), fitN: fit.n };
}

/**
 * The trend word from the 60-day correlation, read in the textbook's direction (sign * corr, so higher = more coupled
 * the textbook way): breaking down = the link usually holds (2-year average >= 0.15) and is now 0.3 or more below its
 * average and under 0.1; otherwise strengthening / weakening = a move of `delta` or more against `gap` days ago.
 */
export function trendWord(now, then, avg2y, sign = 1, { delta = 0.2 } = {}) {
  if (!fin(now)) return { word: 'unknown', d: null };
  const s = now * sign, s0 = fin(then) ? then * sign : null, a = fin(avg2y) ? avg2y * sign : null, d = s0 == null ? null : s - s0;
  if (a != null && a >= 0.15 && s < a - 0.3 && s < 0.1) return { word: 'breaking down', d: r2(d) };
  if (d != null && d >= delta) return { word: 'strengthening', d: r2(d) };
  if (d != null && d <= -delta) return { word: 'weakening', d: r2(d) };
  return { word: 'steady', d: r2(d) };
}

const unitText = (v, unit, dp) => {
  if (!fin(v)) return '?';
  const a = Math.abs(v), d = dp ?? (unit === 'pct' ? (a >= 10 ? 0 : 1) : unit === 'bp' ? 0 : 1);
  return unit === 'pct' ? `${a.toFixed(d)}%` : unit === 'bp' ? `${a.toFixed(d)}bp` : unit === 'usd' ? `$${a.toFixed(d)}` : `${a.toFixed(d)} pt`;
};
const verb = (v, unit) => (v > 0 ? `up ${unitText(v, unit)}` : v < 0 ? `down ${unitText(v, unit)}` : 'flat');
const moveVerb = (v, unit) => (v > 0 ? `rose ${unitText(v, unit)}` : v < 0 ? `fell ${unitText(v, unit)}` : 'did not move');
const signed = (v, unit) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${unitText(v, unit)}`;
/** % log-change back to a simple % for wording (a 20% log move is 22% simple). */
const simplePct = (v, unit) => (unit === 'pct' && fin(v) ? (Math.exp(v / 100) - 1) * 100 : v);

/**
 * "US real yields up 25bp in 20 days, but gold rose 1.2% where the usual link implies -3.0%: 2.3σ away from the usual link."
 * from/to: { label, unit }.
 */
const lowerFirst = s => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);   // "Gold" -> "gold", "US 10Y yield" kept
export function divergenceLine(d, from, to0) {
  if (!d || !fin(d.z)) return null;
  const to = { ...to0, label: lowerFirst(String(to0.label ?? '')) };
  const k = d.win, X = simplePct(d.fromMove, from.unit), Y = simplePct(d.toMove, to.unit), I = simplePct(d.implied, to.unit);
  const days = `${k} day${k === 1 ? '' : 's'}`;
  const tiny = Math.abs(Y) < 0.25 * Math.abs(I);
  let clause;
  if (Math.sign(Y) !== Math.sign(I) && !tiny) clause = `but ${to.label} ${moveVerb(Y, to.unit)} where the usual link implies ${signed(I, to.unit)}`;
  else if (tiny) clause = `but ${to.label} barely moved (${signed(Y, to.unit)}) where the usual link implies ${signed(I, to.unit)}`;
  else if (Math.abs(Y) < Math.abs(I)) clause = `but ${to.label} ${moveVerb(Y, to.unit)}, short of the ${signed(I, to.unit)} the usual link implies`;
  else clause = `and ${to.label} ${moveVerb(Y, to.unit)}, more than the ${signed(I, to.unit)} the usual link implies`;
  return `${from.label} ${verb(X, from.unit)} in ${days}, ${clause}: ${Math.abs(d.z).toFixed(1)}σ away from the usual link.`;
}

/**
 * Every statistic for one link. fromSeries / toSeries: ascending [{date, value}] levels; from / to: { label, unit }.
 */
export function linkStats(fromSeries, toSeries, from, to, sign = 1, o = STATS_DEFAULTS) {
  const A = alignedChanges(fromSeries, toSeries, from.unit, to.unit), n = A.x.length;
  if (n < 70) return { ok: false, n, why: `only ${n} common daily changes (needs 70)` };
  const asOf = A.dates.at(-1), corrs = {};
  for (const w of o.windows) {
    const rc = rollingCorr(A.x.slice(-(o.avgDays + o.trendGap + w)), A.y.slice(-(o.avgDays + o.trendGap + w)), w);
    const now = rc.at(-1), then = rc.length > o.trendGap ? rc.at(-1 - o.trendGap) : null, tail = rc.slice(-o.avgDays).filter(fin);
    corrs[w] = { now: r3(now), then: r3(then), avg2y: tail.length >= Math.min(250, o.avgDays / 2) ? r3(mean(tail)) : null, avgN: tail.length };
  }
  const xs = A.x.slice(-o.lagDays), ys = A.y.slice(-o.lagDays);
  const ll = leadLag(xs, ys, { maxLag: o.maxLag });
  const trend = trendWord(corrs[60]?.now, corrs[60]?.then, corrs[60]?.avg2y, sign, { delta: o.trendDelta });
  const div = {};
  for (const w of o.divWindows) { const d = divergence(A.x, A.y, { win: w, fitDays: o.fitDays }); if (d) div[w] = { ...d, fromMove: r3(simplePct(d.fromMove, from.unit)), toMove: r3(simplePct(d.toMove, to.unit)), implied: r3(simplePct(d.implied, to.unit)), residSd: r3(d.residSd) }; }
  const headline = Object.values(div).filter(d => fin(d.z)).sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || b.win - a.win)[0] ?? null;
  const raw = headline ? divergence(A.x, A.y, { win: headline.win, fitDays: o.fitDays }) : null;
  const line = headline && Math.abs(headline.z) >= o.zLine ? divergenceLine(raw, from, to) : null;
  const textbookSign = fin(corrs[120]?.avg2y) ? (Math.sign(corrs[120].avg2y) === Math.sign(sign) ? 'holds on average' : 'reversed on average') : null;
  return { ok: true, asOf, n, corr: corrs, leadLag: { verdict: ll.verdict, text: ll.text, n: ll.n, band: ll.band, lag0: ll.lag0, best: ll.best, lags: ll.lags },
    trend: trend.word, trendDelta: trend.d, divergence: div, z: headline?.z ?? null, zWin: headline?.win ?? null, line, textbookSign };
}

/**
 * The whole board. series: { node: [{date, value}] }; links: CHAIN_LINKS-like [{ id, short, from, to, sign }];
 * nodes: CHAIN_NODES-like { node: { label, unit } }. Returns { links: { id: stats }, breaking: [...], divergences: [...] }.
 */
export function buildChainStats({ series = {}, links = [], nodes = {}, o = STATS_DEFAULTS } = {}) {
  const out = {}, missing = [];
  for (const l of links) {
    const A = nodes[l.from], B = nodes[l.to];
    if (!A || !B) continue;
    if (!series[l.from]?.length || !series[l.to]?.length) { out[l.id] = { ok: false, why: `no daily history for ${!series[l.from]?.length ? A.label : B.label}` }; missing.push(l.id); continue; }
    out[l.id] = { ...linkStats(series[l.from], series[l.to], { label: A.label, unit: A.unit }, { label: B.label, unit: B.unit }, l.sign, o), short: l.short ?? l.id, from: l.from, to: l.to, sign: l.sign, fromUnit: A.unit, toUnit: B.unit };
  }
  const ok = Object.entries(out).filter(([, s]) => s.ok);
  const breaking = ok.filter(([, s]) => s.trend === 'breaking down' || s.trend === 'weakening')
    .sort((a, b) => (a[1].trend === 'breaking down' ? 0 : 1) - (b[1].trend === 'breaking down' ? 0 : 1) || (a[1].trendDelta ?? 0) - (b[1].trendDelta ?? 0))
    .map(([id, s]) => ({ id, short: s.short, trend: s.trend, corr60: s.corr[60]?.now, then60: s.corr[60]?.then, avg60: s.corr[60]?.avg2y, delta: s.trendDelta }));
  const divergences = ok.filter(([, s]) => fin(s.z) && Math.abs(s.z) >= o.zLine).sort((a, b) => Math.abs(b[1].z) - Math.abs(a[1].z))
    .map(([id, s]) => ({ id, short: s.short, z: s.z, win: s.zWin, line: s.line, alert: Math.abs(s.z) >= o.zAlert }));
  return { links: out, breaking, divergences, missing };
}

/** The payload's fixed wording: what this board is and is not. */
export const CHAIN_STATS_NOTE = 'Context, not a signal. Correlations of daily changes, lead/lag and divergence describe how each link is behaving now; '
  + 'none is a forecast, and yields -> FX forward coupling is a banked null on this desk. Lead/lag bands are corrected for the ten lags looked at; '
  + 'a one-day lag can be the two ends closing at different times. The divergence z uses a beta fitted on the 120 days before the window and assumes '
  + 'independent daily residuals (sd x sqrt(days)).';
