"""COG-DYNAMIC-LEAD stage B (forge/COG_DYNAMIC_LEAD_PREREG.md): intraday SOFR / Euribor / ESTR futures spreads against 34 assets, 15-minute bars, window 2024-04-15 to 2026-08-20.
    python scripts/dynlead/intraday.py --build            # build the 15-minute panels
    python scripts/dynlead/intraday.py --run [--draws 40] [--workers 8]
Same registered logic as the daily engine: rolling state from completed pairs only, 2-standard-error gate, staggered hold, class costs, Discovery / Validation / out-of-sample, selection-aware placebo."""
import argparse
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E

ROOT = E.ROOT
PAN = E.PAN
DEEP = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
M1 = ROOT / 'VolRangeForecaster' / 'data' / 'm1'
BARS_DAY = 96
K_B, H_B, W_B = (4, 16, 96), (4, 16, 96, 192), (20, 60)              # bars; bars; trading days
PER_B = {'DISC': ('2024-05-01', '2025-03-31 23:59'), 'VAL': ('2025-04-01', '2025-12-31 23:59'), 'OOS': ('2026-01-01', '2026-08-20 23:59')}
LINES = {'P0': ('CME_SR3U6', 'ICEEU_IH7'), 'P1': ('CME_SR3H7', 'ICEEU_IH7'), 'P2': ('CME_SR3Z6', 'ICEEU_IZ6'), 'P3': ('CME_SR3Z6', 'ICEEU_ER3Z6'), 'P4': ('CME_SR3H7', 'ICEEU_ER3H7'), 'L-US': ('CME_SR3Z6', None)}


def r15(p):
    d = pd.read_parquet(p)
    d['time'] = pd.to_datetime(d['time'], utc=True)
    g = d.set_index('time').sort_index()['close'].resample('15min', label='right', closed='right')
    last, n = g.last(), g.count()
    last[n < 5] = np.nan
    return 100 - last


def build():
    G = pd.date_range('2024-04-15', '2026-08-20 23:45', freq='15min', tz='UTC')
    leg = {}
    for ln, (a, b) in LINES.items():
        for f in (a, b):
            if f and f not in leg:
                leg[f] = r15(DEEP / f'{f}.parquet').reindex(G)
    lines = {}
    for ln, (a, b) in LINES.items():
        lines[ln] = ((leg[a] - leg[b]) * 100) if b else (leg[a] * 100)
    L = pd.DataFrame(lines)
    day = pd.Series(G.date, index=G)
    # screen: at least 3 distinct prices per leg per day, as in the earlier studies
    ok = {}
    for f, s in leg.items():
        d = s.groupby(day.values).agg(lambda v: v.dropna().nunique())
        ok[f] = pd.Series(day.map(lambda x: d.get(x, 0) >= 3).values, index=G)
    for ln, (a, b) in LINES.items():
        m = ok[a] & (ok[b] if b else True)
        L[ln] = L[ln].where(m)
    names = {'EURUSD': 'eurusd', 'GBPUSD': 'gbpusd', 'USDJPY': 'usdjpy', 'USDCHF': 'usdchf', 'USDCAD': 'usdcad', 'AUDUSD': 'audusd', 'NZDUSD': 'nzdusd', 'EURGBP': 'eurgbp', 'EURJPY': 'eurjpy', 'EURCHF': 'eurchf', 'EURAUD': 'euraud',
             'EURCAD': 'eurcad', 'EURNZD': 'eurnzd', 'GBPJPY': 'gbpjpy', 'GBPCHF': 'gbpchf', 'GBPAUD': 'gbpaud', 'GBPCAD': 'gbpcad', 'GBPNZD': 'gbpnzd', 'AUDJPY': 'audjpy', 'AUDCAD': 'audcad', 'AUDCHF': 'audchf',
             'AUDNZD': 'audnzd', 'CADJPY': 'cadjpy', 'CADCHF': 'cadchf', 'CHFJPY': 'chfjpy', 'NZDJPY': 'nzdjpy', 'NZDCAD': 'nzdcad', 'GOLD': 'xauusd', 'SPX500': 'spx500', 'US30': 'us30', 'US2000': 'us2000', 'NAS100': 'nq',
             'DE30': 'de30', 'UK100': 'uk100'}
    A = {}
    for nm, f in names.items():
        c = pd.read_parquet(M1 / f'{f}_m1.parquet')['close']
        c.index = pd.to_datetime(c.index, utc=True)
        c = c[c.index <= pd.Timestamp('2026-08-20 23:59', tz='UTC')]
        A[nm] = np.log(c.resample('15min', label='right', closed='right').last()).reindex(G)
    A = pd.DataFrame(A)
    L.to_parquet(PAN / 'intraday_lines.parquet')
    A.to_parquet(PAN / 'intraday_assets.parquet')
    print('lines', L.notna().sum().to_dict(), 'assets', A.shape)


def make_x_b(s, k):
    d1 = s.diff()
    sig = d1.rolling(20 * BARS_DAY, min_periods=10 * BARS_DAY).std().shift(1)
    return (s - s.shift(k)) / (sig * np.sqrt(k))


def family_B(A, L):
    idx = A.index
    r_next = A.shift(-1) - A
    cost = np.array([E.COST_BP.get(c, 2.0) for c in A.columns]) / 2e4
    ys = {h: A.shift(-h) - A for h in H_B}
    masks = {p: np.asarray((idx >= pd.Timestamp(a, tz='UTC')) & (idx <= pd.Timestamp(b, tz='UTC'))) for p, (a, b) in PER_B.items()}
    rows = []
    for ln in L.columns:
        s = L[ln]
        for k in K_B:
            x = make_x_b(s, k)
            xc = x.clip(-2, 2) / 2
            for h in H_B:
                yh = ys[h]
                for Wd in W_B:
                    Wb = Wd * BARS_DAY
                    roll = yh.rolling(Wb, min_periods=int(0.8 * Wb)).corr(x).shift(h)
                    valid = roll.notna()
                    n_eff = min(Wb / h, Wd)
                    active = roll.abs() >= 2.0 / np.sqrt(n_eff)
                    pos = (np.sign(roll) * xc.values[:, None] * active).fillna(0.0)
                    eff = pos.rolling(h, min_periods=1).mean()
                    turn = eff.diff().abs().fillna(0.0)
                    pnl = (eff * r_next - turn * cost).where(valid & r_next.notna() & x.notna().values[:, None])
                    out = {}
                    for p, m in masks.items():
                        sh, pv, n, mean = E.nw_stats(pnl, m, h + 4)
                        out[p] = (sh * np.sqrt(BARS_DAY), pv, n, mean)                  # sh from nw_stats is annualised with sqrt(252); the bars are 15 minutes, so scale by sqrt(96)
                    for ai, a in enumerate(A.columns):
                        rows.append((ln, a, k, h, Wd, out['DISC'][0][ai], out['DISC'][1][ai], out['DISC'][2][ai], out['VAL'][0][ai], out['VAL'][1][ai], out['VAL'][2][ai], out['OOS'][0][ai], out['OOS'][1][ai], out['OOS'][2][ai]))
    cols = ['spread', 'asset', 'k', 'h', 'W', 'sh_DISC', 'p_DISC', 'n_DISC', 'sh_VAL', 'p_VAL', 'n_VAL', 'sh_OOS', 'p_OOS', 'n_OOS']
    return pd.DataFrame(rows, columns=cols)


def shifted_lines(L, rng):
    out = {}
    n = len(L)
    for c in L.columns:
        s = L[c]
        d1 = s.diff().fillna(0.0).values
        sh = int(rng.integers(5 * BARS_DAY, 60 * BARS_DAY))
        out[c] = pd.Series(np.cumsum(np.roll(d1, sh)), index=L.index).where(s.notna())
    return pd.DataFrame(out)


def one_draw(seed):
    A = pd.read_parquet(PAN / 'intraday_assets.parquet')
    L = pd.read_parquet(PAN / 'intraday_lines.parquet')
    rng = np.random.default_rng(2000 + seed)
    df = family_B(A, shifted_lines(L, rng))
    d, c = E.pipeline(df, min_n=3000)
    return dict(draw=seed, **c)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--build', action='store_true')
    ap.add_argument('--run', action='store_true')
    ap.add_argument('--draws', type=int, default=40)
    ap.add_argument('--workers', type=int, default=8)
    a = ap.parse_args()
    if a.build:
        build()
    if a.run:
        A = pd.read_parquet(PAN / 'intraday_assets.parquet')
        L = pd.read_parquet(PAN / 'intraday_lines.parquet')
        df = family_B(A, L)
        d, c = E.pipeline(df, min_n=3000)
        d.to_parquet(PAN / 'familyB_cells.parquet')
        print('REAL stage B:', c, 'cells', len(d), flush=True)
        with ProcessPoolExecutor(max_workers=a.workers) as ex:
            res = list(ex.map(one_draw, range(a.draws)))
        pl = pd.DataFrame(res)
        pl.to_csv(PAN / 'familyB_placebo.csv', index=False)
        print('PLACEBO', pl.describe().round(2).to_string(), flush=True)
        print('STAGE_B_DONE', flush=True)
