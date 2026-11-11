"""level-local-gamma, step 2: levels, first touches and local gamma at the touch. NO outcome is computed here.

Prereg: forge/LEVEL_LOCAL_GAMMA_PREREG.md (section 3). Needs build_books.py first.

    python scripts/level-local-gamma/events.py NAS100_USD SPX500_USD ...

Writes analysis/output/level-local-gamma/cache/events_<PAIR>.parquet and cache/m1_<PAIR>.npz (the session path in
book units, reused by score.py). Book units = CME units: the CFD path is used as is for prices (levels and walls are
mapped into CFD space through the daily settlement-minute basis); inverted FX pairs are turned into 1/price first.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "analysis/output/level-local-gamma/cache"
ARCH = ROOT / "analysis/output/day-reconstruction/archive"
M1DIR = ROOT / "Oanda Parquet Files"
sys.path.insert(0, str(ROOT / "oi_research_book/scripts"))
from pair_config import PAIR_CONFIG  # noqa: E402

SEED = 20261111
LOCKBOX = pd.Timestamp("2026-08-21")
ORDER = ["NAS100_USD", "SPX500_USD", "XAU_USD", "EUR_USD", "GBP_USD", "AUD_USD", "USD_JPY", "USD_CAD", "USD_CHF"]
N_RANDOM = 10
MAX_SESS = 4000
YR = 365.25 * 86400.0
TAU_FLOOR = 600.0 / YR

INST = {
    "NAS100_USD": dict(m1="nas100_usd_m1.parquet", arch="NQ", close=("16:00", "America/New_York"), band=0.15),
    "SPX500_USD": dict(m1="spx500_m1.parquet", arch=None, close=("16:00", "America/New_York"), band=0.15),
    "XAU_USD": dict(m1="xauusd_m1.parquet", arch="GOLD", close=("13:30", "America/New_York"), band=0.15),
    "EUR_USD": dict(m1="eurusd_m1.parquet", arch="EURUSD", close=("16:00", "Europe/London"), band=0.06),
    "GBP_USD": dict(m1="gbpusd_m1.parquet", arch=None, close=("16:00", "Europe/London"), band=0.06),
    "AUD_USD": dict(m1="audusd_m1.parquet", arch=None, close=("16:00", "Europe/London"), band=0.06),
    "USD_JPY": dict(m1="usdjpy_m1.parquet", arch=None, close=("16:00", "Europe/London"), band=0.06),
    "USD_CAD": dict(m1="usdcad_m1.parquet", arch=None, close=("16:00", "Europe/London"), band=0.06),
    "USD_CHF": dict(m1="usdchf_m1.parquet", arch=None, close=("16:00", "Europe/London"), band=0.06),
}
LADDER = [f"lvl_{f}_{r}" for f in ("OH", "OL") for r in ("p50", "p75", "p90")]


def random_draws():
    """One generator, instruments and sessions in a fixed order (prereg): |d| ~ U(0.10, 2.00), side by coin."""
    rng = np.random.default_rng(SEED)
    out = {}
    for p in ORDER:
        mag = rng.uniform(0.10, 2.00, size=(MAX_SESS, N_RANDOM))
        side = np.where(rng.random((MAX_SESS, N_RANDOM)) < 0.5, -1.0, 1.0)
        out[p] = mag * side
    return out


def load_m1(pair):
    df = pd.read_parquet(M1DIR / INST[pair]["m1"])
    idx = df.index if isinstance(df.index, pd.DatetimeIndex) else pd.to_datetime(df["time"])
    if idx.tz is None:
        idx = idx.tz_localize("UTC")
    o, h, l, c = (df[x].to_numpy(float) for x in ("open", "high", "low", "close"))
    if PAIR_CONFIG[pair]["inverted"]:
        o, h, l, c = 1 / o, 1 / l, 1 / h, 1 / c
    ts = idx.tz_convert("UTC").tz_localize(None).as_unit("s").asi8.astype(np.int64)
    m = np.isfinite(o) & np.isfinite(h) & np.isfinite(l) & np.isfinite(c)
    return idx[m], ts[m], o[m], h[m], l[m], c[m]


def sessions_and_sigma(idx, ts, o, c):
    lon = idx.tz_convert("Europe/London")
    ldate = lon.normalize().tz_localize(None)
    keep = (lon.hour < 22) & (lon.dayofweek < 5)
    # sessions: London date, 00:00-22:00
    sd = pd.Series(np.arange(len(ts)))[keep]
    grp = pd.Series(ldate[keep]).groupby(ldate[keep].values)
    first = sd.groupby(ldate[keep].values).min()
    last = sd.groupby(ldate[keep].values).max()
    sess = pd.DataFrame({"i0": first.values, "i1": last.values + 1}, index=pd.DatetimeIndex(first.index))
    # NY-close daily bars (17:00 New York); a bar at 17:00 NY belongs to the next NY day
    ny = idx.tz_convert("America/New_York")
    key = (ny + pd.Timedelta(hours=7)).normalize().tz_localize(None)
    dd = pd.DataFrame({"c": c, "k": key}).groupby("k").agg(c=("c", "last"), n=("c", "size"))
    dd = dd[(dd["n"] >= 60) & (dd.index.dayofweek < 5)]
    close_t = (pd.DatetimeIndex(dd.index) + pd.Timedelta(hours=17)).tz_localize("America/New_York").tz_convert("UTC")
    dd["close_ts"] = close_t.tz_localize(None).as_unit("s").asi8
    dd["r"] = np.log(dd["c"]).diff()
    dd["sig"] = dd["r"].rolling(20).std()
    t_open = ts[sess["i0"].to_numpy()]
    j = np.searchsorted(dd["close_ts"].to_numpy(), t_open, side="right") - 1
    sig = np.where(j >= 0, dd["sig"].to_numpy()[np.clip(j, 0, None)], np.nan)
    sess["sigma"] = sig
    sess["t_open"] = t_open
    sess["open"] = o[sess["i0"].to_numpy()]
    lon_end = (pd.DatetimeIndex(sess.index) + pd.Timedelta(hours=22)).tz_localize("Europe/London").tz_convert("UTC")
    sess["t_end"] = lon_end.tz_localize(None).as_unit("s").asi8
    return sess


class Books:
    def __init__(self, pair, ts, c):
        b = pd.read_parquet(CACHE / f"book_{pair}.parquet")
        b["exp_ts"] = b["expiry"].astype("datetime64[s]").astype("int64")
        b["call_oi"] = b["call_oi"].fillna(0.0)
        b["put_oi"] = b["put_oi"].fillna(0.0)
        self.by = {d: g.reset_index(drop=True) for d, g in b.groupby("date")}
        self.dates = np.array(sorted(self.by))
        self.settle = {d: int(pd.Timestamp(g["settle_utc"].iloc[0]).value // 10**9) for d, g in self.by.items()}
        # CFD (book-unit) price at each settlement minute: last bar at/before, within 15 minutes
        self.C = {}
        for d, st in self.settle.items():
            i = np.searchsorted(ts, st, side="right") - 1
            if i >= 0 and st - ts[i] <= 900:
                self.C[d] = c[i]
        self.mult = PAIR_CONFIG[pair]["contract_mult"]

    def prev(self, d):
        i = np.searchsorted(self.dates, np.datetime64(d), side="left") - 1
        return pd.Timestamp(self.dates[i]) if i >= 0 else None

    def nearest(self, d):
        i = np.searchsorted(self.dates, np.datetime64(d))
        cands = [self.dates[k] for k in (i - 1, i) if 0 <= k < len(self.dates)]
        return pd.Timestamp(min(cands, key=lambda x: abs(pd.Timestamp(x) - d))) if cands else None

    def assemble(self, P, band):
        """Contracts for a session whose latest settlement date is P: OI of D = prev(P), IV/F/basis of P."""
        D = self.prev(P)
        if D is None or P not in self.C:
            return None
        oi = self.by[D][["expiry", "strike", "exp_ts", "call_oi", "put_oi"]]
        px = self.by[P][["expiry", "strike", "iv", "F"]]
        m = oi.merge(px, on=["expiry", "strike"], how="left")
        # IV missing at P for this strike: interpolate within P's expiry curve; F from P's expiry
        if m["iv"].isna().any() or m["F"].isna().any():
            Fe = px.groupby("expiry")["F"].first()
            m["F"] = m["F"].fillna(m["expiry"].map(Fe))
            for e, g in m[m["iv"].isna()].groupby("expiry"):
                q = px[(px["expiry"] == e) & px["iv"].notna()]
                if len(q):
                    m.loc[g.index, "iv"] = np.interp(g["strike"], q["strike"], q["iv"])
        m = m[(m["call_oi"] + m["put_oi"] > 0) & m["iv"].notna() & m["F"].notna() & (m["exp_ts"] > self.settle[P])]
        m = m[np.abs(m["strike"] / m["F"] - 1) <= band]
        if len(m) < 3:
            return None
        return dict(K=m["strike"].to_numpy(float), F=m["F"].to_numpy(float), iv=m["iv"].to_numpy(float),
                    exp=m["exp_ts"].to_numpy(np.int64), net=(m["call_oi"] - m["put_oi"]).to_numpy(float),
                    gross=(m["call_oi"] + m["put_oi"]).to_numpy(float), C=self.C[P], settle=self.settle[P],
                    callo=m["call_oi"].to_numpy(float), puto=m["put_oi"].to_numpy(float), P=P, D=D)


def gamma_at(bk, X, t, mult, sig_pct=None, swap_time=None):
    """Dollar gamma per 1% at CFD price X and unix time t. Returns dict of net/gross/DTE buckets/local share.
    swap_time: for the neighbour-year book, the contract clock is shifted so tau = exp - (settle_then + (t - settle_now))."""
    tt = t if swap_time is None else bk["settle"] + (t - swap_time)
    Fk = X * bk["F"] / bk["C"]
    tau_s = bk["exp"] - tt
    live = tau_s > 0
    tau = np.maximum(tau_s / YR, TAU_FLOOR)
    s = bk["iv"] * np.sqrt(tau)
    d1 = (np.log(Fk / bk["K"]) + 0.5 * s * s) / s
    g = np.exp(-0.5 * d1 * d1) / np.sqrt(2 * np.pi) / (Fk * s)
    dol = np.where(live, g * Fk * Fk * 0.01 * mult, 0.0)
    net = dol * bk["net"]
    out = {"net": net.sum(), "gross": (dol * bk["gross"]).sum()}
    dte = tau_s / 86400.0
    out["net_d1"] = net[live & (dte <= 1)].sum()
    out["net_d5"] = net[live & (dte > 1) & (dte <= 5)].sum()
    out["net_dfar"] = net[live & (dte > 5)].sum()
    out["n_d1"] = int((live & (dte <= 1)).sum())
    out["n_d5"] = int((live & (dte > 1) & (dte <= 5)).sum())
    if sig_pct is not None:
        near = live & (np.abs(bk["K"] / Fk - 1) <= 0.25 * sig_pct)
        out["local_share"] = abs(net[near].sum()) / out["gross"] if out["gross"] > 0 else np.nan
    return out


def walls(bk):
    """Top-2 call-OI strikes above spot, top-2 put-OI strikes below (all expiries summed), mapped to CFD space
    (OI-weighted mean of K x C / F_k over the strike's contracts)."""
    cfd = bk["K"] * bk["C"] / bk["F"]
    w = bk["callo"] + bk["puto"]
    df = pd.DataFrame({"K": bk["K"], "c": bk["callo"], "p": bk["puto"], "cw": cfd * w, "w": w})
    g = df.groupby("K").sum()
    g["cfd"] = g["cw"] / g["w"]
    up = g[(g["cfd"] > bk["C"]) & (g["c"] > 0)].sort_values("c", ascending=False).head(2)
    dn = g[(g["cfd"] < bk["C"]) & (g["p"] > 0)].sort_values("p", ascending=False).head(2)
    return [("wall_call", float(v)) for v in up["cfd"]] + [("wall_put", float(v)) for v in dn["cfd"]]


def close_ts(day, pair):
    hhmm, tz = INST[pair]["close"]
    return int(pd.Timestamp(f"{day:%Y-%m-%d} {hhmm}").tz_localize(tz).tz_convert("UTC").value // 10**9)


def run(pair, draws):
    cf = INST[pair]
    idx, ts, o, h, l, c = load_m1(pair)
    sess = sessions_and_sigma(idx, ts, o, c)
    bks = Books(pair, ts, c)
    first_book = pd.Timestamp(bks.dates[0])
    sess = sess[(sess.index > first_book + pd.Timedelta(days=3)) & (sess.index <= LOCKBOX)]
    arch = None
    if cf["arch"]:
        a = pd.read_parquet(ARCH / f"{cf['arch']}_days.parquet")
        a["date"] = pd.to_datetime(a["date"])
        arch = a.set_index("date")
    mult = bks.mult
    rows, sess_rows = [], []
    rnd = draws[pair]
    for si, (day, s) in enumerate(sess.iterrows()):
        if not np.isfinite(s["sigma"]) or s["sigma"] <= 0:
            continue
        P = bks.prev(day)
        if P is None:
            continue
        bk = bks.assemble(P, cf["band"])
        if bk is None:
            continue
        Pn = bks.nearest(P - pd.Timedelta(days=365))
        if Pn is None or Pn >= P - pd.Timedelta(days=180):
            Pn = bks.nearest(P + pd.Timedelta(days=365))
        bkn = bks.assemble(Pn, cf["band"]) if Pn is not None and Pn <= P + pd.Timedelta(days=550) else None
        op, sig = s["open"], s["sigma"]
        i0, i1, t_end = int(s["i0"]), int(s["i1"]), int(s["t_end"])
        g_open = gamma_at(bk, op, int(s["t_open"]), mult)
        sess_rows.append({"date": day, "gross_open": g_open["gross"], "net_open": g_open["net"], "P": P,
                          "D": bk["D"], "Pn": Pn, "basis": bk["C"] / np.median(bk["F"]), "sigma": sig, "open": op})
        levels = [("random", f"r{k}", op * (1 + rnd[si, k] * sig)) for k in range(N_RANDOM)]
        if arch is not None and day in arch.index:
            ar = arch.loc[day]
            for col in LADDER:
                v = ar[col]
                if np.isfinite(v):
                    levels.append(("ladder", col[4:], float(v) if not PAIR_CONFIG[pair]["inverted"] else 1 / float(v)))
        for name, v in walls(bk):
            levels.append(("wall", name, v))
        hh, ll, tt = h[i0:i1], l[i0:i1], ts[i0:i1]
        tclose = close_ts(day, pair)
        for kind, label, L in levels:
            dist = (L - op) / (sig * op)
            if abs(dist) < 0.05:
                continue
            side = 1 if L > op else -1
            hit = (hh >= L) if side > 0 else (ll <= L)
            if not hit.any():
                rows.append({"date": day, "kind": kind, "label": label, "L": L, "side": side, "dist": dist,
                             "touched": False})
                continue
            k = int(np.argmax(hit))
            t = int(tt[k])
            if t > t_end - 30 * 60:
                rows.append({"date": day, "kind": kind, "label": label, "L": L, "side": side, "dist": dist,
                             "touched": True, "late": True})
                continue
            b = 0.25 * sig * op
            ga = gamma_at(bk, L, t, mult, sig_pct=sig)
            gb = gamma_at(bk, L + side * b, t, mult)
            gn = gamma_at(bkn, L, t, mult, swap_time=bk["settle"]) if bkn is not None else None
            lon = pd.Timestamp(t, unit="s", tz="UTC").tz_convert("Europe/London")
            rows.append({"date": day, "kind": kind, "label": label, "L": L, "side": side, "dist": dist,
                         "touched": True, "late": False, "bar": i0 + k, "t": t, "b": b,
                         "lon_hour": lon.hour + lon.minute / 60, "min_to_close": (tclose - t) / 60.0,
                         "lg": ga["net"], "gg": ga["gross"], "lg_d1": ga["net_d1"], "lg_d5": ga["net_d5"],
                         "lg_dfar": ga["net_dfar"], "n_d1": ga["n_d1"], "n_d5": ga["n_d5"],
                         "local_share": ga.get("local_share", np.nan), "lg_beyond": gb["net"],
                         "lg_nb": gn["net"] if gn else np.nan, "gg_nb": gn["gross"] if gn else np.nan,
                         "net_open": g_open["net"]})
        if si % 200 == 0:
            print(f"[{pair}] {day:%Y-%m-%d} sessions {si}/{len(sess)} events {len(rows)}", flush=True)
    ev = pd.DataFrame(rows)
    ss = pd.DataFrame(sess_rows).set_index("date")
    # point-in-time normaliser: trailing median of the open gross gamma over the prior 60 sessions (min 20)
    ss["gg_norm"] = ss["gross_open"].shift(1).rolling(60, min_periods=20).median()
    ev = ev.merge(ss[["gg_norm"]], left_on="date", right_index=True, how="left")
    # the neighbour-year book is normalised by its own scale at the same rank (gross at its own open is not stored);
    # use the ratio of gross gammas at the touch so both books are on the session's scale
    ev["pair"] = pair
    ev.to_parquet(CACHE / f"events_{pair}.parquet", index=False)
    ss.to_parquet(CACHE / f"sessions_{pair}.parquet")
    np.savez_compressed(CACHE / f"m1_{pair}.npz", ts=ts, h=h, l=l, c=c)
    print(f"[{pair}] done: {len(ss)} sessions, {len(ev)} level-days, {int(ev['touched'].sum())} touched, "
          f"{int((ev['touched'] & (ev.get('late') == False)).sum())} scorable events", flush=True)


if __name__ == "__main__":
    dr = random_draws()
    for p in sys.argv[1:]:
        run(p, dr)
