// js/boeSeries.js — Bank of England IADB series, shaped like FRED's.
//
// WHY: the GBP short rate on FRED (IR3TIB01GBM156N, OECD MEI mirror) stopped printing in January 2026, and
// every GBP spread/curve read kept forward-filling it as if it were current. The owner chose the Bank of
// England's own Bank Rate (IADB series IUDBEDR, daily) as the replacement, the same kind of swap made for CHF.
//
// A pseudo series id lets every caller of fetchFredObservations take it unchanged:
//   'BOE_<CODE>_M'  -> the IADB daily series averaged per calendar month, dated YYYY-MM-01 (FRED's monthly
//                      convention, which the 45-day publication-lag shift in the spread engines expects)
//   'BOE_<CODE>'    -> the daily series as published
// The current month is the average to date. Pure parsing is exported for tests.

const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const MON_NAMES = Object.keys(MON);

export const isBoeSeries = id => typeof id === 'string' && /^BOE_[A-Z0-9]+(_M)?$/.test(id);

/** IADB CSV ("DATE,IUDBEDR" then "02 Jan 2025,4.75") -> [{ date: 'YYYY-MM-DD', value }] ascending. */
export function parseIadbCsv(text) {
  const out = [];
  for (const l of String(text ?? '').trim().split('\n').slice(1)) {
    const [dt, v] = l.split(',');
    const m = String(dt ?? '').trim().match(/^(\d{2}) (\w{3}) (\d{4})$/);
    const x = parseFloat(v);
    if (m && MON[m[2]] && Number.isFinite(x)) out.push({ date: `${m[3]}-${MON[m[2]]}-${m[1]}`, value: x });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Daily points -> one point per calendar month (the mean), dated the 1st. */
export function monthlyMean(points) {
  const by = new Map();
  for (const p of points) { const k = p.date.slice(0, 7) + '-01'; const b = by.get(k) ?? { s: 0, n: 0 }; b.s += p.value; b.n++; by.set(k, b); }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, b]) => ({ date, value: +(b.s / b.n).toFixed(4) }));
}

export async function fetchBoeSeries(id, fromIso = '2000-01-01', { fetchImpl = fetch } = {}) {
  if (!isBoeSeries(id)) throw new Error(`not a BoE series id: ${id}`);
  const code = id.replace(/^BOE_/, '').replace(/_M$/, ''), monthly = id.endsWith('_M');
  const d = new Date(fromIso + 'T00:00:00Z');
  const from = `${String(d.getUTCDate()).padStart(2, '0')}/${MON_NAMES[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
  const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${from}&Dateto=now&SeriesCodes=${code}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  const r = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 MacroFXDashboard' }, signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`BoE ${code} HTTP ${r.status}`);
  const pts = parseIadbCsv(await r.text());
  if (!pts.length) throw new Error(`BoE ${code}: no observations`);
  return monthly ? monthlyMean(pts) : pts;
}
