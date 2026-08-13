"""Offline tests for send_telegram + load_tg_config (HTTP/KV injected — no network)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pylego.telegram import load_tg_config, send_telegram  # noqa: E402


class _Resp:
    def __init__(self, status=200):
        self.status_code = status


class _FakeHttp:
    def __init__(self, status=200, raise_exc=None):
        self.status, self.raise_exc, self.posts = status, raise_exc, []

    def post(self, url, json=None, timeout=None):
        if self.raise_exc:
            raise self.raise_exc
        self.posts.append((url, json))
        return _Resp(self.status)


class _FakeKv:
    def __init__(self, store=None, raise_exc=None):
        self.store, self.raise_exc = store or {}, raise_exc

    def get_json(self, key):
        if self.raise_exc:
            raise self.raise_exc
        return self.store.get(key)


def test_send_telegram_posts_to_bot_api_with_chat_and_text():
    http = _FakeHttp()
    ok = send_telegram("TOK", "123", "hello", http=http)
    assert ok is True
    url, body = http.posts[0]
    assert url == "https://api.telegram.org/botTOK/sendMessage"
    assert body == {"chat_id": "123", "text": "hello", "parse_mode": "HTML"}


def test_send_telegram_missing_creds_returns_false_without_posting():
    http = _FakeHttp()
    assert send_telegram("", "123", "hello", http=http) is False
    assert send_telegram("TOK", "", "hello", http=http) is False
    assert http.posts == []


def test_send_telegram_non_200_returns_false():
    http = _FakeHttp(status=403)
    assert send_telegram("TOK", "123", "hello", http=http) is False


def test_send_telegram_never_raises_on_transport_error():
    http = _FakeHttp(raise_exc=RuntimeError("boom"))
    assert send_telegram("TOK", "123", "hello", http=http) is False


def test_load_tg_config_prefers_own_config_when_both_set():
    kv = _FakeKv({"tg_config": {"token": "SHARED", "chatId": "999"}})
    own = {"tg_token": "OWN", "tg_chat_id": "111"}
    assert load_tg_config(kv, own) == ("OWN", "111")


def test_load_tg_config_falls_back_to_shared_when_own_incomplete():
    kv = _FakeKv({"tg_config": {"token": "SHARED", "chatId": "999"}})
    assert load_tg_config(kv, {"tg_token": "OWN"}) == ("SHARED", "999")   # missing chat_id
    assert load_tg_config(kv, None) == ("SHARED", "999")                  # no own config at all


def test_load_tg_config_no_config_anywhere_returns_empty_strings():
    kv = _FakeKv({})
    assert load_tg_config(kv, None) == ("", "")


def test_load_tg_config_kv_outage_returns_empty_strings_not_raise():
    kv = _FakeKv(raise_exc=RuntimeError("kv down"))
    assert load_tg_config(kv, None) == ("", "")


if __name__ == "__main__":
    fns = [v for k, v in list(globals().items()) if k.startswith("test_")]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"ok   {fn.__name__}")
        except Exception as e:
            failed += 1
            print(f"FAIL {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
