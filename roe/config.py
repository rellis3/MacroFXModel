"""The ONE frozen config: loaded, hashed, version-pinned. Every snapshot records (version, sha256)."""
from __future__ import annotations

import json
from pathlib import Path

from .util import sha256_obj

CONFIG_PATH = Path(__file__).with_name("watch_config.json")
PINS_PATH = Path(__file__).with_name("config_pins.json")


def load_config(path=None) -> dict:
    p = Path(path) if path else CONFIG_PATH
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def config_hash(cfg: dict) -> str:
    """Canonical-JSON sha256 of the whole config (key order and whitespace do not matter)."""
    return sha256_obj(cfg)


def config_record(cfg: dict) -> dict:
    return {"watchVersion": cfg["watchVersion"], "sha256": config_hash(cfg)}


def trigger_version(cfg: dict, trigger: str) -> str:
    """Per-trigger version: the watchVersion plus the hash of that trigger's frozen parameters, so changing one trigger's
    numbers changes its observation ids and nothing else."""
    return f"{cfg['watchVersion']}/{sha256_obj(cfg['triggers'].get(trigger, {}))[:8]}"


def pinned_hash_ok(cfg: dict):
    """(ok, detail): the config hash must equal the pin for its version. A changed config under an unchanged version fails."""
    pins = json.loads(PINS_PATH.read_text(encoding="utf-8")) if PINS_PATH.exists() else {}
    want = pins.get(cfg["watchVersion"])
    got = config_hash(cfg)
    return (want == got), {"version": cfg["watchVersion"], "pinned": want, "actual": got}
