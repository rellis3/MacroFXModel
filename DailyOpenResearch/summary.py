"""Cross-instrument summary table from out/<pair>/results.json -> out/SUMMARY.md + SUMMARY.json"""
from __future__ import annotations
import json, os
from .data import HERE

PAIRS = ["gold", "nq", "eurusd"]


def load(p):
    with open(os.path.join(HERE, "out", p, "results.json")) as f:
        return json.load(f)


def pct(x):
    return f"{x['p']:.1f}%" if x and x.get("p") is not None else "n/a"


def r(x, key="avg_r"):
    return f"{x[key]:+.3f}" if x and x.get(key) is not None else "n/a"


def main():
    R = {p: load(p) for p in PAIRS}
    S = {}
    L = ["# Daily-open research: cross-instrument summary", "",
         "Anchor = broker daily candle (17:00 New York boundary; first bar 23:00 UK on gold/NQ). ADR = trailing 20-day median daily range. R = net of assumed cost unless 'gross'.", ""]
    w = L.append

    w("## Volatility around the open")
    w("| | " + " | ".join(R[p]["meta"]["label"] for p in PAIRS) + " |")
    w("|---|" + "---|" * 3)
    rows = [
        ("days", lambda x: str(x["meta"]["days"])),
        ("median ADR20", lambda x: f"{x['meta']['adr20_median']:.4g}"),
        ("first 60m share of day range (median)", lambda x: f"{x['minutes_since_open']['windows']['60']['range_share']['median']:.3f}"),
        ("last 60m share (control)", lambda x: f"{x['minutes_since_open']['control_last60']['range_share']['median']:.3f}"),
        ("day high/low set in first 60m", lambda x: pct(x['minutes_since_open']['windows']['60']['day_high_or_low_in_window'])),
        ("  shuffled-returns null", lambda x: pct(x['minutes_since_open']['shuffled_returns_null_first60']['day_high_or_low_in_window'])),
        ("  last 60m (control)", lambda x: pct(x['minutes_since_open']['control_last60']['day_high_or_low_in_window'])),
        ("P(day low in first 60m | up close)", lambda x: pct(x['open_level']['judas_swing']['P(day low in first 60m | up close)'])),
        ("  shuffled null", lambda x: pct(x['open_level']['judas_swing']['shuffled_null_P(low in first 60m | up close)'])),
        ("first-60m direction = rest of day", lambda x: pct(x['open_level']['first_move_vs_rest_of_day']['first_60m'])),
        ("first-120m direction = rest of day", lambda x: pct(x['open_level']['first_move_vs_rest_of_day']['first_120m'])),
        ("open gap fill rate (all)", lambda x: pct(x['open_level']['gap_at_open']['fill_rate'])),
        ("open gap fill rate, gap > 0.30 ADR", lambda x: pct(x['open_level']['gap_at_open']['by_size']['>0.30 ADR']['fill_rate'])),
        ("Monday gap fill rate", lambda x: pct(x['open_level']['gap_at_open']['by_weekday']['Mon']['fill_rate'])),
        ("never returns to open after 0.3 ADR away", lambda x: pct(x['open_level']['open_holds_after_move_away']['0.3_ADR']['never_returns_to_open'])),
    ]
    for lab, fn in rows:
        w(f"| {lab} | " + " | ".join(fn(R[p]) for p in PAIRS) + " |")
    w("")
    w("## Opening-range breakout (23:00 UK open)")
    w("| | " + " | ".join(R[p]["meta"]["label"] for p in PAIRS) + " |")
    w("|---|" + "---|" * 3)
    for win in ("or_5m", "or_15m", "or_30m", "or_60m"):
        o = {p: R[p]["orb"][win] for p in PAIRS}
        w(f"| {win}: OR size (ADR) | " + " | ".join(f"{o[p]['or_size_adr']['median']:.3f}" for p in PAIRS) + " |")
        w(f"| {win}: day closes on breakout side | " + " | ".join(pct(o[p]['day_closes_on_breakout_side']) for p in PAIRS) + " |")
        w(f"| {win}: both sides taken | " + " | ".join(pct(o[p]['false_breakout_both_sides_taken']) for p in PAIRS) + " |")
        w(f"| {win}: race +1 OR (obs / RW null) | " + " | ".join(f"{o[p]['race_plus1OR_before_opposite_edge']['p']}% / {o[p]['race_plus1OR_before_opposite_edge']['random_walk_null_pct']}%" for p in PAIRS) + " |")
        s = {p: o[p]["sims"]["target_1.0R_stop_opposite"] for p in PAIRS}
        w(f"| {win}: 1R sim net / gross avg R | " + " | ".join(f"{r(s[p])} / {r(s[p], 'avg_r_gross')} (t {s[p]['t_stat_gross']})" for p in PAIRS) + " |")
    w("")
    w("## Impulse leg -> fib pullback (legs >= 0.12 ADR, drawable within 4h of open)")
    w("| | " + " | ".join(R[p]["meta"]["label"] for p in PAIRS) + " |")
    w("|---|" + "---|" * 3)
    for p in PAIRS:
        pass
    f = {p: R[p]["fib"]["all_legs"] for p in PAIRS}
    w("| legs | " + " | ".join(str(f[p]["n_legs"]) for p in PAIRS) + " |")
    w("| continuation (new extreme before origin taken) | " + " | ".join(pct(f[p]["outcome"]["continuation"]) for p in PAIRS) + " |")
    for d in ("0.236", "0.382", "0.5", "0.618", "0.786"):
        w(f"| P(cont | pullback reached {d}) obs / RW null at bar close | " + " | ".join(f"{f[p]['P_continuation_given_pullback_reached'][d]['p']}% / {f[p]['P_continuation_given_pullback_reached'][d]['random_walk_null_at_bar_close_pct']}%" for p in PAIRS) + " |")
    for e in ("1.1", "1.2", "1.272", "1.618"):
        w(f"| extension >= {e} after continuation | " + " | ".join(pct(f[p]["extension_after_continuation"][e]) for p in PAIRS) + " |")
    for k in ("entry_0.382|stop_origin+10%|target_1.272", "entry_0.5|stop_origin|target_1.272", "entry_0.618|stop_origin|target_1.618", "entry_0.786|stop_origin|target_1.618"):
        w(f"| sim {k}: net / gross avg R | " + " | ".join(f"{r(f[p]['sims'][k])} / {r(f[p]['sims'][k], 'avg_r_gross')} (t {f[p]['sims'][k]['t_stat_gross']})" for p in PAIRS) + " |")
    w("| impulsive legs: P(cont | reached 0.5) obs / null | " + " | ".join(f"{R[p]['fib']['impulsive_legs']['P_continuation_given_pullback_reached']['0.5']['p']}% / {R[p]['fib']['impulsive_legs']['P_continuation_given_pullback_reached']['0.5']['random_walk_null_at_bar_close_pct']}%" for p in PAIRS) + " |")
    w("| grind legs: P(cont | reached 0.5) obs / null | " + " | ".join(f"{R[p]['fib']['grind_legs']['P_continuation_given_pullback_reached']['0.5']['p']}% / {R[p]['fib']['grind_legs']['P_continuation_given_pullback_reached']['0.5']['random_walk_null_at_bar_close_pct']}%" for p in PAIRS) + " |")
    w("")
    w("## Session VWAP")
    w("| | " + " | ".join(R[p]["meta"]["label"] for p in PAIRS) + " |")
    w("|---|" + "---|" * 3)
    v = {p: R[p]["vwap"] for p in PAIRS}
    w("| back to VWAP within 60m after 2-sigma touch / random bar | " + " | ".join(f"{pct(v[p]['reversion_after_band_touch']['2.0_sigma']['back_to_vwap_within_60m'])} / {pct(v[p]['reversion_after_band_touch']['baseline_random_bar']['back_to_vwap_within_60m'])}" for p in PAIRS) + " |")
    w("| |z|>=1.5 at minute 120: closes further / back through VWAP | " + " | ".join(f"{pct(v[p]['push_away_at_minute']['120']['closes_even_further_from_vwap'])} / {pct(v[p]['push_away_at_minute']['120']['closes_back_through_vwap'])}" for p in PAIRS) + " |")
    w("| VWAP bounce race obs / RW null | " + " | ".join(f"{v[p]['vwap_bounce_after_1.5sigma_push']['race_+1sig_continuation_vs_-1sig']['p']}% / {v[p]['vwap_bounce_after_1.5sigma_push']['race_+1sig_continuation_vs_-1sig']['random_walk_null_pct']}%" for p in PAIRS) + " |")
    w("| fade 2 sigma sim net / gross avg R | " + " | ".join(f"{r(v[p]['fade_2sigma_to_vwap_sim'])} / {r(v[p]['fade_2sigma_to_vwap_sim'], 'avg_r_gross')} (t {v[p]['fade_2sigma_to_vwap_sim']['t_stat_gross']})" for p in PAIRS) + " |")
    w("| side of VWAP at 07:00 UK = rest of day | " + " | ".join(pct(v[p]['side_of_vwap_predicts_rest_of_day']['at_london_open_0700UK']) for p in PAIRS) + " |")
    w("")
    w("## Asia range (23:00-07:00 UK) into London/NY")
    w("| | " + " | ".join(R[p]["meta"]["label"] for p in PAIRS) + " |")
    w("|---|" + "---|" * 3)
    a = {p: R[p]["asia_range"] for p in PAIRS}
    w("| Asia range (ADR, median) | " + " | ".join(f"{a[p]['asia_range_adr']['median']:.3f}" for p in PAIRS) + " |")
    w("| both sides taken / neither | " + " | ".join(f"{pct(a[p]['outcome']['both'])} / {pct(a[p]['outcome']['neither'])}" for p in PAIRS) + " |")
    w("| minutes from 07:00 to first break (median) | " + " | ".join(f"{a[p]['minutes_from_0700_to_first_break']['median']:.0f}" for p in PAIRS) + " |")
    w("| day closes beyond first-broken side | " + " | ".join(pct(a[p]['after_first_break']['day_closes_beyond_broken_side']) for p in PAIRS) + " |")
    w("| opposite side also taken after first break | " + " | ".join(pct(a[p]['after_first_break']['opposite_side_also_taken']) for p in PAIRS) + " |")
    w("| breakout sim net / gross | " + " | ".join(f"{r(a[p]['sims']['breakout_stop_mid_target_1x'])} / {r(a[p]['sims']['breakout_stop_mid_target_1x'], 'avg_r_gross')} (t {a[p]['sims']['breakout_stop_mid_target_1x']['t_stat_gross']})" for p in PAIRS) + " |")
    w("| sweep-fade sim net / gross | " + " | ".join(f"{r(a[p]['sims']['sweep_fade_to_other_side'])} / {r(a[p]['sims']['sweep_fade_to_other_side'], 'avg_r_gross')} (t {a[p]['sims']['sweep_fade_to_other_side']['t_stat_gross']})" for p in PAIRS) + " |")
    w("| Asia range > 0.60 ADR: breakout sim net | " + " | ".join(r(a[p]['by_asia_range_size'].get('>0.60 ADR', {}).get('sim_breakout')) for p in PAIRS) + " |")
    w("| Asia range < 0.25 ADR: opposite also taken | " + " | ".join(pct(a[p]['by_asia_range_size'].get('<0.25 ADR', {}).get('opposite_also_taken')) for p in PAIRS) + " |")
    w("")
    w("## Prior levels and first candles")
    w("| | " + " | ".join(R[p]["meta"]["label"] for p in PAIRS) + " |")
    w("|---|" + "---|" * 3)
    for lv in ("PDH", "PDL", "PDC", "PWH", "PWL"):
        x = {p: R[p]["prior_levels"][lv] for p in PAIRS}
        w(f"| {lv} touched / reject-first at touch | " + " | ".join(f"{pct(x[p]['touched_during_day'])} / {pct(x[p]['first_touch_reaction']['reject_0.15ADR_first'])}" for p in PAIRS) + " |")
    for tf in ("15m", "60m", "240m"):
        x = {p: R[p]["mtf_first_candle"][tf] for p in PAIRS}
        w(f"| first {tf} candle: rest-of-day same direction | " + " | ".join(pct(x[p]['rest_of_day_same_direction']) for p in PAIRS) + " |")
        w(f"| first {tf} candle: opposite extreme holds all day | " + " | ".join(pct(x[p]['opposite_extreme_holds_all_day']) for p in PAIRS) + " |")
    w("")
    w("## Swing high/low retest (comes back later in the day, not the immediate pullback)")
    w("| | " + " | ".join(R[p]["meta"]["label"] for p in PAIRS) + " |")
    w("|---|" + "---|" * 3)
    rt = {p: R[p]["retest"]["all"] for p in PAIRS}
    w("| retests scored (n) | " + " | ".join(f"{rt[p]['n']:,}" for p in PAIRS) + " |")
    w("| reject the level first / break it first | " + " | ".join(f"{rt[p]['reject']['p']}% / {rt[p]['break']['p']}%" for p in PAIRS) + " |")
    w("| minutes to retest (median) | " + " | ".join(f"{rt[p]['retest_minutes']['median']:.0f}" for p in PAIRS) + " |")
    w("| day closes beyond the level after retest | " + " | ".join(pct(rt[p]['close_beyond_after_retest']) for p in PAIRS) + " |")
    w("| reject sim: net / gross avg R (t of gross) | " + " | ".join(f"{r(rt[p]['sim_reject'])} / {r(rt[p]['sim_reject'],'avg_r_gross')} (t {rt[p]['sim_reject'].get('t_stat_gross')})" for p in PAIRS) + " |")
    w("| break sim: net / gross avg R (t of gross) | " + " | ".join(f"{r(rt[p]['sim_break'])} / {r(rt[p]['sim_break'],'avg_r_gross')} (t {rt[p]['sim_break'].get('t_stat_gross')})" for p in PAIRS) + " |")
    is_ = {p: R[p]["retest"]["is_oos"] for p in PAIRS}
    w("| reject rate, in-sample / out-of-sample | " + " | ".join(f"{is_[p]['IS']['reject']['p']}% / {is_[p]['OOS']['reject']['p']}%" for p in PAIRS) + " |")
    w("")
    out = os.path.join(HERE, "out", "SUMMARY.md")
    with open(out, "w") as fh:
        fh.write("\n".join(L))
    print("\n".join(L))


if __name__ == "__main__":
    main()
