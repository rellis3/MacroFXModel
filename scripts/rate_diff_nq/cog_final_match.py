"""Final match of the identified formula (SOFR Sep26 - Euribor Mar27, bp x0.1 + 1.445, zero fitted) against the multi-frame CONSENSUS line.
Variants: price type (midpoint / trades), data tf, source, EMA, Pine HTF semantics (A: last CLOSED htf bar = lookahead_off historical; B: DEVELOPING htf bar),
bar-time convention (shift in 15m chart bars: +1 = our bar-close label vs his bar-open label, etc.)."""
import itertools, os, numpy as np, pandas as pd
from scipy.signal import lfilter
OUT = 'analysis/output/cog_video_0918/'
his = pd.read_csv(OUT + 'cog_line_consensus_15m.csv', index_col=0, parse_dates=True)['value']; his.index = his.index.tz_convert('UTC')
sd = pd.read_csv(OUT + 'cog_line_consensus_sd.csv', index_col=0, parse_dates=True); his = his[sd.reindex(his.index).n.fillna(0) >= 2]      # only bars seen in >= 2 frames
IDX = his.index; CH = pd.date_range('2026-09-14', '2026-09-24', freq='15min', tz='UTC')
def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
P = {('mid', 'IH7'): 'analysis/output/stir_1m/ICEEU_IH7.parquet', ('mid', 'SR3U6'): 'analysis/output/stir_1m/CME_SR3U6.parquet',
     ('trd', 'IH7'): 'analysis/output/stir_1m_sweep/trd/ICEEU_IH7.parquet', ('trd', 'SR3U6'): 'analysis/output/stir_1m_trades/CME_SR3U6.parquet'}
D = {k: ld(p) for k, p in P.items() if os.path.exists(p)}
def leg(df, tf, src, sem):
    """sem A: value of the last CLOSED tf bar at each 15m chart-bar close; B: DEVELOPING tf bar (running stats since the tf bar opened)."""
    if sem == 'A':
        g = df.resample(tf, label='right', closed='right'); o = pd.DataFrame({'open': g.open.first(), 'high': g.high.max(), 'low': g.low.min(), 'close': g.close.last()}).dropna()
        o['hl2'] = (o.high + o.low) / 2; o['ohlc4'] = o[['open', 'high', 'low', 'close']].mean(1); s = o[src]; return (100 - s.reindex(s.index.union(CH)).ffill().reindex(CH))
    g = df.resample('15min', label='right', closed='right'); b = pd.DataFrame({'open': g.open.first(), 'high': g.high.max(), 'low': g.low.min(), 'close': g.close.last()}).dropna()
    grp = b.index.floor(tf) if tf != '15min' else b.index
    key = pd.Series(pd.DatetimeIndex(b.index - pd.Timedelta('1min')).floor(tf), index=b.index)
    hi = b.high.groupby(key).cummax(); lo = b.low.groupby(key).cummin(); op = b.open.groupby(key).transform('first'); cl = b.close
    v = {'close': cl, 'open': op, 'high': hi, 'low': lo, 'hl2': (hi + lo) / 2, 'ohlc4': (op + hi + lo + cl) / 4}[src]; return (100 - v.reindex(CH).ffill())
rows = []
for typ, tf, src, sem, ema in itertools.product(('mid', 'trd'), ('15min', '30min', '1h'), ('close', 'hl2', 'ohlc4'), ('A', 'B'), (1, 2, 3, 5, 8)):
    if (typ, 'IH7') not in D or (typ, 'SR3U6') not in D: continue
    if tf == '15min' and sem == 'B': continue
    s = ((leg(D[(typ, 'SR3U6')], tf, src, sem) - leg(D[(typ, 'IH7')], tf, src, sem)) * 100).to_numpy()
    a = 2 / (ema + 1); f = s if ema == 1 else lfilter([a], [1, -(1 - a)], np.nan_to_num(s, nan=np.nanmean(s)), zi=[(1 - a) * np.nan_to_num(s, nan=np.nanmean(s))[0]])[0]
    y = pd.Series(f * 0.1 + 1.445, index=CH)
    for k in range(-4, 5):
        x = y.shift(k).reindex(IDX); j = pd.concat([his.rename('h'), x.rename('x')], axis=1).dropna()
        r = j.h - j.x; rows.append((typ, tf, src, sem, ema, k, np.sqrt((r ** 2).mean()), r.mean(), j.h.corr(j.x), np.corrcoef(j.h.diff().dropna(), j.x.diff().dropna())[0, 1], len(j)))
R = pd.DataFrame(rows, columns=['type', 'tf', 'src', 'sem', 'ema', 'shift', 'rmse', 'bias', 'level', 'chg15', 'n'])
R.to_csv(OUT + 'cog_final_match.csv', index=False); pd.set_option('display.width', 200)
print(f'consensus bars (>=2 frames): {len(his)}; noise floor (frame-pair bar-by-bar) 0.84; {len(R)} variants')
print('\ntop 12 by 15-min bar-by-bar corr (zero-fit formula):'); print(R.sort_values('chg15', ascending=False).head(12).round(3).to_string(index=False))
print('\nbest by type:'); print(R.loc[R.groupby('type').chg15.idxmax()].round(3).to_string(index=False))
print('\nbest by Pine htf semantics (A closed bar / B developing):'); print(R.loc[R.groupby('sem').chg15.idxmax()].round(3).to_string(index=False))
print('\nbest by bar-time shift:'); print(R.loc[R.groupby('shift').chg15.idxmax()][['shift', 'type', 'tf', 'src', 'sem', 'ema', 'chg15', 'rmse', 'level']].round(3).to_string(index=False))
