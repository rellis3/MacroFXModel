/**
 * The V3 daily's today tables: the daily as "the state of the levels today". Page 1 is the Today opening; then the global backdrop, the currencies and the pairs as they
 * stand today against yesterday's close; the 20-day investigation shrinks to a backdrop page. Same builder as V2 with `v3: true`, so it sits beside the
 * others and nothing in the current output changes.
 *
 * Every row is a measured figure with a plain-words line for what it measures. Nothing here forecasts a direction. The currency scorecard moves slowly and
 * the feed carries no saved yesterday, so that table shows the state, not the day's change, and says so.
 *
 * Pure. Tested in js/newsletterV3.test.mjs.
 */
import { dollarBasket } from './dataChecks.js';
import { worldEconomiesHtml } from './worldEconomies.js';
import { directionCell, directionNote, rangeCell } from './directionRead.js';

const TZ = 'Europe/London', MINUS = '−';
const sg = (v, d = 0, u = '') => (Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(d)}${u}` : '·');
const hhmm = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const ukDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
const CCY_OF = { EURUSD: ['EUR', 'USD'], GBPUSD: ['GBP', 'USD'], USDJPY: ['USD', 'JPY'], AUDUSD: ['AUD', 'USD'], USDCAD: ['USD', 'CAD'], USDCHF: ['USD', 'CHF'], NZDUSD: ['NZD', 'USD'], GOLD: ['USD'], NQ: ['USD'], SPX500: ['USD'], US30: ['USD'], US2000: ['USD'], BTCUSD: ['USD'], DE30: ['EUR'], UK100: ['GBP'] };
const BANK = { USD: 'Fed', EUR: 'ECB', GBP: 'Bank of England', JPY: 'Bank of Japan', AUD: 'RBA', NZD: 'RBNZ', CAD: 'Bank of Canada', CHF: 'SNB' };

/** The next release still to come today for a market's currencies: { text } or null. */
function waitingOn(key, events, now) {
  const ccys = CCY_OF[key] ?? [];
  const e = (events ?? []).filter(x => (x.impact === 'high' || x.impact === 'medium') && x.ms > now && ukDay(x.ms) === ukDay(now) && ccys.includes(x.ccy)).sort((a, b) => (a.impact === b.impact ? a.ms - b.ms : a.impact === 'high' ? -1 : 1))[0];
  return e ? `${String(e.event).replace(/\s+/g, ' ').slice(0, 34)} ${hhmm(e.ms)}` : '';
}

/** Asia in one short phrase: wild, wide, quiet or ordinary, with the net move since the Asia open. */
function asiaPhrase(s) {
  if (!s || !s.band) return '';
  const word = s.band === 'wide' ? (s.cutHigh > 0 && s.atr / s.cutHigh >= 2 ? 'wild' : 'wide') : s.band === 'narrow' ? 'quiet' : 'ordinary';
  return `${word}${Number.isFinite(s.netPct) && Math.abs(s.netPct) >= 0.05 ? `, ${sg(s.netPct, 1, '%')}` : ''}`;
}

const YIELD_KEY = { EUR: 'de10y', GBP: 'gb10y', JPY: 'jp10y' };

/** A country's 10-year yield as { last, d1 (bp), date }: from the international feed's last two prints, or the US from the macro changes. Null when there is no daily feed. */
function yieldOf(ccy, intl, us) {
  if (ccy === 'USD') return us && Number.isFinite(us.last) ? { last: us.last, d1: Number.isFinite(us.d1) ? us.d1 : null, date: us.lastDate ?? null } : null;
  const s = intl?.[YIELD_KEY[ccy]];
  if (!Array.isArray(s) || s.length < 2) return null;
  const a = s.at(-1), b = s.at(-2);
  return Number.isFinite(a?.value) && Number.isFinite(b?.value) ? { last: a.value, d1: (a.value - b.value) * 100, date: a.date } : null;
}

/**
 * The three today tables, as html strings: { globalHtml, countryHtml, pairsHtml }.
 * Inputs: changes, volatility, creditSpreads, fedPath, strengths, cb, surprise, assets (key, label, price, d1, used, implied), asia, events, nowMs, isoDate.
 */
export function todayTables({ reads, world, intl, changes, creditSpreads, fedPath, strengths, cb, surprise, assets, asia, events, nowMs, isoDate }, esc) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now(), ch = k => (changes ?? []).find(c => c.key === k && Number.isFinite(c.last));
  const asOf = c => (c?.lastDate && isoDate && c.lastDate < isoDate ? ` <small>as of ${esc(c.lastDate.slice(5))}</small>` : '');
  const row = (name, val, move, mean) => `<tr><td class="n">${esc(name)}</td><td class="v">${val}</td><td class="m">${move}</td><td class="w">${esc(mean)}</td></tr>`;
  const g = [];
  const y10 = ch('us10y'), tp = ch('tips'), be = ch('bei'), cv = ch('us2s10s'), vx = ch('vix'), dx = ch('dxy');
  const hy = (creditSpreads ?? []).find(c => /high-yield/i.test(c.label ?? '')), bk = dollarBasket(assets ?? [], 'd1');
  if (y10) g.push(row('US 10-year yield', `${y10.last.toFixed(2)}%${asOf(y10)}`, sg(y10.d1, 0, 'bp'), 'What the government pays to borrow for ten years.'));
  if (tp) g.push(row('Real 10-year yield', `${tp.last.toFixed(2)}%${asOf(tp)}`, sg(tp.d1, 0, 'bp'), 'The same, after allowing for inflation.'));
  if (be) g.push(row('Inflation expected', `${be.last.toFixed(2)}%${asOf(be)}`, sg(be.d1, 0, 'bp'), 'The gap between the two: what the market expects prices to do.'));
  if (cv) g.push(row('2s10s curve', `${Math.round(cv.last)}bp${asOf(cv)}`, sg(cv.d1, 0, 'bp'), 'Long yields minus short ones. Below zero has marked slowdowns before.'));
  if (hy && Number.isFinite(hy.bp)) g.push(row('Junk-bond spread', `${Math.round(hy.bp)}bp`, sg(hy.d1, 0, 'bp'), 'The extra yield lenders ask to hold risky debt. Wider means more nervous.'));
  if (vx) g.push(row('VIX', vx.last.toFixed(1), sg(vx.d1, 1, ' pts'), 'What the market pays for stock-market protection.'));
  if (dx || bk.n >= 4) g.push(row('Dollar', dx ? `${dx.last.toFixed(1)}${asOf(dx)}` : '·', bk.n >= 4 ? `${sg(bk.avg, 2, '%')} on 7 majors` : '', 'Against the seven daily majors, today against yesterday.'));
  // risk tone: AUD/JPY is the carry gauge (the risk currency against the safe-haven one). Built from the two pairs on the board, which track the cross at 0.995 over six years.
  const au = (assets ?? []).find(r => r?.key === 'AUDUSD'), jp = (assets ?? []).find(r => r?.key === 'USDJPY');
  if (au && jp && Number.isFinite(au.d1) && Number.isFinite(jp.d1)) {
    const aj = au.d1 + jp.d1, nq = (assets ?? []).find(r => r?.key === 'NQ'), side = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
    const votes = [nq && Number.isFinite(nq.d1) ? ['Nasdaq', side(nq.d1)] : null, vx && Number.isFinite(vx.d1) ? ['the VIX', -side(vx.d1)] : null, hy && Number.isFinite(hy.d1) ? ['junk spreads', -side(hy.d1)] : null].filter(v => v && v[1] !== 0);
    const tone = Math.abs(aj) < 0.15 ? 'flat' : aj > 0 ? 'risk-on' : 'risk-off', agree = votes.filter(v => v[1] === side(aj)).map(v => v[0]), differ = votes.filter(v => v[1] === -side(aj)).map(v => v[0]);
    const list = a => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
    const verdict = tone === 'flat' ? 'The carry gauge is flat.' : agree.length && !differ.length ? `${list(agree)} read the same way.` : differ.length && !agree.length ? `${list(differ)} read the other way: the currencies disagree with them.` : agree.length ? `${list(agree)} agree; ${list(differ)} ${differ.length > 1 ? 'do' : 'does'} not.` : '';
    g.push(row('Risk tone, AUD/JPY', tone, sg(aj, 2, '%'), `The risk currency against the safe-haven one; up when investors take risk. ${verdict} Same-day only: over six years it has moved with Nasdaq and against the VIX in both halves of the record, with no next-day lead.`.trim()));
  }
  if (fedPath && Number.isFinite(fedPath.hike)) g.push(row('Fed hike odds', `${Math.round(fedPath.hike)}%`, Number.isFinite(fedPath.hikeWeekAgo) ? `${sg(fedPath.hike - fedPath.hikeWeekAgo, 0, 'pp')} on the week` : '', `Chance priced for a hike by ${fedPath.ref ?? 'the next meeting'}. Market-implied, as of ${fedPath.asOf ?? 'the last read'}.`));
  const globalHtml = g.length ? `<table class="t3"><tr><th>Market</th><th>Now</th><th>Today</th><th>What it measures</th></tr>${g.join('')}</table><p class="small3">Today means since yesterday's close. Rates and credit print with a delay, so a row dated earlier says so.</p>` : '';

  const cbBy = Object.fromEntries((cb ?? []).map(b => [b.ccy, b])), srBy = Object.fromEntries((surprise ?? []).map(s => [s.ccy, s]));
  const us = yieldOf('USD', intl, ch('us10y')), mmdd = d => (d ? d.slice(5) : ''), stale = y => !!(y?.date && isoDate && y.date < isoDate);
  const rows = [...(strengths ?? [])].sort((a, b) => b.score - a.score).map((s, i) => {
    const b = cbBy[s.ccy], sp = srBy[s.ccy], nx = (events ?? []).filter(e => (e.impact === 'high') && e.ms > now && ukDay(e.ms) === ukDay(now) && e.ccy === s.ccy).sort((a, c) => a.ms - c.ms)[0];
    const y = yieldOf(s.ccy, intl, us), same = y && us && y.date && y.date === us.date && Number.isFinite(y.d1) && Number.isFinite(us.d1);
    const yCell = y ? `${y.last.toFixed(2)}% <small>${Number.isFinite(y.d1) ? sg(y.d1, 0, 'bp') : ''}${stale(y) ? ` as of ${esc(mmdd(y.date))}` : ''}</small>` : '<small>no daily feed</small>';
    // the gap to the US: today's level, and how it moved when both yields are from the same day
    const gap = s.ccy === 'USD' || !y || !us || !y.date || y.date !== us.date ? '' : `${sg((y.last - us.last) * 100, 0, 'bp')}${same ? ` <small>${(y.d1 - us.d1) === 0 ? 'unchanged' : `${y.d1 - us.d1 > 0 ? 'wider' : 'narrower'} by ${Math.abs(Math.round(y.d1 - us.d1))}bp`}</small>` : ''}`;
    const bank = b ? `${BANK[s.ccy] ?? b.bank} ${String(b.regime ?? '').toLowerCase()}${b.trend ? `, ${b.trend}` : ''}` : '';
    const data = sp && !sp.stale ? `${sp.score >= 0 ? 'beating' : 'missing'} forecasts (${sg(sp.score, 2)})` : '';
    return `<tr><td class="n">${i + 1}. ${esc(s.ccy)}</td><td class="v">${sg(s.score, 2)}</td><td class="v">${yCell}</td><td class="m">${gap || '·'}</td><td class="m">${esc(bank) || '·'}${data ? `<br><small>${esc(data)}</small>` : ''}</td><td class="w">${nx ? esc(`${String(nx.event).slice(0, 30)} ${hhmm(nx.ms)}`) : ''}</td></tr>`;
  });
  const noFeed = (strengths ?? []).map(s => s.ccy).filter(c => c !== 'USD' && !YIELD_KEY[c]);
  const countryHtml = rows.length ? `<table class="t3"><tr><th>Currency</th><th>Score</th><th>10-year yield, today</th><th>Gap to the US</th><th>Central bank, data</th><th>Due today</th></tr>${rows.join('')}</table><p class="small3">The score is the desk's scorecard (growth, inflation, rates, trade, confidence) against the other seven. It moves slowly and has no saved yesterday, so it shows the state, not the day's change. The gap is the 10-year yield minus the US one, shown only when both are from the same day.${noFeed.length ? ` There is no daily yield feed for ${noFeed.join(', ')}.` : ''}</p>` : '';

  const rd = r => (reads?.rows ?? []).find(x => x.sym === r.key) ?? null;
  const pr = (assets ?? []).filter(r => r?.key && Number.isFinite(r.d1)).map(r => {
    const used = Number.isFinite(r.used) ? r.used : (Number.isFinite(r.hlMed) && r.hlMed > 0 ? Math.abs(r.d1) / r.hlMed : null), w = waitingOn(r.key, events, now), a = asiaPhrase(asia?.[r.key]), q = rd(r);
    return `<tr><td class="n">${esc(r.label)}<small>${esc(r.price ?? '')}</small></td><td class="m"><b class="${r.d1 >= 0 ? 'up3' : 'dn3'}">${sg(r.d1, 2, '%')}</b></td><td class="u">${used === null ? '·' : `<span class="bar3"><i style="width:${Math.min(100, Math.round(used * 100))}%"></i></span> ${Math.round(used * 100)}%`}</td>${reads ? `<td class="m">${q ? rangeCell(q) || '·' : '·'}</td><td class="m">${q ? directionCell(q) : '·'}</td>` : ''}<td class="m">${esc(a)}</td><td class="w">${esc(w)}</td></tr>`;
  });
  const pairsHtml = pr.length ? `<table class="t3"><tr><th>Market</th><th>Today</th><th>Share of a normal day's range used</th>${reads ? '<th>Typical day, 1 in 4 days past</th><th>Direction, tested inputs</th>' : ''}<th>Asia</th><th>Waiting on</th></tr>${pr.join('')}</table><p class="small3">Today is since yesterday's close. A full bar means a normal day's range is used up. Asia is 00:00 to 06:00 London against that market's own history.${reads ? ` ${esc(directionNote(reads))}` : ''}</p>` : '';
  const worldHtml = world ? worldEconomiesHtml(world, esc, isoDate) : '';
  return { globalHtml, countryHtml, pairsHtml, worldHtml };
}
