"""Build the C.OG rate-spread line series that the Rates page, /api/cog-line and the pasted-data TradingView indicator all read.

The line (identified in analysis/output/cog_video_0918/RECONSTRUCTION.md): (SOFR rate - Euribor rate), in basis points; the indicator then maps it as
bp * 0.1 + 1.445 (C.OG's scale and default offset).  Legs: CME SOFR Sep26 (SR3U6) and ICE Euribor I2! (the 2nd quarterly: Mar27 / IH7 until the Dec26 contract
expires on 14 Dec, then Jun27 / IM7).  Values are 15-minute closes of 1-minute MIDPOINT bars, stored at the bar's OPEN time (how TradingView draws a bar).

Output: analysis/output/cog_line/cog_line_15m.json   {t0, step, bp: [...|null], legs, asOf, ...}.  Inputs: analysis/output/stir_1m/<EXCH>_<LOCAL>.parquet
(refresh them with scripts/rates_line/refresh_cog_line.py while TWS is open).   python scripts/rates_line/build_cog_line.py [--from 2026-09-15]"""
import argparse, json
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parents[2]; SRC = ROOT / 'analysis' / 'output' / 'stir_1m'; OUT = ROOT / 'analysis' / 'output' / 'cog_line' / 'cog_line_15m.json'
# leg segments: the pair in force from `from` (UTC date, inclusive) until the next segment starts
LEGS = [dict(frm='2026-09-15', usd='CME_SR3U6', eur='ICEEU_IH7', label='SOFR Sep26 (CME SR3U6) minus Euribor Mar27 (ICE IH7 = I2!)'),
        dict(frm='2026-12-15', usd='CME_SR3Z6', eur='ICEEU_IM7', label='SOFR Dec26 (CME SR3Z6) minus Euribor Jun27 (ICE IM7 = I2!)')]
def close15(name):
    p = SRC / f'{name}.parquet'
    if not p.exists(): return None
    d = pd.read_parquet(p, columns=['time', 'close']); d['time'] = pd.to_datetime(d['time'], utc=True)
    g = d.set_index('time').sort_index()['close'].resample('15min', label='right', closed='right'); l, n = g.last(), g.count(); l[n < 5] = np.nan; return 100 - l      # rate, %
def build(frm):
    pieces = []
    for i, seg in enumerate(LEGS):
        a, b = close15(seg['usd']), close15(seg['eur'])
        if a is None or b is None: continue
        lo = pd.Timestamp(max(seg['frm'], frm), tz='UTC'); hi = pd.Timestamp(LEGS[i + 1]['frm'], tz='UTC') if i + 1 < len(LEGS) else pd.Timestamp('2100-01-01', tz='UTC')
        s = ((a - b) * 100)                                                         # SOFR - Euribor, bp, indexed by bar CLOSE
        s = s[(s.index > lo) & (s.index <= hi)]; pieces.append(s.dropna())
    if not pieces: raise SystemExit('no leg data found')
    s = pd.concat(pieces).sort_index(); s = s[~s.index.duplicated()]
    s.index = s.index - pd.Timedelta('15min')                                       # bar-OPEN label: the value of the bar that starts at t (its close, known at t+15m)
    grid = pd.date_range(s.index[0], s.index[-1], freq='15min', tz='UTC'); s = s.reindex(grid)
    return s
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--from', dest='frm', default='2026-09-15'); a = ap.parse_args()
    s = build(a.frm); last_real = s.last_valid_index()
    out = dict(version=1, formula='plot = (SOFR rate - Euribor rate) in bp * 0.1 + 1.445 (C.OG scale and default offset); EMA 2 in the indicator; values stored at bar-open time',
               legs=[dict(frm=x['frm'], label=x['label']) for x in LEGS], step=900, t0=int(s.index[0].timestamp()), unit='bp', source='IBKR 1-min MIDPOINT, 15-min close',
               asOf=last_real.isoformat(), nBars=int(len(s)), nValid=int(s.notna().sum()), bp=[None if not np.isfinite(v) else round(float(v), 1) for v in s.to_numpy()])
    OUT.parent.mkdir(parents=True, exist_ok=True); OUT.write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')
    print(f'wrote {OUT.relative_to(ROOT)}: {out["nBars"]} bars ({out["nValid"]} valid), {s.index[0]} -> {last_real}, {OUT.stat().st_size/1024:.0f} KB; last value {s.dropna().iloc[-1]:.1f} bp = {s.dropna().iloc[-1]*0.1+1.445:.2f} units')
