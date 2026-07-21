"""
conditioners.py — do RICHER at-the-moment state features sharpen the fresh-extreme
reversal race, BEYOND raw distance-from-open?

Context. The Phase-0/0b study showed:
  * distance-from-open -> P(reversal) is flat ~0.50 (null),
  * the FRESH-EXTREME framing is the one thing that isn't flat (FX ~0.53 hold, index
    trends), but its payoff is symmetric so it's not tradeable on its own.
The owner's push: absolute distance/velocity is too poor a conditioner; test two
richer, principled, σ-normalized state features on the SAME race:

  F1  vwap_stretch = (price - sessionVWAP) / (σ_pred · O)   [σ-units, signed so
      +ve = extended AWAY from VWAP in the extreme's direction].  "1.8σ above VWAP
      is stretched; 0.2σ above VWAP is not." (owner's biggest single idea)
  F2  time_z = dist_in_σ / sqrt(elapsed session fraction).  Brownian expected
      |displacement| grows ∝ √(elapsed), so reaching a given σ-distance EARLY scores
      high (statistically unusual for the time), LATE scores ~= distance. "1.9% by
      09:15 ≠ 1.9% by 18:30."

The honest control. Both features correlate with raw distance (VWAP sits between
open and price; an early extreme is also often a far one). A feature only earns its
keep if it separates P(hold) *within a fixed distance band* — the INCREMENTAL test.
So the headline is terciles of the feature computed ONLY on far events (dist>=1.5σ).

Pre-registered pass (per feature): high-vs-low tercile P(hold) separates >= SEP_MIN,
SAME sign on IS and OOS, on >= 5/6 FX majors. Else NULL (stated plainly). NQ shown
separately (opposite base sign expected).

Reuses the exact σ/anchor/event baseplate (vol_exhaustion_lib + measure_extremes
knobs) — same driftless null (P=0.5), no new vol math, no lookahead (VWAP and
elapsed fraction at bar j use bars [0..j] only).
"""
import os, sys, json, datetime
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma_kind

HERE = os.path.dirname(os.path.abspath(__file__))

def _london_date_str(day_idx):
    return (datetime.date(1970, 1, 1) + datetime.timedelta(days=int(day_idx))).isoformat()

# ── same pre-registered race knobs as measure_extremes.py ─────────────────────
THETA   = 0.25    # barrier half-width, σ-units
H       = 60      # forward horizon, minutes
MIN_EXT = 0.4     # only extremes >= this far from open (σ) — an actual impulse
MIN_BARS = 60
FAR      = 1.5    # "far" distance band for the incremental (distance-controlled) test
SEP_MIN  = 0.03   # required high-vs-low tercile P(hold) separation to pass

# instrument -> parquet (majors + NQ live in portfolioBacktest/cache)
CACHE = os.path.join(HERE, '..', 'portfolioBacktest', 'cache')
INSTR = {
    'EURUSD': 'eurusd_m1.parquet', 'GBPUSD': 'gbpusd_m1.parquet',
    'AUDUSD': 'audusd_m1.parquet', 'NZDUSD': 'nzdusd_m1.parquet',
    'USDCAD': 'usdcad_m1.parquet', 'USDCHF': 'usdchf_m1.parquet',
    'NQ':     'nq_m1.parquet',
}
FX = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF']


def collect(pair, sig_kind='yz'):
    """Walk fresh-extreme events; record (dist, vwap_stretch, time_z, hold, seg)."""
    m1 = load_m1(os.path.join(CACHE, INSTR[pair]))
    daily = build_london_daily(m1)
    sig = causal_sigma_kind(daily, sig_kind)
    nd = daily['open'].size
    split = nd // 2
    dist, vw, tz, hold, seg = [], [], [], [], []
    for i in range(nd):
        s = sig[i]
        if not (s > 0):
            continue
        a, b = daily['start'][i], daily['end'][i]
        if b - a < MIN_BARS:
            continue
        O = daily['open'][i]
        if not (O > 0):
            continue
        c = m1['close'][a:b]; hi = m1['high'][a:b]; lo = m1['low'][a:b]
        vol = m1['volume'][a:b]
        n = c.size
        # causal session VWAP: cumsum of typical-price*vol / cumsum vol, bars [0..j]
        tp = (hi + lo + c) / 3.0
        cum_pv = np.cumsum(tp * vol)
        cum_v  = np.cumsum(vol)
        vwap = np.where(cum_v > 0, cum_pv / np.maximum(cum_v, 1e-12), c)
        thr_px = THETA * s * O
        run_hi, run_lo = c[0], c[0]
        seg_i = 0 if i < split else 1
        for j in range(1, n - 2):
            new_hi = c[j] > run_hi
            new_lo = c[j] < run_lo
            if new_hi: run_hi = c[j]
            if new_lo: run_lo = c[j]
            if not (new_hi or new_lo):
                continue
            d = (c[j] - O) / O / s                       # signed σ-distance
            if abs(d) < MIN_EXT:
                continue
            up = new_hi
            if (up and d < 0) or ((not up) and d > 0):    # extreme must be away from open
                continue
            # resolve the race (same logic as measure_extremes)
            rev_px = c[j] - (thr_px if up else -thr_px)
            ext_px = c[j] + (thr_px if up else -thr_px)
            e = min(n, j + 1 + H)
            fh = hi[j + 1:e]; fl = lo[j + 1:e]
            if fh.size == 0:
                continue
            if up:
                rev_hits = fl <= rev_px; ext_hits = fh >= ext_px
            else:
                rev_hits = fh >= rev_px; ext_hits = fl <= ext_px
            r_any, e_any = rev_hits.any(), ext_hits.any()
            if not r_any and not e_any:
                continue
            r_idx = np.argmax(rev_hits) if r_any else 1 << 30
            e_idx = np.argmax(ext_hits) if e_any else 1 << 30
            if r_idx == e_idx:
                continue
            # F1: VWAP stretch, σ-normalized, signed +ve = extended past VWAP in dir
            stretch = (c[j] - vwap[j]) / (s * O)
            if not up:
                stretch = -stretch
            # F2: time-normalized path z = |dist_σ| / sqrt(elapsed session fraction)
            f = (j + 1) / n
            time_z = abs(d) / np.sqrt(max(f, 1e-6))
            dist.append(abs(d)); vw.append(stretch); tz.append(time_z)
            hold.append(1 if r_idx < e_idx else 0); seg.append(seg_i)
    return (np.array(dist), np.array(vw), np.array(tz),
            np.array(hold), np.array(seg),
            _london_date_str(daily['day_idx'][split]))


def _tercile_split(x, y, seg, seg_val):
    """P(hold) in low vs high tercile of feature x, on one IS/OOS segment.
    Returns (p_low, p_high, n_low, n_high) or Nones if too thin."""
    m = seg == seg_val
    xs, ys = x[m], y[m]
    if xs.size < 60:
        return (None, None, 0, 0)
    q1, q2 = np.quantile(xs, [1 / 3, 2 / 3])
    lo = xs <= q1; hi = xs >= q2
    if lo.sum() < 20 or hi.sum() < 20:
        return (None, None, int(lo.sum()), int(hi.sum()))
    return (ys[lo].mean(), ys[hi].mean(), int(lo.sum()), int(hi.sum()))


def analyse(pair, res):
    dist, vw, tz, hold, seg, split_date = res
    far = dist >= FAR                       # distance-controlled: far events only
    n_far = int(far.sum())
    out = {'pair': pair, 'n_events': int(hold.size), 'n_far': n_far,
           'mean_hold': float(hold.mean()) if hold.size else None,
           'split_date': split_date, 'features': {}}
    for fname, fx in [('vwap_stretch', vw), ('time_z', tz)]:
        row = {}
        for lab, sv in [('IS', 0), ('OOS', 1)]:
            pl, ph, nl, nh = _tercile_split(fx[far], hold[far], seg[far], sv)
            row[lab] = dict(p_low=None if pl is None else round(pl, 4),
                            p_high=None if ph is None else round(ph, 4),
                            sep=None if (pl is None or ph is None) else round(ph - pl, 4),
                            n_low=nl, n_high=nh)
        out['features'][fname] = row
    return out


def verdict(fname, rows):
    """Pre-registered pass check across the 6 FX majors."""
    ok = 0; n = 0
    for r in rows:
        f = r['features'][fname]
        s_is, s_oos = f['IS']['sep'], f['OOS']['sep']
        if s_is is None or s_oos is None:
            continue
        n += 1
        same_sign = (s_is > 0) == (s_oos > 0)
        big_enough = abs(s_oos) >= SEP_MIN and abs(s_is) >= SEP_MIN
        if same_sign and big_enough:
            ok += 1
    return ok, n


def main():
    sig_kind = 'yz'
    pairs = sys.argv[1:] or (FX + ['NQ'])
    results, summary = {}, {}
    print(f'\n{"="*74}\nRicher conditioners on the fresh-extreme race  (σ={sig_kind}, '
          f'FAR>={FAR}σ, θ={THETA}, H={H}m)\n{"="*74}')
    hdr = (f'{"pair":8} {"n_far":>7} {"hold":>6} | '
           f'{"VWAP IS(lo→hi)":>16} {"OOS(lo→hi)":>16} | '
           f'{"timeZ IS(lo→hi)":>16} {"OOS(lo→hi)":>16}')
    print(hdr); print('-' * len(hdr))
    for pair in pairs:
        r = analyse(pair, collect(pair, sig_kind))
        results[pair] = r; summary[pair] = r

        def cell(feat, seg):
            f = r['features'][feat][seg]
            if f['p_low'] is None:
                return f'{"--":>16}'
            return f'{f["p_low"]:.3f}→{f["p_high"]:.3f}({f["sep"]:+.3f})'.rjust(16)
        print(f'{pair:8} {r["n_far"]:7d} {r["mean_hold"]:6.3f} | '
              f'{cell("vwap_stretch","IS")} {cell("vwap_stretch","OOS")} | '
              f'{cell("time_z","IS")} {cell("time_z","OOS")}')

    if not all(p in results for p in FX):
        print('\n(partial run — skipping cross-sectional verdict; pass all 6 majors for it)')
        with open(os.path.join(HERE, 'conditioners_summary.json'), 'w') as fp:
            json.dump(summary, fp, indent=2)
        return
    print('\n' + '=' * 74 + '\nPRE-REGISTERED VERDICT  (FX majors only; pass = high-vs-low tercile\n'
          f'P(hold) sep >= {SEP_MIN:.2f}, same sign IS & OOS, on >= 5/6 majors)\n' + '=' * 74)
    fx_rows = [results[p] for p in FX]
    for fname in ('vwap_stretch', 'time_z'):
        ok, n = verdict(fname, fx_rows)
        tag = 'PASS' if ok >= 5 else 'NULL'
        print(f'  {fname:14}: {ok}/{n} majors show consistent incremental separation  -> {tag}')
    # NQ shown for the sign-flip context
    nq = results.get('NQ')
    if nq:
        for fname in ('vwap_stretch', 'time_z'):
            f = nq['features'][fname]
            print(f'  [NQ] {fname:12}: IS sep {f["IS"]["sep"]}, OOS sep {f["OOS"]["sep"]} '
                  f'(index base sign differs)')

    with open(os.path.join(HERE, 'conditioners_summary.json'), 'w') as fp:
        json.dump(summary, fp, indent=2)
    print('\n-> conditioners_summary.json')


if __name__ == '__main__':
    main()
