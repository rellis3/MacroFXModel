/**
 * Market State Engine — the one state document (plans/MARKET_STATE_ENGINE_PLAN.md).
 *
 * Pure: no fetch, no DOM. Input is a map of dated series per chain node (the same nodes and units as
 * js/macroChain.js) plus optional passthrough reads; output is the document /api/state serves and
 * state.html draws. Tested in js/stateEngine.test.mjs.
 *
 * Organised on the capital-flow hierarchy (C.OG): rates → credit → FX → equities → volatility, with
 * real assets (oil, metals, crypto) alongside as drivers. Everything here DESCRIBES the state. Nothing
 * here predicts: the order in which tiers moved is shown as a description, and every chain link carries
 * the audit status of whatever test exists for it (js/evidenceAudit.js), so the page can say "tested and
 * it stands", "tested but reopened", or "never tested as a lead".
 */
import { CHAIN_NODES, CHAIN_LINKS, CHAIN_WINDOW_DAYS, evaluateChain, summariseChain, nodeDelta } from './macroChain.js';
import { auditStatus } from './evidenceAudit.js';

export const STATE_VERSION = 1;

/** The hierarchy. `order` is the textbook flow of information (first to price → last). */
export const TIERS = [
  { id: 'rates',    order: 1, label: 'Rates & sovereign bonds', short: 'Rates',    role: 'First to price macro shifts',
    nodes: ['us2y', 'us10y', 'us30y', 'real', 'bei', 'bundgap', 'giltgap', 'jgbgap'] },
  { id: 'credit',   order: 2, label: 'Credit & funding',        short: 'Credit',   role: 'Corporate health and risk appetite',
    nodes: ['hy', 'ccc', 'emoas', 'funding'] },
  { id: 'fx',       order: 3, label: 'Currencies',              short: 'FX',       role: 'Policy divergence and global flows',
    nodes: ['dxy', 'eurusd', 'usdjpy', 'gbpusd', 'audusd', 'usdcad', 'emdollar'] },
  { id: 'equities', order: 4, label: 'Equities',                short: 'Equities', role: 'Broadest participation, most noise',
    nodes: ['spx', 'nq', 'smh', 'xle', 'xlre'] },
  { id: 'vol',      order: 5, label: 'Volatility',              short: 'Vol',      role: 'Insurance pricing, tail risk, fear',
    nodes: ['vix', 'move'] },
];
export const DRIVERS = { id: 'drivers', label: 'Real assets & drivers', nodes: ['oil', 'copper', 'gold', 'crack', 'btc'] };

/**
 * Which banked tests bear on each chain link AS A LEAD (from the Evidence Book). A link with no entry has
 * never been tested as a lead. Context entries are left out: they describe, they do not test.
 */
export const LINK_EVIDENCE = {
  'oil-bei':      ['oil-to-breakevens'],
  'real-dxy':     ['yields-to-fx-direction', 'yield-ladder-eurusd'],
  'bundgap-eurusd': ['yields-to-fx-direction', 'rates-spread-asset-lead', 'spread-episodes-eurusd'],
  'giltgap-gbpusd': ['yields-to-fx-direction', 'rates-spread-asset-lead'],
  'jgbgap-usdjpy':  ['yields-to-fx-direction', 'rates-spread-asset-lead'],
  'real-nq':      ['rates-pivot-lead', 'rate-diff-nq-leadlag', 'stir-composite-nq'],
  'real-spx':     ['rates-pivot-lead', 'macro-confluence-direction'],
  'hy-nq':        ['credit-leads-equities', 'macro-confluence-baa-credit'],
  'hy-spx':       ['credit-leads-equities', 'macro-confluence-baa-credit'],
  'ccc-nq':       ['credit-leads-equities'],
  'move-vix':     ['rates-vol-gap-state', 'vix-integral-gaps'],
  'funding-dxy':  ['basis-stress-usd', 'basis-stress-jpy-usd'],
  'funding-vix':  ['basis-stress-fxvol'],
  'smh-nq':       ['breadth-tilt-semis'],
};

/** One label for a link's evidence: the weakest status wins, because one reopened test means "we don't know yet". */
export function linkEvidence(linkId, statusOf = auditStatus) {
  const ids = LINK_EVIDENCE[linkId] ?? [];
  if (!ids.length) return { status: 'untested', ids: [], text: 'Never tested here as a lead. Shown as a description only.' };
  const st = ids.map(id => ({ id, status: statusOf(id) ?? 'unaudited' }));
  const has = s => st.some(x => x.status === s);
  const status = has('reopened') ? 'reopened' : has('unverified') || has('unaudited') ? 'unverified' : 'stands';
  const text = status === 'stands'
    ? 'Tested here as a lead; the test stands (no usable lead found, or as banked).'
    : status === 'reopened'
      ? 'Tested here, but the test was reopened by the 2026-10-31 audit (bug or design flaw). Unknown until re-run.'
      : 'Tested here, but the test has not been verified against its code.';
  return { status, ids: st, text };
}

const DAY = 86_400_000;
const ts = p => Date.parse(p?.date ?? '');

/** Move from `ref` to each later point, in the node's unit (same arithmetic as macroChain.nodeDelta). */
function moveIn(unit, ref, v) {
  if (unit === 'pct') return ref ? (v / ref - 1) * 100 : null;
  if (unit === 'bp') return (v - ref) * 100;
  return v - ref;
}

/**
 * Date the node first moved past its noise floor inside the window (calendar days back from its last
 * print), and in which direction. null when it never did, or the series cannot answer the window.
 */
export function firstCross(pts, node, windowDays = CHAIN_WINDOW_DAYS) {
  if (!node || !Array.isArray(pts) || pts.length < 3) return null;
  const lastT = ts(pts[pts.length - 1]); if (!Number.isFinite(lastT)) return null;
  let r = -1;
  for (let i = pts.length - 2; i >= 0; i--) { const t = ts(pts[i]); if (Number.isFinite(t) && t <= lastT - windowDays * DAY) { r = i; break; } }
  if (r < 0) return null;
  const ref = pts[r].value;
  if (!Number.isFinite(ref)) return null;
  for (let i = r + 1; i < pts.length; i++) {
    const m = moveIn(node.unit, ref, pts[i].value);
    if (m != null && Number.isFinite(m) && Math.abs(m) >= node.floor) return { date: pts[i].date, dir: m > 0 ? 'up' : 'down', move: m };
  }
  return null;
}

/**
 * Prior-only percentile of the last value within the trailing `lookbackDays` (excludes the last point),
 * with the span it actually covers: the server's FRED cache holds ~90 prints, so a "3-year" request can
 * be a 4-month answer, and the page must say which. Returns { pct, spanDays, n } or null.
 */
export function levelPercentile(pts, lookbackDays = 3 * 365) {
  if (!Array.isArray(pts) || pts.length < 30) return null;
  const last = pts[pts.length - 1], lt = ts(last);
  if (!Number.isFinite(lt) || !Number.isFinite(last.value)) return null;
  const hist = pts.slice(0, -1).filter(p => Number.isFinite(p.value) && ts(p) >= lt - lookbackDays * DAY);
  if (hist.length < 30) return null;
  const pct = Math.round(100 * hist.filter(p => p.value < last.value).length / hist.length);
  return { pct, spanDays: Math.round((lt - ts(hist[0])) / DAY), n: hist.length };
}

/** "3y", "14m", "4m" — a span label for the percentile bar. */
export function spanLabel(days) {
  if (days == null) return '';
  return days >= 330 ? `${Math.round(days / 365)}y` : `${Math.max(1, Math.round(days / 30.4))}m`;
}

/** Last `n` points as a sparkline (value only, ascending). */
const spark = (pts, n = 90) => (pts ?? []).slice(-n).map(p => [p.date, p.value]);

function nodeReading(key, pts) {
  const node = CHAIN_NODES[key];
  if (!node) return null;
  if (!Array.isArray(pts) || pts.length < 3) return { key, label: node.label, unit: node.unit, missing: true };
  const d20 = nodeDelta(pts, node, CHAIN_WINDOW_DAYS);
  const d5 = nodeDelta(pts, node, 5);
  const fc = firstCross(pts, node);
  return {
    key, label: node.label, unit: node.unit, dp: node.dp, floor: node.floor, what: node.what,
    last: d20?.last ?? pts[pts.length - 1].value, asOf: pts[pts.length - 1].date,
    d20: d20?.delta ?? null, d5: d5?.delta ?? null,
    moved: d20?.delta != null && Math.abs(d20.delta) >= node.floor,
    dir: d20?.delta == null ? null : d20.delta > 0 ? 'up' : d20.delta < 0 ? 'down' : 'flat',
    firstMove: fc, pctile: levelPercentile(pts), spark: spark(pts),
  };
}

const get = (rs, k) => rs.find(r => r.key === k && !r.missing) ?? null;
const mv = r => (r && r.moved ? r.dir : 'flat');

/** Plain-words state for each tier, from its readings. Rule-based description, labelled as such. */
export function tierState(id, rs) {
  switch (id) {
    case 'rates': {
      const t10 = get(rs, 'us10y'), r = get(rs, 'real'), b = get(rs, 'bei'), s2 = get(rs, 'us2y'), s30 = get(rs, 'us30y');
      if (!t10) return { tone: 'unknown', headline: 'No 10-year yield loaded.' };
      const curve = s2 && s30 && s2.d20 != null && s30.d20 != null ? s30.d20 - s2.d20 : null;
      const curveTxt = curve == null ? '' : Math.abs(curve) < 8 ? 'curve little changed' : curve > 0 ? `curve steepening (${curve > 0 ? '+' : ''}${curve.toFixed(0)}bp 2s30s)` : `curve flattening (${curve.toFixed(0)}bp 2s30s)`;
      const driver = r && b && r.d20 != null && b.d20 != null ? (Math.abs(r.d20) >= Math.abs(b.d20) ? 'real-yield led' : 'inflation led') : null;
      const dir = mv(t10);
      const headline = dir === 'flat' ? 'Yields range-bound' : `Yields ${dir === 'up' ? 'rising' : 'falling'}${driver ? `, ${driver}` : ''}`;
      return { tone: dir === 'up' ? 'tightening' : dir === 'down' ? 'easing' : 'neutral', headline, detail: curveTxt };
    }
    case 'credit': {
      const hy = get(rs, 'hy'), f = get(rs, 'funding');
      if (!hy) return { tone: 'unknown', headline: 'No credit spread loaded.' };
      const dir = mv(hy);
      const pc = hy.pctile, span = pc ? spanLabel(pc.spanDays) : '';
      const stretched = pc ? (pc.pct >= 80 ? `wide for its ${span} range` : pc.pct <= 20 ? `tight for its ${span} range` : '') : '';
      return { tone: dir === 'up' ? 'risk-off' : dir === 'down' ? 'risk-on' : 'neutral',
               headline: dir === 'flat' ? 'Credit spreads steady' : `Credit spreads ${dir === 'up' ? 'widening' : 'tightening'}`,
               detail: [stretched, f?.moved ? `funding ${f.dir === 'up' ? 'dearer' : 'cheaper'}` : ''].filter(Boolean).join('; ') };
    }
    case 'fx': {
      const d = get(rs, 'dxy') ?? get(rs, 'eurusd');
      if (!d) return { tone: 'unknown', headline: 'No dollar series loaded.' };
      const usdUp = d.key === 'dxy' ? mv(d) === 'up' : mv(d) === 'down';
      const usdDown = d.key === 'dxy' ? mv(d) === 'down' : mv(d) === 'up';
      const em = get(rs, 'emdollar');
      return { tone: usdUp ? 'dollar-bid' : usdDown ? 'dollar-offered' : 'neutral',
               headline: usdUp ? 'Dollar strengthening' : usdDown ? 'Dollar weakening' : 'Dollar range-bound',
               detail: em?.moved ? `EM currencies ${em.dir === 'up' ? 'firmer' : 'softer'}` : '' };
    }
    case 'equities': {
      const s = get(rs, 'spx'), n = get(rs, 'nq');
      if (!s && !n) return { tone: 'unknown', headline: 'No equity index loaded.' };
      const base = s ?? n, dir = mv(base);
      const lead = s && n && s.d20 != null && n.d20 != null ? (n.d20 - s.d20 > 1 ? 'growth leading' : s.d20 - n.d20 > 1 ? 'growth lagging' : '') : '';
      return { tone: dir === 'up' ? 'risk-on' : dir === 'down' ? 'risk-off' : 'neutral',
               headline: dir === 'flat' ? 'Stocks range-bound' : `Stocks ${dir === 'up' ? 'rising' : 'falling'}`, detail: lead };
    }
    case 'vol': {
      const v = get(rs, 'vix');
      if (!v) return { tone: 'unknown', headline: 'No VIX loaded.' };
      const lvl = v.last >= 25 ? 'stressed' : v.last >= 18 ? 'elevated' : v.last <= 14 ? 'calm' : 'normal';
      const dir = mv(v);
      return { tone: lvl === 'stressed' || dir === 'up' ? 'risk-off' : lvl === 'calm' ? 'risk-on' : 'neutral',
               headline: `Volatility ${lvl}${dir !== 'flat' ? `, ${dir === 'up' ? 'rising' : 'falling'}` : ''}`,
               detail: `VIX ${Number(v.last).toFixed(1)}` + (get(rs, 'move')?.moved ? `; bond vol ${get(rs, 'move').dir === 'up' ? 'rising' : 'falling'}` : '') };
    }
    default: return { tone: 'neutral', headline: '' };
  }
}

/** Order in which tiers first moved past their floors this window, against the textbook order. */
export function flowOrder(tiers) {
  const moved = tiers.map(t => {
    const firsts = t.readings.filter(r => r.firstMove).map(r => ({ ...r.firstMove, key: r.key, label: r.label }));
    firsts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { id: t.id, short: t.short, order: t.order, first: firsts[0] ?? null };
  });
  const seq = moved.filter(m => m.first).sort((a, b) => (a.first.date < b.first.date ? -1 : a.first.date > b.first.date ? 1 : a.order - b.order));
  const textbook = seq.every((m, i) => i === 0 || m.order >= seq[i - 1].order);
  let text;
  if (!seq.length) text = `No tier moved past its noise floor in the last ${CHAIN_WINDOW_DAYS} days.`;
  else text = `Moved first: ${seq.map(m => `${m.short} (${m.first.label}, ${m.first.date})`).join(' → ')}. ` +
    (seq.length < 2 ? '' : textbook ? 'That is the textbook order.' : 'That is NOT the textbook order (rates → credit → FX → equities → vol): worth asking why.');
  return { sequence: seq, quiet: moved.filter(m => !m.first).map(m => m.id), textbook: seq.length >= 2 ? textbook : null, text,
           note: 'Descriptive: which series crossed its noise floor first inside the window. Not a tested lead.' };
}

/** Freshness of each input: age in days of its last print against `now`. */
export function health(series, now = Date.now(), staleDays = 5) {
  return Object.entries(series).map(([key, pts]) => {
    const last = Array.isArray(pts) && pts.length ? pts[pts.length - 1] : null;
    const age = last ? Math.round((now - ts(last)) / DAY) : null;
    return { key, label: CHAIN_NODES[key]?.label ?? key, asOf: last?.date ?? null, ageDays: age, stale: age == null || age > staleDays };
  }).sort((a, b) => (b.ageDays ?? 1e9) - (a.ageDays ?? 1e9));
}

/**
 * Build the state document.
 * series: { <nodeKey>: [{date:'YYYY-MM-DD', value}] ascending }
 * extras: passthrough reads ({ globalRead, fedPath, volForecast, ... }), included as-is under `reads`.
 */
export function buildState(series = {}, { now = Date.now(), extras = {}, sources = {} } = {}) {
  const tiers = TIERS.map(t => {
    const readings = t.nodes.map(k => nodeReading(k, series[k])).filter(Boolean);
    return { id: t.id, order: t.order, label: t.label, short: t.short, role: t.role, readings, state: tierState(t.id, readings) };
  });
  const drivers = { ...DRIVERS, readings: DRIVERS.nodes.map(k => nodeReading(k, series[k])).filter(Boolean) };

  const vals = {};
  for (const [k, pts] of Object.entries(series)) { const n = CHAIN_NODES[k]; if (n && Array.isArray(pts) && pts.length) vals[k] = nodeDelta(pts, n); }
  const links = evaluateChain(vals).map(l => ({ ...l, evidenceAudit: linkEvidence(l.id) }));
  const tierOf = {}; for (const t of TIERS) for (const k of t.nodes) tierOf[k] = t.id; for (const k of DRIVERS.nodes) tierOf[k] = 'drivers';

  const asOfs = Object.values(series).map(p => (Array.isArray(p) && p.length ? p[p.length - 1].date : null)).filter(Boolean).sort();
  return {
    version: STATE_VERSION,
    generatedAt: new Date(now).toISOString(),
    asOf: asOfs.length ? asOfs[asOfs.length - 1] : null,
    windowDays: CHAIN_WINDOW_DAYS,
    tiers, drivers,
    flow: flowOrder(tiers),
    chain: { links: links.map(l => ({ ...l, fromTier: tierOf[l.a?.key] ?? null, toTier: tierOf[l.b?.key] ?? null })), summary: summariseChain(links) },
    health: health(series, now),
    reads: extras,
    sources,
    note: 'Describes the market state. Nothing on this document is a forecast. Evidence status per link comes from the 2026-10-31 code audit.',
  };
}
