// Live recorder: per instrument writes (a) every trade/quote tick with the bid and ask at that moment and
// (b) a depth snapshot (top N levels each side) once a second. Files roll at UTC midnight:
//   <out_dir>/<SYMBOL>/<yyyy-MM-dd>_ticks.csv    time,type,price,volume,bid,ask
//   <out_dir>/<SYMBOL>/<yyyy-MM-dd>_depth.csv    time,b1p,b1v..bNp,bNv,a1p,a1v..aNp,aNv
// Read-only: it only subscribes to market data and depth.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using NinjaTrader.Cbi;
using NinjaTrader.Data;

namespace NT8ZmqBridge.Server
{
    public class Recorder : IDisposable
    {
        private class Rec
        {
            public Instrument Inst;
            public string Dir;
            public string Day;
            public StreamWriter Ticks;
            public StreamWriter Depth;
            public EventHandler<MarketDataEventArgs> OnTick;
            public EventHandler<MarketDepthEventArgs> OnDepth;
            public readonly ConcurrentQueue<string> Queue = new ConcurrentQueue<string>();
            public volatile bool Active = true;
            public long TickCount;
            public long DepthCount;
            public DateTime LastTick;
        }

        private readonly object _lock = new object();
        private readonly Dictionary<string, Rec> _recs = new Dictionary<string, Rec>();
        private Timer _timer;
        private int _levels = 10;

        public string Start(List<string> instruments, string outDir, int levels)
        {
            _levels = levels > 0 ? levels : 10;
            var started = new List<string>();
            foreach (var name in instruments)
            {
                lock (_lock) { if (_recs.ContainsKey(name)) { started.Add(name + " (already)"); continue; } }
                var inst = Instrument.GetInstrument(name);
                if (inst == null) throw new Exception("unknown instrument: " + name);
                var r = new Rec { Inst = inst, Dir = Path.Combine(outDir, name.Replace(' ', '_')) };
                Directory.CreateDirectory(r.Dir);
                var rr = r;
                r.OnTick = (s, e) => Tick(rr, e);
                r.OnDepth = (s, e) => { };   // subscribing is what makes NT8 populate Asks/Bids
                lock (_lock) { _recs[name] = r; }
                // Subscribe OUTSIDE the lock: NT8 may call back synchronously on its own thread.
                inst.MarketData.Update += r.OnTick;
                inst.MarketDepth.Update += r.OnDepth;
                started.Add(name);
            }
            lock (_lock) { if (_timer == null) _timer = new Timer(_ => Snapshot(), null, 1000, 1000); }
            return string.Join(",", started);
        }

        public string Stop()
        {
            List<Rec> recs;
            lock (_lock)
            {
                recs = new List<Rec>(_recs.Values);
                _recs.Clear();
                if (_timer != null) { _timer.Dispose(); _timer = null; }
            }
            foreach (var r in recs)
            {
                r.Active = false;
                try { r.Inst.MarketData.Update -= r.OnTick; } catch { }
                try { r.Inst.MarketDepth.Update -= r.OnDepth; } catch { }
                lock (_lock) { Drain(r); Close(r); }
            }
            return "stopped " + recs.Count;
        }

        public Dictionary<string, object> Status()
        {
            lock (_lock)
            {
                var d = new Dictionary<string, object>();
                foreach (var kv in _recs)
                    d[kv.Key] = new Dictionary<string, object>
                    {
                        { "ticks", kv.Value.TickCount }, { "depth_snapshots", kv.Value.DepthCount },
                        { "last_tick_utc", kv.Value.LastTick == default(DateTime) ? null : kv.Value.LastTick.ToString("o") }
                    };
                return d;
            }
        }

        public void Dispose() { Stop(); }

        private static void Close(Rec r)
        {
            if (r.Ticks != null) { r.Ticks.Dispose(); r.Ticks = null; }
            if (r.Depth != null) { r.Depth.Dispose(); r.Depth = null; }
        }

        private void Roll(Rec r, DateTime utc)
        {
            string day = utc.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            if (day == r.Day && r.Ticks != null) return;
            Close(r);
            r.Day = day;
            string tp = Path.Combine(r.Dir, day + "_ticks.csv");
            string dp = Path.Combine(r.Dir, day + "_depth.csv");
            bool tNew = !File.Exists(tp), dNew = !File.Exists(dp);
            r.Ticks = new StreamWriter(new FileStream(tp, FileMode.Append, FileAccess.Write, FileShare.Read), Encoding.UTF8);
            r.Depth = new StreamWriter(new FileStream(dp, FileMode.Append, FileAccess.Write, FileShare.Read), Encoding.UTF8);
            if (tNew) r.Ticks.WriteLine("time,type,price,volume,bid,ask");
            if (dNew)
            {
                var h = new StringBuilder("time");
                for (int i = 1; i <= _levels; i++) h.Append(",b" + i + "p,b" + i + "v");
                for (int i = 1; i <= _levels; i++) h.Append(",a" + i + "p,a" + i + "v");
                r.Depth.WriteLine(h.ToString());
            }
        }

        private static string Num(double v) { return v.ToString("R", CultureInfo.InvariantCulture); }

        private void Tick(Rec r, MarketDataEventArgs e)
        {
            if (!r.Active) return;
            try
            {
                r.Queue.Enqueue(DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fff", CultureInfo.InvariantCulture) + "Z," + e.MarketDataType
                    + "," + Num(e.Price) + "," + e.Volume + "," + Num(e.Bid) + "," + Num(e.Ask));
            }
            catch { }
        }

        // Timer thread only: writes queued ticks to the day's file.
        private void Drain(Rec r)
        {
            string line;
            while (r.Queue.TryDequeue(out line))
            {
                if (r.Ticks == null) Roll(r, DateTime.UtcNow);
                r.Ticks.WriteLine(line);
                r.TickCount++;
                r.LastTick = DateTime.UtcNow;
            }
        }

        private void Snapshot()
        {
            lock (_lock)
            {
                DateTime utc = DateTime.UtcNow;
                foreach (var r in _recs.Values)
                {
                    try
                    {
                        var md = r.Inst.MarketDepth;
                        Roll(r, utc);
                        Drain(r);
                        var sb = new StringBuilder(utc.ToString("yyyy-MM-ddTHH:mm:ss.fff", CultureInfo.InvariantCulture) + "Z");
                        bool any = false;
                        for (int side = 0; side < 2; side++)
                        {
                            var rows = side == 0 ? md.Bids : md.Asks;
                            for (int i = 0; i < _levels; i++)
                            {
                                if (rows != null && i < rows.Count && rows[i] != null)
                                { sb.Append(',').Append(Num(rows[i].Price)).Append(',').Append(rows[i].Volume); any = true; }
                                else sb.Append(",,");
                            }
                        }
                        if (any) { r.Depth.WriteLine(sb.ToString()); r.DepthCount++; }
                        r.Ticks.Flush(); r.Depth.Flush();
                    }
                    catch { }
                }
            }
        }
    }
}
