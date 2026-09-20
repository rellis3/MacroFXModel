/**
 * The non-US 10-year yields, daily, from the issuers' own statistics offices.
 * FRED only mirrors these monthly (IRLTLT01*), which is useless for a chain
 * that judges 20-day moves; these are the free daily sources, each parsed to
 * ascending [{date:'YYYY-MM-DD', value:pct}]. Pure fetch + parse; the server
 * caches. Pre-registered use: MD files/NONUS_YIELDS.md.
 *
 *   gb10y  BoE IADB IUDMNZC        10-year nominal par yield     ~1-2 business days behind
 *   jp10y  MoF Japan jgbcme*.csv   10Y column                    ~1 day behind
 *   de10y  Bundesbank BBSIS ...R10XX  10-year Federal securities same day
 */

const UA = { 'User-Agent': 'Mozilla/5.0 MacroFXDashboard' };
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const _num = v => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; };
const _sortDedupe = rows => { const m = new Map(); for (const r of rows) if (r && r.value != null) m.set(r.date, r.value); return [...m].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([date, value]) => ({ date, value })); };

async function _text(url, timeoutMs = 30_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${new URL(url).host} HTTP ${r.status}`);
  return r.text();
}

/** BoE IADB CSV: "DATE,IUDMNZC" then "02 Jan 2008,4.4603". */
export function parseBoeCsv(text) {
  return _sortDedupe(text.trim().split('\n').slice(1).map(l => {
    const [dt, v] = l.split(','); const m = String(dt).trim().match(/^(\d{2}) (\w{3}) (\d{4})$/);
    return m ? { date: `${m[3]}-${MON[m[2]]}-${m[1]}`, value: _num(v) } : null;
  }));
}
export async function fetchGilt10(fromIso = '2008-01-01') {
  const d = new Date(fromIso); const from = `${String(d.getUTCDate()).padStart(2, '0')}/${Object.keys(MON)[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
  return parseBoeCsv(await _text(`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${from}&Dateto=now&SeriesCodes=IUDMNZC&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`));
}

/** MoF CSV: a title row, then "Date,1Y,2Y,...,10Y,...", rows "2026/9/17,1.581,...". Trailing note rows are skipped. */
export function parseMofCsv(text, tenor = '10Y') {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const hi = lines.findIndex(l => l.startsWith('Date,')); if (hi < 0) return [];
  const col = lines[hi].split(',').indexOf(tenor); if (col < 0) return [];
  return _sortDedupe(lines.slice(hi + 1).map(l => {
    const c = l.split(','); const m = String(c[0]).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    return m ? { date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, value: _num(c[col]) } : null;
  }));
}
export async function fetchJgb10({ history = true } = {}) {
  const base = 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/';
  const cur = parseMofCsv(await _text(base + 'jgbcme.csv'));
  if (!history) return cur;
  const all = parseMofCsv(await _text(base + 'historical/jgbcme_all.csv', 60_000));
  return _sortDedupe([...all, ...cur]);
}

/** Bundesbank CSV: header rows (name, decimals, ...), then "2026-09-18,3.52," — "." is a missing value. */
export function parseBubaCsv(text) {
  return _sortDedupe(text.split('\n').map(l => {
    const c = l.trim().split(','); const m = String(c[0]).match(/^(\d{4}-\d{2}-\d{2})$/);
    return m ? { date: m[1], value: _num(c[1]) } : null;
  }));
}
export async function fetchBund10() {
  return parseBubaCsv(await _text('https://api.statistiken.bundesbank.de/rest/download/BBSIS/D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A?format=csv&lang=en'));
}

export const INTL_YIELDS = {
  gb10y: { label: 'Gilt 10Y', source: 'Bank of England IADB (IUDMNZC)', fetch: fetchGilt10 },
  jp10y: { label: 'JGB 10Y',  source: 'Japan MoF (jgbcme)',              fetch: fetchJgb10 },
  de10y: { label: 'Bund 10Y', source: 'Bundesbank (BBSIS R10XX)',         fetch: fetchBund10 },
};
