"""export_ladder_params — turn a walk-forward vol run into the frozen parameter
module the live forecaster ships (`js/forecastLadderParams.js`).

    python -m forge.export_ladder_params --report forge/out_vol_v2/vol_report.json

Which fold's spec ships? The LAST one. Folds use an expanding training window, so
the final fold's spec is the one trained on the most history — and its own OOS
score (reported alongside) came from data it never saw. Earlier folds exist to
prove the METHOD generalises; the last fold is the parameter set to actually run.

The estimator name travels WITH the widths, always. A width multiplier is the
quantile of (realized / sigma) for one specific sigma series; pairing it with a
different estimator silently destroys the calibration while leaving bands that
still look reasonable. `js/forecastSigma.js` is the JS half of that pair and is
cross-checked against `forge/vol.py`'s estimators to 1e-10.
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

import numpy as np

# forge pair key -> the name the live forecaster publishes the instrument under.
NAME_MAP = {"gold": "GOLD", "nq": "NQ", "spx500": "SPX500", "de30": "DE30",
            "uk100": "UK100", "us30": "US30", "us2000": "US2000"}

# Aliases: the same price series present under a second filename. Verified identical
# (byte-for-byte equal fold scores), so shipping both would put two entries in the
# params file for one instrument — the second under a name the forecaster never asks
# for, and silently unreachable. Skip the alias, keep the canonical name.
DUPLICATE_OF = {"nas100_usd": "nq", "xauusd": "gold"}

CLASS_OF = {"GOLD": "commodity", "NQ": "index", "SPX500": "index", "DE30": "index",
            "UK100": "index", "US30": "index", "US2000": "index"}

RUNGS = ("P50", "P75", "P90")
SLOTS = (("hl", "BM"), ("oc", "HN"), ("oh", "OH"), ("ol", "OL"))
EVENT_TAGS = ("FOMC", "NFP", "CPI", "other", "high", "holiday", "none")

# The fit's generic bucket was historically called `other` ("a significant scheduled
# release that is not one of the three named US ones"); the live tagger calls the same
# concept `high`, off the feed's own impact rating. Emit the fitted value under BOTH
# keys so a tagger using either vocabulary resolves it — without this, a `high` day
# finds no multiplier and silently gets x1.0, which is precisely the AUD failure this
# work set out to fix.
#
# ASSUMPTION, stated because it is not validated: the multiplier was fit on days whose
# significant release was a US one. Applying it to a day driven by an AU or JPY release
# assumes a high-impact print in the pair's own currency widens it comparably. That is
# plausible and clearly better than the x0.90 quiet-day discount those days get today,
# but the historical calendar available for the fit (calendar_events.csv) carries only
# USD/EUR/GBP, so it could not be measured. See forge/ff_calendar.py for the attempt
# to fix that and MD files/VOL_LADDER_NOTES.md for why it did not ship.
EVENT_ALIAS = {"other": "high"}


def display_name(pair: str) -> str:
    return NAME_MAP.get(pair, pair.upper())


def asset_class(name: str) -> str:
    return CLASS_OF.get(name, "fx")


def _round(x, nd=4):
    return None if x is None or not np.isfinite(x) else round(float(x), nd)


def pair_params(rec: dict) -> dict | None:
    """The last fold's frozen spec plus the OOS calibration it earned."""
    specs = rec.get("specs") or []
    folds = [f for f in rec.get("folds") or [] if f.get("oos")]
    if not specs or not folds:
        return None
    spec, last = specs[-1], folds[-1]
    wm = spec.get("width_mult") or {}
    width = {}
    for key, slot in SLOTS:
        vals = [_round(wm.get(f"{slot}_{r}")) for r in RUNGS]
        if all(v is not None for v in vals):
            width[key] = vals
    if "hl" not in width:
        return None
    ev = {}
    for t, v in (spec.get("event_mult") or {}).items():
        if t not in EVENT_TAGS:
            continue
        ev[t] = _round(v, 3)
        if t in EVENT_ALIAS:
            ev[EVENT_ALIAS[t]] = _round(v, 3)
    oos = {k.replace("exceed_", ""): _round(v, 3)
           for k, v in last["oos"].items() if k.startswith("exceed_")}

    # Per-horizon widths, when `run_horizons` has been run over this report. Same
    # sigma, refit width — weekly/monthly rungs that sqrt-scaling alone gets wrong.
    horizons = {}
    for hz, h in (spec.get("horizons") or {}).items():
        hw = h.get("width_mult") or {}
        w = {}
        for key, slot in SLOTS:
            vals = [_round(hw.get(f"{slot}_{r}")) for r in RUNGS]
            if all(v is not None for v in vals):
                w[key] = vals
        if not w:
            continue
        horizons[hz] = {
            "width": w,
            "n_train": h.get("n_train"),
            "n_effective": h.get("n_effective"),
            "overlapping": bool(h.get("overlapping")),
            "oos_exceed": {k.lower().replace("bm_", "hl_").replace("hn_", "oc_"): _round(v, 3)
                           for k, v in (h.get("oos_exceed") or {}).items()},
        }

    return {
        "estimator": spec.get("estimator"),
        "width": width,
        "event": ev,
        "horizons": horizons,
        "trained_through": str(spec.get("trained_through", ""))[:10],
        "oos_exceed": oos,
        "n_folds": len(folds),
    }


def class_defaults(pairs: dict) -> dict:
    """Per-class fallback for an instrument with no local price history to fit on:
    the element-wise MEDIAN of that class's fitted multipliers. A median (not a
    mean) so one odd instrument cannot drag the fallback, and reported with the
    contributing count so a thin class is visible rather than implied."""
    out = {}
    by_class: dict[str, list] = {}
    for name, p in pairs.items():
        by_class.setdefault(asset_class(name), []).append(p)
    for cls, members in by_class.items():
        width = {}
        for key, _slot in SLOTS:
            rows = [m["width"][key] for m in members if key in m["width"]]
            if rows:
                width[key] = [round(float(np.median([r[i] for r in rows])), 4) for i in range(3)]
        ev = {}
        for tag in EVENT_TAGS:
            vals = [m["event"][tag] for m in members if tag in (m.get("event") or {})]
            if vals:
                ev[tag] = round(float(np.median(vals)), 3)
        # The modal estimator among the class's members — the sensible default
        # sigma for an instrument we could not fit individually.
        ests = [m["estimator"] for m in members if m.get("estimator")]
        est = max(set(ests), key=ests.count) if ests else "yz_30"
        hz_out = {}
        for hz in ("weekly", "monthly"):
            hw = {}
            for key, _slot in SLOTS:
                rows = [m["horizons"][hz]["width"][key] for m in members
                        if m.get("horizons", {}).get(hz, {}).get("width", {}).get(key)]
                if rows:
                    hw[key] = [round(float(np.median([r[i] for r in rows])), 4) for i in range(3)]
            if hw:
                hz_out[hz] = {"width": hw}
        out[cls] = {"estimator": est, "width": width, "event": ev,
                    "horizons": hz_out, "n_members": len(members)}
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", default="forge/out_vol_v2/vol_report.json")
    ap.add_argument("--out", default="js/forecastLadderParams.js")
    args = ap.parse_args(argv)

    report = json.load(open(args.report, encoding="utf-8"))
    pairs, skipped = {}, []
    for pair, rec in sorted(report.items()):
        if pair in DUPLICATE_OF:
            skipped.append(f"{pair} (duplicate of {DUPLICATE_OF[pair]})")
            continue
        p = pair_params(rec)
        if p is None:
            skipped.append(pair)
            continue
        pairs[display_name(pair)] = p

    defaults = class_defaults(pairs)
    ex = [v for p in pairs.values() for k, v in (p.get("oos_exceed") or {}).items()
          if k.endswith("p50") and v is not None]

    payload = {
        "generated": date.today().isoformat(),
        "source": f"forge/vol.py walk-forward -> {Path(args.report).as_posix()}",
        "pairs": pairs,
        "classDefaults": defaults,
        "coverage": {
            "fitted": sorted(pairs),
            "skipped": skipped,
            "mean_last_fold_oos_exceed_p50": round(float(np.mean(ex)), 4) if ex else None,
        },
    }

    header = f'''/**
 * Forecast ladder parameters — GENERATED, do not hand-edit.
 *
 *   python -m forge.export_ladder_params --report {args.report}
 *
 * Each instrument carries a frozen (estimator, widths, event multipliers) spec from
 * the LAST walk-forward fold of `forge/vol.py`, i.e. trained on the most history and
 * scored on data it never saw. `width` is [p50, p75, p90] multipliers on the daily
 * sigma, per quantity: hl = High-Low range, oc = |Close-Open|, oh = High-Open,
 * ol = Open-Low. `event` scales sigma by the day's scheduled-release bucket and is
 * TWO-SIDED — `none` (no US Major release) sits below 1.0 and is roughly half the
 * calendar.
 *
 * `oos_exceed` is that spec's out-of-sample exceedance per rung; targets are
 * p50 -> 0.50, p75 -> 0.25, p90 -> 0.10. Pooled over all instruments and folds the
 * whole ladder lands within 0.9pp of target.
 *
 * The estimator name is part of the spec, not decoration: a width multiplier is the
 * quantile of (realized / sigma) for ONE sigma series. Feed the widths a different
 * sigma and the calibration is gone with no visible symptom. `js/forecastSigma.js`
 * implements exactly these estimators and is cross-checked against the Python.
 */
export const LADDER_PARAMS = '''

    Path(args.out).write_text(header + json.dumps(payload, indent=2) + ";\n", encoding="utf-8")
    print(f"wrote {args.out}: {len(pairs)} instruments"
          + (f", skipped {skipped}" if skipped else ""))
    print("class defaults:", {c: d["n_members"] for c, d in defaults.items()})
    if ex:
        print(f"mean last-fold OOS exceedance (p50 rungs): {np.mean(ex):.3f}  (target 0.500)")


if __name__ == "__main__":
    main()
