#!/usr/bin/env bash
# Runs `predict_today.py --live` for every pair on a fixed interval (default
# hourly, matching AnalogML/motif_track_loop.sh's OANDA-refresh cadence --
# checking more often than the underlying M1 parquet actually gets topped up
# would just re-derive the same number), then rebuilds the combined
# dashboard_summary.json so today.html's cards + AI analysis pick up the
# fresh numbers.
#
# This is the FAST loop -- it only fits the production model on
# already-computed historical checkpoints and predicts ONE new row per pair,
# no permutation testing, so it's cheap even serially across 26 pairs. The
# expensive full study (circular-shift nulls, every handoff/spike/impulse
# cell) is full_study_loop.sh, on its own much slower cadence -- this loop
# never re-derives those, it only applies the model they already validated.
#
# Runs serially (no xargs -P), same convention as every other *_loop.sh in
# this repo -- predictable resource usage on a shared Railway dyno beats
# parallel throughput here; a stray oversubscription bug already cost real
# debugging time once during this feature's own build (see git log).
set -uo pipefail
cd "$(dirname "$0")/.."   # repo root

INTERVAL_SECONDS="${SESSION_RESEARCH_LIVE_INTERVAL_SECONDS:-3600}"
# Same 26-pair universe as AnalogML/motif_track.py's ALL_PAIRS and
# AnalogML/refresh_m1.py's ALL_PAIRS -- kept as its own copy (shell can't
# import the Python constant) rather than a shared file, matching how those
# two already duplicate it rather than the reverse.
PAIRS="audcad audchf audjpy audnzd audusd cadjpy chfjpy euraud eurcad eurchf eurgbp eurjpy eurnzd eurusd gbpaud gbpcad gbpchf gbpjpy gbpnzd gbpusd gold nzdjpy nzdusd usdcad usdchf usdjpy"

while true; do
    echo "[session_research_live_loop] predicting $(date -u +%FT%TZ)"
    for pair in $PAIRS; do
        python3 -m SessionResearch.predict_today --pair "$pair" --live \
            || echo "[session_research_live_loop] $pair live prediction failed -- will retry next interval"
    done
    python3 -m SessionResearch.dashboard_export --all \
        || echo "[session_research_live_loop] dashboard_export failed -- will retry next interval"
    echo "[session_research_live_loop] sleeping ${INTERVAL_SECONDS}s"
    sleep "$INTERVAL_SECONDS"
done
