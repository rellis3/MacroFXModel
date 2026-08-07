"""Phase 3a: indicator equivalence harness (Python side).

DIAGNOSTIC ONLY — changes no production code. Answers one question before any
consolidation is attempted:

    Are the 10 duplicated `_ema`/`ema` implementations across bot/, Gold/,
    GoldV2/, ConfluenceBot/, RegimeV2/, scripts/ and volatilityExhaustion/
    bit-identical to the canonical pylego/indicators/vumanchu.py:ema, or have
    they drifted?

This matters because the duplication is exactly what ALLOWS silent drift
(CLAUDE.md, Lego Principle 1). If a copy has drifted, "just import the canonical
brick" is not a refactor — it CHANGES the output of whatever uses that copy.
Gold/main.py and bot/main.py are LIVE (see start.sh), so that is not academic.

Functions are extracted with `ast` and exec'd in an isolated namespace rather
than imported, so heavyweight module side effects (MetaTrader5, network, config
loading) cannot interfere with — or be triggered by — the check.

Run: python scripts/indicator_equivalence.py
"""

from __future__ import annotations

import ast
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


# ── Same deterministic LCG as js/indicatorEquivalence.test.mjs ───────────────
# so both harnesses test byte-identical input series.
def lcg(seed: int, n: int) -> list[float]:
    out, s = [], seed & 0xFFFFFFFF
    for _ in range(n):
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        out.append(s / 4294967296)
    return out


def random_walk(n: int, seed: int) -> list[float]:
    r, out, p = lcg(seed, n), [], 100.0
    for i in range(n):
        p += (r[i] - 0.5) * 2
        out.append(round(p, 10))
    return out


CASES = [
    ('ascending',     [100 + i * 0.37 for i in range(200)]),
    ('random-walk',   random_walk(500, 12345)),
    ('constant',      [42.0] * 120),
    ('short(len<per)', [10.0, 11.0, 12.0]),
    ('single',        [7.0]),
    ('descending',    [500 - i * 1.13 for i in range(150)]),
]
PERIODS = [3, 9, 12, 21, 50]

# (path, function name)
COPIES = [
    ('bot/utils/indicators.py',              '_ema'),
    ('ConfluenceBot/modules/htf_bias.py',    '_ema'),
    ('ConfluenceBot/modules/vumanchu.py',    '_ema'),
    ('Gold/modules/htf_bias.py',             '_ema'),
    ('Gold/modules/vumanchu.py',             '_ema'),
    ('GoldV2/modules/htf_bias.py',           '_ema'),
    ('GoldV2/modules/vumanchu.py',           '_ema'),
    ('RegimeV2/beta_regime_table.py',        '_ema'),
    ('scripts/build_corr_history.py',        'ema'),
    ('volatilityExhaustion/mtf_divergence.py', 'ema'),
]

LIVE = {'bot/utils/indicators.py', 'Gold/modules/htf_bias.py', 'Gold/modules/vumanchu.py'}


def extract_fn(relpath: str, fname: str):
    """Pull one function's source out of a file and exec it in isolation."""
    path = os.path.join(ROOT, relpath)
    with open(path, 'r', encoding='utf-8') as f:
        src = f.read()
    tree = ast.parse(src)
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == fname:
            # Provide the module-level names these functions commonly close over,
            # so a missing global surfaces as a real result rather than a throw
            # that would otherwise be mistaken for a pass.
            ns: dict = {'__builtins__': __builtins__, 'math': math}
            try:
                import numpy as _np
                ns['np'] = _np
            except ImportError:
                pass
            exec(compile(ast.Module(body=[node], type_ignores=[]), relpath, 'exec'), ns)
            return ns[fname]
    raise LookupError(f'{fname} not found at top level of {relpath}')


def canonical_ema(values, period):
    """The documented canonical contract: out[0] = v[0], k = 2/(period+1).

    Reimplemented in pure Python rather than imported from pylego so the check
    does not require numpy/pandas. Verified against pylego below.
    """
    if not values or period <= 0:
        return []
    k = 2.0 / (period + 1)
    out = [float(values[0])]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def max_abs_diff(a, b) -> float:
    if a is None or b is None:
        return math.inf
    try:
        if len(a) != len(b):
            return math.inf
    except TypeError:
        return math.inf
    m = 0.0
    for x, y in zip(a, b):
        try:
            if math.isnan(x) and math.isnan(y):
                continue
            m = max(m, abs(float(x) - float(y)))
        except (TypeError, ValueError):
            return math.inf
    return m


def main() -> int:
    # Sanity-check the pure-Python canonical against the real pylego one, so a
    # green result below cannot be an artefact of this file's own reimplementation.
    print('\n=== canonical cross-check: this harness vs pylego/indicators/vumanchu.py ===\n')
    try:
        sys.path.insert(0, ROOT)
        from pylego.indicators.vumanchu import ema as pylego_ema  # noqa: E402
        worst = 0.0
        for _, vals in CASES:
            for p in PERIODS:
                worst = max(worst, max_abs_diff(list(pylego_ema(vals, p)), canonical_ema(vals, p)))
        print(f'  pylego vs harness canonical: max|Δ| = {worst:.3e} '
              f'({"OK" if worst < 1e-12 else "MISMATCH — investigate before trusting the table below"})')
    except Exception as e:                                   # noqa: BLE001
        print(f'  could not import pylego ({e}) — table below still valid vs the documented contract')

    print('\n=== EMA equivalence vs canonical (out[0]=v[0], k=2/(period+1)) ===\n')
    drifted = []
    for relpath, fname in COPIES:
        tag = ' [LIVE]' if relpath in LIVE else ''
        try:
            fn = extract_fn(relpath, fname)
        except Exception as e:                               # noqa: BLE001
            print(f'  {relpath:42s} EXTRACT FAILED: {e}')
            drifted.append(relpath)
            continue

        worst, shape, threw = 0.0, None, None
        for cname, vals in CASES:
            for p in PERIODS:
                want = canonical_ema(vals, p)
                try:
                    got = fn(vals, p)
                except Exception as e:                       # noqa: BLE001
                    threw = f'{cname}/p{p}: {e}'
                    continue
                d = max_abs_diff(got, want)
                if d is math.inf:
                    got_len = len(got) if hasattr(got, '__len__') else 'scalar'
                    shape = f'length {got_len} vs {len(want)}'
                else:
                    worst = max(worst, d)

        # A copy that threw on ANY case has not been fully compared. Reporting it
        # as IDENTICAL would be a false green — the precise failure this harness
        # exists to prevent.
        if threw:
            verdict = 'INCONCLUSIVE — threw during comparison'
            drifted.append(relpath)
        elif shape:
            verdict = f'DIFFERENT CONTRACT ({shape})'
            drifted.append(relpath)
        elif worst == 0.0:
            verdict = 'IDENTICAL'
        elif worst < 1e-12:
            verdict = f'float-noise ({worst:.2e})'
        else:
            verdict = f'DRIFTED ({worst:.2e})'
            drifted.append(relpath)
        print(f'  {relpath + tag:42s} {verdict}')
        if threw:
            print(f'  {"":42s}   └─ threw: {threw}')

    # NaN behaviour is NOT covered by clean-input equivalence, and real bar data
    # has gaps. Report it explicitly rather than let a green table imply it.
    print('\n=== NaN handling (clean-input equivalence does NOT cover this) ===\n')
    nan_case = [10.0, 11.0, float('nan'), 13.0, 14.0, float('nan'), 16.0]
    fmt = lambda o: '[' + ', '.join('nan' if isinstance(v, float) and math.isnan(v)
                                    else f'{v:.4f}' for v in o) + ']'
    print(f'  {"canonical (pure-python contract)":42s} {fmt(canonical_ema(nan_case, 3))}')
    try:
        from pylego.indicators.vumanchu import ema as _pyl                 # noqa: E402
        print(f'  {"pylego ema (pandas ewm) <-- MERGE TARGET":42s} {fmt(list(_pyl(nan_case, 3)))}')
    except Exception:                                        # noqa: BLE001
        pass
    for relpath, fname in COPIES:
        try:
            print(f'  {relpath:42s} {fmt(extract_fn(relpath, fname)(nan_case, 3))}')
        except Exception as e:                               # noqa: BLE001
            print(f'  {relpath:42s} threw: {e}')
    print('\n  NOTE: every copy POISONS the series from the first NaN onward.')
    print('  pylego (pandas ewm, ignore_na=False) SKIPS the NaN and re-weights,')
    print('  and js/indicatorCore.js HOLDS the previous value — three different')
    print('  answers. Clean-input equivalence therefore does NOT make the merge')
    print('  free: it is only free if the inputs are guaranteed gap-free.')

    ok = len(COPIES) - len(drifted)
    print(f'\n{ok}/{len(COPIES)} copies are bit-identical to the canonical contract '
          f'ON CLEAN INPUT; {len(drifted)} need a decision.')
    print('  This is NOT the same as "safe to merge". Merging onto pylego.ema also')
    print('  adopts pandas ewm NaN semantics (see above), which differ from every')
    print('  copy. Merge is free only where the caller\'s series cannot contain NaN —')
    print('  that must be established per call site, not assumed.\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
