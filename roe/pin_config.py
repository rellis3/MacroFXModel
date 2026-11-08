"""Record the current config hash as the pin for its watchVersion:  python -m roe.pin_config
Run this ONLY after bumping watchVersion for a deliberate change to the frozen parameters (it never overwrites an existing
pin for the same version with a different hash)."""
import json
import sys

from .config import PINS_PATH, config_hash, load_config


def main() -> int:
    cfg = load_config()
    pins = json.loads(PINS_PATH.read_text(encoding="utf-8")) if PINS_PATH.exists() else {}
    h = config_hash(cfg)
    v = cfg["watchVersion"]
    if v in pins and pins[v] != h:
        print(f"refusing: {v} is already pinned to {pins[v]}; bump watchVersion for a changed config", file=sys.stderr)
        return 1
    pins[v] = h
    PINS_PATH.write_text(json.dumps(pins, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"pinned {v} = {h}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
