// js/cbLatestMeeting.js: which analysed document is a central bank's "latest"? (ECB, BoE and BoJ routes in server.js)
//
// Those three routes used to follow a `<bank>_latest` pointer that every analysis overwrote blindly, so a re-analysis of an
// OLDER meeting (or a late minutes / transcript / report) moved it backwards. Found live 2026-11-16: /api/boe/latest was the
// 2026-09-17 summary although the 2026-11-05 decision (Bank Rate 3.75 -> 4.00, BoE database IUDBEDR) was analysed, and
// /api/boj/latest was the 2026-07-31 opinions although the 09-18 and 10-30 meetings were analysed. The desk run then wrote
// "BoE held at 3.75%". FOMC fixed the same bug with this rule (server.js /api/fomc/latest); the factory banks use js/cbLatest.js.
//
// Rule: the NEWEST past meeting that has any analysis wins, headline document first (the decision statement), then the other
// kinds in `kindsOrder`. The stored pointer is only a fallback. Pure: the caller supplies `get(kind, date)`.

/** @param {{date:string}[]} meetings  the bank's calendar
 *  @param {string[]} kindsOrder        document kinds, headline first
 *  @param {(kind:string,date:string)=>Promise<any>} get   resolves the stored analysis or null
 *  @param {number} nowMs @param {number} window how many past meetings to look back through */
export async function latestAnalysisByMeeting({ meetings, kindsOrder, get, nowMs = Date.now(), window = 6 }) {
  const past = (meetings ?? []).filter(m => Date.parse(m.date + 'T00:00:00Z') <= nowMs).sort((a, b) => a.date.localeCompare(b.date)).slice(-window).reverse();
  for (const m of past) for (const kind of kindsOrder) {
    const a = await get(kind, m.date);
    if (a) return a;
  }
  return null;
}
