/**
 * World policy rates (plans/DESK_ANALYST_PIPELINE.md §9af): every central bank in the BIS policy-rate dataset
 * (WS_CBPOL, monthly, about 39 banks: the G10 plus Brazil, Mexico, South Africa, Turkey, India, Korea, China,
 * Poland and the rest), keyless from stats.bis.org. It colours the whole world map on the Desk Terminal and gives the
 * rates analyst the global cycle: who is hiking, who is cutting, how far each has moved in 3 and 12 months.
 *
 * The desk's own eight banks keep their daily official series (js/policyRates.js); this is the wider picture and is
 * monthly (the BIS publishes the month's last value with a lag of a few weeks).
 *
 * Pure. Tested in js/worldRates.test.mjs.
 */
export const WORLD_RATES_URL = start => `https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.?startPeriod=${start}&format=csv`;

// ISO2 → [ISO 3166 numeric (the world-atlas ids), name, currency]. XM is the euro area: it colours every member.
export const AREAS = {
  AR: ['032', 'Argentina', 'ARS'], AU: ['036', 'Australia', 'AUD'], BR: ['076', 'Brazil', 'BRL'], CA: ['124', 'Canada', 'CAD'], CH: ['756', 'Switzerland', 'CHF'],
  CL: ['152', 'Chile', 'CLP'], CN: ['156', 'China', 'CNY'], CO: ['170', 'Colombia', 'COP'], CZ: ['203', 'Czechia', 'CZK'], DK: ['208', 'Denmark', 'DKK'],
  GB: ['826', 'United Kingdom', 'GBP'], HK: ['344', 'Hong Kong', 'HKD'], HU: ['348', 'Hungary', 'HUF'], ID: ['360', 'Indonesia', 'IDR'], IL: ['376', 'Israel', 'ILS'],
  IN: ['356', 'India', 'INR'], IS: ['352', 'Iceland', 'ISK'], JP: ['392', 'Japan', 'JPY'], KR: ['410', 'South Korea', 'KRW'], KW: ['414', 'Kuwait', 'KWD'],
  MA: ['504', 'Morocco', 'MAD'], MK: ['807', 'North Macedonia', 'MKD'], MX: ['484', 'Mexico', 'MXN'], MY: ['458', 'Malaysia', 'MYR'], NO: ['578', 'Norway', 'NOK'],
  NZ: ['554', 'New Zealand', 'NZD'], PE: ['604', 'Peru', 'PEN'], PH: ['608', 'Philippines', 'PHP'], PL: ['616', 'Poland', 'PLN'], RO: ['642', 'Romania', 'RON'],
  RS: ['688', 'Serbia', 'RSD'], RU: ['643', 'Russia', 'RUB'], SA: ['682', 'Saudi Arabia', 'SAR'], SE: ['752', 'Sweden', 'SEK'], TH: ['764', 'Thailand', 'THB'],
  TR: ['792', 'Turkey', 'TRY'], US: ['840', 'United States', 'USD'], ZA: ['710', 'South Africa', 'ZAR'], XM: [null, 'Euro area', 'EUR'],
};
export const EURO_MEMBERS = ['040', '056', '191', '196', '233', '246', '250', '276', '300', '372', '380', '428', '440', '442', '470', '528', '620', '703', '705', '724'];

/** BIS SDMX CSV (quoted fields with commas) → { AREA: [{ period, rate }] } sorted by period. */
export function parseCbpol(text) {
  const rows = [], s = String(text ?? '');
  let i = 0, field = '', row = [], q = false;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows[0] ?? [], A = head.indexOf('REF_AREA'), T = head.indexOf('TIME_PERIOD'), V = head.indexOf('OBS_VALUE');
  if (A < 0 || T < 0 || V < 0) throw new Error('BIS CBPOL CSV: unexpected header');
  const out = {};
  for (const r of rows.slice(1)) { const v = parseFloat(r[V]); if (!r[A] || !/^\d{4}-\d{2}$/.test(r[T] ?? '') || !Number.isFinite(v)) continue; (out[r[A]] ??= []).push({ period: r[T], rate: v }); }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.period.localeCompare(b.period));
  return out;
}

const back = (period, n) => { const [y, m] = period.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 - n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const at = (series, period) => { let v = null; for (const x of series) { if (x.period <= period) v = x.rate; else break; } return v; };
const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);

/** Per bank: the latest rate, its month, the change over 3 and 12 months (pp), and the cycle. */
export function worldRates(byArea, { staleMonths = 4 } = {}) {
  const latestAll = Object.values(byArea).map(s => s.at(-1)?.period).filter(Boolean).sort().at(-1);
  const banks = {};
  for (const [area, s] of Object.entries(byArea)) {
    const meta = AREAS[area]; if (!meta || !s.length) continue;
    const last = s.at(-1), ch3 = at(s, back(last.period, 3)), ch12 = at(s, back(last.period, 12));
    const d3 = ch3 == null ? null : last.rate - ch3, d12 = ch12 == null ? null : last.rate - ch12;
    const cycle = d3 == null ? 'unknown' : d3 >= 0.2 ? 'hiking' : d3 <= -0.2 ? 'cutting' : d12 != null && Math.abs(d12) >= 0.5 ? (d12 > 0 ? 'on hold after hikes' : 'on hold after cuts') : 'on hold';
    banks[area] = { area, iso: meta[0], name: meta[1], ccy: meta[2], rate: last.rate, asOf: last.period, change3m: r2(d3), change12m: r2(d12), cycle,
      stale: latestAll && back(latestAll, staleMonths) > last.period, spark: s.slice(-13).map(x => x.rate) };
  }
  const list = Object.values(banks).filter(b => !b.stale);
  const count = c => list.filter(b => b.cycle === c).length;
  return { asOf: latestAll, banks, summary: { banks: list.length, hiking: count('hiking'), cutting: count('cutting'), onHold: list.length - count('hiking') - count('cutting'),
    hikers: list.filter(b => b.cycle === 'hiking').map(b => b.area), cutters: list.filter(b => b.cycle === 'cutting').map(b => b.area) }, source: 'BIS central bank policy rates (WS_CBPOL), monthly' };
}

/** ISO numeric → the bank record (the euro area spread over its members), for the map. */
export function byIsoNumeric(wr) {
  const out = {};
  for (const b of Object.values(wr.banks ?? {})) { if (b.iso) out[b.iso] = b; else if (b.area === 'XM') for (const m of EURO_MEMBERS) out[m] = b; }
  return out;
}
