#!/usr/bin/env bash
# Runs `paper_track.py` (the RETIRED k-NN signal, kept as a forward record only)
# once an hour, aligned after motif_track_loop.sh's scan.
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

# NO --refresh-data here (2026-09-17). This loop and motif_track_loop.sh
# both ran refresh_m1 against the SAME 26 local parquets and R2 keys,
# starting in the same second on every deploy -- the "two independent
# hourly loops racing to write the same key" refresh_m1.py's own docstring
# suspected on 2026-08-18. Caught red-handed today: "Parquet file size is 0
# bytes", "File too short", "No such file" (the other process's failure
# path unlinks it mid-read), each one followed by a from-scratch 5-YEAR
# OANDA backfill -- six of them in one day. motif_track's scan is the ONE
# refresher now; this retired signal reads whatever it wrote, and runs
# after it: motif_track starts at :01:30 and a warm scan takes ~3 min, so
# :10 is comfortably past it. The first run after a (re)start waits for
# that slot too, rather than racing motif_track's cold start.
ALIGN_OFFSET_SECONDS="${PAPER_TRACK_ALIGN_OFFSET_SECONDS:-600}"

while true; do
    now=$(date -u +%s)
    next=$(( (now / 3600 + 1) * 3600 + ALIGN_OFFSET_SECONDS ))
    wait=$(( next - now ))
    echo "[paper_track_loop] next scan at $(date -u -d @"$next" +%FT%TZ) (sleeping ${wait}s)"
    sleep "$wait"
    echo "[paper_track_loop] scanning $(date -u +%FT%TZ)"
    python AnalogML/paper_track.py         || echo "[paper_track_loop] scan failed -- will retry next interval"
done
