/**
 * OI BOT TRADES → TRADINGVIEW. The zones the OI bot is trading today, as a text block
 * for `pine/OI Bot Trades.pine` — the same paste-a-block pattern as the C+Z / OI export
 * and the Confluence Zones indicator. The indicator draws each zone as a position box
 * (entry, stop, target) to the right of the last bar, one beside the next, on whichever
 * chart it sits on.
 *
 * FORMAT (one block per instrument, block name = the Confluence Zones indicator's
 * symbol names so its ticker mapping carries over):
 *
 *   ──── OI BOT TRADES ────────────────────────
 *   Generated: 2026-10-13 07:56 UTC · plan CME · built 07:56 UTC
 *
 *   NQ
 *   · spot 30702.5 · regime PIN · DTE 1 · pin 30910.2
 *   TZ BUY maxpain 30910.20 30702.50 30494.80 30910.20 - armed 1.0
 *   TZ SELL fade 31209.50 31209.50 31224.00 31109.50 31000.00 primed 6.9
 *
 *   TZ <SIDE> <mode> <level> <entry> <sl> <tp1> <tp2|-> <state> <R:R>
 *   state: armed  — waiting for price
 *          open   — the bot holds a position on it now (its order comment carries the zone)
 *          done   — traded today and closed
 *          primed — skipped: price had already passed it when the plan loaded
 *
 * Max-pain zones fire at the LIVE price while price is still extended from the pin, and
 * the bot re-anchors their stop at that price — their entry/stop here are the plan's
 * (price at plan time). The indicator labels them "@mkt" so they read that way.
 *
 * Prices are the plan's: OANDA CFD terms, what the bot trades. Pure; offline-testable.
 */

import { zoneId, alreadyEntered } from './oiShadowExec.js';
import { resolveKey } from './instrumentRegistry.js';

// Plan key → the block name the Pine indicators resolve chart tickers to.
const BLOCK = { gold: 'GOLD', nq: 'NQ', spx: 'SPX500', dax: 'DE30', dow: 'US30', us30: 'US30', rut: 'US2000', uk100: 'UK100' };
export const tradesBlockName = key => BLOCK[key] || String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Decimals: JPY pairs 3, other FX 5, everything else (gold, indices) 2.
function digitsFor(key) {
  const k = String(key || '').toLowerCase();
  if (BLOCK[k]) return 2;
  if (/^[a-z]{6}$/.test(k)) return k.endsWith('jpy') ? 3 : 5;
  return 2;
}

const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v).toFixed(d) : '-');

// The state of one zone against the bot's status line + this instrument's open positions.
// (Max-pain ids match any level on the same side, so positions MUST be per instrument.)
function zoneState(z, line, positions) {
  const zid = zoneId(z);
  const tag = c => String(c || '').match(/\[([^\]~]+)/)?.[1] || null;
  const openTags = (positions || []).map(p => tag(p.comment)).filter(Boolean);
  if (openTags.some(t => t === zid || alreadyEntered(z, [t]))) return 'open';
  if (alreadyEntered(z, line?.entered || [])) return 'done';
  if ((line?.primed || []).some(p => p.zone_id === zid)) return 'primed';
  return 'armed';
}

/**
 * plan    — the `oi_bot_zones` (or `oi_bot_zones_cboe`) artifact: { generatedAt, instruments }
 * status  — `oi_bot_status` (optional): its `lines` say which zones fired / were primed and
 *           `mt5_positions` which are open now. Without it every zone reads "armed".
 * opts.source  — shown in the header ('CME' / 'Cboe shadow').
 * opts.generated — header timestamp (defaults to now).
 */
export function buildTradesText(plan, status = null, { source = 'CME', generated = null } = {}) {
  const ts = d => new Date(d).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const out = ['──── OI BOT TRADES ────────────────────────',
    `Generated: ${ts(generated ?? Date.now())} · plan ${source}${plan?.generatedAt ? ` · built ${ts(plan.generatedAt).slice(11)}` : ''}`];
  const inst = plan?.instruments || {};
  const lines = Array.isArray(status?.lines) ? status.lines : [];
  const positions = Array.isArray(status?.mt5_positions) ? status.mt5_positions : [];
  for (const [key, v] of Object.entries(inst)) {
    const zones = Array.isArray(v?.zones) ? v.zones : [];
    const d = digitsFor(key);
    out.push('', tradesBlockName(key));
    out.push(`· spot ${num(v.spot, d)} · regime ${v.regime || '-'} · DTE ${v.dte ?? '-'} · pin ${num(v.maxPain, d)}`
      + (v.stale ? ' · STALE OI' : '') + (zones.length ? '' : ` · no zones${v.diag?.reason ? ` (${String(v.diag.reason).replace(/\s+/g, ' ').slice(0, 60)})` : ''}`));
    const line = lines.find(l => l.instrument === key) || null;
    const mine = positions.filter(p => { try { return resolveKey(p.symbol) === key; } catch { return false; } });
    for (const z of zones) {
      const entry = Number(z.entry), sl = Number(z.sl);
      const tp = Number.isFinite(Number(z.tp1)) && z.tp1 != null ? Number(z.tp1) : Number.isFinite(Number(z.tp2)) && z.tp2 != null ? Number(z.tp2) : null;
      if (!Number.isFinite(entry) || !Number.isFinite(sl)) continue;
      const rr = tp != null && Math.abs(entry - sl) > 0 ? (Math.abs(tp - entry) / Math.abs(entry - sl)).toFixed(1) : '-';
      out.push(['TZ', String(z.side).toUpperCase(), z.mode, num(z.level, d), num(entry, d), num(sl, d),
        num(tp, d), z.tp1 != null && z.tp2 != null ? num(z.tp2, d) : '-', zoneState(z, line, mine), rr].join(' '));
    }
  }
  return out.join('\n');
}
