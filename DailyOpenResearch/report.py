"""Markdown report per instrument, straight from results.json."""
from __future__ import annotations


def _ci(x):
    if not x or x.get("p") is None:
        return "n/a"
    s = f"{x['p']:.1f}% [{x['lo']:.1f}-{x['hi']:.1f}] n={x['n']}"
    if x.get("p_vs_50") is not None:
        s += f" p={x['p_vs_50']:.3g}"
    if x.get("random_walk_null_pct") is not None:
        s += f" (RW null {x['random_walk_null_pct']}%)"
    return s


def _sum(x, unit=""):
    if not x or x.get("n", 0) == 0:
        return "n/a"
    return f"med {x['median']}{unit} (p25 {x['p25']}, p75 {x['p75']}, mean {x['mean']}, n={x['n']})"


def _ts(x):
    if not x or x.get("n", 0) == 0:
        return "n/a"
    g = f", gross {x['avg_r_gross']:+.3f}R (t {x['t_stat_gross']}, cost {x['cost_r_mean']:.2f}R)" if "avg_r_gross" in x else ""
    return f"n={x['n']} win {x['win_pct']}% avg {x['avg_r']:+.3f}R{g} PF {x['profit_factor']} t={x['t_stat']} maxDD {x['max_dd_r']}R"


def write_report(res: dict, path: str):
    m = res["meta"]
    L = []
    w = L.append
    w(f"# Daily-Open research: {m['label']}")
    w("")
    w(f"Data: {m['bars']:,} M1 bars, {m['from'][:10]} to {m['to'][:10]}, {m['days']} anchored days. Anchor `{m['anchor']}` = {m['anchor_def'][1]:02d}:00 {m['anchor_def'][0]}. "
      f"Median ADR20 = {m['adr20_median']:.4g}. Round-trip cost assumed = {m['cost_assumed']} (price units). Major-news days flagged: {m['major_news_days']} ({'/'.join(m['news_ccys'])}).")
    w("")
    w("All distances are in ADR units (trailing 20-day median daily range, strictly prior) unless stated. R = risk multiple net of cost. CI = Wilson 95%. 'p' = two-sided binomial test against 50%.")
    w("")
    # ---- anchors
    w("## 1. Which open? Anchor comparison")
    w("")
    w("| anchor | days | first-60m share of day range (median) | day high/low set in first 60m | first-60m direction = day close |")
    w("|---|---|---|---|---|")
    for a, r in res["anchor_comparison"].items():
        w(f"| {a} | {r['days']} | {r['first60_range_share']['median']:.3f} | {_ci(r['day_extreme_in_first60'])} | {_ci(r['first60_direction_matches_day_close'])} |")
    w("")
    # ---- profile
    p = res["minutes_since_open"]
    w("## 2. Where is the volatility? (anchor = broker open)")
    w("")
    w("| window after open | share of day range (median) | day high or low inside window | uniform expectation |")
    w("|---|---|---|---|")
    for k, r in p["windows"].items():
        w(f"| first {k}m | {r['range_share']['median']:.3f} | {_ci(r['day_high_or_low_in_window'])} | {r['expected_if_uniform_pct']}% |")
    w(f"| shuffled-returns null, first 60m | | {_ci(p['shuffled_returns_null_first60']['day_high_or_low_in_window'])} | |")
    w(f"| control: last 60m | {p['control_last60']['range_share']['median']:.3f} | {_ci(p['control_last60']['day_high_or_low_in_window'])} | |")
    w(f"| control: interior 60m at 6h | {p['control_interior60_at_6h']['range_share']['median']:.3f} | {_ci(p['control_interior60_at_6h']['day_high_or_low_in_window'])} | |")
    w("")
    w("Mean 1-minute true range in ADR units, by 15-minute block after the open (first 8h):")
    w("")
    blocks = p["m1_true_range_adr_units_by_15min_block"]
    w("| " + " | ".join(f"{int(k) // 60}h{int(k) % 60:02d}" for k in list(blocks)[:16]) + " |")
    w("|" + "---|" * 16)
    w("| " + " | ".join(f"{v * 1000:.1f}" for v in list(blocks.values())[:16]) + " |")
    w("| " + " | ".join(f"{int(k) // 60}h{int(k) % 60:02d}" for k in list(blocks)[16:]) + " |")
    w("|" + "---|" * 16)
    w("| " + " | ".join(f"{v * 1000:.1f}" for v in list(blocks.values())[16:]) + " |")
    w("")
    w("(values x1000; e.g. 20 = a 1-minute bar moves 2% of a day's range on average)")
    w("")
    hp = res["hourly_profile_uk"]
    w("Median 60-minute range by UK clock hour (price units):")
    w("")
    w("| " + " | ".join(f"{h:02d}" for h in range(24)) + " |")
    w("|" + "---|" * 24)
    w("| " + " | ".join(f"{hp[h]['h1_range_median']:.4g}" if isinstance(hp.get(h, hp.get(str(h))), dict) else "" for h in range(24)) + " |")
    w("")
    # ---- open level
    o = res["open_level"]
    w("## 3. The open as a level")
    w("")
    w("| first N minutes direction | agrees with day close (overlapping) | agrees with REST of day (overlap-free) |")
    w("|---|---|---|")
    for k in o["first_move_vs_day_close"]:
        w(f"| {k} | {_ci(o['first_move_vs_day_close'][k])} | {_ci(o['first_move_vs_rest_of_day'][k])} |")
    w("")
    w(f"- Open crosses per day: {_sum(o['open_crosses_per_day'])}")
    w(f"- Share of bars above the open: {_sum(o['share_of_bars_above_open'])}")
    w(f"- Close minus open (ADR): {_sum(o['close_minus_open_adr'])}")
    w("")
    w("Once price has moved X ADR away from the open, does it come back?")
    w("")
    w("| distance | never returns to open that day | minutes until return (when it does) |")
    w("|---|---|---|")
    for k, r in o["open_holds_after_move_away"].items():
        w(f"| {k} | {_ci(r['never_returns_to_open'])} | {_sum(r['minutes_until_return_when_it_does'])} |")
    w("")
    w("Judas swing (early extreme then trend):")
    w("")
    for k, v in o["judas_swing"].items():
        w(f"- {k}: {_ci(v)}")
    w("")
    w("Where the day's HIGH forms (% of days, 30-min buckets after open, first 24 shown):")
    w("")
    hb = o["day_high_time_30min_buckets_pct"]; lb = o["day_low_time_30min_buckets_pct"]
    keys = list(hb)[:24]
    w("| bucket | " + " | ".join(f"{int(k) // 60}h{int(k) % 60:02d}" for k in keys) + " |")
    w("|---|" + "---|" * len(keys))
    w("| high | " + " | ".join(f"{hb[k]}" for k in keys) + " |")
    w("| low | " + " | ".join(f"{lb[k]}" for k in keys) + " |")
    w("")
    if o.get("trend_day_checkpoints"):
        w("Trend-day checkpoints: at 07:00 / 13:00 UK, given travel from the open and whether price sits at the day's extreme:")
        w("")
        w("| checkpoint | travel | position | n | closes further in direction | closes back through open | further MFE (ADR, median) |")
        w("|---|---|---|---|---|---|---|")
        for cp, d in o["trend_day_checkpoints"].items():
            for tb, dd in d.items():
                for ex, r in dd.items():
                    w(f"| {cp} | {tb} | {ex} | {r['n']} | {_ci(r['day_closes_further_in_direction'])} | {_ci(r['day_closes_back_through_open'])} | {r['further_mfe_adr']['median']} |")
        w("")
    if "gap_at_open" in o:
        g = o["gap_at_open"]
        w(f"Gap at the open: |gap| {_sum(g['gap_abs_adr'])}; fill rate {_ci(g['fill_rate'])}; minutes to fill {_sum(g['minutes_to_fill'])}")
        w("")
        w("| gap size | fill rate | filled within 60m |")
        w("|---|---|---|")
        for k, r in g["by_size"].items():
            w(f"| {k} | {_ci(r['fill_rate'])} | {_ci(r['fill_within_60m'])} |")
        w("")
        w("| weekday | median gap (ADR) | fill rate |")
        w("|---|---|---|")
        for k, r in g["by_weekday"].items():
            w(f"| {k} | {r['gap_abs_adr_median']} | {_ci(r['fill_rate'])} |")
        w("")
    # ---- ORB
    w("## 4. Opening-range breakout")
    w("")
    w("| OR window | OR size (ADR, med) | breakout rate | min to break (med) | day closes on breakout side | both sides taken | race +1 OR vs opposite edge | MFE (OR units, med) |")
    w("|---|---|---|---|---|---|---|---|")
    for k, r in res["orb"].items():
        w(f"| {k} | {r['or_size_adr']['median']:.3f} | {r['breakout_rate']['p']}% | {r['minutes_to_break']['median']} | {_ci(r['day_closes_on_breakout_side'])} | {_ci(r['false_breakout_both_sides_taken'])} | {_ci(r['race_plus1OR_before_opposite_edge'])} | {r['mfe_in_or_units']['median']} |")
    w("")
    w("Trade sims (entry = first close outside OR, stop = opposite OR edge, exit at day end):")
    w("")
    w("| OR window | sim | all | IS (first 60%) | OOS (last 40%) |")
    w("|---|---|---|---|---|")
    for k, r in res["orb"].items():
        for sk, sv in r["sims"].items():
            tk = sk.split("_stop")[0]
            w(f"| {k} | {sk} | {_ts(sv)} | {_ts(r['sims_is_oos']['IS'].get(tk))} | {_ts(r['sims_is_oos']['OOS'].get(tk))} |")
    w("")
    for cond in ("by_or_size", "by_break_timing", "by_weekday", "by_vol_regime", "by_news_day", "by_year"):
        w(f"ORB conditioning - {cond.replace('_', ' ')} (30m OR):")
        w("")
        w("| group | n | closes on side | both sides taken | sim 1R |")
        w("|---|---|---|---|---|")
        for g, r in res["orb"]["or_30m"][cond].items():
            w(f"| {g} | {r['n']} | {_ci(r['closes_on_side'])} | {_ci(r['false_break'])} | {_ts(r['sim_1.0R'])} |")
        w("")
    # ---- fib
    f = res["fib"]
    w("## 5. Impulse leg then fib pullback")
    w("")
    w(f"Legs >= {f['theta_adr']} ADR whose fib became drawable (23.6% pullback) within {f['max_leg_end_min']} min of the open. Depth = fraction of the leg given back (TradingView low->high fib shows 1 - depth).")
    w("")
    for key in ("all_legs", "impulsive_legs", "grind_legs", "first_leg_of_day_only"):
        b = f[key]
        w(f"**{key.replace('_', ' ')}**: n={b['n_legs']}, leg {_sum(b['leg_size_adr'], ' ADR')}, duration {_sum(b['leg_minutes'], ' min')}. "
          f"Continuation {b['outcome']['continuation']['p']}%, failed {b['outcome']['failed']['p']}%.")
        w("")
        w("| pullback reached | P(continuation to new extreme) | random-walk null (1-d) | RW null at actual bar close |")
        w("|---|---|---|---|")
        for d, r in b["P_continuation_given_pullback_reached"].items():
            w(f"| {d} | {r['p']}% [{r['lo']}-{r['hi']}] n={r['n']} | {r['random_walk_null_pct']}% | {r['random_walk_null_at_bar_close_pct']}% |")
        w("")
        w("Deepest pullback that HELD (continuations only): " + ", ".join(f"{k}: {v['p']}%" for k, v in b["deepest_pullback_before_resolution"].items() if v.get("p")))
        w("")
        w("Extension reached after continuation: " + ", ".join(f">= {k}: {v['p']}%" for k, v in b["extension_after_continuation"].items()))
        w("")
        if key == "all_legs":
            w("Trade sims (limit at depth, stop tight = +0.236 depth / at origin / origin+10%, targets old extreme / 1.272 / 1.618):")
            w("")
            w("| sim | result |")
            w("|---|---|")
            for sk, sv in sorted(b["sims"].items(), key=lambda kv: -(kv[1].get("avg_r") or -9)):
                w(f"| {sk} | {_ts(sv)} |")
            w("")
    w("IS / OOS continuation given pullback reached:")
    w("")
    w("| depth | IS | OOS |")
    w("|---|---|---|")
    for d in f["is_oos"]["IS"]["P_cont_given_reached"]:
        a_, b_ = f['is_oos']['IS']['P_cont_given_reached'][d], f['is_oos']['OOS']['P_cont_given_reached'][d]
        w(f"| {d} | {a_['p']}% n={a_['n']} (null {a_['random_walk_null_at_bar_close_pct']}%) | {b_['p']}% n={b_['n']} (null {b_['random_walk_null_at_bar_close_pct']}%) |")
    w("")
    for cond in ("by_leg_size", "by_regime", "by_direction", "by_news_day"):
        if f.get(cond):
            w(f"Fib conditioning - {cond.replace('_', ' ')}:")
            w("")
            w("| group | n | continuation (or P(cont|reached)) | best sim |")
            w("|---|---|---|---|")
            for g, r in f[cond].items():
                best = max(r["sims"].items(), key=lambda kv: kv[1].get("avg_r") or -9) if r["sims"] else (None, None)
                c = r.get("continuation") or r.get("P_cont_given_reached", {}).get("0.5")
                w(f"| {g} | {r['n']} | {_ci(c)} | {best[0]}: {_ts(best[1])} |")
            w("")
    w("Fib by year (continuation rate, best 0.382-entry sim):")
    w("")
    w("| year | n | continuation | entry 0.382, stop origin+10%, target 1.618 |")
    w("|---|---|---|---|")
    for y, r in f["by_year"].items():
        w(f"| {y} | {r['n']} | {_ci(r['continuation'])} | {_ts(r['sims'].get('entry_0.382|stop_origin+10%|target_1.618'))} |")
    w("")
    # ---- vwap
    v = res["vwap"]
    w("## 6. Session VWAP and bands")
    w("")
    w("| event | n | back to VWAP within 60m | within 120m | by day end |")
    w("|---|---|---|---|---|")
    for k, r in v["reversion_after_band_touch"].items():
        w(f"| {k} | {r['n']} | {_ci(r['back_to_vwap_within_60m'])} | {_ci(r['within_120m'])} | {_ci(r['by_end_of_day'])} |")
    w("")
    w("| checkpoint | days with abs(z) >= 1.5 | closes even further from VWAP | closes back through VWAP | z p10/p90 |")
    w("|---|---|---|---|---|")
    for k, r in v["push_away_at_minute"].items():
        w(f"| minute {k} | {r['n_days_with_|z|>=1.5']} | {_ci(r['closes_even_further_from_vwap'])} | {_ci(r['closes_back_through_vwap'])} | {r['z_distribution']['p10']} / {r['z_distribution']['p90']} |")
    w("")
    b = v["vwap_bounce_after_1.5sigma_push"]
    w(f"- VWAP bounce after a 1.5-sigma push (race +1 sigma vs -1 sigma): {_ci(b['race_+1sig_continuation_vs_-1sig'])}; sim: {_ts(b['sim_1sig_stop_1sig_target'])}")
    w(f"- Fade 2 sigma back to VWAP (stop 3.5 sigma): {_ts(v['fade_2sigma_to_vwap_sim'])}")
    for k, r in v["side_of_vwap_predicts_rest_of_day"].items():
        w(f"- Side of VWAP predicts rest of day, {k}: {_ci(r)}")
    w("")
    w("| year | fade 2 sigma | VWAP bounce |")
    w("|---|---|---|")
    for y, r in v["by_year"].items():
        w(f"| {y} | {_ts(r['fade_2sig'])} | {_ts(r['bounce'])} |")
    w("")
    # ---- asia
    a = res["asia_range"]
    w("## 7. Asia range (23:00-07:00 UK) into London / NY")
    w("")
    w(f"Asia range: {_sum(a['asia_range_adr'], ' ADR')}. Outcomes: high only {a['outcome']['high_only']['p']}%, low only {a['outcome']['low_only']['p']}%, both {a['outcome']['both']['p']}%, neither {a['outcome']['neither']['p']}%. "
      f"Minutes from 07:00 to first break: {_sum(a['minutes_from_0700_to_first_break'])}.")
    w("")
    ab = a["after_first_break"]
    w(f"After the first break: day closes beyond the broken side {_ci(ab['day_closes_beyond_broken_side'])}; closes back inside at some point {_ci(ab['closes_back_inside_at_some_point'])}; "
      f"opposite side also taken {_ci(ab['opposite_side_also_taken'])}; MFE {_sum(ab['mfe_in_asia_range_units'], ' ranges')}.")
    w("")
    w(f"- Breakout sim (first close beyond, stop mid-range, target 1x range): {_ts(a['sims']['breakout_stop_mid_target_1x'])}")
    w(f"- Sweep-fade sim (first close back inside after a break, stop beyond sweep extreme, target other side; avg RR {a['sims']['sweep_fade_avg_rr']['median']}): {_ts(a['sims']['sweep_fade_to_other_side'])}")
    w(f"- IS: breakout {_ts(a['sims_is_oos']['IS']['breakout'])}; sweep-fade {_ts(a['sims_is_oos']['IS']['sweep_fade'])}")
    w(f"- OOS: breakout {_ts(a['sims_is_oos']['OOS']['breakout'])}; sweep-fade {_ts(a['sims_is_oos']['OOS']['sweep_fade'])}")
    w("")
    for cond in ("by_asia_range_size", "by_break_timing", "by_weekday", "by_vol_regime", "by_news_day", "by_year"):
        w(f"Asia conditioning - {cond.replace('_', ' ')}:")
        w("")
        w("| group | n | closes beyond | opposite also taken | breakout sim | sweep-fade sim |")
        w("|---|---|---|---|---|---|")
        for g, r in a[cond].items():
            w(f"| {g} | {r['n']} | {_ci(r['closes_beyond'])} | {_ci(r['opposite_also_taken'])} | {_ts(r['sim_breakout'])} | {_ts(r['sim_sweep_fade'])} |")
        w("")
    # ---- levels
    w("## 8. Prior-day / prior-week levels")
    w("")
    w("| level | days | distance from open (ADR, med) | touched | min to touch (med) | reject first (0.15 ADR race) | break first | day closes beyond after touch |")
    w("|---|---|---|---|---|---|---|---|")
    for k, r in res["prior_levels"].items():
        fr = r["first_touch_reaction"]
        w(f"| {k} | {r['n_days_level_away_from_open']} | {r['distance_from_open_adr']['median']} | {_ci(r['touched_during_day'])} | {r['minutes_to_touch']['median']} | {_ci(fr['reject_0.15ADR_first'])} | {_ci(fr['break_0.15ADR_first'])} | {_ci(r['day_closes_beyond_after_touch'])} |")
    w("")
    w("Touch rate by distance from the open:")
    w("")
    w("| level | distance | n | touched | reject first |")
    w("|---|---|---|---|---|")
    for k, r in res["prior_levels"].items():
        for d, rr in r["touch_rate_by_distance"].items():
            w(f"| {k} | {d} | {rr['n']} | {_ci(rr['touched'])} | {_ci(rr['reject_first'])} |")
    w("")
    # ---- mtf
    w("## 9. First candle of the day, by timeframe")
    w("")
    w("| TF | n | rest of day same direction | opposite extreme holds all day | day extends beyond candle | extension (candle ranges, med) | candle range (ADR, med) |")
    w("|---|---|---|---|---|---|---|")
    for k, r in res["mtf_first_candle"].items():
        w(f"| {k} | {r['n']} | {_ci(r['rest_of_day_same_direction'])} | {_ci(r['opposite_extreme_holds_all_day'])} | {_ci(r['day_extends_beyond_candle_in_its_direction'])} | {r['extension_in_candle_range_units']['median']} | {r['candle_range_adr']['median']} |")
    w("")
    w("| TF | body ratio | n | rest same | opposite extreme holds |")
    w("|---|---|---|---|---|")
    for k, r in res["mtf_first_candle"].items():
        for g, rr in r["by_body_ratio"].items():
            w(f"| {k} | {g} | {rr['n']} | {_ci(rr['rest_same'])} | {_ci(rr['opp_held'])} |")
    w("")
    w("| TF | candle range | n | rest same | opposite extreme holds |")
    w("|---|---|---|---|---|")
    for k, r in res["mtf_first_candle"].items():
        for g, rr in r["by_range_adr"].items():
            w(f"| {k} | {g} | {rr['n']} | {_ci(rr['rest_same'])} | {_ci(rr['opp_held'])} |")
    w("")
    with open(path, "w") as fh:
        fh.write("\n".join(L))
