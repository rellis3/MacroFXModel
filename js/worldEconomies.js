/**
 * The economies behind the currency scores: for each of the eight economies the latest growth, inflation, jobs,
 * spending, confidence, trade, real yield, curve and central-bank stance, each with the month it describes.
 *
 * The server already scores these (/api/gdp, /api/cpi, /api/labor-market, /api/retail-sales, /api/consumer-confidence,
 * /api/trade-balance, /api/real-yield, /api/yield-curve, and the central-bank read inside /api/macro-scorecard).
 * This module only lays the raw prints side by side. It does not re-score and it does not forecast.
 *
 * A gap is shown as a gap: the UK and some others have no inflation feed, and a blank says so rather than a guess.
 * Pure. Tested in js/worldEconomies.test.mjs.
 */
const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
const MINUS = '−';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const num = v => (Number.isFinite(v) ? v : null);
const sg = (v, d = 1, u = '') => (num(v) === null ? '·' : `${v >= 0.5 * 10 ** -d ? '+' : v <= -0.5 * 10 ** -d ? MINUS : ''}${Math.abs(v).toFixed(d)}${u}`);
const plain = (v, d = 1, u = '') => (num(v) === null ? '·' : `${v.toFixed(d)}${u}`);
/** '2026-09-01' -> 'Sep'; a different year from `isoDate` adds the two-digit year. */
export function monthOf(date, isoDate) {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? '');
  if (!m) return '';
  const yr = isoDate && isoDate.slice(0, 4) !== m[1] ? ` ${m[1].slice(2)}` : '';
  return `${MONTHS[+m[2] - 1]}${yr}`;
}

/** '2026-04-01' -> 'Q2'; another year adds it. Growth dates are the first day of the quarter. */
export function quarterOf(date, isoDate) {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? '');
  if (!m) return '';
  return `Q${Math.ceil(+m[2] / 3)}${isoDate && isoDate.slice(0, 4) !== m[1] ? ` ${m[1].slice(2)}` : ''}`;
}

/** Rows, one per economy: plain numbers and the dates they describe. Missing is null. */
export function worldEconomies({ cpi, gdp, labor, retail, conf, trade, real, curve, scorecard } = {}) {
  const by = r => r?.byCcy ?? {};
  const rows = CCYS.map(ccy => {
    const g = by(gdp)[ccy], c = by(cpi)[ccy]?.dims ?? {}, l = by(labor)[ccy]?.dims ?? {}, r = by(retail)[ccy]?.dims ?? {};
    const cf = by(conf)[ccy], t = by(trade)[ccy], ry = by(real)[ccy], yc = by(curve)[ccy], cb = scorecard?.cbSentiment?.[ccy];
    return {
      ccy,
      growth: g && num(g.latestGrowth) !== null ? { v: g.latestGrowth, date: g.latestDate, z: num(g.z), recession: !!g.recessionFlag } : null,
      inflation: c.headlineLevel || c.coreLevel
        ? { head: num(c.headlineLevel?.latestYoy), core: num(c.coreLevel?.latestYoy), target: num(c.headlineLevel?.target ?? c.coreLevel?.target), date: c.headlineLevel?.latestDate ?? c.coreLevel?.latestDate }
        : null,
      jobs: l.unemploymentTrend || l.wageGrowth
        ? { unemp: num(l.unemploymentTrend?.latestLevel), unempDate: l.unemploymentTrend?.latestDate, wage: num(l.wageGrowth?.latestYoyPct), wageDate: l.wageGrowth?.latestDate, payroll: num(l.payrollGrowth?.latestChange) }
        : null,
      spending: r.headline && num(r.headline.latestYoy) !== null ? { v: r.headline.latestYoy, date: r.headline.latestDate } : null,
      confidence: cf && num(cf.latestValue) !== null ? { v: cf.latestValue, z: num(cf.z), date: cf.latestDate } : null,
      trade: t && num(t.latestValue) !== null ? { v: t.latestValue, surplus: !!t.surplus, date: t.latestDate } : null,
      real: ry && num(ry.latestReal) !== null ? { v: ry.latestReal, date: ry.latestDate } : null,
      curve: yc && num(yc.latestSlope) !== null ? { v: yc.latestSlope, date: yc.latestDate } : null,
      bank: cb && cb.regime ? { regime: String(cb.regime).toLowerCase(), date: cb.meetingDate } : null,
    };
  });
  return { rows, lines: crossLines(rows) };
}

/** A few plain statements that only compare the economies with each other; no direction is implied. */
function crossLines(rows) {
  const out = [], list = a => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
  const top = (pick, hi) => {
    const v = rows.map(r => ({ ccy: r.ccy, x: pick(r) })).filter(r => num(r.x) !== null).sort((a, b) => (hi ? b.x - a.x : a.x - b.x));
    return v.length >= 3 ? v : null;
  };
  const inf = top(r => r.inflation?.head, true);
  if (inf) out.push(`Headline inflation is highest in ${inf[0].ccy} (${plain(inf[0].x, 1, '%')}) and lowest in ${inf.at(-1).ccy} (${plain(inf.at(-1).x, 1, '%')}); ${inf.length} of 8 economies have a feed.`);
  const gr = top(r => r.growth?.v, true);
  if (gr) out.push(`Latest quarterly growth is strongest in ${gr[0].ccy} (${sg(gr[0].x, 2, '%')}) and weakest in ${gr.at(-1).ccy} (${sg(gr.at(-1).x, 2, '%')}).`);
  const un = top(r => r.jobs?.unemp, true);
  if (un) out.push(`Unemployment is highest in ${un[0].ccy} (${plain(un[0].x, 1, '%')}) and lowest in ${un.at(-1).ccy} (${plain(un.at(-1).x, 1, '%')}).`);
  const squeezed = rows.filter(r => num(r.inflation?.head) !== null && num(r.jobs?.wage) !== null && r.jobs.wage < r.inflation.head).map(r => r.ccy);
  if (squeezed.length) out.push(`Wages are growing slower than prices in ${list(squeezed)}, so pay is losing ground there.`);
  const rec = rows.filter(r => r.growth?.recession).map(r => r.ccy);
  if (rec.length) out.push(`The recession flag is on for ${list(rec)}.`);
  const inv = rows.filter(r => num(r.curve?.v) !== null && r.curve.v < 0).map(r => r.ccy);
  if (inv.length) out.push(`The yield curve is inverted (long yield below short) in ${list(inv)}.`);
  return out;
}

/** The table: one row per economy, a cell per measure with the month it describes. `esc` escapes text. */
export function worldEconomiesHtml(world, esc, isoDate) {
  if (!world?.rows?.length) return '';
  const mo = d => monthOf(d, isoDate), sm = d => (d ? ` <small>${esc(mo(d))}</small>` : '');
  const none = '<small>no feed</small>';
  const cell = {
    growth: r => (r.growth ? `${sg(r.growth.v, 2, '%')}${r.growth.date ? ` <small>${esc(quarterOf(r.growth.date, isoDate))}</small>` : ''}${r.growth.recession ? ' <small>recession flag</small>' : ''}` : none),
    inflation: r => (r.inflation ? `${plain(r.inflation.head, 1, '%')}${r.inflation.core !== null ? ` <small>core ${plain(r.inflation.core, 1, '%')}</small>` : ''}${sm(r.inflation.date)}` : none),
    jobs: r => (r.jobs ? `${r.jobs.unemp !== null ? `${plain(r.jobs.unemp, 1, '%')} <small>out of work</small>` : ''}${r.jobs.wage !== null ? `<br><small>wages ${sg(r.jobs.wage, 1, '%')}</small>` : ''}${sm(r.jobs.unempDate ?? r.jobs.wageDate)}` : none),
    spending: r => (r.spending ? `${sg(r.spending.v, 1, '%')}${sm(r.spending.date)}` : none),
    conf: r => (r.confidence && r.confidence.z !== null ? `${Math.abs(r.confidence.z) < 0.5 ? 'near its norm' : r.confidence.z > 0 ? 'above its norm' : 'below its norm'} <small>${sg(r.confidence.z, 1)} sd</small>${sm(r.confidence.date)}` : none),
    trade: r => (r.trade ? `${r.trade.surplus ? 'surplus' : 'deficit'}${sm(r.trade.date)}` : none),
    rates: r => (r.real || r.curve ? `${r.real ? `real ${sg(r.real.v, 2, '%')}` : ''}${r.curve ? `${r.real ? '<br>' : ''}curve ${sg(r.curve.v * 100, 0, 'bp')}` : ''}` : none),
    bank: r => (r.bank ? `${esc(r.bank.regime)}${sm(r.bank.date)}` : none),
  };
  const body = world.rows.map(r => `<tr><td class="n">${esc(r.ccy)}</td><td class="m">${cell.growth(r)}</td><td class="m">${cell.inflation(r)}</td><td class="m">${cell.jobs(r)}</td><td class="m">${cell.spending(r)}</td><td class="m">${cell.conf(r)}</td><td class="m">${cell.trade(r)}</td><td class="m">${cell.rates(r)}</td><td class="m">${cell.bank(r)}</td></tr>`).join('');
  const lines = world.lines.length ? `<p class="small3">${world.lines.map(esc).join(' ')}</p>` : '';
  return `<table class="t3"><tr><th>Economy</th><th>Growth, latest quarter</th><th>Inflation, year on year</th><th>Jobs</th><th>Retail sales, year on year</th><th>Consumer confidence</th><th>Trade</th><th>Real yield, curve</th><th>Central bank</th></tr>${body}</table>${lines}<p class="small3">Each figure is the latest print and the month it describes, so the rows are not all the same date. These are the raw numbers under the currency scores, set side by side. They describe what has happened; they do not say where a currency goes next. A blank means the desk has no feed for that economy.</p>`;
}
