// OI-CONF planner — coincidences, tolerance by σ, zone anchoring and sides.
//   node js/oiConf.test.mjs
import { OI_CONF_DEFAULTS, volLines, oiLevelList, findCoincidences, buildConfZones } from './oiConf.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

const stat = { up_p50: 4190, dn_p50: 4130, up_p75: 4215, dn_p75: 4105, up_p90: 4240, dn_p90: 4080 };
const dyn = { projHigh: { p50: 4193, p75: 4221, p90: 4250 }, projLow: { p50: 4128, p75: 4101, p90: 4076 } };
const vl = volLines({ staticLevels: stat, dynamic: dyn });
ok('12 vol lines: 6 static + 6 dynamic', vl.length === 12 && vl.filter(v => v.kind === 'static').length === 6 && vl.filter(v => v.kind === 'dynamic').length === 6);
ok('toggles drop a family', volLines({ staticLevels: stat, dynamic: dyn, useDynamic: false }).length === 6 && volLines({ staticLevels: stat, dynamic: dyn, rungs: ['p75'] }).length === 4);

const levels = [{ type: 'call_wall', price: 4191.5, tier: 'strong' }, { type: 'put_wall', price: 4129.2, tier: 'moderate' }, { type: 'gex_flip', price: 4160, tier: null }, { type: 'junk', price: 1 }];
const oi = oiLevelList(levels, { greeksFlow: { charmFlip: 4222, vannaFlip: null, dteDays: 2 }, expectedMove: { upper: 4300, lower: 4020, dte: 5 } });
ok('level list keeps wanted types, adds charm flip and implied-move edges', oi.length === 6 && oi.some(o => o.type === 'charm_flip') && !oi.some(o => o.type === 'vanna_flip') && oi.some(o => o.type === 'exp_move_lo'));

const sigma = 50, spot = 4160;
const { hits, near } = findCoincidences(oi, vl, 0.1 * sigma);   // tol 5
ok('coincidences found within tol', hits.length >= 3, hits.map(h => `${h.oi.type}@${h.oi.price}~${h.vol.name}`).join(', '));
ok('near-misses are 1×–2× tol', near.every(n => n.delta > 5 && n.delta <= 10));
const z = buildConfZones({ spot, sigmaPrice: sigma, hits });
ok('zones anchored at the OI level (stable id), not the moving vol line', z.zones.every(zz => oi.some(o => Math.abs(o.price - zz.level) < 1e-6)));
const up = z.zones.find(zz => Math.abs(zz.level - 4191.5) < 1e-6);
ok('fade: a zone above spot is a SELL, stop above, target below', up && up.side === 'sell' && up.sl > up.entry && up.tp1 < up.entry, JSON.stringify(up && { s: up.side, e: up.entry, sl: up.sl, tp: up.tp1 }));
ok('stop is 0.25σ and TP is 1R by default', up && Math.abs(up.sl - up.entry - 12.5) < 1e-6 && Math.abs(up.entry - up.tp1 - 12.5) < 1e-6);
const lo = z.zones.find(zz => Math.abs(zz.level - 4129.2) < 1e-6);
ok('fade: a zone below spot is a BUY', lo && lo.side === 'buy' && lo.sl < lo.entry && lo.tp1 > lo.entry);
const br = buildConfZones({ spot, sigmaPrice: sigma, hits, cfg: { style: 'break' } });
ok('break style flips the sides', br.zones.find(zz => Math.abs(zz.level - 4191.5) < 1e-6).side === 'buy' && br.zones.every(zz => zz.mode === 'break'));
ok('zones carry the confluence detail for the audit', up.confluence.vol.length >= 1 && up.confluence.tol === 5 && up.rationale.startsWith('CONFLUENCE'));
const far = buildConfZones({ spot: 3000, sigmaPrice: sigma, hits });
ok('zones beyond maxArmSigma are not armed but are reported', far.zones.length === 0 && far.tooFar.length > 0);
const close = buildConfZones({ spot: 4191.4, sigmaPrice: sigma, hits });
ok('a zone sitting on spot waits (no defined side)', close.tooClose.length >= 1 && !close.zones.some(zz => Math.abs(zz.level - 4191.5) < 1e-6));
ok('tolerance scales with σ, not pips (same setting, bigger σ → wider)', buildConfZones({ spot, sigmaPrice: 340, hits: [] }).tol === 34 && buildConfZones({ spot, sigmaPrice: 50, hits: [] }).tol === 5);
ok('fixed-pip tolerance overrides σ when set', buildConfZones({ spot, sigmaPrice: 50, hits: [], cfg: { tolPips: 2 }, pipSize: 1 }).tol === 2);
ok('minSources filters single-line coincidences', buildConfZones({ spot, sigmaPrice: sigma, hits, cfg: { minSources: 3 } }).zones.length < z.zones.length);
ok('degenerate input is safe', buildConfZones({ spot: 0, sigmaPrice: 0, hits }).zones.length === 0);
ok('defaults cover the requested universe', ['nq', 'gold', 'dow', 'rut', 'eurusd'].every(p => OI_CONF_DEFAULTS.pairs.includes(p)));
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
