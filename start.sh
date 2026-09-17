#!/usr/bin/env bash
# Starts all Python trading bots (auto-restart on crash) + node web server.
# Railway runs this as the single process for the service.
#
# Each bot is switchable from the Railway env without touching this file:
#   SVC_BOT_GOLD=0, SERVICES_OFF=botAnalogMotif,botPatternLive, SERVICE_PROFILE=lean
# The list of ids, what each one feeds and what it costs lives in
# `js/serviceFlags.js`; the operator's guide is
# `MD files/RAILWAY_SERVICE_FLAGS.md`. Defaults are unchanged — every bot that
# started before this still starts.

set -euo pipefail
cd "$(dirname "$0")"

# The on/off decision is DELEGATED to js/serviceFlags.js rather than
# reimplemented in bash, so start.sh and server.js can never disagree about
# what SERVICES_OFF or SERVICE_PROFILE mean (Lego Principle 1 — one copy).
# Fail-open: if node can't answer for any reason, the bot starts, which is the
# behaviour this file had before flags existed.
# Distinct exit codes (10/11) rather than 0/1 on purpose: node also exits 1 on
# an uncaught exception, so 0/1 could not tell "switched off" apart from "the
# flag lookup itself broke" — and silently not starting a live trading bot
# because of a typo is the one failure mode worth engineering against.
svc_on() {
    local rc=0
    node --input-type=module -e \
        "import { serviceEnabled } from './js/serviceFlags.js'; process.exit(serviceEnabled(process.argv[1]) ? 10 : 11);" \
        "$1" || rc=$?
    case "$rc" in
        10) return 0 ;;
        11) return 1 ;;
        *)  echo "[supervisor] WARNING: service-flag lookup for '$1' failed (node exit $rc) — starting it anyway" >&2
            return 0 ;;
    esac
}

restart_bot() {
    local label="$1"; shift
    while true; do
        echo "[supervisor] starting $label"
        "$@" 2>&1 || true
        echo "[supervisor] $label exited — restarting in 30s"
        sleep 30
    done
}

# start_bot <serviceId> <label> <command...>
start_bot() {
    local id="$1" label="$2"; shift 2
    if svc_on "$id"; then
        restart_bot "$label" "$@" &
    else
        echo "[supervisor] $label NOT started — service '$id' is switched off (see /api/services)"
    fi
}

start_bot botRegimeV2 "regime-v2" \
    python RegimeV2/regime_bot_v2.py \
    --dashboard-url https://macrofxmodel-production.up.railway.app

start_bot botLevel "level-bot" \
    python bot/main.py

start_bot botGold "gold-bot" \
    python Gold/main.py

start_bot botPatternLive "pattern-live-bot" \
    env DASHBOARD_URL=https://macrofxmodel-production.up.railway.app node PatternBot/pattern_live_bot.mjs

start_bot botLevelTouch "level-touch-bot" \
    env DASHBOARD_URL=https://macrofxmodel-production.up.railway.app python levelEngine/live_watch.py

start_bot botAnalogPaper "analogml-paper-track" \
    bash AnalogML/paper_track_loop.sh

# DASHBOARD_URL is load-bearing here, not cosmetic: motif_track.py pushes
# motif_bot_plan (the execution bot's ONLY input) to --dashboard-url, which
# defaults to localhost:3000 -- and Railway's node process isn't on 3000, so
# without this every hourly scan computed the plan and dropped it
# ("Connection refused", caught 2026-09-17; motif_bot ran for hours with
# generatedAt=null). Same explicit URL the three neighbours already pass.
start_bot botAnalogMotif "analogml-motif-track" \
    env DASHBOARD_URL=https://macrofxmodel-production.up.railway.app bash AnalogML/motif_track_loop.sh

start_bot botAnalogNearing "analogml-nearing-watch" \
    env DASHBOARD_URL=https://macrofxmodel-production.up.railway.app python AnalogML/motif_nearing_watch.py

# SessionResearch's live/full-study refresh runs as native setInterval timers
# inside server.js itself (see the "SessionResearch: native in-process
# scheduling" block there) rather than a bash-loop restart_bot entry here —
# it still shells out to the same Python engine, just scheduled by the node
# process directly instead of a separate supervised loop script. It has its own
# flags (SVC_SESSION_RESEARCH_LIVE / SVC_SESSION_RESEARCH_FULL) like everything
# else server.js schedules.

exec node server.js
