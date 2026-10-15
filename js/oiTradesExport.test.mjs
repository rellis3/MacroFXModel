// OI BOT TRADES EXPORT — the text block pine/OI Bot Trades.pine parses. Pins the line
// format (field order the Pine parser indexes by position), block names matching the
// Confluence Zones indicator's ticker mapping, digits, R:R, and zone states (open /
// done / primed / armed) — with open positions matched PER INSTRUMENT, because a
// max-pain id matches any level on the same side.
//   node js/oiTradesExport.test.mjs
import { buildTradesText, tradesBlockName } from './oiTradesExport.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  → ' + e : ''}`); if (!c) fails++; };

const plan = { generatedAt: '2026-10-13T07:56:15Z', instruments: {
  spx: { spot: 7816.45, regime: 'PIN', dte: 1, maxPain: 7789.39, zones: [
    { mode: 'maxpain', side: 'sell', level: 7789.39, entry: 7816.45, sl: 7843.51, tp1: 7789.39, tp2: null },
    { mode: 'fade', side: 'sell', level: 7859.39, entry: 7859.39, sl: 7864.39, tp1: 7821.84, tp2: 7800 },
    { mode: 'fade', side: 'buy', level: 7700, entry: 7700, sl: 7695, tp1: 7740, tp2: null } ] },
  nq: { spot: 30530.55, regime: 'BREAKOUT', dte: 1, maxPain: 30910.65, zones: [
    { mode: 'maxpain', side: 'sell', level: 30910, entry: 30530, sl: 30600, tp1: 30910, tp2: null } ] },
  eurusd: { spot: 1.11913, regime: 'BREAKOUT', dte: 1, maxPain: 1.12212, zones: [
    { mode: 'break', side: 'buy', level: 1.12962, entry: 1.13162, sl: 1.12912, tp1: 1.13593, tp2: null } ] },
  gold: { spot: 4190.5, regime: 'NEUTRAL', dte: 4, maxPain: 4176.16, zones: [] },
} };
const status = {
  lines: [{ instrument: 'spx', entered: ['fade_buy_7700'], primed: [{ zone_id: 'fade_sell_7859.39' }] }],
  mt5_positions: [{ symbol: 'US500', comment: 'OI [maxpain_sell_7792.55]' }],
};
const txt = buildTradesText(plan, status, { generated: Date.UTC(2026, 9, 13, 8, 0) });
const rows = txt.split('\n');
const tz = key => { const i = rows.indexOf(key); const out = []; for (let j = i + 1; j < rows.length && rows[j]; j++) if (rows[j].startsWith('TZ ')) out.push(rows[j].split(' ')); return out; };

ok('header names the source and both times', rows[1] === 'Generated: 2026-10-13 08:00 UTC · plan CME · built 07:56 UTC', rows[1]);
ok('block names match the Confluence Zones indicator', ['SPX500', 'NQ', 'EURUSD', 'GOLD'].every(b => rows.includes(b)) && tradesBlockName('rut') === 'US2000' && tradesBlockName('dow') === 'US30');
const s = tz('SPX500');
ok('TZ field order: SIDE mode level entry sl tp1 tp2 state R:R', s[1].join(' ') === 'TZ SELL fade 7859.39 7859.39 7864.39 7821.84 7800.00 primed 7.5', s[1].join(' '));
ok('max-pain whose level drifted still matches its open position (US500 → spx)', s[0][8] === 'open');
ok('a traded-and-closed zone reads done', s[2][8] === 'done');
ok('an open SPX max-pain does NOT mark NQ\'s max-pain open', tz('NQ')[0][8] === 'armed');
ok('FX gets 5 decimals', tz('EURUSD')[0].slice(3, 7).join(' ') === '1.12962 1.13162 1.12912 1.13593');
ok('missing tp2 is "-"', tz('EURUSD')[0][7] === '-');
ok('an instrument with no zones says so on its header line', rows[rows.indexOf('GOLD') + 1].includes('no zones'));
ok('without status every zone is armed', buildTradesText(plan).split('\n').filter(r => r.startsWith('TZ ')).every(r => r.split(' ')[8] === 'armed'));

// ── OI-Vol bot block: same format, own title, optional pt:NN touch-odds token ──
{
  const vplan = { generatedAt: '2026-10-15T08:24:00Z', instruments: { nq: { spot: 29640, regime: 'BREAKOUT', dte: 1, maxPain: 30217, zones: [
    { mode: 'break', side: 'buy', level: 29817, entry: 29876, sl: 29793, tp1: 30017, tp2: null, pTouch: { p1: 0.01, p4: 0.2, p8: 0.43 } },
    { mode: 'break', side: 'sell', level: 29517, entry: 29458, sl: 29541, tp1: 29317, tp2: null } ] } } };
  const vt = buildTradesText(vplan, null, { generated: Date.UTC(2026, 9, 15, 8, 30), title: 'OI-VOL BOT TRADES' });
  const vrows = vt.split('\n');
  ok('OI-Vol block has its own title line', /^──── OI-VOL BOT TRADES ─+$/.test(vrows[0]), vrows[0]);
  ok('default title is unchanged (the existing indicator header)', /^──── OI BOT TRADES ─+$/.test(rows[0]), rows[0]);
  const z = vrows.filter(r => r.startsWith('TZ '));
  ok('a zone carrying touch odds ends with pt:NN (8h, whole percent)', z[0].endsWith(' armed 1.7 pt:43'), z[0]);
  ok('a zone without them keeps the original 10 fields', z[1].split(' ').length === 10, z[1]);
  ok('both blocks pasted together keep each title (indicator switches bot on it)', (vt + '\n\n' + txt).split('\n').filter(r => r.startsWith('────')).length === 2);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
