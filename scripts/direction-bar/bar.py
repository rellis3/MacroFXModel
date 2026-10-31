"""
direction-bar (Phase 0 of plans/MACRO_DIRECTION_RESEARCH_PROPOSAL.md): the bar every directional claim must clear.
Prereg: forge/DIRECTION_BAR_PREREG.md. Register row: direction-bar.

Three things are kept apart, per instrument x horizon:
  1. BASELINES   B0 climatology (expanding, point-in-time P(up) and mean), B1 buy & hold, B2 12-month momentum
                 (conditional climatology), B3 carry (FX, conditional climatology). Scored vs B0 (Brier, log).
  2. STATISTICS  minimum detectable effect (MDE) RELATIVE TO B0, from empirical placebo cells on the real data
                 (captures overlap, autocorrelation and baseline drift), with the analytic formula alongside.
                 Designs: sparse cell (K spaced events), regime cell (runs), always-on signal (IC); single
                 instrument and pooled (effective N from measured correlation); FX cross-section (Phase 1 gate).
  3. ECONOMICS   round-trip cost by venue and the break-even effect for a long and a short call, in the same units.
A positive control plants a signal of MDE size in a copy of the data and checks the test finds it ~80% of the time.

No data after 2026-08-21 is read (lockbox). Seed 20261031.
Usage: python -I scripts/direction-bar/bar.py      (MFX_DATA_ROOT = checkout holding features/, default repo root)
"""
import json, os, sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import norm

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get('MFX_DATA_ROOT', ROOT))
OUT = ROOT / 'analysis/output/direction-bar'
SEED = 20261031
START, END = pd.Timestamp('2006-01-01'), pd.Timestamp('2026-08-21')
FIT_END, CHECK_END = pd.Timestamp('2022-09-04'), pd.Timestamp('2025-09-04')
H = [1, 5, 20, 60]
MAIN = {'nq': 'nas100', 'es': 'spx500', 'gold': 'xauusd', 'eurusd': 'eurusd', 'gbpusd': 'gbpusd', 'usdjpy': 'usdjpy'}
FX7 = ['eurusd', 'gbpusd', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy']
MIN_HIST = 504                     # resolved outcomes before B0 issues a forecast (2 years)
Z80 = norm.ppf(0.80)
ALPHAS = {'single': 0.05, 'family10': 0.05 / 10, 'ledger217': 0.05 / 217}
PLAUSIBLE = {'sparse_sd': 0.25, 'ic': {1: 0.05, 5: 0.05, 20: 0.10, 60: 0.10}}   # fixed in the prereg (§5)
SPARSE_COVER = 0.10                # historical events for the sparse design: 10% of non-overlapping periods
R_PLACEBO, R_CONTROL, R_IC = 2000, 1000, 500


def zmult(alpha):
    return norm.ppf(1 - alpha / 2) + Z80


# ---------------------------------------------------------------- data
def load(name):
    d = pd.read_parquet(DATA / 'features' / f'px_d1_{name}.parquet')
    s = pd.Series(pd.to_numeric(d['value'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna()
    s = s[~s.index.duplicated(keep='last')].sort_index()
    s = s[s.index.dayofweek < 5]           # DATA_SPEC fault #9: weekend rows dropped; Friday->Monday absorbs them
    s = s[(s.index >= START) & (s.index <= END)]
    assert s.index.max() <= END
    return s


def frame(px, h):
    """Per date t: forward log return over h rows, point-in-time sigma_h, B0 p0/mu0, and 12m momentum."""
    lp = np.log(px)
    r1 = lp.diff()
    var = r1.pow(2).ewm(alpha=0.06, adjust=False, min_periods=60).mean()      # EWMA lambda 0.94, data <= t
    f = pd.DataFrame({'px': px, 'r': lp.shift(-h) - lp, 'sig': np.sqrt(var * h), 'mom': lp - lp.shift(252)})
    f['up'] = (f.r > 0).astype(float).where(f.r.notna())
    f['zr'] = f.r / f.sig
    # outcome of date s is known at s+h: shift by h so the expanding mean at t only uses s <= t-h
    known_up, known_r, known_zr = f.up.shift(h), f.r.shift(h), f.zr.shift(h)
    n = known_up.notna().cumsum()
    f['p0'] = (known_up.fillna(0).cumsum() / n).where(n >= MIN_HIST)
    f['mu0'] = (known_r.fillna(0).cumsum() / n).where(n >= MIN_HIST)
    f['m0'] = (known_zr.fillna(0).cumsum() / known_zr.notna().cumsum()).where(n >= MIN_HIST)
    f['ms'] = np.sign(f.mom)
    # B2: P(up | sign of 12m momentum), expanding, known outcomes only; needs 100 per sign else B0
    for sgn in (1, -1):
        m = (f.ms.shift(h) == sgn)
        cnt = (m & known_up.notna()).cumsum()
        f[f'p2_{sgn}'] = ((known_up.where(m).fillna(0)).cumsum() / cnt).where(cnt >= 100)
    f['p2'] = np.where(f.ms > 0, f['p2_1'], f['p2_-1'])
    f['p2'] = f.p2.fillna(f.p0)
    return f


def carry_sign(pair, idx):
    """Point-in-time 3m rate differential sign (long base ccy minus quote ccy); NaN before vintages exist."""
    base, quote = pair[:3], pair[3:]
    def rate(c):
        d = pd.read_parquet(DATA / 'features' / f'rate3m_{c}.parquet')
        d['asof'] = pd.to_datetime(d['asof'], utc=True).dt.tz_localize(None)
        d = d.sort_values(['asof', 'date'])
        # value known at t = the latest-dated observation among rows published by t
        out = pd.Series(np.nan, index=idx)
        j = 0; best = (None, np.nan); rows = d[['asof', 'date', 'value']].to_numpy()
        for k, t in enumerate(idx):
            while j < len(rows) and rows[j][0] <= t + pd.Timedelta(hours=22):
                if best[0] is None or rows[j][1] >= best[0]:
                    best = (rows[j][1], rows[j][2])
                j += 1
            out.iloc[k] = best[1]
        return out
    return np.sign(rate(base) - rate(quote))


def scoring(f):
    return f.dropna(subset=['r', 'p0', 'sig']).copy()


# ---------------------------------------------------------------- 1. baselines
def brier(p, y):
    return float(np.mean((p - y) ** 2))


def logs(p, y):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return float(np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def block_boot_mean(x, block, rng, B=2000):
    """Moving-block bootstrap CI of a mean (block = max(2h, 20) rows)."""
    x = np.asarray(x); n = len(x); nb = int(np.ceil(n / block))
    starts = rng.integers(0, n - block + 1, size=(B, nb))
    idx = (starts[:, :, None] + np.arange(block)[None, None, :]).reshape(B, -1)[:, :n]
    m = x[idx].mean(axis=1)
    return float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def baselines(name, f, h, rng, carry=None):
    s = scoring(f)
    periods = {'all': s, 'FIT': s[s.index <= FIT_END], 'CHECK': s[(s.index > FIT_END) & (s.index <= CHECK_END)],
               'TESTYR': s[s.index > CHECK_END]}
    out = {'n': len(s), 'from': str(s.index[0].date()), 'to': str(s.index[-1].date()),
           'p_up_full': float(f.up.dropna().mean()), 'p_up_by_period': {}, 'p_up_by_block': {}}
    for k, v in periods.items():
        out['p_up_by_period'][k] = {'n': len(v), 'p_up': float(v.up.mean()) if len(v) else None,
                                    'b0_bias': float((v.up - v.p0).mean()) if len(v) else None}
    for a, b in [(2006, 2010), (2011, 2015), (2016, 2020), (2021, 2026)]:
        v = f[(f.index.year >= a) & (f.index.year <= b)].up.dropna()
        out['p_up_by_block'][f'{a}-{b}'] = float(v.mean())
    block = max(2 * h, 20)
    sc = {}
    models = {'B2_momentum': s.p2}
    if carry is not None:
        cs = carry.reindex(s.index)
        known = s.up.shift(h)
        p3 = pd.Series(np.nan, index=s.index)
        for sgn in (1, -1):
            m = (cs.shift(h) == sgn)
            cnt = (m & known.notna()).cumsum()
            p3[cs == sgn] = ((known.where(m).fillna(0)).cumsum() / cnt).where(cnt >= 100)[cs == sgn]
        models['B3_carry'] = p3
    for k, p in models.items():
        ok = p.notna()
        y, p_, q = s.up[ok].to_numpy(), p[ok].to_numpy(), s.p0[ok].to_numpy()
        d = (q - y) ** 2 - (p_ - y) ** 2          # >0 = model beats B0 on this date
        lo, hi = block_boot_mean(d, block, rng)
        sc[k] = {'n': int(ok.sum()), 'from': str(s.index[ok][0].date()) if ok.any() else None,
                 'bss_vs_b0': 1 - brier(p_, y) / brier(q, y), 'brier_diff_ci95': [lo, hi],
                 'log_diff': logs(p_, y) - logs(q, y)}
    out['scores'] = sc
    out['b0_brier'] = brier(s.p0.to_numpy(), s.up.to_numpy())
    return out


# ---------------------------------------------------------------- 2. statistics: MDE relative to B0
def spaced_sample(n, h, K, rng):
    o = rng.integers(0, h)
    grid = np.arange(o, n, h)
    if K > len(grid) // 2:
        return None
    return rng.choice(grid, size=K, replace=False)


def placebo_sparse(s, h, K, rng, R=R_PLACEBO):
    e_hit, e_z = (s.up - s.p0).to_numpy(), (s.zr - s.m0).to_numpy()
    n = len(s); eh, ez = [], []
    for _ in range(R):
        i = spaced_sample(n, h, K, rng)
        if i is None:
            return None
        eh.append(e_hit[i].mean()); ez.append(e_z[i].mean())
    eh, ez = np.array(eh), np.array(ez)
    p = float(s.p0.mean())
    return {'K': K, 'hit_mean': float(eh.mean()), 'hit_sd': float(eh.std()), 'z_mean': float(ez.mean()), 'z_sd': float(ez.std()),
            'analytic_hit_sd': float(np.sqrt(p * (1 - p) / K)), 'analytic_z_sd': float(np.sqrt(1 / K)),
            'null_hit_q': [float(np.percentile(eh, 2.5)), float(np.percentile(eh, 97.5))],
            'null_z_q': [float(np.percentile(ez, 2.5)), float(np.percentile(ez, 97.5))]}


def placebo_regime(s, h, cover, rng, R=R_PLACEBO // 4):
    e_hit, e_z = (s.up - s.p0).to_numpy(), (s.zr - s.m0).to_numpy()
    n = len(s); L = max(h, 20); nruns = max(1, int(round(cover * n / L)))
    eh, ez, days = [], [], []
    for _ in range(R):
        m = np.zeros(n, bool)
        for st in rng.integers(0, n - L, size=nruns):
            m[st:st + L] = True
        eh.append(e_hit[m].mean()); ez.append(e_z[m].mean()); days.append(m.sum())
    eh, ez = np.array(eh), np.array(ez)
    p = float(s.p0.mean())
    return {'cover': cover, 'run_len': L, 'runs': nruns, 'days': float(np.mean(days)), 'hit_mean': float(eh.mean()),
            'hit_sd': float(eh.std()), 'z_sd': float(ez.std()), 'n_eff_hit': float(p * (1 - p) / eh.var())}


def ar_signal(n, hl, rng):
    phi = 0.5 ** (1 / hl)
    e = rng.standard_normal(n)
    x = np.empty(n); x[0] = e[0]
    for i in range(1, n):
        x[i] = phi * x[i - 1] + np.sqrt(1 - phi ** 2) * e[i]
    return x


def placebo_ic(s, h, hl, rng, R=R_IC):
    y = (s.zr - s.m0).to_numpy(); y = (y - y.mean()) / y.std()
    ics = []
    for _ in range(R):
        x = ar_signal(len(y), hl, rng)
        ics.append(np.corrcoef(x, y)[0, 1])
    ics = np.array(ics)
    return {'half_life': hl, 'ic_sd': float(ics.std()), 'n_eff': float(1 / ics.var()), 'n_raw': len(y),
            'null_q': [float(np.percentile(ics, 2.5)), float(np.percentile(ics, 97.5))]}


def mde(sd, bias=0.0):
    return {k: float(abs(bias) + zmult(a) * sd) for k, a in ALPHAS.items()}


# ---------------------------------------------------------------- 3. economics: costs and break-even
FUT = {   # tick size, $ per point, assumed all-in commission per round trip (overnight-hold-futures SPEC; FX CME majors)
    'nq': (0.25, 20, 5.0, 'NQ'), 'es': (0.25, 50, 5.0, 'ES'), 'gold': (0.10, 100, 5.0, 'GC'),
    'eurusd': (0.00005, 125000, 5.0, '6E'), 'gbpusd': (0.0001, 62500, 5.0, '6B'), 'usdjpy': (None, None, 5.0, '6J'),
}


def costs(name, px_last, h):
    """Round trip in % of price for an h-day hold, by venue. Futures carry financing in the price."""
    out = {}
    tick, mult, comm, root = FUT[name]
    if name == 'usdjpy':     # 6J: JPY 12.5m, tick 0.0000005 USD per JPY = $6.25 a tick; notional in USD = 12.5m / USDJPY
        notional, tickv = 12_500_000 / px_last, 6.25
    else:
        notional, tickv = mult * px_last, tick * mult
    out['futures'] = {'contract': root, 'round_trip_pct': 100 * (2 * tickv + comm) / notional,
                      'basis': '1 tick a side + commission at the last pre-lockbox price'}
    sp = pd.read_parquet(DATA / 'features' / 'spread_profile.parquet')
    sp = sp[sp.hour.astype(int) == 22]
    ct = json.loads((DATA / 'analysis/output/cost-verification/cost_table.json').read_text())
    fin = {(r['instrument'], r['group']): r['per_night_pct'] for r in ct['financing']}
    nights = h * 7 / 5
    if name in ('nq', 'es'):
        spread = ct['spread']['nq']['oanda_model_round_trip_pct']
        src = 'cost_table oanda_model (nq)' + ('; ES UNMEASURED, charged the NQ figure' if name == 'es' else '')
        f_night = -fin[('nq', 'B')]
        fsrc = 'cost_table nq group B' + ('; ES assumed equal' if name == 'es' else '')
    elif name == 'gold':
        row = sp[sp.pair == 'gold'].iloc[0]
        spread = 100 * row['mean'] * 1.0 / px_last
        src = 'spread_profile 22 UTC (gold pip 1.0)'
        f_night = -fin[('gold', 'B')]
        fsrc = 'cost_table gold group B (group A ~5x cheaper)'
    else:
        row = sp[sp.pair == name].iloc[0]
        pip = 0.01 if name.endswith('jpy') else 0.0001
        spread = 100 * row['mean'] * pip / px_last
        src = 'spread_profile 22 UTC'
        f_night = 1.0 / 365          # UNMEASURED: 1%/yr markup assumption (the carry itself sits in B3/H1, not in cost)
        fsrc = 'UNMEASURED: 1%/yr financing markup assumed'
    out['cfd'] = {'round_trip_pct': spread + f_night * nights, 'spread_pct': spread, 'spread_source': src,
                  'financing_per_night_pct': f_night, 'financing_source': fsrc, 'nights': nights}
    return out


def breakeven(s, c):
    """Economic break-even for a long and a short call over h, in hit rate (relative to B0) and in sigma_h units."""
    r = s.r.to_numpy() * 100; G = r[r > 0].mean(); L = -r[r < 0].mean()
    p0 = float(s.up.mean()); mu = float(r.mean()); sig = float(np.median(s.sig) * 100)
    pl = (c + L) / (G + L)                   # P(up) a long needs for E[r] > c, at the historical win/loss sizes
    ps = (c + G) / (G + L)                   # P(down) a short needs
    return {'p0': p0, 'mean_pct': mu, 'sigma_h_pct': sig, 'gain_up_pct': G, 'loss_down_pct': L,
            'long_p_needed': pl, 'long_excess_hit_needed': pl - p0, 'long_excess_sd_needed': (c - mu) / sig,
            'short_p_up_max': 1 - ps, 'short_excess_hit_needed': (1 - ps) - p0, 'short_excess_sd_needed': -(c + mu) / sig,
            'always_on_ic_needed': c / (sig * np.sqrt(2 / np.pi))}


# ---------------------------------------------------------------- 4. pooling
def pooled_meff(frames, h):
    R = pd.DataFrame({k: f.r for k, f in frames.items()}).dropna()
    R = R.iloc[::h]                                             # non-overlapping
    C = R.corr().to_numpy(); m = C.shape[0]
    rho = (C.sum() - m) / (m * (m - 1))
    # A1 (post-hoc): m/(1+(m-1)*mean rho) is sign-dependent; USD pairs quoted both ways cancel and fake independence.
    # The sign-free effective number m^2 / sum(rho_ij^2) is used from A1 on; the original is kept for the record.
    return {'m': m, 'mean_corr': float(rho), 'm_eff_original_A0': float(m / (1 + (m - 1) * rho)),
            'm_eff': float(m * m / (C ** 2).sum()), 'mean_abs_corr': float((np.abs(C).sum() - m) / (m * (m - 1))),
            'n_periods': len(R), 'members': list(R.columns)}


def currency_panel(fx):
    """8 currencies vs the equal-weight basket: log returns of each currency in USD, demeaned across currencies."""
    lp = {}
    for p, s in fx.items():
        x = np.log(s)
        lp[p[:3].upper() if p.endswith('usd') else p[3:].upper()] = x if p.endswith('usd') else -x
    df = pd.DataFrame(lp).dropna(); df['USD'] = 0.0
    return df


def xs_ic_gate(cur, rng, R=1000):
    """FX cross-section: monthly (20-row, month-end) rank IC of a random persistent signal vs next-month currency
    returns relative to the basket. MDE of the mean IC = the Phase 1 gate."""
    m = cur.resample('ME').last()
    fwd = (m.shift(-1) - m)
    fwd = fwd.sub(fwd.mean(axis=1), axis=0).dropna()
    T, N = fwd.shape
    Y = fwd.rank(axis=1).to_numpy()
    out = {'months': T, 'currencies': N}
    for phi in (0.0, 0.9):
        ics = []
        for _ in range(R):
            x = np.empty((T, N)); x[0] = rng.standard_normal(N)
            for t in range(1, T):
                x[t] = phi * x[t - 1] + np.sqrt(1 - phi ** 2) * rng.standard_normal(N)
            Xr = np.argsort(np.argsort(x, axis=1), axis=1) + 1
            a = Xr - Xr.mean(1, keepdims=True); b = Y - Y.mean(1, keepdims=True)
            ic = (a * b).sum(1) / np.sqrt((a * a).sum(1) * (b * b).sum(1))
            ics.append(ic.mean())
        ics = np.array(ics)
        out[f'phi_{phi}'] = {'ic_sd': float(ics.std()), 'mde': mde(float(ics.std()))}
    return out


# ---------------------------------------------------------------- 5. positive control
def control_sparse(s, h, K, rng, R=R_CONTROL):
    """Plant: add delta*sigma_h to the forward return on K spaced dates (a copy of the data), delta = MDE (single).
    Test: two-sided, against the placebo null band of the same design. Power should be ~0.80."""
    pb = placebo_sparse(s, h, K, rng)
    delta = zmult(0.05) * pb['z_sd']
    lo, hi = pb['null_z_q']
    ez = (s.zr - s.m0).to_numpy(); n = len(s); hits = 0
    for _ in range(R):
        i = spaced_sample(n, h, K, rng)
        stat = ez[i].mean() + delta - pb['z_mean']        # planted copy, centred on the null mean as the test does
        hits += (stat > hi - pb['z_mean']) or (stat < lo - pb['z_mean'])
    # hit-rate version: tilt the selection toward up outcomes so the expected excess hit = MDE_hit
    dh = zmult(0.05) * pb['hit_sd']
    up, p0 = s.up.to_numpy(), s.p0.to_numpy()
    lam = dh / float(np.mean(p0 * (1 - p0)))
    eh = up - p0; hits_h = 0; got = []
    for _ in range(R):
        o = rng.integers(0, h); grid = np.arange(o, n, h)
        w = np.clip(1 + lam * (up[grid] - p0[grid]), 1e-9, None)
        i = rng.choice(grid, size=K, replace=False, p=w / w.sum())
        st = eh[i].mean(); got.append(st)
        hits_h += (st - pb['hit_mean'] > pb['null_hit_q'][1] - pb['hit_mean']) or (st - pb['hit_mean'] < pb['null_hit_q'][0] - pb['hit_mean'])
    return {'K': K, 'planted_sd': float(delta), 'power_sd': hits / R, 'planted_hit': float(dh),
            'recovered_hit_mean': float(np.mean(got) - pb['hit_mean']), 'power_hit': hits_h / R}


def control_hit_flip(s, h, K, rng, R=R_CONTROL):
    """A1 (post-hoc): the selection-tilt plant under-delivers (sampling without replacement dilutes the tilt, so the
    planted excess came out ~10-20% below MDE). Exact plant in a copy of the data: on K spaced dates, flip each
    down outcome to up with probability g = MDE / (share of downs), so the expected added hit is exactly MDE_hit."""
    pb = placebo_sparse(s, h, K, rng)
    dh = zmult(0.05) * pb['hit_sd']
    up, p0 = s.up.to_numpy(), s.p0.to_numpy(); n = len(s)
    hits, got = 0, []
    for _ in range(R):
        i = spaced_sample(n, h, K, rng)
        y = up[i].copy()
        g = min(1.0, dh / max(1e-9, 1 - y.mean()))          # flip each down outcome with prob g: E[added hit] = dh
        y[(y == 0) & (rng.random(K) < g)] = 1
        got.append(y.mean() - up[i].mean())
        st = (y - p0[i]).mean()
        hits += (st > pb['null_hit_q'][1]) or (st < pb['null_hit_q'][0])
    return {'K': K, 'planted_hit': float(dh), 'mean_added_hit': float(np.mean(got)), 'power_hit': hits / R}


def control_ic(s, h, hl, rng, R=R_CONTROL // 2):
    pb = placebo_ic(s, h, hl, rng)
    ic = zmult(0.05) * pb['ic_sd']
    y = (s.zr - s.m0).to_numpy(); y = (y - y.mean()) / y.std()
    # persistent signal correlated with the outcome at ic: x = a*y_smooth + noise, scaled so corr(x, y) = ic in expectation
    hits = 0; got = []
    for _ in range(R):
        noise = ar_signal(len(y), hl, rng)
        x = ic * y + np.sqrt(1 - ic ** 2) * noise
        c = np.corrcoef(x, y)[0, 1]; got.append(c)
        hits += (c > pb['null_q'][1]) or (c < pb['null_q'][0])
    return {'half_life': hl, 'planted_ic': float(ic), 'recovered_ic_mean': float(np.mean(got)), 'power': hits / R}


# ---------------------------------------------------------------- run
def label(be, md_single_sd, md_pooled_sd):
    """(a)/(b)/(c) for the sparse design, in sigma units, against the fixed plausible effect."""
    need = min(max(be['long_excess_sd_needed'], 0.0), abs(min(be['short_excess_sd_needed'], 0.0)))
    if need > PLAUSIBLE['sparse_sd']:
        return 'c'
    if md_single_sd <= PLAUSIBLE['sparse_sd']:
        return 'a'
    return 'b'


def main():
    rng = np.random.default_rng(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    px = {k: load(v) for k, v in MAIN.items()}
    fx = {p: load(p) for p in FX7}
    res = {'seed': SEED, 'data_end': str(END.date()), 'instruments': {}, 'pooled': {}, 'controls': {}, 'plausible': PLAUSIBLE,
           'alphas': ALPHAS, 'z_multipliers': {k: zmult(a) for k, a in ALPHAS.items()}}
    frames = {h: {} for h in H}
    for name, p in px.items():
        carry = carry_sign(name, p.index) if name in ('eurusd', 'gbpusd', 'usdjpy') else None
        res['instruments'][name] = {'from': str(p.index[0].date()), 'to': str(p.index[-1].date()), 'rows': len(p), 'h': {}}
        for h in H:
            f = frame(p, h); frames[h][name] = f; s = scoring(f)
            cell = {'baselines': baselines(name, f, h, rng, carry)}
            c = costs(name, float(p.iloc[-1]), h)
            cell['costs'] = c
            cell['breakeven'] = {v: breakeven(s, c[v]['round_trip_pct']) for v in ('futures', 'cfd')}
            sp = {}
            for K in (20, 50, 100, 200, 500):
                r = placebo_sparse(s, h, K, rng)
                if r:
                    # A1 (post-hoc): drawing K of the ~n/h non-overlapping periods without replacement shrinks the spread
                    # by the finite-population factor sqrt(1 - K/G); a new, unseen sample has no such shrink. Corrected.
                    r['fpc'] = float(np.sqrt(max(1e-9, 1 - K / (len(s) / h))))
                    r['mde_hit_raw_A0'] = mde(r['hit_sd'], r['hit_mean']); r['mde_sd_raw_A0'] = mde(r['z_sd'], r['z_mean'])
                    r['mde_hit'] = mde(r['hit_sd'] / r['fpc'], r['hit_mean']); r['mde_sd'] = mde(r['z_sd'] / r['fpc'], r['z_mean'])
                    r['mde_hit_analytic'] = mde(r['analytic_hit_sd'])
                    sp[K] = r
            cell['sparse'] = sp
            # per-event sd (empirical) to size the historical and forward designs
            k_ref = max(sp); fpc = sp[k_ref]['fpc']; sd1_hit = sp[k_ref]['hit_sd'] * np.sqrt(k_ref) / fpc; sd1_z = sp[k_ref]['z_sd'] * np.sqrt(k_ref) / fpc
            k_hist = int(SPARSE_COVER * len(s) / h)
            ev_per_year = SPARSE_COVER * 252 / h
            k_need = (zmult(0.05) * sd1_z / PLAUSIBLE['sparse_sd']) ** 2
            cell['sparse_hist'] = {'K_hist': k_hist, 'mde_sd_single': float(zmult(0.05) * sd1_z / np.sqrt(max(k_hist, 1))),
                                   'mde_hit_single': float(zmult(0.05) * sd1_hit / np.sqrt(max(k_hist, 1))),
                                   'K_needed_for_plausible': float(k_need), 'events_per_year': ev_per_year,
                                   'forward_years_needed': float(k_need / ev_per_year), 'per_event_sd_z': float(sd1_z),
                                   'per_event_sd_hit': float(sd1_hit)}
            cell['regime'] = [placebo_regime(s, h, cv, rng) for cv in (0.10, 0.25)]
            for rg in cell['regime']:
                rg['mde_hit'] = mde(rg['hit_sd'], rg['hit_mean']); rg['mde_sd'] = mde(rg['z_sd'])
            ic = [placebo_ic(s, h, hl, rng) for hl in sorted({1, h, 60})]
            for x in ic:
                x['mde_ic'] = mde(x['ic_sd'])
                yrs = len(s) / 252
                x['years_for_plausible_ic'] = float(yrs * (x['mde_ic']['single'] / PLAUSIBLE['ic'][h]) ** 2)
            cell['always_on'] = ic
            res['instruments'][name]['h'][h] = cell
            print(name, h, 'p0', round(cell['breakeven']['futures']['p0'], 3), 'MDE sparse sd', round(cell['sparse_hist']['mde_sd_single'], 3),
                  'IC', [round(x['mde_ic']['single'], 3) for x in ic], flush=True)
    for h in H:
        main6 = pooled_meff(frames[h], h)
        fxp = pooled_meff({p: frame(s, h) for p, s in fx.items()}, h)
        res['pooled'][h] = {'main6': main6, 'fx7': fxp}
    cur = currency_panel(fx)
    cc = cur.diff().dropna(); cc = cc.sub(cc.mean(axis=1), axis=0).drop(columns='USD')
    C = cc.resample('ME').sum().corr().to_numpy(); m = C.shape[0]; rho = (C.sum() - m) / (m * (m - 1))
    res['pooled']['fx_xs'] = {'mean_corr_monthly_demeaned': float(rho), 'm_eff_original_A0': float(m / (1 + (m - 1) * rho)),
                              'm_eff': float(m * m / (C ** 2).sum()),
                              'gate': xs_ic_gate(cur, rng)}
    # labels (sparse design), pooled MDE from m_eff of the main set at that horizon
    for name, I in res['instruments'].items():
        for h, cell in I['h'].items():
            meff = res['pooled'][h]['fx7' if name in ('eurusd', 'gbpusd', 'usdjpy') else 'main6']['m_eff']
            single = cell['sparse_hist']['mde_sd_single']
            cell['sparse_hist']['mde_sd_pooled'] = float(single / np.sqrt(meff))
            cell['label'] = {v: label(cell['breakeven'][v], single, single / np.sqrt(meff)) for v in ('futures', 'cfd')}
    # positive controls
    ctl = []
    for name, h, K in [('nq', 20, 50), ('gold', 5, 200), ('eurusd', 1, 500), ('usdjpy', 60, 20)]:
        s = scoring(frames[h][name])
        ctl.append({'instrument': name, 'h': h, **control_sparse(s, h, K, rng)})
        ctl[-1]['A1_exact_hit_plant'] = control_hit_flip(s, h, K, rng)
        print('control', ctl[-1], flush=True)
    for name, h, hl in [('nq', 20, 20), ('eurusd', 5, 60)]:
        s = scoring(frames[h][name])
        ctl.append({'instrument': name, 'h': h, 'design': 'always_on', **control_ic(s, h, hl, rng)})
        print('control', ctl[-1], flush=True)
    res['controls'] = ctl
    (OUT / 'results.json').write_text(json.dumps(res, indent=1, default=float))
    # frozen B0/B2 parameters for the forward ledger (state at the last pre-lockbox date)
    frozen = {'version': 'b0b2-frozen-20260821', 'source': 'scripts/direction-bar/bar.py', 'instruments': {}}
    for name in MAIN:
        frozen['instruments'][name] = {}
        for h in H:
            f = frames[h][name]; last = f.dropna(subset=['p0']).iloc[-1]
            frozen['instruments'][name][h] = {'p0': float(last.p0), 'mu0': float(last.mu0),
                                              'p2_pos': float(last['p2_1']), 'p2_neg': float(last['p2_-1'])}
    (OUT / 'ledger_baselines.json').write_text(json.dumps(frozen, indent=1))
    print('wrote', OUT / 'results.json')


if __name__ == '__main__':
    main()
