"""Safeguard tests. Run: python -m pytest scripts/value-migration-nq/tests -q   (or python tests/test_vmig.py)

1. Profile arithmetic on hand-made boxes.
2. No look-ahead in features: overwrite every minute after a cutoff (and drop later sessions) with garbage; every
   box state and feature known by the cutoff must be bit-identical.
3. No look-ahead in the backtest: entries (time, side, price, stop) decided by the cutoff must be identical.
4. Null control: on synthetic random walks the signed outcome S of every model sits near 0.
5. Planted control: with a planted persistent drift, A_POC finds S > 0 and gross trend trades make money.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vmig.profile import box_profile, profile_from_distribution  # noqa: E402
from vmig.features import Params, session_sigma1, add_delta_proxy, build_boxes, states, box_scales  # noqa: E402
from vmig.stats import add_outcomes, minute_matrix  # noqa: E402
from vmig.backtest import Market, run, GROSS, NET  # noqa: E402
from vmig.synthetic import make_sessions  # noqa: E402

P = Params()


def _pipeline(mins, p=P):
    s1 = session_sigma1(mins)
    mins = add_delta_proxy(mins, s1)
    bx = build_boxes(mins, p.B)
    f = states(bx, s1, p)
    return mins, bx, f, s1


def test_profile_basic():
    # one level carries most volume -> POC there; VA spans 70%
    vol = np.array([1, 2, 10, 3, 1], float)
    poc, vah, val = profile_from_distribution(100, vol)
    assert poc == 102 * 0.25
    assert val <= poc <= vah
    inside = vol[int(val / 0.25) - 100:int(vah / 0.25) - 100 + 1].sum()
    assert inside >= 0.7 * vol.sum()
    # uniform spread: two minutes overlapping on [10, 10.5]
    poc, vah, val = box_profile(np.array([10.0, 10.0]), np.array([10.5, 11.0]), np.array([30.0, 30.0]), np.array([10.5, 10.75]))
    assert 10.0 <= poc <= 10.5 and val >= 10.0 and vah <= 11.0


def test_no_lookahead_features():
    mins = make_sessions(60, seed=3)
    _, _, f_full, _ = _pipeline(mins)
    rng = np.random.default_rng(0)
    for d_cut, c in [(40, 150), (45, 239), (50, 389 - 15), (55, 74)]:
        g = mins[mins.day <= d_cut].copy()
        late = (g.day == d_cut) & (g.m > c)
        g.loc[late, ["open", "high", "low", "close"]] = 20000 + rng.integers(0, 4000, (late.sum(), 4)) * 0.25
        g.loc[late, "high"] = g.loc[late, ["open", "high", "low", "close"]].max(axis=1)
        g.loc[late, "low"] = g.loc[late, ["open", "high", "low", "close"]].min(axis=1)
        g.loc[late, "volume"] = rng.integers(1, 50000, late.sum())
        _, _, f_cut, _ = _pipeline(g)
        a = f_full[(f_full.day < d_cut) | ((f_full.day == d_cut) & (f_full.end_m <= c))]
        b = f_cut[(f_cut.day < d_cut) | ((f_cut.day == d_cut) & (f_cut.end_m <= c))]
        a, b = a.reset_index(drop=True), b.reset_index(drop=True)
        assert len(a) == len(b) and len(a) > 0
        num = a.select_dtypes("number").columns
        pd.testing.assert_frame_equal(a[num], b[num], check_exact=True)


def test_no_lookahead_backtest():
    mins = make_sessions(50, seed=5, planted_mu=0.15)
    m2, bx, f, _ = _pipeline(mins)
    sb = box_scales(bx)["sigma_b"].to_dict()
    for entry in ("cont", "pull"):
        full, _ = run(Market(m2, bx, P.B, sb), Market(m2, bx, P.B, sb).state_matrix(f, "A"), P.K, entry, "r1", NET)
        full = pd.DataFrame(full)
        d_cut, c = 45, 200
        g = mins[mins.day <= d_cut].copy()
        late = (g.day == d_cut) & (g.m > c)
        g.loc[late, ["open", "high", "low", "close"]] = g.loc[late, ["open", "high", "low", "close"]].values[::-1] + 50
        g2, bx2, f2, _ = _pipeline(g)
        mk2 = Market(g2, bx2, P.B, box_scales(bx2)["sigma_b"].to_dict())
        cut, _ = run(mk2, mk2.state_matrix(f2, "A"), P.K, entry, "r1", NET)
        cut = pd.DataFrame(cut)
        cols = ["day", "entry_m", "dir", "entry", "stop0", "risk"]
        clean = full[(full.day < d_cut)]
        same_day = full[full.day == d_cut]
        prior_exit_ok = same_day[same_day.entry_m <= c]
        prior_exit_ok = prior_exit_ok[prior_exit_ok.entry_m <= c]
        keep = pd.concat([clean, prior_exit_ok.head(1)])  # the first entry of the cut day is decided by the cutoff
        got = cut[(cut.day < d_cut) | ((cut.day == d_cut) & (cut.entry_m <= c))]
        got = pd.concat([got[got.day < d_cut], got[got.day == d_cut].head(1)])
        pd.testing.assert_frame_equal(keep[cols].reset_index(drop=True), got[cols].reset_index(drop=True))
        # earlier sessions' trades are fully identical (outcomes too)
        pd.testing.assert_frame_equal(clean.reset_index(drop=True), cut[cut.day < d_cut].reset_index(drop=True))


def _signed(f, model, h):
    d = f[(f[model] != 0) & f[f"y{h}"].notna()]
    return float((np.sign(d[model]) * d[f"y{h}"]).mean()), len(d)


def test_null_and_planted_controls():
    for mu, expect in ((0.0, "null"), (0.25, "planted")):
        mins = make_sessions(220, seed=11, planted_mu=mu)
        m2, bx, f, s1 = _pipeline(mins)
        f = add_outcomes(f, minute_matrix(m2, "open"), minute_matrix(m2, "close"), P.B, np.arange(m2.day.max() + 1))
        S, n = _signed(f, "A_POC", 15)
        if expect == "null":
            assert abs(S) < 0.06, (S, n)
        else:
            assert S > 0.15, (S, n)
        mk = Market(m2, bx, P.B, box_scales(bx)["sigma_b"].to_dict())
        tr, _ = run(mk, mk.state_matrix(f, "A"), P.K, "cont", "trail", GROSS)
        R = pd.DataFrame(tr)["R"].mean()
        if expect == "null":
            assert abs(R) < 0.12, R
        else:
            assert R > 0.15, R


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
