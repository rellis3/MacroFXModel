"""telegram — send_telegram + load_tg_config, extracted from a copy-pasted
pattern found duplicated near-identically across 7+ bots (`RegimeV2`,
`RegimeV4`, `RegimeV7`, `DynAnchorBot`, `YieldSpreadBot`, `oi_bot`,
`bot/main.py`) before this brick existed — CLAUDE.md's own threshold for
"extract it" ("if two copies already exist, that alone qualifies"). A
Category-B brick alongside `pylego/kv.py` (reads the shared config through
the same `KvClient`); existing bots are NOT migrated here — that's a
separate follow-up, not done as part of adding this brick's first new
caller (`AnalogML/motif_track.py`).

  from pylego.kv import KvClient
  from pylego.telegram import load_tg_config, send_telegram

  kv = KvClient(dashboard_url)
  token, chat_id = load_tg_config(kv)                 # falls back to shared tg_config
  send_telegram(token, chat_id, "<b>GBPJPY</b> long @ 195.20")

**The shared `tg_config` fallback never actually worked (found 2026-08-19).**
`load_tg_config`'s fallback path reads it via `KvClient.get_json('tg_config')`
-- the *generic* `/api/kv/get` endpoint, which enforces a whitelist
(`isAllowedKVKey` in `_worker.js`) deliberately excluding `tg_config`: it
holds the raw bot token, and that endpoint is unauthenticated, so whitelisting
it would leak the token in plaintext to anyone who asks. `motif_track.py` was
this brick's first-ever caller of the shared-fallback path (the other 7 bots
predate this brick and don't use it), so this was silently broken from day
one, not a regression -- every run printed the "no token/chat_id resolved"
warning and skipped sending, forever.

The other 7 bots aren't actually broken by this: they resolve `own_cfg`
(their OWN dedicated token, from their OWN already-whitelisted per-bot config
key like `regime_bot_v2_config`), never touching the shared fallback at all.
Any bot in that position should keep using `send_telegram(token, chat_id,
text)` directly -- untouched, still correct.

A bot with no dedicated token of its own (AnalogML's actual situation, and
the reason `load_tg_config`'s SHARED fallback exists) can't safely read the
raw token this way and shouldn't try to. Use `dashboard_telegram_configured`
+ `send_via_dashboard` instead -- they go through the dashboard's own
`/api/telegram` proxy, which holds the token server-side and never exposes
it to the caller:

  from pylego.telegram import dashboard_telegram_configured, send_via_dashboard

  if dashboard_telegram_configured(dashboard_url):
      send_via_dashboard(dashboard_url, "<b>GBPJPY</b> long @ 195.20")
"""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)


def send_telegram(token: str, chat_id: str, text: str, *, http=None, parse_mode: str = "HTML") -> bool:
    """POSTs one message via the Bot API. False (never raises) on missing
    creds or any send failure — an alert going out is best-effort, never
    something that should crash the caller's loop."""
    if not token or not chat_id:
        return False
    if http is None:
        import requests  # lazy -- keeps the brick importable without the dep in tests
        http = requests
    try:
        r = http.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode},
            timeout=10,
        )
        return getattr(r, "status_code", 200) == 200
    except Exception as exc:  # noqa: BLE001 -- best-effort send, never propagate
        log.warning("Telegram send failed: %s", exc)
        return False


def load_tg_config(kv, own_cfg: dict | None = None, *, fallback_key: str = "tg_config") -> tuple[str, str]:
    """Bot-specific `tg_token`/`tg_chat_id` (from `own_cfg`, e.g. that bot's
    own KV-persisted config dict) if both are set, else the SHARED
    `fallback_key` config (default `tg_config`, the dashboard Alerts modal's
    key — every existing bot's ultimate fallback) with fields `token`/
    `chatId` (note the different casing from the bot-specific fields — that
    mismatch is the shared config's own established shape, not a typo here).
    Never raises: a KV outage returns `("", "")`, same as no config set."""
    own = own_cfg or {}
    token = str(own.get("tg_token", "") or "").strip()
    chat_id = str(own.get("tg_chat_id", "") or "").strip()
    if token and chat_id:
        return token, chat_id
    try:
        shared = kv.get_json(fallback_key) or {}
    except Exception:
        shared = {}
    return str(shared.get("token", "") or "").strip(), str(shared.get("chatId", "") or "").strip()


def dashboard_telegram_configured(dashboard_url: str, *, http=None) -> bool:
    """Whether the shared dashboard Telegram config (bot token + chat id) is
    set, via the dashboard's own `/api/telegram/config` status endpoint --
    the REDACTED one (`{configured, chatId}`, no token). See this module's
    own docstring for why a bot without its own dedicated token can't just
    read the raw `tg_config` key instead."""
    if http is None:
        import requests  # lazy -- keeps the brick importable without the dep in tests
        http = requests
    try:
        r = http.get(f"{dashboard_url.rstrip('/')}/api/telegram/config", timeout=10)
        r.raise_for_status()
        return bool(r.json().get("configured"))
    except Exception as exc:  # noqa: BLE001 -- treat any failure as "not configured"
        log.warning("Telegram config check failed: %s", exc)
        return False


def send_via_dashboard(dashboard_url: str, text: str, *, parse_mode: str = "HTML", http=None) -> bool:
    """Sends through the dashboard's own `/api/telegram` proxy -- which
    holds the shared bot token server-side and makes the actual Telegram
    API call itself -- instead of fetching the raw token via KV. False
    (never raises) on any failure, same best-effort convention as
    `send_telegram`. For a bot using the SHARED dashboard config, not its
    own dedicated token (see this module's own docstring)."""
    if http is None:
        import requests  # lazy -- keeps the brick importable without the dep in tests
        http = requests
    try:
        r = http.post(f"{dashboard_url.rstrip('/')}/api/telegram",
                      json={"message": text, "parseMode": parse_mode}, timeout=10)
        return bool(r.json().get("ok"))
    except Exception as exc:  # noqa: BLE001 -- best-effort send, never propagate
        log.warning("Telegram send (via dashboard) failed: %s", exc)
        return False
