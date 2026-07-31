"""scale.py — run the headline tests across every instrument with local M1.

Turns the cross-asset findings from n=1-per-class into a measured law. 31
instruments are available locally (25 FX, 5 index, 1 commodity), so the FX and
index classes become real samples; commodity stays n=1 and is labelled as such.

WHAT IT RUNS PER INSTRUMENT
───────────────────────────
  core       WT oversold / overbought  -> P(revert)
  stack      all-3-timeframes OS / OB / mid / mixed  (the alignment law)
  jordan     1/3/5/15m yellow-line alignment, scored as a FADE
  per-year   sign consistency of the core cell — the stability read that
             matters more than any pooled number

DESIGN NOTES
────────────
* Panels are built IN MEMORY and discarded. Persisting 31 of them is ~5 GB and
  nothing downstream needs them. `--keep-panels` overrides.
* RESUMABLE. Each instrument's summary is cached to `data/scale/<inst>.json`;
  re-running skips completed work. A crash 20 instruments in costs nothing.
* Failures are caught per instrument and reported at the end rather than
  killing the run — some caches have gaps or fail the resolution guard.

  python vumanchuLab/scale.py                    # everything, resumable
  python vumanchuLab/scale.py --instruments all --workers 1
  python vumanchuLab/scale.py --report-only      # just re-print from cache
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import time
import traceback

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.analyse import DATA, batch_means_se  # noqa: E402
from vumanchuLab.panel import M1_DIRS, TIMEFRAMES, build_panel  # noqa: E402
from pylego.instruments import asset_class, resolve_key  # noqa: E402

CACHE = os.path.join(DATA, 'scale')
PRIOR_ROWS = 12          # panel rows (stride 5) => 60 min
FWD = 'fwd_ret_60'
MIN_PRIOR = 0.5
N_BLOCKS = 40


def available() -> list[str]:
    seen = {}
    for d in M1_DIRS:
        for p in sorted(glob.glob(os.path.join(d, '*_m1.parquet'))):
            n = os.path.basename(p).replace('_m1.parquet', '')
            if n in seen:
                continue
            try:
                seen[n] = resolve_key(n)
            except Exception:
                pass
    return sorted(seen)


def add_outcome(df: pd.DataFrame) -> pd.DataFrame:
    c = df['close']
    sig = df['sigma'].to_numpy(float)
    with np.errstate(divide='ignore', invalid='ignore'):
        prior = (c / c.shift(PRIOR_ROWS) - 1.0).to_numpy() / (sig * np.sqrt(PRIOR_ROWS * 5))
    fwd = df[FWD].to_numpy(float)
    rev = (np.sign(fwd) != np.sign(prior)).astype(float)
    rev[~np.isfinite(fwd) | ~np.isfinite(prior)] = np.nan
    rev[np.abs(prior) < MIN_PRIOR] = np.nan
    df = df.copy()
    df['reverted'] = rev
    df['prior_bucket'] = (pd.Series(np.abs(prior), index=df.index)
                          .rolling(20000, min_periods=2000).rank(pct=True)
                          .mul(3).clip(0, 2.999).fillna(-1).astype(int))
    return df.dropna(subset=['reverted'])


def score_cells(df: pd.DataFrame, codes: pd.Series, min_n=400) -> dict:
    y = df['reverted']
    st = (df['hour'].astype(int) * 100 + df['vol_bucket'].fillna(-1).astype(int) * 10
          + df['prior_bucket'].astype(int))
    glob = y.groupby(st).mean()
    blocks = pd.Series(np.minimum((np.arange(len(df)) * N_BLOCKS) // len(df), N_BLOCKS - 1),
                       index=df.index)
    out = {}
    for key, idx in codes.groupby(codes).groups.items():
        m = pd.Series(False, index=df.index)
        m.loc[idx] = True
        n = int(m.sum())
        if n < min_n:
            continue
        w = st[m].value_counts(normalize=True)
        common = w.index.intersection(glob.index)
        if not len(common):
            continue
        base = float((glob.loc[common] * w.loc[common]).sum() / w.loc[common].sum())
        p = float(y[m].mean())
        se = batch_means_se(y[m] - base, blocks[m])
        sub = df[m]
        yrs = [100 * (float(g['reverted'].mean()) - base)
               for _, g in sub.groupby(sub.index.year) if len(g) >= 200]
        out[str(key)] = {
            'n': n,
            'delta_pp': round(100 * (p - base), 3),
            't': round((p - base) / se, 2) if se and se > 0 else None,
            'years': len(yrs),
            'years_same_sign': int(sum(1 for d in yrs if np.sign(d) == np.sign(p - base))),
        }
    return out


def jordan(instrument: str) -> dict:
    """1/3/5/15m yellow-line alignment, scored as a FADE."""
    from vumanchuLab.jordan_rule import build, directional
    df = build(instrument, verbose=False)
    t = directional(df, 'sign_aligned', 60)
    if t.empty:
        return {}
    out = {}
    for _, r in t.iterrows():
        if r['cell'] == 'split':
            continue
        # delta_pp is the CONTINUATION edge; the fade edge is its negation.
        out[r['cell']] = {'n': int(r['n']), 'fade_delta_pp': round(-float(r['delta_pp']), 3)}
    return out


def run_one(inst: str, keep: bool) -> dict:
    t0 = time.time()
    p = build_panel(inst, timeframes=TIMEFRAMES, stride=5, verbose=False)
    if keep:
        p.to_parquet(os.path.join(DATA, f'panel_{inst}.parquet'))
    df = add_outcome(p)
    res = {
        'instrument': inst,
        'asset_class': asset_class(inst),
        'rows': len(df),
        'first': str(df.index[0].date()), 'last': str(df.index[-1].date()),
        'uncond_p_revert': round(float(df['reverted'].mean()), 4),
        'core': score_cells(df, df['tf1_wt_zone'].astype(str)),
        'stack': score_cells(df, df['stack_zone'].astype(str)),
        'secs': round(time.time() - t0, 1),
    }
    try:
        res['jordan'] = jordan(inst)
    except Exception as e:
        res['jordan_error'] = str(e)[:120]
    return res


def summarise(rows: list[dict]):
    core, stack, jr = [], [], []
    for r in rows:
        cls = r['asset_class']
        c = r.get('core', {})
        core.append({
            'instrument': r['instrument'], 'class': cls,
            'OS_pp': c.get('-1', {}).get('delta_pp'), 'OS_t': c.get('-1', {}).get('t'),
            'OB_pp': c.get('1', {}).get('delta_pp'), 'OB_t': c.get('1', {}).get('t'),
            'OS_yrs': f"{c.get('-1', {}).get('years_same_sign', 0)}/{c.get('-1', {}).get('years', 0)}",
            'OB_yrs': f"{c.get('1', {}).get('years_same_sign', 0)}/{c.get('1', {}).get('years', 0)}",
        })
        s = r.get('stack', {})
        stack.append({
            'instrument': r['instrument'], 'class': cls,
            'allOS_pp': s.get('-1.0', {}).get('delta_pp'),
            'allOB_pp': s.get('1.0', {}).get('delta_pp'),
            'mixed_pp': s.get('0.0', {}).get('delta_pp'),
        })
        j = r.get('jordan', {})
        jr.append({
            'instrument': r['instrument'], 'class': cls,
            'fade_up_pp': j.get('all four UP', {}).get('fade_delta_pp'),
            'fade_dn_pp': j.get('all four DOWN', {}).get('fade_delta_pp'),
        })
    return pd.DataFrame(core), pd.DataFrame(stack), pd.DataFrame(jr)


def report(rows: list[dict]):
    core, stack, jr = summarise(rows)
    pd.set_option('display.width', 200)

    print(f'\n{"="*96}')
    print(f'CROSS-INSTRUMENT — {len(rows)} instruments  '
          f'({dict(core["class"].value_counts())})')
    print(f'{"="*96}')

    print('\n-- CORE: WT stretched -> P(revert), delta vs matched baseline --')
    print(core.sort_values(['class', 'OS_pp'], ascending=[True, False]).to_string(index=False))

    for label, col, df in (('OVERSOLD', 'OS_pp', core), ('OVERBOUGHT', 'OB_pp', core)):
        v = df.dropna(subset=[col])
        print(f'\n  {label}: positive on {int((v[col] > 0).sum())}/{len(v)} instruments   '
              f'median {v[col].median():+.2f}pp')
        for cls, g in v.groupby('class'):
            print(f'    {cls:<10} {int((g[col] > 0).sum())}/{len(g)} positive, '
                  f'median {g[col].median():+.2f}pp')

    print('\n-- STACK: all three timeframes in the same zone --')
    print(stack.sort_values(['class', 'allOS_pp'], ascending=[True, False]).to_string(index=False))
    for col, lab in (('allOS_pp', 'all-OS'), ('allOB_pp', 'all-OB'), ('mixed_pp', 'mixed')):
        v = stack.dropna(subset=[col])
        if v.empty:
            continue
        print(f'  {lab:<8} positive on {int((v[col] > 0).sum())}/{len(v)}, '
              f'median {v[col].median():+.2f}pp')

    print('\n-- JORDAN RULE: 1/3/5/15m aligned, scored as a FADE --')
    print(jr.sort_values(['class', 'fade_up_pp'], ascending=[True, False]).to_string(index=False))
    for col, lab in (('fade_up_pp', 'fade aligned-UP'), ('fade_dn_pp', 'fade aligned-DOWN')):
        v = jr.dropna(subset=[col])
        if v.empty:
            continue
        print(f'  {lab:<20} positive on {int((v[col] > 0).sum())}/{len(v)}, '
              f'median {v[col].median():+.2f}pp')

    out = os.path.join(DATA, 'scale_summary.csv')
    core.merge(stack, on=['instrument', 'class']).merge(jr, on=['instrument', 'class']) \
        .to_csv(out, index=False)
    print(f'\nwrote {out}')
    print('\nREAD: the count of instruments with the same SIGN is the number that matters.')
    print('Magnitude was shown to be regime-dependent; direction has been the stable part.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='all')
    ap.add_argument('--keep-panels', action='store_true')
    ap.add_argument('--report-only', action='store_true')
    ap.add_argument('--refresh', action='store_true', help='ignore cached results')
    a = ap.parse_args()

    os.makedirs(CACHE, exist_ok=True)
    names = available() if a.instruments == 'all' else \
        [s.strip() for s in a.instruments.split(',') if s.strip()]

    rows, failed = [], []
    for i, n in enumerate(names, 1):
        cf = os.path.join(CACHE, f'{n}.json')
        if a.report_only or (os.path.exists(cf) and not a.refresh):
            if os.path.exists(cf):
                rows.append(json.load(open(cf)))
                if not a.report_only:
                    print(f'[{i}/{len(names)}] {n:<10} cached')
            continue
        try:
            print(f'[{i}/{len(names)}] {n:<10} building ...', end='', flush=True)
            r = run_one(n, a.keep_panels)
            json.dump(r, open(cf, 'w'))
            rows.append(r)
            os_pp = r.get('core', {}).get('-1', {}).get('delta_pp')
            print(f' {r["rows"]:,} rows, OS {os_pp:+.2f}pp, {r["secs"]}s')
        except Exception as e:
            failed.append((n, str(e)[:100]))
            print(f' FAILED: {str(e)[:80]}')
            traceback.print_exc(limit=1)

    if not rows:
        print('nothing to report'); return
    report(rows)
    if failed:
        print(f'\n{len(failed)} failed:')
        for n, e in failed:
            print(f'  {n}: {e}')


if __name__ == '__main__':
    main()
