// Synthetic tests for js/positionBookHistory.js. No network, no clock.
//   node js/positionBookHistory.test.mjs
import {
  fineRow, emptyStore, parseStore, upsertFine, rollDaily, changeOver, approxBytes,
  FINE_DAYS, DAILY_MAX, BOOK_INSTRUMENTS, COLS,
} from './positionBookHistory.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const T0 = Date.parse('2026-09-11T12:00:00Z');
const H = 3600_000, D = 864e5;
// A summarisePositionBook() result at snapshot time t with crowding longPct.
const summ = (t, longPct, extra = {}) => ({
  time: new Date(t).toISOString(), spot: 1.16, longPct, staleShare: 20,
  pain: { longsUnderwaterPct: 40, shortsUnderwaterPct: 60 }, near: { positionsShare: 80 }, ...extra,
});

console.log('[fineRow — a compact row keyed by SNAPSHOT time]');
{
  const r = fineRow(summ(T0, 62.5));
  ok('is an array in COLS order', Array.isArray(r) && r.length === COLS.length);
  ok('t is the snapshot time, not now', r[0] === T0);
  ok('carries crowding, stale share, pain', r[2] === 62.5 && r[3] === 20 && r[4] === 40 && r[5] === 60);
  ok('no snapshot time -> null (cannot be placed on the grid)', fineRow({ spot: 1, longPct: 50 }) === null);
  ok('no crowding -> null', fineRow({ time: new Date(T0).toISOString(), longPct: null }) === null);
  ok('a row is small', JSON.stringify(r).length < 60, String(JSON.stringify(r).length));
}

console.log('[upsertFine — one row per snapshot, however often we poll]');
{
  const s = emptyStore();
  ok('appends', upsertFine(s, 'EUR_USD', fineRow(summ(T0, 60))).reason === 'appended');
  // The poller runs more often than the 20-minute grid on purpose, so the same
  // snapshot comes back several times. It must be stored once.
  ok('the same snapshot again is a no-op', upsertFine(s, 'EUR_USD', fineRow(summ(T0, 60))).changed === false);
  ok('and does not duplicate', s.byInstrument.EUR_USD.fine.length === 1);
  ok('the next grid point appends', upsertFine(s, 'EUR_USD', fineRow(summ(T0 + 20 * 60_000, 61))).reason === 'appended');
  upsertFine(s, 'EUR_USD', fineRow(summ(T0 - 20 * 60_000, 59)));
  ok('rows stay sorted by time regardless of arrival order', s.byInstrument.EUR_USD.fine.map(r => r[2]).join() === '59,60,61');
  ok('instruments are independent', upsertFine(s, 'XAU_USD', fineRow(summ(T0, 73))).reason === 'appended' && s.byInstrument.EUR_USD.fine.length === 3);
}

console.log('[rollDaily — fine becomes daily after FINE_DAYS, complete days only]');
{
  const s = emptyStore();
  // 20 days of 3 snapshots/day for one instrument.
  for (let day = 0; day < 20; day++) for (let k = 0; k < 3; k++) {
    // 12:00, 16:00, 20:00 — all inside the same UTC day (6h steps crossed midnight).
    upsertFine(s, 'EUR_USD', fineRow(summ(T0 - (19 - day) * D + k * 4 * H, 50 + day + k)));
  }
  const before = s.byInstrument.EUR_USD.fine.length;
  const now = T0 + 12 * H;   // later the same day as the newest row, so today is still incomplete
  const r = rollDaily(s, now);
  const inst = s.byInstrument.EUR_USD;
  ok('something rolled', r.changed === true);
  ok(`fine keeps roughly the last ${FINE_DAYS} days`, inst.fine.length < before && inst.fine.every(x => x[0] >= now - (FINE_DAYS + 1) * D), `${inst.fine.length} of ${before}`);
  ok('older days became daily rows', inst.daily.length > 0, String(inst.daily.length));
  const d0 = inst.daily[0];
  ok('a daily row carries last-of-day crowding', d0[2] === 52, String(d0[2]));            // day 0: 50,51,52 -> last 52
  ok('and the day mean / min / max', d0[6] === 51 && d0[7] === 50 && d0[8] === 52, `${d0[6]}/${d0[7]}/${d0[8]}`);
  ok('and how many snapshots it summarises', d0[9] === 3);
  ok('the newest (incomplete) day is NOT rolled', inst.daily.every(x => x[0] < new Date(now).toISOString().slice(0, 10)));
  ok('rolling again with nothing old is a no-op', rollDaily(s, now).changed === false);
}
{
  // Cap on daily from the OLD end.
  const s = emptyStore();
  const inst = (s.byInstrument.EUR_USD = { fine: [], daily: [] });
  for (let i = 0; i < DAILY_MAX + 5; i++) inst.daily.push([new Date(T0 - (DAILY_MAX + 5 - i) * D).toISOString().slice(0, 10), 1, 50, 0, 0, 0, 50, 50, 50, 1]);
  // Force a roll by giving it one old fine row.
  upsertFine(s, 'EUR_USD', fineRow(summ(T0 - (FINE_DAYS + 2) * D, 55)));
  rollDaily(s, T0);
  ok(`daily is capped at DAILY_MAX (${DAILY_MAX})`, inst.daily.length === DAILY_MAX, String(inst.daily.length));
  ok('the rolled row is present after the cap', inst.daily.some(x => x[2] === 55));
  ok('and it was the OLDEST rows that were trimmed', inst.daily[0][0] > new Date(T0 - (DAILY_MAX + 5) * D).toISOString().slice(0, 10));
}

console.log('[changeOver — vs 24h / 7d, and honest when there is nothing to compare]');
{
  const s = emptyStore();
  for (let h = 48; h >= 0; h--) upsertFine(s, 'EUR_USD', fineRow(summ(T0 - h * H, 50 + (48 - h) * 0.5)));
  const c24 = changeOver(s, 'EUR_USD', 24, T0);
  ok('24h change reads the fine rows', c24?.source === 'fine' && c24.delta === 12, JSON.stringify(c24));
  ok('nothing old enough -> null, not a fake 0', changeOver(s, 'EUR_USD', 24 * 30, T0) === null);
  ok('unknown instrument -> null', changeOver(s, 'NOPE', 24, T0) === null);
  // Beyond the fine window it falls back to daily.
  s.byInstrument.EUR_USD.daily.push([new Date(T0 - 10 * D).toISOString().slice(0, 10), 1.1, 40, 0, 0, 0, 40, 40, 40, 3]);
  const c7 = changeOver(s, 'EUR_USD', 24 * 8, T0);
  ok('a lookback past fine falls back to the daily row', c7?.source === 'daily' && c7.then === 40, JSON.stringify(c7));
}

console.log('[parseStore — corrupt is NOT empty]');
{
  ok('null -> a fresh empty store', parseStore(null).byInstrument && Object.keys(parseStore(null).byInstrument).length === 0);
  ok('a valid store round-trips', parseStore(JSON.stringify(emptyStore())).v === 1);
  ok('unparseable -> null so the caller refuses to write', parseStore('{oops') === null);
  ok('wrong shape -> null', parseStore('{"rows":[]}') === null);
}

console.log('[size — five years must fit one KV value]');
{
  const s = emptyStore();
  for (const inst of BOOK_INSTRUMENTS) {
    const x = (s.byInstrument[inst] = { fine: [], daily: [] });
    for (let i = 0; i < FINE_DAYS * 72; i++) x.fine.push([T0 - i * 20 * 60_000, 1.16035, 62.5, 20.4, 41.3, 58.7, 79.6]);
    for (let i = 0; i < DAILY_MAX; i++) x.daily.push(['2021-01-01', 1.16035, 62.5, 20.4, 41.3, 58.7, 61.8, 58.1, 66.2, 72]);
  }
  const mb = approxBytes(s) / 1e6;
  ok(`16 instruments x 14d fine x 5y daily is under 4 MB`, mb < 4, `${mb.toFixed(2)} MB`);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll positionBookHistory tests passed.');
