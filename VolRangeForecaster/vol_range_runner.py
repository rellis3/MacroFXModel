#!/usr/bin/env python3
"""
Daily Vol & Range Forecast Runner

Fetches OHLC data, computes tomorrow's session forecast, and sends it to
Telegram.  Designed to run once per day after the US session closes (e.g.
via Railway CRON or a local crontab at 22:00 UTC Monday–Friday).

Configuration is read from environment variables (set in Railway / .env):

  VOL_TG_TOKEN   — Telegram bot token  (falls back to TG_TOKEN)
  VOL_TG_CHAT    — Telegram chat ID    (falls back to TG_CHAT_ID)
  DASHBOARD_URL  — KV store base URL (optional; used to pull shared creds)

Usage
-----
  python vol_range_runner.py          # send tomorrow's forecast now
  python vol_range_runner.py --dry    # print to stdout, no Telegram send
  python vol_range_runner.py 2026-06-02   # specific date (dry-run implied if --dry)
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timezone

import requests

sys.path.insert(0, os.path.dirname(__file__))
from vol_range_forecast import run_forecast

logging.basicConfig(format='%(asctime)s [VOL] %(levelname)s %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S', level=logging.INFO)
log = logging.getLogger('vol_runner')


# ── Telegram ────────────────────────────────────────────────────────────────────

def _send_telegram(token: str, chat_id: str, text: str) -> bool:
    try:
        r = requests.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={'chat_id': chat_id, 'text': text, 'parse_mode': 'Markdown'},
            timeout=15,
        )
        if r.status_code == 200:
            return True
        log.warning('Telegram returned %d: %s', r.status_code, r.text[:200])
        return False
    except Exception as exc:
        log.warning('Telegram send failed: %s', exc)
        return False


def _get_tg_creds() -> tuple[str, str]:
    """
    Priority:
      1. VOL_TG_TOKEN / VOL_TG_CHAT environment variables
      2. Shared TG_TOKEN / TG_CHAT_ID environment variables
    """
    token   = os.environ.get('VOL_TG_TOKEN') or os.environ.get('TG_TOKEN', '')
    chat_id = os.environ.get('VOL_TG_CHAT')  or os.environ.get('TG_CHAT_ID', '')
    return token.strip(), chat_id.strip()


# ── Entry point ─────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description='Daily vol & range forecast sender')
    parser.add_argument('date', nargs='?', help='Target date YYYY-MM-DD (default: next trading day)')
    parser.add_argument('--dry', action='store_true', help='Print to stdout, skip Telegram')
    args = parser.parse_args()

    target_date = None
    if args.date:
        target_date = datetime.strptime(args.date, '%Y-%m-%d').replace(tzinfo=timezone.utc)

    log.info('Computing vol & range forecast …')
    report = run_forecast(target_date)

    if args.dry:
        print(report)
        return 0

    token, chat_id = _get_tg_creds()
    if not token or not chat_id:
        log.error('No Telegram credentials found. Set VOL_TG_TOKEN and VOL_TG_CHAT.')
        print(report)          # still print so the value isn't lost
        return 1

    ok = _send_telegram(token, chat_id, report)
    if ok:
        log.info('Forecast sent to Telegram successfully.')
    else:
        log.error('Telegram send failed — printing to stdout instead.')
        print(report)
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
