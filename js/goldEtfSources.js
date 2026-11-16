// js/goldEtfSources.js: where /api/gold-etf-flow gets each gold trust's holdings. Pure apart from the injected fetch / xlsx loader, so it is tested with fakes.
//
// Why (2026-11-16): Yahoo's quoteSummary needs a cookie + crumb and Railway's egress is refused (live: 'Yahoo crumb HTTP 401'), so the series never started.
// The funds publish their own numbers, publicly, and they carry what we actually want: TONNES of gold held (a flow is the change in tonnes, not the change in
// dollars, which moves with the gold price). The chain per fund is therefore ISSUER FIRST (tonnes + net assets + as-of date), Yahoo second (net assets only).
//
//   GLD  SPDR Gold Shares: the historical archive workbook, https://api.spdrgoldshares.com/api/v1/historical-archive?product=gld&exchange=NYSE&lang=en
//        (the link on https://www.spdrgoldshares.com/usa/historical-data/). One xlsx, daily since 2004: Tonnes of Gold, Total Net Asset Value in the Trust.
//   IAU  iShares Gold Trust: the product page https://www.ishares.com/us/products/239561/ishares-gold-trust-fund carries 'Tonnes in Trust' and 'Net Assets of Fund'
//        with an as-of date in its page data. A page scrape, so it is the more fragile of the two: the parse is guarded and a miss is reported, not guessed.
// Both are public pages the issuers publish for investors; we read each once a day and keep our own history. Yahoo stays as the last resort for net assets.

const UA = 'Mozilla/5.0 (compatible; MacroFXDesk/1.0)';
export const SPDR_GLD_URL = 'https://api.spdrgoldshares.com/api/v1/historical-archive?product=gld&exchange=NYSE&lang=en';
export const ISHARES_IAU_URL = 'https://www.ishares.com/us/products/239561/ishares-gold-trust-fund';

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const p2 = n => String(n).padStart(2, '0');
/** '13-Nov-2026' or 'Nov 13, 2026' -> '2026-11-13'; null when it is neither. */
export function isoDate(s) {
  const t = String(s ?? '').trim();
  let m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(t);
  if (m && MON[m[2].toLowerCase()]) return `${m[3]}-${p2(MON[m[2].toLowerCase()])}-${p2(m[1])}`;
  m = /^([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4})$/.exec(t);
  if (m && MON[m[1].toLowerCase()]) return `${m[3]}-${p2(MON[m[1].toLowerCase()])}-${p2(m[2])}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}
const num = v => { const n = Number(String(v ?? '').replace(/[,$\s]/g, '')); return Number.isFinite(n) ? n : null; };

/** The SPDR archive sheet as rows (SheetJS sheet_to_json header:1) -> [{ date, tonnes, aum }] ascending; holiday and blank rows are skipped, never filled. */
export function parseSpdrArchive(rows) {
  const hi = rows.findIndex(r => String(r?.[0] ?? '').trim().toLowerCase() === 'date');
  if (hi < 0) throw new Error('SPDR archive: no Date header row');
  const head = rows[hi].map(c => String(c ?? '').toLowerCase());
  const ti = head.findIndex(h => h.startsWith('tonnes of gold')), ai = head.findIndex(h => h.startsWith('total net asset value'));
  if (ti < 0) throw new Error('SPDR archive: no "Tonnes of Gold" column');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const date = isoDate(r?.[0]), tonnes = num(r?.[ti]), aum = ai >= 0 ? num(r?.[ai]) : null;
    if (date && tonnes != null && tonnes > 0) out.push({ date, tonnes, aum: aum != null && aum > 0 ? aum : null });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!out.length) throw new Error('SPDR archive: no numeric rows');
  return out;
}

/** The iShares product page -> { tonnes, aum, asOf }. The page data holds "tonnes":{..."formattedValue":"460.81"...,"formattedAsOfDate":"Nov 13, 2026"...}. */
export function parseIsharesPage(html) {
  const t = String(html).replace(/&quot;/g, '"').replace(/&amp;/g, '&');   // the page data sits inside an attribute, so its quotes arrive as &quot;
  const grab = name => {
    const key = t.indexOf(`"${name}":{`);
    if (key < 0) return null;
    const seg = t.slice(key, key + 700), v = /"formattedValue":"([^"]*)"/.exec(seg), d = /"formattedAsOfDate":"([^"]*)"/.exec(seg);
    return v ? { value: num(v[1]), asOf: isoDate(d?.[1]) } : null;
  };
  const tn = grab('tonnes'), na = grab('totalNetAssetsFundLevel');
  if (!tn || tn.value == null || tn.value <= 0) throw new Error('iShares IAU page: no "Tonnes in Trust" value found');
  return { tonnes: tn.value, aum: na?.value != null && na.value > 0 ? na.value : null, asOf: tn.asOf ?? na?.asOf ?? null };
}

const getBuf = async (fetchImpl, url, { accept = '*/*', timeoutMs = 45_000 } = {}) => {
  const r = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
};

let GLD_CACHE = null;   // the archive is half a megabyte: one read serves the day
/** GLD: { rows (the full archive), last: { date, tonnes, aum } }. */
export async function fetchGldIssuer({ fetchImpl = fetch, loadXlsx = () => import('xlsx'), now = Date.now() } = {}) {
  if (GLD_CACHE && now - GLD_CACHE.at < 6 * 3600e3) return GLD_CACHE.v;
  const r = await getBuf(fetchImpl, SPDR_GLD_URL, { accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*' });
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('not an xlsx file (the answer was not a workbook)');
  const mod = await loadXlsx(), X = mod.default ?? mod;
  const wb = X.read(buf, { type: 'buffer' });
  const name = wb.SheetNames.find(n => /archive/i.test(n)) ?? wb.SheetNames[1] ?? wb.SheetNames[0];
  const rows = parseSpdrArchive(X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: null }));
  const v = { rows, last: rows[rows.length - 1] };
  GLD_CACHE = { at: now, v };
  return v;
}
export const resetGldCache = () => { GLD_CACHE = null; };

/** IAU: { tonnes, aum, asOf }. */
export async function fetchIauIssuer({ fetchImpl = fetch } = {}) {
  const r = await getBuf(fetchImpl, ISHARES_IAU_URL, { accept: 'text/html,*/*', timeoutMs: 60_000 });
  return parseIsharesPage(await r.text());
}

/**
 * One fund's latest point by the chain: issuer first (tonnes + net assets + as-of), then Yahoo (net assets only, as-of unknown).
 * Returns { ticker, aum, tonnes, asOf, source, history?, tried } or throws an Error whose message lists every source's reason.
 */
export async function fundPoint(ticker, { fetchImpl = fetch, loadXlsx, yahoo = null, now = Date.now() } = {}) {
  const tried = [];
  try {
    if (ticker === 'GLD') { const g = await fetchGldIssuer({ fetchImpl, loadXlsx, now }); return { ticker, aum: g.last.aum, tonnes: g.last.tonnes, asOf: g.last.date, source: 'spdr', history: g.rows, tried }; }
    if (ticker === 'IAU') { const i = await fetchIauIssuer({ fetchImpl }); return { ticker, aum: i.aum, tonnes: i.tonnes, asOf: i.asOf, source: 'ishares', tried }; }
    tried.push(`no issuer source for ${ticker}`);
  } catch (e) { tried.push(`${ticker === 'GLD' ? 'SPDR' : 'iShares'} ${String(e?.message ?? e).slice(0, 80)}`); }
  if (yahoo) {
    try { const aum = await yahoo(ticker); return { ticker, aum, tonnes: null, asOf: null, source: 'yahoo', tried }; }
    catch (e) { tried.push(String(e?.message ?? e).slice(0, 80)); }
  }
  throw new Error(`${ticker}: ${tried.join('; ')}`);
}
