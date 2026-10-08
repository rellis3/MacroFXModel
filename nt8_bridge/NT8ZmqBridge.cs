#region Using declarations
using System;
using NinjaTrader.NinjaScript.AddOns;
using NT8ZmqBridge.Server;
#endregion

// Thin host: starts the read-only ZeroMQ server (NT8ZmqBridge.Server.dll) with NT8 and stops it on terminate.
namespace NinjaTrader.NinjaScript.AddOns
{
    public class NT8ZmqBridge : AddOnBase
    {
        private ZmqBridgeServer _server;

        protected override void OnStateChange()
        {
            if (State == State.Configure)
            {
                if (_server == null) { _server = new ZmqBridgeServer(); _server.Start(); }
            }
            else if (State == State.Terminated)
            {
                if (_server != null) { _server.Stop(); _server.Dispose(); _server = null; }
            }
        }
    }
}
