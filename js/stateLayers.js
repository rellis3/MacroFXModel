/**
 * Market State Engine, phase 2: the global banner, the economies, the analysis layers and the edges active today.
 * Pure: condenses the payloads the server already builds (global read, risk flags, macro regime, funding read,
 * credit quality, stress shadow, econ surprises, nowcasts, Fed path, COT state, OI today, vol forecast) into the
 * compact sections /api/state serves. Every section carries its own as-of. Missing input → null, never invented.
 * Tested in js/stateLayers.test.mjs. Plan: plans/MARKET_STATE_ENGINE_PLAN.md §4.
 */
import { DESK_EVIDENCE } from './deskEvidence.js';
import { EVIDENCE_AUDIT } from './evidenceAudit.js';

const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const isoOf = v => (v == null ? null : typeof v === 'number' ? new Date(v).toISOString() : String(v));

/** The global banner: one line per axis of the market state, each with its source and date. */
export function summariseGlobal({ globalRead = null, riskFlags = null, regime = null, funding = null, creditQuality = null } = {}) {
  const g = globalRead && globalRead.ok !== false ? globalRead : null;
  const r = riskFlags && riskFlags.ok !== false ? riskFlags : null;
  const reg = regime?.now ? regime : null;
  const f = funding && funding.ok !== false ? funding : null;
  return {
    envLabel: g?.envLabel ?? null,
    headline: g?.headline ?? null,
    conviction: g?.conviction ?? null,
    axes: g?.axes ? Object.fromEntries(Object.entries(g.axes).map(([k, a]) => [k, { score: num(a?.score), agree: a?.agree ?? null, text: a?.inputs?.[0]?.text ?? null }])) : null,
    globalReadAsOf: g?.meta?.asOf ?? null,
    regime: reg ? { key: reg.now.key, describe: reg.now.describe ?? null, date: reg.now.date ?? null } : null,
    policy: reg?.policy ? { policyRate: num(reg.policy.policyRate), twoYear: num(reg.policy.twoYear), gapBp: num(reg.policy.gapBp), movesPriced: num(reg.policy.movesPriced), direction: reg.policy.direction ?? null, asOf: reg.policy.twoYearAsOf ?? null } : null,
    risk: r ? { level: r.level ?? null, active: r.active ?? 0, available: r.available ?? null, note: r.note ?? null, asOf: r.computed_at ?? null,
                flags: (r.flags ?? []).map(x => ({ key: x.key, label: x.label, on: x.on, value: num(x.value), detail: x.detail ?? '' })),
                move: r.move ? { level: num(r.move.level), pct1y: num(r.move.pct1y), chg20: num(r.move.chg20), asOf: r.move.asOf ?? null } : null } : null,
    funding: f ? { line: f.line ?? null, flags: f.flags ?? [], asOf: f.builtAt ?? null,
                   items: (f.items ?? []).map(i => ({ id: i.id, group: i.group, label: i.label, unit: i.unit, value: num(i.stat?.value), change: num(i.stat?.change), pctile: num(i.stat?.pctile), date: i.stat?.date ?? null, state: i.state ?? null, text: i.text ?? '' })) } : null,
    creditQuality: creditQuality && creditQuality.ok !== false && Number.isFinite(creditQuality.quality) ? { z: creditQuality.quality, asOf: creditQuality.latestDate ?? null } : null,
  };
}

/** Currencies the economy panel covers, with the FX pair whose COT/OI row speaks for them and the FRED 10Y key. */
export const ECONOMIES = [
  { ccy: 'USD', name: 'United States', pair: null,     y10: 'us10y' },
  { ccy: 'EUR', name: 'Euro area',     pair: 'EURUSD', y10: 'de10y' },
  { ccy: 'GBP', name: 'United Kingdom', pair: 'GBPUSD', y10: 'gb10y' },
  { ccy: 'JPY', name: 'Japan',         pair: 'USDJPY', y10: 'jp10y' },
  { ccy: 'AUD', name: 'Australia',     pair: 'AUDUSD', y10: 'au10y' },
  { ccy: 'CAD', name: 'Canada',        pair: 'USDCAD', y10: 'ca10y' },
  { ccy: 'NZD', name: 'New Zealand',   pair: 'NZDUSD', y10: null },
  { ccy: 'CHF', name: 'Switzerland',   pair: 'USDCHF', y10: 'ch10y' },
];

function lastAndChange(pts, days = 30) {
  if (!Array.isArray(pts) || !pts.length) return null;
  const last = pts[pts.length - 1], lt = Date.parse(last.date);
  let ref = null; for (let i = pts.length - 2; i >= 0; i--) if (Date.parse(pts[i].date) <= lt - days * 864e5) { ref = pts[i]; break; }
  return { value: num(last.value), date: last.date, changeBp: ref ? Math.round((last.value - ref.value) * 100) : null, changeDays: days };
}

/**
 * One row per economy. Every figure is labelled context: none is a tested lean (nowcasts N1 null, surprise index
 * untested as a direction, COT crowding states null except D).
 */
export function summariseEconomies({ surprise = null, nowcast = null, fedPath = null, fredHist = {}, intlYields = null, cot = null } = {}) {
  const ccyOf = s => surprise?.byCcy?.[s] ?? null;
  const y = (key) => key === 'us10y' ? lastAndChange(fredHist?.us10y) : lastAndChange(intlYields?.[key] ?? fredHist?.[key]);
  const rows = ECONOMIES.map(e => {
    const s = ccyOf(e.ccy);
    const c = e.pair ? cot?.instruments?.[e.pair] : null;
    return {
      ccy: e.ccy, name: e.name,
      surprise: s ? { score: num(s.score), n: s.nRecent ?? s.n ?? null, lastAsOf: s.lastAsOf ?? null, top: s.top?.[0] ? { event: s.top[0].event, z: num(s.top[0].z), actual: s.top[0].actual, estimate: s.top[0].estimate } : null } : null,
      yield10: e.y10 ? y(e.y10) : null,
      cot: c ? { label: c.label ?? null, zone: c.zone ?? null, state: c.state ?? null, pct: num(c.pct), side: c.side ?? null, reportDate: c.reportDate ?? cot?.reportDate ?? null } : null,
    };
  });
  const usd = rows[0];
  if (nowcast && nowcast.ok !== false) {
    usd.nowcast = { month: nowcast.cleveland?.month ?? null, cpiMoM: num(nowcast.cleveland?.cpi), coreMoM: num(nowcast.cleveland?.core),
                    gdpNow: num(nowcast.gdpnow?.value), gdpQuarter: nowcast.gdpnow?.quarter ?? null, asOf: nowcast.cleveland?.asOf ?? isoOf(nowcast.at) };
  }
  if (fedPath && fedPath.ok !== false) {
    const w = fedPath.windows?.[0], m = fedPath.zq?.meetings?.[0];
    usd.policyPath = { currentRange: fedPath.currentRange ?? null, nextWindow: w ? { ref: w.ref, cutPct: num(w.cut), hikePct: num(w.hike), mean: num(w.mean) } : null,
                       nextMeeting: m ? { date: m.meeting, moveBp: num(m.moveBp), direction: m.direction ?? null } : null, asOf: fedPath.asOf ?? null, ageDays: fedPath.ageDays ?? null };
  }
  return { rows, surpriseAsOf: surprise?.generatedAt ?? null, cotReportDate: cot?.reportDate ?? null,
           note: 'Context, not a lean: the surprise index and nowcasts are untested or null as direction signals here. One COT result stands: on high-impact release days price moves against a crowded leveraged-fund position (positioning-into-release-direction); COT state D (crowd leaving a running trend) also stands.' };
}

/** The analysis layers: volatility & range, positioning (COT, options OI/gamma), liquidity & funding. */
export function summariseLayers({ volForecast = null, cot = null, oi = null } = {}) {
  const vf = volForecast?.instruments ? volForecast : null;
  const vol = vf ? Object.entries(vf.instruments).map(([sym, i]) => ({
    sym, volAnnual: num(i.vol_annual), volPct: num(i.vol_pct), hlP50: num(i.ladder_flat?.hl_p50 ?? i.hl_median), hlP75: num(i.ladder_flat?.hl_p75 ?? i.hl_75), stale: !!i.stale,
  })).filter(r => r.volAnnual != null).sort((a, b) => (b.volPct ?? -1) - (a.volPct ?? -1)) : [];
  const positioning = cot?.instruments ? Object.entries(cot.instruments).map(([sym, c]) => ({
    sym, label: c.label ?? null, zone: c.zone ?? null, state: c.state ?? null, pct: num(c.pct), crowd: c.crowd ?? null, move13: num(c.move13),
  })).sort((a, b) => Math.abs((b.pct ?? 50) - 50) - Math.abs((a.pct ?? 50) - 50)) : [];
  const options = Array.isArray(oi?.pairs) ? oi.pairs.map(p => ({
    pair: p.pair, spot: num(p.spot), regime: p.regime ?? null, callWall: num(p.callWall), putWall: num(p.putWall), maxPain: num(p.maxPain), dte: p.dte ?? null, basisStale: !!p.basisStale, savedAt: p.savedAt ?? null,
  })) : [];
  return {
    vol: { rows: vol, sessionDate: vf?.session_date ?? null, computedAt: vf?.computed_at ?? null },
    positioning: { rows: positioning, reportDate: cot?.reportDate ?? null },
    options: { rows: options, at: oi?.at ?? null },
  };
}

const evidenceById = Object.fromEntries(DESK_EVIDENCE.map(e => [e.id, e]));

/**
 * Edges whose condition can be evaluated today from what the engine holds. `grade` comes from the 2026-10-31 audit:
 * ROBUST / PLAUSIBLE are shown as active edges; FRAGILE ones are shown separately as research only.
 * Every edge is about RANGE (how far markets travel), not direction — that is what has validated here.
 */
/** Weekday sessions only: true when `date` is one of the last 2 or first 2 weekdays of its month (calendar only). */
export function isMonthEndSession(date) {
  const d = new Date(date + 'T12:00:00Z'); if (Number.isNaN(+d) || [0, 6].includes(d.getUTCDay())) return false;
  const wd = (y, m) => { const out = []; for (let x = new Date(Date.UTC(y, m, 1, 12)); x.getUTCMonth() === m; x = new Date(+x + 864e5)) if (![0, 6].includes(x.getUTCDay())) out.push(x.toISOString().slice(0, 10)); return out; };
  const days = wd(d.getUTCFullYear(), d.getUTCMonth()), i = days.indexOf(date);
  return i >= 0 && (i < 2 || i >= days.length - 2);
}

export const EDGE_RULES = [
  { id: 'forecast-miss-shock-fx', label: 'Equity/vol stress → FX ranges beat the forecast', applies: 'FX',
    when: ({ stress }) => stress?.conditions ? { active: (stress.conditions.fxCount ?? 0) >= 4, why: `${stress.conditions.fxCount ?? 0} of 5 stress conditions on (S&P 5d fall, VIX 5d rise, VIX high, VIX inverted, S&P 60d fall); the shadow scales FX bands ×${stress.factor?.fx ?? '?'}` } : null },
  { id: 'forecast-miss-shock-idx', label: 'S&P fall or VIX rise → index ranges beat the forecast', applies: 'Indices',
    when: ({ stress }) => stress?.conditions ? { active: (stress.conditions.idxCount ?? 0) >= 1, why: `${stress.conditions.idxCount ?? 0} of 2 on (S&P 5d fall, VIX 5d rise); index bands ×${stress.factor?.idx ?? '?'}` } : null },
  { id: 'forecast-miss-month-end-fx', label: 'Month-end sessions → FX ranges beat the forecast', applies: 'FX',
    when: ({ stress, sessionDate }) => {
      const me = stress && typeof stress.monthEnd === 'boolean' ? { on: stress.monthEnd, d: stress.sessionDate } : sessionDate ? { on: isMonthEndSession(sessionDate), d: sessionDate } : null;
      return me ? { active: me.on, why: me.on ? `session ${me.d} is in the last 2 / first 2 of the month` : `session ${me.d ?? '?'} is not a month-end session` } : null;
    } },
  { id: 'vix-inversion', label: 'VIX above VIX3M → a wider week', applies: 'S&P, Nasdaq, USDJPY, gold',
    when: ({ stress, vixTerm }) => {
      // stress-shadow's reading first; else the server's own FRED VIXCLS / VXVCLS history (same ratio, same close)
      const t = Number.isFinite(stress?.inputs?.vixTerm) ? { v: stress.inputs.vixTerm, src: 'stress shadow' } : Number.isFinite(vixTerm?.value) ? { v: vixTerm.value, src: `FRED VIXCLS/VXVCLS ${vixTerm.date}` } : null;
      return t ? { active: t.v > 1, why: `VIX/VIX3M ${t.v.toFixed(3)} (inverted above 1; the effect was measured on the first day; ${t.src})` } : null;
    } },
  { id: 'nq-down-week', label: 'Nasdaq down ≥1% over 5 sessions → next session wider', applies: 'Nasdaq',
    when: ({ nq5 }) => Number.isFinite(nq5) ? { active: nq5 <= -1, why: `Nasdaq 5-session move ${nq5 > 0 ? '+' : ''}${nq5.toFixed(1)}%` } : null },
  { id: 'gex-range-es', label: 'Short dealer gamma → wider next session', applies: 'NQ / ES',
    when: ({ oi }) => { const p = (oi?.pairs ?? []).find(x => /NAS|NQ|SPX|ES/i.test(x.pair)); return p ? { active: p.regime === 'BREAKOUT', why: `${p.pair} gamma regime ${p.regime}` } : null; } },
];

export function activeEdges(inputs = {}) {
  return EDGE_RULES.map(rule => {
    const ev = evidenceById[rule.id], audit = EVIDENCE_AUDIT[rule.id];
    const res = (() => { try { return rule.when(inputs); } catch { return null; } })();
    const grade = audit?.audit ?? null;
    return {
      id: rule.id, label: rule.label, applies: rule.applies,
      active: res ? res.active : null, why: res ? res.why : 'input not loaded',
      grade, standing: grade === 'ROBUST' || grade === 'PLAUSIBLE' ? 'edge' : 'research only',
      claim: ev?.claim ?? null, result: ev?.result ?? null, use: ev?.use ?? null, doc: ev?.doc ?? null,
    };
  });
}

/**
 * Today's engine regimes, on the definitions edges-by-regime used (analysis/output/edges-by-regime/PREREG.md):
 * vol = VIX above / at-or-below its trailing 252-session median; credit = HY OAS 20-print change > 0;
 * curve = US 10Y − 2Y < 0. Series are [{date, value}] ascending. A missing input leaves that regime null.
 */
export function todayRegimes({ vix = [], hy = [], us10y = [], us2y = [] } = {}) {
  const v = vix.filter(p => Number.isFinite(p?.value)), h = hy.filter(p => Number.isFinite(p?.value));
  let vol = null, credit = null, curve = null;
  if (v.length >= 200) {
    const w = v.slice(-252).map(p => p.value).sort((a, b) => a - b), med = w[Math.floor(w.length / 2)];
    vol = v.at(-1).value > med ? 'high vol' : 'low vol';
  }
  if (h.length > 20) credit = h.at(-1).value - h.at(-21).value > 0 ? 'credit widening' : 'credit not widening';
  const a = us10y.at(-1)?.value, b = us2y.at(-1)?.value;
  if (Number.isFinite(a) && Number.isFinite(b)) curve = a - b < 0 ? 'curve inverted' : 'curve not inverted';
  return { vol, credit, curve };
}

/** What edges-by-regime measured for this edge in today's regimes: one line per axis, from results.json. */
export function edgeRegimeContext(results, id, regimes) {
  const e = results?.edges?.find(x => x.id === id);
  if (!e || !regimes) return null;
  return Object.entries(e.splits ?? {}).map(([axis, sp]) => {
    const today = regimes[axis] ?? null, c = today ? sp.cells?.[today] : null;
    const resolved = !!(c?.ci && (c.ci[0] > 0 || c.ci[1] < 0));
    return { axis, today, read: sp.read, effect: c?.effect ?? null, ci: c?.ci ?? null, nEvent: c?.n_event ?? 0,
      text: !today ? `${axis}: today's regime not loaded`
        : !c || c.effect == null ? `${today}: too few past events (${c?.n_event ?? 0}) to measure`
        : `${today}: ${c.effect > 0 ? '+' : ''}${c.effect} ATR [${c.ci[0]}, ${c.ci[1]}], n=${c.n_event}${resolved ? '' : ' (not resolved)'}` };
  });
}
