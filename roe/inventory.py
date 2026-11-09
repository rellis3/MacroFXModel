"""Data inventory for the laptop: python -m roe.inventory <folder> [<folder> ...]

Scans local data folders (OI, M1, futures, Databento ...) and writes a LIST of what is there: per file the size, format, columns and first/last
timestamp where it can tell cheaply, and per folder the totals. It reads files; it uploads nothing, changes nothing and sends nothing anywhere.
Output: roe_out/inventory/<stamp>.json and .md (gitignored). Files over 100 MB are flagged (GitHub refuses them; they belong in R2)."""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import re
import sys
from pathlib import Path

HUNDRED_MB = 100 * 1024 * 1024
TEXT_EXT = {".csv", ".txt", ".tsv"}
KINDS = [("databento", r"databento|\.dbn"), ("m1", r"(^|[^a-z])m1([^a-z0-9]|$)|minute"), ("oi", r"(^|[^a-z])oi([^a-z]|$)|open.?interest|gamma|chain"), ("futures", r"futur|\b(es|nq|zn|zb|cl|gc)[a-z]?\d{0,2}\b")]
DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?|\b\d{8}\b)")


def guess_kind(path: str) -> str:
    low = path.lower()
    for name, pat in KINDS:
        if re.search(pat, low):
            return name
    return "other"


def _first_last(path: Path, gz: bool):
    """(header, first data line, last data line) without reading the whole file."""
    op = gzip.open if gz else open
    with op(path, "rb") as f:
        header = f.readline().decode("utf-8", "replace").rstrip("\r\n")
        first = f.readline().decode("utf-8", "replace").rstrip("\r\n")
    last = None
    if not gz:
        size = path.stat().st_size
        with open(path, "rb") as f:
            f.seek(max(0, size - 65536))
            tail = f.read().decode("utf-8", "replace").splitlines()
        tail = [t for t in tail if t.strip()]
        last = tail[-1] if tail else None
    return header, first, last


def _date_in(line):
    m = DATE_RE.search(line or "")
    return m.group(1) if m else None


def inspect_file(path: Path) -> dict:
    p = Path(path)
    name = p.name.lower()
    gz = name.endswith(".gz")
    ext = Path(name[:-3] if gz else name).suffix
    st = p.stat()
    rec = {"path": str(p), "name": p.name, "bytes": st.st_size, "mb": round(st.st_size / 1048576, 2), "ext": ext + (".gz" if gz else ""),
           "kind": guess_kind(str(p)), "over100mb": st.st_size > HUNDRED_MB}
    try:
        if ext in TEXT_EXT:
            header, first, last = _first_last(p, gz)
            rec.update({"columns": [c.strip() for c in header.split(",")][:40], "firstDate": _date_in(first), "lastDate": _date_in(last) if last else None})
            if not gz and st.st_size <= 200 * 1024 * 1024:
                with open(p, "rb") as f:
                    rec["rows"] = max(0, sum(1 for _ in f) - 1)
        elif ext == ".parquet":
            try:
                import pyarrow.parquet as pq  # optional
                md = pq.ParquetFile(p).metadata
                cols = [md.schema.column(i).name for i in range(md.num_columns)]
                rec.update({"rows": md.num_rows, "columns": cols[:40]})
                for ci, cname in enumerate(cols):   # first/last timestamp from the row-group statistics (no data read)
                    if cname.lower() in {"datetime", "time", "timestamp", "date", "ts_event", "ts"}:
                        lo = hi = None
                        for g in range(md.num_row_groups):
                            st = md.row_group(g).column(ci).statistics
                            if st is not None and st.has_min_max:
                                lo = st.min if lo is None else min(lo, st.min)
                                hi = st.max if hi is None else max(hi, st.max)
                        rec["firstDate"], rec["lastDate"] = (str(lo) if lo is not None else None), (str(hi) if hi is not None else None)
                        break
            except ImportError:
                rec["note"] = "install pyarrow to list rows and columns"
        elif ext in {".json", ".jsonl"} and st.st_size <= 50 * 1024 * 1024 and ext == ".jsonl":
            with open(p, "rb") as f:
                rec["rows"] = sum(1 for _ in f)
        elif ext in {".dbn", ".zst"}:
            rec["note"] = "Databento binary: listed by size only"
    except Exception as e:  # noqa: BLE001
        rec["error"] = f"{type(e).__name__}: {e}"
    return rec


def scan(folders) -> dict:
    files, errors = [], []
    for root in folders:
        r = Path(root)
        if not r.exists():
            errors.append(f"{r}: not found")
            continue
        for p in sorted(x for x in r.rglob("*") if x.is_file() and not x.name.startswith(".")):
            files.append(inspect_file(p))
    groups: dict = {}
    for f in files:
        top = str(Path(f["path"]).parent)
        g = groups.setdefault(top, {"folder": top, "files": 0, "mb": 0.0, "over100mb": 0, "kinds": set(), "firstDate": None, "lastDate": None})
        g["files"] += 1; g["mb"] = round(g["mb"] + f["mb"], 2); g["over100mb"] += int(f["over100mb"]); g["kinds"].add(f["kind"])
        for d, key, fn in ((f.get("firstDate"), "firstDate", min), (f.get("lastDate"), "lastDate", max)):
            if d:
                g[key] = d if g[key] is None else fn(g[key], d)
    for g in groups.values():
        g["kinds"] = sorted(g["kinds"])
    return {"schema": "roe.inventory.v1", "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "folders": [str(f) for f in folders],
            "totals": {"files": len(files), "mb": round(sum(f["mb"] for f in files), 2), "over100mb": sum(f["over100mb"] for f in files)},
            "groups": sorted(groups.values(), key=lambda g: -g["mb"]), "files": files, "errors": errors}


def to_markdown(inv: dict) -> str:
    t = inv["totals"]
    out = [f"# Data inventory {inv['createdAt']}", "", f"{t['files']} files, {t['mb']} MB, {t['over100mb']} over 100 MB.", "",
           "| Folder | Files | MB | Over 100 MB | Kinds | First | Last |", "|---|---|---|---|---|---|---|"]
    for g in inv["groups"]:
        out.append(f"| {g['folder']} | {g['files']} | {g['mb']} | {g['over100mb']} | {', '.join(g['kinds'])} | {g['firstDate'] or ''} | {g['lastDate'] or ''} |")
    if inv["errors"]:
        out += ["", "Problems: " + "; ".join(inv["errors"])]
    return "\n".join(out) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m roe.inventory", description="List local data sets. Reads files only; uploads nothing.")
    ap.add_argument("folders", nargs="+")
    ap.add_argument("--out", default="roe_out/inventory")
    a = ap.parse_args(argv)
    inv = scan(a.folders)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    (out / f"{stamp}.json").write_text(json.dumps(inv, indent=1), encoding="utf-8")
    (out / f"{stamp}.md").write_text(to_markdown(inv), encoding="utf-8")
    print(to_markdown(inv))
    print(f"written: {out / (stamp + '.json')} and .md")
    return 0 if not inv["errors"] else 2


if __name__ == "__main__":
    sys.exit(main())
