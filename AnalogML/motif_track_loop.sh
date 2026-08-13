#!/usr/bin/env bash
# Runs `motif_track.py --refresh-data` on a fixed interval (default hourly).
# Same convention as paper_track_loop.sh (which this sits alongside, not
# replaces -- the k-NN signal's log stays on disk/R2 for the record, it's
# just no longer surfaced live on the dashboard). start.sh's restart_bot
# wraps this LOOP, not motif_track.py directly, for the same reason:
# hammering OANDA every ~30s per restart_bot's own cadence would be far more
# often than the signal needs -- touches are naturally spaced
# min_bars_between_touches=10 (H1) apart, and a breakout can take up to
# breakout_max_bars=40 (H1) to confirm, so hourly is already frequent enough
# to not miss anything on a normal run.
set -uo pipefail
cd "$(dirname "$0")/.."   # repo root

INTERVAL_SECONDS="${MOTIF_TRACK_INTERVAL_SECONDS:-3600}"
# On by default (2026-08-13) -- MOTIF_TRACK_TELEGRAM=0 disables without a
# redeploy. Alerts still need a token/chat_id to resolve (this pair's own
# config or the shared dashboard tg_config, see motif_track.py --help) --
# harmless no-op if neither is set, not an error.
TELEGRAM_FLAG=""
if [ "${MOTIF_TRACK_TELEGRAM:-1}" != "0" ]; then
    TELEGRAM_FLAG="--telegram"
fi

while true; do
    echo "[motif_track_loop] scanning $(date -u +%FT%TZ)"
    python3 AnalogML/motif_track.py --refresh-data $TELEGRAM_FLAG \
        || echo "[motif_track_loop] scan failed -- will retry next interval"
    echo "[motif_track_loop] sleeping ${INTERVAL_SECONDS}s"
    sleep "$INTERVAL_SECONDS"
done
