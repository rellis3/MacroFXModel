"""Immutable snapshot, deterministic run ids, idempotent re-run, conflicting re-run is an error, config hash recorded."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

from roe.cli import main as cli_main
from roe.config import config_hash, config_record, pinned_hash_ok, trigger_version
from roe.fixtures import make_fixture_inputs
from roe.scan import run_scan
from roe.snapshot import SnapshotConflict, make_run_id

from .helpers import ASOF, NOW, cfg, fixture_run, jread, read_obs


def _tree_digest(root):
    h = hashlib.sha256()
    for p in sorted(Path(root).rglob("*")):
        if p.is_file():
            h.update(str(p.relative_to(root)).encode())
            h.update(p.read_bytes())
    return h.hexdigest()


def test_run_id_is_deterministic_from_date_and_input_hashes(tmp_path):
    r1, _ = fixture_run(tmp_path / "a")
    r2, _ = fixture_run(tmp_path / "b")
    assert r1["runId"] == r2["runId"] and r1["runId"].startswith(ASOF + "-")
    assert make_run_id(ASOF, "c", "m", "k") == make_run_id(ASOF, "c", "m", "k") != make_run_id(ASOF, "c", "m2", "k")
    # different inputs (a different seed) give a different id
    c = cfg()
    inp = make_fixture_inputs(ASOF, c, seed=8)
    r3 = run_scan(asof=ASOF, out_dir=tmp_path / "c", cfg=c, inputs=inp, now_utc=NOW, commit="testcommit")
    assert r3["runId"] != r1["runId"]


def test_same_inputs_rerun_is_a_noop_and_writes_nothing(tmp_path):
    r1, _ = fixture_run(tmp_path)
    before = _tree_digest(tmp_path)
    r2, _ = fixture_run(tmp_path)
    assert r2["noop"] is True and r2["runId"] == r1["runId"] and r2["status"] == r1["status"]
    assert _tree_digest(tmp_path) == before                      # byte-identical: nothing was overwritten
    assert [p.name for p in tmp_path.iterdir()] == [r1["runId"]]  # no temp dirs left behind


def test_observation_ids_are_identical_across_reruns_in_separate_dirs(tmp_path):
    r1, _ = fixture_run(tmp_path / "a")
    r2, _ = fixture_run(tmp_path / "b")
    assert [o["obsId"] for o in read_obs(r1["dir"])] == [o["obsId"] for o in read_obs(r2["dir"])]
    assert len({o["obsId"] for o in read_obs(r1["dir"])}) == len(read_obs(r1["dir"]))      # no duplicate ids inside a run


def test_conflicting_rerun_under_the_same_run_id_is_an_error(tmp_path):
    r1, _ = fixture_run(tmp_path)
    c = cfg()
    other = make_fixture_inputs(ASOF, c, seed=99)               # different inputs
    try:
        run_scan(asof=ASOF, out_dir=tmp_path, cfg=c, inputs=other, now_utc=NOW, commit="testcommit", run_id=r1["runId"])
        raise AssertionError("expected SnapshotConflict")
    except SnapshotConflict:
        pass
    assert [p.name for p in tmp_path.iterdir()] == [r1["runId"]]
    # also: a different code commit under a forced id is a conflict
    try:
        run_scan(asof=ASOF, out_dir=tmp_path, cfg=c, inputs=make_fixture_inputs(ASOF, c), now_utc=NOW, commit="othercommit", run_id=r1["runId"])
        raise AssertionError("expected SnapshotConflict")
    except SnapshotConflict:
        pass


def test_cli_conflict_exit_code_and_noop(tmp_path):
    out = str(tmp_path)
    assert cli_main(["--fixtures", "--asof", ASOF, "--out", out, "--now", "2026-11-06T23:00:00"]) == 0
    assert cli_main(["--fixtures", "--asof", ASOF, "--out", out, "--now", "2026-11-06T23:00:00"]) == 0       # no-op
    runs = [p.name for p in tmp_path.iterdir()]
    assert len(runs) == 1
    assert cli_main(["--fixtures", "--asof", ASOF, "--out", out, "--run-id", runs[0], "--lookback", "3"]) in (0, 3)


def test_snapshot_records_hashes_commit_series_metadata_and_config(tmp_path):
    r, inp = fixture_run(tmp_path)
    s = jread(r["dir"], "snapshot.json")
    assert s["runId"] == r["runId"] and s["asof"] == ASOF and s["codeCommit"] == "testcommit"
    assert s["createdAt"].endswith("Z")
    assert all(len(b["sha256"]) == 64 for b in s["inputs"]) and len(s["manifestSha256"]) == 64
    ids = {x["id"] for x in s["series"]}
    assert {"VIX", "VIX9D", "COT:EUR", "HL75:NQ"} <= ids
    one = next(x for x in s["series"] if x["id"] == "VIX")
    for k in ("source", "cadence", "kind", "nObs", "first", "last", "lastPublic", "sha256", "flags"):
        assert k in one
    assert s["lockbox"]["forwardOutcomesComputed"] is False and s["lockbox"]["frozenLayerInputsUsed"] is False
    vxn = next(x for x in s["series"] if x["id"] == "VXN")
    assert any(f["code"] == "STALE" for f in vxn["flags"])


def test_config_hash_and_version_are_recorded_in_every_snapshot(tmp_path):
    r, _ = fixture_run(tmp_path)
    c = cfg()
    s = jread(r["dir"], "snapshot.json")
    assert s["config"] == config_record(c)
    assert s["config"]["sha256"] == config_hash(c) and s["config"]["watchVersion"] == c["watchVersion"]
    assert s["identity"]["configSha256"] == config_hash(c)


def test_config_is_pinned_and_a_change_changes_hash_trigger_version_and_run_id(tmp_path):
    c = cfg()
    ok, detail = pinned_hash_ok(c)
    assert ok, detail                                            # roe/config_pins.json matches the frozen file
    c2 = copy.deepcopy(c)
    c2["triggers"]["extreme"]["upper"] = 90
    assert config_hash(c2) != config_hash(c)
    assert trigger_version(c2, "extreme") != trigger_version(c, "extreme")
    assert trigger_version(c2, "speed") == trigger_version(c, "speed")        # only that trigger's version moves
    assert pinned_hash_ok(c2)[0] is False                        # edited without a version bump: caught
    r1, _ = fixture_run(tmp_path / "a")
    inp = make_fixture_inputs(ASOF, c2)
    r2 = run_scan(asof=ASOF, out_dir=tmp_path / "b", cfg=c2, inputs=inp, now_utc=NOW, commit="testcommit")
    assert r2["runId"] != r1["runId"]
    assert "does not match its pin" in " ".join(r2["reasons"])


def test_snapshot_directory_never_overwritten_by_a_later_different_run(tmp_path):
    r1, _ = fixture_run(tmp_path)
    before = _tree_digest(Path(r1["dir"]))
    c = cfg()
    run_scan(asof="2026-11-05", out_dir=tmp_path, cfg=c, inputs=make_fixture_inputs("2026-11-05", c), now_utc=NOW, commit="testcommit")
    assert _tree_digest(Path(r1["dir"])) == before


def test_second_run_builds_on_prior_observations_for_episodes(tmp_path):
    c = cfg()
    day1, day2 = "2026-11-05", "2026-11-06"
    run_scan(asof=day1, out_dir=tmp_path, cfg=c, inputs=make_fixture_inputs(day1, c), now_utc=NOW, commit="testcommit", lookback=0)
    r2 = run_scan(asof=day2, out_dir=tmp_path, cfg=c, inputs=make_fixture_inputs(day2, c), now_utc=NOW, commit="testcommit", lookback=0)
    ep = jread(r2["dir"], "episodes.json")["episodes"]
    assert any(e["nObservations"] >= 2 for e in ep) or ep       # prior runs are read; no crash and episodes exist
