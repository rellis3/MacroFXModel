// Tests for js/cotState.js.   node js/cotState.test.mjs
import * as S from './cotState.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// sign convention
ok('JPY/CAD/CHF feed values turn back into currency terms', S.toCcyTerms('JPY', 5) === -5 && S.toCcyTerms('CAD', -2) === 2 && S.toCcyTerms('EUR', 3) === 3);
ok('percentile flips around 50 for flipped rows only', S.pctToCcyTerms('CHF', 95) === 5 && S.pctToCcyTerms('GBP', 95) === 95);
ok('toCcyRow turns a JPY row into long-yen terms and leaves EUR alone', S.toCcyRow({ sym: 'JPY', specNet: 10, specSharePct: 92, amShare: -5, splitChg4w: 3 }).specNet === -10 && S.toCcyRow({ sym: 'JPY', specSharePct: 92 }).specSharePct === 8 && S.toCcyRow({ sym: 'JPY', amShare: -5 }).amShare === 5 && S.toCcyRow({ sym: 'EUR', specNet: 10 }).specNet === 10);
ok('USDJPY maps to the JPY row (already in USDJPY terms)', S.COT_ROW_FOR.USDJPY === 'JPY' && S.COT_ROW_FOR.SPX500 === 'ES');

// the map
const c = x => S.classifyCot(x);
ok('A: crowded with an uptrend, still running, still building', c({ pct: 95, share: 30, share4: 25, move13: 0.05, move4: 0.01 }).state === 'A');
ok('B: crowded, 4-week move against the trend, still building', c({ pct: 95, share: 30, share4: 25, move13: 0.05, move4: -0.01 }).state === 'B');
ok('C: crowded, price still running, crowd leaving', c({ pct: 95, share: 30, share4: 35, move13: 0.05, move4: 0.01 }).state === 'C');
ok('D: crowded, pulling back while the crowd leaves', c({ pct: 95, share: 30, share4: 35, move13: 0.05, move4: -0.01 }).state === 'D');
ok('short side mirrors: crowded short in a downtrend, pullback up, shorts covering = D', c({ pct: 4, share: -30, share4: -36, move13: -0.05, move4: 0.01 }).state === 'D');
ok('crowded against the trend', c({ pct: 95, share: 30, share4: 25, move13: -0.05, move4: -0.01 }).zone === 'against');
ok('trimmed: extreme percentile, net on the other side', c({ pct: 95, share: -3, share4: 0, move13: 0.05, move4: 0 }).zone === 'trimmed');
ok('leaning with / against / neutral by percentile in trend terms',
  c({ pct: 80, share: 10, move13: 0.05, move4: 0 }).zone === 'leaningWith' && c({ pct: 80, share: 10, move13: -0.05, move4: 0 }).zone === 'leaningAgainst'
  && c({ pct: 50, share: 1, move13: 0.05, move4: 0 }).zone === 'neutral');
ok('no price trend: no state is claimed', c({ pct: 95, share: 30, share4: 25, move13: 0, move4: 0 }).state === null);
ok('missing percentile: no read at all', c({ pct: null, share: 3 }) === null);

// wording carries the evidence and never a direction
const keys = Object.keys(S.STATE_TEXT);
ok('every scored state cites its ledger id', ['A', 'B', 'D', 'against'].every(k => /^cot-crowding-/.test(S.STATE_TEXT[k].ev)));
ok('only D is worded as a measured finding', S.STATE_TEXT.D.verdict === 'validated' && keys.filter(k => S.STATE_TEXT[k].verdict === 'validated').length === 1);
ok('no line tells anyone to buy or sell', keys.every(k => !/\b(buy|sell|go long|go short|fade|enter|exit)\b/i.test(S.STATE_TEXT[k].line + S.STATE_TEXT[k].label)));
ok('vol note only where speculators sit with the trend', S.describeCot(c({ pct: 95, share: 30, share4: 25, move13: .05, move4: .01 })).vol
  && !S.describeCot(c({ pct: 95, share: 30, share4: 25, move13: -.05, move4: -.01 })).vol);

// full read from feed row + history + bars (release-Friday pricing)
const bars = []; let px = 1.0;
for (let d = Date.parse('2026-05-01'); d <= Date.parse('2026-10-20'); d += 864e5) { px *= 1.001; bars.push({ date: new Date(d).toISOString().slice(0, 10), close: px }); }
// pull back over the last 4 weeks before the 2026-10-16 release
for (const b of bars) if (b.date > '2026-09-18' && b.date <= '2026-10-20') b.close *= 0.97;
const series = { dates: ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13'], specShare: [40, 41, 42, 40, 38, 36] };
const r = S.cotStateFor({ row: { specSharePct: 96, specShare: 36, reportDate: '2026-10-13' }, series, bars });
ok('cotStateFor: uptrend, 4-week pullback, share down over 4 reports -> D', r.state === 'D' && r.ev === 'cot-crowding-p5' && r.share4 === 41, JSON.stringify({ s: r.state, m13: r.move13, m4: r.move4, s4: r.share4 }));
ok('cotStateFor: no row -> null', S.cotStateFor({ row: null }) === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
