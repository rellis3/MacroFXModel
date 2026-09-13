"""
m1_gap_audit.py — Phase 0 data integrity for the jump/diffusion decomposition.

The brief points at `analysis/m1_archive_gap_audit.mjs`; that file does not exist in
this repo (nor in its git history), so this is the Python equivalent, living next to
the study that needs it and reusing THIS folder's own M1 loader
(`vol_exhaustion_lib.load_m1`) rather than a second parquet reader.

WHY IT MATTERS HERE. RV = Σr² and BV = (π/2)Σ|rₜ||rₜ₋₁| are both sums over
CONSECUTIVE 1-min log returns. A hole in the archive turns a missing stretch into a
single large "return" that RV counts in full and BV only partly — i.e. a data gap
masquerades as exactly the phenomenon being measured. So gaps are not a footnote
here; they are a source of FAKE JUMPS. Every gap must be either explained or
excluded before Phase 1, never averaged over.

WHAT THE ARCHIVE ACTUALLY CONTAINS (established by running this, not assumed):

  WEEKEND      the FX week close — Fri ~20:00/21:00 UTC to Sun ~21:00/22:00 UTC.
               ~48h; 72h over Easter (Good Friday→Easter Monday).
  WEEK_OPEN    the Sunday London "day" holds only the ~100 bars between the Sunday
               22:00-23:00 London open and midnight. Normal, but far too thin for an
               RV/BV decomposition — Phase 1's MIN_BARS requirement drops it.
  HOLIDAY      Christmas / New Year (24h-28h closes) and, for gold, the US-holiday
               early closes (Presidents Day, Memorial Day, July 4, Labor Day,
               Thanksgiving, MLK Day, Juneteenth — ~5h stubs off a 17:00/18:00
               UTC close).
  DAILY_BREAK  gold ONLY: a structural ~60min CME/COMEX maintenance break at
               20:00/21:00 UTC, present on essentially every trading day (2,117 of
               them). This is a real session boundary, not missing data — but the
               return spanning it is not a 1-minute return, so Phase 1 must DROP it
               rather than let it enter RV as an hour-long "jump". Reported as
               `daily_break_utc_hours` for exactly that purpose.
  UNEXPLAINED  anything else. These are the only true integrity failures, and they
               are reported per-date so Phase 1 can exclude those (pair, date) rows.

Usage:  python3 m1_gap_audit.py [pair ...]     (default: every parquet found)
Writes `m1_gap_audit_summary.json`, which Phase 1 (`jump_diffusion_daily.py`) reads
to (a) refuse an instrument that was never audited and (b) skip its bad dates.
Exit 0 = every audited instrument is explained; exit 1 = something is unexplained
and large enough to matter.
"""
import os, sys, json, datetime, collections
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, london_parts

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIRS = [os.path.join(HERE, '..', 'portfolioBacktest', 'cache'),
              os.path.join(HERE, '..', 'VolRangeForecaster', 'data', 'm1')]

GAP_MIN = 60            # a hole this long is not "a quiet minute with no tick"
WEEKEND_MIN = 40 * 60   # anything >=40h straddling a Sat/Sun is the weekly close
DAILY_BREAK_MAX = 70    # gold's maintenance break runs 60-65min
DAILY_BREAK_MIN_OCC = 200   # ...and recurs on hundreds of days; that's what makes it structural
SUMMARY = os.path.join(HERE, 'm1_gap_audit_summary.json')


def _date(day_idx):
    return datetime.date(1970, 1, 1) + datetime.timedelta(days=int(day_idx))


def _easter(year):
    """Anonymous Gregorian algorithm — Good Friday and Easter Monday bound the 72h gap."""
    a = year % 19; b, c = divmod(year, 100); d, e = divmod(b, 4)
    f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mo, da = divmod(h + l - 7 * m + 114, 31)
    return datetime.date(year, mo, da + 1)


def _is_holiday(d):
    """Calendar closures the FX/metals archive genuinely has."""
    if (d.month == 12 and d.day >= 23) or (d.month == 1 and d.day <= 2):
        return True                                   # Christmas / New Year
    e = _easter(d.year)
    if abs((d - e).days) <= 3:
        return True                                   # Good Friday .. Easter Monday
    if d.month == 7 and d.day in (3, 4, 5):
        return True                                   # US Independence Day
    # US Mondays: Presidents (3rd Feb Mon), Memorial (last May Mon), Labor (1st Sep Mon)
    if d.weekday() == 0:
        if d.month == 1 and 15 <= d.day <= 21: return True   # MLK Day (3rd Mon Jan)
        if d.month == 2 and 15 <= d.day <= 21: return True   # Presidents Day
        if d.month == 5 and d.day >= 25:       return True   # Memorial Day
        if d.month == 9 and d.day <= 7:        return True   # Labor Day
    if d.month == 6 and d.day in (18, 19, 20) and d.year >= 2021:
        return True                                   # Juneteenth (US federal from 2021)
    if d.month == 11 and d.weekday() in (3, 4) and 22 <= d.day <= 29:
        return True                                   # Thanksgiving + the Friday after
    return False


def audit(pair, path):
    m1 = load_m1(path)
    utc = m1['utc_min']
    n = int(utc.size)
    dd = np.diff(utc)
    day_idx, _ = london_parts(utc)

    dup = int(np.count_nonzero(dd == 0))

    # ── pass 1: find the instrument's own structural daily break, if it has one ──
    short = np.flatnonzero((dd >= GAP_MIN) & (dd <= DAILY_BREAK_MAX))
    hours = collections.Counter(((utc[short] % 1440) // 60).tolist())
    break_hours = sorted(h for h, c in hours.items() if c >= DAILY_BREAK_MIN_OCC)

    # ── pass 2: classify every gap >= GAP_MIN ────────────────────────────────────
    buckets = collections.Counter()
    unexplained = []
    for k in np.flatnonzero(dd >= GAP_MIN):
        gap = int(dd[k])
        a, b = _date(day_idx[k]), _date(day_idx[k + 1])
        if gap >= WEEKEND_MIN and any(_date(x).weekday() >= 5 for x in range(day_idx[k], day_idx[k + 1] + 1)):
            buckets['WEEKEND'] += 1
        elif gap <= DAILY_BREAK_MAX and ((utc[k] % 1440) // 60) in break_hours:
            buckets['DAILY_BREAK'] += 1
        elif _is_holiday(a) or _is_holiday(b):
            buckets['HOLIDAY'] += 1
        else:
            buckets['UNEXPLAINED'] += 1
            unexplained.append(dict(date=a.isoformat(), end_date=b.isoformat(), minutes=gap))

    # ── the London days Phase 1 will actually sum over ───────────────────────────
    daily = build_london_daily(m1)
    bars = daily['end'] - daily['start']
    med = float(np.median(bars)) if bars.size else 0.0
    sun = np.array([_date(x).weekday() == 6 for x in daily['day_idx']])
    thin = bars < 0.35 * med
    thin_unex = sorted({_date(x).isoformat() for x, t, s in zip(daily['day_idx'], thin, sun)
                        if t and not s and not _is_holiday(_date(x))})

    # every date touched by an unexplained hole -> Phase 1's exclusion list
    bad_dates = sorted({u['date'] for u in unexplained} | {u['end_date'] for u in unexplained}
                       | set(thin_unex))
    issues = []
    if dup:
        issues.append(f'DUP_MINUTE: {dup} repeated utc_min stamps')
    if unexplained:
        worst = sorted(unexplained, key=lambda u: -u['minutes'])[:5]
        issues.append(f'UNEXPLAINED: {len(unexplained)} hole(s) — '
                      + ', '.join(f'{u["date"]} {u["minutes"]}min' for u in worst))
    if thin_unex:
        issues.append(f'SHORT_DAY: {len(thin_unex)} non-Sunday, non-holiday day(s) under '
                      f'35% of median {med:.0f} bars — ' + ', '.join(thin_unex[:5]))

    span = f'{_date(day_idx[0])}..{_date(day_idx[-1])}' if n else 'empty'
    return dict(pair=pair, bars=n, days=int(bars.size), median_bars_per_day=med, span=span,
                buckets=dict(buckets), daily_break_utc_hours=break_hours,
                sunday_week_open_days=int(sun.sum()), issues=issues,
                exclude_dates=bad_dates, clean=not issues)


def discover():
    found = {}
    for d in CACHE_DIRS:
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if fn.endswith('_m1.parquet'):
                found.setdefault(fn[:-len('_m1.parquet')], os.path.join(d, fn))
    return found


def main(argv):
    found = discover()
    if not found:
        print('no M1 parquet found in', CACHE_DIRS); return 1
    want = argv[1:] or sorted(found)
    out, dirty = {}, []
    print(f'M1 archive gap audit — {len(want)} instrument(s), gap >= {GAP_MIN}min\n')
    for p in want:
        if p not in found:
            print(f'  {p:9s} : NOT FOUND'); continue
        r = audit(p, found[p])
        out[p] = r
        print(f'  {p:9s} : {"OK   " if r["clean"] else "FLAG "} {r["bars"]:>9,d} bars  '
              f'{r["days"]:>5,d} days  {r["span"]}')
        b = r['buckets']
        print(f'              gaps: ' + '  '.join(f'{k}={v}' for k, v in sorted(b.items())) or '(none)')
        if r['daily_break_utc_hours']:
            print(f'              structural daily break at UTC hour(s) {r["daily_break_utc_hours"]} '
                  f'— Phase 1 must drop the return spanning it')
        for iss in r['issues']:
            print(f'              - {iss}')
        if not r['clean']:
            dirty.append(p)
    with open(SUMMARY, 'w') as f:
        json.dump(out, f, indent=1)
    print(f'\nwrote {os.path.basename(SUMMARY)}')
    if dirty:
        n_ex = sum(len(out[p]['exclude_dates']) for p in dirty)
        print(f'{len(dirty)} instrument(s) carry unexplained dates ({n_ex} total) — '
              f'Phase 1 excludes those (pair, date) rows rather than computing over them.')
        return 1
    print('every gap in every audited instrument is explained.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
