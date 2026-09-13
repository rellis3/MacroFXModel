"""
export_intraday_percentiles.py — the yardstick a LIVE jump reading is scored against.

THE PROBLEM THIS SOLVES. `jump_state.json` carries each pair's FULL-DAY jump-share
percentiles. Those are the wrong ruler for an in-progress session, for two reasons that
both push the same way:

  * at 09:00 London you have seen ~100 of a day's ~288 five-minute returns, so the
    estimate is simply noisier;
  * and one release dominates a short window far more than it dominates a full session,
    so a part-day share is biased HIGH relative to a full-day one.

Scoring a 09:00 reading against a full-day p90 therefore cries wolf every morning. The
fix is a ruler measured at the same point in the day: for every 30-minute checkpoint,
the historical distribution of the jump share *from the session open to that checkpoint*.

Also freezes the DIURNAL PERIODICITY FACTORS the live Lee-Mykland detector needs. They
are fitted here, on the full archive, and never refit live — a single session is nowhere
near enough to estimate a 48-bucket intraday curve, and a live refit would silently drift
from the research.

CAUSALITY / SCOPE. Every checkpoint uses only bars from that day's open up to that
checkpoint, so the table describes exactly what a live caller can actually have seen. The
percentiles are pooled over the pair's whole history (this is a reference distribution,
not a fitted signal, so there is no IS/OOS split to respect here — nothing is being
selected on).

Output: `data/jump_intraday.json`
  { instruments: { <pair>: { checkpoints:[min...], p50:[], p75:[], p90:[], p95:[], p99:[],
                             n:[], periodicity:[48 factors] } } }

Run after m1_gap_audit.py:
    python3 export_intraday_percentiles.py [pair ...]
"""
import os, sys, json, datetime, collections
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, london_parts
from jump_detect_lm import (instrument_grid, periodicity, asset_class,
                            STEP, BUCKET, IS_FRAC, discover)

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIT = os.path.join(HERE, 'm1_gap_audit_summary.json')
OUT = os.path.join(HERE, 'data', 'jump_intraday.json')

CHECK_EVERY = 30        # minutes between checkpoints (London minute-of-day)
FIRST_CHECK = 60        # nothing before one hour in — too few returns to mean anything
MIN_RET = 8             # a checkpoint needs this many returns on the day to count
MIN_DAYS = 200          # ...and this many days to publish a percentile
PCTS = [50, 75, 90, 95, 99]


def collect(pair, path, exclude):
    """Per checkpoint, the distribution of session-open→checkpoint jump share."""
    m1 = load_m1(path)
    daily = build_london_daily(m1)
    day_idx, mod_all = london_parts(m1['utc_min'])

    # the frozen periodicity curve, fitted exactly as the offline detector fits it
    r_all, ridx_all, tod_all = instrument_grid(m1)
    if r_all.size < 5000:
        return None
    fac, _ = periodicity(r_all, tod_all, int(r_all.size * IS_FRAC))

    checks = list(range(FIRST_CHECK, 1440, CHECK_EVERY))
    buckets = {c: [] for c in checks}
    for i in range(daily['day_idx'].size):
        d = (datetime.date(1970, 1, 1) + datetime.timedelta(days=int(daily['day_idx'][i]))).isoformat()
        if d in exclude:
            continue
        a, b = daily['start'][i], daily['end'][i]
        cl, mod = m1['close'][a:b], mod_all[a:b]
        if cl.size < 3 or not np.all(np.isfinite(cl)) or cl.min() <= 0:
            continue
        sel = (mod % STEP) == 0
        c5, m5 = cl[sel], mod[sel]
        if c5.size < 3:
            continue
        r = np.diff(np.log(np.maximum(c5, 1e-12)))
        keep = np.diff(m5) == STEP                 # drop gap-spanning returns
        r, endmod = r[keep], m5[1:][keep]
        if r.size < MIN_RET:
            continue
        # running RV / BV so each checkpoint is O(1)
        rv = np.cumsum(r * r)
        prod = np.zeros(r.size)
        prod[1:] = np.abs(r[1:]) * np.abs(r[:-1])
        bv = (np.pi / 2) * np.cumsum(prod)
        for c in checks:
            k = int(np.searchsorted(endmod, c, side='right')) - 1
            if k < MIN_RET - 1:
                continue
            if rv[k] > 1e-18:
                buckets[c].append(max(rv[k] - bv[k], 0.0) / rv[k])

    out = dict(checkpoints=[], n=[], periodicity=[round(float(x), 6) for x in fac])
    for q in PCTS:
        out[f'p{q}'] = []
    for c in checks:
        v = np.array(buckets[c])
        if v.size < MIN_DAYS:
            continue
        out['checkpoints'].append(c)
        out['n'].append(int(v.size))
        for q in PCTS:
            out[f'p{q}'].append(round(float(np.percentile(v, q)) * 100, 3))
    return out if out['checkpoints'] else None


def main(argv):
    if not os.path.exists(AUDIT):
        print('run m1_gap_audit.py first'); return 1
    audit = json.load(open(AUDIT))
    found = discover()
    want = [a for a in argv[1:] if not a.startswith('-')] or sorted(found)
    inst = {}
    print(f'intraday percentile table — checkpoints every {CHECK_EVERY}min from '
          f'{FIRST_CHECK}min\n')
    for p in want:
        if p not in found or p not in audit:
            print(f'  {p:9s} : skipped (missing or unaudited)'); continue
        r = collect(p, found[p], set(audit[p]['exclude_dates']))
        if not r:
            print(f'  {p:9s} : thin, skipped'); continue
        r['asset_class'] = asset_class(p)
        inst[p] = r
        mid = len(r['checkpoints']) // 2
        print(f'  {p:9s} [{r["asset_class"]:8s}] {len(r["checkpoints"]):2d} checkpoints  '
              f'@{r["checkpoints"][0]:>4d}min p90={r["p90"][0]:5.1f}%  '
              f'@{r["checkpoints"][mid]:>4d}min p90={r["p90"][mid]:5.1f}%  '
              f'@{r["checkpoints"][-1]:>4d}min p90={r["p90"][-1]:5.1f}%')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    doc = dict(
        generated_utc=datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z',
        note='Jump share from the London session open to each checkpoint, as a PERCENT of '
             'realised variance. A live part-day reading must be scored against the '
             'checkpoint it has actually reached, never against a full-day percentile — a '
             'part-day share is both noisier and biased high. `periodicity` is the frozen '
             '48-bucket diurnal curve (UTC 30-min buckets, mean 1) the live Lee-Mykland '
             'detector divides by; it is never refit live.',
        step_min=STEP, bucket_min=BUCKET, instruments=inst)
    with open(OUT, 'w') as f:
        json.dump(doc, f, indent=1)
    print(f'\nwrote {os.path.relpath(OUT, HERE)} — {len(inst)} instruments, '
          f'{os.path.getsize(OUT)/1024:.0f} KB')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
