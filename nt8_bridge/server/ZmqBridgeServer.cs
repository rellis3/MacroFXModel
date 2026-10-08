// Read-only NT8 -> ZeroMQ bridge: historical bars (1m / tick) and a last-price quote.
// No order placement by design -- this feeds analysis only.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Web.Script.Serialization;
using NetMQ;
using NetMQ.Sockets;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;

namespace NT8ZmqBridge.Server
{
    public class ZmqBridgeServer : IDisposable
    {
        private const string RepAddr = "tcp://127.0.0.1:5557";
        private const int ChunkRows = 50000;

        private readonly Recorder _recorder = new Recorder();
        private Thread _thread;
        private volatile bool _run;
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        private readonly Dictionary<string, List<object[]>> _pulls = new Dictionary<string, List<object[]>>();
        private readonly Dictionary<string, string[]> _pullCols = new Dictionary<string, string[]>();

        public void Start()
        {
            _run = true;
            _thread = new Thread(Loop) { IsBackground = true, Name = "NT8ZmqBridge" };
            _thread.Start();
        }

        public void Stop()
        {
            _run = false;
            if (_thread != null) _thread.Join(3000);
        }

        public void Dispose() { Stop(); _recorder.Dispose(); }

        private static void Log(string s) { NinjaTrader.Code.Output.Process("[NT8ZmqBridge] " + s, PrintTo.OutputTab1); }

        private void Loop()
        {
            ResponseSocket rep = null;
            try
            {
                rep = new ResponseSocket();
                rep.Bind(RepAddr);
                Log("bridge started on @" + RepAddr);
                while (_run)
                {
                    string msg;
                    if (!rep.TryReceiveFrameString(TimeSpan.FromMilliseconds(250), out msg)) continue;
                    string reply;
                    try { reply = Handle(msg); }
                    catch (Exception ex) { reply = _json.Serialize(new Dictionary<string, object> { { "error", ex.Message } }); }
                    rep.SendFrame(reply);
                }
            }
            catch (Exception ex) { Log("fatal: " + ex.Message); }
            finally
            {
                if (rep != null) rep.Dispose();
                NetMQConfig.Cleanup(false);
            }
        }

        private string Handle(string msg)
        {
            var req = _json.Deserialize<Dictionary<string, object>>(msg);
            string op = Str(req, "op");
            if (op == "ping") return _json.Serialize(new Dictionary<string, object> { { "ok", true } });
            if (op == "get_quote") return GetQuote(req);
            if (op == "record_start")
            {
                var names = new List<string>();
                foreach (var o in (System.Collections.IEnumerable)req["instruments"]) names.Add(o.ToString());
                int lv = req.ContainsKey("levels") ? Convert.ToInt32(req["levels"]) : 10;
                return _json.Serialize(new Dictionary<string, object> { { "started", _recorder.Start(names, Str(req, "out_dir"), lv) } });
            }
            if (op == "record_stop") return _json.Serialize(new Dictionary<string, object> { { "result", _recorder.Stop() } });
            if (op == "record_status") return _json.Serialize(_recorder.Status());
            if (op == "chunk") return Chunk(Str(req, "pull_id"), Convert.ToInt32(req["cursor"]));
            return StartPull(req);
        }

        private static string Str(Dictionary<string, object> d, string k)
        {
            object v;
            return d.TryGetValue(k, out v) && v != null ? v.ToString() : null;
        }

        private static Instrument Resolve(string name)
        {
            var inst = Instrument.GetInstrument(name);
            if (inst == null)
                throw new Exception("unknown instrument: " + name + " (use NT8 form e.g. 'MNQ 12-26'; a data connection must be active)");
            return inst;
        }

        private string GetQuote(Dictionary<string, object> req)
        {
            var inst = Resolve(Str(req, "instrument"));
            var md = inst.MarketData;
            return _json.Serialize(new Dictionary<string, object>
            {
                { "instrument", inst.FullName },
                { "last", md.Last != null ? (object)md.Last.Price : null },
                { "bid", md.Bid != null ? (object)md.Bid.Price : null },
                { "ask", md.Ask != null ? (object)md.Ask.Price : null }
            });
        }

        private static DateTime ParseUtc(string s)
        {
            return DateTime.Parse(s, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
        }

        private string StartPull(Dictionary<string, object> req)
        {
            var inst = Resolve(Str(req, "instrument"));
            bool tick = (Str(req, "bar_type") ?? "1m") == "tick";
            // NT8 bar times are in the PC's local time zone.
            DateTime startLocal = TimeZoneInfo.ConvertTimeFromUtc(ParseUtc(Str(req, "start")), TimeZoneInfo.Local);
            DateTime endLocal = TimeZoneInfo.ConvertTimeFromUtc(ParseUtc(Str(req, "end")), TimeZoneInfo.Local);

            var rows = new List<object[]>();
            string[] cols = tick ? new[] { "timestamp", "price", "volume" }
                                 : new[] { "timestamp", "open", "high", "low", "close", "volume" };
            Exception err = null;
            using (var done = new ManualResetEvent(false))
            {
                var br = new BarsRequest(inst, startLocal, endLocal);
                br.BarsPeriod = new BarsPeriod { BarsPeriodType = tick ? BarsPeriodType.Tick : BarsPeriodType.Minute, Value = 1 };
                br.TradingHours = inst.MasterInstrument.TradingHours;
                br.Request((bars, code, text) =>
                {
                    try
                    {
                        if (code != NinjaTrader.Cbi.ErrorCode.NoError) { err = new Exception("BarsRequest: " + code + " " + text); return; }
                        var b = bars.Bars;
                        for (int i = 0; i < b.Count; i++)
                        {
                            DateTime t = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(b.GetTime(i), DateTimeKind.Unspecified), TimeZoneInfo.Local);
                            string ts = t.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);
                            if (tick) rows.Add(new object[] { ts, b.GetClose(i), b.GetVolume(i) });
                            else rows.Add(new object[] { ts, b.GetOpen(i), b.GetHigh(i), b.GetLow(i), b.GetClose(i), b.GetVolume(i) });
                        }
                    }
                    catch (Exception ex) { err = ex; }
                    finally { done.Set(); }
                });
                bool ok = done.WaitOne(TimeSpan.FromSeconds(120));
                br.Dispose();
                if (!ok) throw new Exception("BarsRequest timed out after 120s (no history connection, or range too large)");
            }
            if (err != null) throw err;

            string id = Guid.NewGuid().ToString("N");
            lock (_pulls)
            {
                if (_pulls.Count > 4) { _pulls.Clear(); _pullCols.Clear(); }
                _pulls[id] = rows;
                _pullCols[id] = cols;
            }
            return Chunk(id, 0);
        }

        private string Chunk(string id, int cursor)
        {
            List<object[]> rows;
            string[] cols;
            lock (_pulls)
            {
                if (id == null || !_pulls.TryGetValue(id, out rows)) throw new Exception("unknown or expired pull_id");
                cols = _pullCols[id];
            }
            int n = Math.Max(0, Math.Min(ChunkRows, rows.Count - cursor));
            var slice = rows.GetRange(cursor, n);
            int next = cursor + n;
            if (next >= rows.Count) lock (_pulls) { _pulls.Remove(id); _pullCols.Remove(id); }
            return _json.Serialize(new Dictionary<string, object>
            {
                { "pull_id", id }, { "total", rows.Count }, { "columns", cols }, { "rows", slice },
                { "next_cursor", next < rows.Count ? (object)next : null }
            });
        }
    }
}
