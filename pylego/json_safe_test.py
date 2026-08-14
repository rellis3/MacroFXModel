"""Synthetic, offline tests for json_safe -- no network, no files.

Run: python pylego/json_safe_test.py
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.json_safe import json_safe  # noqa: E402


def test_nan_becomes_none():
    assert json_safe(float("nan")) is None


def test_inf_and_neg_inf_become_none():
    assert json_safe(float("inf")) is None
    assert json_safe(float("-inf")) is None


def test_finite_float_unchanged():
    assert json_safe(1.5) == 1.5


def test_non_float_unchanged():
    assert json_safe("x") == "x"
    assert json_safe(3) == 3
    assert json_safe(None) is None
    assert json_safe(True) is True


def test_nested_dict_and_list_sanitized():
    tree = {"a": [1.0, float("nan"), {"b": float("inf")}], "c": "ok"}
    out = json_safe(tree)
    assert out == {"a": [1.0, None, {"b": None}], "c": "ok"}


def test_output_is_actually_valid_json():
    tree = {"n": 0, "win_rate": float("nan"), "profit_factor": float("inf"), "avg_r": float("nan")}
    dumped = json.dumps(json_safe(tree))
    reparsed = json.loads(dumped)  # would raise on a literal NaN/Infinity token
    assert reparsed == {"n": 0, "win_rate": None, "profit_factor": None, "avg_r": None}


if __name__ == '__main__':
    fns = [v for k, v in list(globals().items()) if k.startswith('test_')]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f'ok   {fn.__name__}')
        except Exception as e:
            failed += 1
            print(f'FAIL {fn.__name__}: {type(e).__name__}: {e}')
    print(f'\n{len(fns) - failed}/{len(fns)} passed')
    sys.exit(1 if failed else 0)
