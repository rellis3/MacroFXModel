"""Tests for the shared R2 client brick. Constructing a boto3 client does
not touch the network, so these run offline like every other pylego test --
only the env-var gating and endpoint/bucket wiring are under test here, not
R2 itself.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pylego.r2 as r2  # noqa: E402


class _EnvSandbox:
    """Save/restore just the keys this module cares about."""
    KEYS = ("R2_ACCESS_KEY", "R2_SECRET_KEY", "R2_ENDPOINT", "R2_BUCKET")

    def __enter__(self):
        self._saved = {k: os.environ.get(k) for k in self.KEYS}
        for k in self.KEYS:
            os.environ.pop(k, None)
        return self

    def __exit__(self, *exc):
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def test_returns_none_without_credentials():
    with _EnvSandbox():
        assert r2.r2_client() is None


def test_returns_none_with_only_access_key():
    with _EnvSandbox():
        os.environ["R2_ACCESS_KEY"] = "ak"
        assert r2.r2_client() is None


def test_builds_client_with_both_credentials():
    with _EnvSandbox():
        os.environ["R2_ACCESS_KEY"] = "ak"
        os.environ["R2_SECRET_KEY"] = "sk"
        client = r2.r2_client()
        assert client is not None
        assert client.meta.endpoint_url == r2.R2_ENDPOINT


def test_endpoint_and_bucket_are_env_overridable():
    with _EnvSandbox():
        os.environ["R2_ACCESS_KEY"] = "ak"
        os.environ["R2_SECRET_KEY"] = "sk"
        os.environ["R2_ENDPOINT"] = "https://example.invalid"
        os.environ["R2_BUCKET"] = "some-other-bucket"
        # module-level R2_ENDPOINT/R2_BUCKET are read once at import time,
        # same convention as every other pylego brick's env-configured
        # constants -- re-import to pick up the sandboxed env for this test.
        import importlib
        r2_reloaded = importlib.reload(r2)
        assert r2_reloaded.R2_BUCKET == "some-other-bucket"
        client = r2_reloaded.r2_client()
        assert client.meta.endpoint_url == "https://example.invalid"
    importlib.reload(r2)  # restore module state for any test run after this one


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t(); print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")
