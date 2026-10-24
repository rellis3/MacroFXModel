/**
 * Checks an issue runs on itself before it asks to be believed. Each returns plain findings the magazine prints, so a reader sees what could not be reconciled and what to check.
 *
 *  1. LAGGING SERIES. A link compares two markets over the same 20 calendar days, but a series can last print days before the rest (the broad dollar index is a weekly-lag
 *     FRED series). When one end ends more than `maxLagDays` before the newest end in the chain, its move covers a different window from the others, and a story that mixes
 *     them is mixing windows.
 *  2. THE DOLLAR AGAINST DAILY FX. The broad index lags; the seven daily dollar pairs do not. If the story says the dollar was bought, count over the same window how many of the
 *     seven daily majors agree.
 *
 * Nothing here changes a calculation or a threshold. Pure. Tested in js/dataChecks.test.mjs.
 */
const DAY = 864e5;
const gap = (a, b) => (Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY;

/** Series (the ends of judged links) whose last print is more than maxLagDays older than the newest one. */
export function laggingSeries(links, { maxLagDays = 3 } = {}) {
  const ends = new Map();
  for (const l of links ?? []) for (const e of [l.a, l.b]) if (e?.key && e.asOf && !ends.has(e.key)) ends.set(e.key, e);
  const list = [...ends.values()]; if (!list.length) return { latest: null, lagging: [] };
  const latest = list.map(e => String(e.asOf).slice(0, 10)).sort().at(-1);
  const lagging = list.map(e => ({ key: e.key, label: e.label, asOf: String(e.asOf).slice(0, 10), days: Math.round(gap(latest, String(e.asOf).slice(0, 10))) })).filter(x => x.days > maxLagDays).sort((a, b) => b.days - a.days);
  return { latest, lagging };
}

const USD_PAIRS = { EURUSD: -1, GBPUSD: -1, AUDUSD: -1, NZDUSD: -1, USDJPY: 1, USDCAD: 1, USDCHF: 1 };
/** How many of the seven daily dollar pairs show the dollar stronger over their 20 days. assets: [{ key, label, d20 }] */
export function dollarOnDailyFx(assets) {
  const rows = (assets ?? []).filter(a => USD_PAIRS[a.key] != null && Number.isFinite(a.d20)).map(a => ({ key: a.key, label: a.label, stronger: USD_PAIRS[a.key] * a.d20 > 0 }));
  return { n: rows.length, stronger: rows.filter(r => r.stronger).length, rows };
}

/** The findings, as [{ id, title, body }]. Empty when everything lines up. */
export function dataChecks({ links, assets, windowDays = 20 } = {}) {
  const out = [], { latest, lagging } = laggingSeries(links), pretty = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (lagging.length) out.push({ id: 'lagging', title: 'Series that stop earlier than the rest', body: `${lagging.map(x => `${x.label} last printed on ${pretty(x.asOf)}, ${x.days} days before the newest data (${pretty(latest)})`).join('; ')}. Its ${windowDays}-day move covers an earlier window than the markets it is compared with, so any link that uses it mixes two windows.` });
  const dollarLag = lagging.find(x => x.key === 'dxy');
  if (dollarLag) {
    const d = dollarOnDailyFx(assets);
    if (d.n >= 4) out.push({ id: 'dollar', title: 'The dollar claim needs checking', body: `The story says the dollar was bought. That rests on the broad dollar index, whose last print is ${pretty(dollarLag.asOf)}, ${dollarLag.days} days before the newest data (${pretty(latest)}). On the daily dollar pairs over the same ${windowDays} days to the latest close, the dollar is stronger against ${d.stronger} of ${d.n} and weaker against ${d.n - d.stronger}. The two measures cover different windows and point different ways, so "the dollar is bought" is unconfirmed until the index catches up or the daily pairs are used instead.` });
  }
  return out;
}
