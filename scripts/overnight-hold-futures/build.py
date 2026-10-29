"""
overnight-hold-futures: the banked overnight-hold trades re-priced on CME futures (NQ for NAS100, GC for gold).
Exploratory re-costing, not a new search: same entry/exit minutes as the banked CFD trades, nothing re-fitted.
Register row: plans/RESEARCH_REGISTER.md -> overnight-hold-futures.

Data (all gitignored, analysis/output/nt8/):
  NQ, to 2026-04-21: the owner's 1-minute file (Google Drive nq-1m_bk.csv -> drive/NQ_1m_drive.parquet). US Central
      time, bars stamped at their open (matches OANDA at +6h winter / +5h summer, 1-min return corr 0.99), ratio
      back-adjusted (constant ratio to NT8's real prices within each contract, sd ~1e-5), no gaps since 2016.
      % returns are exact; a trade that spans the file's roll is priced as if rolled at no cost.
  NQ after that, and all of gold: NinjaTrader per-contract files. NT8 stamps a bar at its close (OANDA bar T = NT8 T+60,
      corr 0.98). The NT8 backfill has holes (failed chunks: GC every October contract, windows too short around
      rolls), so ~25% of gold trades have no futures price and are left out, never filled from OANDA.

Per trade:
  contract  the front contract at the entry minute; entry and exit are both priced in that one contract (no roll inside a trade)
  gross     exit close / entry close - 1 (futures prices carry the financing, so there is no swap)
  mae, mfe  lowest low / highest high of that contract from the bar after entry to the exit bar, floored as the page does
  costs     the page adds 1 tick a side (half the spread plus slippage, conservative for NQ/GC) and commission per round
            trip in dollars, converted to % of that trade's notional at its own entry price
Buy & hold: ratio-adjusted continuous series, first entry -> last exit; each roll pays a round trip of ticks + commission.

Usage: python -I scripts/overnight-hold-futures/build.py
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
NT8 = ROOT / 'analysis/output/nt8'
OUT = ROOT / 'analysis/output/overnight-hold-futures'
ROOTS = {'nq': 'NQ', 'gold': 'GC'}
SPEC = {   # tick size; $ per point for full and micro; assumed all-in commission per round trip (broker + exchange fees)
    'nq': {'tick': 0.25, 'full': {'mult': 20, 'comm': 5.0, 'name': 'NQ'}, 'micro': {'mult': 2, 'comm': 2.5, 'name': 'MNQ'}},
    'gold': {'tick': 0.10, 'full': {'mult': 100, 'comm': 5.0, 'name': 'GC'}, 'micro': {'mult': 10, 'comm': 2.5, 'name': 'MGC'}},
}
MAX_GAP = 1800


def epoch(ts):
    return ts.dt.tz_convert('UTC').dt.tz_localize(None).astype('datetime64[s]').astype('int64').to_numpy()


def price_at(ep, close, target):
    """Close of the last bar stamped at or before target (within MAX_GAP); NaN otherwise."""
    i = np.searchsorted(ep, target, side='right') - 1
    ok = (i >= 0) & (target - ep[np.clip(i, 0, None)] <= MAX_GAP)
    return np.where(ok, close[np.clip(i, 0, None)], np.nan), i


def reprice(key, entries, exits, cont, contracts):
    """Futures gross/MAE/MFE for trades given by OANDA entry/exit epochs."""
    cep, ccon = epoch(cont.timestamp), cont.contract.to_numpy()
    j = np.searchsorted(cep, entries + 60, side='right') - 1
    front = np.where(j >= 0, ccon[np.clip(j, 0, None)], None)
    res = {k: [None] * len(entries) for k in ('contract', 'price', 'exit_price', 'gross', 'mae', 'mfe')}
    for c in pd.unique(front):
        if c is None:
            continue
        idx = np.flatnonzero(front == c)
        f = contracts(c)
        ep, cl, hi, lo = epoch(f.timestamp), f.close.to_numpy(), f.high.to_numpy(), f.low.to_numpy()
        p0, i0 = price_at(ep, cl, entries[idx] + 60)
        p1, i1 = price_at(ep, cl, exits[idx] + 60)
        for n, k in enumerate(idx):
            if not (np.isfinite(p0[n]) and np.isfinite(p1[n])) or i1[n] <= i0[n]:
                continue
            g = (p1[n] / p0[n] - 1) * 100
            res['contract'][k] = c
            res['price'][k], res['exit_price'][k], res['gross'][k] = float(p0[n]), float(p1[n]), g
            res['mae'][k] = min((lo[i0[n] + 1:i1[n] + 1].min() / p0[n] - 1) * 100, g, 0.0)
            res['mfe'][k] = max((hi[i0[n] + 1:i1[n] + 1].max() / p0[n] - 1) * 100, 0.0)
    return res


def reprice_drive(entries, exits):
    """NQ from the owner's ratio-adjusted file (open-stamped like OANDA, so the same epochs)."""
    d = pd.read_parquet(NT8 / 'drive/NQ_1m_drive.parquet')
    ep, cl, hi, lo = epoch(d.utc), d.c.to_numpy(), d.h.to_numpy(), d.l.to_numpy()
    p0, i0 = price_at(ep, cl, entries)
    p1, i1 = price_at(ep, cl, exits)
    res = {k: [None] * len(entries) for k in ('contract', 'price', 'exit_price', 'gross', 'mae', 'mfe')}
    for k in range(len(entries)):
        if not (np.isfinite(p0[k]) and np.isfinite(p1[k])) or i1[k] <= i0[k] or exits[k] > ep[-1]:
            continue
        g = (p1[k] / p0[k] - 1) * 100
        res['contract'][k] = 'drive'
        res['price'][k], res['exit_price'][k], res['gross'][k] = float(p0[k]), float(p1[k]), g
        res['mae'][k] = min((lo[i0[k] + 1:i1[k] + 1].min() / p0[k] - 1) * 100, g, 0.0)
        res['mfe'][k] = max((hi[i0[k] + 1:i1[k] + 1].max() / p0[k] - 1) * 100, 0.0)
    return res, int(ep[-1])


def merge(a, b):
    """Per trade: a where it priced the trade, else b."""
    return {k: [x if a['gross'][i] is not None else y for i, (x, y) in enumerate(zip(a[k], b[k]))] for k in a}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    page = json.loads((ROOT / 'analysis/output/overnight-hold-toolkit/page_trades.json').read_text())
    post = json.loads((ROOT / 'analysis/output/overnight-hold-toolkit/post_cutoff.json').read_text())
    out = {'built': pd.Timestamp.now().strftime('%Y-%m-%d'), 'spec': SPEC, 'instruments': {}, 'post': {}}
    summary = {}
    for key, R in ROOTS.items():
        cont = pd.read_parquet(NT8 / f'continuous/{R}_1m_unadj.parquet', columns=['timestamp', 'contract'])
        cache = {}
        def contracts(c):
            if c not in cache:
                cache[c] = pd.read_parquet(NT8 / f'contracts/{R}/{c}.parquet', columns=['timestamp', 'high', 'low', 'close']).sort_values('timestamp')
            return cache[c]
        I, P = page['instruments'][key], post['instruments'][key]
        res = reprice(key, np.array(I['entry_epoch']), np.array(I['exit_epoch']), cont, contracts)
        pres = reprice(key, np.array(P['entry_epoch']), np.array(P['exit_epoch']), cont, contracts)
        drive_end = None
        if key == 'nq':
            dres, drive_end = reprice_drive(np.array(I['entry_epoch']), np.array(I['exit_epoch']))
            res = merge(dres, res)

        # Buy & hold on the ratio-adjusted series (returns are continuous through rolls), paying ticks + commission per roll.
        ra = pd.read_parquet(NT8 / f'continuous/{R}_1m_ratio.parquet', columns=['timestamp', 'close'])
        rep, rcl = epoch(ra.timestamp), ra.close.to_numpy()
        # Endpoints: the first and last trades that have a futures price (gold's first night sits in a NinjaTrader hole).
        got = [i for i, g in enumerate(res['gross']) if g is not None]
        e0, e1 = I['entry_epoch'][got[0]], I['exit_epoch'][got[-1]]
        a = price_at(rep, rcl, np.array([e0 + 60]))[0][0]
        b = price_at(rep, rcl, np.array([e1 + 60]))[0][0]
        if drive_end is not None:   # NQ: the owner's file to its end, then NT8 from there (NT8 has holes before)
            d = pd.read_parquet(NT8 / 'drive/NQ_1m_drive.parquet', columns=['utc', 'c'])
            dep, dcl = epoch(d.utc), d.c.to_numpy()
            mid = drive_end - 3600
            g1 = price_at(dep, dcl, np.array([mid]))[0][0] / price_at(dep, dcl, np.array([e0]))[0][0]
            g2 = b / price_at(rep, rcl, np.array([mid + 60]))[0][0]
            a, b = 1.0, g1 * g2
        rolls = pd.read_csv(NT8 / f'continuous/{R}_rolls.csv', parse_dates=['switch_utc'])
        t0, t1 = pd.to_datetime(e0, unit='s', utc=True), pd.to_datetime(e1, unit='s', utc=True)
        nroll = int(((rolls.switch_utc > t0) & (rolls.switch_utc < t1)).sum())
        years = (e1 - e0) / 86400 / 365.25
        bh = {'gross_total': (b / a - 1) * 100, 'rolls': nroll, 'years': years,
              'from': I['entry'][got[0]], 'to': I['exit'][got[-1]]}
        assert np.isfinite(bh['gross_total']), (key, a, b)

        ok = np.array([g is not None for g in res['gross']])
        fg, cg = np.array([g if g is not None else np.nan for g in res['gross']]), np.array(I['gross'])
        diff = fg[ok] - cg[ok]
        summary[key] = {'trades': len(ok), 'priced': int(ok.sum()), 'from_drive': sum(c == 'drive' for c in res['contract']), 'missing': [I['entry'][i] for i in np.flatnonzero(~ok)],
                        'mean_gross_futures': float(np.nanmean(fg)), 'mean_gross_cfd_same_trades': float(cg[ok].mean()),
                        'mean_futures_minus_cfd': float(diff.mean()), 'corr_futures_cfd': float(np.corrcoef(fg[ok], cg[ok])[0, 1]),
                        'post_priced': int(sum(g is not None for g in pres['gross'])), 'bh': bh}
        rr = lambda v: None if v is None else round(float(v), 5)
        out['instruments'][key] = {k: [rr(v) if k != 'contract' else v for v in res[k]] for k in res} | {'bh': bh}
        out['post'][key] = {k: [rr(v) if k != 'contract' else v for v in pres[k]] for k in pres}
        print(key, json.dumps(summary[key], default=str)[:600])
    (OUT / 'futures_trades.json').write_text(json.dumps(out, separators=(',', ':'), allow_nan=False))
    (OUT / 'summary.json').write_text(json.dumps(summary, indent=1, default=str))
    print((OUT / 'futures_trades.json'), (OUT / 'futures_trades.json').stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
