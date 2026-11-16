// js/yahooFundAum.js: a fund's total net assets from Yahoo's quoteSummary, with the cookie + crumb Yahoo has required since 2024.
// The gold ETF flow feed (GLD + IAU combined AUM, /api/gold-etf-flow) called quoteSummary with no crumb and got HTTP 401 on every call,
// so its history never started (the series was empty on 2026-11-15) while the daily archive job quietly logged "fetch failed".
// Pure apart from the injected fetch: tested with a fake. The session (cookie + crumb) is cached for an hour and dropped on a 401/403.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
let SESSION = null, SESSION_UNTIL = 0;
export const resetYahooSession = () => { SESSION = null; SESSION_UNTIL = 0; };

const cookiesOf = r => {
  const list = typeof r.headers?.getSetCookie === 'function' ? r.headers.getSetCookie() : (r.headers?.get?.('set-cookie') ? [r.headers.get('set-cookie')] : []);
  return list.map(c => c.split(';')[0]).filter(c => c.includes('='));
};

/** { crumb, cookie }: the homepage sets the cookies, getcrumb returns the token. Throws with the HTTP status when either step fails. */
export async function yahooSession(fetchImpl = fetch, now = Date.now()) {
  if (SESSION && now < SESSION_UNTIL) return SESSION;
  const base = { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.9' };
  let jar = [];
  try { const r = await fetchImpl('https://finance.yahoo.com/', { headers: { ...base, Accept: 'text/html,*/*' }, signal: AbortSignal.timeout(15_000) }); jar = cookiesOf(r); }
  catch { /* the crumb call may still work without it */ }
  const cookie = () => jar.join('; ');
  const cr = await fetchImpl('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { ...base, Referer: 'https://finance.yahoo.com/', ...(jar.length ? { Cookie: cookie() } : {}) }, signal: AbortSignal.timeout(15_000) });
  if (!cr.ok) throw new Error(`Yahoo crumb HTTP ${cr.status}`);
  const crumb = (await cr.text()).trim();
  if (!crumb || crumb.startsWith('<') || crumb.length > 50) throw new Error(`Yahoo crumb: unexpected response (${crumb.length} chars)`);
  jar = [...jar, ...cookiesOf(cr)];
  SESSION = { crumb, cookie: cookie() }; SESSION_UNTIL = now + 3600e3;
  return SESSION;
}

/** totalAssets (USD) from a quoteSummary body; null when absent. A share-market-cap fallback is NOT used: for a physical trust it differs from AUM by the premium. */
export function parseFundAum(json) {
  const r = json?.quoteSummary?.result?.[0];
  const v = r?.defaultKeyStatistics?.totalAssets?.raw ?? r?.summaryDetail?.totalAssets?.raw ?? r?.price?.marketCap?.raw ?? null;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** One fund's AUM. One retry with a fresh session on 401/403 (an expired crumb). */
export async function fetchYahooFundAum(ticker, fetchImpl = fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await yahooSession(fetchImpl);
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,summaryDetail,price&crumb=${encodeURIComponent(s.crumb)}`;
    const r = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...(s.cookie ? { Cookie: s.cookie } : {}) }, signal: AbortSignal.timeout(20_000) });
    if (r.status === 401 || r.status === 403) { resetYahooSession(); if (attempt === 0) continue; }
    if (!r.ok) throw new Error(`Yahoo fund AUM ${ticker} HTTP ${r.status}`);
    const v = parseFundAum(await r.json());
    if (v == null) throw new Error(`Yahoo fund AUM ${ticker}: no totalAssets field found`);
    return v;
  }
  throw new Error(`Yahoo fund AUM ${ticker}: unauthorised after a fresh session`);
}
