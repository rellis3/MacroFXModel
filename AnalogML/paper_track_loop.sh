#!/usr/bin/env bash
# Runs `paper_track.py --refresh-data` on a fixed interval (default hourly).
#
# paper_track.py itself is a one-shot scan, not a long-running process --
# start.sh's restart_bot wraps this LOOP (so a crash in the loop still gets
# supervised/restarted), not paper_track.py directly (that would restart it
# every ~30s per restart_bot's own cadence, hammering OANDA far more often
# than the signal's window=64 H1-bar cadence needs, and risking a rate
# limit). One scan per interval is plenty -- min_gap_bars=64 (~2.7 days on
# H1) means a new independent signal for any one pair can't appear faster
# than that anyway.
set -uo pipefail
cd "$(dirname "$0")/.."   # repo root

INTERVAL_SECONDS="${PAPER_TRACK_INTERVAL_SECONDS:-3600}"

while true; do
    echo "[paper_track_loop] scanning $(date -u +%FT%TZ)"
    python3 AnalogML/paper_track.py --refresh-data \
        || echo "[paper_track_loop] scan failed -- will retry next interval"
    echo "[paper_track_loop] sleeping ${INTERVAL_SECONDS}s"
    sleep "$INTERVAL_SECONDS"
done
