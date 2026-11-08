"""The one series container every loader returns."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Series:
    id: str
    dates: list           # ISO dates, ascending (observation date)
    values: list          # floats, same length
    cadence: str = "daily"          # daily | weekly
    kind: str = "market"            # market | macro | positioning | session | derived
    source: str = ""
    change_kind: str = "diff"       # diff | log
    known: list | None = None       # when each point became public (COT: report date + 3 days); None = same as date
    meta: dict = field(default_factory=dict)

    def __len__(self):
        return len(self.dates)

    def truncate(self, to: str) -> "Series":
        """Point-in-time cut: keep only points public on or before `to`. Counts what was dropped (a future-dated point
        in a source is an 'unexpected timestamp' and is flagged by freshness.py)."""
        key = self.known if self.known is not None else self.dates
        keep = [i for i, k in enumerate(key) if k <= to]
        out = Series(self.id, [self.dates[i] for i in keep], [self.values[i] for i in keep], self.cadence, self.kind,
                     self.source, self.change_kind,
                     None if self.known is None else [self.known[i] for i in keep], dict(self.meta))
        out.meta["droppedAfterTo"] = len(self.dates) - len(keep) + int(self.meta.get("droppedAfterTo", 0))
        return out

    def last_date(self):
        return self.dates[-1] if self.dates else None


def overlay(base, newer, sid: str, **kw):
    """base up to its last date, then the points of `newer` strictly after it. The seam is recorded in meta."""
    if base is None or not base.dates:
        if newer is None:
            return None
        s = Series(sid, list(newer.dates), list(newer.values), **kw)
        s.meta["composite"] = [newer.source]
        return s
    if newer is None or not newer.dates:
        s = Series(sid, list(base.dates), list(base.values), **kw)
        s.meta["composite"] = [base.source]
        return s
    last = base.dates[-1]
    add = [(d, v) for d, v in zip(newer.dates, newer.values) if d > last]
    s = Series(sid, base.dates + [d for d, _ in add], base.values + [v for _, v in add], **kw)
    s.meta["composite"] = [base.source, newer.source]
    s.meta["seamAfter"] = last
    return s
