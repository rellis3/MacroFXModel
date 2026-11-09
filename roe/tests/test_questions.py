import json
import re
import tempfile
import unittest
from pathlib import Path

from roe.fixtures import make_fixture_inputs
from roe.config import load_config
from roe.questions import load_templates, write_questions
from roe.scan import run_scan
import datetime as dt


def _run(tmp):
    cfg = load_config()
    res = run_scan(asof="2026-11-06", out_dir=tmp, cfg=cfg, inputs=make_fixture_inputs("2026-11-06", cfg), now_utc=dt.datetime(2026, 11, 6, 23), commit="test")
    d = Path(res["dir"])
    return res, json.loads((d / "questions.json").read_text()), json.loads((d / "episodes.json").read_text()), [json.loads(l) for l in (d / "observations.jsonl").read_text().splitlines()]


class QuestionTests(unittest.TestCase):
    def test_one_question_per_episode_with_a_template_and_staleness_is_not_a_question(self):
        with tempfile.TemporaryDirectory() as t:
            res, q, ep, ob = _run(t)
            self.assertEqual(res["questions"], len(q["questions"]))
            n_stale = sum(1 for e in ep["episodes"] if e["trigger"] == "stale")
            self.assertEqual(len(q["questions"]) + len(q["notQuestions"]), len(ep["episodes"]))
            self.assertGreaterEqual(len(q["notQuestions"]), n_stale)
            self.assertEqual(len({x["episodeId"] for x in q["questions"]}), len(q["questions"]))

    def test_every_question_has_the_required_parts_and_a_family(self):
        with tempfile.TemporaryDirectory() as t:
            _, q, _, _ = _run(t)
            need = ["why", "observation", "hypothesis", "dataNeeded", "baseline", "smallestEffect", "minN", "horizons", "familyId", "specHash", "dataBoundary", "watchVersion", "qtVersion"]
            for x in q["questions"]:
                for k in need:
                    self.assertTrue(x.get(k) not in (None, "", []), (x["item"], k))
                self.assertEqual(x["status"], "queued")

    def test_deterministic_and_spec_has_no_date(self):
        with tempfile.TemporaryDirectory() as t:
            _, q, ep, ob = _run(t)
            again = write_questions(q["runId"], q["asof"], ep, ob, q["questions"][0]["watchVersion"])
            self.assertEqual([x["questionId"] for x in q["questions"]], [x["questionId"] for x in again["questions"]])
            # a later run of the same condition (different episode id and date) has the SAME specHash, so the server can count it instead of duplicating it
            ep2 = json.loads(json.dumps(ep))
            for e in ep2["episodes"]:
                e["episodeId"] += "x"; e["openedAt"] = "2026-12-01"
            later = write_questions("later", "2026-12-01", ep2, [], "roe-watch-1.0.1")
            self.assertEqual({x["specHash"] for x in later["questions"]}, {x["specHash"] for x in q["questions"]})

    def test_writer_never_carries_results_or_labels(self):
        T = json.dumps(load_templates()).lower()
        for bad in ("failed", "rejected", "dead", "null result", "validated", "underpowered", "previously", "evidence book", "shipped line"):
            self.assertNotIn(bad, T)
        with tempfile.TemporaryDirectory() as t:
            _, q, _, _ = _run(t)
            blob = json.dumps(q["questions"]).lower()
            self.assertIsNone(re.search(r"\b(failed|rejected|dead|previously|null result)\b", blob))

    def test_data_boundary_text_is_on_every_question(self):
        with tempfile.TemporaryDirectory() as t:
            _, q, _, _ = _run(t)
            self.assertTrue(all("2025-09-04" in x["dataBoundary"] and "forward" in x["dataBoundary"] for x in q["questions"]))


if __name__ == "__main__":
    unittest.main()
