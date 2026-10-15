"""Daily history of C.OG's line against Nasdaq for the Rates page: the line (SOFR Sep26 minus Euribor Mar27, bp), Nasdaq, and the rolling 20-day same-hour link.
Inputs: analysis/output/stir_1m_deep/ (1-minute IBKR history of both legs), VolRangeForecaster/data/m1/nq_m1.parquet (OANDA NAS100, ends 2026-08-20, research cache only),
analysis/output/rate_curve_structure/bars15.parquet (CME NQ futures, April-October 2026) spliced on after 2026-08-20 at the level of the CFD.
Output: analysis/output/cog_line/cog_line_history.json   {asOf, constants {corr1h, betaPctPerBp, r2, days}, days: [{d, bp, nq, c, b}]}
        analysis/output/cog_line/cog_line_pinned_recent.json  the last 120 days at 15 minutes (bar-OPEN labelled, same layout as cog_line_15m.json) for the live trend read
    python scripts/rates_line/build_cog_history.py"""
import json
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'analysis' / 'output' / 'cog_line' / 'cog_line_history.json'
def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
def r15(p):
    g = ld(p)['close'].resample('15min', label='right', closed='right'); l, n = g.last(), g.count(); l[n < 5] = np.nan; return 100 - l
D = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
sofr, eur = r15(D / 'CME_SR3U6.parquet'), r15(D / 'ICEEU_IH7.parquet')
G = pd.date_range(max(sofr.first_valid_index(), eur.first_valid_index()).floor('D') + pd.Timedelta('15min'), min(sofr.last_valid_index(), eur.last_valid_index()).ceil('D'), freq='15min', tz='UTC')
line = ((sofr.reindex(G) - eur.reindex(G)) * 100)
day = pd.Series(G.date, index=G)
dist = lambda s: s.groupby(day.values).agg(lambda x: x.dropna().nunique())
ds, de = dist(sofr.reindex(G)), dist(eur.reindex(G))
good = np.array([ds.get(d, 0) >= 3 and de.get(d, 0) >= 3 for d in day.values]); line = line.where(good)        # same screen as forge/COG_PINNED_HISTORY_CONFIRM_PREREG.md (Amendment 1)
cfd = pd.read_parquet(ROOT / 'VolRangeForecaster' / 'data' / 'm1' / 'nq_m1.parquet')['close']; cfd.index = pd.to_datetime(cfd.index, utc=True)
cl = np.log(cfd.resample('15min', label='right', closed='right').last()).reindex(G)
fut = pd.read_parquet(ROOT / 'analysis' / 'output' / 'rate_curve_structure' / 'bars15.parquet')['NQ']; fut.index = pd.to_datetime(fut.index, utc=True); fut = fut.reindex(G)
splice = cl.last_valid_index(); off = cl.loc[splice] - fut.loc[:splice].dropna().iloc[-1]
nq = cl.copy(); after = G > splice; nq[after] = fut[after] + off                                            # CFD level, continued by the futures' moves
# same-hour link: 1-hour line change (bp) vs Nasdaq 1-hour log return (%)
dl = line - line.shift(4); dn = (nq - nq.shift(4)) * 100
both = dl.notna() & dn.notna(); x, y = dl[both], dn[both]
def fit(xv, yv):
    if len(xv) < 200 or xv.std() == 0: return None, None
    c = float(np.corrcoef(xv, yv)[0, 1]); return c, float(c * yv.std() / xv.std())
# use non-overlapping hourly samples for the headline constants, so bars are not counted four times
hh = both & (G.minute == 0); c1, b1 = fit(dl[hh], dn[hh])
rows = []; dates = sorted(set(day))
for i, d in enumerate(dates):
    sl = slice(max(0, i - 19), i + 1); wd = set(dates[sl]); m = both & hh & np.isin(day.values, list(wd)); c, b = fit(dl[m], dn[m])
    dm = (day.values == d); lv = line[dm].dropna(); nv = nq[dm].dropna()
    if len(lv) == 0 or len(nv) == 0: continue
    rows.append(dict(d=str(d), bp=round(float(lv.iloc[-1]), 1), nq=round(float(np.exp(nv.iloc[-1])), 1), c=None if c is None else round(c, 3), b=None if b is None else round(b, 4)))
out = dict(version=1, asOf=str(G[both][-1]) if both.any() else None, splice=str(splice), constants=dict(corr1h=round(c1, 3), betaPctPerBp=round(b1, 4), r2=round(c1 * c1, 4), hours=int(hh.sum())),
           note='line = (SOFR Sep26 - Euribor Mar27) in bp; nq = OANDA NAS100 level (CME NQ moves continue it after the CFD cache ends); c = rolling 20-day same-hour correlation; b = Nasdaq % per 1 bp (same hour)', days=rows)
OUT.parent.mkdir(parents=True, exist_ok=True); OUT.write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')
cs = [r['c'] for r in rows if r['c'] is not None]
print(f'wrote {OUT.relative_to(ROOT)}: {len(rows)} days {rows[0]["d"]} -> {rows[-1]["d"]}, {OUT.stat().st_size/1024:.0f} KB | same-hour link over everything: corr {c1:+.3f}, {b1:+.4f}% per bp, R2 {c1*c1:.3f} ({int(hh.sum())} hours)')
print(f'rolling 20-day correlation: min {min(cs):+.2f}, median {np.median(cs):+.2f}, max {max(cs):+.2f}; share of days below 0: {np.mean(np.array(cs) < 0):.0%}; below 0.05: {np.mean(np.array(cs) < 0.05):.0%}')

# recent 15-minute window of the pinned pair for the live trend read (bar-open labelled, so it lines up with OANDA M15 bars by their open time)
rec = line[G >= G[-1] - pd.Timedelta(days=120)]; rec.index = rec.index - pd.Timedelta('15min'); rec = rec.reindex(pd.date_range(rec.index[0], rec.index[-1], freq='15min', tz='UTC'))
v = rec.dropna(); rec = rec.loc[v.index[0]:v.index[-1]]
RECENT = OUT.parent / 'cog_line_pinned_recent.json'
RECENT.write_text(json.dumps(dict(version=1, step=900, t0=int(rec.index[0].timestamp()), unit='bp', legs='SOFR Sep26 (SR3U6) minus Euribor Mar27 (IH7), pinned', asOf=v.index[-1].isoformat(),
                  bp=[None if not np.isfinite(x) else round(float(x), 1) for x in rec.to_numpy()]), separators=(',', ':')), encoding='utf-8')
print(f'wrote {RECENT.relative_to(ROOT)}: {len(rec)} bars to {v.index[-1]}, {RECENT.stat().st_size/1024:.0f} KB')
