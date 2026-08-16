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

restart_bot "pattern-live-bot" \
    env DASHBOARD_URL=https://macrofxmodel-production.up.railway.app node PatternBot/pattern_live_bot.mjs &

restart_bot "level-touch-bot" \
    env DASHBOARD_URL=https://macrofxmodel-production.up.railway.app python3 levelEngine/live_watch.py &

restart_bot "analogml-paper-track" \
    bash AnalogML/paper_track_loop.sh &

restart_bot "analogml-motif-track" \
    bash AnalogML/motif_track_loop.sh &

restart_bot "analogml-nearing-watch" \
    env DASHBOARD_URL=https://macrofxmodel-production.up.railway.app python3 AnalogML/motif_nearing_watch.py &

exec node server.js
