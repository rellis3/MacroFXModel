// Proves the full-table handling: parse cap raised past 100, and the compact
// re-parseable copy round-trips (reopen → re-analyse without the giant paste).
//   node js/oiStore.test.mjs
import { oiParseTable, oiParseChangeTable } from './oi.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) fails++; };

// A full CME-style chain: 260 strikes (was truncated at 100).
function fullChain(n = 260, base = 3000, step = 25) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const k = base + i * step;
    rows.push(`${k}\t${1000 + (i % 50) * 10}\t${900 + (i % 40) * 12}\t${(i % 7) - 3}\t${(i % 5) - 2}`);
  }
  return rows.join('\n');
}

console.log('[parse cap raised — full chain no longer truncated at 100]');
{
  const parsed = oiParseTable(fullChain(260));
  ok('parses well past 100 strikes', parsed.strikes.length === 260, `got ${parsed.strikes.length}`);
  // The cap is 4000, not the original 500. Gold's GC paste carries 924 strikes and
  // row 500 landed BELOW spot, so the old cap silently cut the book in half and took
  // the real walls with it. This asserts the chain that broke it survives intact —
  // an 800-row paste must come back whole, not truncated.
  ok('an 800-strike chain is not truncated', oiParseTable(fullChain(800)).strikes.length === 800);
  ok('still caps absurd pastes at MAX_STRIKE_ROWS', oiParseTable(fullChain(4500)).strikes.length === 4000);
}

console.log('[compact copy round-trips for reopen → re-analyse]');
{
  const parsed = oiParseTable(fullChain(200));
  // Build the compact copy exactly like processOIData does (pre-shift strikes).
  const compactOI = parsed.strikes.map((s, i) => `${s}\t${parsed.calls[i]}\t${parsed.puts[i]}`).join('\n');
  const compactChg = parsed.strikes.map((s, i) => `${s}\t${parsed.callChg[i] || 0}\t${parsed.putChg[i] || 0}`).join('\n');

  const re = oiParseTable(compactOI);
  ok('re-parse preserves every strike', re.strikes.length === parsed.strikes.length);
  ok('re-parse preserves strikes/calls/puts exactly',
    re.strikes.every((s, i) => s === parsed.strikes[i] && re.calls[i] === parsed.calls[i] && re.puts[i] === parsed.puts[i]));

  const chg = oiParseChangeTable(compactChg, re.strikes.length);
  ok('compact change table re-parses to the matching length', chg && chg.callChg.length === parsed.strikes.length);
  ok('change values preserved', chg && chg.callChg.every((v, i) => v === (parsed.callChg[i] || 0)));

  // Size win: the compact copy is far smaller than a realistic wide paste.
  const widePaste = parsed.strikes.map((s, i) =>
    `${s}\t${parsed.calls[i]}\t1.23\t0.45\t${parsed.puts[i]}\t2.34\t0.56\t${1000 + i}\t${2000 + i}\t0.12`).join('\n');
  ok('compact copy is much smaller than the wide paste', compactOI.length < widePaste.length / 2,
    `${compactOI.length} vs ${widePaste.length}`);
}

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
