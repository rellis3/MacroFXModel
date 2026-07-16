// Synthetic test for the OI bot strategy (regime-switch planner). No network.
//   node js/oiZones.test.mjs
import { buildOIZones } from './oiZones.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// Gold-ish: spot 4200, max pain 4200, call wall 4300 (strong), put wall 4100 (strong).
const base = {
  maxPain: 4200,
  callWall: 4300, putWall: 4100,
  callWalls: [{ strike: 4300, oi: 9000, tier: 'strong', mult: 3.2 }, { strike: 4250, oi: 4000, tier: 'weak', mult: 1.4 }],
  putWalls: [{ strike: 4100, oi: 8000, tier: 'strong', mult: 3.0 }, { strike: 4050, oi: 4000, tier: 'weak', mult: 1.3 }],
  concentration: { read: 'concentrated', top5Pct: 62 },
};
const cfg = { pip: 1.0, minTier: 'strong', slBufferPips: 5, extendedPips: 30, breakPips: 20 };

console.log('[PIN regime — fade strong walls toward max pain]');
{
  const z = buildOIZones({ ...base, exposures: { gex: 5000 } }, 4200, cfg);   // +GEX → PIN
  const sell = z.find(x => x.side === 'sell'), buy = z.find(x => x.side === 'buy');
  ok('sell zone at the call wall (fade resistance)', sell && sell.mode === 'fade' && sell.level === 4300 && sell.entry === 4300);
  ok('sell SL structural above the wall', sell.sl === 4305);
  ok('sell TP1 = max pain (below)', sell.tp1 === 4200);
  ok('buy zone at the put wall (fade support)', buy && buy.level === 4100 && buy.tp1 === 4200);
  ok('only STRONG walls (weak 4250/4050 excluded)', !z.some(x => x.level === 4250 || x.level === 4050));
  ok('concentrated → size factor > 1', sell.sizeFactor > 1, `${sell.sizeFactor}`);
  ok('rationale explains it', /PIN.*call wall.*fade.*max pain/.test(sell.rationale), sell.rationale);
}

console.log('[BREAKOUT regime — follow wall breaks (squeeze)]');
{
  const z = buildOIZones({ ...base, exposures: { gex: -5000 } }, 4200, cfg);   // −GEX → BREAKOUT
  const up = z.find(x => x.mode === 'break' && x.side === 'buy');
  const dn = z.find(x => x.mode === 'break' && x.side === 'sell');
  ok('call wall → follow break UP past wall+breakPips', up && up.level === 4300 && up.entry === 4320);
  ok('put wall → follow break DOWN past wall−breakPips', dn && dn.level === 4100 && dn.entry === 4080);
  ok('break SL back inside the wall', up.sl === 4295 && dn.sl === 4105);
  ok('no fade zones in BREAKOUT', !z.some(x => x.mode === 'fade'));
}

console.log('[Max-pain reversion — near expiry + extended]');
{
  const inst = { ...base, exposures: { gex: 5000 }, expiries: { OG3: { dte: 1, maxPain: 4200 } } };
  // price 4260 = 60 away from pin 4200 (> extended 30) at 1 DTE → reversion sell.
  const z = buildOIZones(inst, 4260, cfg);
  const mp = z.find(x => x.mode === 'maxpain');
  ok('max-pain reversion fires ≤2 DTE + extended', mp && mp.side === 'sell' && mp.tp1 === 4200, JSON.stringify(mp));
  ok('rationale cites DTE + pin', /max-pain reversion.*1DTE/.test(mp.rationale), mp.rationale);
  // Not extended (price at pin) → no reversion.
  ok('no reversion when price sits at the pin', !buildOIZones(inst, 4205, cfg).some(x => x.mode === 'maxpain'));
}

console.log('[Filters — liquidating veto + established requirement]');
{
  const change = { events: [{ type: 'liquidation', kind: 'call', strike: 4300 }] };
  const z = buildOIZones({ ...base, exposures: { gex: 5000 } }, 4200, { ...cfg, change });
  ok('a liquidating call wall is NOT faded (may break)', !z.some(x => x.side === 'sell' && x.level === 4300));
  // requireEstablished: with no stability data, established walls are required → none qualify.
  const z2 = buildOIZones({ ...base, exposures: { gex: 5000 } }, 4200, { ...cfg, requireEstablished: true, stability: [] });
  ok('requireEstablished + no history → no fades', !z2.some(x => x.mode === 'fade'));
  const z3 = buildOIZones({ ...base, exposures: { gex: 5000 } }, 4200,
    { ...cfg, requireEstablished: true, stability: [{ kind: 'call', strike: 4300, established: true }] });
  ok('established call wall qualifies', z3.some(x => x.side === 'sell' && x.level === 4300));
}

console.log('[Trade the K strongest walls per side — decoupled from display count]');
{
  // 10 strong call walls above + 10 strong put walls below, sorted by OI (strongest first).
  const mk = (base, step, up) => Array.from({ length: 10 }, (_, i) =>
    ({ strike: base + (up ? 1 : -1) * step * (i + 1), oi: 9000 - i * 500, tier: 'strong', mult: 3 + i * 0.1 }));
  const many = { ...base, exposures: { gex: 5000 },
    callWalls: mk(4200, 25, true), putWalls: mk(4200, 25, false) };
  const capped = buildOIZones(many, 4200, { ...cfg, maxZonesPerSide: 3 }).filter(z => z.mode === 'fade');
  ok('caps to 3 fades per side (6 total), not all 20', capped.length === 6, `${capped.length}`);
  ok('keeps the STRONGEST (highest-OI) walls', capped.some(z => z.level === 4225) && !capped.some(z => z.level === 4450),
    capped.map(z => z.level).join(','));
  const uncapped = buildOIZones(many, 4200, { ...cfg, maxZonesPerSide: 0 }).filter(z => z.mode === 'fade');
  ok('maxZonesPerSide 0 → no cap (all 20 fade)', uncapped.length === 20, `${uncapped.length}`);
}

console.log('[Persistence — across-expiry durability boosts rank + size]');
{
  // Two strong call walls above price. The FARTHER one has slightly less OI but lives
  // across many expiries; persistenceWeight should lift it above the nearer transient.
  const inst = { ...base, exposures: { gex: 5000 },
    callWalls: [
      { strike: 4250, oi: 9000, tier: 'strong', mult: 3.1, persistence: 1 },   // transient near wall
      { strike: 4300, oi: 8500, tier: 'strong', mult: 3.0, persistence: 8 },   // durable far wall
    ],
    putWalls: [{ strike: 4100, oi: 8000, tier: 'strong', mult: 3.0, persistence: 6 }] };
  const z = buildOIZones(inst, 4200, { ...cfg, maxZonesPerSide: 1, persistenceWeight: 0.1, persistentDTE: 5 });
  const sell = z.find(x => x.side === 'sell');
  ok('durable far wall outranks the transient near wall', sell && sell.level === 4300, `${sell?.level}`);
  ok('durable wall gets the size bump (×1.15 on the strong 1.5×conc 1.2)', sell.sizeFactor > 1.5, `${sell.sizeFactor}`);
  ok('rationale flags durability', /durable 8exp/.test(sell.rationale), sell.rationale);
  const buy = z.find(x => x.side === 'buy');
  ok('durable put wall also flagged', buy && /durable 6exp/.test(buy.rationale), buy?.rationale);
  // With persistenceWeight 0, the higher-OI near wall wins instead.
  const z0 = buildOIZones(inst, 4200, { ...cfg, maxZonesPerSide: 1, persistenceWeight: 0 });
  ok('persistenceWeight 0 → pure-OI ranking (near wall wins)',
    z0.find(x => x.side === 'sell')?.level === 4250, `${z0.find(x => x.side === 'sell')?.level}`);
}

console.log('[Guards]');
ok('no inst / bad price → []', buildOIZones(null, 4200, cfg).length === 0 && buildOIZones(base, 0, cfg).length === 0);
ok('NEUTRAL gex (flat) → no fade/break zones', buildOIZones({ ...base, exposures: { gex: 0 } }, 4200, cfg).every(z => z.mode === 'maxpain'));

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
