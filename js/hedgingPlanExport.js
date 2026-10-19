/**
 * HEDGE PLAN → TRADINGVIEW. Today's dealer-hedging plan (js/hedgingPlan.js, /api/hedging-plan) as the same text block
 * `pine/OI Bot Trades.pine` draws, so one indicator shows the OI bot zones and the hedge plan:
 *
 *   ──── HEDGE PLAN ───────────────────────────
 *   Generated: 2026-10-19 13:40 UTC · plan Cboe index + ETF · lines persistence + IV
 *
 *   NQ
 *   · open 29446.50 · FOLLOW breaks (hedging speeds moves) · switch 29662.69 · backtest -0.03R
 *   TZ BUY follow 29891.14 29891.14 29708.57 30076.66 - armed 1.0
 *   TZ SELL follow 28995.97 28995.97 29207.98 28716.23 - armed 1.3
 *
 *   TZ <SIDE> <mode> <level> <entry> <sl> <tp> <tp2|-> <state> <R:R>
 *   state: armed  — waiting for the line
 *          open   — today's trade: triggered, still running
 *          done   — today's trade finished (or the other side, once one side has traded: one trade a day)
 *          primed — skipped: the line was touched before 08:00 London
 *
 * Prices are CFD (OANDA) terms. Pure; offline-testable.
 */
import { scorePlan, PLAN_WINDOW } from './hedgingPlan.js';

export const HEDGE_BLOCK = { NAS100_USD: 'NQ', SPX500_USD: 'SPX500', US2000_USD: 'US2000', XAU_USD: 'GOLD', US30_USD: 'US30' };
const num = (v, d = 2) => (Number.isFinite(Number(v)) && v !== null ? Number(v).toFixed(d) : '-');

/** Live state of each order from the session's bars so far ({t,o,h,l,c,lmin}); nowLmin = London minutes now. */
export function orderStates(plan, bars, nowLmin) {
  const st = Object.fromEntries(plan.orders.map(o => [o.trigger, 'armed']));
  if (!Array.isArray(bars) || !bars.length) return st;
  const r = scorePlan(plan, bars);
  if (r.reason === 'line touched before 08:00') { for (const k in st) st[k] = 'primed'; return st; }
  if (r.reason === 'first touch after 20:00' || (nowLmin != null && nowLmin >= PLAN_WINDOW[1] && !r.triggered)) { for (const k in st) st[k] = 'done'; return st; }
  if (!r.triggered) return st;
  const mine = plan.orders.find(o => o.side === r.side).trigger;
  for (const k in st) st[k] = 'done';
  st[mine] = r.how === 'close 22:00' && (nowLmin == null || nowLmin < 22 * 60) ? 'open' : 'done';
  return st;
}

/**
 * planResp — the /api/hedging-plan payload { date, markets: [{ pair, open, plan, error, stateAtOpen }] }
 * states   — optional { [pair]: { up: state, down: state } } from orderStates
 */
export function buildHedgePlanText(planResp, states = {}, { generated = null } = {}) {
  const ts = d => new Date(d).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const title = 'HEDGE PLAN';
  const out = [`──── ${title} ${'─'.repeat(28)}`, `Generated: ${ts(generated ?? Date.now())} · plan Cboe index + ETF (gold: GLD) · lines persistence + IV`];
  for (const m of planResp?.markets ?? []) {
    const name = HEDGE_BLOCK[m.pair];
    if (!name) continue;
    out.push('', name);
    const p = m.plan;
    if (!p) { out.push(`· no plan today (${String(m.error || 'unavailable').replace(/\s+/g, ' ').slice(0, 60)})`); continue; }
    const sw = p.notes.find(n => /switch point/.test(n))?.match(/\(([\d.]+)\)/)?.[1];
    out.push(`· open ${num(m.open)} · ${p.mode === 'follow' ? 'FOLLOW breaks (hedging speeds moves)' : 'FADE the edges (hedging calms moves)'}`
      + `${sw ? ` · switch ${num(sw)} inside the lines` : ''} · backtest -0.03R`);
    for (const o of p.orders) {
      const state = states[m.pair]?.[o.trigger] ?? 'armed';
      out.push(`TZ ${o.side.toUpperCase()} ${p.mode} ${num(o.entry)} ${num(o.entry)} ${num(o.stop)} ${num(o.target)} - ${state} ${o.rr ? o.rr.toFixed(1) : '-'}`);
    }
  }
  return out.join('\n');
}
