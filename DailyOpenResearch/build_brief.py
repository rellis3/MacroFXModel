"""Build the single-file HTML research brief from out/<pair>/results.json."""
from __future__ import annotations
import json, os
from .data import HERE

PAIRS = ["gold", "nq", "eurusd"]
LABELS = {"gold": "Gold", "nq": "Nasdaq", "eurusd": "EURUSD"}


def load(p):
    with open(os.path.join(HERE, "out", p, "results.json")) as f:
        return json.load(f)


def extract():
    R = {p: load(p) for p in PAIRS}
    D = {"pairs": PAIRS, "labels": LABELS, "per": {}}
    for p in PAIRS:
        x = R[p]
        prof = x["minutes_since_open"]["m1_true_range_adr_units_by_15min_block"]
        hb = x["open_level"]["day_high_time_30min_buckets_pct"]; lb = x["open_level"]["day_low_time_30min_buckets_pct"]
        ext = [{"m": int(k), "v": round(hb[k] + lb.get(k, 0), 1)} for k in hb]
        fib = x["fib"]
        def fibrow(block):
            t = fib[block]["P_continuation_given_pullback_reached"]
            return [{"d": d, "obs": t[d]["p"], "null": t[d]["random_walk_null_at_bar_close_pct"], "n": t[d]["n"]} for d in ("0.236", "0.382", "0.5", "0.618", "0.786")]
        sims = []
        def add(name, s):
            if s and s.get("n"):
                sims.append({"name": name, "n": s["n"], "net": s["avg_r"], "gross": s.get("avg_r_gross"), "cost": s.get("cost_r_mean"), "t": s.get("t_stat_gross"), "win": s["win_pct"]})
        add("ORB 30m, 1R target", x["orb"]["or_30m"]["sims"]["target_1.0R_stop_opposite"])
        add("ORB 60m, 2R target", x["orb"]["or_60m"]["sims"]["target_2.0R_stop_opposite"])
        add("Fib 0.5 pullback, stop origin, 1.272", fib["all_legs"]["sims"]["entry_0.5|stop_origin|target_1.272"])
        add("Fib 0.618 pullback, stop origin, 1.618", fib["all_legs"]["sims"]["entry_0.618|stop_origin|target_1.618"])
        add("Fib 0.786 pullback, stop origin, 1.618", fib["all_legs"]["sims"]["entry_0.786|stop_origin|target_1.618"])
        add("Fade 2σ back to VWAP", x["vwap"]["fade_2sigma_to_vwap_sim"])
        add("VWAP bounce after 1.5σ push", x["vwap"]["vwap_bounce_after_1.5sigma_push"]["sim_1sig_stop_1sig_target"])
        add("Asia range breakout, 1x range", x["asia_range"]["sims"]["breakout_stop_mid_target_1x"])
        add("Asia range sweep-fade", x["asia_range"]["sims"]["sweep_fade_to_other_side"])
        a = x["asia_range"]["outcome"]
        D["per"][p] = {
            "meta": {"days": x["meta"]["days"], "adr": x["meta"]["adr20_median"], "cost": x["meta"]["cost_assumed"], "from": x["meta"]["from"][:10], "to": x["meta"]["to"][:10]},
            "profile": [{"m": int(k), "v": round(v * 1000, 1)} for k, v in prof.items()],
            "extremes": ext,
            "first60": {"share": x["minutes_since_open"]["windows"]["60"]["range_share"]["median"],
                        "last_share": x["minutes_since_open"]["control_last60"]["range_share"]["median"],
                        "ext": x["minutes_since_open"]["windows"]["60"]["day_high_or_low_in_window"]["p"],
                        "ext_null": x["minutes_since_open"]["shuffled_returns_null_first60"]["day_high_or_low_in_window"]["p"]},
            "judas": {"obs": x["open_level"]["judas_swing"]["P(day low in first 60m | up close)"]["p"],
                      "null": x["open_level"]["judas_swing"]["shuffled_null_P(low in first 60m | up close)"]["p"]},
            "firstmove": {k: v["p"] for k, v in x["open_level"]["first_move_vs_rest_of_day"].items()},
            "holds": {k: v["never_returns_to_open"]["p"] for k, v in x["open_level"]["open_holds_after_move_away"].items()},
            "gap": {"fill": x["open_level"]["gap_at_open"]["fill_rate"]["p"], "big": x["open_level"]["gap_at_open"]["by_size"][">0.30 ADR"]["fill_rate"]["p"],
                    "mon": x["open_level"]["gap_at_open"]["by_weekday"]["Mon"]["fill_rate"]["p"]},
            "orb": {w: {"or": x["orb"][w]["or_size_adr"]["median"], "close": x["orb"][w]["day_closes_on_breakout_side"]["p"], "both": x["orb"][w]["false_breakout_both_sides_taken"]["p"],
                        "race": x["orb"][w]["race_plus1OR_before_opposite_edge"]["p"], "race_null": x["orb"][w]["race_plus1OR_before_opposite_edge"]["random_walk_null_pct"]} for w in ("or_5m", "or_15m", "or_30m", "or_60m")},
            "fib": {"all": fibrow("all_legs"), "impulsive": fibrow("impulsive_legs"), "grind": fibrow("grind_legs"), "n": fib["all_legs"]["n_legs"],
                    "ext": {k: v["p"] for k, v in fib["all_legs"]["extension_after_continuation"].items()},
                    "is": {d: fib["is_oos"]["IS"]["P_cont_given_reached"][d]["p"] - fib["is_oos"]["IS"]["P_cont_given_reached"][d]["random_walk_null_at_bar_close_pct"] for d in ("0.382", "0.5", "0.618")},
                    "oos": {d: fib["is_oos"]["OOS"]["P_cont_given_reached"][d]["p"] - fib["is_oos"]["OOS"]["P_cont_given_reached"][d]["random_walk_null_at_bar_close_pct"] for d in ("0.382", "0.5", "0.618")}},
            "vwap": {"rev2": x["vwap"]["reversion_after_band_touch"]["2.0_sigma"]["back_to_vwap_within_60m"]["p"],
                     "rev_base": x["vwap"]["reversion_after_band_touch"]["baseline_random_bar"]["back_to_vwap_within_60m"]["p"],
                     "further120": x["vwap"]["push_away_at_minute"]["120"]["closes_even_further_from_vwap"]["p"],
                     "through120": x["vwap"]["push_away_at_minute"]["120"]["closes_back_through_vwap"]["p"],
                     "london": x["vwap"]["side_of_vwap_predicts_rest_of_day"]["at_london_open_0700UK"]["p"]},
            "asia": {"range": x["asia_range"]["asia_range_adr"]["median"], "high": a["high_only"]["p"], "low": a["low_only"]["p"], "both": a["both"]["p"], "neither": a["neither"]["p"],
                     "beyond": x["asia_range"]["after_first_break"]["day_closes_beyond_broken_side"]["p"], "opp": x["asia_range"]["after_first_break"]["opposite_side_also_taken"]["p"],
                     "mins": x["asia_range"]["minutes_from_0700_to_first_break"]["median"]},
            "levels": {lv: {"touch": x["prior_levels"][lv]["touched_during_day"]["p"], "reject": x["prior_levels"][lv]["first_touch_reaction"]["reject_0.15ADR_first"]["p"]} for lv in ("PDH", "PDL", "PDC", "PWH", "PWL")},
            "mtf": {tf: {"same": x["mtf_first_candle"][tf]["rest_of_day_same_direction"]["p"], "hold": x["mtf_first_candle"][tf]["opposite_extreme_holds_all_day"]["p"]} for tf in ("15m", "60m", "240m")},
            "sims": sims,
        }
    return D


def main():
    D = extract()
    tpl = open(os.path.join(HERE, "brief_template.html")).read()
    html = tpl.replace("/*__DATA__*/", "const DATA = " + json.dumps(D, separators=(",", ":")) + ";")
    out = os.path.join(HERE, "out", "daily-open-brief.html")
    with open(out, "w") as f:
        f.write(html)
    print(out, len(html))


if __name__ == "__main__":
    main()
