"""
Study 5 - SESSION VWAP (anchored at the daily open) AND ITS BANDS.

  vwap_t   = cumulative sum(typical price x tick volume) / cumulative volume
  sigma_t  = volume-weighted std of typical price around vwap_t
  z_t      = (close - vwap) / sigma

Questions:
  1. Reversion: after the first touch of +/-1 sigma (or 2 sigma) at least 30
     minutes into the day, how often does price come back to VWAP within
     60 / 120 minutes / by the end of the day?  Baseline: same question for
     a random bar (unconditional return-to-VWAP rate).
  2. "Push away": price at |z| >= 1.5 at minute 60 / 120 -> does the day close
     further from VWAP (trend day) or back at/through it (balance day)?
  3. "VWAP bounce": after being >= 1.5 sigma away, price returns to VWAP -
     race +1 sigma (bounce, continuation) vs -1 sigma (failure).
  4. Position vs VWAP at London open (07:00 UK) / NY open (14:30 UK) ->
     direction of the rest of the day.
  5. Sims: fade 2 sigma to VWAP (stop 3.5 sigma), and the VWAP-bounce trade.
"""
from __future__ import annotations
import numpy as np
from .data import Days, INSTRUMENTS, vol_regime
from .stats import prop_ci, summarize, trade_stats, binom_p


def session_vwap(h, l, c, v):
    tp = (h + l + c) / 3.0
    vv = np.where(v > 0, v, 1.0)
    cv = np.cumsum(vv); cpv = np.cumsum(tp * vv); cpv2 = np.cumsum(tp * tp * vv)
    vwap = cpv / cv
    var = np.maximum(cpv2 / cv - vwap * vwap, 0.0)
    sigma = np.sqrt(var)
    return vwap, sigma


def _first_idx(mask, start=0):
    idx = np.flatnonzero(mask[start:])
    return start + int(idx[0]) if idx.size else None


def vwap_study(days: Days, pair: str, min_sigma_adr=0.04, min_minute=60) -> dict:
    """Band events only count once sigma >= min_sigma_adr x ADR and at least
    min_minute minutes into the day - earlier the bands are so tight that a
    'stop at 3.5 sigma' is smaller than the spread."""
    cost = INSTRUMENTS[pair]["cost"]
    rev = {1.0: {"n": 0, "back60": 0, "back120": 0, "back_eod": 0}, 2.0: {"n": 0, "back60": 0, "back120": 0, "back_eod": 0}}
    base = {"n": 0, "back60": 0, "back120": 0, "back_eod": 0}
    push = {60: {"n": 0, "further": 0, "through": 0}, 120: {"n": 0, "further": 0, "through": 0}, 240: {"n": 0, "further": 0, "through": 0}}
    bounce = {"n": 0, "win": 0, "sims": [], "cost": [], "null": []}
    fade = {"sims": [], "cost": []}
    london = {"n": 0, "agree": 0}; ny = {"n": 0, "agree": 0}
    z_at = {60: [], 120: [], 240: []}
    slope_agree = {"n": 0, "agree": 0}
    rng = np.random.default_rng(7)
    by_year = {}
    for i in range(days.n):
        if not days.valid(i) or days.is_weekend_day(i):
            continue
        o, h, l, c, v, ms = days.arrays(i)
        lh = days.london_hours(i)
        vwap, sigma = session_vwap(h, l, c, v)
        n = len(c)
        if n < 300:
            continue
        ok = sigma > 0
        z = np.where(ok, (c - vwap) / np.where(ok, sigma, 1), 0.0)
        yr = int(days.year[i]); by_year.setdefault(yr, {"fade": [], "bounce": []})
        # 1. reversion after first touch of +/-k sigma, at least 30 minutes in
        start = int(np.searchsorted(ms, min_minute))
        adr = days.adr20[i]
        usable = sigma >= min_sigma_adr * adr
        for k in rev:
            j = _first_idx((np.abs(z) >= k) & usable, start)
            if j is None or j >= n - 5:
                continue
            side = np.sign(z[j])
            # back to VWAP: close crosses vwap (side-adjusted)
            crossed = (side * (c[j + 1:] - vwap[j + 1:]) <= 0)
            b = _first_idx(crossed)
            rev[k]["n"] += 1
            if b is not None:
                t = ms[j + 1 + b] - ms[j]
                rev[k]["back_eod"] += 1; rev[k]["back60"] += int(t <= 60); rev[k]["back120"] += int(t <= 120)
            if k == 2.0:
                # fade sim: enter at bar j close against side, stop at 3.5 sigma (fixed at entry), target vwap (fixed at entry)
                entry = c[j]; stop = vwap[j] + side * 3.5 * sigma[j]; tgt = vwap[j]
                risk = abs(stop - entry)
                if risk > 0:
                    hh = h[j + 1:]; ll = l[j + 1:]
                    if side > 0:
                        ti = _first_idx(ll <= tgt); si = _first_idx(hh >= stop)
                    else:
                        ti = _first_idx(hh >= tgt); si = _first_idx(ll <= stop)
                    ti = np.inf if ti is None else ti; si = np.inf if si is None else si
                    if ti == np.inf and si == np.inf:
                        pnl = (c[-1] - entry) * -side
                    elif ti <= si:
                        pnl = abs(tgt - entry)
                    else:
                        pnl = -risk
                    r = (pnl - cost) / risk
                    fade["sims"].append(r); fade["cost"].append(cost / risk); by_year[yr]["fade"].append(r)
        # baseline: random bar at least 30 min in, how long to cross vwap
        j = int(rng.integers(start, n - 5))
        side = np.sign(c[j] - vwap[j]) or 1
        b = _first_idx(side * (c[j + 1:] - vwap[j + 1:]) <= 0)
        base["n"] += 1
        if b is not None:
            t = ms[j + 1 + b] - ms[j]
            base["back_eod"] += 1; base["back60"] += int(t <= 60); base["back120"] += int(t <= 120)
        # 2. push-away at minute 60/120/240
        for m in push:
            j = int(np.searchsorted(ms, m))
            if j >= n - 30:
                continue
            z_at[m].append(float(z[j]))
            if abs(z[j]) >= 1.5:
                push[m]["n"] += 1
                side = np.sign(z[j])
                end_dist = side * (c[-1] - vwap[-1])
                push[m]["further"] += int(end_dist > side * (c[j] - vwap[j]))
                push[m]["through"] += int(end_dist <= 0)
        # 3. VWAP bounce: first time |z|>=1.5 (after 30 min), then first return to vwap; race +1 sigma vs -1 sigma
        j = _first_idx((np.abs(z) >= 1.5) & usable, start)
        if j is not None:
            side = np.sign(z[j])
            b = _first_idx(side * (l[j + 1:] - vwap[j + 1:]) <= 0) if side > 0 else _first_idx(side * (h[j + 1:] - vwap[j + 1:]) <= 0)
            if b is not None:
                jb = j + 1 + b
                if jb < n - 5:
                    sig = sigma[jb]; vw = vwap[jb]
                    up_t = vw + sig; dn_t = vw - sig
                    hh = h[jb + 1:]; ll = l[jb + 1:]
                    iu = _first_idx(hh >= up_t); idn = _first_idx(ll <= dn_t)
                    iu = np.inf if iu is None else iu; idn = np.inf if idn is None else idn
                    if not (iu == np.inf and idn == np.inf):
                        bounce["n"] += 1
                        win = (iu < idn) if side > 0 else (idn < iu)
                        bounce["win"] += int(win)
                        d_with = abs((up_t if side > 0 else dn_t) - c[jb]); d_against = abs(c[jb] - (dn_t if side > 0 else up_t))
                        bounce["null"].append(d_against / max(d_with + d_against, 1e-12))
                        # sim: enter at vwap (jb close ~ vwap), stop 1 sigma against, target 1 sigma with
                        entry = c[jb]; risk = abs(entry - (dn_t if side > 0 else up_t)); reward = abs((up_t if side > 0 else dn_t) - entry)
                        if risk > 0:
                            pnl = reward if win else -risk
                            r = (pnl - cost) / risk
                            bounce["sims"].append(r); bounce["cost"].append(cost / risk); by_year[yr]["bounce"].append(r)
        # 4. position vs VWAP at London open / NY open -> rest of day direction
        for tgt_h, store in ((7.0, london), (14.5, ny)):
            j = _first_idx((lh >= tgt_h) & (lh < 20.0))
            if j is None or j >= n - 30 or j < 30:
                continue
            side = np.sign(c[j] - vwap[j]); rest = np.sign(c[-1] - c[j])
            if side != 0 and rest != 0:
                store["n"] += 1; store["agree"] += int(side == rest)
        # VWAP slope over first 2 hours vs rest of day
        j0 = int(np.searchsorted(ms, 60)); j1 = int(np.searchsorted(ms, 120))
        if j1 < n - 30:
            sl = np.sign(vwap[j1] - vwap[j0]); rest = np.sign(c[-1] - c[j1])
            if sl != 0 and rest != 0:
                slope_agree["n"] += 1; slope_agree["agree"] += int(sl == rest)
    out = {"reversion_after_band_touch": {}}
    for k, r in rev.items():
        out["reversion_after_band_touch"][f"{k}_sigma"] = {"n": r["n"], "back_to_vwap_within_60m": prop_ci(r["back60"], r["n"]),
                                                          "within_120m": prop_ci(r["back120"], r["n"]), "by_end_of_day": prop_ci(r["back_eod"], r["n"])}
    out["reversion_after_band_touch"]["baseline_random_bar"] = {"n": base["n"], "back_to_vwap_within_60m": prop_ci(base["back60"], base["n"]),
                                                                 "within_120m": prop_ci(base["back120"], base["n"]), "by_end_of_day": prop_ci(base["back_eod"], base["n"])}
    out["push_away_at_minute"] = {}
    for m, r in push.items():
        out["push_away_at_minute"][m] = {"n_days_with_|z|>=1.5": r["n"], "closes_even_further_from_vwap": prop_ci(r["further"], r["n"]),
                                         "closes_back_through_vwap": prop_ci(r["through"], r["n"]), "z_distribution": summarize(z_at[m], 2)}
    ci = prop_ci(bounce["win"], bounce["n"]); ci["p_vs_50"] = binom_p(bounce["win"], bounce["n"])
    ci["random_walk_null_pct"] = round(100 * float(np.mean(bounce["null"])), 1) if bounce["null"] else None
    out["vwap_bounce_after_1.5sigma_push"] = {"race_+1sig_continuation_vs_-1sig": ci, "sim_1sig_stop_1sig_target": trade_stats(bounce["sims"], bounce["cost"])}
    out["fade_2sigma_to_vwap_sim"] = trade_stats(fade["sims"], fade["cost"])
    la = prop_ci(london["agree"], london["n"]); la["p_vs_50"] = binom_p(london["agree"], london["n"])
    na = prop_ci(ny["agree"], ny["n"]); na["p_vs_50"] = binom_p(ny["agree"], ny["n"])
    sa = prop_ci(slope_agree["agree"], slope_agree["n"]); sa["p_vs_50"] = binom_p(slope_agree["agree"], slope_agree["n"])
    out["side_of_vwap_predicts_rest_of_day"] = {"at_london_open_0700UK": la, "at_ny_open_1430UK": na, "vwap_slope_h1_to_h2_vs_rest": sa}
    out["by_year"] = {y: {"fade_2sig": trade_stats(v["fade"]), "bounce": trade_stats(v["bounce"])} for y, v in sorted(by_year.items())}
    return out
