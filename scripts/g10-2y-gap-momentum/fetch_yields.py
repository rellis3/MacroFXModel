"""g10-2y-gap-momentum, stage 0: daily short government yields for the G10 (inputs only, no outcomes).

One official source per currency, read-only public downloads:

  USD  FRED DGS2 (Treasury 2y constant maturity)
  EUR  Bundesbank BBSIS R02XX (German Federal securities, 2y, term-structure yield)
  JPY  Ministry of Finance jgbcme_all.csv (JGB 2Y)
  GBP  Bank of England GLC nominal spot curve, 2.0 years (glcnominalddata.zip, sheet "4. spot curve")
  CAD  Bank of Canada Valet BD.CDN.2YR.DQ.YLD (2y benchmark)
  AUD  RBA F2 FCMYGBAG2D (f02dhist.xls to 2013, f2-data.csv after)
  CHF  SNB cube rendoblid, 2J (Confederation spot 2y; the cube ends 2025-07-31)
  SEK  Riksbank SWEA SEGVB2YC (2y government bond)
  NOK  Norges Bank GOVT_GENERIC_RATES B.3Y.GBON (3y; no 2y tenor; starts 2019-01-02)
  NZD  none: rbnz.govt.nz refuses automated downloads from this environment

    python scripts/g10-2y-gap-momentum/fetch_yields.py
Output: analysis/output/g10-2y-gap-momentum/yields/<CCY>.csv (date,value as published),
        yields_daily.csv (one column per currency, % p.a., by the yield's own local date), coverage.json
"""
import csv
import io
import json
import os
import tempfile
import urllib.request
import zipfile

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "analysis/output/g10-2y-gap-momentum/yields")
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"}


def get(url, binary=False, tries=4):
    last = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=120) as r:
                b = r.read()
            return b if binary else b.decode("utf-8-sig")
        except Exception as e:  # transient proxy resets seen on FRED
            last = e
    raise last


def s(dates, vals):
    x = pd.Series(pd.to_numeric(pd.Series(vals), errors="coerce").values, index=pd.to_datetime(dates))
    return x[~x.index.duplicated()].dropna().sort_index()


def usd():
    try:
        t = get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2")
    except Exception:
        t = open(os.path.join(ROOT, "analysis/output/ys_long/fred/DGS2.csv")).read()   # committed copy, to 2026-10-07
    d = pd.read_csv(io.StringIO(t))
    return s(d.iloc[:, 0], d.iloc[:, 1])


def eur():
    t = get("https://api.statistiken.bundesbank.de/rest/download/BBSIS/D.I.ZAR.ZI.EUR.S1311.B.A604.R02XX.R.A.A._Z._Z.A?format=csv&lang=en")
    rows = [r for r in csv.reader(t.splitlines()) if r and r[0][:2] in ("19", "20")]
    return s([r[0] for r in rows], [r[1] for r in rows])


def jpy():
    t = get("https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv")
    rows = list(csv.reader(t.splitlines()))
    hdr = [i for i, r in enumerate(rows) if r and r[0] == "Date"][0]
    j = rows[hdr].index("2Y")
    data = [r for r in rows[hdr + 1:] if r and r[0][:1].isdigit()]
    try:   # the current month lives in a separate file
        t2 = get("https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv")
        r2 = list(csv.reader(t2.splitlines()))
        h2 = [i for i, r in enumerate(r2) if r and r[0] == "Date"][0]
        data += [r for r in r2[h2 + 1:] if r and r[0][:1].isdigit()]
    except Exception:
        pass
    return s([r[0] for r in data], [r[j] for r in data])


def gbp():
    import openpyxl
    b = get("https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/glcnominalddata.zip", binary=True)
    out = []
    with zipfile.ZipFile(io.BytesIO(b)) as z, tempfile.TemporaryDirectory() as td:
        for name in z.namelist():
            if not any(k in name for k in ("2000 to 2004", "2005 to 2015", "2016 to 2024", "2025 to present")):
                continue
            p = z.extract(name, td)
            wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
            sheet = [n for n in wb.sheetnames if "spot curve" in n.lower() and "short" not in n.lower()][0]
            ws = wb[sheet]
            col = None
            for row in ws.iter_rows(values_only=True):
                if col is None:
                    if row and row[0] == "years:":
                        col = list(row).index(2)
                    continue
                if row[0] is not None and hasattr(row[0], "year") and row[col] is not None:
                    out.append((row[0], row[col]))
    return s([a for a, _ in out], [b_ for _, b_ in out])


def cad():
    t = get("https://www.bankofcanada.ca/valet/observations/BD.CDN.2YR.DQ.YLD/csv?start_date=2000-01-01")
    lines = t.splitlines()
    k = lines.index('"OBSERVATIONS"')
    d = pd.read_csv(io.StringIO("\n".join(lines[k + 1:])))
    return s(d.iloc[:, 0], d.iloc[:, 1])


def aud():
    import xlrd
    b = get("https://www.rba.gov.au/statistics/tables/xls-hist/f02dhist.xls", binary=True)
    sh = xlrd.open_workbook(file_contents=b).sheet_by_index(0)
    mn = [r for r in range(sh.nrows) if sh.row_values(r)[0] == "Mnemonic"][0]
    j = sh.row_values(mn).index("FCMYGBAG2D")
    hist = [(xlrd.xldate_as_datetime(sh.row_values(r)[0], 0), sh.row_values(r)[j])
            for r in range(mn + 1, sh.nrows) if isinstance(sh.row_values(r)[0], float)]
    t = get("https://www.rba.gov.au/statistics/tables/csv/f2-data.csv")
    rows = list(csv.reader(t.splitlines()))
    sid = [r for r in rows if r and r[0] == "Series ID"][0]
    j2 = sid.index("FCMYGBAG2D")
    cur = [(pd.to_datetime(r[0], format="%d-%b-%Y"), r[j2]) for r in rows if len(r) > j2 and r[0][:1].isdigit()]
    h = s([a for a, _ in hist], [b_ for _, b_ in hist])
    c = s([a for a, _ in cur], [b_ for _, b_ in cur])
    return pd.concat([h[h.index < c.index.min()], c])


def chf():
    t = get("https://data.snb.ch/api/cube/rendoblid/data/csv/en")
    rows = [r for r in csv.reader(t.splitlines(), delimiter=";") if len(r) == 3 and r[1] == "2J"]
    return s([r[0] for r in rows], [r[2] for r in rows])


def sek():
    d = json.loads(get("https://api.riksbank.se/swea/v1/Observations/SEGVB2YC/2000-01-01/2026-11-27"))
    return s([o["date"] for o in d], [o["value"] for o in d])


def nok():
    t = get("https://data.norges-bank.no/api/data/GOVT_GENERIC_RATES/B.3Y.GBON?format=csv&startPeriod=2000-01-01&locale=en")
    d = pd.read_csv(io.StringIO(t), sep=";")
    return s(d["TIME_PERIOD"], d["OBS_VALUE"])


SOURCES = {"USD": usd, "EUR": eur, "JPY": jpy, "GBP": gbp, "CAD": cad, "AUD": aud, "CHF": chf, "SEK": sek, "NOK": nok}


def main():
    os.makedirs(OUT, exist_ok=True)
    cols, cov = {}, {}
    for c, fn in SOURCES.items():
        x = fn()
        x.index.name = "date"
        x.rename("value").to_csv(os.path.join(OUT, f"{c}.csv"), float_format="%.4f")
        cols[c] = x
        w = x[x.index >= "2005-01-01"]
        cov[c] = {"first": str(x.index[0].date()), "last": str(x.index[-1].date()), "obs": int(len(x)),
                  "obs_since_2005": int(len(w)), "min": round(float(x.min()), 3), "max": round(float(x.max()), 3),
                  "max_gap_days_since_2005": int(w.index.to_series().diff().dt.days.max()) if len(w) > 1 else None}
        print(c, cov[c])
    cov["NZD"] = {"status": "missing: rbnz.govt.nz refuses automated downloads here"}
    pd.DataFrame(cols).to_csv(os.path.join(OUT, "yields_daily.csv"), float_format="%.4f")
    json.dump(cov, open(os.path.join(OUT, "coverage.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
