// oiLevelExport.js
// Builds the plain-text paste block for the "OI Walls & Max Pain" TradingView
// indicator — the same copy-then-paste pattern as the Confluence-Zones export
// (`confluenceZoneExport.js` / `Confluence Zones Indicator.pine`).
//
// SINGLE SOURCE OF TRUTH: level extraction is NOT re-implemented here. It reuses
// the `oiStoreToLevels` brick (js/oiConfluence.js) — the exact same converter the
// OI bot and `/api/oi-levels` use — so the pasted levels are bit-identical to what
// the bots trade off. This module only *formats* those levels for the indicator.
//
// Output line format (per pair block):
//   OI 1.10000 : call_wall t3      (resistance ceiling — heavy call OI above)
//   OI 1.09480 : max_pain          (pin/magnet strike)
//   OI 1.09000 : put_wall t2       (support floor — heavy put OI below)
//   OI 1.09600 : gamma_flip        (long↔short-gamma regime boundary)
// `t{n}` = wall strength tier (3 = strongest); omitted for non-wall types and for
// walls with no tier. The indicator parses ONLY lines beginning with "OI " — every
// other line (headers, the per-pair `· saved …` context line) is ignored by it and
// exists purely so a human reading the paste can see how STALE each pair is.
//
// HONESTY: these levels are only as fresh as the user's last option-chain paste on
// the dashboard. The per-pair context line stamps that paste time + spot so a stale
// wall is never mistaken for a live one. Pairs with no CME options market never
// appear (the store simply has no entry for them) — no invented numbers.

import { oiStoreToLevels } from './oiConfluence.js';

// Canonical chart-ticker per oi_store key. Mirrors the Confluence-Zones indicator's
// normalisation targets so the same chart symbols the user already uses resolve here
// (the Pine side normalises the live chart symbol to these same names).
const CANON = {
  'XAU/USD': 'GOLD', 'NAS100_USD': 'NQ', 'SPX500_USD': 'SPX500',
  'DE30_USD': 'DE30', 'UK100_GBP': 'UK100', 'US30_USD': 'US30', 'US2000_USD': 'US2000',
};

// Which level types to export, in the order they should print within a block, and
// the price decimals per instrument class. Focus is the user's ask — the strongest
// call/put walls + max pain — plus gamma_flip (a cheap, useful regime boundary).
const TYPE_ORDER = ['call_wall', 'gamma_flip', 'max_pain', 'put_wall'];
const WANT = new Set(TYPE_ORDER);

const JPY_KEY = /JPY/i;
const INDEX_CANON = new Set(['NQ', 'SPX500', 'DE30', 'UK100', 'US30', 'US2000']);

function canonName(pair) {
  if (CANON[pair]) return CANON[pair];
  return String(pair).toUpperCase().replace(/[/_ ]/g, '');   // EUR/USD → EURUSD
}

function priceDp(pair, canon) {
  if (canon === 'GOLD' || INDEX_CANON.has(canon)) return 2;
  if (JPY_KEY.test(pair)) return 3;
  return 5;
}

function fmtSaved(inst) {
  const bits = [];
  if (inst?.savedAt) bits.push(`saved ${inst.savedAt}`);
  if (Number.isFinite(inst?.spot)) bits.push(`spot ${inst.spot}`);
  if (Number.isFinite(inst?.dte)) bits.push(`DTE ${inst.dte}`);
  return bits.length ? `· ${bits.join(' · ')}` : null;
}

// store = { [pair]: inst } (the `oi_store` KV `.data` object). Pure.
export function buildOILevelText(store, { topWalls = 2, generated = null } = {}) {
  const LW = 44;
  const hdr = '──── OI WALLS & MAX PAIN ' + '─'.repeat(Math.max(0, LW - 25));
  const lines = [hdr];
  lines.push(`Generated: ${generated ?? 'latest'}`);
  lines.push('Types: call_wall (red · resistance) · put_wall (green · support) · max_pain (yellow · magnet) · gamma_flip (purple)');
  lines.push('');

  const entries = Object.entries(store || {});
  let emitted = 0;
  for (const [pair, inst] of entries) {
    if (!inst || typeof inst !== 'object') continue;
    const levels = oiStoreToLevels(inst, { topWalls }).filter(l => WANT.has(l.type));
    if (!levels.length) continue;

    const canon = canonName(pair);
    const dp = priceDp(pair, canon);
    // Order by type group, then by price descending (top of the book first).
    levels.sort((a, b) => (TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)) || (b.price - a.price));

    lines.push(canon);
    const ctx = fmtSaved(inst);
    if (ctx) lines.push(ctx);
    for (const l of levels) {
      const tier = Number.isFinite(l.tier) && l.tier > 0 ? ` t${l.tier}` : '';
      lines.push(`OI ${l.price.toFixed(dp)} : ${l.type}${tier}`);
    }
    lines.push('');
    emitted++;
  }

  if (!emitted) lines.push('(no OI data — paste an option chain on the dashboard OI analyser first)', '');
  return lines.join('\n');
}
