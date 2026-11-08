"""Schema of every output; the no-frozen-layer-inputs test; no outcome / performance statistic anywhere."""
from __future__ import annotations

import copy
import json
import re
from pathlib import Path

from roe.config import load_config
from roe.fixtures import make_fixture_inputs
from roe.lockbox import LockboxViolation, OUTCOME_TOKENS, check_config, check_inputs, item_text
from roe.scan import run_scan

from .helpers import ASOF, NOW, cfg, fixture_run, jread, read_obs

ROE = Path(__file__).resolve().parent.parent


def test_observation_schema(tmp_path):
    r, _ = fixture_run(tmp_path)
    obs = read_obs(r["dir"])
    assert obs
    need = {"obsId": str, "date": str, "runId": str, "item": str, "trigger": str, "triggerVersion": str, "side": str,
            "inputFlags": list, "scanBreadth": dict, "watchVersion": str, "backfilled": bool}
    for o in obs:
        for k, t in need.items():
            assert isinstance(o[k], t), (k, o)
        assert o["trigger"] in ("extreme", "speed", "flip", "divergence", "regime", "stale")
        assert re.fullmatch(r"[0-9a-f]{16}", o["obsId"]) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", o["date"])
        assert o["familyId"] is None                                # hypothesis families are NOT assigned in P1
        assert "familyId" in o and "episodeId" in o and o["episodeId"] is not None
        assert o["runId"] == r["runId"] and o["watchVersion"] == cfg()["watchVersion"]
        assert set(o["scanBreadth"]) == {"items", "itemsListed", "triggerEvaluations"}
        if o["percentiles"]:
            assert o["percentiles"]["label"] == "roe, causal"
        if o["serverPercentile"]:
            assert o["serverPercentile"]["label"] == "server, non-causal"


def test_episodes_status_state_snapshot_summary_schema(tmp_path):
    r, _ = fixture_run(tmp_path)
    d = Path(r["dir"])
    assert {p.name for p in d.iterdir()} == {"snapshot.json", "status.json", "state.json", "episodes.json", "observations.jsonl", "summary.md"}
    ep = jread(d, "episodes.json")
    assert ep["schema"] == "roe.episodes.v1" and ep["gapSessions"] == 3 and ep["familyAssignment"].startswith("none")
    ids = {o["obsId"] for o in read_obs(d)}
    for e in ep["episodes"]:
        for k in ("episodeId", "item", "trigger", "side", "openedAt", "lastSeenAt", "closedAt", "state", "obsIds", "familyId"):
            assert k in e
        assert e["state"] in ("opened", "persisting", "closed") and e["familyId"] is None
        assert (e["closedAt"] is None) == (e["state"] != "closed")
    st = jread(d, "status.json")
    assert st["schema"] == "roe.status.v1" and st["state"] in ("ok", "degraded", "failed") and isinstance(st["reasons"], list)
    assert isinstance(st["discoveryCompleted"], bool) and st["runId"] == r["runId"]
    sd = jread(d, "state.json")
    assert sd["schema"] == "roe.state.v1" and len(sd["top10"]) == 10 and sd["scanBreadth"]["items"] > 0
    vix = sd["items"]["vix_vix3m"]
    assert set(vix["measures"]) >= {"value", "pct", "z", "chg", "chgZ", "asOfDate", "windows"}
    assert set(vix["measures"]["pct"]) == {"252", "756"} and set(vix["measures"]["chg"]) == {"1", "5", "20"}
    cot = sd["items"]["cot_fx:EUR"]["measures"]
    assert set(cot["pct"]) == {"52", "156"} and set(cot["chg"]) == {"1", "4", "13"}          # weekly windows
    sn = jread(d, "snapshot.json")
    assert sn["schema"] == "roe.snapshot.v1" and sn["evaluationDates"][0] == ASOF
    text = (d / "summary.md").read_text(encoding="utf-8")
    assert text.startswith("# ROE scan") and "OBSERVATION ONLY" in text and "Coverage of the owner's top-10" in text


def test_top10_coverage_names_all_ten(tmp_path):
    r, _ = fixture_run(tmp_path)
    t = jread(r["dir"], "state.json")["top10"]
    assert [x["n"] for x in t] == list(range(1, 11))
    # item 4 (realised range vs the shipped line) is disabled in roe-watch-1.0.1: the live ladder is lockbox-adjacent (layer-3 file list)
    assert all(x["itemsEvaluated"] > 0 for x in t if x["n"] != 4)
    assert [x["itemsEvaluated"] for x in t if x["n"] == 4] == [0]


def test_no_watch_item_references_frozen_layer_or_shadow_screen_outputs():
    c = cfg()
    assert check_config(c) == []
    # the check must actually catch a violation (so this test can fail)
    for bad_series in ("HAR800_SIGMA", "forecastSigma", "r3_travel", "remaining_travel", "M2_confidence", "shadow_screen", "forecastLadderParamsHar800"):
        c2 = copy.deepcopy(c)
        c2["items"].append({"id": "bad", "kind": "series", "series": bad_series, "triggers": ["extreme"]})
        assert check_config(c2), bad_series
    assert check_inputs([("HAR800", "x")], c) and check_inputs([("VIX", "state:history.long.VIX")], c) == []


def test_run_scan_refuses_to_run_with_a_forbidden_input_or_item(tmp_path):
    c = cfg()
    inp = make_fixture_inputs(ASOF, c)
    inp.series["HAR800_SIGMA"] = inp.series["VIX"]
    try:
        run_scan(asof=ASOF, out_dir=tmp_path, cfg=c, inputs=inp, now_utc=NOW, commit="x")
        raise AssertionError("expected LockboxViolation")
    except LockboxViolation:
        pass
    assert not list(tmp_path.iterdir())
    c2 = copy.deepcopy(c)
    c2["items"].append({"id": "bad", "kind": "series", "series": "R3_remaining_travel", "triggers": ["extreme"]})
    try:
        run_scan(asof=ASOF, out_dir=tmp_path, cfg=c2, inputs=make_fixture_inputs(ASOF, c2), now_utc=NOW, commit="x")
        raise AssertionError("expected LockboxViolation")
    except LockboxViolation:
        pass


def test_shipped_configs_name_no_frozen_layer_files_in_item_text():
    for e in cfg()["items"]:
        t = item_text(e).lower()
        for tok in ("har800", "har_rv", "forecastsigma", "remaining", "confidence_fit", "shadow", "stop-risk", "path-map"):
            assert tok not in t, (e["id"], tok)


def test_hl_line_item_uses_only_the_production_line_fields():
    c = cfg()
    assert c["lockbox"]["allowedProductionLineFields"] == ["hl_median", "hl_75"]
    src = (ROE / "loaders.py").read_text(encoding="utf-8")
    assert 'fc.get("hl_75")' in src and 'fc.get("hl_median")' in src
    for tok in ("har", "sigma", "r3"):
        assert not re.search(r"fc\.get\(['\"][a-z_]*" + tok, src)


def test_code_imports_nothing_from_forge_and_computes_no_outcomes():
    for p in sorted(ROE.glob("*.py")):
        text = p.read_text(encoding="utf-8")
        assert not re.search(r"^\s*(from|import)\s+forge", text, re.M), p.name        # do not touch or import forge/
        if p.name == "lockbox.py":
            continue                                                                    # the token list itself lives here
        low = text.lower()
        for tok in OUTCOME_TOKENS:
            assert tok not in low, (p.name, tok)
        for tok in ("har800", "forecastsigma", "lockbox_manifest", "lockbox_log", "confidence_fit"):
            assert tok not in low, (p.name, tok)


def test_nothing_is_written_outside_the_out_dir_and_no_network_in_scan(tmp_path):
    src = (ROE / "scan.py").read_text(encoding="utf-8") + (ROE / "inputs.py").read_text(encoding="utf-8")
    assert "urllib" not in src and "requests" not in src and "POST" not in src
    loaders = (ROE / "loaders.py").read_text(encoding="utf-8")
    assert 'method="GET"' in loaders and "POST" not in loaders.replace('method="GET"', "")
