// node js/srZones.test.mjs
import assert from 'node:assert/strict';
import { londonDay, londonOpen, volumeProfileLevels, oiLegs, forecastLegs, deskLegs, profileLegs, buildSrZones, gexContext, cotContext, gexPeakLegs, stretchContext, formatBlock, formatExport, splitParts, partsText, SRZ_HEADER, describeSrZone } from './srZones.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('London day follows Europe/London midnight across BST', () => {
  // 2026-07-01 23:30 UTC = 00:30 BST on 07-02
  assert.equal(londonDay(Date.UTC(2026, 6, 1, 23, 30) / 1000), '2026-07-02');
  // 2026-11-10 23:30 UTC = 23:30 GMT, still 11-10
  assert.equal(londonDay(Date.UTC(2026, 10, 10, 23, 30) / 1000), '2026-11-10');
});

t('londonOpen takes the 00:00 London bar', () => {
  const bars = [{ time: Date.UTC(2026, 6, 1, 22, 55) / 1000, open: 1 }, { time: Date.UTC(2026, 6, 1, 23, 0) / 1000, open: 2 }, { time: Date.UTC(2026, 6, 1, 23, 5) / 1000, open: 3 }];
  assert.equal(londonOpen(bars, '2026-07-02'), 2);
});

// synthetic M5 sessions: each day trades around a centre with tick volume peaking at the centre
function synthDay(dayUtc, centre, { bars = 100, amp = 4, vol = 100 } = {}) {
  const out = [];
  for (let i = 0; i < bars; i++) {
    const p = centre + amp * Math.sin(i / 7);
    out.push({ time: dayUtc / 1000 + 3600 + i * 300, open: p, high: p + 0.5, low: p - 0.5, close: p, volume: vol + (Math.abs(p - centre) < 1 ? 400 : 0) });
  }
  return out;
}
t('volume profile: nPOC naked only if no later session traded through', () => {
  const d = k => Date.UTC(2026, 10, 2 + k);
  const bars = [...synthDay(d(0), 100), ...synthDay(d(1), 120), ...synthDay(d(2), 140), ...synthDay(d(3), 101, { bars: 40 })];
  const vp = volumeProfileLevels(bars, { spot: 105, sigma: 20, today: '2026-11-05' });
  // day 0 POC ~100 is touched by today (97..105) → filled; 120 and 140 are naked
  const ps = vp.npoc.map(x => x.price);
  assert.ok(ps.some(p => Math.abs(p - 120) < 1.5) && ps.some(p => Math.abs(p - 140) < 1.5), JSON.stringify(vp.npoc));
  assert.ok(!ps.some(p => Math.abs(p - 100) < 2));
  assert.equal(vp.sessions, 3);
  assert.ok(Math.abs(vp.binWidth - 0.4) < 1e-12);
});
t('volume profile: HVNs at the busy prices, an LVN between them', () => {
  const d = k => Date.UTC(2026, 10, 2 + k);
  const bars = [];
  for (let k = 0; k < 5; k++) bars.push(...synthDay(d(k), 100), ...synthDay(d(k) + 6 * 3600e3, 110).map(b => ({ ...b, time: b.time + 0 })));
  const vp = volumeProfileLevels(bars, { spot: 105, sigma: 20, today: '2026-11-20' });
  assert.ok(vp.hvn.length >= 2, JSON.stringify(vp));
  const hv = vp.hvn.map(h => h.price).sort((a, b) => a - b);
  assert.ok(Math.abs(hv[0] - 100) < 1.5 && Math.abs(hv[hv.length - 1] - 110) < 1.5, JSON.stringify(hv));
  assert.ok(vp.lvn.length >= 1 && vp.lvn[0].price > 101 && vp.lvn[0].price < 109, JSON.stringify(vp.lvn));
});
t('volume profile: no volume → empty with a reason', () => {
  const vp = volumeProfileLevels([{ time: 1, high: 1, low: 1, volume: 0 }], { spot: 1, sigma: 1 });
  assert.equal(vp.npoc.length, 0); assert.match(vp.reason, /volume/);
});

const inst = { spot: 4130, exposures: { gex: -5 }, dayExpiry: { exposures: { gex: 3 } }, greeksFlow: { charmFlip: 4160, vannaFlip: null }, expectedMove: { upper: 4200, lower: 4060, dte: 14 } };
const levels = [{ price: 4111.6, type: 'put_wall', dte: 1 }, { price: 4150, type: 'call_wall' }, { price: 4090, type: 'gex_flip' }, { price: 4135, type: 'oi_volume' }, { price: 4100, type: 'hvl' }];
t('oiLegs: families, implied move, charm flip; volume/hvl dropped', () => {
  const L = oiLegs(levels, inst);
  assert.deepEqual(L.map(l => l.type).sort(), ['call_wall', 'charm_flip', 'exp_move_hi', 'exp_move_lo', 'gex_flip', 'hvl', 'put_wall']);
  assert.equal(L.find(l => l.type === 'gex_flip').family, 'gamma');
  assert.equal(L.find(l => l.type === 'put_wall').label, 'put wall 1d');
});
t('forecast / iv legs anchored at the open', () => {
  const lad = { oh: { p50: 1, p75: 2, p90: 3 }, ol: { p50: 1, p75: 2, p90: 3 } };
  const f = forecastLegs(lad, 4000), iv = forecastLegs(lad, 4000, 'iv');
  assert.equal(f.length, 6); assert.equal(f.find(l => l.type === 'fcst_p50_lo').price, 3960);
  assert.equal(iv[0].family, 'iv'); assert.match(iv[0].label, /^IV-adj/);
});
t('desk legs from cardPlan', () => {
  const card = { rating: 'LONG', size: 1, levels: { open: 4100, up: { p50: 4150 }, down: { p50: 4060 } }, plan: { zone: '4,085-4,092', invalidation: 'below 4,070' } };
  const L = deskLegs(card);
  assert.deepEqual(L.map(l => [l.price, l.label]), [[4085, 'desk long zone low'], [4092, 'desk long zone high'], [4070, 'desk invalidation']]);
  assert.deepEqual(deskLegs({ rating: 'FLAT' }), []);
});
t('zones: distance tiers, family count, sources; σ filter', () => {
  const legs = [...oiLegs(levels, inst), ...forecastLegs({ oh: { p50: 0.5 }, ol: { p50: 0.45 } }, 4130), ...profileLegs({ npoc: [{ price: 4090.8, date: '2026-11-04' }], hvn: [{ price: 4500 }], lvn: [] })];
  const z = buildSrZones({ spot: 4130, sigma: 40, legs });
  // 4111.6 put wall + 4111.4 forecast median low → T1 support, 2 families
  assert.equal(z.support[0].tier, 1);
  assert.deepEqual(z.support[0].families, ['oi', 'forecast']);
  assert.ok(z.support[0].sources.includes('put wall 1d') && z.support[0].sources.includes('forecast median low'));
  const t2 = z.support.find(s => s.families.includes('profile'));   // the GEX flip + nPOC zone (the HVL strike may sit nearer, as its own tier)
  assert.deepEqual(t2.families, ['gamma', 'profile']); assert.equal(t2.nFamilies, 2);
  assert.ok(z.support.every(s => s.dist <= 2.5)); assert.ok(!z.resistance.some(r => r.lo > 4300));   // HVN at 4500 is 9σ away
  assert.ok(z.support.length <= 6 && z.resistance.length <= 6);
});
t('context: gex prefers near-dated book; cot line', () => {
  assert.equal(gexContext(inst), 'pos pin');
  assert.equal(gexContext({ exposures: { gex: -2 } }), 'neg breakout');
  assert.equal(gexContext({}), null);
  assert.equal(cotContext({ pct: 82, share: 12.34, ageDays: 6 }), '82nd pct leaning long, specs net +12.3% of OI, 6d old');
  assert.equal(cotContext({ pct: 11 }), '11th pct leaning short');
});
t('text format: header, pipes, plain decimals, parts', () => {
  const zones = { support: [{ tier: 1, lo: 4111.6, hi: 4111.6, nFamilies: 2, sources: ['forecast median low', 'put wall'], dist: 0.5 }, { tier: 2, lo: 4089.4, hi: 4091.6, nFamilies: 3, sources: ['GEX flip', 'IV-adj median low', 'nPOC 11-04'], dist: 1.1 }], resistance: [] };
  const b = formatBlock({ name: 'GOLD', aliases: ['XAUUSD', 'GC1!'], spot: 4130.1, sigma: 35.2, basis: 23.3, date: '2026-11-10', digits: 2, gex: 'neg breakout', cot: 'a|b=c', desk: 'LONG', zones });
  const L = b.split('\n');
  assert.equal(L[0], 'SRZ|GOLD|XAUUSD,GC1!|spot=4130.10|sigma=35.20|basis=23.30|date=2026-11-10|gex=neg breakout|cot=a b:c|desk=LONG');
  assert.equal(L[1], 'S|1|4111.60|4111.60|2|forecast median low + put wall|0.50');
  assert.equal(L[2], 'S|2|4089.40|4091.60|3|GEX flip + IV-adj median low + nPOC 11-04|1.10');
  assert.equal(formatBlock({ name: 'USDJPY', aliases: [], spot: 150, sigma: 1, basis: null, date: 'd', digits: 3, zones }).split('\n')[0].includes('basis=na'), true);
  const txt = formatExport([{ name: 'A', aliases: [], spot: 1, sigma: 1, basis: 0, date: 'd', zones }], {});
  assert.ok(txt.startsWith('# ' + SRZ_HEADER));
  const big = formatExport(Array.from({ length: 12 }, (_, i) => ({ name: 'X' + i, aliases: ['A'.repeat(300)], spot: 1, sigma: 1, basis: 0, date: 'd', zones })));
  const parts = splitParts(big, 1000);
  assert.ok(parts.length > 1 && parts.every(p => p.length <= 1000));
  assert.ok(parts.slice(1).every(p => p.startsWith('SRZ|')));   // blocks are not cut
  assert.equal(parts.join('\n'), big);
  assert.match(partsText(parts), /^=====PART 1\/\d+=====\n/);
  assert.equal(describeSrZone(zones.support[1], 'S', 1), 'Support T2 4089.4–4091.6 · 3 families — GEX flip + IV-adj median low + nPOC 11-04');
});
console.log(`${n} tests passed`);
t('gamma peaks and the overbought/oversold read', () => {
  const pk = gexPeakLegs({ gexProfile: [{ strike: 4000, netGex: 5 }, { strike: 4050, netGex: 9 }, { strike: 3950, netGex: -7 }, { strike: 2000, netGex: 99 }] }, 4030);
  assert.deepEqual(pk.map(l => [l.price, l.type, l.family]), [[4050, 'gex_pos_peak', 'gamma'], [3950, 'gex_neg_peak', 'gamma']]);
  const s = stretchContext({ spot: 4028, open: 4110, sigma: 56, ladder: { oh: { p50: 0.6, p75: 1.0, p90: 1.5 }, ol: { p50: 0.6, p75: 1.0, p90: 1.5 } }, cot: { pct: 93 } });
  assert.equal(s.dayWord, 'oversold on the day'); assert.match(s.text, /past p90 low/); assert.match(s.cotWord, /COT overbought/);
  assert.equal(stretchContext({ spot: 4115, open: 4110, sigma: 56, ladder: { oh: { p50: 0.6, p75: 1.0, p90: 1.5 } } }).dayWord, 'inside the day range');
  assert.equal(stretchContext({}), null);
});
