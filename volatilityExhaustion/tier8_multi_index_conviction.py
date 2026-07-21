"""
Tier 8 — the REAL multi-index conviction test (settles the NQ lead properly).

The NQ Tier-1 result (state-gating the trend edge helps) is the last directional lead.
Gold + DAX both rejected it (1/3). R2 has the full index M1 basket — de30, spx500,
uk100, us2000, us30, nq — so this is the definitive test across 6 equity indices.

DATA RESOLUTION (runs wherever the data is reachable):
  1. local parquet:  portfolioBacktest/cache/<name>_m1.parquet  or  VolRangeForecaster/data/m1/
  2. else, if R2_ACCESS_KEY/R2_SECRET_KEY are set: download m1/<name>_m1.parquet from R2.
  3. else: skip that index with a clear message (so partial runs are honest).

Per index: TSMOM (momentum × inverse-vol) on London-daily bars, then down-weight 0.5×
when the prior day was spent/chaotic (blew through 75th OR efficiency < 0.35). Report
base vs gated OOS Sharpe + the calm-vs-chaotic conditional edge. NQ 'echoes' = gating
helps AND calm edge > chaotic edge. Tally across indices.

PRE-REGISTERED: the NQ effect is REAL only if it echoes on a MAJORITY of the indices
(>=4/6) with the calm>chaotic sign. Otherwise NQ stays retired as instrument-specific.
"""
import os, sys, tempfile
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from budget_research_lib import (momentum_signal, rolling_vol, sharpe, efficiency,
                                 VOL_TARGET, MAX_LEV, COST_BP, BM_P75)

TRAIN_FRAC = 0.60
EFF_CHAOS = 0.35
HL75_INDEX = BM_P75 * 0.967
INDICES = ['nq', 'de30', 'spx500', 'uk100', 'us2000', 'us30']
HERE = os.path.dirname(os.path.abspath(__file__))
R2_ENDPOINT = os.environ.get('R2_ENDPOINT', 'https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com')
R2_BUCKET = os.environ.get('R2_BUCKET', 'r2-storage')


def resolve_m1(name):
    """Return a local path to <name>_m1.parquet, pulling from R2 if needed. None if unavailable."""
    for rel in (f'../portfolioBacktest/cache/{name}_m1.parquet', f'../VolRangeForecaster/data/m1/{name}_m1.parquet'):
        p = os.path.join(HERE, rel)
        if os.path.exists(p):
            return p
    if os.environ.get('R2_ACCESS_KEY') and os.environ.get('R2_SECRET_KEY'):
        try:
            import boto3
            from botocore.config import Config
            s3 = boto3.client('s3', endpoint_url=R2_ENDPOINT,
                              aws_access_key_id=os.environ['R2_ACCESS_KEY'],
                              aws_secret_access_key=os.environ['R2_SECRET_KEY'],
                              config=Config(signature_version='s3v4'))
            dst = os.path.join(tempfile.gettempdir(), f'{name}_m1.parquet')
            if not os.path.exists(dst):
                s3.download_file(R2_BUCKET, f'm1/{name}_m1.parquet', dst)
            return dst
        except Exception as e:
            print(f'  {name}: R2 fetch failed ({type(e).__name__}: {str(e)[:80]})')
            return None
    return None


def conviction(name, path):
    m1 = load_m1(path); d = build_london_daily(m1)
    o, h, l, c = d['open'], d['high'], d['low'], d['close']
    sig = causal_sigma(d)                              # yz, causal
    n = c.size
    rets = np.zeros(n); rets[1:] = np.where(c[:-1] > 0, (c[1:] - c[:-1]) / c[:-1], 0)
    er = efficiency(o, h, l, c)
    rhl = np.full(n, np.nan); ok = (sig > 0) & (o > 0); rhl[ok] = (h[ok] - l[ok]) / o[ok] / sig[ok]
    exc = (rhl > HL75_INDEX).astype(float)
    eff_prev = np.full(n, np.nan); eff_prev[1:] = er[:-1]
    exc_prev = np.full(n, np.nan); exc_prev[1:] = exc[:-1]
    s = momentum_signal(c); vol = rolling_vol(rets)
    pos = np.zeros(n)
    for i in range(n):
        v = vol[i]
        if v and np.isfinite(v) and v > 0:
            pos[i] = np.clip(s[i] * (VOL_TARGET / v), -MAX_LEV, MAX_LEV)
    chaos = (exc_prev == 1) | (eff_prev < EFF_CHAOS)
    gate = np.where(chaos, 0.5, 1.0)

    def strat(p):
        dr = np.zeros(n)
        for i in range(1, n):
            dr[i] = p[i - 1] * rets[i] - (COST_BP / 1e4) * abs(p[i - 1] - (p[i - 2] if i >= 2 else 0))
        return dr
    base = strat(pos); gated = strat(pos * gate); ntr = int(n * TRAIN_FRAC)
    sg = np.sign(pos); al = np.zeros(n); al[1:] = sg[:-1] * rets[1:]
    sc = [al[i] for i in range(2, ntr) if np.isfinite(eff_prev[i]) and chaos[i]]
    ca = [al[i] for i in range(2, ntr) if np.isfinite(eff_prev[i]) and not chaos[i]]
    base_oos, gated_oos = sharpe(base[ntr:]), sharpe(gated[ntr:])
    calm, chaotic = np.mean(ca), np.mean(sc)
    echoes = (gated_oos > base_oos) and (calm > chaotic)
    return dict(name=name, full=sharpe(base), base_oos=base_oos, gated_oos=gated_oos,
                calm=calm, chaotic=chaotic, echoes=echoes, n=n)


def run():
    print('=== Multi-index conviction test — does NQ replicate? ===')
    print(f'{"index":8} {"fullSh":>7} {"baseOOS":>8} {"gateOOS":>8} {"calm bp":>8} {"chaos bp":>9}  echoes?')
    results = []
    for name in INDICES:
        p = resolve_m1(name)
        if not p:
            print(f'{name:8}   -- data unavailable (add {name}_m1.parquet locally or set R2 creds) --')
            continue
        r = conviction(name, p)
        results.append(r)
        print(f'{name:8} {r["full"]:7.2f} {r["base_oos"]:8.2f} {r["gated_oos"]:8.2f} '
              f'{r["calm"]*1e4:8.2f} {r["chaotic"]*1e4:9.2f}  {"YES" if r["echoes"] else "no"}')
    if results:
        n_echo = sum(r['echoes'] for r in results)
        print(f'\n  NQ effect echoes on {n_echo}/{len(results)} indices tested')
        if len(results) >= 4:
            verdict = 'REVIVED — real cross-index effect' if n_echo >= 4 else 'STAYS RETIRED — instrument-specific'
            print(f'  --> pre-registered verdict: {verdict}')
        else:
            print(f'  --> only {len(results)} index(es) available; need >=4 for the pre-registered verdict '
                  f'(NQ alone already known to echo).')


if __name__ == '__main__':
    run()
