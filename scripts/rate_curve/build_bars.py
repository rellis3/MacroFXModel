"""One-off cache for forge/RATE_CURVE_STRUCTURE_PREREG.md: 15-min bars (label right, last 1-min midpoint, >=10 minutes
present) for the five SOFR / five ESTR / four Euribor contracts (as rates, %), ZT and FGBS yield-change levels, and the
stitched NQ front (log level + 15m count). Writes analysis/output/rate_curve_structure/bars15.parquet."""
import numpy as np, pandas as pd
from pathlib import Path
D = Path('analysis/output/stir_1m'); OUT = Path('analysis/output/rate_curve_structure'); OUT.mkdir(parents=True, exist_ok=True)
GRID = pd.date_range('2026-04-13', '2026-10-10', freq='15min', tz='UTC', inclusive='right')
def m1(name):
    d = pd.read_parquet(D / f'{name}.parquet'); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time')['close'].sort_index()
def bars(s):
    g = s.resample('15min', label='right', closed='right'); last, cnt = g.last(), g.count(); last[cnt < 10] = np.nan; return last.reindex(GRID)
cols = {}
for q in ('U6', 'Z6', 'H7', 'M7', 'U7'):
    cols[f'S_{q}'] = 100 - bars(m1(f'CME_SR3{q}')); cols[f'E_{q}'] = 100 - bars(m1(f'ICEEU_ER3{q}'))
for q in ('Z6', 'H7', 'M7', 'U7'):
    cols[f'I_{q}'] = 100 - bars(m1(f'ICEEU_I{q}'))
def stitched(parts):
    out = pd.Series(np.nan, index=GRID); lo = None
    for f, until in parts:
        r = np.log(bars(m1(f))).diff(); sel = (GRID <= pd.Timestamp(until, tz='UTC')) & ((GRID > pd.Timestamp(lo, tz='UTC')) if lo else True)
        out[sel] = r[sel]; lo = until
    return out
lvl = lambda r: r.fillna(0).cumsum().where(r.notna())
cols['US2Y'] = lvl(-stitched([('CBOT_ZTU6', '2026-09-23'), ('CBOT_ZTZ6', '2026-10-10')]) / 1.9 * 100)
cols['DE2Y'] = lvl(-stitched([('EUREX_FGBS_20260908_M', '2026-09-01'), ('EUREX_FGBS_20261208_M', '2026-10-10')]) / 1.9 * 100)
nqr = stitched([('CME_NQM6', '2026-06-12'), ('CME_NQU6', '2026-09-11'), ('CME_NQZ6', '2026-10-10')]); cols['NQ'] = lvl(nqr)
# NQ 15-min high/low from 1-min for the breakout target (within the same front contract)
hl = []
for f, lo_, hi_ in (('CME_NQM6', '2026-04-13', '2026-06-12'), ('CME_NQU6', '2026-06-12', '2026-09-11'), ('CME_NQZ6', '2026-09-11', '2026-10-10')):
    s = m1(f); s = s[(s.index > pd.Timestamp(lo_, tz='UTC')) & (s.index <= pd.Timestamp(hi_, tz='UTC'))]
    g = np.log(s).resample('15min', label='right', closed='right'); hl.append(pd.DataFrame({'NQ_hi': g.max(), 'NQ_lo': g.min(), 'NQ_n': g.count()}))
hl = pd.concat(hl).reindex(GRID)
# express hi/lo relative to the stitched log level (so rolls do not jump): offset = NQ(level) - log(close) per contract
df = pd.DataFrame(cols); df['NQ_hi'] = hl['NQ_hi']; df['NQ_lo'] = hl['NQ_lo']; df['NQ_n'] = hl['NQ_n']
closelog = pd.concat([np.log(m1(f)).resample('15min', label='right', closed='right').last() for f in ('CME_NQM6', 'CME_NQU6', 'CME_NQZ6')], axis=1)
# per bar, pick the contract whose window applies
pick = pd.Series(np.where(GRID <= pd.Timestamp('2026-06-12', tz='UTC'), 0, np.where(GRID <= pd.Timestamp('2026-09-11', tz='UTC'), 1, 2)), index=GRID)
cl = pd.Series([closelog.reindex(GRID).iloc[i, k] for i, k in enumerate(pick)], index=GRID)
off = df['NQ'] - cl
df['NQ_hi'] = df['NQ_hi'] + off; df['NQ_lo'] = df['NQ_lo'] + off
df.to_parquet(OUT / 'bars15.parquet')
print(df.notna().mean().round(2).to_string()); print(len(df), 'bars', df.index[0], df.index[-1])
