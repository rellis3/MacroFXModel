import io
import json
import os
import sys
import unittest
import urllib.error

from roe import concepts
from roe.concepts import ConceptsError, dry_run, run, wait, main


class _Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


STATUS = {"ok": True, "slice": "candles-sessions", "items": 5, "skipped": 0, "bySource": {"paper": 1, "cog": 2, "theory-lab": 2}, "estimatedTokens": 1234, "calls": 1,
          "callsUsed": 3, "callsCap": 400, "cards": 7, "job": None}


class ConceptsTests(unittest.TestCase):
    def setUp(self):
        self._old = os.environ.pop("ROE_PUSH_TOKEN", None)

    def tearDown(self):
        os.environ.pop("ROE_PUSH_TOKEN", None)
        if self._old is not None:
            os.environ["ROE_PUSH_TOKEN"] = self._old

    def test_dry_run_needs_no_token_and_is_a_get(self):
        seen = {}
        def opener(req, timeout=0):
            seen.update(url=req.full_url, method=req.get_method(), auth=req.get_header("Authorization"), data=req.data)
            return _Resp(json.dumps(STATUS).encode())
        d = dry_run("https://x.test/", "candles-sessions", opener)
        self.assertEqual(d["items"], 5)
        self.assertEqual(seen["method"], "GET"); self.assertIsNone(seen["auth"]); self.assertIsNone(seen["data"])
        self.assertEqual(seen["url"], "https://x.test/api/research-pod/concepts?slice=candles-sessions")

    def test_run_without_token_makes_no_request(self):
        calls = []
        with self.assertRaises(ConceptsError):
            run("https://x.test", token="", opener=lambda *a, **k: calls.append(a))
        self.assertEqual(calls, [])

    def test_run_sends_bearer_clamps_calls(self):
        seen = {}
        def opener(req, timeout=0):
            seen.update(auth=req.get_header("Authorization"), body=json.loads(req.data), method=req.get_method(), url=req.full_url)
            return _Resp(json.dumps({"ok": True, "job": {"max": 12}}).encode())
        r = run("https://x.test", "candles-sessions", 99, token="t" * 30, opener=opener)
        self.assertTrue(r["ok"])
        self.assertEqual(seen["auth"], "Bearer " + "t" * 30); self.assertEqual(seen["method"], "POST")
        self.assertEqual(seen["body"], {"slice": "candles-sessions", "calls": 12})
        self.assertTrue(seen["url"].endswith("/api/research-pod/concepts"))
        run("https://x.test", calls=0, token="t" * 30, opener=opener)
        self.assertEqual(seen["body"]["calls"], 1)

    def test_token_comes_from_the_environment_only(self):
        os.environ["ROE_PUSH_TOKEN"] = "e" * 30
        seen = {}
        def opener(req, timeout=0):
            seen["auth"] = req.get_header("Authorization")
            return _Resp(b'{"ok": true, "job": {}}')
        run("https://x.test", opener=opener)
        self.assertEqual(seen["auth"], "Bearer " + "e" * 30)
        import inspect
        self.assertNotIn("--token", inspect.getsource(concepts.main))

    def test_http_error_is_reported_with_the_server_reason(self):
        def opener(req, timeout=0):
            raise urllib.error.HTTPError(req.full_url, 401, "no", {}, io.BytesIO(b'{"ok": false, "error": "login required"}'))
        with self.assertRaises(ConceptsError) as cm:
            run("https://x.test", token="t" * 30, opener=opener)
        self.assertIn("401", str(cm.exception)); self.assertIn("login required", str(cm.exception))
        def down(req, timeout=0):
            raise urllib.error.URLError("offline")
        with self.assertRaises(ConceptsError):
            dry_run("https://x.test", opener=down)

    def test_wait_polls_until_the_job_stops(self):
        answers = [{**STATUS, "job": {"status": "running"}}, {**STATUS, "job": {"status": "running"}}, {**STATUS, "job": {"status": "done", "calls": 2, "cards": 3, "rejected": 0, "errors": []}}]
        sleeps = []
        st = wait("https://x.test", "candles-sessions", opener=lambda req, timeout=0: _Resp(json.dumps(answers.pop(0)).encode()), sleep=sleeps.append)
        self.assertEqual(st["job"]["status"], "done"); self.assertEqual(len(sleeps), 2)

    def test_cli_dry_run_and_run(self):
        lines = []
        self.assertEqual(main(["dry-run"], opener=lambda req, timeout=0: _Resp(json.dumps(STATUS).encode()), out=lines.append), 0)
        self.assertIn("calls used 3 of 400", lines[0]); self.assertIn("1234 tokens", lines[0])
        calls = []
        err, sys.stderr = sys.stderr, io.StringIO()
        try:
            self.assertEqual(main(["run"], opener=lambda *a, **k: calls.append(a), out=lines.append), 4)
        finally:
            sys.stderr = err
        self.assertEqual(calls, [])
        os.environ["ROE_PUSH_TOKEN"] = "t" * 30
        def opener(req, timeout=0):
            if req.get_method() == "POST":
                return _Resp(json.dumps({"ok": True, "job": {"max": 2}}).encode())
            return _Resp(json.dumps({**STATUS, "job": {"status": "done", "calls": 2, "cards": 4, "rejected": 1, "errors": ["x"]}}).encode())
        lines.clear()
        self.assertEqual(main(["run", "--calls", "2"], opener=opener, out=lines.append), 0)
        self.assertTrue(any("done: 2 calls, 4 cards" in l for l in lines))


if __name__ == "__main__":
    unittest.main()
