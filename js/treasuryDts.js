/**
 * Treasury General Account balance from the Daily Treasury Statement (Fiscal Data API, operating_cash_balance).
 *
 * The table has used three layouts, and the old parser matched only the first ("Federal Reserve Account"), so every
 * row from October 2021 on was dropped — the liquidity pulse ran on a TGA that stopped in 2021 (found 2026-11-01).
 *   ≤ 2021-09:  "Federal Reserve Account"                        → close_today_bal
 *   2021-10 → 2022-04:  "Treasury General Account (TGA)"         → close_today_bal
 *   2022-04 → :  "Treasury General Account (TGA) Closing Balance" → open_today_bal (close_today_bal reads "null")
 * Values are $ millions; returned in $ billions (matches RRPONTSYD).
 */
export function dtsTgaValue(row) {
  const t = String(row?.account_type ?? '').toLowerCase().trim();
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  let v = null;
  if (t.includes('federal reserve account')) v = num(row.close_today_bal);
  else if (t === 'treasury general account (tga)') v = num(row.close_today_bal);
  else if (t.startsWith('treasury general account (tga) closing balance')) v = num(row.close_today_bal) ?? num(row.open_today_bal);
  return v == null ? null : v / 1000;
}

export async function fetchDtsTga(fromDate, { fetchImpl = fetch } = {}) {
  const base = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance';
  const out = new Map();
  for (let page = 1; page <= 60; page++) {
    const params = new URLSearchParams({ filter: `record_date:gte:${fromDate}`, fields: 'record_date,account_type,close_today_bal,open_today_bal', sort: 'record_date', 'page[number]': String(page), 'page[size]': '1000' });
    const r = await fetchImpl(`${base}?${params}`, { signal: AbortSignal.timeout(25_000) });
    if (!r.ok) throw new Error(`Treasury DTS HTTP ${r.status}`);
    const json = await r.json(), rows = json.data ?? [];
    for (const row of rows) { const v = dtsTgaValue(row); if (v != null) out.set(row.record_date, v); }
    if (!rows.length || page >= (json.meta?.['total-pages'] ?? 1)) break;
  }
  return out;
}
