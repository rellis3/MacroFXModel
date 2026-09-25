"""
DOES G1'S NET-LIQUIDITY TIDE PREDICT NQ DIRECTION?

Pre-registration: cog-replication/G1_PREREG.md (commit ecf4519, written and
committed BEFORE this ran). Verdict rule, lags and the power caveat are fixed there.

The signal is reconstructed exactly as cog-replication/engine/cogShadow.js::computeG1
computes it: net = WALCL - TGA - RRP, TIDE = 20-business-day % change, bias = its
sign, with a credit veto when HY OAS widens > 25bp over 4 weeks.

PUBLICATION LAGS are applied (the live engine reads FRED "now", which is available by
definition; a backtest aligned on observation dates would use numbers nobody had yet).

Usage: .venv/Scripts/python.exe cog-replication/test_g1_direction.py
"""
import io
import json
import urllib.request
import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent
CACHE = ROOT / "analysis" / "output"
CACHE.mkdir(parents=True, exist_ok=True)

RNG = np.random.default_rng(20260925)
MEAN_BLOCK = 60          # long blocks: a bias episode lasts months
N_BOOT = 4000
IS_FRACTION = 0.60

# lag in CALENDAR days -- "usable at t only if released <= t"
LAGS = {"WALCL": 8, "TGA": 2, "RRPONTSYD": 1, "BAMLH0A0HYM2": 1}


# ------------------------------------------------------------------ feeds
def fred(series_id, start="2014-01-01"):
    """Keyless fredgraph.csv (the repo's documented no-API-key route)."""
    url = (f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
           f"&cosd={start}")
    with urllib.request.urlopen(url, timeout=60) as r:
        raw = r.read().decode()
    df = pd.read_csv(io.StringIO(raw))
    df.columns = ["date", "value"]
    df["date"] = pd.to_datetime(df["date"])
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    return df.dropna().sort_values("date").reset_index(drop=True)


def treasury_tga():
    """Daily TGA from the Fiscal Data DTS. Two documented quirks handled:
    the closing figure sits in open_today_bal on rows LABELLED 'Closing Balance',
    and the account was renamed from 'Federal Reserve Account' around 2022."""
    cache = CACHE / "g1_tga_dts.csv"
    if cache.exists():
        df = pd.read_csv(cache)
        df["date"] = pd.to_datetime(df["date"])
        return df
    rows, page = [], 1
    while True:
        url = ("https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1"
               "/accounting/dts/operating_cash_balance"
               "?sort=record_date&page%5Bsize%5D=10000&page%5Bnumber%5D=" + str(page)
               + "&fields=record_date,account_type,close_today_bal,open_today_bal")
        with urllib.request.urlopen(url, timeout=120) as r:
            j = json.loads(r.read().decode())
        data = j.get("data", [])
        if not data:
            break
        rows.extend(data)
        if page >= j["meta"]["total-pages"]:
            break
        page += 1

    out = []
    for r in rows:
        at = (r.get("account_type") or "")
        if not (("Closing Balance" in at and "TGA" in at) or at == "Federal Reserve Account"):
            continue
        c, o = r.get("close_today_bal"), r.get("open_today_bal")
        v = None
        for cand in (c, o):
            if cand not in (None, "null", ""):
                try:
                    v = float(cand)
                    break
                except ValueError:
                    pass
        if v is not None:
            out.append({"date": r["record_date"], "value": v})
    df = pd.DataFrame(out)
    df["date"] = pd.to_datetime(df["date"])
    df = df.groupby("date", as_index=False)["value"].last().sort_values("date")
    df.to_csv(cache, index=False)
    return df


def as_of_series(df, lag_days, index):
    """Value usable at each date in `index`, i.e. the latest observation whose
    release date (observation + lag) is <= that date. This is the whole
    point-in-time discipline in one function."""
    d = df.copy()
    # pandas 3 keeps per-source datetime resolutions (ns vs us); merge_asof
    # refuses to join across them, so both sides are pinned to ns here.
    d["released"] = (pd.to_datetime(d["date"]).astype("datetime64[ns]")
                     + pd.Timedelta(days=lag_days))
    d = d.sort_values("released")
    left = pd.DataFrame({"date": pd.DatetimeIndex(index).astype("datetime64[ns]")})
    return pd.merge_asof(left.sort_values("date"),
                         d[["released", "value"]].rename(columns={"released": "date"}),
                         on="date", direction="backward")["value"].to_numpy()


# ------------------------------------------------------------------ stats
def block_idx(n, n_boot, mean_block, rng):
    p = 1.0 / mean_block
    restarts = rng.random((n_boot, n)) < p
    restarts[:, 0] = True
    anchors = rng.integers(0, n, (n_boot, n))
    k = np.arange(n)
    last = np.maximum.accumulate(np.where(restarts, k, 0), axis=1)
    start = np.take_along_axis(anchors, last, axis=1)
    return (start + (k - last)) % n


def boot_p(stat_fn, n, obs, n_boot=N_BOOT, rng=RNG):
    vals = []
    done = 0
    while done < n_boot:
        m = min(500, n_boot - done)
        for row in block_idx(n, m, MEAN_BLOCK, rng):
            vals.append(stat_fn(row))
        done += m
    v = np.array([x for x in vals if np.isfinite(x)])
    centred = v - v.mean()
    return float((np.abs(centred) >= abs(obs - 0.5)).mean()) if v.size else np.nan


def episodes(sig):
    """Independent bias episodes = runs of constant sign. The honest n."""
    s = sig[np.isfinite(sig) & (sig != 0)]
    return int(1 + (np.diff(np.sign(s)) != 0).sum()) if s.size else 0


# ------------------------------------------------------------------ build
def build():
    px = pd.read_parquet(ROOT / "Oanda Parquet Files" / "nas100_usd_d1.parquet")
    px = px[~px.index.duplicated(keep="first")].sort_index()
    idx = pd.DatetimeIndex(px.index.tz_localize(None).normalize())

    walcl = fred("WALCL")
    rrp = fred("RRPONTSYD")
    rrp["value"] *= 1000.0            # BILLIONS -> millions (the documented trap)
    hy = fred("BAMLH0A0HYM2")
    tga = treasury_tga()

    df = pd.DataFrame({"date": idx})
    df["close"] = px["close"].to_numpy()
    df["walcl"] = as_of_series(walcl, LAGS["WALCL"], idx)
    df["tga"] = as_of_series(tga, LAGS["TGA"], idx)
    df["rrp"] = as_of_series(rrp, LAGS["RRPONTSYD"], idx)
    df["hy"] = as_of_series(hy, LAGS["BAMLH0A0HYM2"], idx)

    df["net"] = df["walcl"] - df["tga"] - df["rrp"]

    # TIDE: 20-business-day % change, exactly computeG1's rocWeeks 4 x 5
    df["tide_pct"] = (df["net"] - df["net"].shift(20)) / df["net"].shift(20).abs() * 100
    df["bias"] = np.sign(df["tide_pct"])

    # FLOW: change between consecutive points, in $bn (secondary; unused live)
    df["flow_bn"] = (df["net"] - df["net"].shift(1)) / 1000.0
    df["flow_bias"] = np.where(df["flow_bn"] > 10, 1, np.where(df["flow_bn"] < -10, -1, 0))

    # credit veto: HY widened > 25bp over 4 weeks (20 business days)
    df["hy_chg_bp"] = (df["hy"] - df["hy"].shift(20)) * 100
    df["credit_stressed"] = df["hy_chg_bp"] > 25

    for h in (1, 5, 20):
        df[f"fwd_{h}"] = df["close"].shift(-h) / df["close"] - 1.0

    n_raw = len(df)
    df = df.dropna(subset=["net", "tide_pct", "fwd_20"]).reset_index(drop=True)
    return df, {"raw_rows": n_raw, "used": len(df), "dropped": n_raw - len(df)}


def evaluate(df, label, bias_col="bias", apply_veto=False):
    d = df.copy()
    if apply_veto:
        d = d[~d["credit_stressed"]]
    d = d[d[bias_col] != 0]
    split = int(len(d) * IS_FRACTION)
    out = {}
    for name, part in (("IS", d.iloc[:split]), ("OOS", d.iloc[split:])):
        res = {}
        for h in (1, 5, 20):
            b = part[bias_col].to_numpy()
            f = part[f"fwd_{h}"].to_numpy()
            ok = np.isfinite(b) & np.isfinite(f)
            b, f = b[ok], f[ok]
            if len(b) < 30:
                res[f"{h}d"] = {"n": int(len(b))}
                continue
            hit = float((np.sign(f) == b).mean())
            p = boot_p(lambda ix, b=b, f=f: (np.sign(f[ix]) == b[ix]).mean(),
                       len(b), hit)
            ic = float(np.corrcoef(part["tide_pct"].to_numpy()[ok], f)[0, 1])
            res[f"{h}d"] = {"n": int(len(b)), "hit_rate": round(hit, 4),
                            "boot_p": round(p, 4), "tide_ic": round(ic, 4),
                            "episodes": episodes(b),
                            "mean_ret_long_pct": round(float(f[b > 0].mean() * 100), 4)
                            if (b > 0).any() else None,
                            "mean_ret_short_pct": round(float(f[b < 0].mean() * 100), 4)
                            if (b < 0).any() else None}
        out[name] = res
    print(f"\n--- {label} ---")
    for name in ("IS", "OOS"):
        for h in (1, 5, 20):
            r = out[name].get(f"{h}d", {})
            if "hit_rate" not in r:
                print(f"  {name} {h:>2}d: n={r.get('n',0)} (too few)")
                continue
            print(f"  {name} {h:>2}d: n={r['n']:>4} episodes={r['episodes']:>3}  "
                  f"hit={r['hit_rate']*100:.1f}%  p={r['boot_p']:.3f}  "
                  f"IC={r['tide_ic']:+.3f}  "
                  f"long={r['mean_ret_long_pct']:+.3f}% short={r['mean_ret_short_pct']:+.3f}%")
    return out


def main():
    df, counts = build()
    print("=" * 78)
    print("G1 -- net-liquidity tide vs NQ direction")
    print("=" * 78)
    print(f"  rows: {counts['used']} used, {counts['dropped']} dropped of {counts['raw_rows']}")
    print(f"  span: {df['date'].min().date()} -> {df['date'].max().date()}")
    print(f"  net liquidity now: ${df['net'].iloc[-1]/1000:,.1f}bn")
    print(f"  bias split: LONG {int((df['bias']>0).sum())} / SHORT {int((df['bias']<0).sum())}")
    print(f"  independent bias episodes (whole sample): {episodes(df['bias'].to_numpy())}")
    print(f"  credit-stressed days: {int(df['credit_stressed'].sum())}")

    primary = evaluate(df, "PRIMARY: TIDE bias (what the live gate emits)")
    veto = evaluate(df, "SECONDARY: TIDE bias with the credit veto applied",
                    apply_veto=True)
    flow = evaluate(df, "SECONDARY: FLOW bias (emitted live, never used in the call)",
                    bias_col="flow_bias")

    # pre-registered verdict, applied mechanically to the PRIMARY OOS row
    oos = primary["OOS"]
    eps_ok = any(oos.get(f"{h}d", {}).get("episodes", 0) >= 20 for h in (1, 5, 20))
    support = any(oos.get(f"{h}d", {}).get("hit_rate", 0) >= 0.55
                  and oos.get(f"{h}d", {}).get("boot_p", 1) < 0.05 for h in (1, 5, 20))
    allnull = all(0.48 <= oos.get(f"{h}d", {}).get("hit_rate", 0.5) <= 0.52
                  for h in (1, 5, 20))
    if not eps_ok:
        verdict = "INCONCLUSIVE (underpowered: fewer than 20 bias episodes)"
    elif support:
        verdict = "SUPPORTED"
    elif allnull:
        verdict = "NULL"
    else:
        verdict = "INCONCLUSIVE"

    print("\n" + "=" * 78)
    print(f">>> PRE-REGISTERED VERDICT: {verdict}")
    print("=" * 78)

    payload = {"generated": pd.Timestamp.now("UTC").isoformat(),
               "prereg": "G1_PREREG.md", "counts": counts,
               "span": [str(df["date"].min().date()), str(df["date"].max().date())],
               "episodes_full_sample": episodes(df["bias"].to_numpy()),
               "primary_tide": primary, "secondary_credit_veto": veto,
               "secondary_flow": flow, "verdict": verdict}
    (OUT / "g1_results.json").write_text(json.dumps(payload, indent=2))
    print(f"\nwrote {OUT / 'g1_results.json'}")


if __name__ == "__main__":
    main()
