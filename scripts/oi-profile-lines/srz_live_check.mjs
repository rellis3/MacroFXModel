// Smoke test of the S/R zones read with live data, READ-ONLY (KV GETs + OANDA candles; nothing written).
//   railway run node scripts/oi-profile-lines/srz_live_check.mjs [pair=all]
// Wires createSrZones the way server.js does, minus the IV ladders, COT and desk card (left empty here).
import { createSrZones } from '../../js/srZonesRoutes.js';
import { cmeBookContracts } from '../../js/hedgingBooks.js';
import { hedgingScenario } from '../../js/hedgingScenario.js';
import { buildOiProfile } from '../../js/oiProfile.js';

const { CF_ACCOUNT_ID, CF_API_TOKEN } = process.env;
const NS = process.env.CF_KV_NAMESPACE_ID || '37e632371b754333bcbb33093f33b3bb';
const BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${NS}`;
const kv = { get: async k => { const r = await fetch(`${BASE}/values/${encodeURIComponent(k)}`, { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }); return r.ok ? r.text() : null; } };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
let fc = null;
for (const d of [today, new Date(Date.now() - 864e5).toISOString().slice(0, 10), new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)]) {
  const raw = await kv.get(`vol_forecast_${d}`); if (raw) { const j = JSON.parse(raw); fc = j.data ?? j; console.log('forecast', d); break; }
}
const ALIAS = { XAUUSD: 'GOLD', NAS100USD: 'NQ', SPX500USD: 'SPX500', US30USD: 'US30', US2000USD: 'US2000', DE30USD: 'DE30', UK100GBP: 'UK100' };
const fkOf = p => { const k = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const key = ALIAS[k] ?? k; return fc?.instruments?.[key] ? key : null; };
const OA = { 'EUR/USD': 'EUR_USD', 'GBP/USD': 'GBP_USD', 'USD/JPY': 'USD_JPY', 'AUD/USD': 'AUD_USD', 'XAU/USD': 'XAU_USD', 'USD/CAD': 'USD_CAD', 'USD/CHF': 'USD_CHF',
  'NAS100_USD': 'NAS100_USD', 'SPX500_USD': 'SPX500_USD', 'US30_USD': 'US30_USD', 'US2000_USD': 'US2000_USD' };
const srz = createSrZones({
  kv, getForecast: () => fc, forecastKeyForPair: fkOf, oandaFor: k => OA[k] ?? null,
  oiProfileFor: (sk, inst) => {
    const fk = fkOf(sk), sg = fk ? fc?.instruments?.[fk]?.ladder?.sigma_daily_pct : null;
    const dayMove = sg > 0 ? inst.spot * sg / 100 : null, rm = dayMove ?? inst.spot * 0.01;
    let hedge = null;
    try { const bk = cmeBookContracts(sk, inst, { maxDte: 3 }); if (bk) { const half = Math.min(0.08, Math.max(0.008, 3.1 * rm / inst.spot)); hedge = hedgingScenario(bk.contracts, { spot: bk.spot, lo: bk.spot * (1 - half), hi: bk.spot * (1 + half), n: 81, shifts: [-2, 0, 2, 4], optMult: 1, futMult: 1 }); } } catch { hedge = null; }
    const prof = buildOiProfile({ ...inst, pair: inst.pair || sk }, { sym: sk, hedge, dayMove, windowRm: 3 });
    return prof ? { gammaPeak: prof.levels.find(l => l.type === 'gamma_peak')?.price ?? null, regime: prof.regime ?? null, dayMove } : null;
  },
});
const r = await srz.build(process.argv[2] || 'all');
if (r.error) { console.error(r.msg); process.exit(1); }
for (const it of r.items) {
  const all = [...it.zones.resistance.slice().reverse().map(z => ['R', z]), ...it.zones.support.map(z => ['S', z])];
  const gp = all.filter(([, z]) => z.read?.gp);
  console.log(`\n${it.name} spot ${it.spot} regime ${it.regime} gammaPeak ${it.gammaPeak} zones ${all.length} gp-zones ${gp.length}`);
  for (const [s, z] of all.slice(0, 14)) console.log(`  ${s}${z.tier} ${z.lo.toFixed(it.digits)}-${z.hi.toFixed(it.digits)} ${z.read.call} | ${z.read.state} | ${z.sources.join(' + ').slice(0, 70)}`);
}
console.log('\nexport chars', r.text.length, 'parts', r.parts.length);
console.log(r.text.split('\n').slice(0, 4).join('\n'));
