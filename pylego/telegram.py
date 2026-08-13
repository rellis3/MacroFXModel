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
