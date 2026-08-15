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

# A scan failing inside its own process can't alert about its own crash --
# a genuinely down bot and "no signals this hour" are both silent from the
# phone's side otherwise. Alert on the STATE CHANGE (down / recovered), not
# every single failure, so a one-off transient blip doesn't page anyone --
# only a real, sustained outage does. FAIL_THRESHOLD consecutive failures
# before the first alert; exactly one recovery message once it succeeds
# again, then the flag resets.
FAIL_THRESHOLD="${MOTIF_TRACK_FAIL_THRESHOLD:-3}"
consecutive_failures=0
outage_alerted=0

while true; do
    echo "[motif_track_loop] scanning $(date -u +%FT%TZ)"
    if python3 AnalogML/motif_track.py --refresh-data $TELEGRAM_FLAG; then
        if [ "$outage_alerted" = "1" ]; then
            python3 AnalogML/motif_track.py --heartbeat-alert \
                "✅ motif_track recovered after ${consecutive_failures} failed scan(s) in a row." \
                || echo "[motif_track_loop] recovery heartbeat failed to send"
            outage_alerted=0
        fi
        consecutive_failures=0
    else
        consecutive_failures=$((consecutive_failures + 1))
        echo "[motif_track_loop] scan failed (${consecutive_failures} in a row) -- will retry next interval"
        if [ "$consecutive_failures" -ge "$FAIL_THRESHOLD" ] && [ "$outage_alerted" = "0" ]; then
            python3 AnalogML/motif_track.py --heartbeat-alert \
                "⚠️ motif_track has failed ${consecutive_failures} scan(s) in a row (threshold ${FAIL_THRESHOLD}) -- bot may be down. Check Railway logs." \
                || echo "[motif_track_loop] outage heartbeat failed to send"
            outage_alerted=1
        fi
    fi
    echo "[motif_track_loop] sleeping ${INTERVAL_SECONDS}s"
    sleep "$INTERVAL_SECONDS"
done
