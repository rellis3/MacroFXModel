/**
 * The options book, read as a board row.
 *
 * WHERE THE DATA COMES FROM. Not a paste — `oi_recon/run_daily.bat` scrapes CME
 * QuikStrike on a schedule and writes KV directly, so the book lands once a day
 * around 05:40 UTC. Two routes carry it: `/api/oi-today` (the lean projection,
 * ~39KB) and `/api/oi-history` (the day-over-day archive, ~13KB). The raw
 * `oi_store` key is 851KB because it carries the scraped text blobs, and no page
 * should ever fetch it.
 *
 * WHAT THIS LAYER IS FOR. Every other tile on the scan says what a market DID.
 * This one says where price is sitting relative to where the options are — which
 * strikes carry the open interest, and how far away they are. That is a fact about
 * structure, and it is the only thing on the board sourced from positioning rather
 * than from price.
 *
 * WHAT IT IS EMPHATICALLY NOT. Max pain was tested properly on this desk on
 * 2026-09-10 and came back NULL: price does not pin to it into expiry. The walls
 * have not been tested at all. So every row here is descriptive, and the copy says
 * so — a wall is a place where a lot of contracts sit, not a place price stops.
 * Anyone reading this as support and resistance has misread it, and the wording is
 * built to make that misreading hard.
 *
 * ONE DAY OLD IS NORMAL; THREE IS NOT. The book is a once-daily snapshot, so it is
 * always somewhat stale by construction and that is fine. What is not fine is a
 * snapshot from before the weekend being read as this morning's — if the capture
 * machine was off, the data is silently old. `readBook` gates on the timestamp and
 * refuses rather than showing an age badge nobody reads.
 *
 * Pure: no fetch, no DOM. Tested in js/oiBoard.test.mjs.
 */

/** OI pair names → scan board keys, so a row can point at its tile. */
export const OI_TO_BOARD = {
  'EUR/USD': 'eurusd', 'GBP/USD': 'gbpusd', 'USD/JPY': 'usdjpy', 'AUD/USD': 'audusd',
  'USD/CAD': 'usdcad', 'USD/CHF': 'usdchf', 'XAU/USD': 'gold',
  'NAS100_USD': 'nq', 'SPX500_USD': 'spx', 'US2000_USD': 'r2k', 'US30_USD': null,
};

/** Display names, because 'NAS100_USD' is not what anyone calls it. */
export const OI_LABEL = {
  'EUR/USD': 'EUR/USD', 'GBP/USD': 'GBP/USD', 'USD/JPY': 'USD/JPY', 'AUD/USD': 'AUD/USD',
  'USD/CAD': 'USD/CAD', 'USD/CHF': 'USD/CHF', 'XAU/USD': 'Gold',
  'NAS100_USD': 'Nasdaq', 'SPX500_USD': 'S&P 500', 'US2000_USD': 'Russell 2000', 'US30_USD': 'Dow',
};

/** Hours past which a once-daily book is no longer "this morning's". */
export const BOOK_FRESH_H = 30;

const pct = (from, to) => (from == null || to == null || !(from > 0)) ? null : ((to - from) / from) * 100;
const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

/**
 * Turn the two OI routes into board rows.
 *
 * Returns `{ ok, rows, asOf, ageH, stale, reason }`. When the book is too old the
 * rows are still returned — a reader who wants to see a stale book may — but `stale`
 * is set and the page is expected to lead with that rather than bury it.
 */
export function readBook(oiToday, oiHistory, nowMs = Date.now()) {
  const pairs = oiToday?.pairs;
  if (!Array.isArray(pairs) || !pairs.length) return { ok: false, rows: [], reason: 'the options book has not been captured yet' };

  // `savedAt` is a UK-formatted string ("22/09/2026, 06:38:57"), not an ISO stamp,
  // so it is parsed explicitly rather than handed to Date() — which reads it as
  // a US date on some runtimes and silently lands in a different month.
  const stamps = pairs.map(p => parseSavedAt(p.savedAt)).filter(Boolean);
  const newest = stamps.length ? Math.max(...stamps) : null;
  const ageH = newest == null ? null : (nowMs - newest) / 3.6e6;
  const stale = ageH == null || ageH > BOOK_FRESH_H;

  const hist = oiHistory?.pairs ?? {};
  const normK = s => String(s).toLowerCase().replace(/[/_]/g, '');
  const histFor = pair => {
    const k = Object.keys(hist).find(x => normK(x) === normK(pair));
    return k ? hist[k] : null;
  };

  // ── the day-over-day archive can be degenerate, and it is today ────────────
  // `curDate` is set to the calendar day, but the capture job lands ~05:40 UTC.
  // Read the archive before that and today's entry is still a byte copy of
  // yesterday's, so EVERY delta is zero BY CONSTRUCTION -- not because the book
  // was flat. Live on 2026-09-23: all 11 markets returned totalOIChangePct 0,
  // flow "flat", matchedWalls 16, identical to the digit. Uniformity across
  // unrelated markets is the signature of a broken comparison, never of a quiet
  // market, so it is detected and refused rather than rendered as "flat".
  const histRows = Object.values(hist).filter(Boolean);
  const degenerate = histRows.length > 2 && histRows.every(h => (h?.deltas?.totalOIChangePct ?? 0) === 0);

  const rows = [];
  for (const p of pairs) {
    const spot = num(p.spot);
    if (spot == null) continue;
    // A strike more than half away from spot is a bad parse, not a level. Live on
    // 2026-09-23 the Dow's put wall came through as 21.55 against a 52,024 spot,
    // which would have drawn a band the width of the entire market. Drop the value
    // rather than render it -- a missing wall is honest, a nonsense one is not.
    const sane = v => { const n = num(v); return (n != null && n > 0 && Math.abs(n - spot) / spot <= 0.5) ? n : null; };
    const callWall = sane(p.callWall), putWall = sane(p.putWall), maxPain = sane(p.maxPain);
    const h = histFor(p.pair), d = degenerate ? null : (h?.deltas ?? null);
    const toCall = pct(spot, callWall), toPut = pct(spot, putWall);
    rows.push({
      pair: p.pair, label: OI_LABEL[p.pair] ?? p.pair, key: OI_TO_BOARD[p.pair] ?? null,
      spot, callWall, putWall, maxPain,
      toCall, toPut, toPain: pct(spot, maxPain),
      // "inside the book" = between the two heaviest strikes. Outside it means the
      // contracts that mattered are now behind price, which is a different picture.
      inside: (callWall != null && putWall != null) ? (spot <= callWall && spot >= putWall) : null,
      // width of the wall band as a share of spot -- a tight band and a wide one are
      // completely different structures and the raw distances hide that
      band: (callWall != null && putWall != null && spot > 0) ? ((callWall - putWall) / spot) * 100 : null,
      regime: p.regime ?? null, pcRatio: num(p.pcRatio), dte: num(p.dte),
      change: d ? {
        callWallShift: num(d.callWallShiftNet), putWallShift: num(d.putWallShiftNet), maxPainShift: num(d.maxPainShiftNet),
        oiChangePct: num(d.totalOIChangePct), flow: d.flow ?? null,
        classify: h?.classify ?? null, confirm: h?.confirm ?? null,
        days: num(h?.days), from: h?.prevDate ?? null, to: h?.curDate ?? null,
      } : null,
    });
  }
  rows.sort((a, b) => Math.abs(a.toCall ?? 99) - Math.abs(b.toCall ?? 99));
  return { ok: rows.length > 0, rows, asOf: newest, ageH, stale, count: rows.length };
}

/** "22/09/2026, 06:38:57" → epoch ms, or null. Day first, because the source is UK-formatted. */
export function parseSavedAt(s) {
  const m = String(s ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m.map(Number);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return Date.UTC(yyyy, mm - 1, dd, hh, mi, ss);
}

const fmtPx = v => v == null ? '—' : Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(2) : v.toFixed(4);
const fmtPct = v => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
export { fmtPx as fmtBookPx, fmtPct as fmtBookPct };

/**
 * What the book is worth saying out loud.
 *
 * Deliberately few and deliberately flat: this is the one part of the board with no
 * tested forward claim behind it at all, so it describes and stops. The max-pain
 * null is quoted in every finding that touches a magnet, because that is the exact
 * misreading this data invites.
 */
export function bookFindings(book, { limit = 2 } = {}) {
  if (!book?.ok) return [];
  const out = [];
  const NOT = 'This describes where the contracts sit, not where price goes. Max pain was tested properly on this desk (2026-09-10) and came back NULL — price does not pin to it into expiry — and the walls have not been tested at all. Read a wall as a crowded strike, never as support or resistance.';

  if (book.stale) {
    out.push({ kind: 'book-stale', rank: 9, title: 'The options book is older than a normal overnight',
      seen: book.ageH == null
        ? 'The capture carries no readable timestamp.'
        : `The newest strike data is ${Math.round(book.ageH)} hours old, past the ${BOOK_FRESH_H}-hour mark where a once-daily book stops being "this morning's".`,
      means: 'The book is scraped once a day by a job on a machine that has to be awake. When that machine misses a night, the previous capture stays in place and looks exactly like a fresh one — so the age is the only thing that tells you, and it is being told here rather than buried in a badge.',
      notMeans: 'It does not mean the numbers are wrong. They were right when they were taken. It means they describe an older market, and the further price has travelled since, the less the strikes below relate to where it is now.' });
  }

  // Price sitting outside the band it was written around is the genuinely notable
  // configuration -- the heavy strikes are now behind it.
  const outside = book.rows.filter(r => r.inside === false);
  if (outside.length) {
    const worst = outside.slice().sort((a, b) =>
      Math.min(Math.abs(b.toCall ?? 0), Math.abs(b.toPut ?? 0)) - Math.min(Math.abs(a.toCall ?? 0), Math.abs(a.toPut ?? 0)))[0];
    const above = worst.callWall != null && worst.spot > worst.callWall;
    out.push({ kind: 'book-outside', rank: 4 + outside.length, key: worst.key,
      title: outside.length > 1 ? `${outside.length} markets have traded outside their options book` : `${worst.label} has traded outside its options book`,
      seen: `${worst.label} is at ${fmtPx(worst.spot)}, ${above ? 'above' : 'below'} its heaviest ${above ? 'call' : 'put'} strike at ${fmtPx(above ? worst.callWall : worst.putWall)} (${fmtPct(above ? worst.toCall : worst.toPut)} away)${outside.length > 1 ? `, and ${outside.length - 1} other${outside.length > 2 ? 's are' : ' is'} in the same position` : ''}.`,
      means: 'The strikes carrying the open interest were written around a price range that no longer contains the market. Whatever hedging those contracts implied is now behind price rather than around it, so the book describes an argument that has already been settled — which is worth knowing precisely because the numbers still look authoritative.',
      notMeans: NOT });
  }

  // The book rebuilding overnight is the other thing worth a line: not the level,
  // but whether money actually moved.
  const moved = book.rows.filter(r => r.change && Math.abs(r.change.oiChangePct ?? 0) >= 5);
  if (moved.length) {
    const top = moved.slice().sort((a, b) => Math.abs(b.change.oiChangePct) - Math.abs(a.change.oiChangePct))[0];
    const grew = top.change.oiChangePct > 0;
    out.push({ kind: 'book-flow', rank: 3 + Math.abs(top.change.oiChangePct) / 10, key: top.key,
      title: grew ? `${top.label}: new positions were opened overnight` : `${top.label}: positions were closed overnight`,
      seen: `Total open interest in ${top.label} is ${fmtPct(top.change.oiChangePct)} against ${top.change.from ?? 'the prior capture'}${top.change.flow ? `, which the archive classes as "${top.change.flow}"` : ''}${moved.length > 1 ? `; ${moved.length - 1} other market${moved.length > 2 ? 's' : ''} moved by more than 5% too` : ''}.`,
      means: grew
        ? 'Open interest rising means contracts were CREATED — somebody took a new position rather than closing an old one. That is the difference between fresh money arriving and a crowd going home, and it is invisible in price.'
        : 'Open interest falling means contracts were CLOSED. A move on shrinking open interest is people leaving rather than arriving, which is the hollow version of the same candle.',
      notMeans: NOT });
  }

  return out.sort((a, b) => b.rank - a.rank).slice(0, limit);
}
