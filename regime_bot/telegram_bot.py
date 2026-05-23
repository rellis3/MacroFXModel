"""
Two-way Telegram bot interface.

Incoming commands are handled in a background polling thread (pyTelegramBotAPI).
Outbound alerts are sent synchronously via send().

Commands:
  /start   — welcome + help
  /status  — current regime, decay score, open position
  /pause   — stop new entries (holds existing positions)
  /resume  — resume entries
  /exit    — force-close all positions immediately
  /config  — show current configuration values
"""

import logging
import threading
from typing import Callable, Optional

import config

log = logging.getLogger(__name__)

try:
    import telebot
    HAS_TELEBOT = True
except ImportError:
    HAS_TELEBOT = False
    log.warning('pyTelegramBotAPI not installed — Telegram disabled (pip install pyTelegramBotAPI)')


_HELP = (
    '<b>RegimeBot commands</b>\n\n'
    '/status  — regime state + open position P&amp;L\n'
    '/pause   — stop new entries (hold open positions)\n'
    '/resume  — resume entering\n'
    '/exit    — force-close all positions NOW\n'
    '/config  — show current settings\n'
    '/start   — this message'
)


class TelegramBot:
    def __init__(
        self,
        get_status_fn: Callable[[], str],
        get_config_fn: Callable[[], str],
    ):
        self._get_status = get_status_fn
        self._get_config = get_config_fn
        self._bot: Optional[object] = None

        self._pause_cb:      Optional[Callable[[], None]] = None
        self._resume_cb:     Optional[Callable[[], None]] = None
        self._force_exit_cb: Optional[Callable[[], None]] = None

        if not HAS_TELEBOT:
            return
        if not config.TELEGRAM_TOKEN:
            log.warning('RB_TELEGRAM_TOKEN not set — Telegram disabled')
            return

        self._bot = telebot.TeleBot(config.TELEGRAM_TOKEN, parse_mode='HTML')
        self._register_handlers()

    def set_callbacks(
        self,
        pause:      Callable[[], None],
        resume:     Callable[[], None],
        force_exit: Callable[[], None],
    ) -> None:
        self._pause_cb      = pause
        self._resume_cb     = resume
        self._force_exit_cb = force_exit

    def _register_handlers(self) -> None:
        bot = self._bot

        @bot.message_handler(commands=['start', 'help'])
        def cmd_start(msg):
            bot.reply_to(msg, _HELP)

        @bot.message_handler(commands=['status'])
        def cmd_status(msg):
            bot.reply_to(msg, self._get_status())

        @bot.message_handler(commands=['config'])
        def cmd_config(msg):
            bot.reply_to(msg, self._get_config())

        @bot.message_handler(commands=['pause'])
        def cmd_pause(msg):
            if self._pause_cb:
                self._pause_cb()
            bot.reply_to(msg, '⏸ <b>Paused</b> — no new entries.\nExisting positions held open.')

        @bot.message_handler(commands=['resume'])
        def cmd_resume(msg):
            if self._resume_cb:
                self._resume_cb()
            bot.reply_to(msg, '▶️ <b>Resumed</b> — bot will enter on next valid regime signal.')

        @bot.message_handler(commands=['exit'])
        def cmd_exit(msg):
            bot.reply_to(msg, '🔴 <b>Force exit triggered</b> — closing all positions…')
            if self._force_exit_cb:
                self._force_exit_cb()

    def start_polling(self) -> None:
        """Starts the Telegram polling loop in a daemon background thread."""
        if not self._bot:
            log.info('Telegram not configured — running without bot')
            return

        def _poll():
            log.info('Telegram polling thread started')
            try:
                self._bot.infinity_polling(timeout=15, long_polling_timeout=10)
            except Exception as exc:
                log.error(f'Telegram polling crashed: {exc}')

        thread = threading.Thread(target=_poll, daemon=True, name='tg-poll')
        thread.start()

    def send(self, text: str) -> None:
        """
        Sends a message to the configured chat.
        Falls back to logging when Telegram is not configured.
        Never raises — outbound alerts must not crash the main loop.
        """
        if not self._bot or not config.TELEGRAM_CHAT_ID:
            log.info(f'[TG] {text}')
            return
        try:
            self._bot.send_message(config.TELEGRAM_CHAT_ID, text, parse_mode='HTML')
        except Exception as exc:
            log.warning(f'Telegram send failed: {exc}')
