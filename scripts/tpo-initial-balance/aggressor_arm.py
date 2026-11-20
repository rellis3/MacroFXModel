"""Real order flow (exchange aggressor flag) against TPO, NQ. Descriptive only: amendment A3 (POST-HOC, results seen).

Data: Databento GLBX.MDP3 NQ.v.0 RTH trades bought for orderflow-lead-aggressor, %LOCALAPPDATA%/MacroFXModel/orderflow/raw/GLBX/trades_rth/NQ/
<day>.dbn.zst, 51 sessions 2026-06-12 .. 2026-08-21 (all before the lockbox). side 'B' = buyer aggressor, 'A' = seller aggressor.

  python scripts/tpo-initial-balance/aggressor_arm.py --data <continuous dir>     (run score first: it reads events_NQ.parquet)
"""
import argparse
import glob
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import tpo_ib as T  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "analysis/output/tpo-initial-balance"
RAW = Path(os.environ.get("LOCALAPPDATA", "")) / "MacroFXModel/orderflow/raw/GLBX/trades_rth/NQ"


def per_minute(f):
    import databento as db
    d = db.DBNStore.from_file(f).to_df()
    t = d.ts_event.dt.tz_convert("America/New_York")
    m = (t.dt.hour * 60 + t.dt.minute).to_numpy() - 570
    ok = (m >= 0) & (m < T.N_MIN)
    sgn = np.where(d.side.to_numpy() == "B", 1, np.where(d.side.to_numpy() == "A", -1, 0))
    sz = d["size"].to_numpy(float)
    delta = np.bincount(m[ok], sgn[ok] * sz[ok], T.N_MIN)
    vol = np.bincount(m[ok], sz[ok], T.N_MIN)
    return t.dt.strftime("%Y-%m-%d").iloc[0], delta, vol


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    a = ap.parse_args()
    s = T.load_sessions(Path(a.data) / "NQ_1m_unadj.parquet", "NQ")
    proxy = T.bvc_delta(s)
    idx = {d: i for i, d in enumerate(s.days)}
    ev = pd.read_parquet(OUT / "events_NQ.parquet").set_index("day")
    per_rows, sess_rows, ev_rows = [], [], []
    for f in sorted(glob.glob(str(RAW / "*.dbn.zst"))):
        day, dl, vl = per_minute(f)
        i = idx.get(day)
        if i is None or day > T.END:
            continue
        ibh, ibl = s.H[i, :60].max(), s.L[i, :60].min(); w = ibh - ibl
        for p in range(13):
            a0, b0 = p * T.PER, p * T.PER + T.PER
            v = vl[a0:b0].sum()
            real = dl[a0:b0].sum() / v if v else np.nan
            prox = T.flow_ratio(proxy, s.V, i, a0, b0)
            ret = s.C[i, b0 - 1] - s.O[i, a0]
            ext = np.nan
            if p >= 2:
                ph, pl = s.H[i, :a0].max(), s.L[i, :a0].min()
                ext = (max(0.0, s.H[i, a0:b0].max() - ph) - max(0.0, pl - s.L[i, a0:b0].min())) / w
            per_rows.append(dict(day=day, p=p, real=real, proxy=prox, ret=ret / s.sigma1[i], ext=ext))
        up, dn = s.H[i].max() > ibh, s.L[i].min() < ibl
        sess_rows.append(dict(day=day, real_cvd=dl.sum(), proxy_cvd=np.nansum(proxy[i]), up=up, dn=dn, type=T.day_type(s, i),
                              close_ret=s.C[i, -1] - s.O[i, 0]))
        if day in ev.index and ev.loc[day, "kind"] in ("acc", "poke"):
            r = ev.loc[day]
            ps = [int(r.p) - 1, int(r.p)] if r.kind == "acc" else [int(r.p)]
            a0, b0 = ps[0] * T.PER, ps[-1] * T.PER + T.PER
            v = vl[a0:b0].sum()
            ev_rows.append(dict(day=day, kind=r.kind, d=r.d, x_real=(dl[a0:b0].sum() / v if v else np.nan) * r.dir, x_proxy=r.x_flow))
    P, S, E = pd.DataFrame(per_rows), pd.DataFrame(sess_rows), pd.DataFrame(ev_rows)
    c = lambda x, y: float(pd.concat([x, y], axis=1).dropna().corr().iloc[0, 1])
    ext = P[P.ext.notna() & (P.ext != 0)]
    one = S[S.up ^ S.dn]
    out = dict(sessions=len(S), periods=len(P),
               proxy_vs_real_flow_corr=c(P.proxy, P.real),
               real_flow_vs_period_return_corr=c(P.real, P.ret), proxy_flow_vs_period_return_corr=c(P.proxy, P.ret),
               D1_extension_vs_real_flow_corr=c(ext.ext, ext.real), D1_extension_vs_proxy_flow_corr=c(ext.ext, ext.proxy),
               D1_sign_agree_real=float((np.sign(ext.ext) == np.sign(ext.real)).mean()), n_extending=len(ext),
               D3_real_cvd_agrees_with_extension=float(((one.real_cvd > 0) == one.up).mean()),
               D3_proxy_cvd_agrees_with_extension=float(((one.proxy_cvd > 0) == one.up).mean()), n_one_sided=len(one),
               real_cvd_vs_session_return_sign_agree=float(((S.real_cvd > 0) == (S.close_ret > 0)).mean()),
               day_types=S.type.value_counts().to_dict())
    for kind, lab in (("acc", "follow"), ("poke", "fade")):
        sub = E[E.kind == kind].dropna()
        if len(sub) >= 8:
            z = lambda x: (x - x.mean()) / x.std()
            out[f"Q4_real_{lab}"] = dict(n=len(sub), slope_real=float(T.ols_slope(z(sub.x_real).to_numpy(), sub.d.to_numpy())),
                                         slope_proxy_same_events=float(T.ols_slope(z(sub.x_proxy).to_numpy(), sub.d.to_numpy())),
                                         corr_real_vs_proxy_x=c(sub.x_real, sub.x_proxy))
        else:
            out[f"Q4_real_{lab}"] = dict(n=len(sub))
    (OUT / "aggressor_arm.json").write_text(json.dumps(out, indent=1, default=float))
    print(json.dumps(out, indent=1, default=float))


if __name__ == "__main__":
    main()
