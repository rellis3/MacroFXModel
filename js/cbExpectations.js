/**
 * What the futures market prices for each central bank (Desk Terminal, Macro tab; plans/DESK_ANALYST_PIPELINE.md §9r data).
 * From the laptop's IBKR pull (scripts/rates_line/refresh_cb_expectations.py → KV cb_rate_futures_v1) and the policy rates.
 *
 * Each rung's implied rate is 100 - price. For '1m' and '3m' contracts (an average or compounded overnight rate) the
 * difference from today's policy rate is the change priced by that month, in bp and in 25 bp steps. A 'bill' contract
 * (90-day bank bill, bankers' acceptance) carries a credit spread over the policy rate, so its path is read against
 * the front contract instead, and its level is never called a cut or a hike against the policy rate.
 *
 * Pure. Tested in js/cbExpectations.test.mjs.
 */
const ym = s => { const y = +String(s).slice(0, 4), m = +String(s).slice(4, 6); return y * 12 + (m - 1); };

/** The rung nearest a horizon `months` ahead of `nowYm` (YYYYMM). */
export function at(rungs, nowYm, months) {
  const want = ym(nowYm) + months; let best = null;
  for (const r of rungs ?? []) { const d = Math.abs(ym(r.month) - want); if (!best || d < best.d) best = { d, r }; }
  return best && best.d <= 2 ? best.r : null;
}

/** One bank. b: { source, kind, rungs }, policy: the current policy rate (%), nowYm: 'YYYYMM'. */
export function bankView(b, policy, nowYm) {
  const rungs = (b?.rungs ?? []).filter(r => Number.isFinite(r.rate)).sort((x, y) => String(x.month).localeCompare(String(y.month)));
  if (!rungs.length) return null;
  const base = b.kind === 'bill' ? rungs[0].rate : policy, vsPolicy = b.kind !== 'bill' && Number.isFinite(policy);
  const bp = r => (Number.isFinite(base) ? Math.round((r.rate - base) * 100) : null);
  const row = r => ({ month: r.month, local: r.local, rate: +r.rate.toFixed(3), bp: bp(r), steps: bp(r) == null ? null : +(bp(r) / 25).toFixed(1),
    weekBp: Number.isFinite(r.rateWeekAgo) ? Math.round((r.rate - r.rateWeekAgo) * 100) : null });
  const h = m => { const r = at(rungs, nowYm, m); return r ? row(r) : null; };
  return { source: b.source, kind: b.kind, against: vsPolicy ? 'policy rate' : 'front contract', policy: Number.isFinite(policy) ? policy : null,
    rungs: rungs.map(row), m3: h(3), m6: h(6), m12: h(12) };
}

/** Every bank in the pull. rates: { CCY: policy rate }. */
export function expectations(payload, rates, now = Date.now()) {
  const d = new Date(now), nowYm = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`, out = {};
  for (const [c, b] of Object.entries(payload?.banks ?? {})) { const v = bankView(b, rates?.[c], nowYm); if (v) out[c] = v; }
  return { asOf: payload?.asOf ?? null, ageH: payload?.asOf ? +((now - Date.parse(payload.asOf)) / 3.6e6).toFixed(1) : null, banks: out, errors: payload?.errors ?? {} };
}
