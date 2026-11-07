"""Set-and-forget footprint capture: keeps the NT8 recorder on the front contracts and feeds footprint.html.

    scripts\\footprint\\start_footprint_capture.bat            (or: python scripts/footprint/footprint_capture.py)
    python scripts/footprint/footprint_capture.py --roots NQ ES --every 30
    python scripts/footprint/footprint_capture.py --status

Every cycle it: (1) checks NT8's bridge and (re)starts the recorder on the front contract of each root, so an NT8 restart or a
roll needs nothing from you; (2) reads only the NEW lines of each recorder file; (3) pushes each market's day to the site;
(4) after 00:30 UTC sends each finished day as final, which the server stores in R2, then gzips the finished recorder files.
It waits quietly while NT8 is closed and never places orders (the bridge has no order operations).

Buy or sell: the recorder stores the bid and ask with each trade. At or above the ask = buy, at or below the bid = sell; inside
the spread or with no quote the tick rule decides. The counts of each are in the day's file. Bars are keyed on the exchange
stamp (UTC), so the ~10 minute Lucid delay moves when a bar appears, not which minute it belongs to.

Recorder files live in %LOCALAPPDATA%\\MacroFXModel\\nt8_live (override FOOTPRINT_LIVE_DIR), outside OneDrive, which locks files
it is syncing. Under --min-free-gb of disk it stops recording and says so rather than filling the disk (order-book data then needs an NT8 restart).
Descriptive order flow; no strategy built on this has been tested yet.
"""
import argparse, gzip, json, os, shutil, socket, sys, threading, time, urllib.error, urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

BASE_URL = os.environ.get("MACROFX_BASE", "https://macrofxmodel-production.up.railway.app")
LIVE_DIR = Path(os.environ.get("FOOTPRINT_LIVE_DIR") or (Path(os.environ.get("LOCALAPPDATA", Path.home())) / "MacroFXModel" / "nt8_live"))
DEFAULT_ROOTS = ["NQ", "ES", "GC", "CL", "6E", "6J"]
TICK = {"NQ": 0.25, "MNQ": 0.25, "ES": 0.25, "MES": 0.25, "YM": 1.0, "MYM": 1.0, "RTY": 0.1, "M2K": 0.1, "GC": 0.1, "MGC": 0.1,
        "CL": 0.01, "MCL": 0.01, "ZN": 0.015625, "ZB": 0.03125, "ZF": 0.0078125,
        "6E": 0.00005, "6J": 0.0000005, "6B": 0.0001, "6A": 0.00005, "6C": 0.00005, "6S": 0.00005}
QUARTERLY = {"NQ", "MNQ", "ES", "MES", "YM", "MYM", "RTY", "M2K", "ZN", "ZB", "ZF", "6E", "6J", "6B", "6A", "6C", "6S"}
GOLD_MONTHS = (2, 4, 6, 8, 12)    # October trades but is not the volume leader
LIVE_MAX = 900_000                # bytes; a bigger live push goes as 5-minute bars (the browser downloads this every refresh)
FINAL_MAX = 8_000_000


def third_friday(y, m):
    first = date(y, m, 1)
    return first + timedelta(days=(4 - first.weekday()) % 7 + 14)


def _label(root, y, m):
    while m > 12:
        y, m = y + 1, m - 12
    return f"{root} {m:02d}-{y % 100:02d}"


def front_contract(root, d):
    """NT8 name of the volume-leading contract on UTC date d. Dates measured from analysis/output/nt8/continuous/*_rolls.csv
    (2025-26): index, rates and FX switch about 4 days before the third Friday, gold around the 26th before delivery, crude around
    the 18th. A calendar rule, so it can be a day or two out around a roll; forge/footprint_capture_test.py holds it to the measured dates."""
    if root in QUARTERLY:
        q = next(m for m in (3, 6, 9, 12) if m >= d.month)
        if d >= third_friday(d.year, q) - timedelta(days=5):
            q += 3
        return _label(root, d.year, q)
    if root in ("GC", "MGC"):
        for k in range(14):
            mm = (d.month + k - 1) % 12 + 1
            yy = d.year + (d.month + k - 1) // 12
            if mm not in GOLD_MONTHS:
                continue
            # Leave a contract on the 26th of the month before delivery, so August goes straight to December in late July (CME practice:
            # the measured files cannot show that roll because NT8 serves December only from mid-September).
            cut = date(yy, mm - 1, 26) if mm > 1 else date(yy - 1, 12, 26)
            if d < cut:
                return _label(root, yy, mm)
    if root in ("CL", "MCL"):
        return _label(root, d.year, d.month + (2 if d.day >= 18 else 1))
    raise ValueError(f"no roll rule for {root}; add it to front_contract")


def root_of(inst):
    return inst.replace("_", " ").split(" ")[0]


class Tape:
    """One contract's recorder files, read incrementally. Per exchange-UTC day: minute -> [o, h, l, c, {tick index: [sell, buy]}]."""

    def __init__(self, inst, tick):
        self.inst, self.tick = inst, tick
        self.offset = {}
        self.days = {}
        self.counts = {}
        self.last_px = None
        self.sign = 0
        self.last_trade = {}

    def poll(self, path):
        """Read the complete lines added to `path` since the last call. Returns the number of trades added."""
        path = Path(path)
        try:
            if path.suffix == ".gz":
                if path in self.offset:
                    return 0
                with gzip.open(path, "rb") as f:
                    blob = f.read()
                self.offset[path] = len(blob)
            else:
                at = self.offset.get(path, 0)
                if path.stat().st_size <= at:
                    return 0
                with open(path, "rb") as f:
                    f.seek(at)
                    blob = f.read()
                end = blob.rfind(b"\n")
                if end < 0:
                    return 0
                blob = blob[:end + 1]
                self.offset[path] = at + len(blob)
        except OSError:
            return 0
        n = 0
        for line in blob.split(b"\n"):
            if b",Last," in line and self._trade(line):
                n += 1
        return n

    def _trade(self, line):
        p = line.decode("ascii", "ignore").strip().split(",")
        if len(p) < 7 or p[2] != "Last":
            return False
        try:
            px, vol, bid, ask = float(p[3]), int(float(p[4])), float(p[5]), float(p[6])
            stamp = p[1]
            day, m = stamp[:10], int(stamp[11:13]) * 60 + int(stamp[14:16])
        except ValueError:
            return False
        if self.last_px is not None and px != self.last_px:
            self.sign = 1 if px > self.last_px else -1
        self.last_px = px
        side = 0
        if bid > 0 and ask >= bid:
            side = 1 if px >= ask else -1 if px <= bid else 0
        c = self.counts.setdefault(day, dict(quote=0, tick_fallback=0))
        c["quote" if side else "tick_fallback"] += 1
        side = side or self.sign
        bars = self.days.setdefault(day, {})
        b = bars.get(m)
        if b is None:
            b = bars[m] = [px, px, px, px, {}]
        b[1] = max(b[1], px)
        b[2] = min(b[2], px)
        b[3] = px
        if side:
            cell = b[4].setdefault(round(px / self.tick), [0, 0])
            cell[1 if side > 0 else 0] += vol
        self.last_trade[day] = stamp
        return True

    def doc(self, day):
        bars = []
        for m in sorted(self.days.get(day, {})):
            o, h, l, c, cells = self.days[day][m]
            lk = round(l / self.tick)
            bars.append([m, o, h, l, c, [[k - lk, s, b] for k, (s, b) in sorted(cells.items()) if s or b]])
        return dict(v=1, sym=root_of(self.inst), instrument=self.inst, day=day, rule="quote", tick=self.tick, base=1, counts=self.counts.get(day),
                    built=datetime.now(timezone.utc).isoformat(timespec="seconds"), last_trade=self.last_trade.get(day), bars=bars)

    def volume(self, day):
        return sum(s + b for bar in self.days.get(day, {}).values() for s, b in bar[4].values())


def rebin(doc, base=5):
    """The same day as `base`-minute bars, to fit a push."""
    tick, acc = doc["tick"], {}
    for m, o, h, l, c, rows in doc["bars"]:
        k = m // base * base
        a = acc.setdefault(k, [k, o, h, l, c, {}])
        a[2] = max(a[2], h)
        a[3] = min(a[3], l)
        a[4] = c
        lk = round(l / tick)
        for off, s, b in rows:
            x = a[5].setdefault(lk + off, [0, 0])
            x[0] += s
            x[1] += b
    out = []
    for k in sorted(acc):
        m, o, h, l, c, cells = acc[k]
        lk = round(l / tick)
        out.append([m, o, h, l, c, [[p - lk, s, b] for p, (s, b) in sorted(cells.items())]])
    return {**doc, "base": base, "bars": out}


def fit(doc, limit):
    return rebin(doc) if doc["base"] < 5 and len(json.dumps(doc, separators=(",", ":"))) > limit else doc


def push(doc, final=False, base=None):
    body = gzip.compress(json.dumps(dict(doc=doc, final=final), separators=(",", ":")).encode())
    hdr = {"Content-Type": "application/json", "Content-Encoding": "gzip"}
    if os.environ.get("KV_WRITE_SECRET"):
        hdr["X-Auth-Token"] = os.environ["KV_WRITE_SECRET"]
    req = urllib.request.Request(f"{base or BASE_URL}/api/footprint/push", data=body, headers=hdr, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.getcode(), len(body)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read()[:200].decode('utf-8', 'ignore')}")


def bridge(req, port=5557, timeout=15000):
    """One request to NT8's bridge. None if nothing answers (NT8 closed)."""
    import zmq
    s = zmq.Context.instance().socket(zmq.REQ)
    s.setsockopt(zmq.RCVTIMEO, timeout)
    s.setsockopt(zmq.SNDTIMEO, timeout)
    s.setsockopt(zmq.LINGER, 0)
    s.connect(f"tcp://127.0.0.1:{port}")
    try:
        s.send_string(json.dumps(req))
        return json.loads(s.recv_string())
    except zmq.ZMQError:
        return None
    finally:
        s.close()


def gzip_file(f):
    gz, tmp = f.with_name(f.name + ".gz"), f.with_name(f.name + ".gz.tmp")
    try:
        with open(f, "rb") as a, gzip.open(tmp, "wb", compresslevel=6) as b:
            shutil.copyfileobj(a, b, 1 << 20)
        os.replace(tmp, gz)
        f.unlink()
    except OSError:
        try:
            tmp.unlink()
        except OSError:
            pass


class Capture:
    def __init__(self, a):
        self.a, self.tapes, self.halted, self.bridge_up = a, {}, False, None
        self.pushed, self.gzipping = {}, None
        self.state_file = LIVE_DIR / "capture_state.json"
        try:
            self.done = set(json.loads(self.state_file.read_text())["done"])
        except (OSError, ValueError, KeyError):
            self.done = set()
        self.last_log = 0.0

    def log(self, msg):
        print(f"{datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S}Z {msg}", flush=True)

    def recorder(self, today):
        """Keep the recorder on exactly the wanted contracts. Returns the recorder's status, or None if NT8 is closed."""
        st = bridge(dict(op="record_status"))
        if st is None:
            if self.bridge_up is not False:
                self.log("NinjaTrader bridge not answering; waiting for NT8")
            self.bridge_up = False
            return None
        if self.bridge_up is not True:
            self.log("NinjaTrader bridge up")
        self.bridge_up = True
        if self.halted:
            return st
        want = [front_contract(r, today) for r in self.a.roots]
        # Never record_stop to tidy up: NT8 refuses a new order-book subscription on that contract until NT8 restarts (seen 2026-11-07,
        # "There already is a market depth handler subscribed"). So after a roll the old contract just carries on until the next NT8
        # restart. Start one at a time, so a problem on one market cannot block the rest.
        missing = [x for x in want if x not in st]
        if missing:
            LIVE_DIR.mkdir(parents=True, exist_ok=True)
            for inst in missing:
                r = bridge(dict(op="record_start", instruments=[inst], out_dir=str(LIVE_DIR), levels=self.a.levels))
                note = r.get("error") if r else "no answer"
                self.log(f"recorder: start {inst} -> {note or 'ok'}")
            st = bridge(dict(op="record_status")) or {}
            # The depth error comes after the trade subscription, so trades still record. Footprints need only those.
            for inst in missing:
                if inst not in st:
                    self.log(f"recorder: {inst} IS NOT RECORDING")
        return st

    def _done(self, root, day):
        return f"{root}|{day}" in self.done

    def read(self, today):
        """Poll every recorder file that can still hold an unfinished day."""
        if not LIVE_DIR.exists():
            return
        for d in sorted(p for p in LIVE_DIR.iterdir() if p.is_dir()):
            inst = d.name.replace("_", " ")
            tick = TICK.get(root_of(inst))
            if tick is None:
                continue
            for f in sorted(list(d.glob("*_ticks_v2.csv")) + list(d.glob("*_ticks_v2.csv.gz"))):
                fday = f.name[:10]
                prev = (date.fromisoformat(fday) - timedelta(days=1)).isoformat()
                if fday < today.isoformat() and self._done(root_of(inst), prev) and self._done(root_of(inst), fday):
                    continue
                self.tapes.setdefault(inst, Tape(inst, tick)).poll(f)

    def best(self, root, day):
        """The contract with the most volume that day (two can hold data on a roll day)."""
        t = [x for x in self.tapes.values() if root_of(x.inst) == root and x.days.get(day)]
        return max(t, key=lambda x: x.volume(day)) if t else None

    def push_live(self, today):
        day = today.isoformat()
        for root in self.a.roots:
            t = self.best(root, day)
            if not t or self.pushed.get(root) == t.last_trade.get(day):
                continue
            try:
                push(fit(t.doc(day), LIVE_MAX))
                self.pushed[root] = t.last_trade.get(day)
            except Exception as e:  # noqa: BLE001 - a failed push must not stop the recording; the next cycle tries again
                self.log(f"{root}: live push failed: {e}")

    def finish_days(self, now):
        """A day is final once its last trades can have arrived: 00:30 UTC next day clears the feed delay."""
        cutoff = (now - timedelta(minutes=30)).date().isoformat()
        seen = {(root_of(t.inst), d) for t in self.tapes.values() for d in t.days}
        for root, day in sorted(seen):
            if self._done(root, day) or day >= cutoff:
                continue
            t = self.best(root, day)
            doc = fit(t.doc(day), FINAL_MAX)
            try:
                push(doc, final=True)
            except Exception as e:  # noqa: BLE001 - kept in memory and on disk; retried next cycle
                self.log(f"{root} {day}: final push failed, will retry: {e}")
                continue
            self.log(f"{root} {day}: final, volume {t.volume(day):,}, {len(doc['bars'])} bars, signed {t.counts.get(day)}")
            self.done.add(f"{root}|{day}")
            self.state_file.write_text(json.dumps(dict(done=sorted(self.done))))
            for x in self.tapes.values():
                if root_of(x.inst) == root:
                    x.days.pop(day, None)

    def tidy(self, today):
        """gzip finished recorder files, one at a time on a thread. Nothing is deleted."""
        if self.gzipping and self.gzipping.is_alive():
            return
        for f in sorted(LIVE_DIR.glob("*/*.csv")):
            try:
                d = date.fromisoformat(f.name[:10])
            except ValueError:
                continue
            root = root_of(f.parent.name)
            # A ticks file waits for its days to be final, because a restart reads it again. Book and depth are not read here.
            if d >= today - timedelta(days=1) or (f.name.endswith("_ticks_v2.csv") and not (self._done(root, f.name[:10]) and self._done(root, (d - timedelta(days=1)).isoformat()))):
                continue
            self.gzipping = threading.Thread(target=gzip_file, args=(f,), daemon=True)
            self.gzipping.start()
            return

    def disk(self, status):
        probe = LIVE_DIR if LIVE_DIR.exists() else LIVE_DIR.parent.parent
        free = shutil.disk_usage(probe).free / 1e9
        if free < self.a.min_free_gb and not self.halted:
            self.halted = True
            self.log(f"DISK LOW ({free:.1f} GB free, limit {self.a.min_free_gb}): RECORDING STOPPED. Free space and restart this window.")
            if status is not None:
                bridge(dict(op="record_stop"))
        return free

    def cycle(self):
        now = datetime.now(timezone.utc)
        today = now.date()
        status = self.recorder(today)
        free = self.disk(status)
        self.read(today)
        self.push_live(today)
        self.finish_days(now)
        self.tidy(today)
        if time.time() - self.last_log > 300:
            self.last_log = time.time()
            size = sum(f.stat().st_size for f in LIVE_DIR.glob("*/*") if f.is_file()) / 1e9 if LIVE_DIR.exists() else 0
            parts = [f"{k.split(' ')[0]} {v.get('ticks', 0):,}t/{v.get('book_events', 0):,}b" for k, v in (status or {}).items()]
            self.log(f"recording: {', '.join(parts) or 'nothing'} | store {size:.2f} GB, {free:.0f} GB free")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--roots", nargs="+", default=DEFAULT_ROOTS)
    ap.add_argument("--every", type=int, default=30, help="seconds between cycles")
    ap.add_argument("--levels", type=int, default=10, help="order-book levels the recorder keeps")
    ap.add_argument("--min-free-gb", type=float, default=25)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--status", action="store_true", help="print the front contracts and the recorder state, change nothing")
    a = ap.parse_args()
    if a.status:
        today = datetime.now(timezone.utc).date()
        print(json.dumps(dict(front=[front_contract(r, today) for r in a.roots], recorder=bridge(dict(op="record_status")), folder=str(LIVE_DIR)), indent=1))
        return
    # One copy only: two would fight over the recorder.
    lock = socket.socket()
    try:
        lock.bind(("127.0.0.1", 5561))
    except OSError:
        sys.exit("footprint capture is already running")
    c = Capture(a)
    c.log(f"capture started: {a.roots} every {a.every}s -> {BASE_URL}, files in {LIVE_DIR}")
    while True:
        try:
            c.cycle()
        except Exception as e:  # noqa: BLE001 - this runs unattended for days; say what broke and carry on
            c.log(f"cycle failed: {type(e).__name__}: {e}")
        if a.once:
            return
        time.sleep(a.every)


if __name__ == "__main__":
    main()
