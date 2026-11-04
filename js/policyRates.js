/**
 * Each central bank's policy rate, with its as-of date and source (Desk Terminal; the comparison point for the rate
 * expectations in js/cbExpectations.js).
 *
 * The rate-diff engine's `latestRate` is a 3-month interbank / short rate (the carry leg), not the policy rate. This
 * reads each bank's own published series instead:
 *   USD  FRED DFEDTARU                 Fed funds target range, upper bound (daily)
 *   EUR  FRED ECBDFR                   ECB deposit facility rate (daily)
 *   GBP  BoE IADB IUDBEDR              Bank Rate (daily)
 *   CAD  Bank of Canada Valet V39079   target for the overnight rate (daily)
 *   AUD  RBA statistical table F1      cash rate target (daily)
 *   CHF  SNB data portal snbgwdzid LZ  SNB policy rate
 *   JPY  BoJ data API FM01 STRDCLUCON  uncollateralised overnight call rate (the BoJ's operating target), daily average
 *   NZD  RBNZ decisions                OCR from the latest decision
 * (The OECD central-bank series on FRED stopped updating in 2023 for several of these, so they are not used.)
 *
 * The parsers are pure and tested (js/policyRates.test.mjs); policyRates() takes the fetchers.
 */
export const SOURCES = {
  USD: { label: 'Fed funds target (upper)', fred: 'DFEDTARU' },
  EUR: { label: 'ECB deposit rate', fred: 'ECBDFR' },
  GBP: { label: 'Bank Rate', fred: 'BOE_IUDBEDR' },
  CAD: { label: 'BoC overnight target', url: 'https://www.bankofcanada.ca/valet/observations/V39079/json?recent=5' },
  AUD: { label: 'RBA cash rate target', url: 'https://www.rba.gov.au/statistics/tables/csv/f1-data.csv' },
  CHF: { label: 'SNB policy rate', url: 'https://data.snb.ch/api/cube/snbgwdzid/data/csv/en' },
  JPY: { label: 'BoJ overnight call rate (operating target)', url: null },
  NZD: { label: 'RBNZ OCR' },
};
export const bojUrl = (now = new Date()) => { const d = new Date(now.getTime() - 40 * 864e5); return `https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=FM01&code=STRDCLUCON&startDate=${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
/** The latest point of a Map<date, value>. */
export const latest = m => { let best = null; for (const [d, v] of m ?? []) if (Number.isFinite(v) && (!best || d > best.date)) best = { date: d, value: v }; return best; };
/** Bank of Canada Valet JSON. */
export function parseBoc(json) {
  // Valet lists newest first: take the latest date, whatever the order
  const o = (json?.observations ?? []).filter(x => x?.V39079?.v != null && x.V39079.v !== '').sort((a, b) => String(a.d).localeCompare(String(b.d))).at(-1);
  return o ? { date: o.d, value: parseFloat(o.V39079.v) } : null;
}
/** RBA F1 CSV: the "Cash Rate Target" column, last row with a value (dates like 03-Nov-2026). */
export function parseRbaF1(csv) {
  const lines = String(csv ?? '').split(/\r?\n/), head = lines.find(l => /^Title,/.test(l));
  const col = head ? head.split(',').indexOf('Cash Rate Target') : -1; if (col < 1) return null;
  let best = null;
  for (const l of lines) { const c = l.split(','), m = /^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/.exec(c[0]); if (!m || c[col] === '' || c[col] == null) continue; const v = parseFloat(c[col]); const date = `${m[3]}-${MON[m[2]]}-${m[1]}`; if (Number.isFinite(v) && (!best || date > best.date)) best = { date, value: v }; }
  return best;
}
/** SNB data portal CSV ("date";"code";"value"), the policy rate rows (code LZ). */
export function parseSnb(csv, code = 'LZ') {
  let best = null;
  for (const l of String(csv ?? '').split(/\r?\n/)) { const c = l.split(';').map(x => x.replace(/"/g, '')); if (c[1] !== code) continue; const v = parseFloat(c[2]), date = c[0].slice(0, 10); if (Number.isFinite(v) && (!best || date > best.date)) best = { date, value: v }; }
  return best;
}
/** BoJ data API JSON: the last non-empty value. */
export function parseBoj(json) {
  const v = json?.RESULTSET?.[0]?.VALUES; if (!v?.SURVEY_DATES) return null;
  for (let i = v.SURVEY_DATES.length - 1; i >= 0; i--) { const x = v.VALUES[i]; if (x != null && x !== '' && Number.isFinite(+x)) { const d = String(v.SURVEY_DATES[i]); return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, value: +x }; } }
  return null;
}

/**
 * fred(id) → Promise<Map<date, value>>; getText(url) → Promise<string>; getJson(url) → Promise<object>; rbnz() → Promise<{ current }>.
 * Returns { rates: { CCY: { rate, asOf, source } }, errors: { CCY: message } }.
 */
export async function policyRates({ fred, getText, getJson, rbnz, now = new Date() }) {
  const rates = {}, errors = {};
  const put = (c, p, what) => { if (p && Number.isFinite(p.value)) rates[c] = { rate: p.value, asOf: p.date, source: `${SOURCES[c].label} · ${what}` }; else errors[c] = `${what}: no value`; };
  const job = async (c, fn, what) => { try { put(c, await fn(), what); } catch (e) { errors[c] = `${what}: ${e.message}`; } };
  await Promise.all([
    ...['USD', 'EUR', 'GBP'].map(c => job(c, async () => latest(await fred(SOURCES[c].fred)), SOURCES[c].fred.replace('BOE_', 'BoE '))),
    job('CAD', async () => parseBoc(await getJson(SOURCES.CAD.url)), 'Bank of Canada Valet'),
    job('AUD', async () => parseRbaF1(await getText(SOURCES.AUD.url)), 'RBA table F1'),
    job('CHF', async () => parseSnb(await getText(SOURCES.CHF.url)), 'SNB data portal'),
    job('JPY', async () => parseBoj(await getJson(bojUrl(now))), 'BoJ data API'),
    job('NZD', async () => { const r = await rbnz(); return Number.isFinite(r?.current?.rate) ? { date: r.current.date, value: r.current.rate } : null; }, 'RBNZ decisions'),
  ]);
  return { rates, errors };
}
