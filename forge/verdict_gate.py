"""The verdict gate: a study's verdict comes from its numbers, and a missing proof blocks banking.

Each scored question is written to analysis/output/<slug>/checks.json. `decide` picks the word:

    INCOMPLETE    a required proof is missing ("not computed")
    INVALID       a proof failed: the model was degenerate, a planted edge was missed, or a shuffle showed an effect
    VALIDATED     whole interval beyond zero, and the estimate reaches the minimum effect
    CONTEXT       whole interval beyond zero, but the estimate is smaller than the minimum effect
    NULL          the whole interval falls short of the minimum effect, so that size is ruled out
    UNDERPOWERED  anything else, or power below 0.8 without the effect being ruled out

Effects are given so that "better" is positive (pass direction=-1 for a loss ratio or a lower-is-better rate).
INCOMPLETE and INVALID cannot be banked. Power is computed from the realised date-block interval, not from row counts,
because instruments move together and rows are not independent.
"""
from __future__ import annotations

import json
from pathlib import Path
from statistics import NormalDist

REQUIRED = ("effect", "lo", "hi", "min_effect", "diagnostics", "planted_large", "planted_min", "shuffle", "rows")
_N = NormalDist()


def power(se: float, min_effect: float, alpha: float = 0.05) -> float:
    """One-sided power to detect min_effect, given the standard error of the estimate."""
    if not se > 0:
        return float("nan")
    return _N.cdf(min_effect / se - _N.inv_cdf(1 - alpha))


def se_from_ci(lo: float, hi: float) -> float:
    return (hi - lo) / (2 * 1.959964)


def planted_ok(p: dict) -> bool:
    """The pipeline recovered a planted effect: it moved the estimate at least half the planted size, the right way."""
    return bool(p.get("shift") is not None and p.get("injected") and p["shift"] >= 0.5 * p["injected"])


def shuffle_ok(s: dict) -> bool:
    """A shuffle must show nothing: interval includes zero, or the real result beats every shuffle (placebo form)."""
    if s.get("real_beats_all") is not None:
        return bool(s["real_beats_all"])
    if s.get("one_sided"):                                     # only a false GAIN fails (overfit noise costs a little)
        return bool(s.get("lo") is not None and s["lo"] <= 0)
    return bool(s.get("lo") is not None and s["lo"] <= 0 <= s["hi"])


def decide(c: dict) -> dict:
    """c holds REQUIRED, oriented so better is positive. Returns verdict, reasons and power."""
    missing = [k for k in REQUIRED if c.get(k) is None]
    if missing:
        return {"verdict": "INCOMPLETE", "reasons": [f"not computed: {', '.join(missing)}"], "power": None}
    reasons = []
    if not c["diagnostics"].get("ok"):
        reasons.append("diagnostics failed: " + str(c["diagnostics"].get("why", "degenerate")))
    if not planted_ok(c["planted_large"]):
        reasons.append("a large planted edge was not recovered")
    if not planted_ok(c["planted_min"]):
        reasons.append("a planted edge at the minimum size was not recovered")
    if not shuffle_ok(c["shuffle"]):
        reasons.append("the shuffle showed an effect")
    pw = power(se_from_ci(c["lo"], c["hi"]), c["min_effect"])
    if reasons:
        return {"verdict": "INVALID", "reasons": reasons, "power": pw}
    e, lo, hi, m = c["effect"], c["lo"], c["hi"], c["min_effect"]
    if lo > 0 and e >= m:
        v, why = "VALIDATED", f"interval above 0 and {e:+.4g} reaches the minimum {m:+.4g}"
    elif lo > 0:
        v, why = "CONTEXT", f"interval above 0, but {e:+.4g} is below the minimum {m:+.4g}"
    elif hi < m:
        v, why = "NULL", f"whole interval is below the minimum {m:+.4g}, so that size is ruled out"
    else:
        v, why = "UNDERPOWERED", f"interval [{lo:+.4g}, {hi:+.4g}] neither reaches nor rules out {m:+.4g}"
    return {"verdict": v, "reasons": [why], "power": pw}


def write_checks(slug: str, questions: dict, root: str | Path = "analysis/output") -> dict:
    """questions = {question id: decide() input}. Writes checks.json with each verdict."""
    out = {q: {**c, **decide(c)} for q, c in questions.items()}
    p = Path(root) / slug
    p.mkdir(parents=True, exist_ok=True)
    (p / "checks.json").write_text(json.dumps(out, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    return out
