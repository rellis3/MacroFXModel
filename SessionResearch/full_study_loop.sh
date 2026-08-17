#!/usr/bin/env bash
# Runs the full SessionResearch study (run_study.py -- every handoff/
# spike-fade/dayflow/forecast/impulse cell, circular-shift nulls, pooled FDR
# correction; the expensive part) for every pair on a fixed interval
# (default daily). The underlying 10-year statistical findings don't shift
# meaningfully day to day, so daily is already far more often than this
# needs to re-run -- see SessionResearch/README.md's own runtime note
# (impulse.py's nulls run over ~120k M5 pivots per pair, not ~2.6k
# session-days, and dominate the per-pair time).
#
# This is the SLOW loop. live_loop.sh (hourly) is what actually keeps
# today.html's "today" number current in between these runs -- this loop
# only refreshes the underlying validated-findings numbers (range
# persistence, spike-reversal rates, etc.) that live_loop.sh's predictions
# get judged against.
set -uo pipefail
cd "$(dirname "$0")/.."   # repo root

INTERVAL_SECONDS="${SESSION_RESEARCH_FULL_INTERVAL_SECONDS:-86400}"
PAIRS="audcad audchf audjpy audnzd audusd cadjpy chfjpy euraud eurcad eurchf eurgbp eurjpy eurnzd eurusd gbpaud gbpcad gbpchf gbpjpy gbpnzd gbpusd gold nzdjpy nzdusd usdcad usdchf usdjpy"

while true; do
    echo "[session_research_full_loop] full study starting $(date -u +%FT%TZ)"
    for pair in $PAIRS; do
        if ! python3 -m SessionResearch.run_study --pair "$pair"; then
            echo "[session_research_full_loop] $pair run_study failed -- skipping to next pair"
            continue
        fi
        python3 -m SessionResearch.predict_today --pair "$pair" \
            || echo "[session_research_full_loop] $pair predict_today (historical replay) failed"
        python3 -m SessionResearch.report_html --pair "$pair" \
            || echo "[session_research_full_loop] $pair report_html failed"
    done
    python3 -m SessionResearch.dashboard_export --all \
        || echo "[session_research_full_loop] dashboard_export failed"
    echo "[session_research_full_loop] full study done $(date -u +%FT%TZ), sleeping ${INTERVAL_SECONDS}s"
    sleep "$INTERVAL_SECONDS"
done
