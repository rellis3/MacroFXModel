import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path

from roe import cli
from roe.push import PushError, build_payload, push_run


class _Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


def _make_run(root):
    d = Path(root) / "2026-11-06-abcdef1234"
    d.mkdir()
    (d / "snapshot.json").write_text(json.dumps({"runId": d.name, "asof": "2026-11-06", "identity": {"asof": "2026-11-06"}}))
    (d / "status.json").write_text(json.dumps({"runId": d.name, "state": "ok", "discoveryCompleted": True}))
    (d / "episodes.json").write_text(json.dumps({"runId": d.name, "episodes": []}))
    (d / "observations.jsonl").write_text(json.dumps({"obsId": "a"}) + "\n" + json.dumps({"obsId": "b"}) + "\n")
    return d


class PushTests(unittest.TestCase):
    def test_payload_has_all_parts(self):
        with tempfile.TemporaryDirectory() as t:
            p = build_payload(_make_run(t))
            self.assertEqual(p["runId"], "2026-11-06-abcdef1234")
            self.assertEqual([o["obsId"] for o in p["observations"]], ["a", "b"])

    def test_folder_name_must_match_run_id(self):
        with tempfile.TemporaryDirectory() as t:
            d = _make_run(t)
            d2 = d.rename(d.parent / "other")
            with self.assertRaises(PushError):
                build_payload(d2)

    def test_no_token_means_no_request(self):
        with tempfile.TemporaryDirectory() as t:
            d = _make_run(t)
            calls = []
            import os
            old = os.environ.pop("ROE_PUSH_TOKEN", None)
            try:
                with self.assertRaises(PushError):
                    push_run(d, token="", opener=lambda *a, **k: calls.append(a))
            finally:
                if old is not None:
                    os.environ["ROE_PUSH_TOKEN"] = old
            self.assertEqual(calls, [])

    def test_sends_bearer_and_returns_server_answer(self):
        with tempfile.TemporaryDirectory() as t:
            seen = {}
            def opener(req, timeout=0):
                seen["auth"] = req.get_header("Authorization"); seen["url"] = req.full_url; seen["method"] = req.get_method()
                return _Resp(json.dumps({"ok": True, "status": "recorded", "runId": "x"}).encode())
            r = push_run(_make_run(t), base_url="https://example.test/", token="tok", opener=opener)
            self.assertEqual(r["status"], "recorded")
            self.assertEqual(seen, {"auth": "Bearer tok", "url": "https://example.test/api/roe/push", "method": "POST"})

    def test_refusal_is_reported(self):
        with tempfile.TemporaryDirectory() as t:
            def opener(req, timeout=0):
                raise urllib.error.HTTPError(req.full_url, 401, "no", {}, io.BytesIO(b'{"error":"push token missing"}'))
            with self.assertRaises(PushError) as c:
                push_run(_make_run(t), token="tok", opener=opener)
            self.assertIn("401", str(c.exception))
            self.assertIn("push token missing", str(c.exception))

    def test_cli_push_failure_exit_code(self):
        self.assertEqual(cli.main(["--push-only", "/nonexistent/2026-01-01-aaaaaa"]), 4)


if __name__ == "__main__":
    unittest.main()
