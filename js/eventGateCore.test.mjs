/**
 * eventGateCore tests — synthetic calendar, offline.
 * Run: node js/eventGateCore.test.mjs
 */
import { buildEventWindows, eventGate, pairCcys, parseFinnhubTimeUTC } from './eventGateCore.js';

let pass = 0, failCount = 0;
const ok = (name, cond) => cond ? (pass++, console.log(`  ✓ ${name}`))
                                : (failCount++, console.error(`  ✗ ${name}`));

console.log('[parseFinnhubTimeUTC]');
ok('space-separated timestamp parses as UTC (not local)',
   parseFinnhubTimeUTC('2026-07-03 12:30:00') === Date.UTC(2026, 6, 3, 12, 30, 0));
ok('garbage returns null', parseFinnhubTimeUTC('not a time') === null && parseFinnhubTimeUTC('') === null);

console.log('[pairCcys]');
ok('eurusd → EUR,USD', JSON.stringify(pairCcys('eurusd')) === '["EUR","USD"]');
ok('EUR_USD and EUR/USD parse the same', JSON.stringify(pairCcys('EUR_USD')) === JSON.stringify(pairCcys('EUR/USD')));
ok('XAU_USD → USD only (metal quote leg)', JSON.stringify(pairCcys('XAU_USD')) === '["USD"]');
ok('NAS100_USD → USD; DE30_EUR → EUR',
   JSON.stringify(pairCcys('NAS100_USD')) === '["USD"]' && JSON.stringify(pairCcys('DE30_EUR')) === '["EUR"]');

console.log('[buildEventWindows + eventGate]');
{
  // NFP 12:30 UTC, US high impact; a low-impact and a non-mapped-country event must be dropped.
  const cal = [
    { country: 'US', impact: 'high', time: '2026-07-03 12:30:00', event: 'Nonfarm Payrolls' },
    { country: 'US', impact: 'low',  time: '2026-07-03 14:00:00', event: 'Factory Orders' },
    { country: 'ZA', impact: 'high', time: '2026-07-03 09:00:00', event: 'SARB Rate' },
    { country: 'GB', impact: 'high', time: '2026-07-03 06:00:00', event: 'UK GDP' },
  ];
  const windows = buildEventWindows(cal, { preMin: 45, postMin: 15 });
  ok('only mapped high-impact events become windows', windows.length === 2);
  ok('windows sorted by start', windows[0].ccy === 'GBP' && windows[1].ccy === 'USD');

  const nfp = Date.UTC(2026, 6, 3, 12, 30, 0);
  const usdPair = pairCcys('eurusd'), gbpFree = pairCcys('audjpy');
  ok('inside pre-window (30m before NFP) → blackout for a USD pair',
     eventGate(usdPair, nfp - 30 * 60_000, windows).blackout === true);
  ok('window edge: exactly preMin before → blackout',
     eventGate(usdPair, nfp - 45 * 60_000, windows).blackout === true);
  ok('inside post-window (10m after) → blackout',
     eventGate(usdPair, nfp + 10 * 60_000, windows).blackout === true);
  ok('outside window (1h before) → clear',
     eventGate(usdPair, nfp - 60 * 60_000, windows).blackout === false);
  ok('past post-window (20m after) → clear',
     eventGate(usdPair, nfp + 20 * 60_000, windows).blackout === false);
  ok('pair with no event currency is never blacked out',
     eventGate(gbpFree, nfp, windows).blackout === false);
  ok('GBP window catches GBP crosses',
     eventGate(pairCcys('gbpjpy'), Date.UTC(2026, 6, 3, 6, 0, 0), windows).blackout === true);
  ok('reason names the currency and event',
     /USD.*Nonfarm/.test(eventGate(usdPair, nfp, windows).reason));
}

console.log(`\n${pass} passed, ${failCount} failed`);
if (failCount) process.exit(1);
