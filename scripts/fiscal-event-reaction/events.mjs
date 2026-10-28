// fiscal-event-reaction: the historical event lists (forge/FISCAL_EVENT_REACTION_PREREG.md §3).
// UK dates are from the obr.uk EFO sitemap (checked 2026-10-28); the November 2010 OBR forecast had no Chancellor's
// statement and is left out. US statements are parsed from the Treasury's "Official Remarks on Quarterly Refunding" archive.

export const LOCKBOX_END = '2026-08-21';

// [id date, name, statement start London clock, gov.uk search name, flags]
const UK = [
  ['2010-06-22', 'June Budget 2010', '12:30', 'Budget June 2010'],
  ['2011-03-23', 'Budget 2011', '12:30'],
  ['2011-11-29', 'Autumn Statement 2011', '12:30'],
  ['2012-03-21', 'Budget 2012', '12:30'],
  ['2012-12-05', 'Autumn Statement 2012', '12:30'],
  ['2013-03-20', 'Budget 2013', '12:30'],
  ['2013-12-05', 'Autumn Statement 2013', '12:30'],
  ['2014-03-19', 'Budget 2014', '12:30'],
  ['2014-12-03', 'Autumn Statement 2014', '12:30'],
  ['2015-03-18', 'Budget 2015', '12:30'],
  ['2015-07-08', 'Summer Budget 2015', '12:30'],
  ['2015-11-25', 'Spending Review and Autumn Statement 2015', '12:30'],
  ['2016-03-16', 'Budget 2016', '12:30'],
  ['2016-11-23', 'Autumn Statement 2016', '12:30'],
  ['2017-03-08', 'Spring Budget 2017', '12:30'],
  ['2017-11-22', 'Autumn Budget 2017', '12:30'],
  ['2018-03-13', 'Spring Statement 2018', '12:30'],
  ['2018-10-29', 'Budget 2018', '15:30'],
  ['2019-03-13', 'Spring Statement 2019', '12:30'],
  ['2020-03-11', 'Budget 2020', '12:30'],
  ['2020-11-25', 'Spending Review 2020', '12:30'],
  ['2021-03-03', 'Budget 2021', '12:30'],
  ['2021-10-27', 'Autumn Budget and Spending Review 2021', '12:30'],
  ['2022-03-23', 'Spring Statement 2022', '12:30'],
  ['2022-09-23', 'The Growth Plan 2022', '09:30', null, 'unscheduled'],
  ['2022-10-17', 'Chancellor statement, 17 October 2022', '11:00', null, 'unscheduled'],
  ['2022-11-17', 'Autumn Statement 2022', '11:00'],
  ['2023-03-15', 'Spring Budget 2023', '12:30'],
  ['2023-11-22', 'Autumn Statement 2023', '12:30'],
  ['2024-03-06', 'Spring Budget 2024', '12:30'],
  ['2024-10-30', 'Autumn Budget 2024', '12:30'],
  ['2025-03-26', 'Spring Statement 2025', '12:30'],
  ['2025-11-26', 'Budget 2025', '11:40'],          // the OBR outlook was published early, at about 11:40
  ['2026-03-03', 'Spring Forecast 2026', '12:30'],
  ['2026-10-28', 'Budget 2026', '12:30'],
];

/** Epoch ms of a wall-clock time in a time zone (DST-safe, two passes). */
export function zonedMs(date, hhmm, tz) {
  const [h, m] = hhmm.split(':').map(Number);
  let guess = Date.parse(`${date}T${hhmm}:00Z`);
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    guess += Date.parse(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`) - shown;
  }
  return guess;
}

export const UK_EVENTS = UK.map(([date, name, clock, search, flag]) => ({
  id: `gb-${date}`, country: 'GB', date, name, clock, tz: 'Europe/London', search: search ?? name,
  unscheduled: flag === 'unscheduled', t0: zonedMs(date, clock, 'Europe/London'), windowMin: 180,
  scored: date <= LOCKBOX_END && flag !== 'unscheduled',
}));

const QTR_MONTH = { 1: 'February', 2: 'May', 3: 'August', 4: 'November' };

/** Rows {year, q, href} from the archive page (unquoted hrefs; the current quarter has no link yet). */
export function parseRefundingArchive(html) {
  const re = /<th headers=(\d{4})[^>]*>(?:<a(?: aria-label="[^"]*")? href=([^ >]+)>)?([1-4])(?:st|nd|rd|th) Quarter/g;
  const out = []; let m;
  while ((m = re.exec(html))) if (m[2]) out.push({ year: +m[1], q: +m[3], href: m[2].startsWith('http') ? m[2] : 'https://home.treasury.gov' + m[2] });
  return out;
}

export function usEvent({ year, q, href }, date) {
  return {
    id: `us-${date}`, country: 'US', date, name: `Quarterly Refunding, ${QTR_MONTH[q]} ${year}`, clock: '08:30', tz: 'America/New_York',
    href, t0: zonedMs(date, '08:30', 'America/New_York'), windowMin: 90, unscheduled: false, scored: date <= LOCKBOX_END,
  };
}

/** The release date printed on a home.treasury.gov press release ("August 5, 2026"). */
export function pressDate(html) {
  const m = html.match(/data-news-date="?(\d{4}-\d{2}-\d{2})/) || html.match(/<time[^>]*datetime="?(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/);
  if (!t) return null;
  const mo = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(t[1]) + 1;
  return `${t[3]}-${String(mo).padStart(2, '0')}-${t[2].padStart(2, '0')}`;
}
