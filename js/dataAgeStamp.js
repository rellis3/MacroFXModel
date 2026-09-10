/**
 * js/dataAgeStamp.js — say how old the DATA is, not when we last asked.
 *
 * Every macro page carried the same line:
 *
 *     $('lastCheck').textContent = `Generated ${new Date(r.generatedAt).toLocaleString()}`;
 *
 * `generatedAt` is when the server last called FRED. It is always today, and it is
 * true whether the series behind it published this morning or stopped in 2021. So a
 * dead feed and a live one looked identical by eye, which is exactly how JPY CPI
 * went on showing a June-2021 print for four years with a reassuring timestamp above
 * it, and how the CHF short rate scored a March-2024 print for eighteen months.
 *
 * This puts the OBSERVATION DATE first and demotes the fetch time to a suffix.
 *
 * Three states, deliberately distinguished — they mean different things to a reader
 * and the old UI could express none of them:
 *
 *   current       the newest observation is within this series' normal cycle
 *   overdue       a print we should have is missing — worth chasing
 *   discontinued  the source has STOPPED. Not late, gone; it will not come back
 *                 without a new data source, so waiting is the wrong response
 *
 * Cadence-aware throughout, because "old" is meaningless without it: a quarterly
 * series is legitimately ~250 days old late in the following quarter, and judging it
 * on a monthly budget marked healthy data stale across the whole board (see
 * js/macroScorecardEngine.js MAX_AGE_BY_CADENCE for the same reasoning server-side).
 */

// Wall-clock bookkeeping, never an observation. Scanning these would make every
// payload look permanently fresh — the precise confusion this module exists to end.
import { MAX_AGE_DAYS, MAX_AGE_BY_CADENCE, DEFAULT_MAX_AGE_DAYS } from './macroScorecardEngine.js';

const META_KEYS = new Set([
  'generatedat', 'builtat', 'fetchedat', 'updatedat', 'checkedat', 'timestamp',
  'lastrun', 'asofrun', 'refreshedat', 'ranat',
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The budget for one dimension/cadence — taken from js/macroScorecardEngine.js, NOT
 * defined here.
 *
 * This started with its own thresholds and immediately drifted: a standalone
 * 80-day monthly budget flagged seven trade-balance currencies as "behind" that the
 * scorecard counts as perfectly healthy, because the scorecard allows 150 days there
 * for OECD's two-month publication lag. A page contradicting the composite it feeds
 * is worse than either being wrong alone — the reader has no way to tell which to
 * believe, and both are stated with the same confidence.
 *
 * So the page now asks the same table the score is computed from. If a budget is
 * ever retuned, both move together and cannot disagree.
 *
 * Cadence wins over the per-dimension entry when the engine reports it, mirroring
 * readDim exactly.
 */
export function budgetFor(dim, cadence) {
  return (cadence && MAX_AGE_BY_CADENCE[cadence])
    ?? MAX_AGE_DAYS[dim] ?? DEFAULT_MAX_AGE_DAYS;
}

/**
 * Newest observation date anywhere in a payload, as YYYY-MM-DD, or null.
 *
 * Deep-scans rather than requiring each page to know where its dates live: these
 * ten engines have ten different payload shapes, and a per-page accessor is ten more
 * things to get quietly wrong.
 */
export function newestObservation(payload, { maxDepth = 8 } = {}) {
  let best = null;
  const walk = (node, depth, keyLower) => {
    if (node == null || depth > maxDepth) return;
    if (typeof node === 'string') {
      if (META_KEYS.has(keyLower)) return;
      const d = ISO_DATE.test(node) ? node
        : (/^\d{4}-\d{2}-\d{2}T/.test(node) ? node.slice(0, 10) : null);
      if (d && (best === null || d > best)) best = d;
      return;
    }
    if (Array.isArray(node)) { for (const v of node) walk(v, depth + 1, keyLower); return; }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, depth + 1, String(k).toLowerCase());
    }
  };
  walk(payload, 0, '');
  return best;
}

/** The cadence the engines now report, taken from whichever currency declares one. */
// Fallback defaults to NULL, not 'monthly'. A default cadence would silently
// OVERRIDE the per-dimension budget (cadence wins in budgetFor), so a caller that
// simply forgot the argument would get the generic monthly number instead of the
// tuned one -- GDP, budgeted at 300 days, would be judged at 130 and warn on a
// perfectly normal quarterly print. Falling through to MAX_AGE_DAYS[dim] is the
// safe direction: the dimension table is the one that was actually calibrated.
export function cadenceOf(payload, fallback = null) {
  for (const row of Object.values(payload?.byCcy ?? {})) {
    if (row?.cadence) return row.cadence;
  }
  return fallback;
}

/** Currencies whose source has stopped, with the reason the engine recorded. */
export function discontinuedIn(payload) {
  return Object.entries(payload?.byCcy ?? {})
    .filter(([, r]) => r?.discontinued)
    .map(([ccy, r]) => ({ ccy, ...r.discontinued }));
}

/**
 * Per-currency observation dates, so one fresh currency cannot hide seven stale ones.
 *
 * The headline stamp reports the NEWEST observation in the payload. On a page where
 * USD published this morning and the other seven stopped last year, that headline
 * reads "Data: today" and is technically true and practically a lie -- which is the
 * same shape of error as the composite that averaged a dead print into a live score.
 * Discontinued currencies are already named separately; this catches the ones that
 * are merely a long way behind, which nothing else reports.
 */
export function perCurrencyAges(payload, dim, now = Date.now()) {
  return Object.entries(payload?.byCcy ?? {})
    .filter(([, row]) => row && !row.discontinued)
    .map(([ccy, row]) => {
      const obs = newestObservation(row);
      // Each currency is judged on ITS OWN cadence: within one dimension the US leg
      // is often monthly while the OECD legs are quarterly, so a single budget for
      // the whole page marks healthy quarterly data as behind.
      return { ccy, obs, age: ageDaysOf(obs, now), budget: budgetFor(dim, row.cadence) };
    })
    .filter(x => x.age != null)
    .sort((a, b) => b.age - a.age);
}

export function ageDaysOf(dateStr, now = Date.now()) {
  if (!dateStr) return null;
  const t = Date.parse(dateStr + 'T00:00:00Z');
  return Number.isFinite(t) ? Math.floor((now - t) / 864e5) : null;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Render the stamp into `el`.
 *
 * `label` names the series in prose ("CPI", "GDP") so the tooltip reads naturally.
 * `now` is injectable so this is testable without touching the clock.
 */
export function renderDataAgeStamp(el, payload, { dim, label = 'Data', fallbackCadence = null, now = Date.now() } = {}) {
  if (!el) return null;
  const obs = newestObservation(payload);
  const age = ageDaysOf(obs, now);
  const cadence = cadenceOf(payload, fallbackCadence);
  const limit = budgetFor(dim, cadence);
  const overdue = age != null && age > limit;
  const dead = discontinuedIn(payload);
  // Currencies past the same cadence budget the headline is judged against. Reported
  // as a count so the stamp stays one line, with the detail in the tooltip.
  const perCcy = perCurrencyAges(payload, dim, now);
  const laggards = perCcy.filter(x => x.age > x.budget);
  const checked = payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString() : 'unknown';

  const bits = [];
  if (age != null) {
    bits.push(`<b${overdue ? ' style="color:#e8963c"' : ''}>${overdue ? '⚠ ' : ''}Data: ${esc(obs)} (${age}d old)</b>`);
  } else {
    bits.push('<b style="color:#e8963c">⚠ no observation date in this payload</b>');
  }
  if (dead.length) {
    bits.push(`<b style="color:#e8963c">${dead.length} source${dead.length === 1 ? '' : 's'} discontinued</b>`);
  }
  if (laggards.length) {
    bits.push(`<b style="color:#e8963c">${laggards.length} behind</b>`);
  }
  bits.push(`checked ${esc(checked)}`);
  el.innerHTML = bits.join(' · ');

  const cadenceWord = { daily: 'daily', weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly' }[cadence] ?? 'periodic';
  el.title = [
    age == null
      ? `No observation date could be found in this payload, so how current these numbers are cannot be established from the page. Treat them as unverified.`
      : overdue
        ? `The newest ${label} observation is ${obs}, ${age} days ago. For a ${cadenceWord} series that is past the point where the next print should have arrived, so a release has probably landed that we do not have.`
        : `Newest ${label} observation is ${obs}, ${age} days ago — normal for a ${cadenceWord} series.`,
    dead.length
      ? `DISCONTINUED (not late — gone): ${dead.map(d => `${d.ccy}, source stopped ${d.since}${d.was ? ` (${d.was})` : ''}`).join('; ')}. These score nothing rather than being counted as neutral, and will not return without a new data source.`
      : '',
    laggards.length
      ? `BEHIND (the headline date above is the NEWEST currency, which can hide these): ${laggards.map(x => `${x.ccy} ${x.obs} (${x.age}d, budget ${x.budget}d)`).join('; ')}. Each is judged on its own cadence using the same budgets as the Macro Scorecard, so anything listed here is genuinely excluded from the composite rather than scored.`
      : '',
    `"Checked" is only when the server last asked FRED. It is always recent and says nothing about how old the data is — which is why the observation date leads here.`,
  ].filter(Boolean).join('\n\n');

  return { obs, age, cadence, overdue, discontinued: dead };
}
