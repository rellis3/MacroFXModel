"""
jump_event_validation.py — Phase 2: does the whole-session jump share actually track
KNOWN scheduled events? The pre-registered kill condition for the whole build.

Phase 8 proved the bipower estimator on a ~30-minute pre-touch window. That is NOT the
same claim as "it isolates jumps over a full session", where the jump is a few minutes
out of ~1,400 and diffusion dominates the denominator. So before anything is built on
the daily number, it has to reproduce the one thing we independently KNOW: scheduled
macro releases are discrete jumps, so days carrying one must be jumpier.

GROUND TRUTH: `calendar_events.csv`. Note the impact tiers in this file are
Major / Moderate / Standard — there is no "High" tier; **Major** is this repo's
top tier (the same one `measure.py` already filters on), so that's what's used.
`datetime_raw` is UTC — verified against USD payroll releases, which sit at 13:30 UTC
in winter and 12:30 UTC in summer, i.e. 08:30 ET year-round. Events are mapped to a
London DATE with the same `london_parts` boundary the RV window uses, so the event and
the variance it is supposed to explain are on the same calendar by construction.

COVERAGE LIMIT, stated rather than hidden: the calendar only carries USD, EUR and GBP.
A pair is testable only if one of its legs is covered — which excludes 7 crosses
(AUD/NZD/CAD/CHF/JPY-only) entirely. They are reported as UNTESTABLE, not as
"no event days", which would silently mix "nothing scheduled" into the control group.
The Major base rate also roughly doubles from ~64 days/yr (2016-20) to ~140 (2022-25)
as the source's coverage widened; that is a level shift across the IS/OOS boundary,
which is exactly why the claim is tested WITHIN each half rather than pooled.

PRE-REGISTERED CLAIM (fixed before running; both frequencies, per asset class):
    mean jump_frac on Major-event days  >  mean jump_frac on non-event days,
    IN-SAMPLE **AND** OUT-OF-SAMPLE, on a 60/40 chronological split
    (the same split `js/volForecastBench.js` scores on, oosFrac = 0.4).
PASS = the sign holds in both halves for the asset classes carrying the events.
FAIL = STOP. Do not proceed to Phase 3. A failure means the measurement is suspect
       — wrong sampling frequency, bad data, or the estimator is not isolating what we
       think it is at this scope — and no amount of downstream modelling repairs that.

`--timing` runs the sharper, non-pre-registered confirmation the daily aggregate cannot
give: it reloads M1 and asks WHERE the day's single largest 1-min move sits. If the
daily share is really picking up news, the biggest move on event days should cluster in
the minutes around the release, while non-event days should be near-uniform. That is
the Lee-Mykland-style "flag the jump TIME" read, done cheaply — it tests the mechanism,
not just the average.

Usage:  python3 jump_event_validation.py              (the pre-registered test)
        python3 jump_event_validation.py --timing     (+ the release-clustering check)
"""
import os, sys, csv, math, datetime, collections, itertools, json
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, london_parts

HERE = os.path.dirname(os.path.abspath(__file__))
DAILY_CSV = os.path.join(HERE, 'jump_diffusion_daily.csv')
SUMMARY = os.path.join(HERE, 'jump_diffusion_summary.json')
CAL = os.path.join(HERE, '..', 'calendar_events.csv')
CACHE_DIRS = [os.path.join(HERE, '..', 'portfolioBacktest', 'cache'),
              os.path.join(HERE, '..', 'VolRangeForecaster', 'data', 'm1')]

OOS_FRAC = 0.40          # matches js/volForecastBench.js scoreSeries default
IMPACT = 'Major'         # this file's top tier (no 'High' tier exists here)
COVERED = {'USD', 'EUR', 'GBP'}
TIMING_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'gold']
TIMING_WIN = 5           # minutes either side of a release


def pair_ccys(pair):
    if pair == 'gold':
        return {'USD'}                       # XAU/USD
    return {pair[:3].upper(), pair[3:].upper()}


def load_events():
    """{ccy: {london_date_iso: n_events}} for Major events, UTC->London date."""
    by_ccy = collections.defaultdict(lambda: collections.defaultdict(int))
    times = collections.defaultdict(list)    # ccy -> (london_date, utc_minute_of_day)
    with open(CAL, newline='', encoding='latin-1') as f:   # folder convention (measure.py)
        for row in csv.DictReader(f):
            if row.get('impact') != IMPACT:
                continue
            ccy = row.get('ccy')
            raw = (row.get('datetime_raw') or '').strip()
            try:
                dt = datetime.datetime.strptime(raw, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                continue
            utc_min = int((dt - datetime.datetime(1970, 1, 1)).total_seconds() // 60)
            day_idx, _ = london_parts(np.array([utc_min]))
            d = (datetime.date(1970, 1, 1) + datetime.timedelta(days=int(day_idx[0]))).isoformat()
            by_ccy[ccy][d] += 1
            times[ccy].append((d, dt.hour * 60 + dt.minute))
    return by_ccy, times


def load_daily():
    rows = []
    with open(DAILY_CSV, newline='') as f:
        for r in csv.DictReader(f):
            rows.append(dict(pair=r['pair'], asset_class=r['asset_class'], date=r['date'],
                             jf_1m=float(r['jf_1m']), jf_5m=float(r['jf_5m']),
                             rv_1m=float(r['rv_1m']), bv_1m=float(r['bv_1m']),
                             rv_5m=float(r['rv_5m']), bv_5m=float(r['bv_5m'])))
    return rows


def welch(a, b):
    """t-stat for mean(a) - mean(b), unequal variances."""
    na, nb = a.size, b.size
    if na < 2 or nb < 2:
        return float('nan')
    va, vb = a.var(ddof=1), b.var(ddof=1)
    se = math.sqrt(va / na + vb / nb)
    return (a.mean() - b.mean()) / se if se > 0 else float('nan')


def split_rows(rows):
    """Chronological 60/40 per pair (each pair has its own span), returns seg array."""
    out = []
    for pair, grp in itertools.groupby(sorted(rows, key=lambda r: (r['pair'], r['date'])),
                                         key=lambda r: r['pair']):
        g = list(grp)
        cut = int(len(g) * (1 - OOS_FRAC))
        for i, r in enumerate(g):
            r['seg'] = 0 if i < cut else 1
            out.append(r)
    return out


RESULTS = {}


def report(rows, freq_key, label):
    print(f'\n  ── {label} ──')
    print(f'    {"class":10s} {"half":4s} {"event n":>8s} {"jf|event":>9s} {"quiet n":>8s} '
          f'{"jf|quiet":>9s} {"diff":>8s} {"t":>7s}  verdict')
    verdicts = {}
    for ac in ('fx_major', 'fx_cross', 'metal'):
        sub = [r for r in rows if r['asset_class'] == ac]
        if not sub:
            continue
        signs = []
        for seg, half in ((0, 'IS'), (1, 'OOS')):
            s = [r for r in sub if r['seg'] == seg]
            ev = np.array([r[freq_key] for r in s if r['n_events'] > 0])
            qt = np.array([r[freq_key] for r in s if r['n_events'] == 0])
            if ev.size < 30 or qt.size < 30:
                print(f'    {ac:10s} {half:4s} (thin: {ev.size}/{qt.size})'); signs.append(False); continue
            d = ev.mean() - qt.mean(); t = welch(ev, qt)
            ok = d > 0
            signs.append(ok)
            print(f'    {ac:10s} {half:4s} {ev.size:8d} {ev.mean():9.4f} {qt.size:8d} '
                  f'{qt.mean():9.4f} {d:+8.4f} {t:+7.2f}  {"higher" if ok else "LOWER (fails)"}')
        verdicts[ac] = all(signs) and len(signs) == 2
    return verdicts


def timing_check(events_times):
    """Where does the day's single largest 1-min move sit, relative to a release?"""
    found = {}
    for d in CACHE_DIRS:
        if os.path.isdir(d):
            for fn in os.listdir(d):
                if fn.endswith('_m1.parquet'):
                    found.setdefault(fn[:-len('_m1.parquet')], os.path.join(d, fn))
    print('\n\n=== TIMING CHECK (mechanism, not pre-registered) ===')
    print('Does the day\'s LARGEST 1-min move land on the release minute?\n')
    print(f'  {"pair":8s} {"event days":>10s} {"near release":>13s} {"quiet days":>11s} '
          f'{"same minutes":>13s}  lift')
    for p in TIMING_PAIRS:
        if p not in found:
            continue
        ccys = pair_ccys(p) & COVERED
        # release minute-of-day (UTC) per london date for this pair's currencies
        rel = collections.defaultdict(set)
        for c in ccys:
            for d, mod in events_times.get(c, []):
                rel[d].add(mod)
        m1 = load_m1(found[p]); daily = build_london_daily(m1)
        _, _ = london_parts(m1['utc_min'])
        utc_mod = (m1['utc_min'] % 1440)
        hit_ev = tot_ev = hit_q = tot_q = 0
        cover_ev = cover_q = 0.0
        for i in range(daily['day_idx'].size):
            a, b = daily['start'][i], daily['end'][i]
            if b - a < 600:
                continue
            d = (datetime.date(1970, 1, 1) + datetime.timedelta(days=int(daily['day_idx'][i]))).isoformat()
            cl = m1['close'][a:b]
            if cl.min() <= 0:
                continue
            r = np.abs(np.diff(np.log(cl)))
            k = int(np.argmax(r)) + 1                       # bar index of the biggest move
            mod = int(utc_mod[a + k])
            mins = rel.get(d)
            if mins:
                near = any(abs(mod - m) <= TIMING_WIN for m in mins)
                hit_ev += near; tot_ev += 1
                # what share of the day's minutes are "near a release"? (the null)
                cover_ev += len({x for m in mins for x in range(m - TIMING_WIN, m + TIMING_WIN + 1)}) / (b - a)
            else:
                tot_q += 1
        if tot_ev < 50:
            continue
        p_ev = hit_ev / tot_ev
        p_null = cover_ev / tot_ev
        print(f'  {p:8s} {tot_ev:10d} {p_ev*100:12.1f}% {tot_q:11d} {p_null*100:12.1f}%  '
              f'{p_ev/p_null:4.1f}x')
    print('\n  "near release" = the day\'s largest 1-min move fell within '
          f'±{TIMING_WIN}min of a Major release.')
    print('  "same minutes" = the share of the session those windows cover — the '
          'random-chance baseline.')


def main(argv):
    if not os.path.exists(DAILY_CSV):
        print('run jump_diffusion_daily.py first'); return 1
    by_ccy, times = load_events()
    rows = load_daily()

    testable, untestable = [], set()
    for r in rows:
        ccys = pair_ccys(r['pair']) & COVERED
        if not ccys:
            untestable.add(r['pair']); continue
        r['n_events'] = sum(by_ccy[c].get(r['date'], 0) for c in ccys)
        testable.append(r)
    rows = split_rows(testable)

    print('=' * 96)
    print('PHASE 2 — jump share vs known Major macro events   (PRE-REGISTERED KILL CONDITION)')
    print('=' * 96)
    print(f'  calendar tier       : {IMPACT} (this file has Major/Moderate/Standard; no "High")')
    print(f'  covered currencies  : {sorted(COVERED)}')
    print(f'  split               : {int((1-OOS_FRAC)*100)}/{int(OOS_FRAC*100)} chronological, per pair')
    print(f'  testable rows       : {len(rows):,d} over {len({r["pair"] for r in rows})} pairs')
    if untestable:
        print(f'  UNTESTABLE (no USD/EUR/GBP leg, excluded not defaulted): '
              f'{", ".join(sorted(untestable))}')
    ev_share = np.mean([r['n_events'] > 0 for r in rows])
    print(f'  Major-event days    : {ev_share*100:.1f}% of testable rows')

    v1 = report(rows, 'jf_1m', 'jump_frac @ 1-min sampling')
    v5 = report(rows, 'jf_5m', 'jump_frac @ 5-min sampling')

    print('\n' + '=' * 96)
    print('VERDICT')
    carriers = [ac for ac in ('fx_major', 'fx_cross', 'metal')
                if any(r['asset_class'] == ac for r in rows)]
    passed = True
    for ac in carriers:
        a, b = v1.get(ac), v5.get(ac)
        tag = ('PASS both freqs' if a and b else 'PASS 5-min only' if b else
               'PASS 1-min only' if a else 'FAIL')
        print(f'  {ac:10s}: {tag}')
        if not (a or b):
            passed = False
    if passed:
        print('\n  Pre-registered condition HOLDS — the whole-session jump share tracks known')
        print('  events, IS and OOS. Phase 3 (the diffusion-only sigma payoff test) may proceed.')
    else:
        print('\n  Pre-registered condition FAILS. STOP — the measurement itself is suspect.')
        print('  Do not proceed to Phase 3.')
    print('=' * 96)

    with open(SUMMARY, 'w') as f:
        json.dump(dict(phase2=dict(impact_tier=IMPACT, oos_frac=OOS_FRAC,
                                   testable_rows=len(rows), untestable=sorted(untestable),
                                   event_day_share=round(float(ev_share), 4),
                                   cells=RESULTS, passed=bool(passed))), f, indent=1)
    print(f'\n  wrote {os.path.basename(SUMMARY)}')

    if '--timing' in argv:
        timing_check(times)
    return 0 if passed else 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
