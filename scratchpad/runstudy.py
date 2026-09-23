#!/usr/bin/env python
"""Run a node study with the OANDA credentials in env.

    python scratchpad/runstudy.py analysis/some_study.mjs [args...]

The key lives in C:/QuantLab/lib/config.py and is read into the child's environment
WITHOUT being printed. Nothing here echoes it, and nothing should be added that does.
"""
import os
import re
import subprocess
import sys

CONFIG = r"C:/QuantLab/lib/config.py"


def read_config():
    """Pull OANDA_API_KEY / OANDA_BASE_URL out of config.py by text, not by import.

    Importing it would execute whatever else that module does; a regex over the two
    assignments we need is both safer and faster.
    """
    try:
        src = open(CONFIG, encoding="utf-8", errors="replace").read()
    except OSError as e:
        sys.exit(f"cannot read {CONFIG}: {e}")
    out = {}
    for name in ("OANDA_API_KEY", "OANDA_BASE_URL", "OANDA_ACCOUNT_ID"):
        m = re.search(rf"^{name}\s*=\s*[\"']([^\"']+)[\"']", src, re.M)
        if m:
            out[name] = m.group(1)
    if "OANDA_API_KEY" not in out:
        sys.exit("OANDA_API_KEY not found in config.py")
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: runstudy.py <script.mjs> [args...]")
    cfg = read_config()
    env = dict(os.environ)
    env["OANDA_KEY"] = cfg["OANDA_API_KEY"]          # the name the JS studies read
    env["OANDA_API_KEY"] = cfg["OANDA_API_KEY"]
    if "OANDA_BASE_URL" in cfg:
        env["OANDA_BASE_URL"] = cfg["OANDA_BASE_URL"]
        # js/volBacktestEngine.js picks its host from OANDA_ENV and defaults to LIVE.
        # The configured key is a practice key, so without this every call 401s --
        # which looks exactly like a bad key and is not one.
        if "fxpractice" in cfg["OANDA_BASE_URL"]:
            env["OANDA_ENV"] = "practice"
    if "OANDA_ACCOUNT_ID" in cfg:
        env["OANDA_ACCOUNT_ID"] = cfg["OANDA_ACCOUNT_ID"]
    # key length only, never the key
    print(f"[runstudy] OANDA credentials loaded ({len(cfg['OANDA_API_KEY'])} chars)", flush=True)
    sys.exit(subprocess.call(["node", *sys.argv[1:]], env=env))


if __name__ == "__main__":
    main()
