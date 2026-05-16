import json
import logging
import os

log = logging.getLogger(__name__)

_STATE_FILE = os.path.join(os.path.dirname(__file__), '..', '.bot_state.json')


def load_bot_state() -> dict:
    """Returns persisted state dict, or {} if file missing/corrupt."""
    try:
        with open(_STATE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_bot_state(data: dict) -> None:
    """Atomically writes state to disk. Swallows errors — never crashes the bot."""
    try:
        tmp = _STATE_FILE + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, _STATE_FILE)
    except Exception as exc:
        log.warning(f'State save failed: {exc}')
