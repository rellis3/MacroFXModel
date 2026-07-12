"""
backtestSystem — family-vote counting unit checks (no network, no MT5).

Run from the backtestSystem directory:  python test_direction.py
Batch 6: the min-confirms gate must count at most ONE confirm per feature
FAMILY (trend / divergence / structure / other) — MACD + HTF-EMA + ADX + TWAP
slope are one trend opinion, not four. The weighted conviction sum and the
per-feature record stay per-feature.
"""

from __future__ import annotations
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import engine  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool, detail: str = '') -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  ✓ {name}')
    else:
        FAIL += 1
        print(f'  ✗ {name}  {detail}')


def _stub(sig):
    return lambda *a, **k: {'signal': sig, 'val': 'stub'}


_FEATURE_FN = {
    'rangePosition': 'feature_range_position', 'chochBos': 'feature_choch_bos',
    'wickRejection': 'feature_wick_rejection', 'rsiDivergence': 'feature_rsi_divergence',
    'orderBlock': 'feature_order_block', 'htfEma': 'feature_htf_ema',
    'vwapSlope': 'feature_vwap_slope', 'adxFilter': 'feature_adx_filter',
    'hurstRegime': 'feature_hurst_regime', 'fvgBias': 'feature_fvg_bias',
    'weeklyPivot': 'feature_weekly_pivot', 'ichimokuCloud': 'feature_ichimoku_cloud',
    'macdSignal': 'feature_macd_signal',
}

_ORIG = {fn: getattr(engine, fn) for fn in _FEATURE_FN.values()}


def run_with(signals: dict[str, str | None]) -> dict:
    """Run compute_direction with the given features enabled and stubbed."""
    try:
        for key, sig in signals.items():
            setattr(engine, _FEATURE_FN[key], _stub(sig))
        cfg = {key: {'enabled': True, 'weight': 1, 'label': key} for key in signals}
        return engine.compute_direction([], [], [], None, None,
                                        1.1000, 0.0001, '2026-07-10', cfg)
    finally:
        for fn, orig in _ORIG.items():
            setattr(engine, fn, orig)


print('\n── family map sanity ────────────────────────────────────────')
check('every feature has a family',
      set(engine.FEATURE_FAMILY) == set(engine.FEATURE_ORDER),
      str(set(engine.FEATURE_ORDER) ^ set(engine.FEATURE_FAMILY)))
check('families are exactly trend/divergence/structure/other',
      set(engine.FEATURE_FAMILY.values()) == {'trend', 'divergence', 'structure', 'other'})
check('the review quartet is one trend family',
      all(engine.FEATURE_FAMILY[k] == 'trend'
          for k in ('macdSignal', 'htfEma', 'adxFilter', 'vwapSlope')))


print('\n── one vote per family ──────────────────────────────────────')
# Four trend detectors all long: raw confirms 4, but ONE independent opinion.
r = run_with({'macdSignal': 'long', 'htfEma': 'long',
              'adxFilter': 'long', 'vwapSlope': 'long'})
check('4 aligned trend detectors → raw confirm_count 4', r['confirm_count'] == 4)
check('… but family_confirm_count 1', r['family_confirm_count'] == 1,
      str(r['family_confirm_count']))
check('conviction (weighted sum) unchanged by the family collapse',
      abs(r['conviction'] - 1.0) < 1e-9, str(r['conviction']))
check('per-feature record intact (4 scored ✓ rows)',
      sum(1 for x in r['results'] if x['icon'] == '✓') == 4)

# One from each family → 4 independent confirms.
r2 = run_with({'macdSignal': 'long', 'rsiDivergence': 'long',
               'orderBlock': 'long', 'weeklyPivot': 'long'})
check('one per family → family_confirm_count 4', r2['family_confirm_count'] == 4)
check('confirm_families lists all four',
      set(r2['confirm_families']) == {'trend', 'divergence', 'structure', 'other'})

# Mixed: trend×3 long + structure×2 long + divergence short → 2 families long.
r3 = run_with({'macdSignal': 'long', 'htfEma': 'long', 'adxFilter': 'long',
               'orderBlock': 'long', 'fvgBias': 'long', 'rsiDivergence': 'short'})
check('3 trend + 2 structure long = 2 family confirms',
      r3['entry_dir'] == 'long' and r3['family_confirm_count'] == 2,
      f"{r3['entry_dir']} {r3['family_confirm_count']}")
check('conflicting divergence still counted as a conflict',
      r3['conflict_count'] == 1)

# No direction → zeroed counts, per-feature results still returned.
r4 = run_with({'macdSignal': 'long', 'htfEma': 'short'})
check('tie → no direction, family count 0',
      r4['entry_dir'] is None and r4['family_confirm_count'] == 0)

print(f'\n{"=" * 60}\n{PASS} passed, {FAIL} failed\n')
sys.exit(1 if FAIL else 0)
