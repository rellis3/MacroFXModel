"""
confluence_oi_regime — Phase 2, filter: "was dealer gamma positioning PIN or
BREAKOUT that day?" The direct test of the mentor's suggestion (use OI as an
external factor for pinning-vs-acceleration): does splitting the existing
fade-vs-continuation base rates by that day's archived gamma regime separate
the outcomes the way the mechanism predicts (pin days favor fade, breakout
days favor follow)?

Mirrors confluence_budget.py's bucket structure exactly, with one real
difference from every other confluence_*.py filter in this directory: regime
is NOT a per-touch feature computed from the touch's own bars (like
budget_used/velocity) — it's an external, date-keyed series from the OI
options-positioning archive (server.js's oi_history, extended in the Phase B
archival-schema change to store `regime` per pair per day via
js/oi.js's oiRegimeAtSpot). So this script joins touch records to that
series BY DATE rather than reading a field touch_engine already stamped.

SCOPE: nq and gold ONLY. OI/GEX data comes from CME QuikStrike option-chain
pastes, which realistically only covers instruments with real listed-options
liquidity — not spot FX. cogShadow.js and oiZones.js both already scope
themselves the same way, for the same reason. Building FX coverage here would
just produce buckets that are silently all-neutral/empty.

DATA GAP THIS SCRIPT CANNOT CLOSE: CME serves no OI history, so oi_history
only has whatever days have been captured SINCE the Phase B archival change
shipped — it grows forward only, never backward. Every run of this script
until then is a small-N pilot read, not a finding. Report n per bucket and
withhold conclusions below MIN_REGIME_DAYS, same discipline as
cog-replication/engine/oiSignalCheck.js's own n<25 caveat.

INPUT: a local JSON file mapping levelEngine instrument name -> {date: regime}
(regime one of 'pin'/'breakout'/'neutral'), e.g.:
    {"nq": {"2026-08-19": "pin", ...}, "gold": {"2026-08-19": "breakout", ...}}
Produced by hitting the already-existing GET /api/oi-history?pair=<display>
endpoint per instrument (NAS100_USD for nq, XAU/USD for gold) and pulling
{date, regime} off each entry's `history` array — kept as a separate export
step (not fetched live from this script) so the Python side of levelEngine
stays offline/pure like every other confluence_*.py file here.

Usage: python3 confluence_oi_regime.py [regime_json_path] [theta] [horizon_min] [min_touches]
"""
import sys
import os
import json
import csv

from run_all import INSTRUMENTS, CALCS
from base_rate import CALCS as CALC_MODULES, summarize, LEVELS
from touch_engine import scan_all
from level_frame import day_date
from cost_model import cost_adjust, summarize_costed

OI_SCOPE = {'nq', 'gold'}   # the only instruments OI/GEX data can plausibly speak to
MIN_REGIME_DAYS = 25        # below this, report but flag "too small to conclude anything"

BUCKETS = [
    ('pin',      lambda r: r == 'pin'),
    ('breakout', lambda r: r == 'breakout'),
]


def _load_regime_map(path):
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def _stamp_regime(records, frame, regime_by_date):
    """Join each touch record to that day's archived regime by date (regime is
    an external date-keyed series, not something touch_engine computed from
    the touch's own bars). Mutates `regime` onto each record in place."""
    date_cache = {}
    for r in records:
        di = r['day_i']
        if di not in date_cache:
            date_cache[di] = day_date(frame, di)
        r['regime'] = regime_by_date.get(date_cache[di])
    return records


def bucket_rows(name, calc, asset_class, records, split, min_touches, n_regime_days):
    rows = []
    small_n = n_regime_days < MIN_REGIME_DAYS
    for bucket_name, pred in BUCKETS:
        sub = [r for r in records if r['regime'] is not None and pred(r['regime'])]
        is_r = [r for r in sub if r['day_i'] < split]
        oos_r = [r for r in sub if r['day_i'] >= split]
        gross_is = summarize(is_r, verbose=False)
        # Small-N graceful degrade: an OOS split needs enough archived regime days
        # to have any on both sides. Early on there won't be — report IS-only
        # rather than silently producing an empty/misleading OOS row.
        gross_oos = summarize(oos_r, verbose=False) if not small_n else {}
        costed_is = summarize_costed(cost_adjust(is_r, name, asset_class), LEVELS)
        costed_oos = summarize_costed(cost_adjust(oos_r, name, asset_class), LEVELS) if not small_n else {}

        for level in LEVELS:
            is_row = gross_is.get(level)
            if not is_row or is_row['n_touches'] < min_touches:
                continue
            is_edge = is_row['follow_win_rate'] - is_row['fade_win_rate']
            is_c = costed_is.get(level)
            if not is_c:
                continue

            if small_n:
                # Pilot read: no OOS split yet, no sign-agreement filter (nothing
                # to agree WITH) -- report both sides' costed mean-R as-is, let the
                # reader see the raw shape rather than pre-filtering a 1-fold result.
                side = 'follow' if is_edge > 0 else 'fade'
                rows.append(dict(
                    instrument=name, calc=calc, level=level, bucket=bucket_name, side=side,
                    pilot=True, n_regime_days=n_regime_days,
                    is_wr=is_row['follow_win_rate'] if side == 'follow' else is_row['fade_win_rate'],
                    is_net_r=round(is_c[f'{side}_mean_net_r'], 3), is_n=is_row['n_touches'],
                ))
                continue

            oos_row = gross_oos.get(level)
            if not oos_row or oos_row['n_touches'] < min_touches:
                continue
            oos_edge = oos_row['follow_win_rate'] - oos_row['fade_win_rate']
            if is_edge == 0 or oos_edge == 0 or (is_edge > 0) != (oos_edge > 0):
                continue
            side = 'follow' if oos_edge > 0 else 'fade'
            oos_c = costed_oos.get(level)
            if not oos_c:
                continue
            is_net_r, oos_net_r = is_c[f'{side}_mean_net_r'], oos_c[f'{side}_mean_net_r']
            if is_net_r <= 0 or oos_net_r <= 0:
                continue

            rows.append(dict(
                instrument=name, calc=calc, level=level, bucket=bucket_name, side=side,
                pilot=False, n_regime_days=n_regime_days,
                is_wr=is_row['follow_win_rate'] if side == 'follow' else is_row['fade_win_rate'],
                oos_wr=oos_row['follow_win_rate'] if side == 'follow' else oos_row['fade_win_rate'],
                is_net_r=round(is_net_r, 3), oos_net_r=round(oos_net_r, 3),
                is_n=is_row['n_touches'], oos_n=oos_row['n_touches'],
            ))
    return rows


def main():
    regime_path = sys.argv[1] if len(sys.argv) > 1 else 'oi_regime_by_date.json'
    theta = float(sys.argv[2]) if len(sys.argv) > 2 else 0.25
    horizon = int(sys.argv[3]) if len(sys.argv) > 3 else 60
    min_touches = int(sys.argv[4]) if len(sys.argv) > 4 else 30

    regime_map = _load_regime_map(regime_path)
    if not regime_map:
        print(f"no regime export found at '{regime_path}' -- see this file's docstring for how to "
              f"produce one from GET /api/oi-history. Nothing to bucket; exiting.")
        return

    all_rows = []
    for name, path, asset_class in INSTRUMENTS:
        if name not in OI_SCOPE:
            continue
        if not os.path.exists(path):
            continue
        regime_by_date = regime_map.get(name, {})
        n_regime_days = len(regime_by_date)
        if not n_regime_days:
            print(f'{name}: no regime data in export -- skipping')
            continue
        for calc in CALCS:
            print(f'scanning {name} [{calc}] (oi-regime-bucketed, {n_regime_days} regime day(s) archived) ...')
            frame = CALC_MODULES[calc].build_level_frame(path, asset_class)
            records = scan_all(frame, theta=theta, horizon_min=horizon)
            _stamp_regime(records, frame, regime_by_date)
            split = frame['daily']['day_idx'].size // 2
            rows = bucket_rows(name, calc, asset_class, records, split, min_touches, n_regime_days)
            all_rows.extend(rows)

    if not all_rows:
        print('\nno bucket survived (or no regime-tagged touches at all -- expected while the '
              'archive is still young). Re-run this periodically as oi_history accrues.\n')
        return

    all_rows.sort(key=lambda r: r.get('oos_net_r', r.get('is_net_r', 0)), reverse=True)
    with open('leaderboard_oi_regime.json', 'w') as f:
        json.dump(all_rows, f, indent=2)
    with open('leaderboard_oi_regime.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=sorted({k for r in all_rows for k in r.keys()}))
        w.writeheader()
        w.writerows(all_rows)

    pilot_rows = [r for r in all_rows if r.get('pilot')]
    if pilot_rows:
        print(f'\n{len(pilot_rows)} PILOT row(s) -- fewer than {MIN_REGIME_DAYS} archived regime days, '
              f'IS-only, no sign-agreement filter. Directional hint only; do NOT act on these.\n')
    solid_rows = [r for r in all_rows if not r.get('pilot')]
    print(f'{len(solid_rows)} IS/OOS-agreeing, cost-positive survivor(s).\n')
    print(f"{'instrument':<10}{'calc':<10}{'level':<14}{'bucket':<10}{'side':<8}{'pilot':<7}"
          f"{'IS WR':>7}{'net R':>8}{'n':>6}")
    for r in all_rows[:50]:
        net_r = r.get('oos_net_r', r.get('is_net_r'))
        n = r.get('oos_n', r.get('is_n'))
        print(f"{r['instrument']:<10}{r['calc']:<10}{r['level']:<14}{r['bucket']:<10}{r['side']:<8}"
              f"{'Y' if r.get('pilot') else '':<7}{r['is_wr']:>7}{net_r:>8}{n:>6}")
    print('\nwrote leaderboard_oi_regime.json / leaderboard_oi_regime.csv')


if __name__ == '__main__':
    main()
