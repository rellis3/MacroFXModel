// Synthetic test for the OI bot strategy (regime-switch planner). No network.
//   node js/oiZones.test.mjs
import { buildOIZones, explainNoZones } from './oiZones.js';

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

console.log('[Breakout OI-flow confirmation — building = backed, unwinding = weak/trim]');
{
  // Break UP through the call wall. If OI is BUILDING at 4300 → confirmed (no trim);
  // if the wall is LIQUIDATING → short-covering read, size trimmed ×0.85.
  const built = { events: [{ type: 'fresh_positioning', kind: 'call', strike: 4300 }] };
  const unwind = { events: [{ type: 'liquidation', kind: 'call', strike: 4300 }] };
  const zB = buildOIZones({ ...base, exposures: { gex: -5000 } }, 4200, { ...cfg, change: built });
  const zU = buildOIZones({ ...base, exposures: { gex: -5000 } }, 4200, { ...cfg, change: unwind });
  const upB = zB.find(x => x.mode === 'break' && x.side === 'buy');
  const upU = zU.find(x => x.mode === 'break' && x.side === 'buy');
  ok('building OI → "new longs (confirmed)" in rationale', /new longs \(confirmed\)/.test(upB.rationale), upB.rationale);
  ok('unwinding OI → "short covering (weak)" in rationale', /short covering \(weak\)/.test(upU.rationale), upU.rationale);
  ok('weak break is size-trimmed vs confirmed', upU.sizeFactor < upB.sizeFactor, `${upU.sizeFactor} < ${upB.sizeFactor}`);
  // No change data → no confirmation note, no trim (unchanged behaviour).
  const upNone = buildOIZones({ ...base, exposures: { gex: -5000 } }, 4200, cfg).find(x => x.mode === 'break' && x.side === 'buy');
  ok('no change data → no confirmation note', !/confirmed|weak\)/.test(upNone.rationale), upNone.rationale);
  ok('no change data → full size (== confirmed size)', upNone.sizeFactor === upB.sizeFactor, `${upNone.sizeFactor} == ${upB.sizeFactor}`);
}

console.log('[Path-blocking wall — a nearer wall between spot and the traded zone]');
{
  // Trade the STRONG call wall at 4300, but a MODERATE call wall sits at 4250 —
  // between spot 4200 and the entry. Price hits 4250 first → flag + trim entry size.
  const inst = { ...base, exposures: { gex: 5000 },
    callWalls: [{ strike: 4300, oi: 9000, tier: 'strong', mult: 3.2 }, { strike: 4250, oi: 5000, tier: 'moderate', mult: 2.0 }],
    putWalls:  [{ strike: 4100, oi: 8000, tier: 'strong', mult: 3.0 }] };
  const z = buildOIZones(inst, 4200, cfg);                    // minTier 'strong' → only 4300 traded
  const sell = z.find(x => x.side === 'sell' && x.level === 4300);
  ok('strong 4300 is still the traded wall (4250 moderate not traded)', sell && !z.some(x => x.level === 4250), z.map(x => x.level).join(','));
  ok('nearer 4250 wall flagged in the path', /moderate call wall 4250 in the path/.test(sell.rationale), sell.rationale);
  ok('blocker object carried on the zone', sell.blocker && sell.blocker.strike === 4250);
  const clear = buildOIZones({ ...inst, callWalls: [{ strike: 4300, oi: 9000, tier: 'strong', mult: 3.2 }] }, 4200, cfg).find(x => x.level === 4300);
  ok('no blocker → no path warning + full size', clear && !/in the path/.test(clear.rationale) && clear.sizeFactor > sell.sizeFactor,
    `${clear?.sizeFactor} > ${sell?.sizeFactor}`);
  // A weak (sub-blockMinTier) wall in the path does NOT trip it — avoids trivia.
  const weakInPath = buildOIZones({ ...inst, callWalls: [{ strike: 4300, oi: 9000, tier: 'strong' }, { strike: 4250, oi: 1000, tier: 'weak' }] }, 4200, cfg).find(x => x.level === 4300);
  ok('a WEAK path wall is ignored (below blockMinTier)', weakInPath && !/in the path/.test(weakInPath.rationale), weakInPath.rationale);
  // pathBlockCheck:false disables it entirely.
  const off = buildOIZones(inst, 4200, { ...cfg, pathBlockCheck: false }).find(x => x.level === 4300);
  ok('pathBlockCheck:false → no flag, no trim', off && !/in the path/.test(off.rationale) && off.sizeFactor === clear.sizeFactor, off.rationale);
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

console.log('[Trade the K nearest strong walls per side (PIN) — decoupled from display count]');
{
  // 10 strong call walls above + 10 strong put walls below. OI DECREASES with distance,
  // so here the nearest walls are also the strongest — PIN caps to the K NEAREST strong
  // walls (the active range), which in this synthetic coincides with highest-OI.
  const mk = (base, step, up) => Array.from({ length: 10 }, (_, i) =>
    ({ strike: base + (up ? 1 : -1) * step * (i + 1), oi: 9000 - i * 500, tier: 'strong', mult: 3 + i * 0.1 }));
  const many = { ...base, exposures: { gex: 5000 },
    callWalls: mk(4200, 25, true), putWalls: mk(4200, 25, false) };
  const capped = buildOIZones(many, 4200, { ...cfg, maxZonesPerSide: 3 }).filter(z => z.mode === 'fade');
  ok('caps to 3 fades per side (6 total), not all 20', capped.length === 6, `${capped.length}`);
  ok('keeps the NEAREST strong walls (4225 in, 4450 out)', capped.some(z => z.level === 4225) && !capped.some(z => z.level === 4450),
    capped.map(z => z.level).join(','));
  const uncapped = buildOIZones(many, 4200, { ...cfg, maxZonesPerSide: 0 }).filter(z => z.mode === 'fade');
  ok('maxZonesPerSide 0 → no cap (all 20 fade)', uncapped.length === 20, `${uncapped.length}`);
}

console.log('[Persistence — across-expiry durability boosts rank + size (breakout ranking)]');
{
  // Two strong call walls above price. The FARTHER one has slightly less OI but lives
  // across many expiries; persistenceWeight should lift it above the nearer transient.
  // Exercised in BREAKOUT because that path is strength-ranked (OI×durability); PIN is
  // distance-anchored (nearest wall = primary — see the nearest-primary test below).
  const inst = { ...base, exposures: { gex: -5000 },
    callWalls: [
      { strike: 4250, oi: 9000, tier: 'strong', mult: 3.1, persistence: 1 },   // transient near wall
      { strike: 4300, oi: 8500, tier: 'strong', mult: 3.0, persistence: 8 },   // durable far wall
    ],
    putWalls: [{ strike: 4100, oi: 8000, tier: 'strong', mult: 3.0, persistence: 6 }] };
  const z = buildOIZones(inst, 4200, { ...cfg, maxZonesPerSide: 1, persistenceWeight: 0.1, persistentDTE: 5 });
  const up = z.find(x => x.mode === 'break' && x.side === 'buy');
  ok('durable far wall outranks the transient near wall', up && up.level === 4300, `${up?.level}`);
  ok('durable wall gets the size bump (×1.15 on the strong 1.5×conc 1.2)', up.sizeFactor > 1.5, `${up.sizeFactor}`);
  ok('rationale flags durability', /durable 8exp/.test(up.rationale), up.rationale);
  const dn = z.find(x => x.mode === 'break' && x.side === 'sell');
  ok('durable put wall also flagged', dn && /durable 6exp/.test(dn.rationale), dn?.rationale);
  // With persistenceWeight 0, the higher-OI near wall wins instead.
  const z0 = buildOIZones(inst, 4200, { ...cfg, maxZonesPerSide: 1, persistenceWeight: 0 });
  ok('persistenceWeight 0 → pure-OI ranking (near wall wins)',
    z0.find(x => x.mode === 'break' && x.side === 'buy')?.level === 4250, `${z0.find(x => x.mode === 'break' && x.side === 'buy')?.level}`);
}

console.log('[PIN nearest-primary — the active pin boundary is the NEAREST strong wall]');
{
  // Two strong walls each side; the FAR ones are stronger/durable, the NEAR ones transient.
  // In PIN the bot fades the NEAREST first (primary, full size) and treats the further wall
  // as secondary (trimmed) — even though the far wall is stronger by OI×durability.
  const inst = { ...base, exposures: { gex: 5000 },
    callWalls: [
      { strike: 4250, oi: 7000, tier: 'strong', mult: 3.0, persistence: 1 },
      { strike: 4300, oi: 9000, tier: 'strong', mult: 3.2, persistence: 8 },
    ],
    putWalls: [
      { strike: 4150, oi: 7000, tier: 'strong', mult: 3.0 },
      { strike: 4050, oi: 9000, tier: 'strong', mult: 3.2 },
    ] };
  const z = buildOIZones(inst, 4200, { ...cfg, maxZonesPerSide: 4 });
  const sells = z.filter(x => x.side === 'sell').sort((a, b) => a.level - b.level);
  ok('nearest strong resistance (4250) is the PRIMARY fade', sells[0].level === 4250 && /primary/.test(sells[0].rationale), sells[0]?.rationale);
  ok('further resistance (4300) is SECONDARY + trimmed', sells[1].level === 4300 && /secondary/.test(sells[1].rationale) && sells[1].sizeFactor < sells[0].sizeFactor, `${sells[1]?.sizeFactor} < ${sells[0]?.sizeFactor}`);
  const buys = z.filter(x => x.side === 'buy').sort((a, b) => b.level - a.level);
  ok('nearest strong support (4150) is the PRIMARY fade', buys[0].level === 4150 && /primary/.test(buys[0].rationale), buys[0]?.rationale);
  ok('further support (4050) is SECONDARY + trimmed', buys[1].level === 4050 && /secondary/.test(buys[1].rationale) && buys[1].sizeFactor < buys[0].sizeFactor, `${buys[1]?.sizeFactor} < ${buys[0]?.sizeFactor}`);
  // cap=1 → only the nearest (primary) per side; the strong far wall is NOT armed.
  const z1 = buildOIZones(inst, 4200, { ...cfg, maxZonesPerSide: 1 });
  ok('cap=1 → nearest strong wall only (far strong wall dropped)', z1.some(x => x.level === 4250) && !z1.some(x => x.level === 4300),
    z1.filter(x => x.side === 'sell').map(x => x.level).join(','));
}

console.log('[Reachability — an entry beyond the implied move is flagged + trimmed]');
{
  // PIN with a strong wall inside the implied move (4230) and one well beyond it (4300).
  // expMove up-half = 50 (4200→4250): the 4300 fade sits ~2× that → flag + trim, kept armed.
  const inst = { ...base, exposures: { gex: 5000 },
    callWalls: [{ strike: 4230, oi: 8000, tier: 'strong', mult: 3 }, { strike: 4300, oi: 9000, tier: 'strong', mult: 3.2 }],
    putWalls: [{ strike: 4100, oi: 8000, tier: 'strong', mult: 3 }] };
  const em = { upper: 4250, lower: 4150 };
  const z = buildOIZones(inst, 4200, { ...cfg, maxZonesPerSide: 4, expMove: em, reachMult: 1.0, reachTrim: 0.7 });
  const near = z.find(x => x.level === 4230), far = z.find(x => x.level === 4300);
  ok('near fade (within implied move) is NOT flagged', near && !/unlikely to fill/.test(near.rationale), near?.rationale);
  ok('far fade (beyond implied move) flagged unlikely-to-fill', far && /unlikely to fill by expiry/.test(far.rationale), far?.rationale);
  ok('far fade sized down by reachTrim', far && far.sizeFactor < near.sizeFactor, `${far?.sizeFactor} < ${near?.sizeFactor}`);
  // No expMove + maxReachPips 0 → gate OFF (unchanged when IV wasn't pasted).
  const zoff = buildOIZones(inst, 4200, { ...cfg, maxZonesPerSide: 4 });
  ok('no expMove + maxReachPips 0 → no reach flag', !zoff.some(x => /unlikely to fill/.test(x.rationale)), 'off');
  // Pip fallback flags the far wall when no IV is present.
  const zpip = buildOIZones(inst, 4200, { ...cfg, maxZonesPerSide: 4, maxReachPips: 50 });
  ok('maxReachPips fallback flags the 100pt-away wall', /beyond 50pip reach/.test(zpip.find(x => x.level === 4300)?.rationale || ''), zpip.find(x => x.level === 4300)?.rationale);
}

console.log('[Fallback TP — a wall-less breakout gets a measured-move target]');
{
  // BREAKOUT with a single call wall above and nothing beyond it → break-buy has no
  // next-wall TP. Without fallback it's SL-only; with fallbackTpR it gets a measured move.
  const inst = { ...base, exposures: { gex: -5000 },
    callWalls: [{ strike: 4300, oi: 9000, tier: 'strong', mult: 3 }],   // outermost — no wall above
    putWalls:  [{ strike: 4100, oi: 8000, tier: 'strong', mult: 3 }] };
  const noTp = buildOIZones(inst, 4200, cfg).find(z => z.mode === 'break' && z.side === 'buy');
  ok('no fallback → breakout past the outermost wall is SL-only', noTp && noTp.tp1 == null, JSON.stringify(noTp));
  const withTp = buildOIZones(inst, 4200, { ...cfg, fallbackTpR: 2 }).find(z => z.mode === 'break' && z.side === 'buy');
  // entry 4320, sl 4295 → risk 25 → 2R above entry = 4370.
  ok('fallbackTpR=2 → TP = entry + 2×stop distance', withTp && Math.abs(withTp.tp1 - 4370) < 1e-6, `${withTp?.tp1}`);
  ok('fallback TP noted in rationale', /2R measured move/.test(withTp.rationale), withTp.rationale);
  // A trade that ALREADY has a wall-based TP is untouched by the fallback.
  const inst2 = { ...base, exposures: { gex: -5000 },
    callWalls: [{ strike: 4250, oi: 9000, tier: 'strong', mult: 3 }, { strike: 4350, oi: 8000, tier: 'strong', mult: 3 }],
    putWalls:  [{ strike: 4100, oi: 8000, tier: 'strong', mult: 3 }] };
  const hasWall = buildOIZones(inst2, 4200, { ...cfg, fallbackTpR: 2 }).find(z => z.mode === 'break' && z.level === 4250);
  ok('wall-based TP kept (fallback does not override it)', hasWall && hasWall.tp1 === 4350, `${hasWall?.tp1}`);
}

console.log('[Gamma-flow wiring — near-flip size haircut + regime-change warning]');
{
  const inst = { ...base, exposures: { gex: 5000 } };
  const baseZone = buildOIZones(inst, 4200, cfg).find(z => z.side === 'sell');
  const hair = buildOIZones(inst, 4200, { ...cfg, nearFlip: true }).find(z => z.side === 'sell');
  ok('nearFlip trims size (×0.85 vs baseline)', hair.sizeFactor < baseZone.sizeFactor, `${hair.sizeFactor} < ${baseZone.sizeFactor}`);
  const warn = buildOIZones(inst, 4200, { ...cfg, regimeWarning: 'flip migrating toward spot — regime change loading' }).find(z => z.side === 'sell');
  ok('regimeWarning appended to rationale', /⚠ flip migrating toward spot/.test(warn.rationale), warn.rationale);
  ok('no warning by default', !/⚠/.test(baseZone.rationale));
}

console.log('[explainNoZones — why an in-universe instrument produced 0 zones]');
{
  // Flat GEX → neither PIN nor BREAKOUT → the planner emits nothing; explain it.
  ok('flat GEX → "flat GEX" reason', /flat GEX/.test(explainNoZones({ ...base, exposures: { gex: 0 } }, 4200, cfg) || ''),
    explainNoZones({ ...base, exposures: { gex: 0 } }, 4200, cfg));
  // PIN but only WEAK walls (below minTier strong) → "no walls ≥ strong".
  const weak = { ...base, exposures: { gex: 5000 },
    callWalls: [{ strike: 4300, oi: 4000, tier: 'weak' }], putWalls: [{ strike: 4100, oi: 4000, tier: 'weak' }] };
  ok('only weak walls → "no walls ≥ strong"', /no walls ≥ strong/.test(explainNoZones(weak, 4200, cfg) || ''), explainNoZones(weak, 4200, cfg));
  // PIN with strong walls all on the WRONG side (call below price, put above) → no
  // resistance above and no support below → nothing to fade.
  const wrongSide = { ...base, exposures: { gex: 5000 },
    callWalls: [{ strike: 4100, oi: 9000, tier: 'strong' }], putWalls: [{ strike: 4300, oi: 9000, tier: 'strong' }] };
  ok('walls all on the wrong side → "no strong+ wall bracketing price"',
    /bracketing price/.test(explainNoZones(wrongSide, 4200, cfg) || ''), explainNoZones(wrongSide, 4200, cfg));
  // A healthy PIN that DOES produce zones → null (nothing to explain).
  ok('healthy PIN → null (zones exist, no reason needed)',
    explainNoZones({ ...base, exposures: { gex: 5000 } }, 4200, cfg) === null, `${explainNoZones({ ...base, exposures: { gex: 5000 } }, 4200, cfg)}`);
  // Guards: no data / no price.
  ok('no inst → "no OI data"', /no OI data/.test(explainNoZones(null, 4200, cfg) || ''));
  ok('no price → "no live price"', /no live price/.test(explainNoZones(base, 0, cfg) || ''));
  // Consistency: whenever the reason is null, buildOIZones actually returns zones (and vice-versa).
  const mkFade = (gex, cw, pw) => ({ ...base, exposures: { gex }, callWalls: cw, putWalls: pw });
  const cases = [
    mkFade(5000, [{ strike: 4300, oi: 9000, tier: 'strong' }], [{ strike: 4100, oi: 9000, tier: 'strong' }]),  // zones
    mkFade(0, base.callWalls, base.putWalls),                                                                    // flat → none
    weak, wrongSide,
  ];
  const consistent = cases.every(inst => {
    const n = buildOIZones(inst, 4200, cfg).length, reason = explainNoZones(inst, 4200, cfg);
    return n > 0 ? reason === null : typeof reason === 'string';
  });
  ok('reason===null ⇔ buildOIZones produced zones', consistent);
}

console.log('[Level-ladder TP — trade to the next structural level, not always max pain]');
{
  // OFF (default): classic targets — the base PIN fade aims TP1 at max pain 4200.
  const off = buildOIZones({ ...base, exposures: { gex: 5000 } }, 4200, cfg);
  ok('ladder OFF → PIN fade TP1 is max pain (unchanged)', off.find(x => x.side === 'sell').tp1 === 4200);

  // ON: TP1 becomes the NEAREST node in the profit direction. base nodes below the 4300
  // call wall = {call wall 4250, max pain 4200, put walls 4100/4050} → TP1 4250, TP2 4200.
  const on = buildOIZones({ ...base, exposures: { gex: 5000 } }, 4200, { ...cfg, levelLadderTP: true });
  const sell = on.find(x => x.side === 'sell'), buy = on.find(x => x.side === 'buy');
  ok('ladder ON → sell fade TP1 = nearest node below (call wall 4250)', sell.tp1 === 4250 && sell.tp2 === 4200, `${sell.tp1}/${sell.tp2}`);
  ok('sell rationale names the ladder nodes', /→ call wall 4250 then max pain 4200/.test(sell.rationale), sell.rationale);
  ok('ladder ON → buy fade TP1 = nearest node above (max pain 4200)', buy.tp1 === 4200 && buy.tp2 === 4250, `${buy.tp1}/${buy.tp2}`);

  // Flips + volume magnets are ladder nodes too. gamma flip 4180, vanna flip 4260,
  // vol magnet 4270 join walls + max pain.
  const rich = { ...base, exposures: { gex: 5000 }, volumeMagnets: [{ strike: 4270, volume: 5000 }] };
  const z = buildOIZones(rich, 4200, { ...cfg, levelLadderTP: true, gammaFlipLevel: 4180, vannaFlipLevel: 4260 });
  const s = z.find(x => x.side === 'sell'), b = z.find(x => x.side === 'buy');
  ok('sell fade TP1 = nearest below = vol magnet 4270, TP2 = vanna flip 4260', s.tp1 === 4270 && s.tp2 === 4260, `${s.tp1}/${s.tp2}`);
  ok('sell rationale cites the vol magnet + vanna flip', /vol magnet 4270 then vanna flip 4260/.test(s.rationale), s.rationale);
  ok('buy fade TP1 = nearest above = gamma flip 4180', b.tp1 === 4180 && b.tp2 === 4200, `${b.tp1}/${b.tp2}`);

  // Breakout with the ladder: a vol magnet ABOVE the outermost wall becomes the target
  // (classic would leave it TP-less → SL-only). entry 4320; nearest node above = 4400.
  const brk = { ...base, exposures: { gex: -5000 },
    callWalls: [{ strike: 4300, oi: 9000, tier: 'strong', mult: 3 }], putWalls: [{ strike: 4100, oi: 8000, tier: 'strong', mult: 3 }],
    volumeMagnets: [{ strike: 4400, volume: 4000 }] };
  const upClassic = buildOIZones(brk, 4200, cfg).find(x => x.mode === 'break' && x.side === 'buy');
  const upLadder = buildOIZones(brk, 4200, { ...cfg, levelLadderTP: true }).find(x => x.mode === 'break' && x.side === 'buy');
  ok('classic breakout past outermost wall → no TP', upClassic.tp1 == null);
  ok('ladder breakout → TP1 = vol magnet above (4400)', upLadder.tp1 === 4400, `${upLadder.tp1}`);
}

console.log('[Mode D — react at levels: trade between nodes, treated by regime]');
{
  const inst = { exposures: { gex: 5000 }, maxPain: 4200,   // PIN
    callWalls: [{ strike: 4300, oi: 9000, tier: 'strong' }, { strike: 4250, oi: 5000, tier: 'moderate' }],
    putWalls:  [{ strike: 4100, oi: 9000, tier: 'strong' }, { strike: 4150, oi: 5000, tier: 'moderate' }],
    volumeMagnets: [{ strike: 4270, volume: 5000 }] };
  // OFF by default → no react zones.
  ok('reactAtLevels OFF → no react zones', !buildOIZones(inst, 4200, cfg).some(z => z.mode === 'react'));
  // ON (PIN): react-fade at moderate walls + flips + volume magnet; strong walls stay Mode-A (no dup).
  const z = buildOIZones(inst, 4200, { ...cfg, reactAtLevels: true, gammaFlipLevel: 4210, gexFlipLevel: 4190, maxZonesPerSide: 10 });
  const react = z.filter(x => x.mode === 'react');
  ok('react zones are emitted', react.length > 0, `${react.length}`);
  ok('node ABOVE spot → react-fade SELL (resistance)', react.some(x => x.level === 4210 && x.side === 'sell') , react.map(x=>`${x.level}${x.side}`).join(','));
  ok('gamma flip is a react node (labelled)', react.some(x => x.level === 4210 && /gamma flip/.test(x.rationale)));
  ok('gex flip below spot → react-fade BUY (support)', react.some(x => x.level === 4190 && x.side === 'buy' && /gex flip/.test(x.rationale)));
  ok('volume magnet is a react node', react.some(x => x.level === 4270 && /vol magnet/.test(x.rationale)));
  ok('MODERATE wall traded by react (Mode A is strong-only)', react.some(x => x.level === 4250));
  ok('strong wall NOT duplicated (only the Mode-A fade at 4300 sell)', z.filter(x => x.level === 4300 && x.side === 'sell').length === 1);
  // PIN react = NOT regime-trimmed (the nearest node with no path-blocker is full size;
  // further nodes may still take the ×0.9 path-block trim — that's the blocker feature, not the regime).
  ok('PIN react nearest node (no blocker) = full size', react.find(x => x.level === 4210)?.sizeFactor === 1, `${react.find(x=>x.level===4210)?.sizeFactor}`);
  ok('PIN react never regime-trimmed to 0.6 (that is BREAKOUT only)', react.every(x => x.sizeFactor > 0.6));
  ok('react TP is the next node (level-to-level)', react.find(x => x.level === 4250 && x.side==='sell')?.tp1 != null);

  // BREAKOUT: react-fades are counter-trend → trimmed + annotated.
  const zb = buildOIZones({ ...inst, exposures: { gex: -5000 } }, 4200, { ...cfg, reactAtLevels: true, gammaFlipLevel: 4210, reactBreakoutTrim: 0.6, maxZonesPerSide: 10 });
  const rb = zb.filter(x => x.mode === 'react');
  ok('BREAKOUT react-fade trimmed (<1) + counter-trend note', rb.length && rb.every(x => x.sizeFactor < 1) && rb.every(x => /counter-trend/.test(x.rationale)), rb.map(x=>x.sizeFactor).join(','));
}

console.log('[Vanna + charm conditioners — treat the greeks as theory says]');
{
  const pin = { exposures: { gex: 5000 }, maxPain: 4200, callWalls: [{ strike: 4300, oi: 9000, tier: 'strong' }], putWalls: [{ strike: 4100, oi: 9000, tier: 'strong' }] };
  const brk = { ...pin, exposures: { gex: -5000 } };
  const fadeBase = buildOIZones(pin, 4200, cfg).find(x => x.mode === 'fade' && x.side === 'sell');
  const fadeTail = buildOIZones(pin, 4200, { ...cfg, vannaState: { state: 'tailwind', firing: true } }).find(x => x.mode === 'fade' && x.side === 'sell');
  const brkBase = buildOIZones(brk, 4200, cfg).find(x => x.mode === 'break' && x.side === 'buy');
  const brkTail = buildOIZones(brk, 4200, { ...cfg, vannaState: { state: 'tailwind', firing: true } }).find(x => x.mode === 'break' && x.side === 'buy');
  ok('vanna tailwind TRIMS a fade (reversion against the amplified move)', fadeTail.sizeFactor < fadeBase.sizeFactor && /vanna tailwind → size down/.test(fadeTail.rationale), `${fadeTail.sizeFactor}<${fadeBase.sizeFactor}`);
  ok('vanna tailwind BOOSTS a follow-break (continuation)', brkTail.sizeFactor > brkBase.sizeFactor && /vanna tailwind → size up/.test(brkTail.rationale), `${brkTail.sizeFactor}>${brkBase.sizeFactor}`);
  const fadeHead = buildOIZones(pin, 4200, { ...cfg, vannaState: { state: 'headwind', firing: true } }).find(x => x.mode === 'fade' && x.side === 'sell');
  ok('vanna headwind mirrors (boosts the fade)', fadeHead.sizeFactor > fadeBase.sizeFactor);
  ok('vanna not firing → no size change', buildOIZones(pin, 4200, { ...cfg, vannaState: { state: 'tailwind', firing: false } }).find(x => x.mode === 'fade').sizeFactor === fadeBase.sizeFactor);
  // Charm: near-expiry max-pain reversion amplified.
  const mpInst = { ...pin, expiries: { OG3: { dte: 1, maxPain: 4200 } } };
  const mp0 = buildOIZones(mpInst, 4260, cfg).find(x => x.mode === 'maxpain');
  const mpC = buildOIZones(mpInst, 4260, { ...cfg, charmActive: true }).find(x => x.mode === 'maxpain');
  ok('charm firing → max-pain reversion size boosted + noted', mpC.sizeFactor > mp0.sizeFactor && /charm firing/.test(mpC.rationale), `${mpC.sizeFactor}>${mp0.sizeFactor}`);
}

console.log('[Guards]');
ok('no inst / bad price → []', buildOIZones(null, 4200, cfg).length === 0 && buildOIZones(base, 0, cfg).length === 0);
ok('NEUTRAL gex (flat) → no fade/break zones', buildOIZones({ ...base, exposures: { gex: 0 } }, 4200, cfg).every(z => z.mode === 'maxpain'));

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
