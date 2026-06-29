/**
 * Entry Ledger v2 — the daily-learning loop for the Telegram-v2 engine.
 *
 * The frozen policy (TELEGRAM_V2.md) is learned ONCE on M1 history and never moves
 * at runtime. This brick is what lets the system "keep learning each day": it
 *   1. RECORDS every live graded signal (recordEntries),
 *   2. RESOLVES each one honestly from subsequent M1 bars — limit-fill first (did
 *      price actually reach the level?), then triple-barrier (TP vs SL) — so a
 *      signal that never filled is 'expired', not a free win (resolvePair),
 *   3. COMPARES realized after-cost expectancy vs the policy's claimed expectancy,
 *      per grade and per cell (ledgerStats) — the honest "is the edge holding up?",
 *   4. Produces a REFIT candidate from realized fills (refitFromLedger) you can
 *      review and promote — it never auto-overwrites the frozen policy.
 *
 * Pure: every function takes the ledger array in and returns a new one (or a
 * summary). No network, no DOM. The live engine loads/saves the ledger from KV.
 * Tested on synthetic bars in js/telegramV2.test.mjs.
 */

export const DEFAULT_LEDGER_OPTS = {
  maxRecords: 8000,           // cap the ledger; oldest resolved drop first
  maxAgeMs:   3 * 86400_000,  // unfilled/unresolved after 3 days → expired
  costPct:    0.012,          // round-trip cost subtracted from realized PnL (% of price)
};

// Stable key for a standing level so we don't re-record it every 30-min refresh.
const keyOf = (sym, cell, price) => `${sym}|${cell}|${price}`;

// ── 1) Record live signals ───────────────────────────────────────────────────
// Append any NEW (sym,cell,price) signal that isn't already present unresolved.
// entries = gradeLevelV2 output. ts = epoch ms.
export function recordEntries(ledger, sym, entries, ts, opts = {}) {
  const o = { ...DEFAULT_LEDGER_OPTS, ...opts };
  const out = ledger.slice();
  const openKeys = new Set(out.filter(r => r.outcome == null).map(r => keyOf(r.sym, r.cell, r.price)));
  for (const e of entries || []) {
    const k = keyOf(sym, e.cell, e.price);
    if (openKeys.has(k)) continue;                 // already tracking this standing level
    openKeys.add(k);
    out.push({
      id: `${k}|${ts}`, sym, cell: e.cell, price: e.price, direction: e.direction,
      decision: e.decision, grade: e.grade, side: e.cell.includes('_up|') ? 'up' : 'dn',
      policyExpectancy: e.expectancy, n: e.n, sl: e.sl, tp: e.tp,
      recordedAt: ts, filledAt: null, resolvedAt: null, outcome: null, realizedPct: null,
    });
  }
  // Cap: drop oldest RESOLVED first, then oldest overall.
  if (out.length > o.maxRecords) {
    out.sort((a, b) => (a.outcome == null) - (b.outcome == null) || a.recordedAt - b.recordedAt);
    return out.slice(out.length - o.maxRecords);
  }
  return out;
}

// ── 2) Resolve one pair's open records from its M1 bars ──────────────────────
// bars = oldest-first [{time(sec),open,high,low,close}]. nowTs = epoch ms.
// Limit-fill: the level must be TOUCHED after recordedAt to count; then TP/SL.
export function resolvePair(ledger, sym, bars, nowTs, opts = {}) {
  const o = { ...DEFAULT_LEDGER_OPTS, ...opts };
  if (!bars?.length) return ledger;
  return ledger.map(r => {
    if (r.sym !== sym || r.outcome != null) return r;
    const rec = { ...r };
    // Find fill: first bar after recordedAt whose range straddles the level.
    let fillIdx = -1;
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].time * 1000 <= rec.recordedAt) continue;
      if (bars[i].low <= rec.price && bars[i].high >= rec.price) { fillIdx = i; rec.filledAt = bars[i].time * 1000; break; }
    }
    if (fillIdx < 0) {
      if (nowTs - rec.recordedAt > o.maxAgeMs) { rec.outcome = 'expired'; rec.resolvedAt = nowTs; }
      return rec;
    }
    // Triple-barrier from the fill bar onward. Same-bar TP+SL → conservative loss.
    const isLong = rec.direction === 'long';
    for (let i = fillIdx; i < bars.length; i++) {
      const b = bars[i];
      const hitTp = isLong ? b.high >= rec.tp : b.low  <= rec.tp;
      const hitSl = isLong ? b.low  <= rec.sl : b.high >= rec.sl;
      if (hitSl) { rec.outcome = 'loss'; rec.resolvedAt = b.time * 1000; break; }   // conservative: SL checked first
      if (hitTp) { rec.outcome = 'win';  rec.resolvedAt = b.time * 1000; break; }
    }
    if (rec.outcome == null && nowTs - rec.recordedAt > o.maxAgeMs) { rec.outcome = 'timeout'; rec.resolvedAt = nowTs; }
    if (rec.outcome === 'win')  rec.realizedPct = +(Math.abs(rec.tp - rec.price) / rec.price * 100 - o.costPct).toFixed(5);
    if (rec.outcome === 'loss') rec.realizedPct = +(-Math.abs(rec.price - rec.sl) / rec.price * 100 - o.costPct).toFixed(5);
    if (rec.outcome === 'timeout') rec.realizedPct = +(-o.costPct).toFixed(5);   // closed flat at cost
    return rec;
  });
}

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

// ── 3) Realized vs policy expectancy, per grade ──────────────────────────────
export function ledgerStats(ledger) {
  const decided = ledger.filter(r => r.outcome === 'win' || r.outcome === 'loss' || r.outcome === 'timeout');
  const byGrade = {};
  for (const g of ['A+', 'A', 'B', 'C']) {
    const rs = decided.filter(r => r.grade === g);
    if (!rs.length) continue;
    const realized = rs.map(r => r.realizedPct ?? 0);
    byGrade[g] = {
      n: rs.length, wins: rs.filter(r => r.outcome === 'win').length,
      losses: rs.filter(r => r.outcome === 'loss').length,
      winRate: +(rs.filter(r => r.outcome === 'win').length / rs.length * 100).toFixed(1),
      realizedExpectancy: +mean(realized).toFixed(4),
      policyExpectancy:   +mean(rs.map(r => r.policyExpectancy ?? 0)).toFixed(4),
    };
  }
  return {
    total: ledger.length, decided: decided.length,
    open:    ledger.filter(r => r.outcome == null).length,
    expired: ledger.filter(r => r.outcome === 'expired').length,
    overallRealized: +mean(decided.map(r => r.realizedPct ?? 0)).toFixed(4),
    byGrade,
  };
}

// ── 4) Refit candidate from REALIZED fills (review, then promote — not auto) ──
// Aggregates realized after-cost PnL per cell. Only the taken decision is known
// (no counterfactual), so this UPDATES the expectancy estimate of the live policy
// from real fills; it doesn't flip fade↔follow.
export function refitFromLedger(ledger, { minN = 30 } = {}) {
  const decided = ledger.filter(r => (r.outcome === 'win' || r.outcome === 'loss' || r.outcome === 'timeout') && r.cell);
  const cells = {};
  for (const r of decided) (cells[r.cell] ??= []).push(r);
  const candidate = {};
  for (const [cell, rs] of Object.entries(cells)) {
    if (rs.length < minN) continue;
    candidate[cell] = {
      decision: rs[0].decision, n: rs.length,
      expectancy: +mean(rs.map(r => r.realizedPct ?? 0)).toFixed(4),
      revRate: +(rs.filter(r => r.outcome === 'win').length / rs.length * 100).toFixed(1),
      source: 'ledger-realized',
    };
  }
  return candidate;
}
