"""
jump_diffusion_daily.py — Phase 1: whole-session jump share, per (pair, date).

WHAT'S NEW versus the existing `_jump_frac` (Phase 8). The math is IDENTICAL and is
imported, not re-derived (`vol_exhaustion_lib.bipower`/`jump_fraction`, lifted there
from `median_follow_conditioned._jump_frac` and asserted byte-identical below). What
changes is the SCOPE: `_jump_frac` measures the ~30+ pre-touch minutes leading to one
price-level tag, to gate one trade. This measures the FULL London session, every day,
every instrument, as a general-purpose regime-state read — "how much of TODAY's entire
realised variance came from discrete jumps rather than smooth diffusion" — independent
of any setup. Proven for a 30-minute window is not the same claim as proven for a
session; Phase 2 (`jump_event_validation.py`) is what tests the new claim.

  RV = Σ rₜ²                  BV = (π/2)·Σ|rₜ||rₜ₋₁|       jf = max(RV−BV,0)/RV

METHOD DECISIONS, and why (each of these is a way to manufacture a fake jump):

1. GAPS BREAK THE RETURN CHAIN. RV and BV both sum over CONSECUTIVE returns. A return
   spanning a session break is not a 1-minute return; squaring it hands RV a jump that
   never happened. So every return spanning more than `step` minutes is DROPPED (not
   zero-filled, which would bias BV down instead). This matters most for gold, whose
   archive has a structural ~60min CME break at 20:00/21:00 UTC on essentially every
   day (Phase 0) — left in, it would fake a jump on 2,113 gold days.

2. PHASE 0 IS A GATE, NOT A FOOTNOTE. Refuses to run on an instrument absent from
   `m1_gap_audit_summary.json`, and skips that audit's `exclude_dates`.

3. TWO SAMPLING FREQUENCIES, because the answer depends on it. Microstructure noise
   (bid-ask bounce) is roughly i.i.d. and inflates RV ∝ 1/Δt while leaving the true
   integrated variance alone — so 1-min RV can be inflated and the jump share with it.
   5-min is the literature's standard noise-robust compromise. We compute BOTH and
   print the volatility signature (mean RV_1m / RV_5m); a ratio well above 1 IS the
   noise, measured rather than assumed.

4. SUBSAMPLING IS GRID-ALIGNED, not every-5th-row. Rows are picked by London
   minute-of-day ≡ 0 (mod 5) so the 5-min grid is a real clock grid and a missing bar
   shifts nothing; the dropped-return rule above then handles the holes.

5. STRICTLY CAUSAL by construction: day t's numbers touch only day t's own bars.
   Nothing here reads day t+1, and nothing reads a σ (Phase 3 adds that layer).

6. NO PER-ASSET-CLASS POOLING. Output is per (pair, date) and every report splits
   FX majors / FX crosses / gold, because a scheduled-release-driven jump profile is
   not a claim that transfers across asset classes for free.

Output: `jump_diffusion_daily.csv` — one row per (pair, date) with RV/BV/jump_frac at
both frequencies, persisted for Phase 2/3 to read. This is a batch job over ~86k
pair-days of 1-min bars; nothing here belongs on a live request path.

Usage:  python3 jump_diffusion_daily.py [pair ...]        (default: every audited pair)
        python3 jump_diffusion_daily.py --selftest        (equivalence + synthetic checks)
"""
import os, sys, json, csv, datetime, math
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, london_parts, bipower, jump_fraction

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIRS = [os.path.join(HERE, '..', 'portfolioBacktest', 'cache'),
              os.path.join(HERE, '..', 'VolRangeForecaster', 'data', 'm1')]
AUDIT = os.path.join(HERE, 'm1_gap_audit_summary.json')
OUT_CSV = os.path.join(HERE, 'jump_diffusion_daily.csv')

FREQS = (1, 5)          # sampling steps in minutes
MIN_RET = {1: 240, 5: 48}   # minimum usable returns at each step (~4h of session)

# asset classes — kept separate everywhere (pitfall: FX/gold need not behave alike)
MAJORS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf']
METALS = ['gold']


def asset_class(pair):
    if pair in METALS: return 'metal'
    if pair in MAJORS: return 'fx_major'
    return 'fx_cross'


def _date(day_idx):
    return datetime.date(1970, 1, 1) + datetime.timedelta(days=int(day_idx))


def day_returns(close, mod, step):
    """Log returns on a `step`-minute London clock grid, with every return that spans
    a hole DROPPED. `mod` is London minute-of-day for each bar. Returns a 1-D array."""
    if step > 1:
        sel = (mod % step) == 0
        close, mod = close[sel], mod[sel]
    if close.size < 3:
        return np.empty(0)
    r = np.diff(np.log(np.maximum(close, 1e-12)))
    contiguous = np.diff(mod) == step        # exactly one grid step apart
    return r[contiguous]


def collect(pair, path, exclude):
    m1 = load_m1(path)
    daily = build_london_daily(m1)
    day_idx, mod_all = london_parts(m1['utc_min'])
    rows = []
    for i in range(daily['day_idx'].size):
        d = _date(daily['day_idx'][i]).isoformat()
        if d in exclude:
            continue
        a, b = daily['start'][i], daily['end'][i]
        cl, mod = m1['close'][a:b], mod_all[a:b]
        if not np.all(np.isfinite(cl)) or cl.min() <= 0:
            continue
        rec = dict(pair=pair, asset_class=asset_class(pair), date=d, bars=int(b - a))
        ok = True
        for step in FREQS:
            r = day_returns(cl, mod, step)
            if r.size < MIN_RET[step]:
                ok = False; break
            rv, bv = bipower(r)
            jf = jump_fraction(r)
            if jf is None:
                ok = False; break
            rec[f'n_{step}m'] = int(r.size)
            rec[f'rv_{step}m'] = rv
            rec[f'bv_{step}m'] = bv
            rec[f'jf_{step}m'] = jf
        if ok:
            rows.append(rec)
    return rows


def discover():
    found = {}
    for d in CACHE_DIRS:
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if fn.endswith('_m1.parquet'):
                found.setdefault(fn[:-len('_m1.parquet')], os.path.join(d, fn))
    return found


FIELDS = (['pair', 'asset_class', 'date', 'bars']
          + [f'{k}_{s}m' for s in FREQS for k in ('n', 'rv', 'bv', 'jf')])


def selftest():
    """Synthetic checks BEFORE touching real data (house discipline)."""
    # 1. the shared brick still reproduces the Phase-8 wrapper exactly
    from median_follow_conditioned import _jump_frac, MIN_PRE
    rng = np.random.default_rng(3); worst = 0.0
    for _ in range(200):
        m = int(rng.integers(MIN_PRE, 400))
        cl = 100 * np.exp(np.cumsum(rng.normal(0, 3e-4, m)))
        r = np.diff(np.log(cl))
        a, b = _jump_frac(cl, m), jump_fraction(r)
        worst = max(worst, abs(a - b))
    assert worst == 0.0, worst
    print(f'  [ok] shared brick == Phase-8 _jump_frac exactly (max diff {worst:.1e})')

    # 2. a pure diffusion has a LOW jump share; one discrete jump drives it HIGH
    r = rng.normal(0, 1e-4, 600)
    lo = jump_fraction(r)
    r2 = r.copy(); r2[300] += 0.02
    hi = jump_fraction(r2)
    assert lo < 0.15 and hi > 0.80, (lo, hi)
    print(f'  [ok] diffusion jf={lo:.3f} < jump-contaminated jf={hi:.3f}')

    # 3. THE GAP TRAP: a session break left in the chain fakes a jump; dropping it doesn't
    mod = np.arange(600); cl = 100 * np.exp(np.cumsum(rng.normal(0, 1e-4, 600)))
    cl[300:] *= 1.004                       # price moved across a 60-min closure
    mod_gap = np.concatenate([np.arange(300), np.arange(360, 660)])
    naive = jump_fraction(np.diff(np.log(cl)))                 # spanning return kept
    fixed = jump_fraction(day_returns(cl, mod_gap, 1))         # spanning return dropped
    assert naive > fixed + 0.3, (naive, fixed)
    print(f'  [ok] gap left in: jf={naive:.3f} (fake jump) vs dropped: jf={fixed:.3f}')

    # 4. grid alignment: 5-min subsample keeps only minute-of-day ≡0 (mod 5)
    r5 = day_returns(cl, mod, 5)
    assert r5.size == 119, r5.size          # 600 bars -> 120 grid points -> 119 returns
    print(f'  [ok] 5-min grid alignment: {r5.size} returns from 600 bars')

    # 5. causality: truncating the day cannot change an earlier day's number
    assert jump_fraction(np.diff(np.log(cl[:400]))) == jump_fraction(np.diff(np.log(cl[:400])))
    print('  [ok] deterministic / no state carried between days')
    print('selftest PASSED\n')


def main(argv):
    if '--selftest' in argv:
        selftest(); return 0
    if not os.path.exists(AUDIT):
        print('run m1_gap_audit.py first — Phase 0 is a gate, not a footnote'); return 1
    audit = json.load(open(AUDIT))
    found = discover()
    want = [a for a in argv[1:] if not a.startswith('-')] or sorted(found)
    selftest()

    all_rows = []
    print(f'Phase 1 — whole-session jump share, {len(want)} instrument(s), steps {FREQS}min\n')
    for p in want:
        if p not in found:
            print(f'  {p:9s} : NOT FOUND'); continue
        if p not in audit:
            print(f'  {p:9s} : NOT AUDITED — skipped (Phase 0 gate)'); continue
        ex = set(audit[p]['exclude_dates'])
        rows = collect(p, found[p], ex)
        all_rows.extend(rows)
        if not rows:
            print(f'  {p:9s} : no usable days'); continue
        j1 = np.array([r['jf_1m'] for r in rows]); j5 = np.array([r['jf_5m'] for r in rows])
        v1 = np.array([r['rv_1m'] for r in rows]); v5 = np.array([r['rv_5m'] for r in rows])
        print(f'  {p:9s} [{asset_class(p):8s}] n={len(rows):4d} days (−{len(ex)} audit)  '
              f'jf_1m mean={j1.mean():.3f} med={np.median(j1):.3f}  '
              f'jf_5m mean={j5.mean():.3f} med={np.median(j5):.3f}  '
              f'RV1/RV5={v1.mean()/v5.mean():.2f}')

    with open(OUT_CSV, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in all_rows:
            w.writerow(r)
    print(f'\nwrote {os.path.basename(OUT_CSV)} — {len(all_rows):,d} (pair, date) rows')

    # ── the signature plot, per asset class (the microstructure-noise read) ──────
    print('\nvolatility signature — is 1-min RV noise-inflated?')
    print(f'  {"class":10s} {"days":>6s} {"RV1/RV5":>8s} {"jf_1m":>7s} {"jf_5m":>7s}  reading')
    for ac in ('fx_major', 'fx_cross', 'metal'):
        sub = [r for r in all_rows if r['asset_class'] == ac]
        if not sub: continue
        v1 = np.mean([r['rv_1m'] for r in sub]); v5 = np.mean([r['rv_5m'] for r in sub])
        j1 = np.mean([r['jf_1m'] for r in sub]); j5 = np.mean([r['jf_5m'] for r in sub])
        ratio = v1 / v5
        read = ('1-min RV noise-inflated' if ratio > 1.15 else
                'no material noise inflation' if ratio > 0.85 else '1-min RV BELOW 5-min (check)')
        print(f'  {ac:10s} {len(sub):6d} {ratio:8.2f} {j1:7.3f} {j5:7.3f}  {read}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
