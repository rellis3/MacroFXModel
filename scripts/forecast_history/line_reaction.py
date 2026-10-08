"""LINE-REACTION — how price approaches the chosen forecast's lines and what it does next (forge/LINE_REACTION_PREREG.md).

Stages (run in order; each reads the previous one's output):
  lines    — the chosen forecast's walk-forward lines per session (persistence + IV where IV exists, else persistence),
             refit per fold exactly as forecast_pick.py. Writes chosen_lines.csv.
  events   — replays every session's M1 bars against those lines (and the ±0.1/0.2/0.3 σ placebo levels): first touch,
             lead-up features (approach, candle shape, tick volume, time, day) and the outcome. Writes events/<SYM>.parquet.
  analyse  — Stage A (rates, line vs placebo), B (feature terciles), C (walk-forward GBM / logit vs base, fade test,
             candle/volume ablations), D (approach-shape clusters). Writes results.json and RESULTS.md.

    PYTHONPATH=. python scripts/forecast_history/line_reaction.py                 # all stages, chosen lines
    PYTHONPATH=. python scripts/forecast_history/line_reaction.py --stage events --inst NQ GOLD
    PYTHONPATH=. python scripts/forecast_history/line_reaction.py --lines plain   # the plain export's pit lines

Inputs: analysis/output/forecast_history/<SYM>.csv (Step 0 table) and VolRangeForecaster/data/m1/<key>_m1.parquet.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))   # repo root, for `forge.*` (no PYTHONPATH needed, e.g. on Windows)

HIST = Path("analysis/output/forecast_history")
M1 = Path("VolRangeForecaster/data/m1")
OUT = Path("analysis/output/line_reaction")

RUNGS = ("p50", "p75", "p90")
SIDES = (("up", 1, "oh"), ("dn", -1, "ol"))
OFFSETS = (-0.3, -0.2, -0.1, 0.0, 0.1, 0.2, 0.3)
NEIGHBOUR = 0.2                     # |offset| >= this = placebo neighbours
K = 0.25                            # outcome threshold, σ
HORIZON = 120                       # minutes to resolve
T_MIN, T_MAX, SESSION_END = 60, 20 * 60, 22 * 60
EMBARGO = 5
M1_KEY = {"GOLD": "gold", "NQ": "nq", "SPX500": "spx500", "DOW": "us30", "US2000": "us2000", "DE30": "de30", "UK100": "uk100"}
# implied vol actually read by the live server (FORECAST_PICK_PREREG variant 1)
IV_LIVE = {"EURUSD": "ivd", "GBPUSD": "ivd", "AUDUSD": "ivd", "USDJPY": "ivd", "USDCAD": "ivd", "USDCHF": "ivd",
           "GOLD": "GVZ", "NQ": "VXN", "SPX500": "VIX", "DOW": "VIX", "US2000": "VIX", "DE30": "VIX", "UK100": "VIX"}

FEAT_GROUPS = {
    "budget": ["dist", "ext_opp", "used", "opp_hit"],
    "approach": ["spd15", "spd60", "eff60", "pull60", "probes"],
    "candle": ["c5a_body", "c5a_clv", "c5a_wick", "c5a_rng", "c5b_body", "c5b_clv", "c5b_wick", "c5b_rng",
               "c15_body", "c15_clv", "c15_wick", "c15_rng", "run5"],
    "volume": ["vrel15", "vrel5", "vtrend"],
    "time": ["tod", "sess_asia", "sess_ldn"],
    "day": ["regime", "res1", "iv_sig", "event_hi", "gap_sig", "weekday"],
}
FEATS = [f for g in FEAT_GROUPS.values() for f in g]


# ── stage 1: the lines ─────────────────────────────────────────────────────────────────────────────────────────────

def _klass(s):
    from forecast_record import klass
    return klass(s)


def _context(d: pd.DataFrame, base: str) -> pd.DataFrame:
    """regime / res1 the way forecast_fix builds them, for the plain-lines path (which does not import forecast_fix)."""
    s = d[base]
    d["regime"] = np.log(s / s.shift(1).rolling(250, min_periods=120).median())
    d["res1"] = np.log(d.r_hl.clip(lower=1e-6) / s).shift(1)
    return d


def lines_plain() -> pd.DataFrame:
    parts = []
    for f in sorted(HIST.glob("*.csv")):
        d = _context(pd.read_csv(f).sort_values("date").reset_index(drop=True), "pit_sig_used")
        d = d[(d.oos == 1) & (d.last_min >= 20 * 60)].copy()
        d["sig"] = d.pit_sig_used
        d["arm"] = "P"
        d["iv_sig"] = np.nan
        for q in ("oh", "ol"):
            for r in RUNGS:
                d[f"{q}_{r}"] = d[f"pit_{q}_{r}"]
        parts.append(d)
    X = pd.concat(parts, ignore_index=True)
    X["klass"] = X.inst.map(_klass)
    return X


def _livetype_iv(X: pd.DataFrame) -> pd.DataFrame:
    from forge.export_iv_adjusted_params import ivd
    from forge.run_combined_range import asof_before, cboe
    X["iv_sig"] = np.nan
    for inst, g in X.groupby("inst"):
        src = IV_LIVE.get(inst)
        if not src:
            continue
        iv = asof_before(pd.to_datetime(g.date), ivd(inst) if src == "ivd" else cboe(src))
        X.loc[g.index, "iv_sig"] = np.log(iv / (g.pit_sig_daily.to_numpy() * np.sqrt(252)))
    return X


def lines_chosen() -> pd.DataFrame:
    """forecast_pick.py's fold loop for the shipped pair (S, SI), keeping each test session's lines."""
    import forecast_fix as F
    X = _livetype_iv(F.load())
    folds = sorted(X[X.oos == 1].fold.unique())
    out = []
    for f in folds:
        te = X[(X.oos == 1) & (X.fold == f)].copy()
        prior = np.sort(X.loc[X.date < te.date.min(), "date"].unique())
        tr = X[X.date < prior[-F.EMBARGO]].copy()
        for arm, feats in (("S", F.FB), ("SI", F.FC)):
            tr[f"sig_{arm}"], te[f"sig_{arm}"] = np.nan, np.nan
            for cls in sorted(X.klass.unique()):
                trc = tr[(tr.klass == cls) & tr[feats].notna().all(axis=1)]
                mk = (te.klass == cls) & te[feats].notna().all(axis=1) & te.inst.isin(trc.inst.unique())
                if len(trc) < 500 or not mk.any():
                    continue
                b, mu = F.fit_beta(trc, feats)
                tr.loc[trc.index, f"sig_{arm}"] = F.apply_beta(trc, feats, b, mu)
                te.loc[mk, f"sig_{arm}"] = F.apply_beta(te[mk], feats, b, mu)
            ok = tr[f"sig_{arm}"].notna() & (tr[f"sig_{arm}"] > 0)
            w = F.widths(tr.loc[ok, f"sig_{arm}"].to_numpy(), tr[ok])
            for q in ("oh", "ol"):
                for r in RUNGS:
                    te[f"{arm}_{q}_{r}"] = te[f"sig_{arm}"] * w[(q, r)].reindex(te.inst).to_numpy()
        use_si = te.inst.isin(IV_LIVE.keys()) & te.sig_SI.notna() & te.SI_oh_p50.notna()
        te["arm"] = np.where(use_si, "SI", "S")
        te["sig"] = np.where(use_si, te.sig_SI, te.sig_S)
        for q in ("oh", "ol"):
            for r in RUNGS:
                te[f"{q}_{r}"] = np.where(use_si, te[f"SI_{q}_{r}"], te[f"S_{q}_{r}"])
        print(f"lines fold {f}: {len(te):,} sessions, SI on {int(use_si.sum()):,}", flush=True)
        out.append(te)
    return pd.concat(out, ignore_index=True)


LINE_COLS = ["inst", "date", "fold", "klass", "arm", "open", "sig", "regime", "res1", "iv_sig", "event", "gap"] + \
            [f"{q}_{r}" for q in ("oh", "ol") for r in RUNGS]


def stage_lines(mode: str):
    X = lines_chosen() if mode == "chosen" else lines_plain()
    X = X[X.sig > 0].dropna(subset=[f"{q}_{r}" for q in ("oh", "ol") for r in RUNGS])
    OUT.mkdir(parents=True, exist_ok=True)
    X[LINE_COLS].sort_values(["inst", "date"]).to_csv(OUT / f"{mode}_lines.csv", index=False)
    print(f"wrote {OUT / f'{mode}_lines.csv'}: {len(X):,} sessions, {X.inst.nunique()} instruments")


# ── stage 2: the replay ────────────────────────────────────────────────────────────────────────────────────────────

def load_m1(sym: str):
    p = M1 / f"{M1_KEY.get(sym, sym.lower())}_m1.parquet"
    df = pd.read_parquet(p)
    ts = "datetime" if "datetime" in df.columns else ("time" if "time" in df.columns else None)
    idx = pd.to_datetime(df[ts], utc=True) if ts else pd.to_datetime(df.index, utc=True)
    loc = pd.DatetimeIndex(idx).tz_convert("Europe/London")
    vol = df["volume"].to_numpy(float) if "volume" in df.columns else np.zeros(len(df))
    m = pd.DataFrame({"date": loc.strftime("%Y-%m-%d"), "min": (loc.hour * 60 + loc.minute).to_numpy(),
                      "o": df["open"].to_numpy(float), "h": df["high"].to_numpy(float), "l": df["low"].to_numpy(float),
                      "c": df["close"].to_numpy(float), "v": np.nan_to_num(vol)})
    m = m[m["min"] < SESSION_END].sort_values(["date", "min"], kind="stable").reset_index(drop=True)
    days = {}
    starts = np.flatnonzero(np.r_[True, m.date.to_numpy()[1:] != m.date.to_numpy()[:-1]])
    ends = np.r_[starts[1:], len(m)]
    for a, b in zip(starts, ends):
        days[m.date.iat[a]] = (a, b)
    # tick volume on a minute grid per session date (for the time-of-day normalisation)
    dates = sorted(days)
    grid = np.zeros((len(dates), SESSION_END + 1))
    for i, dt in enumerate(dates):
        a, b = days[dt]
        np.add.at(grid[i], m["min"].to_numpy()[a:b] + 1, m.v.to_numpy()[a:b])
    cs = np.cumsum(grid, axis=1)                   # cs[i, k] = volume of minutes < k
    return m, days, {d: i for i, d in enumerate(dates)}, cs


def _win(cs_row, a, b):
    a, b = max(a, 0), max(b, 0)
    return cs_row[b] - cs_row[a] if b > a else np.nan


def _vol_rel(cs, di, a, b):
    """Volume in minutes [a, b) ÷ median of the same clock window over the previous 20 sessions."""
    now = _win(cs[di], a, b)
    if di < 5 or not np.isfinite(now):
        return np.nan
    ref = np.median([_win(cs[j], a, b) for j in range(max(0, di - 20), di)])
    return now / ref if ref > 0 else np.nan


def _candle(O, H, L, C, mins, t, a, b, s, sigp):
    """Shape of the candle built from bars with minute in [a, b) and index < t, signed toward the level."""
    i0, i1 = np.searchsorted(mins[:t], a, "left"), np.searchsorted(mins[:t], b, "left")
    if i1 <= i0:
        return (np.nan,) * 4
    o, h, l, c = O[i0], H[i0:i1].max(), L[i0:i1].min(), C[i1 - 1]
    rng = h - l
    if rng <= 0:
        return 0.0, 0.0, 0.0, 0.0
    wick = (h - max(o, c)) / rng if s > 0 else (min(o, c) - l) / rng
    return s * (c - o) / rng, s * ((c - l) - (h - c)) / rng, wick, rng / sigp


def _first_touch(chi, clo, s, lv):
    if s > 0:
        k = np.searchsorted(chi, lv, "left")
    else:
        k = np.searchsorted(-clo, -lv, "left")
    return int(k) if k < len(chi) else None


def day_events(row, bars, cs, di):
    mins, O, H, L, C = (bars[x] for x in ("min", "o", "h", "l", "c"))
    o_, sig = float(row.open), float(row.sig)
    sigp = o_ * sig / 100
    chi, clo = np.maximum.accumulate(H), np.minimum.accumulate(L)
    out, skipped = [], {"early": 0, "late": 0, "no_leadup": 0}
    wd = pd.Timestamp(row.date).dayofweek
    gap_sig = row.gap / sig if pd.notna(row.gap) else np.nan
    event_hi = float(str(row.event) in ("high", "FOMC", "NFP", "CPI"))       # scripts/v4/calendarProxy.mjs tags

    for side, s, q in SIDES:
        opp_q = "ol" if q == "oh" else "oh"
        opp_t = _first_touch(chi, clo, -s, o_ * (1 - s * row[f"{opp_q}_p50"] / 100))
        for r in RUNGS:
            pct = row[f"{q}_{r}"]
            nxt_pct = row[f"{q}_p75"] if r == "p50" else row[f"{q}_p90"] if r == "p75" else 2 * row[f"{q}_p90"] - row[f"{q}_p75"]
            for off in OFFSETS:
                lv = o_ * (1 + s * pct / 100) + s * off * sigp
                if s * (lv - o_) <= 0:
                    continue
                t = _first_touch(chi, clo, s, lv)
                if t is None:
                    continue
                m = int(mins[t])
                if m < T_MIN:
                    skipped["early"] += 1
                    continue
                if m > T_MAX:
                    skipped["late"] += 1
                    continue
                if t == 0:                       # session's first bar starts after 01:00 (data gap): no lead-up to measure
                    skipped["no_leadup"] += 1
                    continue
                thr = s * ((H if s > 0 else L) - lv) / sigp          # beyond the level (+)
                back = s * ((L if s > 0 else H) - lv) / sigp         # back toward the open (−)
                xc = s * (C - lv) / sigp
                end = int(np.searchsorted(mins, m + HORIZON, "right"))
                end60 = int(np.searchsorted(mins, m + 60, "right"))
                instant = int(thr[t] >= K)
                if instant:
                    outcome, t_res = "break", 0
                else:
                    wb, wr = thr[t + 1:end] >= K, back[t + 1:end] <= -K
                    ib = int(np.argmax(wb)) if wb.any() else 10 ** 9
                    ir = int(np.argmax(wr)) if wr.any() else 10 ** 9
                    if ib == ir == 10 ** 9:
                        outcome, t_res = "timeout", np.nan
                    elif ib < ir:
                        outcome, t_res = "break", int(mins[t + 1 + ib]) - m
                    elif ir < ib:
                        outcome, t_res = "reject", int(mins[t + 1 + ir]) - m
                    else:
                        outcome, t_res = "ambiguous", int(mins[t + 1 + ib]) - m
                nxt = o_ * (1 + s * nxt_pct / 100) + s * off * sigp
                reach_next = int((H[t:] >= nxt).any() if s > 0 else (L[t:] <= nxt).any())
                x_h = float(xc[end - 1])

                # ── lead-up features: bars [0, t) only ──
                ext_opp = max(0.0, (o_ - L[:t].min()) / sigp if s > 0 else (H[:t].max() - o_) / sigp)
                dist = s * (lv - o_) / sigp

                def px_before(minute):
                    k = int(np.searchsorted(mins[:t], minute, "left")) - 1
                    return C[k] if k >= 0 else o_

                spd15 = s * (lv - px_before(m - 15)) / sigp
                spd60 = s * (lv - px_before(m - 60)) / sigp
                a60 = int(np.searchsorted(mins[:t], m - 60, "left"))
                cc = np.r_[px_before(m - 60), C[a60:t]]
                path = np.abs(np.diff(cc)).sum()
                eff60 = abs(cc[-1] - cc[0]) / path if path > 0 else np.nan
                if t > a60:
                    if s > 0:
                        pull60 = float((np.maximum.accumulate(H[a60:t]) - L[a60:t]).max() / sigp)
                    else:
                        pull60 = float((H[a60:t] - np.minimum.accumulate(L[a60:t])).max() / sigp)
                else:
                    pull60 = np.nan
                early = mins[:t] < m - 15
                near = (s * ((H[:t] if s > 0 else L[:t]) - lv) >= -0.1 * sigp) & early
                probes = len(np.unique(mins[:t][near] // 15))
                b5, b15 = (m // 5) * 5, (m // 15) * 15
                c5a = _candle(O, H, L, C, mins, t, b5 - 5, b5, s, sigp)
                c5b = _candle(O, H, L, C, mins, t, b5 - 10, b5 - 5, s, sigp)
                c15 = _candle(O, H, L, C, mins, t, b15 - 15, b15, s, sigp)
                run5 = 0
                for j in range(12):
                    body = _candle(O, H, L, C, mins, t, b5 - 5 * (j + 1), b5 - 5 * j, s, sigp)[0]
                    if not (body > 0):
                        break
                    run5 += 1
                v15 = _win(cs[di], m - 15, m)
                v45 = _win(cs[di], m - 60, m - 15)
                shape = [s * (px_before(m - 60 + 5 * j) - lv) / sigp for j in range(1, 13)]

                out.append({
                    "inst": row.inst, "date": row.date, "fold": int(row.fold), "klass": row.klass, "side": side,
                    "rung": r, "offset": off, "minute": m, "outcome": outcome, "instant": instant, "t_res": t_res,
                    "back60": float(-back[t + 1:end60].min()) if end60 > t + 1 else np.nan,
                    "beyond60": float(thr[t:end60].max()), "x60": float(xc[end60 - 1]), "x_h": x_h,
                    "x_close": float(xc[-1]), "reach_next": reach_next,
                    "dist": dist, "ext_opp": ext_opp, "used": dist + ext_opp,
                    "opp_hit": float(opp_t is not None and opp_t < t),
                    "spd15": spd15, "spd60": spd60, "eff60": eff60, "pull60": pull60, "probes": probes,
                    **{f"c5a_{k}": v for k, v in zip(("body", "clv", "wick", "rng"), c5a)},
                    **{f"c5b_{k}": v for k, v in zip(("body", "clv", "wick", "rng"), c5b)},
                    **{f"c15_{k}": v for k, v in zip(("body", "clv", "wick", "rng"), c15)},
                    "run5": run5,
                    "vrel15": _vol_rel(cs, di, m - 15, m), "vrel5": _vol_rel(cs, di, b5 - 5, b5),
                    "vtrend": v15 / (v45 / 3) if (v45 and v45 > 0) else np.nan,
                    "tod": m, "sess_asia": float(m < 7 * 60), "sess_ldn": float(7 * 60 <= m < 12 * 60),
                    "regime": row.regime, "res1": row.res1, "iv_sig": row.iv_sig, "event_hi": event_hi,
                    "gap_sig": gap_sig, "weekday": wd,
                    **{f"path{j}": v for j, v in enumerate(shape)},
                })
    return out, skipped


def stage_events(mode: str, insts):
    lines = pd.read_csv(OUT / f"{mode}_lines.csv")
    ev_dir = OUT / f"events_{mode}"
    ev_dir.mkdir(parents=True, exist_ok=True)
    for inst, g in lines.groupby("inst"):
        if insts and inst not in insts:
            continue
        try:
            m, days, di_of, cs = load_m1(inst)
        except FileNotFoundError:
            print(f"{inst}: no M1 parquet, skipped")
            continue
        rows, skip, missing = [], {"early": 0, "late": 0, "no_leadup": 0}, 0
        cols = {x: m[x].to_numpy() for x in ("min", "o", "h", "l", "c")}
        for row in g.itertuples(index=False):
            if row.date not in days:
                missing += 1
                continue
            a, b = days[row.date]
            bars = {x: v[a:b] for x, v in cols.items()}
            if len(bars["min"]) < 60:
                missing += 1
                continue
            ev, sk = day_events(pd.Series(row._asdict()), bars, cs, di_of[row.date])
            rows += ev
            for k in sk:
                skip[k] += sk[k]
        E = pd.DataFrame(rows)
        E.to_parquet(ev_dir / f"{inst}.parquet", index=False)
        n0 = int((E.offset == 0).sum()) if len(E) else 0
        print(f"{inst}: {len(g):,} sessions ({missing} without M1), {len(E):,} encounters ({n0:,} at the line), "
              f"outside window {skip}", flush=True)


# ── stage 3: analysis ──────────────────────────────────────────────────────────────────────────────────────────────

class Boot:
    """Date-block bootstrap over the encounter dates (forecast_record.boot_weights: stationary, block 20, 2,000 reps)."""

    def __init__(self, dates):
        from forecast_record import boot_weights
        self.dates = np.sort(pd.unique(dates))
        self.W = boot_weights(len(self.dates))
        self.idx = pd.Series(np.arange(len(self.dates)), index=self.dates)

    def sums(self, dates, x):
        return np.bincount(self.idx[dates].to_numpy(), weights=x, minlength=len(self.dates))

    def ratio(self, d_num, num, d_den, den):
        a, b = self.sums(d_num, num), self.sums(d_den, den)
        reps = (self.W @ a) / (self.W @ b)
        return [_r(a.sum() / b.sum()), *[_r(v) for v in np.nanpercentile(reps, [2.5, 97.5])]], reps

    def rate(self, sub, col_num):
        return self.ratio(sub.date, sub[col_num].to_numpy(float), sub.date, np.ones(len(sub)))

    def mean(self, dates, x):
        return self.ratio(dates, x, dates, np.ones(len(x)))


def _r(x, k=4):
    return None if x is None or not np.isfinite(x) else round(float(x), k)


def _p_from_reps(reps):
    reps = reps[np.isfinite(reps)]
    return float(min(1.0, 2 * min((reps <= 0).mean(), (reps >= 0).mean()))) if len(reps) else 1.0


def holm(ps):
    order = np.argsort(ps)
    adj = np.empty(len(ps))
    run = 0.0
    for k, i in enumerate(order):
        run = max(run, (len(ps) - k) * ps[i])
        adj[i] = min(1.0, run)
    return adj


def stage_a(E, bs):
    res = {}
    E = E.assign(rej=(E.outcome == "reject").astype(float), brk=(E.outcome == "break").astype(float),
                 tmo=(E.outcome == "timeout").astype(float), amb=(E.outcome == "ambiguous").astype(float))
    R = E[E.outcome.isin(["reject", "break"])]
    for rung in RUNGS:
        cell = {}
        for off in OFFSETS:
            e, rr = E[(E.rung == rung) & (E.offset == off)], R[(R.rung == rung) & (R.offset == off)]
            if not len(rr):
                continue
            cell[str(off)] = {"n": int(len(e)), "resolved": int(len(rr)),
                              "p_reject": bs.rate(rr, "rej")[0], "timeout": _r(e.tmo.mean()), "ambiguous": _r(e.amb.mean()),
                              "instant_break": _r(e.instant.mean()), "p_next": bs.rate(e, "reach_next")[0],
                              "by_class": {c: _r(g.rej.mean()) for c, g in rr.groupby("klass")}}
        line = R[(R.rung == rung) & (R.offset == 0)]
        nb = R[(R.rung == rung) & (R.offset.abs() >= NEIGHBOUR - 1e-9)]
        if len(line) and len(nb):
            a, ra = bs.rate(line, "rej")
            b, rb = bs.rate(nb, "rej")
            diff = ra - rb
            ci = [_r(a[0] - b[0]), *[_r(v) for v in np.nanpercentile(diff, [2.5, 97.5])]]
            cell["line_minus_neighbours"] = {"p_reject": ci, "q1_pass": bool(ci[1] > 0 or ci[2] < 0)}
        res[rung] = cell
    return res


def stage_b(E, bs):
    R = E[E.outcome.isin(["reject", "break"])].assign(rej=lambda d: (d.outcome == "reject").astype(float))
    cells, ps = [], []
    for rung in RUNGS:
        line = R[(R.rung == rung) & (R.offset == 0)]
        nb = R[(R.rung == rung) & (R.offset.abs() >= NEIGHBOUR - 1e-9)]
        for f in FEATS:
            x = line[f].dropna()
            if x.nunique() < 3 or len(x) < 300:
                continue
            lo, hi = np.nanpercentile(x, [100 / 3, 200 / 3])
            if lo == hi:
                continue

            def spread(d):
                top, bot = d[d[f] > hi], d[d[f] <= lo]
                if not len(top) or not len(bot):
                    return None, np.full(bs.W.shape[0], np.nan)
                a, ra = bs.rate(top, "rej")
                b, rb = bs.rate(bot, "rej")
                return a[0] - b[0], ra - rb

            pt, rl = spread(line)
            pn, rn = spread(nb)
            if pt is None:
                continue
            ci = lambda v: [_r(v[0]), *[_r(z) for z in np.nanpercentile(v[1], [2.5, 97.5])]]
            c = {"rung": rung, "feature": f, "cuts": [_r(lo), _r(hi)], "n": int(line[f].notna().sum()),
                 "line_top_minus_bottom": ci((pt, rl))}
            if pn is not None:
                c["neighbours_top_minus_bottom"] = ci((pn, rn))
                c["line_minus_neighbours"] = ci((pt - pn, rl - rn))
            cells.append(c)
            ps.append(_p_from_reps(rl))
    for c, p in zip(cells, holm(np.array(ps)) if ps else []):
        c["p_holm"] = _r(p)
    return sorted(cells, key=lambda c: c["p_holm"])


def _design(df, cols):
    base = pd.get_dummies(df[["rung", "side", "klass"]].astype(str), dtype=float)
    return pd.concat([base.reset_index(drop=True), df[cols].reset_index(drop=True).astype(float)], axis=1)


def _xy(tr, te, cols):
    """Train / test design matrices with the same columns; a column with no values in training is dropped."""
    Xtr = _design(tr, cols)
    Xtr = Xtr.loc[:, Xtr.notna().any()]
    return Xtr, _design(te, cols).reindex(columns=Xtr.columns, fill_value=0.0)


def _logloss(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def _pnl(df):
    """Fade at the level, units of K: reject +1, break / ambiguous −1, timeout = mark-to-market at the horizon."""
    return np.select([df.outcome == "reject", df.outcome.isin(["break", "ambiguous"])], [1.0, -1.0],
                     np.clip(-df.x_h.to_numpy() / K, -1, 1))


def walk_forward(E, all_dates, label):
    """Stage C on one population (the line, or the neighbour placebos). Returns test rows with predictions."""
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.impute import SimpleImputer

    R = E[E.outcome.isin(["reject", "break", "timeout", "ambiguous"])].copy()
    R["y"] = (R.outcome == "reject").astype(int)
    R["resolved"] = R.outcome.isin(["reject", "break"])
    R["pnl"] = _pnl(R)
    all_dates = np.sort(all_dates)
    folds = sorted(R.fold.unique())[1:]
    gbm = lambda: HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=300, min_samples_leaf=200,
                                                 random_state=0)
    out = []
    for f in folds:
        te = R[R.fold == f].copy()
        if not len(te):
            continue
        start = te.date.min()
        prior = all_dates[all_dates < start]
        if len(prior) <= EMBARGO:
            continue
        tr = R[(R.date < prior[-EMBARGO]) & R.resolved]
        if tr.y.nunique() < 2 or len(tr) < 1000:
            continue
        Xtr_b, Xte_b = _xy(tr, te, [])
        base = LogisticRegression(C=1.0, max_iter=2000).fit(Xtr_b, tr.y)
        te["p_base"] = base.predict_proba(Xte_b)[:, 1]
        Xtr, Xte = _xy(tr, te, FEATS)
        lg = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(C=1.0, max_iter=3000)).fit(Xtr, tr.y)
        te["p_logit"] = lg.predict_proba(Xte)[:, 1]
        g = gbm().fit(Xtr, tr.y)
        te["p_gbm"] = g.predict_proba(Xte)[:, 1]
        p_tr = g.predict_proba(Xtr)[:, 1]
        te["thr_hi"], te["thr_lo"] = np.percentile(p_tr, 80), np.percentile(p_tr, 20)
        for grp in ("candle", "volume"):
            keep = [c for c in FEATS if c not in FEAT_GROUPS[grp]]
            Xtr_g, Xte_g = _xy(tr, te, keep)
            te[f"p_no_{grp}"] = gbm().fit(Xtr_g, tr.y).predict_proba(Xte_g)[:, 1]
        # grouped permutation importance (resolved test rows), descriptive
        rs = te.resolved.to_numpy()
        if rs.sum() > 200:
            rng = np.random.default_rng(0)
            Xr, yr = Xte[rs].copy(), te.y.to_numpy()[rs]
            ll0 = _logloss(yr, g.predict_proba(Xr)[:, 1]).mean()
            for grp, cols in FEAT_GROUPS.items():
                cols = [c for c in cols if c in Xr.columns]
                Xp = Xr.copy()
                perm = rng.permutation(len(Xp))
                Xp[cols] = Xp[cols].to_numpy()[perm]
                te.loc[:, f"imp_{grp}"] = _logloss(yr, g.predict_proba(Xp)[:, 1]).mean() - ll0
        print(f"[{label}] fold {f}: train {len(tr):,} resolved, test {len(te):,}", flush=True)
        out.append(te)
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def score_c(T, bs):
    if not len(T):
        return {"note": "no test rows"}
    Rv = T[T.resolved]
    y = Rv.y.to_numpy()
    ll = {k: _logloss(y, Rv[f"p_{k}"].to_numpy()) for k in ("base", "logit", "gbm", "no_candle", "no_volume")}
    res = {"test_rows": int(len(T)), "resolved": int(len(Rv)), "folds": sorted(int(f) for f in T.fold.unique())}
    for k in ("logit", "gbm"):
        res[f"{k}_logloss_vs_base"] = bs.ratio(Rv.date, ll[k], Rv.date, ll["base"])[0]
    for grp in ("candle", "volume"):
        ci = bs.ratio(Rv.date, ll["gbm"], Rv.date, ll[f"no_{grp}"])[0]
        res[f"{grp}_adds"] = {"gbm_full_vs_without": ci, "adds_information": bool(ci[2] is not None and ci[2] < 1)}
    res["permutation_importance"] = {g: _r(T.groupby("fold")[f"imp_{g}"].first().mean(), 5)
                                     for g in FEAT_GROUPS if f"imp_{g}" in T}

    def trades(sel, sign):
        d = T[sel]
        if not len(d):
            return {"n": 0}
        x = sign * d.pnl.to_numpy()
        ci = bs.mean(d.date, x)[0]
        by = {int(f): _r(sign * g.pnl.mean()) for f, g in d.groupby("fold")}
        return {"n": int(len(d)), "mean_K": ci, "breakeven_cost_sigma": _r(ci[0] * K), "by_fold": by,
                "positive_folds": int(sum(v > 0 for v in by.values() if v is not None))}

    res["fade_all"] = trades(np.ones(len(T), bool), 1)
    res["fade_top_quintile"] = trades((T.p_gbm >= T.thr_hi).to_numpy(), 1)
    res["follow_bottom_quintile"] = trades((T.p_gbm <= T.thr_lo).to_numpy(), -1)
    g = res["gbm_logloss_vs_base"]
    t = res["fade_top_quintile"]
    res["q2_checks"] = {"logloss_ci_below_0.99": bool(g[2] is not None and g[2] < 0.99),
                        "fade_ci_above_0": bool(t.get("n") and t["mean_K"][1] is not None and t["mean_K"][1] > 0),
                        "positive_in_4_of_5_folds": bool(t.get("n") and t["positive_folds"] >= 4)}
    res["q2_pass"] = all(res["q2_checks"].values())
    return res


def stage_d(E, bs):
    from sklearn.cluster import KMeans
    R = E[(E.offset == 0) & E.outcome.isin(["reject", "break"])].assign(rej=lambda d: (d.outcome == "reject").astype(float))
    P = [f"path{j}" for j in range(12)]
    R = R.dropna(subset=P)
    tr, te = R[R.fold <= 2], R[R.fold >= 3]
    if len(tr) < 600 or not len(te):
        return {"note": "too few encounters"}
    km = KMeans(n_clusters=6, n_init=10, random_state=0).fit(tr[P].clip(-5, 5))
    te = te.assign(cl=km.predict(te[P].clip(-5, 5)))
    out = {"overall_test": bs.rate(te, "rej")[0], "clusters": {}}
    for c in range(6):
        d = te[te.cl == c]
        if len(d):
            out["clusters"][c] = {"centre_sigma": [_r(v, 2) for v in km.cluster_centers_[c]], "n_test": int(len(d)),
                                  "p_reject": bs.rate(d, "rej")[0]}
    return out


def stage_analyse(mode: str):
    ev_dir = OUT / f"events_{mode}"
    E = pd.concat([pd.read_parquet(p) for p in sorted(ev_dir.glob("*.parquet"))], ignore_index=True)
    lines = pd.read_csv(OUT / f"{mode}_lines.csv", usecols=["date"])
    bs = Boot(E.date)
    res = {"mode": mode, "encounters": int(len(E)), "at_line": int((E.offset == 0).sum()),
           "instruments": int(E.inst.nunique()), "dates": int(E.date.nunique()),
           "outcomes_at_line": E[E.offset == 0].outcome.value_counts().to_dict()}
    print("stage A", flush=True)
    res["A"] = stage_a(E, bs)
    print("stage B", flush=True)
    res["B"] = stage_b(E, bs)
    print("stage C", flush=True)
    all_dates = lines.date.unique()
    TL = walk_forward(E[E.offset == 0], all_dates, "line")
    TN = walk_forward(E[E.offset.abs() >= NEIGHBOUR - 1e-9], all_dates, "neighbours")
    res["C"] = {"line": score_c(TL, bs), "neighbours": score_c(TN, bs)}
    print("stage D", flush=True)
    res["D"] = stage_d(E, bs)
    (OUT / f"results_{mode}.json").write_text(json.dumps(res, indent=1, default=str))
    write_md(res, mode)


def _ci(c):
    return "—" if not c or c[0] is None else f"{c[0]:.3f} [{c[1]:.3f}, {c[2]:.3f}]"


def write_md(res, mode):
    md = [f"# LINE-REACTION — results ({mode} lines)", "",
          f"Pre-registration: `forge/LINE_REACTION_PREREG.md`. {res['encounters']:,} encounters "
          f"({res['at_line']:,} at the line, the rest placebo levels), {res['instruments']} instruments, {res['dates']:,} dates. "
          f"K = {K} σ, horizon {HORIZON} min. 95% date-block intervals.", "",
          "## A — P(reject | resolved) by offset from the line (σ)", "",
          "| rung | " + " | ".join(f"{o:+.1f}" for o in OFFSETS) + " | line − neighbours | Q1 |",
          "|---|" + "---|" * (len(OFFSETS) + 2)]
    for rung, cell in res["A"].items():
        row = [_ci(cell.get(str(o), {}).get("p_reject")) for o in OFFSETS]
        lm = cell.get("line_minus_neighbours", {})
        md.append(f"| {rung} | " + " | ".join(row) + f" | {_ci(lm.get('p_reject'))} | "
                  f"{'pass' if lm.get('q1_pass') else 'no'} |")
    md += ["", "| rung | n at line | timeout | instant break | P(next rung) |", "|---|---|---|---|---|"]
    for rung, cell in res["A"].items():
        c = cell.get("0.0", {})
        if c:
            md.append(f"| {rung} | {c['n']:,} | {c['timeout']} | {c['instant_break']} | {_ci(c['p_next'])} |")
    md += ["", "## B — strongest single features (top − bottom tercile of P(reject), Holm-adjusted)", "",
           "| rung | feature | at line | at neighbours | line − neighbours | p (Holm) |", "|---|---|---|---|---|---|"]
    for c in res["B"][:25]:
        md.append(f"| {c['rung']} | {c['feature']} | {_ci(c['line_top_minus_bottom'])} | "
                  f"{_ci(c.get('neighbours_top_minus_bottom'))} | {_ci(c.get('line_minus_neighbours'))} | {c['p_holm']} |")
    md += ["", "## C — walk-forward (test folds 1–5)", ""]
    for pop in ("line", "neighbours"):
        c = res["C"][pop]
        if "note" in c:
            md += [f"**{pop}:** {c['note']}", ""]
            continue
        md += [f"### {pop}", "",
               f"- log-loss ÷ base: GBM {_ci(c['gbm_logloss_vs_base'])}, logit {_ci(c['logit_logloss_vs_base'])}",
               f"- candle shape adds information: {c['candle_adds']['adds_information']} (GBM full ÷ without {_ci(c['candle_adds']['gbm_full_vs_without'])})",
               f"- volume adds information: {c['volume_adds']['adds_information']} (GBM full ÷ without {_ci(c['volume_adds']['gbm_full_vs_without'])})",
               "- permutation importance (log-loss increase): " + ", ".join(f"{k} {v}" for k, v in c["permutation_importance"].items())]
        for k in ("fade_all", "fade_top_quintile", "follow_bottom_quintile"):
            t = c[k]
            if t.get("n"):
                md.append(f"- {k.replace('_', ' ')}: n {t['n']:,}, mean {_ci(t['mean_K'])} K, break-even cost "
                          f"{t['breakeven_cost_sigma']} σ, positive folds {t['positive_folds']}/{len(t['by_fold'])}")
        if pop == "line":
            md.append(f"- **Q2: {'PASS' if c['q2_pass'] else 'FAIL'}** {c['q2_checks']}")
        md.append("")
    d = res["D"]
    md += ["## D — approach shapes (exploratory)", ""]
    if "clusters" in d:
        md.append(f"Folds 3–5 overall P(reject) {_ci(d['overall_test'])}.")
        md += ["", "| cluster | n | P(reject) | lead-up (σ from level, −60 → −5 min) |", "|---|---|---|---|"]
        for k, v in d["clusters"].items():
            md.append(f"| {k} | {v['n_test']:,} | {_ci(v['p_reject'])} | {' '.join(str(x) for x in v['centre_sigma'])} |")
    else:
        md.append(d.get("note", ""))
    (OUT / f"RESULTS_{mode}.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[:20]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["lines", "events", "analyse", "all"], default="all")
    ap.add_argument("--lines", choices=["chosen", "plain"], default="chosen")
    ap.add_argument("--inst", nargs="*", default=None)
    a = ap.parse_args()
    if a.stage in ("lines", "all"):
        stage_lines(a.lines)
    if a.stage in ("events", "all"):
        stage_events(a.lines, set(a.inst) if a.inst else None)
    if a.stage in ("analyse", "all"):
        stage_analyse(a.lines)


if __name__ == "__main__":
    main()
