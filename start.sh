#!/usr/bin/env bash
# Starts all Python trading bots (auto-restart on crash) + node web server.
# Railway runs this as the single process for the service.

set -euo pipefail
cd "$(dirname "$0")"

restart_bot() {
    local label="$1"; shift
    while true; do
        echo "[supervisor] starting $label"
        "$@" 2>&1 || true
        echo "[supervisor] $label exited — restarting in 30s"
        sleep 30
    done
}

restart_bot "regime-v2" \
    python RegimeV2/regime_bot_v2.py \
    --dashboard-url https://macrofxmodel-production.up.railway.app &

restart_bot "level-bot" \
    python bot/main.py &

restart_bot "gold-bot" \
    python Gold/main.py &

exec node server.js
