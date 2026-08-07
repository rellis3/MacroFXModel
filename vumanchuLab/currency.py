"""currency.py — the dimension that only exists now that 31 instruments are run.

Every study so far treated each instrument as an island. But EUR appears in 8
of the 25 FX pairs and USD in 10. If VuManChu is oversold on EURUSD, EURJPY,
EURGBP AND EURCHF at the same moment, that is a EUR event — categorically
different information from one pair being oversold, and invisible to a
per-instrument study.

TWO THINGS MEASURED
───────────────────
  CURRENCY STATE  For each currency, the average VMC z-state across every pair
                  it appears in, SIGNED so that + always means "this currency
                  is strong". EURUSD oversold means EUR weak / USD strong;
                  USDJPY oversold means USD weak. Getting that sign convention
                  right is the whole exercise.

  BREADTH         How many of the tracked instruments are simultaneously
                  stretched the same way. A market-wide stretch is a different
                  state from an idiosyncratic one.

Then: does either add anything on top of the pair's own reading? The test is
strictly incremental — the pair's own zone is always in the cell, so a
currency or breadth term only scores if it moves the delta beyond what the
pair already said.

Needs several instruments' panels. Builds them if absent (slow the first time,
then cached to `data/currency_states.parquet`).

  python vumanchuLab/currency.py --build
  python vumanchuLab/currency.py
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Redirecting stdout to a file makes Python pick the locale codec (cp1252 on
# Windows), which dies on the sigma/arrow glyphs this module prints. Force
# UTF-8 so `> out.txt` behaves the same as the console.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from vumanchuLab.analyse import DATA  # noqa: E402
from vumanchuLab.labcommon import add_context, get_panel, score, tercile  # noqa: E402

CACHE = os.path.join(DATA, 'currency_states.parquet')

FX = ['audcad', 'audchf', 'audjpy', 'audnzd', 'audusd', 'cadjpy', 'chfjpy',
      'euraud', 'eurcad', 'eurchf', 'eurgbp', 'eurjpy', 'eurnzd', 'eurusd',
      'gbpaud', 'gbpcad', 'gbpchf', 'gbpjpy', 'gbpnzd', 'gbpusd',
      'nzdjpy', 'nzdusd', 'usdcad', 'usdchf', 'usdjpy']


def split_pair(p: str) -> tuple[str, str]:
    return p[:3].upper(), p[3:].upper()


def build(instruments=FX, freq: str = '15min') -> pd.DataFrame:
    """One wide frame of per-pair WT state, resampled to a common grid.

    Resampling to 15m keeps this tractable (25 pairs x 3.7M M1 rows will not
    fit in memory) and is fine — currency-level state is a slow variable.
    `last` is used, so every value is still the most recent CLOSED reading.
    """
    cols = {}
    for i, p in enumerate(instruments, 1):
        try:
            print(f'  [{i}/{len(instruments)}] {p} ...', end='', flush=True)
            pan = get_panel(p)
            # CAUSALITY: label='right', closed='right' stamps each bucket with
            # its END, so a later ffill can only ever reach data that has
            # already closed. The default (label='left') stamps the bucket with
            # its START while `.last()` takes the value from its END — ffilling
            # from that leaks up to one full bucket of future into every row,
            # which produced a +21pp "finding" on the first run.
            s = pan['tf1_wt1'].resample(freq, label='right', closed='right').last()
            cols[p] = s
            print(' ok')
        except Exception as e:
            print(f' skip ({str(e)[:40]})')
    wide = pd.DataFrame(cols).dropna(how='all')
    wide.to_parquet(CACHE)
    print(f'\nwrote {CACHE}  {wide.shape}')
    return wide


def currency_states(wide: pd.DataFrame, exclude: str | None = None) -> pd.DataFrame:
    """Per-currency strength: mean WT across every pair it appears in, signed
    so + always means that currency is STRONG.

    A pair's WT is a statement about the BASE currency: WT high on EURUSD means
    EUR strong / USD weak. So the base gets +wt and the quote gets -wt.

    `exclude` DROPS a pair from the construction — mandatory when testing that
    pair. Leaving EURUSD in means EUR carries +wt_eurusd and USD carries
    -wt_eurusd, so the EUR-USD spread contains 2x the pair's own value and the
    "incremental" test is conditioning the signal on itself.
    """
    ccy = {}
    for p in wide.columns:
        if exclude and p == exclude:
            continue
        b, q = split_pair(p)
        ccy.setdefault(b, []).append(wide[p])
        ccy.setdefault(q, []).append(-wide[p])
    return pd.DataFrame({c: pd.concat(v, axis=1).mean(axis=1) for c, v in ccy.items()})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--build', action='store_true')
    ap.add_argument('--instrument', default='eurusd')
    a = ap.parse_args()

    if a.build or not os.path.exists(CACHE):
        print('Building the cross-pair state frame (slow the first time) ...')
        wide = build()
    else:
        wide = pd.read_parquet(CACHE)
        print(f'loaded {CACHE}  {wide.shape}')

    ccy_all = currency_states(wide)          # for the descriptive block only
    # Breadth: how many pairs are stretched, and net direction.
    stretched_up = (wide >= 53).sum(axis=1)
    stretched_dn = (wide <= -53).sum(axis=1)
    breadth = stretched_up - stretched_dn


    print(f'\n{"="*88}')
    print(f'CURRENCY DECOMPOSITION — {wide.shape[1]} pairs -> {ccy_all.shape[1]} currencies')
    print(f'{"="*88}')
    print('\nmean |currency state| (how far each typically swings):')
    print(ccy_all.abs().mean().round(2).sort_values(ascending=False).to_string())
    print(f'\nbreadth: {(breadth.abs() >= 5).mean()*100:.1f}% of bars have >=5 pairs '
          f'net stretched the same way')

    # --- incremental test on one pair ---------------------------------------
    inst = a.instrument
    b, q = split_pair(inst)
    print(f'\n-- INCREMENTAL TEST on {inst} ({b} vs {q}) --')
    df = add_context(get_panel(inst))
    # Rebuild the currency states with THIS pair excluded — otherwise the
    # spread contains 2x the pair's own wt1 and the test is circular.
    ccy = currency_states(wide, exclude=inst)
    print(f'   (currency states rebuilt with {inst} EXCLUDED — '
          f'{wide.shape[1]-1} pairs contribute)')
    df['ccy_base'] = ccy[b].reindex(df.index, method='ffill')
    df['ccy_quote'] = ccy[q].reindex(df.index, method='ffill')
    df['ccy_spread'] = df['ccy_base'] - df['ccy_quote']
    df['breadth'] = breadth.reindex(df.index, method='ffill')
    df['ccy_T'] = tercile(df['ccy_spread'])
    df['breadth_T'] = tercile(df['breadth'].astype(float))

    base = score(df, df['tf1_wt_zone'].astype(str), min_n=400)
    print('\n  the pair alone:')
    print(base[['cell', 'n', 'delta', 't']].to_string(index=False))

    for extra, lab in (('ccy_T', 'currency-strength spread'), ('breadth_T', 'market breadth')):
        codes = df['tf1_wt_zone'].astype(str) + '|' + df[extra].astype(str)
        t = score(df, codes, min_n=400)
        t = t[t['cell'].str.startswith('-1|')]
        if t.empty:
            continue
        print(f'\n  OVERSOLD split by {lab}:')
        print(t[['cell', 'n', 'delta', 't', 'consistent']].to_string(index=False))
        b0 = base[base['cell'] == '-1']
        if len(b0):
            best = t.reindex(t['delta'].abs().sort_values(ascending=False).index).iloc[0]
            print(f'    pair alone {100*float(b0["delta"].iloc[0]):+.2f}pp  ->  '
                  f'best split {100*float(best["delta"]):+.2f}pp  '
                  f'({100*(abs(float(best["delta"]))-abs(float(b0["delta"].iloc[0]))):+.2f}pp)')

    print(f'\n{"-"*88}')
    print('The pair\'s own zone is in every cell, so a currency or breadth term only')
    print('earns its place if it moves the delta BEYOND what the pair already said.')
    print('-' * 88)


if __name__ == '__main__':
    main()
