"""Event-blackout gate — DATA consumer, no calendar logic.

The server computes per-currency blackout windows hourly (js/eventGateCore.js →
KV ``event_windows_v1``); this module only answers "is this pair inside one
right now?". Timestamps are shipped as data (PYTHON_LEGO's generate-don't-port
rule) so there is no formula here that can drift from the JS source.

Payload shape (KvClient.get_json already unwraps {data, timestamp}):
    { "generatedAt": ms, "preMin": 45, "postMin": 15,
      "windows": [ { "ccy": "USD", "startMs": ms, "endMs": ms,
                     "eventTimeMs": ms, "impact": "high", "title": "..." } ] }

Fail-open policy: this is a size/entry SUPPRESSION gate — if the windows are
missing or stale the consumer should trade normally but log LOUDLY (a silent
stale gate is worse than none). Use ``stale_reason`` for that decision.
"""
from __future__ import annotations

MAX_WINDOWS_AGE_MS = 24 * 3600 * 1000

_CCY = {"USD", "EUR", "GBP", "JPY", "AUD", "CAD", "NZD", "CHF", "CNY"}


def pair_ccys(sym: str) -> list[str]:
    """Event-relevant currencies for any symbol form ('eurusd', 'EUR_USD',
    'EUR/USD', 'XAU_USD', 'NAS100_USD', 'DE30_EUR'...). Metals/indices resolve
    to their quote/denomination currency. Mirrors js/eventGateCore.pairCcys."""
    s = str(sym or "").upper().replace("/", "_")
    parts = s.split("_") if "_" in s else ([s[:3], s[3:]] if len(s) == 6 else [s])
    out: list[str] = []
    for p in parts:
        if p in _CCY and p not in out:
            out.append(p)
    return out


def blackout(ccys, now_ms: float, windows) -> tuple[bool, str | None]:
    """True + reason when now_ms falls inside a window for any of ccys.
    ``windows`` is the payload's sorted window list."""
    for w in windows or []:
        start = w.get("startMs")
        if start is None or now_ms < start:
            break                      # sorted by start — nothing later matches
        if now_ms <= w.get("endMs", 0) and w.get("ccy") in ccys:
            mins = round((w.get("eventTimeMs", start) - now_ms) / 60000)
            when = f"in {mins}m" if mins >= 0 else f"{-mins}m ago"
            return True, f"{w.get('ccy')} {w.get('title') or 'high-impact event'} {when}"
    return False, None


def stale_reason(payload, now_ms: float, max_age_ms: int = MAX_WINDOWS_AGE_MS) -> str | None:
    """None when the payload is usable; otherwise why it isn't (log it, fail open)."""
    if not payload or not isinstance(payload, dict):
        return "event windows missing from KV (calendar producer down or KV unreachable)"
    gen = payload.get("generatedAt")
    if not gen:
        return "event windows payload has no generatedAt"
    if now_ms - gen > max_age_ms:
        return f"event windows stale ({round((now_ms - gen) / 3600000)}h old)"
    return None
