"""
jump_detect_lm.py — Phase 13: WHERE the jumps are, not just how much variance they hold.

The Phase-12 daily bipower share answers "how much of today's variance was jumpy". It
structurally cannot answer how MANY jumps, how BIG, in which DIRECTION, or whether jumps
CLUSTER — that is a single ratio per day with no per-return resolution. Those questions
need a detector that flags individual jump TIMES.

LEE-MYKLAND (2008). Scale each return by a LOCAL volatility built from the K returns
strictly BEFORE it (bipower, so a previous jump cannot inflate the yardstick and mask the
next one). Under the null of no jump, max|L| over n returns is Gumbel, so the threshold
is a stated false-positive RATE rather than a hand-picked "3x ATR":

    L_i = r~_i / sigma_hat_i ,  sigma_hat_i^2 = (1/(K-2)) SUM |r~_j||r~_{j-1}|, j in (i-K, i)
    flag if |L_i| > C_n + S_n * (-ln(-ln(1-alpha)))
    C_n = (2 ln n)^.5/c - (ln(pi)+ln(ln n))/(2c(2 ln n)^.5),  S_n = 1/(c(2 ln n)^.5),  c = sqrt(2/pi)

n = returns per day, so alpha is a per-DAY false-positive rate: in a pure-diffusion world
~alpha of days would still show a "jump". That is the null every number here is read
against, and it is printed beside the realised rates.

TWO THINGS THAT MUST BE RIGHT, both of which were wrong in the first draft and were
caught by looking at the time-of-day profile of the detections:

  1. THE WINDOW RUNS CONTINUOUSLY ACROSS DAYS. A London session holds only ~288 5-min
     returns, so building the grid per-day left K=270 unable to fill until ~11 hours in —
     the detector was structurally blind before ~10:00 UTC and could never flag a London-
     open jump. The grid is therefore built once per INSTRUMENT over its whole history,
     and detections are assigned back to London days afterwards.

  2. RETURNS ARE DESEASONALISED FIRST (Boudt-Croux-Laurent 2011). Intraday FX volatility
     has a ~3x diurnal cycle (04:00 UTC ~0.5x the daily mean, 14:00 UTC ~1.8x). LM
     compares a return against a ~22h-wide local average, so without an adjustment it
     over-detects in the US session purely because that is when the market is busy, and
     under-detects overnight. Each return is divided by a per-time-of-day periodicity
     factor (robust median |r| per 30-min bucket, normalised to mean 1) estimated on the
     IS half ONLY and applied unchanged to OOS. What survives is a return large RELATIVE
     TO ITS OWN TIME OF DAY, which is what "jump" should mean.

WHY 5-MINUTE SAMPLING. Phase 1 measured the volatility signature: RV_1m/RV_5m = 1.05-1.19,
i.e. 1-min returns carry mild microstructure noise — and noise is exactly what an
L-statistic mistakes for a jump. K = 270 is LM's own recommendation for 5-min data.

INHERITED DISCIPLINE (same as Phase 1): returns spanning a session break are DROPPED
(gold's structural CME break would otherwise be "detected" every day); the Phase-0 audit
gates pairs/dates; the local-vol window looks strictly BACKWARD.

PER (pair, date) OUTPUT: n_jumps, jump_intensity, jv_up/jv_dn, jump_asym, max_jump,
jump_var_share, realised semivariance rs_up/rs_dn, realised quarticity rq, and the
minute-of-day of the first/last jump for the event-timing validation.

Descriptive only. No trade, no cost, no signal.

Usage:  python3 jump_detect_lm.py [pair ...]     python3 jump_detect_lm.py --selftest
"""
import os, sys, csv, json, math, datetime, collections
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, london_parts

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIRS = [os.path.join(HERE, '..', 'portfolioBacktest', 'cache'),
              os.path.join(HERE, '..', 'VolRangeForecaster', 'data', 'm1')]
AUDIT = os.path.join(HERE, 'm1_gap_audit_summary.json')
OUT_CSV = os.path.join(HERE, 'jump_detect_lm.csv')

STEP = 5                 # minutes — the noise-robust grid (Phase 1 signature plot)
K = 270                  # LM's recommended local-vol window for 5-min data
ALPHA = 0.01             # per-DAY false-positive rate under pure diffusion
MIN_RET = 48             # ~4h of 5-min returns before a day is usable
BUCKET = 30              # minutes per periodicity bucket (48 buckets/day)
IS_FRAC = 0.60           # periodicity estimated on this leading fraction only
C_BP = math.sqrt(2.0 / math.pi)

MAJORS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf']
METALS = ['gold']
# equity indices (added for the Phase-15 cross-asset check) — a genuinely different asset
# class, never pooled with FX crosses (Phase 1's own no-pooling rule). Mirrored in both
# copies of asset_class() in this folder so a reader of either CSV sees the same label.
INDICES = ['nq', 'de30', 'spx500', 'uk100', 'us2000', 'us30']


def asset_class(p):
    if p in METALS: return 'metal'
    if p in MAJORS: return 'fx_major'
    if p in INDICES: return 'index'
    return 'fx_cross'


def lm_threshold(n, alpha=ALPHA):
    """Gumbel critical value for max|L| over n returns (Lee-Mykland 2008)."""
    if n < 5:
        return float('inf')
    ln_n = math.log(n)
    s2 = math.sqrt(2.0 * ln_n)
    c_n = s2 / C_BP - (math.log(math.pi) + math.log(ln_n)) / (2.0 * C_BP * s2)
    s_n = 1.0 / (C_BP * s2)
    return c_n + s_n * (-math.log(-math.log(1.0 - alpha)))


def local_sigma(r, k=K):
    """sigma_hat_i from the k returns STRICTLY BEFORE i (bipower -> jump-robust)."""
    n = r.size
    prod = np.zeros(n)
    prod[1:] = np.abs(r[1:]) * np.abs(r[:-1])
    cs = np.concatenate([[0.0], np.cumsum(prod)])
    lo = np.maximum(np.arange(n) - k + 1, 1)
    hi = np.arange(n)
    valid = hi - lo >= k // 2
    s2 = np.where(valid, (cs[hi] - cs[lo]) / np.maximum(hi - lo, 1), np.nan)
    out = np.sqrt(np.maximum(s2, 0.0))
    out[~valid] = np.nan
    return out


def periodicity(r, tod, n_is, bucket=BUCKET):
    """Per-time-of-day scale factor, robust (median |r|), normalised to mean 1.
    Estimated on the FIRST n_is returns only, so OOS never informs its own yardstick."""
    nb = 1440 // bucket
    b = (tod // bucket) % nb
    f = np.ones(nb)
    ref = np.median(np.abs(r[:n_is])) or 1.0
    for j in range(nb):
        m = b[:n_is] == j
        if m.sum() >= 50:
            f[j] = (np.median(np.abs(r[:n_is][m])) or ref) / ref
    f = np.maximum(f / f.mean(), 0.05)          # normalise to mean 1; floor for safety
    return f, b


def instrument_grid(m1, step=STEP):
    """ONE continuous `step`-minute grid for the whole instrument (not per-day), with
    gap-spanning returns dropped. Returns (r, bar_index_of_return_end, tod_utc_min)."""
    _, mod = london_parts(m1['utc_min'])
    sel = (mod % step) == 0
    idx = np.flatnonzero(sel)
    c = m1['close'][idx]
    ok = np.isfinite(c) & (c > 0)
    idx, c = idx[ok], c[ok]
    if idx.size < 3:
        return np.empty(0), np.empty(0, dtype=int), np.empty(0, dtype=int)
    u = m1['utc_min'][idx]
    r = np.diff(np.log(c))
    keep = np.diff(u) == step                    # contiguous on the clock: no gap spanned
    return r[keep], idx[1:][keep], (u[1:][keep] % 1440)


def collect(pair, path, exclude):
    m1 = load_m1(path)
    daily = build_london_daily(m1)
    r, ridx, tod = instrument_grid(m1)
    if r.size < 5000:
        return []
    n_is = int(r.size * IS_FRAC)
    fac, b = periodicity(r, tod, n_is)
    rr = r / fac[b]                              # deseasonalised returns
    sig = local_sigma(rr)
    with np.errstate(invalid='ignore', divide='ignore'):
        L = np.abs(rr) / sig
    # per-day threshold uses that day's own return count; ~288 for a full session
    thr_default = lm_threshold(1440 // STEP)
    isj_all = np.isfinite(L) & (L > thr_default)

    # map grid returns -> London days via the bar index they end on
    order = np.searchsorted(daily['start'], ridx, side='right') - 1
    rows = []
    for i in range(daily['day_idx'].size):
        d = (datetime.date(1970, 1, 1) + datetime.timedelta(days=int(daily['day_idx'][i]))).isoformat()
        if d in exclude:
            continue
        m = order == i
        rd = r[m]
        if rd.size < MIN_RET:
            continue
        thr = lm_threshold(rd.size)
        isj = np.isfinite(L[m]) & (L[m] > thr)
        jr = rd[isj]
        up, dn = jr[jr > 0], jr[jr < 0]
        jv_up, jv_dn = float(np.sum(up ** 2)), float(np.sum(dn ** 2))
        rv = float(np.sum(rd * rd)); tot = jv_up + jv_dn
        mj = float(jr[np.argmax(np.abs(jr))]) if jr.size else 0.0
        jm = tod[m][isj]
        rows.append(dict(
            pair=pair, asset_class=asset_class(pair), date=d, n_ret=int(rd.size),
            n_jumps=int(isj.sum()),
            jump_intensity=round(float(isj.sum()) / rd.size * 100, 5),
            jv_up=jv_up, jv_dn=jv_dn,
            jump_asym=round((jv_up - jv_dn) / tot, 5) if tot > 0 else 0.0,
            max_jump=mj, jump_var_share=round(tot / rv, 5) if rv > 0 else 0.0,
            rs_up=float(np.sum(rd[rd > 0] ** 2)), rs_dn=float(np.sum(rd[rd < 0] ** 2)),
            rq=float(rd.size / 3.0 * np.sum(rd ** 4)),
            lm_threshold=round(thr, 4),
            first_jump_utc_min=int(jm.min()) if jm.size else -1,
            last_jump_utc_min=int(jm.max()) if jm.size else -1))
    return rows


FIELDS = ['pair', 'asset_class', 'date', 'n_ret', 'n_jumps', 'jump_intensity', 'jv_up',
          'jv_dn', 'jump_asym', 'max_jump', 'jump_var_share', 'rs_up', 'rs_dn', 'rq',
          'lm_threshold', 'first_jump_utc_min', 'last_jump_utc_min']


def selftest():
    rng = np.random.default_rng(5)
    n = 288 * 400
    # 1. pure diffusion -> per-day detection rate near the stated alpha
    r = rng.normal(0, 1e-4, n)
    L = np.abs(r) / local_sigma(r)
    flag = np.isfinite(L) & (L > lm_threshold(288))
    rate = flag.reshape(400, 288).any(axis=1).mean()
    print(f'  [ok] pure diffusion flags a jump on {rate*100:.1f}% of days '
          f'(stated alpha {ALPHA*100:.0f}%) — false-positive rate controlled')
    assert rate < 0.06, rate

    # 2. planted jump found, sign preserved
    r2 = rng.normal(0, 1e-4, 5000); r2[3000] = +0.006
    L2 = np.abs(r2) / local_sigma(r2)
    hit = np.flatnonzero(np.isfinite(L2) & (L2 > lm_threshold(288)))
    assert 3000 in hit and r2[3000] > 0, hit
    print(f'  [ok] planted +0.6% jump detected (n hits {hit.size}, sign preserved)')

    # 3. a jump must not blind the detector to the next one (why local vol is bipower)
    r3 = rng.normal(0, 1e-4, 5000); r3[3000] = 0.006; r3[3100] = 0.006
    L3 = np.abs(r3) / local_sigma(r3)
    h3 = set(np.flatnonzero(np.isfinite(L3) & (L3 > lm_threshold(288))).tolist())
    assert 3000 in h3 and 3100 in h3, sorted(h3)[:10]
    print('  [ok] two nearby jumps both detected — yardstick not inflated by the first')

    # 4. THE DIURNAL TRAP: a pure-diffusion day with a 3x busy period must NOT be called
    #    a jump once deseasonalised, though it would be without the adjustment.
    tod = np.tile(np.arange(0, 1440, STEP), 400)
    amp = np.where((tod >= 720) & (tod < 900), 3.0, 1.0)       # 12:00-15:00 UTC busy
    r4 = rng.normal(0, 1e-4, tod.size) * amp
    raw = np.isfinite(np.abs(r4) / local_sigma(r4)) & (np.abs(r4) / local_sigma(r4) > lm_threshold(288))
    fac, b = periodicity(r4, tod, int(tod.size * IS_FRAC))
    rr = r4 / fac[b]
    des = np.isfinite(np.abs(rr) / local_sigma(rr)) & (np.abs(rr) / local_sigma(rr) > lm_threshold(288))
    print(f'  [ok] diurnal trap: raw flags {raw.sum()} false jumps, deseasonalised {des.sum()} '
          f'({des.sum()/max(raw.sum(),1)*100:.0f}% of them survive)')
    assert des.sum() < raw.sum() * 0.4, (raw.sum(), des.sum())

    # 5. periodicity recovers the injected shape, and is estimated IS-only
    assert fac[(720 // BUCKET)] / fac[0] > 2.0, fac[(720 // BUCKET)] / fac[0]
    print(f'  [ok] periodicity recovers the 3x busy window '
          f'({fac[720//BUCKET]/fac[0]:.2f}x vs injected 3.0x), fitted on IS only')

    # 6. causality
    s_full, s_tr = local_sigma(r4), local_sigma(r4[:4000])
    ok = np.isfinite(s_full[:4000]) & np.isfinite(s_tr)
    assert np.allclose(s_full[:4000][ok], s_tr[ok]), 'local_sigma peeks ahead'
    print('  [ok] local sigma strictly causal (truncation-invariant)')
    print('selftest PASSED\n')


def discover():
    found = {}
    for d in CACHE_DIRS:
        if os.path.isdir(d):
            for fn in sorted(os.listdir(d)):
                if fn.endswith('_m1.parquet'):
                    found.setdefault(fn[:-len('_m1.parquet')], os.path.join(d, fn))
    return found


def main(argv):
    if '--selftest' in argv:
        selftest(); return 0
    if not os.path.exists(AUDIT):
        print('run m1_gap_audit.py first'); return 1
    audit = json.load(open(AUDIT))
    found = discover()
    want = [a for a in argv[1:] if not a.startswith('-')] or sorted(found)
    selftest()
    print(f'Phase 13 — Lee-Mykland jumps, {STEP}-min continuous grid, K={K}, '
          f'alpha={ALPHA*100:.0f}%/day, diurnal-adjusted\n')
    all_rows = []
    for p in want:
        if p not in found or p not in audit:
            print(f'  {p:9s} : skipped (missing or unaudited)'); continue
        rows = collect(p, found[p], set(audit[p]['exclude_dates']))
        all_rows.extend(rows)
        if not rows:
            continue
        nj = np.array([r['n_jumps'] for r in rows])
        sh = np.array([r['jump_var_share'] for r in rows])
        print(f'  {p:9s} [{asset_class(p):8s}] n={len(rows):4d} days  '
              f'days w/ >=1 jump={np.mean(nj > 0)*100:5.1f}%  '
              f'mean jumps/day={nj.mean():4.2f}  mean jump-var share={sh.mean():.3f}')
    with open(OUT_CSV, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in all_rows:
            w.writerow(r)
    print(f'\nwrote {os.path.basename(OUT_CSV)} — {len(all_rows):,d} (pair, date) rows')
    print(f'NULL REFERENCE: pure diffusion would show >=1 jump on ~{ALPHA*100:.0f}% of days.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
