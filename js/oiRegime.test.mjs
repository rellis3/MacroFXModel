// oiRegimeAtSpot / oiCtxFrom / oiContextByDate — the canonical pin-vs-breakout
// regime read (js/oi.js) and the shared oiCtx shaping used by both the live TDE
// path (server.js _tdeOiContext) and the offline backfill/fit path
// (oiContextByDate -> Trade_Decision_Engine/backfill.js's contextByDate.oi socket).
// Pure/offline — hand-built fixtures, no strike-ladder recomputation (that's
// oiGreeks.test.mjs / oi.js's gexFlipCrossings, exercised elsewhere).
//   node js/oiRegime.test.mjs
import { oiRegimeAtSpot, oiCtxFrom, oiContextByDate } from './oi.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

console.log('[oiRegimeAtSpot — band read from gexFlips]');
{
  // spot=100, default window is ±4% (no refMove) = [96,104]. Two in-range crossings:
  // 98 (long->short, i.e. long/pin BELOW it) and 102 (short->long, long/pin ABOVE it).
  // Bands: [96,98)=pin  [98,102)=breakout  [102,104]=pin. Spot sits in the middle band.
  const inst = { spot: 100, gex: 5, gexFlips: [{ price: 98, dir: 'long->short' }, { price: 102, dir: 'short->long' }] };
  const r = oiRegimeAtSpot(inst);
  ok('spot between two crossings reads the LOCAL band, not the whole-book sign', r.regime === 'breakout', JSON.stringify(r));
  ok('distToFlipPct is signed distance to the NEAREST crossing (98, tie broken to first)', r.distToFlipPct === -2, r.distToFlipPct);

  const noFlips = oiRegimeAtSpot({ spot: 100, gex: -3, gexFlips: [] });
  ok('no in-range crossings falls back to whole-book GEX sign (negative -> breakout)', noFlips.regime === 'breakout', JSON.stringify(noFlips));
  ok('no crossings -> distToFlipPct is null', noFlips.distToFlipPct === null);

  const pinBook = oiRegimeAtSpot({ spot: 100, gex: 4, gexFlips: [] });
  ok('positive net GEX with no crossings -> pin', pinBook.regime === 'pin');

  ok('no spot -> null', oiRegimeAtSpot({ gex: 1 }) === null);
  ok('no inst -> null', oiRegimeAtSpot(null) === null);
}

console.log('[oiCtxFrom — one shaping definition for live oi_store AND archived oi_history entries]');
{
  const liveInst = {
    spot: 100, gammaFlip: 90,   // stale cheap scalar — should be ignored in favour of gexFlips
    gexFlips: [{ price: 98, dir: 'long->short' }],
    callWalls: [{ strike: 105, oi: 900 }], putWalls: [{ strike: 95, oi: 700 }],
    pcRatio: 1.2, asOf: '2026-08-19T12:00:00Z',
  };
  const ctx = oiCtxFrom(liveInst);
  ok('flip sourced from nearest gexFlips crossing, not the stale gammaFlip scalar', ctx.flip === 98, ctx.flip);
  ok('side derives from spot vs the crossing (spot 100 > flip 98 -> positive/long-gamma)', ctx.side === 'positive', ctx.side);
  ok('walls carries both call and put walls with type tags', ctx.walls.length === 2 &&
    ctx.walls.some(w => w.price === 105 && w.type === 'call') && ctx.walls.some(w => w.price === 95 && w.type === 'put'));
  ok('pcRatio passed through', ctx.pcRatio === 1.2);
  // window [96,104], single crossing at 98 (long->short): band below it (96-98) is pin,
  // band above it (98-104, where spot=100 sits) is breakout.
  ok('regime falls back to oiRegimeAtSpot when not pre-stamped', ctx.regime === 'breakout', ctx.regime);

  // Archived oi_history summary shape (_oiHistorySummary, server.js) — same field
  // names by construction, PLUS a pre-computed `regime` from archival time.
  const archivedEntry = { ...liveInst, regime: 'breakout', savedAtMs: 1755000000000 };
  const ctx2 = oiCtxFrom(archivedEntry);
  ok('archived entry: pre-stamped regime wins over recompute', ctx2.regime === 'breakout');
  ok('archived entry: asOf falls back to savedAtMs when asOf is absent', oiCtxFrom({ ...archivedEntry, asOf: undefined }).asOf === 1755000000000);

  ok('no spot -> null (fail-neutral, matches server.js _tdeOiContext contract)', oiCtxFrom({ gex: 1 }) === null);
  ok('no resolvable flip (no gexFlips, no gammaFlip) -> null', oiCtxFrom({ spot: 100 }) === null);
}

console.log('[oiContextByDate — the contextByDate.oi socket backfill.js reads]');
{
  const perPairHistory = {
    '2026-08-18': { spot: 100, gammaFlip: 95, gexFlips: [], gex: 2, regime: 'pin' },
    '2026-08-19': { spot: 101, gammaFlip: 99, gexFlips: [], gex: -1, regime: 'breakout' },
    '2026-08-17': { spot: null },   // malformed capture — must be dropped, not crash the join
  };
  const byDate = oiContextByDate(perPairHistory);
  ok('two valid days produce two oiCtx entries', Object.keys(byDate).length === 2, Object.keys(byDate));
  ok('malformed day is dropped rather than crashing', !('2026-08-17' in byDate));
  ok('regime carried through per date', byDate['2026-08-18'].regime === 'pin' && byDate['2026-08-19'].regime === 'breakout');

  ok('empty/undefined history -> empty map, not a throw', Object.keys(oiContextByDate(undefined)).length === 0);
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nall passed');
process.exit(fails ? 1 : 0);
