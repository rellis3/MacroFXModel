"""Major-impact economic event dates from calendar_events.csv (repo root)."""
from __future__ import annotations
import os
import numpy as np
import pandas as pd
from .data import HERE

CAL = os.path.join(HERE, "..", "calendar_events.csv")


def major_event_dates(ccys=("USD",)) -> tuple[set, str, str]:
    df = pd.read_csv(CAL, encoding="latin-1", usecols=["date", "ccy", "impact", "event"])
    m = (df.impact == "Major") & df.ccy.isin(ccys)
    dates = set(int(d.replace("-", "")) for d in df.loc[m, "date"].unique())
    return dates, df.date.min(), df.date.max()


def flag_days(days, ccys=("USD",)):
    """Boolean per anchored day: does the TRADE date (the calendar day the
    session mostly covers - anchor date + 1 for the 23:00 UK open) carry a
    Major event?  Days after the calendar's last date are marked unknown (None)."""
    dates, dmin, dmax = major_event_dates(ccys)
    last = int(dmax.replace("-", ""))
    flags = []
    for k in days.keys:
        d = pd.Timestamp(str(k))
        if days.anchor in ("broker", "london23", "utc22"):
            d = d + pd.Timedelta(days=1)
        key = int(d.strftime("%Y%m%d"))
        flags.append(None if key > last else key in dates)
    return flags
