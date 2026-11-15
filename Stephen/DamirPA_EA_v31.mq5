//+------------------------------------------------------------------+
//|                                              DamirPA_EA_v31.mq5  |
//|  Price-action EA. Closed-bar logic only.                         |
//|  Signal code = DamirPA_Core.mqh (must sit next to this file).    |
//|  DEMO FIRST. No performance promise.                             |
//|                                                                  |
//|  Default model: B2 "50 Pips a Day" on H4 and H1.                 |
//|  B3 S&R zones, B1 price patterns and B4 value area are present   |
//|  but switched off.                                               |
//|                                                                  |
//|  v2.00: symbol-agnostic spread filter + lot sizing (OrderCalcProfit),
//|  diagnostics.                                                    |
//|  v3.00: symbol whitelist, B2 on H4/H1/M30 in one instance,       |
//|  optional one-chart basket mode, regime filter (ADX/ER, ATR      |
//|  percentile, D1 slope), per-sleeve health pause, news filter     |
//|  (MT5 calendar live; CSV/heuristic in the tester), basket        |
//|  protections (open risk, positions, currency exposure, equity    |
//|  circuit breaker), monthly trade-count diagnostics.              |
//|  v3.00 compile fix: a parameter named 'final' was renamed to     |
//|  isPartial ('final' is a reserved word in MQL5).                 |
//|  v3.10: same trading logic as v3. Built-in defaults match the    |
//|  gold-only setup that was tested (1% risk, basket mode,          |
//|  whitelist XAUUSD, B2 on H4+H1, regime + news + health +         |
//|  basket protections on). The file is named DamirPA_EA_v31 so     |
//|  MetaTrader does not reuse cached tester inputs from earlier     |
//|  builds. See docs/README.md, docs/CHANGELOG.md, docs/STRATEGY.md.|
//+------------------------------------------------------------------+
#property copyright "Built for Stephen - research EA, no performance promise"
#property version   "3.10"
#property description "DamirPA EA v3.10. Gold-only default: B2 on H4 and H1, 1% risk, regime and news filters, prop risk guard. DEMO FIRST."
#property strict
#include <Trade/Trade.mqh>
#include "DamirPA_Core.mqh"

//--- enums ----------------------------------------------------------
enum ENUM_DPA_SPREAD_MODE
  {
   DPA_SPREAD_PRICE  = 0,   // Legacy: price units (InpMaxSpread, gold 0.60)
   DPA_SPREAD_ATR    = 1,   // Fraction of the module ATR (InpMaxSpreadATR)
   DPA_SPREAD_POINTS = 2    // Symbol points (InpMaxSpreadPts)
  };
enum ENUM_DPA_GUARD_SCOPE
  {
   DPA_GUARD_INSTANCE = 0,  // This instance only (v1 behaviour)
   DPA_GUARD_FAMILY   = 1,  // All DamirPA instances on the account (magic InpMagic+1..+99, any symbol)
   DPA_GUARD_ACCOUNT  = 2   // Every trade on the account (incl. manual / other EAs)
  };
enum ENUM_DPA_TRADE_MODE
  {
   DPA_MODE_CHART  = 0,     // Chart symbol only (one chart per symbol; v2 behaviour)
   DPA_MODE_BASKET = 1      // Every whitelist symbol from this one chart (portfolio tester run / one-chart live)
  };
enum ENUM_DPA_REG_TREND
  {
   DPA_REG_OFF = 0,         // Off
   DPA_REG_ADX = 1,         // ADX >= InpRegADXMin
   DPA_REG_ER  = 2          // Efficiency ratio >= InpRegERMin
  };
enum ENUM_DPA_REG_TF
  {
   DPA_REGTF_SIGNAL = 0,    // Sleeve's own signal timeframe
   DPA_REGTF_H4     = 1     // H4
  };
enum ENUM_DPA_NEWS_SRC
  {
   DPA_NEWS_AUTO = 0,       // Auto: live = MT5 calendar; tester = CSV, else heuristic
   DPA_NEWS_CAL  = 1,       // MT5 calendar (falls back to CSV/heuristic if unavailable)
   DPA_NEWS_CSV  = 2,       // CSV file only (falls back to heuristic if missing)
   DPA_NEWS_HEUR = 3        // Fixed USD heuristic only (NFP / FOMC-Wednesday / optional 08:30 ET)
  };
enum ENUM_DPA_NEWS_ACT
  {
   DPA_NEWSACT_NONE    = 0, // Leave open trades alone
   DPA_NEWSACT_CLOSE   = 1, // Close open trades of that symbol inside the window
   DPA_NEWSACT_TIGHTEN = 2  // Move SL to break-even if the trade is in profit
  };

//--- inputs ---------------------------------------------------------
input group "=== General ==="
input long     InpMagic            = 640200;   // Magic base (B1 +1, B2-H4 +2, B3 +3, B4 +4, B2-H1 +12, B2-M30 +22)
input double   InpRiskPct          = 1.0;      // Risk per trade, % of balance
input string   InpTradeComment     = "DPA";    // Order comment prefix
input ENUM_DPA_SPREAD_MODE InpSpreadMode = DPA_SPREAD_ATR; // Spread filter mode
input double   InpMaxSpread        = 0.60;     // Max spread, PRICE units (legacy mode; gold 0.60)
input double   InpMaxSpreadATR     = 0.10;     // Max spread, x module ATR (ATR mode)
input int      InpMaxSpreadPts     = 50;       // Max spread, symbol points (points mode)
input int      InpSlippagePts      = 30;       // Max deviation (symbol points)
input double   InpMinLotRiskMult   = 0.0;      // Allow min lot if its risk <= x * budget (0 = never, v1)
input bool     InpDiagLog          = true;     // Log skip reasons + symbol spec in the Journal

input group "=== Symbols (v3) ==="
input string   InpSymbolWhitelist  = "XAUUSD"; // Only these trade ("" = any). Broker suffixes match (XAUUSD.a)
input ENUM_DPA_TRADE_MODE InpTradeMode = DPA_MODE_BASKET; // Chart symbol only, or the whole whitelist from one chart
input int      InpTargetTradesMonth= 12;        // Diagnostics only: monthly fills vs this target per symbol (0 = off). Never forces trades

input group "=== Modules (switch on/off) ==="
input bool     InpUseB2            = true;     // B2 50 Pips a Day (timeframes below)
input bool     InpUseB3            = false;    // B3 S&R Zones (H1) - weak evidence
input bool     InpUseB1            = false;    // B1 Price Patterns (M30) - failed holdout alone
input bool     InpUseB4            = false;    // B4 Value Area (M15) - failed test
input bool     InpConfluence       = false;    // Confluence: D1 200EMA side AND H4 impulse bias must agree

input group "=== B2: 50 Pips a Day - timeframes (v3: any combination, one chart) ==="
input bool     InpB2_OnH4          = true;     // B2 on H4 (book default, magic +2)
input bool     InpB2_OnH1          = true;    // B2 on H1 (magic +12, uses the H1 settings below)
input bool     InpB2_OnM30         = false;    // B2 on M30 (magic +22, uses the M30 settings below) - lost money 2020-23 in testing
input bool     InpB2_H4Filter      = true;     // H1/M30: also require the H4 200EMA trend (B2 slope rule); no-op on H4

input group "=== B2: H4 settings ==="
input int      InpB2_K             = 5;        // Swing pivot strength (bars each side)
input int      InpB2_LB            = 150;      // Pivot look-back (bars)
input int      InpB2_SlopeBars     = 10;       // 200EMA slope bars
input double   InpB2_Slope         = 0.25;     // Min 200EMA slope (ATR over slope bars)
input int      InpB2_MaxSince      = 30;       // Break must be within N bars
input double   InpB2_Tol           = 0.30;     // Retest tolerance (ATR)
input int      InpB2_MinRet        = 2;        // Retest must last >= N bars
input double   InpB2_Body          = 0.50;     // Signal candle body >= x*range
input double   InpB2_CloseZone     = 0.25;     // Close within x*range of extreme
input int      InpB2_BigN          = 3;        // Signal candle bigger than previous N
input double   InpB2_Buf           = 0.10;     // SL buffer (ATR)
input double   InpB2_TpR           = 3.0;      // TP in R (0 = trail only)
input bool     InpB2_D1Filter      = true;     // Also require D1 200EMA side
input bool     InpB2_Trail         = true;     // Trail SL behind new swings of the B2 timeframe

input group "=== B2: H1 / M30 overrides (other B2 settings shared with H4) ==="
input int      InpB2H1_K           = 4;        // H1 swing strength (tested: 4)
input int      InpB2H1_MinRet      = 1;        // H1 retest bars (tested: 1)
input double   InpB2H1_Slope       = 0.15;     // H1 min 200EMA slope (tested: 0.15)
input int      InpB2M30_K          = 4;        // M30 swing strength
input int      InpB2M30_MinRet     = 1;        // M30 retest bars
input double   InpB2M30_Slope      = 0.15;     // M30 min 200EMA slope

input group "=== B3: S&R Zones (H1, 4h+1h 200EMA) ==="
input int      InpB3_K             = 5;        // Pivot strength
input int      InpB3_LB            = 150;      // Pivot look-back (H1 bars)
input double   InpB3_Prom          = 1.0;      // Pivot prominence (ATR) = "same degree"
input int      InpB3_SlopeBars     = 10;       // EMA slope bars
input int      InpB3_NC            = 40;       // No H1 close across the EMA in last N bars
input double   InpB3_Big           = 1.2;      // Breakout candle range >= x*ATR
input double   InpB3_Tol           = 0.50;     // Retest tolerance (ATR)
input double   InpB3_Fail          = 0.50;     // Cancel if close back through level by x ATR
input int      InpB3_MaxWait       = 24;       // Order expires after N H1 bars
input double   InpB3_Buf           = 0.10;     // SL buffer (ATR)
input int      InpB3_TpMode        = 2;        // TP: 0 none, 1 book trend-line, 2 fixed R
input double   InpB3_TpR           = 2.0;      // Fixed R (mode 2)
input bool     InpB3_EmaExit       = true;     // Exit on H1 close through the 200EMA
input bool     InpB3_Session       = false;    // Breakout candle must be in session

input group "=== B1: Price Patterns (M30, H4 impulse bias) ==="
input int      InpB1_K4            = 5;        // H4 swing strength for impulse bias
input int      InpB1_LMin          = 6;        // Min pattern length (bars)
input int      InpB1_LMax          = 24;       // Max pattern length (bars)
input int      InpB1_ImpLB         = 20;       // Impulse look-back (bars)
input double   InpB1_ImpK          = 3.0;      // Impulse >= x*ATR
input double   InpB1_FibMin        = 0.382;    // Min correction (0 = off)
input double   InpB1_Tol           = 0.30;     // Retest tolerance (ATR)
input int      InpB1_Wait          = 8;        // Bars to wait for the retest trigger
input double   InpB1_Buf           = 0.10;     // SL buffer (ATR)
input double   InpB1_TpR           = 0.0;      // TP in R (0 = trail only, as book)

input group "=== B4: Value Area (M15) ==="
input int      InpB4_Win           = 480;      // Profile window (M15 bars; 480 = 30 H4 bars)
input int      InpB4_Bins          = 60;       // Profile bins
input double   InpB4_VA            = 0.70;     // Value area fraction
input double   InpB4_TrendFrac     = 0.15;     // Control shift = trend (x VA width)
input int      InpB4_SV            = 6;        // Small-value look-back bars
input int      InpB4_IW            = 8;        // Bars for initiative break
input int      InpB4_RW            = 8;        // Bars for retest fill
input double   InpB4_Buf           = 0.10;     // SL buffer (ATR)
input double   InpB4_RRMin         = 2.0;      // Min reward:risk
input double   InpB4_Zone          = 0.10;     // "Just above the control" (x VA width)
input bool     InpB4_Trail         = true;     // Trail SL behind new M15 swings

input group "=== Trailing ==="
input int      InpTrailK           = 2;        // Swing (fractal) strength for trailing
input double   InpTrailBuf         = 0.10;     // Trail buffer (ATR)

input group "=== Regime filter (v3, new entries only) ==="
input ENUM_DPA_REG_TREND InpRegTrendMode = DPA_REG_ADX; // Trend-strength test
input ENUM_DPA_REG_TF    InpRegTrendTF   = DPA_REGTF_H4; // ...measured on
input int      InpRegADXPeriod     = 14;       // ADX period
input double   InpRegADXMin        = 20.0;     // Min ADX
input int      InpRegERLen         = 20;       // Efficiency-ratio length (bars)
input double   InpRegERMin         = 0.25;     // Min efficiency ratio (0..1)
input bool     InpRegATRFilter     = true;    // Stand aside when D1 ATR(14) is extreme vs its own last year
input int      InpRegATRLookback   = 252;      // D1 bars in the percentile window (252 = ~1 year)
input double   InpRegATRPctLow     = 10.0;     // Stand aside below this percentile (dead market)
input double   InpRegATRPctHigh    = 95.0;     // Stand aside above this percentile (shock / crisis)
input bool     InpRegD1Slope       = true;    // Require the D1 200EMA to slope in the trade direction
input int      InpRegD1SlopeBars   = 20;       // D1 slope bars
input double   InpRegD1SlopeMin    = 0.0;      // Min D1 slope (D1 ATR units over the slope bars)

input group "=== Regime health / self-kill per symbol+sleeve (v3) ==="
input int      InpHealthN          = 8;        // Last N closed trades of this symbol+sleeve (0 = off)
input double   InpHealthMinAvgR    = -0.25;    // Pause the sleeve if their average R is below this
input int      InpHealthPauseDays  = 20;       // Pause length (days), then retry with a fresh count
input int      InpHealthLookbackDays=365;      // Ignore trades older than this

input group "=== News filter (v3) ==="
input bool     InpNewsFilter       = true;    // Use the news filter
input ENUM_DPA_NEWS_SRC InpNewsSource = DPA_NEWS_AUTO; // Event source
input int      InpNewsMinImpact    = 3;        // Min impact: 3 = high, 2 = moderate+, 1 = all
input int      InpNewsMinsBefore   = 30;       // Window starts N minutes before the release
input int      InpNewsMinsAfter    = 30;       // ...and ends N minutes after
input string   InpNewsCurrencies   = "";       // "" = the symbol's own currencies (XAUUSD -> USD); or a list, e.g. USD,EUR
input bool     InpNewsBlockEntries = true;     // Block new entries (and remove pending orders) inside the window
input ENUM_DPA_NEWS_ACT InpNewsOpenAction = DPA_NEWSACT_TIGHTEN; // What to do with open trades inside the window
input string   InpNewsCSV          = "DamirPA_news.csv"; // CSV: "yyyy.mm.dd hh:mi,CCY,impact[,title]"; "#tz=utc" (default) or "#tz=server"
input bool     InpNewsCSVCommon    = true;     // CSV lives in Terminal\Common\Files (readable by tester agents)
input bool     InpNewsHeurNFP      = true;     // Heuristic: US NFP, first Friday 08:30 New York
input bool     InpNewsHeurFOMC     = true;     // Heuristic: every Wednesday 14:00 New York (covers FOMC days)
input bool     InpNewsHeurUS0830   = false;    // Heuristic: every Tue-Fri 08:30 New York (CPI, retail sales, ...)

input group "=== Protection (v3; basket = all DamirPA magics on the account) ==="
input double   InpSymDailyLossPct  = 1.0;        // Per-symbol daily loss cap, % of day-start balance (0 = off)
input double   InpMaxOpenRiskPct   = 4.0;        // Max open risk across the basket, % of balance (0 = off)
input int      InpMaxPositions     = 6;        // Max concurrent positions + pending orders in the basket (0 = off)
input int      InpCorrMaxSameDir   = 2;        // Max positions with the same exposure per currency, e.g. 2 = max 2 JPY-short (0 = off)
input double   InpBasketDDPct      = 6.0;        // Equity drawdown from its peak that pauses ALL trading (0 = off)
input int      InpBasketPauseDays  = 5;        // ...pause length (days)
input bool     InpBasketCloseOnTrip= false;    // ...also close open positions when it trips

input group "=== Risk guard (prop-safe) ==="
input ENUM_DPA_GUARD_SCOPE InpGuardScope = DPA_GUARD_FAMILY; // What the loss/trade counters include
input int      InpMaxLossesDay     = 2;        // Stop for the day after N losing trades
input double   InpDailyLossPct     = 2.0;      // Own daily loss stop, % of day-start balance
input double   InpPropDailyDDPct   = 5.0;      // Prop daily drawdown limit % (equity vs day start)
input double   InpPropMaxDDPct     = 10.0;     // Prop max drawdown limit % (equity vs initial)
input double   InpPropBufferPct    = 0.5;      // Safety buffer before prop limits (%)
input double   InpInitialBalance   = 0;        // Initial balance for max DD (0 = first seen)
input int      InpMaxTradesDay     = 4;        // Max new trades per day
input bool     InpUseTargetLock    = false;    // Stop for the day once target is reached
input double   InpDailyTargetUSD   = 200;      // Daily target ($)

input group "=== Session (UK time) ==="
input string   InpSessStart        = "07:00";  // Session start UK (B4 entries, B3 optional)
input string   InpSessEnd          = "17:00";  // Session end UK  (NAS100: 13:30-20:00)
input int      InpServerTZ         = 0;        // Server clock: 0 = NY-close (UTC+2/+3), 1 = fixed offset
input int      InpServerFixedOffH  = 2;        // Fixed server UTC offset (hours) if mode 1

input group "=== Telegram (optional) ==="
input bool     InpTelegram         = false;    // Send Telegram messages (allow api.telegram.org in WebRequest)
input string   InpTgToken          = "";       // Bot token
input string   InpTgChat           = "";       // Chat id

input group "=== Panel ==="
input bool     InpPanel            = true;     // Show on-chart panel

//--- sleeves ---------------------------------------------------------
// a sleeve = one model on one timeframe with its own magic number
#define NSLV 6
#define SLV_B2H4  0
#define SLV_B2H1  1
#define SLV_B2M30 2
#define SLV_B3    3
#define SLV_B1    4
#define SLV_B4    5
int      g_order[NSLV]={SLV_B1,SLV_B2H4,SLV_B2H1,SLV_B2M30,SLV_B3,SLV_B4};   // v2 processed B1,B2,B3,B4
int      SlvModel(int j){ if(j<=SLV_B2M30) return 2; if(j==SLV_B3) return 3; if(j==SLV_B1) return 1; return 4; }
string   SlvName(int j){ if(j==SLV_B2H4) return "B2"; if(j==SLV_B2H1) return "B2H1"; if(j==SLV_B2M30) return "B2M30"; if(j==SLV_B3) return "B3"; if(j==SLV_B1) return "B1"; return "B4"; }
ENUM_TIMEFRAMES SlvTF(int j){ if(j==SLV_B2H4) return PERIOD_H4; if(j==SLV_B2H1) return PERIOD_H1; if(j==SLV_B2M30) return PERIOD_M30; if(j==SLV_B3) return PERIOD_H1; if(j==SLV_B1) return PERIOD_M30; return PERIOD_M15; }
int      SlvOffset(int j){ if(j==SLV_B2H4) return 2; if(j==SLV_B2H1) return 12; if(j==SLV_B2M30) return 22; if(j==SLV_B3) return 3; if(j==SLV_B1) return 1; return 4; }
long     SlvMagic(int j){ return InpMagic+SlvOffset(j); }
bool     SlvOn(int j)
  {
   if(j==SLV_B2H4)  return (InpUseB2 && InpB2_OnH4);
   if(j==SLV_B2H1)  return (InpUseB2 && InpB2_OnH1);
   if(j==SLV_B2M30) return (InpUseB2 && InpB2_OnM30);
   if(j==SLV_B3) return InpUseB3;
   if(j==SLV_B1) return InpUseB1;
   return InpUseB4;
  }
int      SlvFromMagic(long mg){ int j; for(j=0;j<NSLV;j++) if(SlvMagic(j)==mg) return j; return -1; }

//--- globals --------------------------------------------------------
CTrade   g_trade;
DPParams g_p;               // H4 / module params from the inputs
DPParams g_sp[NSLV];        // per-sleeve params (B2 H1/M30 overrides)
string   g_sym="";          // symbol currently being processed
int      g_cur=0;           // its index in g_syms
string   GVP;               // its global-variable prefix
string   g_acctGVP;         // prefix for init balance / day keys (chart symbol, as v2)
string   g_basketGVP;       // prefix for basket-wide state (circuit breaker)
long     g_magicBase=0;
int      g_digits=2;
double   g_initBal=0, g_dayStartBal=0;
int      g_dayKey=-1;
bool     g_lockDay=false, g_lockForever=false;
string   g_lockWhy="";
string   g_lastMsg="";
int      g_sessS=420, g_sessE=1020;
// symbols handled by this instance
string   g_syms[];
int      g_symAllowed[];     // 1 = on the whitelist
string   g_symGVP[];
int      g_symSpec[];        // 1 = spec already logged
datetime g_lastBar[];       // [k*NSLV+j]
long     g_lastSig[];       // [k*NSLV+j] last (setup*4+dir) counted as a unique signal
int      g_nsym=0;
string   g_wl[];
int      g_nwl=0;
// skip-reason counters (printed in OnDeinit)
#define NCNT 23
int      g_cnt[NCNT];
string   g_cntName[NCNT]={"history not ready","lot below min","spread too wide","SL inside stops level","TP inside stops level","margin reduced/skip","orders sent","order send failed","signal bars",
                          "not whitelisted","basket circuit breaker","sleeve health pause","news window","regime: trend weak","regime: ATR pct low","regime: ATR pct high","regime: D1 slope",
                          "symbol daily loss cap","max positions","currency exposure","max open risk","daily guard locked","unique setups"};
// monthly diagnostics per symbol
int      g_mKey[];          // yyyymm being counted
int      g_mCnt[];          // [k*NCNT+c] counters this month
int      g_mFills[];        // entries filled this month
int      g_totFills[];
int      g_months[];
int      g_monthsHit[];
void Diag(int k,string msg)
  {
   g_cnt[k]++;
   if(g_cur>=0 && g_cur<g_nsym) g_mCnt[g_cur*NCNT+k]++;
   if(!InpDiagLog) return;
   if(g_cnt[k]<=10 || g_cnt[k]%50==0) Print("[DamirPA][diag#",g_cnt[k],"] ",g_sym," ",g_cntName[k],": ",msg);
  }
//--- time helpers (server -> UTC -> UK) -----------------------------
int NthSunday(int y,int mon,int nth){ MqlDateTime d; d.year=y;d.mon=mon;d.day=1;d.hour=0;d.min=0;d.sec=0; datetime t=StructToTime(d); TimeToStruct(t,d); int first=1+((7-d.day_of_week)%7); return first+7*(nth-1); }
int LastSunday(int y,int mon){ MqlDateTime d; d.year=y;d.mon=mon;d.day=1;d.hour=0;d.min=0;d.sec=0; datetime t=StructToTime(d); int dim=31; if(mon==4||mon==6||mon==9||mon==11) dim=30; if(mon==2) dim=28;
   datetime tl=t+(dim-1)*86400; TimeToStruct(tl,d); return dim-d.day_of_week; }
bool UsDST(datetime utc){ MqlDateTime d; TimeToStruct(utc,d); int y=d.year;
   MqlDateTime a; a.year=y;a.mon=3;a.day=NthSunday(y,3,2);a.hour=7;a.min=0;a.sec=0;   // 2am EST = 07:00 UTC
   MqlDateTime b; b.year=y;b.mon=11;b.day=NthSunday(y,11,1);b.hour=6;b.min=0;b.sec=0;  // 2am EDT = 06:00 UTC
   return (utc>=StructToTime(a) && utc<StructToTime(b)); }
bool UkDST(datetime utc){ MqlDateTime d; TimeToStruct(utc,d); int y=d.year;
   MqlDateTime a; a.year=y;a.mon=3;a.day=LastSunday(y,3);a.hour=1;a.min=0;a.sec=0;
   MqlDateTime b; b.year=y;b.mon=10;b.day=LastSunday(y,10);b.hour=1;b.min=0;b.sec=0;
   return (utc>=StructToTime(a) && utc<StructToTime(b)); }
datetime ServerToUTC(datetime srv)
  {
   if(InpServerTZ==1) return srv-InpServerFixedOffH*3600;
   datetime guess=srv-2*3600;                // NY-close server = UTC+2 (winter) / UTC+3 (US summer)
   if(UsDST(guess-3600)) return srv-3*3600;
   return guess;
  }
int UkMinute(datetime srv){ datetime u=ServerToUTC(srv); if(UkDST(u)) u+=3600; MqlDateTime d; TimeToStruct(u,d); return d.hour*60+d.min; }
int ParseHM(string s){ int p=StringFind(s,":"); if(p<0) return (int)StringToInteger(s)*60; return (int)StringToInteger(StringSubstr(s,0,p))*60+(int)StringToInteger(StringSubstr(s,p+1)); }
bool InSess(int um){ if(g_sessS<=g_sessE) return (um>=g_sessS && um<g_sessE); return (um>=g_sessS || um<g_sessE); }

datetime UTCToServer(datetime utc)
  {
   if(InpServerTZ==1) return utc+InpServerFixedOffH*3600;
   return utc+(UsDST(utc)?3:2)*3600;          // NY-close server = UTC+3 during US DST, else UTC+2
  }
datetime NYToUTC(datetime nyWall,bool dst){ return nyWall+(dst?4:5)*3600; }

//--- symbol bookkeeping -------------------------------------------------
string UpperTrim(string s){ string t=s; StringTrimLeft(t); StringTrimRight(t); StringToUpper(t); return t; }
void ParseWhitelist()
  {
   string parts[]; int n=StringSplit(InpSymbolWhitelist,',',parts); int i;
   g_nwl=0; ArrayResize(g_wl,0);
   for(i=0;i<n;i++){ string e=UpperTrim(parts[i]); if(e=="") continue; ArrayResize(g_wl,g_nwl+1); g_wl[g_nwl]=e; g_nwl++; }
  }
// whitelist match: exact, or the entry followed by a non-letter broker suffix (XAUUSD.a, XAUUSD-ecn, XAUUSDm is NOT matched)
bool WLMatch(string sym,string e)
  {
   string u=UpperTrim(sym);
   if(u==e) return true;
   if(StringLen(u)>StringLen(e) && StringFind(u,e)==0)
     {
      string nx=StringSubstr(u,StringLen(e),1);
      if(!(nx>="A" && nx<="Z")) return true;
     }
   return false;
  }
bool WLAllowed(string sym)
  {
   if(g_nwl==0) return true;
   int i; for(i=0;i<g_nwl;i++) if(WLMatch(sym,g_wl[i])) return true;
   return false;
  }
int SymIndex(string sym){ int k; for(k=0;k<g_nsym;k++) if(g_syms[k]==sym) return k; return -1; }
bool SymManaged(string sym){ return (SymIndex(sym)>=0); }
void AddSym(string sym)
  {
   if(SymIndex(sym)>=0) return;
   int k=g_nsym; g_nsym++;
   ArrayResize(g_syms,g_nsym); ArrayResize(g_symAllowed,g_nsym); ArrayResize(g_symGVP,g_nsym); ArrayResize(g_symSpec,g_nsym);
   ArrayResize(g_lastBar,g_nsym*NSLV); ArrayResize(g_lastSig,g_nsym*NSLV);
   ArrayResize(g_mKey,g_nsym); ArrayResize(g_mCnt,g_nsym*NCNT); ArrayResize(g_mFills,g_nsym); ArrayResize(g_totFills,g_nsym);
   ArrayResize(g_months,g_nsym); ArrayResize(g_monthsHit,g_nsym);
   g_syms[k]=sym; g_symAllowed[k]=WLAllowed(sym)?1:0; g_symGVP[k]="DPA_"+IntegerToString(InpMagic)+"_"+sym+"_"; g_symSpec[k]=0;
   int j; for(j=0;j<NSLV;j++){ g_lastBar[k*NSLV+j]=0; g_lastSig[k*NSLV+j]=0; }
   int c; for(c=0;c<NCNT;c++) g_mCnt[k*NCNT+c]=0;
   g_mKey[k]=0; g_mFills[k]=0; g_totFills[k]=0; g_months[k]=0; g_monthsHit[k]=0;
  }
string g_ctxSym="";
datetime g_ctxBar=0;
void UseSym(int k)
  {
   if(k==g_cur && g_sym==g_syms[k]) return;
   g_cur=k; g_sym=g_syms[k]; GVP=g_symGVP[k];
   g_digits=(int)SymbolInfoInteger(g_sym,SYMBOL_DIGITS);
   g_trade.SetTypeFillingBySymbol(g_sym);
  }

//--- series building --------------------------------------------------
bool LoadSeries(ENUM_TIMEFRAMES tf,int want,DPSeries &s)
  {
   MqlRates r[];
   int got=CopyRates(g_sym,tf,1,want,r);      // shift 1 = closed bars only, oldest first
   if(got<=0) return false;
   s.n=got;
   ArrayResize(s.t,got);ArrayResize(s.o,got);ArrayResize(s.h,got);ArrayResize(s.l,got);ArrayResize(s.c,got);ArrayResize(s.sess,got);
   ArrayResize(s.ctxA,got);ArrayResize(s.ctxB,got);ArrayResize(s.ctxC,got);ArrayResize(s.ctxD,got);
   int i;
   for(i=0;i<got;i++)
     {
      s.t[i]=(long)r[i].time; s.o[i]=r[i].open; s.h[i]=r[i].high; s.l[i]=r[i].low; s.c[i]=r[i].close;
      s.sess[i]=InSess(UkMinute(r[i].time))?1:0; s.ctxA[i]=0; s.ctxB[i]=0; s.ctxC[i]=0; s.ctxD[i]=0;
     }
   DP_CalcATR(s,14); DP_CalcEMA(s,200);
   return true;
  }

DPSeries g_h4, g_d1;
double   g_d1side[];
double   g_h4bias[];
double   g_h4trend[];
double   g_h4b2[];      // H4 200EMA trend with the H4 B2 slope rule (ctxD of the H4 sleeve: no-op)
bool NeedBias(){ return (InpConfluence || InpUseB1); }   // H4 impulse bias is only read by B1 and by confluence
bool BuildContexts()
  {
   datetime t4=iTime(g_sym,PERIOD_H4,1);
   if(t4==g_ctxBar && g_ctxSym==g_sym && g_h4.n>0) return true;
   if(!LoadSeries(PERIOD_H4,1500,g_h4)) return false;
   if(!LoadSeries(PERIOD_D1,1000,g_d1)) return false;
   if(g_d1.n<210 || g_h4.n<600)
     {
      Diag(0,"need >=600 H4 and >=210 D1 closed bars, have H4="+IntegerToString(g_h4.n)+" D1="+IntegerToString(g_d1.n));
      return false;
     }
   ArrayResize(g_d1side,g_d1.n); ArrayResize(g_h4bias,g_h4.n); ArrayResize(g_h4trend,g_h4.n); ArrayResize(g_h4b2,g_h4.n);
   int i; bool nb=NeedBias();
   for(i=0;i<g_d1.n;i++) g_d1side[i]=DP_EmaTrendAt(g_d1,i,10,0.0,false);
   for(i=0;i<g_h4.n;i++)
     {
      g_h4trend[i]=DP_EmaTrendAt(g_h4,i,g_p.b3_slopeBars,0.0,true);
      g_h4b2[i]=DP_EmaTrendAt(g_h4,i,g_p.b2_slopeBars,g_p.b2_slope,true);
      g_h4bias[i]=(nb && i>=g_h4.n-600)?DP_ImpulseBiasAt(g_h4,i,g_p.b1_k4,300):0;   // only recent bars are ever read
     }
   g_ctxBar=t4; g_ctxSym=g_sym;
   return true;
  }

bool BuildSleeveSeries(int j,DPSeries &s)
  {
   if(!BuildContexts()) return false;
   int m=SlvModel(j);
   if(j==SLV_B2H4)
     {
      int i; s.n=g_h4.n;                         // module TF = H4: reuse the H4 window (v2 path, unchanged)
      ArrayResize(s.t,s.n);ArrayResize(s.o,s.n);ArrayResize(s.h,s.n);ArrayResize(s.l,s.n);ArrayResize(s.c,s.n);ArrayResize(s.sess,s.n);
      ArrayResize(s.atr,s.n);ArrayResize(s.ema,s.n);ArrayResize(s.ctxA,s.n);ArrayResize(s.ctxB,s.n);ArrayResize(s.ctxC,s.n);ArrayResize(s.ctxD,s.n);
      for(i=0;i<s.n;i++){ s.t[i]=g_h4.t[i];s.o[i]=g_h4.o[i];s.h[i]=g_h4.h[i];s.l[i]=g_h4.l[i];s.c[i]=g_h4.c[i];s.sess[i]=g_h4.sess[i];s.atr[i]=g_h4.atr[i];s.ema[i]=g_h4.ema[i]; }
      DP_Align(s,14400,g_d1,86400,g_d1side,s.ctxA);
      DP_Align(s,14400,g_d1,86400,g_d1side,s.ctxB);
      DP_Align(s,14400,g_h4,14400,g_h4bias,s.ctxC);
      DP_Align(s,14400,g_h4,14400,g_h4b2,s.ctxD);   // identical to B2's own H4 trend test -> no-op on H4
      return (s.n>=600);
     }
   ENUM_TIMEFRAMES tf=SlvTF(j);
   int sec=PeriodSeconds(tf);
   if(!LoadSeries(tf,1500,s)) return false;
   if(s.n<600){ Diag(0,"need >=600 closed bars on "+EnumToString(tf)+", have "+IntegerToString(s.n)); return false; }
   if(m==2)                                      // B2 below H4: same contexts as the backtest harness (B2H1 / B2M30)
     {
      double h4b2[]; ArrayResize(h4b2,g_h4.n); int i;
      int sb=g_sp[j].b2_slopeBars; double sm=g_sp[j].b2_slope;
      for(i=0;i<g_h4.n;i++) h4b2[i]=DP_EmaTrendAt(g_h4,i,sb,sm,true);   // H4 trend with THIS sleeve's slope rule
      DP_Align(s,sec,g_d1,86400,g_d1side,s.ctxA);
      DP_Align(s,sec,g_d1,86400,g_d1side,s.ctxB);
      DP_Align(s,sec,g_h4,14400,g_h4bias,s.ctxC);
      DP_Align(s,sec,g_h4,14400,h4b2,s.ctxD);
      return true;
     }
   DP_Align(s,sec,g_d1,86400,g_d1side,s.ctxB);
   DP_Align(s,sec,g_h4,14400,g_h4bias,s.ctxC);
   if(m==3) DP_Align(s,sec,g_h4,14400,g_h4trend,s.ctxA);
   if(m==1) DP_Align(s,sec,g_h4,14400,g_h4bias,s.ctxA);
   return true;
  }

//--- parameters from inputs --------------------------------------------
void FillParams()
  {
   DP_DefaultParams(g_p);
   g_p.b2_k=InpB2_K; g_p.b2_lb=InpB2_LB; g_p.b2_slopeBars=InpB2_SlopeBars; g_p.b2_slope=InpB2_Slope; g_p.b2_maxSince=InpB2_MaxSince;
   g_p.b2_tol=InpB2_Tol; g_p.b2_minRet=InpB2_MinRet; g_p.b2_body=InpB2_Body; g_p.b2_closeZone=InpB2_CloseZone; g_p.b2_bigN=InpB2_BigN;
   g_p.b2_buf=InpB2_Buf; g_p.b2_tpR=InpB2_TpR; g_p.b2_d1=InpB2_D1Filter?1:0; g_p.b2_h4=InpB2_H4Filter?1:0;
   g_p.b3_k=InpB3_K; g_p.b3_lb=InpB3_LB; g_p.b3_prom=InpB3_Prom; g_p.b3_slopeBars=InpB3_SlopeBars; g_p.b3_nc=InpB3_NC; g_p.b3_big=InpB3_Big;
   g_p.b3_tol=InpB3_Tol; g_p.b3_fail=InpB3_Fail; g_p.b3_maxWait=InpB3_MaxWait; g_p.b3_buf=InpB3_Buf; g_p.b3_tpMode=InpB3_TpMode; g_p.b3_tpR=InpB3_TpR;
   g_p.b3_emaExit=InpB3_EmaExit?1:0; g_p.b3_sess=InpB3_Session?1:0;
   g_p.b1_k4=InpB1_K4; g_p.b1_lmin=InpB1_LMin; g_p.b1_lmax=InpB1_LMax; g_p.b1_impLB=InpB1_ImpLB; g_p.b1_impK=InpB1_ImpK; g_p.b1_fibMin=InpB1_FibMin;
   g_p.b1_tol=InpB1_Tol; g_p.b1_wait=InpB1_Wait; g_p.b1_buf=InpB1_Buf; g_p.b1_tpR=InpB1_TpR;
   g_p.b4_win=InpB4_Win; g_p.b4_bins=InpB4_Bins; g_p.b4_va=InpB4_VA; g_p.b4_trendFrac=InpB4_TrendFrac; g_p.b4_sv=InpB4_SV; g_p.b4_iw=InpB4_IW;
   g_p.b4_rw=InpB4_RW; g_p.b4_buf=InpB4_Buf; g_p.b4_rrMin=InpB4_RRMin; g_p.b4_zone=InpB4_Zone;
   g_p.trail_k=InpTrailK; g_p.trail_buf=InpTrailBuf; g_p.conf=InpConfluence?1:0;
   int j; for(j=0;j<NSLV;j++) g_sp[j]=g_p;
   g_sp[SLV_B2H1].b2_k=InpB2H1_K;   g_sp[SLV_B2H1].b2_minRet=InpB2H1_MinRet;   g_sp[SLV_B2H1].b2_slope=InpB2H1_Slope;
   g_sp[SLV_B2M30].b2_k=InpB2M30_K; g_sp[SLV_B2M30].b2_minRet=InpB2M30_MinRet; g_sp[SLV_B2M30].b2_slope=InpB2M30_Slope;
  }

//--- Telegram ----------------------------------------------------------
string UrlEncode(string s)
  {
   string r=""; uchar a[]; int n=StringToCharArray(s,a,0,WHOLE_ARRAY,CP_UTF8); int i;
   for(i=0;i<n-1;i++)
     {
      uchar ch=a[i];
      if((ch>='a'&&ch<='z')||(ch>='A'&&ch<='Z')||(ch>='0'&&ch<='9')||ch=='-'||ch=='_'||ch=='.') r+=CharToString(ch);
      else r+=StringFormat("%%%02X",ch);
     }
   return r;
  }
void Notify(string msg)
  {
   g_lastMsg=msg;
   Print("[DamirPA] ",msg);
   if(!InpTelegram || InpTgToken=="" || InpTgChat=="" || MQLInfoInteger(MQL_TESTER)) return;
   string url="https://api.telegram.org/bot"+InpTgToken+"/sendMessage?chat_id="+InpTgChat+"&text="+UrlEncode(g_sym+" "+msg);
   char post[], res[]; string hdr;
   int rc=WebRequest("GET",url,"",5000,post,res,hdr);
   if(rc==-1) Print("[DamirPA] Telegram failed (add https://api.telegram.org to Tools>Options>Expert Advisors>WebRequest). err=",GetLastError());
  }

//--- account / guard ---------------------------------------------------
int DayKey(){ MqlDateTime d; TimeToStruct(TimeCurrent(),d); return d.year*1000+d.day_of_year; }
datetime DayStart(){ MqlDateTime d; TimeToStruct(TimeCurrent(),d); d.hour=0;d.min=0;d.sec=0; return StructToTime(d); }
bool OurMagic(long mg){ return (SlvFromMagic(mg)>=0); }                            // this instance's sleeves
bool FamilyMagic(long mg){ return (mg>InpMagic && mg<InpMagic+100); }             // any DamirPA instance sharing InpMagic
// does a deal/position count towards the daily guard under InpGuardScope?
bool GuardCounts(string sym,long mg)
  {
   if(InpGuardScope==DPA_GUARD_ACCOUNT) return true;
   if(InpGuardScope==DPA_GUARD_FAMILY)  return FamilyMagic(mg);
   return (SymManaged(sym) && OurMagic(mg));
  }

void TodayStats(double &closedPnl,int &losses,int &entries)
  {
   closedPnl=0; losses=0; entries=0;
   if(!HistorySelect(DayStart(),TimeCurrent()+60)) return;
   int n=HistoryDealsTotal(); int i;
   for(i=0;i<n;i++)
     {
      ulong tk=HistoryDealGetTicket(i);
      long dty=HistoryDealGetInteger(tk,DEAL_TYPE); if(dty!=DEAL_TYPE_BUY && dty!=DEAL_TYPE_SELL) continue;   // skip balance/credit
      long mg=HistoryDealGetInteger(tk,DEAL_MAGIC);
      if(!GuardCounts(HistoryDealGetString(tk,DEAL_SYMBOL),mg)) continue;
      long en=HistoryDealGetInteger(tk,DEAL_ENTRY);
      if(en==DEAL_ENTRY_IN) entries++;
      if(en==DEAL_ENTRY_OUT || en==DEAL_ENTRY_INOUT || en==DEAL_ENTRY_OUT_BY)
        {
         double pl=HistoryDealGetDouble(tk,DEAL_PROFIT)+HistoryDealGetDouble(tk,DEAL_SWAP)+HistoryDealGetDouble(tk,DEAL_COMMISSION);
         closedPnl+=pl; if(pl<0) losses++;
        }
     }
  }
double FloatingPnl()
  {
   double f=0; int i;
   for(i=PositionsTotal()-1;i>=0;i--){ ulong tk=PositionGetTicket(i); if(!PositionSelectByTicket(tk)) continue;
      if(!GuardCounts(PositionGetString(POSITION_SYMBOL),PositionGetInteger(POSITION_MAGIC))) continue;
      f+=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP); }
   return f;
  }
// today's closed + floating P&L of one symbol, all DamirPA magics (per-symbol daily cap)
double SymTodayPnl(string sym)
  {
   double p=0; int i;
   if(HistorySelect(DayStart(),TimeCurrent()+60))
     {
      int n=HistoryDealsTotal();
      for(i=0;i<n;i++)
        {
         ulong tk=HistoryDealGetTicket(i);
         long dty=HistoryDealGetInteger(tk,DEAL_TYPE); if(dty!=DEAL_TYPE_BUY && dty!=DEAL_TYPE_SELL) continue;
         if(HistoryDealGetString(tk,DEAL_SYMBOL)!=sym || !FamilyMagic(HistoryDealGetInteger(tk,DEAL_MAGIC))) continue;
         p+=HistoryDealGetDouble(tk,DEAL_PROFIT)+HistoryDealGetDouble(tk,DEAL_SWAP)+HistoryDealGetDouble(tk,DEAL_COMMISSION);
        }
     }
   for(i=PositionsTotal()-1;i>=0;i--){ ulong tk=PositionGetTicket(i); if(!PositionSelectByTicket(tk)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=sym || !FamilyMagic(PositionGetInteger(POSITION_MAGIC))) continue;
      p+=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP); }
   return p;
  }
void CloseAllOurs(string why)
  {
   int i;
   for(i=PositionsTotal()-1;i>=0;i--){ ulong tk=PositionGetTicket(i); if(!PositionSelectByTicket(tk)) continue;
      if(!SymManaged(PositionGetString(POSITION_SYMBOL)) || !OurMagic(PositionGetInteger(POSITION_MAGIC))) continue;
      g_trade.PositionClose(tk); }
   for(i=OrdersTotal()-1;i>=0;i--){ ulong tk=OrderGetTicket(i); if(!OrderSelect(tk)) continue;
      if(!SymManaged(OrderGetString(ORDER_SYMBOL)) || !OurMagic(OrderGetInteger(ORDER_MAGIC))) continue;
      g_trade.OrderDelete(tk); }
   Notify("Guard: "+why+" - positions closed, orders removed");
  }
void DeleteAllPending()
  {
   int i;
   for(i=OrdersTotal()-1;i>=0;i--){ ulong tk=OrderGetTicket(i); if(!OrderSelect(tk)) continue;
      if(!SymManaged(OrderGetString(ORDER_SYMBOL)) || !OurMagic(OrderGetInteger(ORDER_MAGIC))) continue;
      g_trade.OrderDelete(tk); }
  }
void DeletePendingSym(string sym)
  {
   int i;
   for(i=OrdersTotal()-1;i>=0;i--){ ulong tk=OrderGetTicket(i); if(!OrderSelect(tk)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=sym || !OurMagic(OrderGetInteger(ORDER_MAGIC))) continue;
      g_trade.OrderDelete(tk); }
  }

//--- basket equity circuit breaker (shared by every DamirPA instance with this InpMagic) ---
bool BasketPaused(datetime &until)
  {
   until=0;
   if(InpBasketDDPct<=0) return false;
   if(!GlobalVariableCheck(g_basketGVP+"cbuntil")) return false;
   until=(datetime)GlobalVariableGet(g_basketGVP+"cbuntil");
   return (TimeCurrent()<until);
  }
void BasketBreakerCheck(double eq)
  {
   if(InpBasketDDPct<=0) return;
   datetime until;
   if(BasketPaused(until)) return;
   double peak=GlobalVariableCheck(g_basketGVP+"eqpeak")?GlobalVariableGet(g_basketGVP+"eqpeak"):eq;
   if(eq>peak) peak=eq;
   if(eq<=peak*(1.0-InpBasketDDPct/100.0))
     {
      datetime u=TimeCurrent()+InpBasketPauseDays*86400;
      GlobalVariableSet(g_basketGVP+"cbuntil",(double)u);
      GlobalVariableSet(g_basketGVP+"eqpeak",eq);          // the next trip is measured from here
      if(InpBasketCloseOnTrip) CloseAllOurs("basket drawdown "+DoubleToString(InpBasketDDPct,1)+"% from peak "+DoubleToString(peak,2));
      else DeleteAllPending();
      Notify("Basket circuit breaker: equity "+DoubleToString(eq,2)+" is "+DoubleToString(InpBasketDDPct,1)+"% below peak "+DoubleToString(peak,2)+" - no new trades until "+TimeToString(u));
      return;
     }
   GlobalVariableSet(g_basketGVP+"eqpeak",peak);
  }

// returns true if new entries are allowed
bool GuardCheck()
  {
   int dk=DayKey();
   double bal=AccountInfoDouble(ACCOUNT_BALANCE), eq=AccountInfoDouble(ACCOUNT_EQUITY);
   if(dk!=g_dayKey)
     {
      g_dayKey=dk; g_dayStartBal=bal; g_lockDay=false; g_lockWhy="";
      GlobalVariableSet(g_acctGVP+"daykey",dk); GlobalVariableSet(g_acctGVP+"daybal",bal);
     }
   if(g_lockForever) return false;
   // prop max drawdown vs initial balance (static)
   double maxFloor=g_initBal*(1.0-(InpPropMaxDDPct-InpPropBufferPct)/100.0);
   if(eq<=maxFloor)
     {
      g_lockForever=true; GlobalVariableSet(g_acctGVP+"lockforever",1); g_lockWhy="PROP MAX DD";
      CloseAllOurs("prop max drawdown buffer reached ("+DoubleToString(eq,2)+")");
      return false;
     }
   BasketBreakerCheck(eq);
   double closed; int losses, entries; TodayStats(closed,losses,entries);
   double dayPnl=eq-g_dayStartBal;
   if(!g_lockDay)
     {
      if(dayPnl<=-g_dayStartBal*(InpPropDailyDDPct-InpPropBufferPct)/100.0){ g_lockDay=true; g_lockWhy="PROP DAILY DD"; CloseAllOurs("prop daily drawdown buffer reached"); }
      else if(dayPnl<=-g_dayStartBal*InpDailyLossPct/100.0){ g_lockDay=true; g_lockWhy="DAILY LOSS STOP"; CloseAllOurs("daily loss stop "+DoubleToString(InpDailyLossPct,1)+"%"); }
      else if(losses>=InpMaxLossesDay){ g_lockDay=true; g_lockWhy="MAX LOSSES"; DeleteAllPending(); Notify("Guard: "+IntegerToString(losses)+" losses today - done for the day"); }
      else if(InpUseTargetLock && closed+FloatingPnl()>=InpDailyTargetUSD){ g_lockDay=true; g_lockWhy="TARGET HIT"; DeleteAllPending(); Notify("Daily target reached - done for the day"); }
     }
   if(g_lockDay) return false;
   if(entries>=InpMaxTradesDay) return false;
   return true;
  }

//--- basket exposure (all DamirPA magics, any symbol) --------------------
// order/position direction: +1 buy side, -1 sell side
int OrderDir(long otype){ if(otype==ORDER_TYPE_BUY || otype==ORDER_TYPE_BUY_STOP || otype==ORDER_TYPE_BUY_LIMIT) return 1; return -1; }
// money lost if price goes from `from` to `sl` (0 if sl is on the profit side); no SL = one risk budget
double RiskMoney(string sym,int dir,double vol,double from,double sl)
  {
   if(sl<=0) return AccountInfoDouble(ACCOUNT_BALANCE)*InpRiskPct/100.0;
   if((dir>0 && sl>=from) || (dir<0 && sl<=from)) return 0;
   double pr=0;
   if(OrderCalcProfit(dir>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL,sym,vol,from,sl,pr) && pr<0) return -pr;
   return 0;
  }
// counts the basket; the pending order of (exSym, exMagic) is excluded (it is the one being re-evaluated)
void BasketScan(string exSym,long exMagic,int &count,double &risk,string &ccy[],int &sgn[],int &ne)
  {
   count=0; risk=0; ne=0; ArrayResize(ccy,0); ArrayResize(sgn,0);
   int i;
   for(i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(!PositionSelectByTicket(tk)) continue;
      if(!FamilyMagic(PositionGetInteger(POSITION_MAGIC))) continue;
      string sym=PositionGetString(POSITION_SYMBOL);
      int d=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1;
      count++;
      risk+=RiskMoney(sym,d,PositionGetDouble(POSITION_VOLUME),PositionGetDouble(POSITION_PRICE_OPEN),PositionGetDouble(POSITION_SL));
      string b=SymbolInfoString(sym,SYMBOL_CURRENCY_BASE), q=SymbolInfoString(sym,SYMBOL_CURRENCY_PROFIT);
      ArrayResize(ccy,ne+2); ArrayResize(sgn,ne+2); ccy[ne]=b; sgn[ne]=d; ccy[ne+1]=q; sgn[ne+1]=-d; ne+=2;
     }
   for(i=OrdersTotal()-1;i>=0;i--)
     {
      ulong tk=OrderGetTicket(i); if(!OrderSelect(tk)) continue;
      long mg=OrderGetInteger(ORDER_MAGIC); if(!FamilyMagic(mg)) continue;
      string sym=OrderGetString(ORDER_SYMBOL);
      if(sym==exSym && mg==exMagic) continue;
      int d=OrderDir(OrderGetInteger(ORDER_TYPE));
      count++;
      risk+=RiskMoney(sym,d,OrderGetDouble(ORDER_VOLUME_CURRENT),OrderGetDouble(ORDER_PRICE_OPEN),OrderGetDouble(ORDER_SL));
      string b=SymbolInfoString(sym,SYMBOL_CURRENCY_BASE), q=SymbolInfoString(sym,SYMBOL_CURRENCY_PROFIT);
      ArrayResize(ccy,ne+2); ArrayResize(sgn,ne+2); ccy[ne]=b; sgn[ne]=d; ccy[ne+1]=q; sgn[ne+1]=-d; ne+=2;
     }
  }
// would a new trade in `dir` push any currency past InpCorrMaxSameDir same-direction exposures?
bool CorrOK(int dir,string &ccy[],int &sgn[],int ne,string &why)
  {
   string b=SymbolInfoString(g_sym,SYMBOL_CURRENCY_BASE), q=SymbolInfoString(g_sym,SYMBOL_CURRENCY_PROFIT);
   string nc[2]; int ns[2]; nc[0]=b; ns[0]=dir; nc[1]=q; ns[1]=-dir;
   int a,i;
   for(a=0;a<2;a++)
     {
      if(nc[a]=="" || (a==1 && nc[1]==nc[0])) continue;
      int same=0;
      for(i=0;i<ne;i++) if(ccy[i]==nc[a] && sgn[i]==ns[a]) same++;
      if(same+1>InpCorrMaxSameDir){ why=nc[a]+(ns[a]>0?" long":" short")+" exposure would be "+IntegerToString(same+1)+" > "+IntegerToString(InpCorrMaxSameDir); return false; }
     }
   return true;
  }
//--- news filter ----------------------------------------------------------
// Event list (server time). Live: MT5 calendar (refreshed every 10 min). Tester: the calendar functions are not
// allowed (error 4014 FUNCTION_NOT_ALLOWED), so the CSV (exported with DamirPA_NewsExport.mq5 or written by hand)
// or the fixed USD heuristic is used instead. See TESTER_GUIDE.md.
datetime g_nT[];
string   g_nC[];
int      g_nI[];
int      g_nN=0;
int      g_newsSrc=0;               // 0 none, 1 calendar, 2 CSV, 3 heuristic
datetime g_newsNextRefresh=0;
datetime g_newsLastMgmt=0;
string   g_newsCcyAll="";          // "|USD|JPY|..." union over managed symbols
string   NewsSrcName(){ if(g_newsSrc==1) return "MT5 calendar"; if(g_newsSrc==2) return "CSV "+InpNewsCSV; if(g_newsSrc==3) return "USD heuristic"; return "none"; }
bool IsMetal(string c){ return (c=="XAU" || c=="XAG" || c=="XPT" || c=="XPD"); }
// "|USD|JPY|" list of currencies whose news affects `sym`
string SymNewsCcys(string sym)
  {
   string r="|";
   if(InpNewsCurrencies!="")
     {
      string parts[]; int n=StringSplit(InpNewsCurrencies,',',parts); int i;
      for(i=0;i<n;i++){ string c=UpperTrim(parts[i]); if(c!="") r+=c+"|"; }
      return r;
     }
   string b=SymbolInfoString(sym,SYMBOL_CURRENCY_BASE), q=SymbolInfoString(sym,SYMBOL_CURRENCY_PROFIT);
   if(b!="" && !IsMetal(b)) r+=b+"|";
   if(q!="" && q!=b && !IsMetal(q)) r+=q+"|";
   return r;
  }
void NewsAdd(datetime t,string c,int imp)
  {
   ArrayResize(g_nT,g_nN+1); ArrayResize(g_nC,g_nN+1); ArrayResize(g_nI,g_nN+1);
   g_nT[g_nN]=t; g_nC[g_nN]=c; g_nI[g_nN]=imp; g_nN++;
  }
int ImpactFromText(string s)
  {
   string u=UpperTrim(s);
   if(u=="3" || u=="HIGH" || u=="H") return 3;
   if(u=="2" || u=="MEDIUM" || u=="MODERATE" || u=="M") return 2;
   if(u=="1" || u=="LOW" || u=="L") return 1;
   return (int)StringToInteger(u);
  }
// returns false on a calendar error (e.g. 4014 in the tester)
bool CalendarRefresh()
  {
   g_nN=0; ArrayResize(g_nT,0); ArrayResize(g_nC,0); ArrayResize(g_nI,0);
   datetime now=TimeTradeServer(); if(now<=0) now=TimeCurrent();
   string parts[]; int n=StringSplit(g_newsCcyAll,'|',parts); int i,k;
   for(i=0;i<n;i++)
     {
      if(parts[i]=="") continue;
      MqlCalendarValue v[];
      ResetLastError();
      int got=CalendarValueHistory(v,now-86400,now+3*86400,NULL,parts[i]);
      if(got<0){ Print("[DamirPA] calendar error ",GetLastError()," for ",parts[i]); return false; }
      for(k=0;k<got;k++)
        {
         MqlCalendarEvent ev;
         if(!CalendarEventById(v[k].event_id,ev)) continue;
         int imp=(ev.importance==CALENDAR_IMPORTANCE_HIGH)?3:(ev.importance==CALENDAR_IMPORTANCE_MODERATE)?2:(ev.importance==CALENDAR_IMPORTANCE_LOW)?1:0;
         if(imp>=InpNewsMinImpact) NewsAdd(v[k].time,parts[i],imp);
        }
     }
   g_newsNextRefresh=TimeCurrent()+600;
   return true;
  }
bool CsvLoad()
  {
   g_nN=0; ArrayResize(g_nT,0); ArrayResize(g_nC,0); ArrayResize(g_nI,0);
   int fl=FILE_READ|FILE_TXT|FILE_ANSI|FILE_SHARE_READ; if(InpNewsCSVCommon) fl|=FILE_COMMON;
   ResetLastError();
   int h=FileOpen(InpNewsCSV,fl);
   if(h==INVALID_HANDLE){ Print("[DamirPA] news CSV '",InpNewsCSV,"' not found in ",(InpNewsCSVCommon?"Terminal\\Common\\Files":"MQL5\\Files")," (err ",GetLastError(),")"); return false; }
   bool utc=true; int rows=0, bad=0;
   while(!FileIsEnding(h))
     {
      string line=FileReadString(h); StringTrimLeft(line); StringTrimRight(line);
      if(line=="") continue;
      if(StringFind(line,"#")==0){ string u=UpperTrim(line); if(StringFind(u,"TZ=SERVER")>=0) utc=false; if(StringFind(u,"TZ=UTC")>=0) utc=true; continue; }
      string f[]; int nf=StringSplit(line,',',f);
      if(nf<3){ bad++; continue; }
      string ds=UpperTrim(f[0]); StringReplace(ds,"-","."); StringReplace(ds,"T"," ");
      datetime t=StringToTime(ds);
      if(t<=0){ bad++; continue; }                       // header row or bad date
      string c=UpperTrim(f[1]); int imp=ImpactFromText(f[2]);
      rows++;
      if(imp<InpNewsMinImpact) continue;
      if(StringFind(g_newsCcyAll,"|"+c+"|")<0) continue;
      NewsAdd(utc?UTCToServer(t):t,c,imp);
     }
   FileClose(h);
   Print("[DamirPA] news CSV: ",rows," rows read, ",g_nN," events kept (impact >= ",InpNewsMinImpact,", currencies ",g_newsCcyAll,", times ",(utc?"UTC -> server":"server"),"), ",bad," lines skipped");
   return (g_nN>0);
  }
void NewsInit()
  {
   g_newsSrc=0; g_newsCcyAll="|";
   if(!InpNewsFilter) return;
   int k;
   for(k=0;k<g_nsym;k++)
     {
      string parts[]; int n=StringSplit(SymNewsCcys(g_syms[k]),'|',parts); int i;
      for(i=0;i<n;i++) if(parts[i]!="" && StringFind(g_newsCcyAll,"|"+parts[i]+"|")<0) g_newsCcyAll+=parts[i]+"|";
     }
   bool tester=(MQLInfoInteger(MQL_TESTER)!=0);
   int want=(int)InpNewsSource;
   if(want==DPA_NEWS_AUTO) want=tester?DPA_NEWS_CSV:DPA_NEWS_CAL;
   if(want==DPA_NEWS_CAL)
     {
      if(tester) Print("[DamirPA] news: the MT5 economic calendar is not available in the Strategy Tester (calendar calls fail with 4014) - falling back");
      else if(CalendarRefresh()){ g_newsSrc=1; }
      if(g_newsSrc==0) want=DPA_NEWS_CSV;
     }
   if(g_newsSrc==0 && want==DPA_NEWS_CSV){ if(CsvLoad()) g_newsSrc=2; else want=DPA_NEWS_HEUR; }
   if(g_newsSrc==0 && want==DPA_NEWS_HEUR) g_newsSrc=3;
   if(g_newsSrc==3 && StringFind(g_newsCcyAll,"|USD|")<0) Print("[DamirPA] news: the heuristic only knows USD events; none of ",g_newsCcyAll," is USD - nothing will be blocked");
   Print("[DamirPA] news filter source: ",NewsSrcName(),", currencies ",g_newsCcyAll,", window -",InpNewsMinsBefore,"/+",InpNewsMinsAfter," min, impact >= ",InpNewsMinImpact);
  }
// fixed USD heuristic: is utcNow inside a window around NFP / Wednesday 14:00 NY / Tue-Fri 08:30 NY?
bool HeurNear(datetime utcNow,string &txt)
  {
   int d;
   for(d=-1;d<=1;d++)
     {
      datetime day=utcNow+d*86400;
      MqlDateTime m; TimeToStruct(day,m); m.hour=0; m.min=0; m.sec=0;
      datetime d0=StructToTime(m);
      bool dst=UsDST(d0+12*3600);
      datetime ev[3]; string nm[3]; int ne=0;
      if(InpNewsHeurNFP && m.day_of_week==5 && m.day<=7){ ev[ne]=NYToUTC(d0+8*3600+30*60,dst); nm[ne]="NFP (heuristic)"; ne++; }
      if(InpNewsHeurFOMC && m.day_of_week==3){ ev[ne]=NYToUTC(d0+14*3600,dst); nm[ne]="Wed 14:00 NY / FOMC (heuristic)"; ne++; }
      if(InpNewsHeurUS0830 && m.day_of_week>=2 && m.day_of_week<=5 && !(InpNewsHeurNFP && m.day_of_week==5 && m.day<=7)){ ev[ne]=NYToUTC(d0+8*3600+30*60,dst); nm[ne]="US 08:30 NY data (heuristic)"; ne++; }
      int i;
      for(i=0;i<ne;i++)
         if(utcNow>=ev[i]-InpNewsMinsBefore*60 && utcNow<=ev[i]+InpNewsMinsAfter*60){ txt=nm[i]+" at "+TimeToString(ev[i])+" UTC"; return true; }
     }
   return false;
  }
// is `sym` inside a news window now? evT = event time (server)
bool NewsWindow(string sym,datetime &evT,string &txt)
  {
   evT=0; txt="";
   if(!InpNewsFilter || g_newsSrc==0) return false;
   datetime now=TimeCurrent();
   if(g_newsSrc==1 && now>=g_newsNextRefresh){ if(!CalendarRefresh()) g_newsNextRefresh=now+600; }
   string cc=SymNewsCcys(sym);
   if(g_newsSrc==3)
     {
      if(StringFind(cc,"|USD|")<0) return false;
      datetime u=ServerToUTC(now);
      if(HeurNear(u,txt)){ evT=now; return true; }
      return false;
     }
   int i;
   for(i=0;i<g_nN;i++)
     {
      if(now<g_nT[i]-InpNewsMinsBefore*60 || now>g_nT[i]+InpNewsMinsAfter*60) continue;
      if(StringFind(cc,"|"+g_nC[i]+"|")<0) continue;
      evT=g_nT[i]; txt=g_nC[i]+" impact "+IntegerToString(g_nI[i])+" at "+TimeToString(g_nT[i])+" server";
      return true;
     }
   return false;
  }
// once every 30 s: inside a window remove pending orders and close / tighten open trades as configured
void NewsManage()
  {
   if(!InpNewsFilter || g_newsSrc==0) return;
   if(TimeCurrent()<g_newsLastMgmt+30) return;
   g_newsLastMgmt=TimeCurrent();
   int k,i;
   for(k=0;k<g_nsym;k++)
     {
      string sym=g_syms[k]; datetime evT; string txt;
      if(!NewsWindow(sym,evT,txt)) continue;
      if(InpNewsBlockEntries) DeletePendingSym(sym);
      if(InpNewsOpenAction==DPA_NEWSACT_NONE) continue;
      for(i=PositionsTotal()-1;i>=0;i--)
        {
         ulong tk=PositionGetTicket(i); if(!PositionSelectByTicket(tk)) continue;
         if(PositionGetString(POSITION_SYMBOL)!=sym || !OurMagic(PositionGetInteger(POSITION_MAGIC))) continue;
         if(InpNewsOpenAction==DPA_NEWSACT_CLOSE){ if(g_trade.PositionClose(tk)) Notify(sym+" news: closed "+IntegerToString((long)tk)+" ("+txt+")"); continue; }
         int dir=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1;
         double op=PositionGetDouble(POSITION_PRICE_OPEN), sl=PositionGetDouble(POSITION_SL), tp=PositionGetDouble(POSITION_TP);
         double bid=SymbolInfoDouble(sym,SYMBOL_BID), ask=SymbolInfoDouble(sym,SYMBOL_ASK), pt=SymbolInfoDouble(sym,SYMBOL_POINT);
         double minDist=MathMax((double)SymbolInfoInteger(sym,SYMBOL_TRADE_STOPS_LEVEL),(double)SymbolInfoInteger(sym,SYMBOL_TRADE_FREEZE_LEVEL))*pt;
         int dg=(int)SymbolInfoInteger(sym,SYMBOL_DIGITS);
         double be=NormalizeDouble(op,dg);
         if(dir>0 && bid-minDist>be && (sl==0 || sl<be)){ if(g_trade.PositionModify(tk,be,tp)) Notify(sym+" news: SL to break-even ("+txt+")"); }
         if(dir<0 && ask+minDist<be && (sl==0 || sl>be)){ if(g_trade.PositionModify(tk,be,tp)) Notify(sym+" news: SL to break-even ("+txt+")"); }
        }
     }
  }

//--- regime health / self-kill per symbol + sleeve ---------------------------
string HKey(int j){ return GVP+SlvName(j)+"_hp_"; }
bool HealthPaused(int j,datetime &until)
  {
   until=0;
   if(InpHealthN<=0) return false;
   if(!GlobalVariableCheck(HKey(j)+"until")) return false;
   until=(datetime)GlobalVariableGet(HKey(j)+"until");
   return (TimeCurrent()<until);
  }
// R of every closed position of this symbol + sleeve entered since `since`, oldest close first
int ClosedR(int j,datetime since,double &rs[])
  {
   ArrayResize(rs,0);
   datetime lb=TimeCurrent()-InpHealthLookbackDays*86400, from=(since>lb)?since:lb;
   if(!HistorySelect(from,TimeCurrent()+60)) return 0;
   long mgc=SlvMagic(j);
   long pid[];
   double ent[];
   double isl[];
   double vol[];
   double net[];
   double gross[];
   double xpv[];
   double xv[];
   int dir[];
   int np=0, nr=0;
   int n=HistoryDealsTotal(), i, x;
   for(i=0;i<n;i++)
     {
      ulong tk=HistoryDealGetTicket(i);
      if(HistoryDealGetString(tk,DEAL_SYMBOL)!=g_sym || HistoryDealGetInteger(tk,DEAL_MAGIC)!=mgc) continue;
      long dty=HistoryDealGetInteger(tk,DEAL_TYPE); if(dty!=DEAL_TYPE_BUY && dty!=DEAL_TYPE_SELL) continue;
      long p=HistoryDealGetInteger(tk,DEAL_POSITION_ID), en=HistoryDealGetInteger(tk,DEAL_ENTRY);
      double money=HistoryDealGetDouble(tk,DEAL_PROFIT)+HistoryDealGetDouble(tk,DEAL_SWAP)+HistoryDealGetDouble(tk,DEAL_COMMISSION);
      if(en==DEAL_ENTRY_IN)
        {
         ArrayResize(pid,np+1); ArrayResize(ent,np+1); ArrayResize(isl,np+1); ArrayResize(vol,np+1); ArrayResize(net,np+1);
         ArrayResize(gross,np+1); ArrayResize(xpv,np+1); ArrayResize(xv,np+1); ArrayResize(dir,np+1);
         pid[np]=p; ent[np]=HistoryDealGetDouble(tk,DEAL_PRICE); isl[np]=HistoryDealGetDouble(tk,DEAL_SL); vol[np]=HistoryDealGetDouble(tk,DEAL_VOLUME);
         net[np]=money; gross[np]=0; xpv[np]=0; xv[np]=0; dir[np]=(dty==DEAL_TYPE_BUY)?1:-1; np++;
         continue;
        }
      int f=-1; for(x=np-1;x>=0;x--) if(pid[x]==p){ f=x; break; }
      if(f<0) continue;                                  // entered before the window
      double v=HistoryDealGetDouble(tk,DEAL_VOLUME);
      net[f]+=money; gross[f]+=HistoryDealGetDouble(tk,DEAL_PROFIT); xpv[f]+=v*HistoryDealGetDouble(tk,DEAL_PRICE); xv[f]+=v;
      if(xv[f]>=vol[f]-1e-9 && isl[f]>0)                 // fully closed -> one R value
        {
         double xp=xpv[f]/xv[f], move=dir[f]*(xp-ent[f]), rpx=MathAbs(ent[f]-isl[f]), r;
         if(rpx<=0) continue;
         if(MathAbs(move)>1e-12 && gross[f]!=0 && gross[f]/move>0) r=net[f]/(gross[f]/move*rpx);   // money R incl. costs
         else r=move/rpx;                                                                          // price R
         ArrayResize(rs,nr+1); rs[nr]=r; nr++;
        }
     }
   return nr;
  }
void HealthEvaluate(int j)
  {
   if(InpHealthN<=0) return;
   datetime until;
   if(HealthPaused(j,until)) return;
   datetime since=GlobalVariableCheck(HKey(j)+"since")?(datetime)GlobalVariableGet(HKey(j)+"since"):0;
   double rs[]; int n=ClosedR(j,since,rs);
   if(n<InpHealthN) return;
   double s=0; int i; for(i=n-InpHealthN;i<n;i++) s+=rs[i];
   double avg=s/InpHealthN;
   if(avg>=InpHealthMinAvgR) return;
   datetime u=TimeCurrent()+InpHealthPauseDays*86400;
   GlobalVariableSet(HKey(j)+"until",(double)u);
   GlobalVariableSet(HKey(j)+"since",(double)u);          // after the pause, count only new trades
   Notify(SlvName(j)+" health: last "+IntegerToString(InpHealthN)+" trades avg "+DoubleToString(avg,2)+"R < "+DoubleToString(InpHealthMinAvgR,2)+"R - sleeve paused until "+TimeToString(u));
  }

//--- regime filter + protections: one gate for every new entry --------------
double TrendMetric(DPSeries &x)
  {
   int i=x.n-1;
   if(InpRegTrendMode==DPA_REG_ADX) return DP_ADXAt(x,i,InpRegADXPeriod,300);
   return DP_ER(x,i,InpRegERLen);
  }
// returns -1 if the entry may go ahead, else the diag counter index; `why` explains
int EntryGate(int j,DPSeries &s,DPOrder &o,string &why)
  {
   why="";
   if(g_symAllowed[g_cur]==0){ why="symbol not in InpSymbolWhitelist ("+InpSymbolWhitelist+")"; return 9; }
   datetime until;
   if(BasketPaused(until)){ why="paused until "+TimeToString(until); return 10; }
   if(HealthPaused(j,until)){ why=SlvName(j)+" paused until "+TimeToString(until); return 11; }
   datetime evT; string txt;
   if(InpNewsFilter && InpNewsBlockEntries && NewsWindow(g_sym,evT,txt)){ why=txt; return 12; }
   if(InpRegTrendMode!=DPA_REG_OFF)
     {
      double v=(InpRegTrendTF==DPA_REGTF_SIGNAL)?TrendMetric(s):TrendMetric(g_h4);
      double mn=(InpRegTrendMode==DPA_REG_ADX)?InpRegADXMin:InpRegERMin;
      if(v<mn){ why=(InpRegTrendMode==DPA_REG_ADX?"ADX ":"ER ")+DoubleToString(v,3)+" < "+DoubleToString(mn,3); return 13; }
     }
   if(InpRegATRFilter)
     {
      double pc=DP_ATRPctAt(g_d1,g_d1.n-1,InpRegATRLookback);
      if(pc>=0 && pc<InpRegATRPctLow){ why="D1 ATR percentile "+DoubleToString(pc,1)+" < "+DoubleToString(InpRegATRPctLow,1); return 14; }
      if(pc>InpRegATRPctHigh){ why="D1 ATR percentile "+DoubleToString(pc,1)+" > "+DoubleToString(InpRegATRPctHigh,1); return 15; }
     }
   if(InpRegD1Slope)
     {
      double sl=DP_EmaSlopeATR(g_d1,g_d1.n-1,InpRegD1SlopeBars);
      if(o.dir*sl<=InpRegD1SlopeMin){ why="D1 200EMA slope "+DoubleToString(sl,3)+" ATR vs "+(o.dir>0?"buy":"sell"); return 16; }
     }
   if(InpSymDailyLossPct>0)
     {
      double p=SymTodayPnl(g_sym);
      if(p<=-g_dayStartBal*InpSymDailyLossPct/100.0){ why=g_sym+" today "+DoubleToString(p,2)+" <= -"+DoubleToString(InpSymDailyLossPct,2)+"%"; return 17; }
     }
   if(InpMaxPositions>0 || InpCorrMaxSameDir>0 || InpMaxOpenRiskPct>0)
     {
      int cnt, ne; double risk; string ccy[]; int sgn[];
      BasketScan(g_sym,SlvMagic(j),cnt,risk,ccy,sgn,ne);
      if(InpMaxPositions>0 && cnt>=InpMaxPositions){ why=IntegerToString(cnt)+" positions/orders open (max "+IntegerToString(InpMaxPositions)+")"; return 18; }
      if(InpCorrMaxSameDir>0 && !CorrOK(o.dir,ccy,sgn,ne,why)) return 19;
      if(InpMaxOpenRiskPct>0)
        {
         double bal=AccountInfoDouble(ACCOUNT_BALANCE), add=bal*InpRiskPct/100.0;
         if(risk+add>bal*InpMaxOpenRiskPct/100.0){ why="open risk "+DoubleToString(risk,2)+" + "+DoubleToString(add,2)+" > "+DoubleToString(InpMaxOpenRiskPct,2)+"% of balance"; return 20; }
        }
     }
   return -1;
  }
// convert an amount in currency ccy to the account currency using a live quote (manual cross-check)
double ConvToAccount(string ccy,double amount)
  {
   string acc=AccountInfoString(ACCOUNT_CURRENCY);
   if(ccy==acc) return amount;
   string sfx=(StringLen(g_sym)>6)?StringSubstr(g_sym,6):"";     // keep a broker suffix such as ".a"
   string c1=ccy+acc+sfx, c2=acc+ccy+sfx, c3=ccy+acc, c4=acc+ccy;
   string cands[4]; cands[0]=c1; cands[1]=c2; cands[2]=c3; cands[3]=c4;
   int k;
   for(k=0;k<4;k++)
     {
      bool custom=false;
      if(!SymbolExist(cands[k],custom)) continue;
      SymbolSelect(cands[k],true);
      double b=SymbolInfoDouble(cands[k],SYMBOL_BID), a=SymbolInfoDouble(cands[k],SYMBOL_ASK);
      if(b<=0 || a<=0) continue;
      if(k==0 || k==2) return amount*b;      // CCYACC: 1 ccy = bid acc
      return amount/a;                       // ACCCCY: 1 acc = ask ccy
     }
   return -1;
  }

// money lost by 1.0 lot if price goes from entry to sl, in ACCOUNT currency.
// Primary: OrderCalcProfit (terminal's own conversion). Fallback: tick value LOSS / tick size.
// Cross-check (forex/CFD calc modes): distance x contract size converted with a live quote; if the primary is off
// (e.g. a tick value left in JPY/SEK) by more than 10%, the cross-check wins and the Journal says so.
double LossPerLot(int dir,double entry,double sl,string &how)
  {
   double dist=MathAbs(entry-sl); how="";
   if(dist<=0) return 0;
   double pr=0, a=-1, b=-1, c=-1;
   if(OrderCalcProfit(dir>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL,g_sym,1.0,entry,sl,pr) && pr<0) a=-pr;
   double tv=SymbolInfoDouble(g_sym,SYMBOL_TRADE_TICK_VALUE_LOSS), ts=SymbolInfoDouble(g_sym,SYMBOL_TRADE_TICK_SIZE);
   if(tv<=0) tv=SymbolInfoDouble(g_sym,SYMBOL_TRADE_TICK_VALUE);
   if(tv>0 && ts>0) b=dist/ts*tv;
   string pccy=SymbolInfoString(g_sym,SYMBOL_CURRENCY_PROFIT);
   double cs=SymbolInfoDouble(g_sym,SYMBOL_TRADE_CONTRACT_SIZE);
   long cm=SymbolInfoInteger(g_sym,SYMBOL_TRADE_CALC_MODE);   // profit = distance x contract only for forex / CFD modes
   bool linear=(cm==SYMBOL_CALC_MODE_FOREX || cm==SYMBOL_CALC_MODE_FOREX_NO_LEVERAGE || cm==SYMBOL_CALC_MODE_CFD || cm==SYMBOL_CALC_MODE_CFDINDEX || cm==SYMBOL_CALC_MODE_CFDLEVERAGE);
   if(linear && cs>0 && pccy!=AccountInfoString(ACCOUNT_CURRENCY)) c=ConvToAccount(pccy,dist*cs);
   double v=(a>0)?a:b; how=(a>0)?"OrderCalcProfit":"tickvalue";
   // >10% apart cannot be spread/rounding: the primary value was not converted to the account currency
   if(c>0 && (v<=0 || v>1.10*c || v<c/1.10)){ how="converted("+pccy+") - primary "+DoubleToString(v,2)+" rejected"; v=c; }
   return v;
  }
int VolDigits(double step){ int d=0; double x=step; while(d<8 && MathAbs(x-MathRound(x))>1e-9){ x*=10.0; d++; } return d; }
double LotsFor(int dir,double entry,double sl,string &why)
  {
   why="";
   double risk=AccountInfoDouble(ACCOUNT_BALANCE)*InpRiskPct/100.0;
   string how; double perLot=LossPerLot(dir,entry,sl,how);
   if(perLot<=0){ why="no loss-per-lot value (tick value/size unavailable)"; return 0; }
   double step=SymbolInfoDouble(g_sym,SYMBOL_VOLUME_STEP), vmin=SymbolInfoDouble(g_sym,SYMBOL_VOLUME_MIN), vmax=SymbolInfoDouble(g_sym,SYMBOL_VOLUME_MAX);
   if(step<=0) step=vmin; if(step<=0) step=0.01;
   double lots=MathFloor(risk/perLot/step+1e-7)*step;
   if(lots<vmin)
     {
      if(InpMinLotRiskMult>0 && vmin*perLot<=InpMinLotRiskMult*risk) lots=vmin;
      else { why="min lot "+DoubleToString(vmin,2)+" risks "+DoubleToString(vmin*perLot,2)+" > budget "+DoubleToString(risk,2)+" (loss/lot "+DoubleToString(perLot,2)+" via "+how+")"; return 0; }   // never exceed the risk budget to reach min lot
     }
   if(vmax>0 && lots>vmax) lots=vmax;
   return NormalizeDouble(lots,VolDigits(step));
  }
// shrink to free margin if needed (keeps 10% headroom); 0 if even the min lot does not fit
double MarginFit(int dir,double lots,double price)
  {
   double mg=0, fm=AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   if(!OrderCalcMargin(dir>0?ORDER_TYPE_BUY:ORDER_TYPE_SELL,g_sym,lots,price,mg) || mg<=0 || mg<=0.9*fm) return lots;
   double step=SymbolInfoDouble(g_sym,SYMBOL_VOLUME_STEP), vmin=SymbolInfoDouble(g_sym,SYMBOL_VOLUME_MIN);
   if(step<=0) step=0.01;
   double nl=MathFloor(lots*0.9*fm/mg/step+1e-7)*step;
   Diag(5,"margin "+DoubleToString(mg,2)+" > 90% free margin "+DoubleToString(fm,2)+", lots "+DoubleToString(lots,2)+" -> "+DoubleToString(nl,2));
   if(nl<vmin) return 0;
   return NormalizeDouble(nl,VolDigits(step));
  }
void LogSpec(double atr)
  {
   if(g_symSpec[g_cur]!=0 || !InpDiagLog) return;
   g_symSpec[g_cur]=1;
   double bid=SymbolInfoDouble(g_sym,SYMBOL_BID);
   string how; double lpl=(bid>0 && atr>0)?LossPerLot(1,bid,bid-atr,how):0;
   double risk=AccountInfoDouble(ACCOUNT_BALANCE)*InpRiskPct/100.0;
   PrintFormat("[DamirPA] %s spec: digits %d point %g tick %g tickValue %g / loss %g contract %g profitCcy %s acct %s volMin %g step %g max %g stopsLevel %d pts freeze %d pts",
      g_sym,g_digits,SymbolInfoDouble(g_sym,SYMBOL_POINT),SymbolInfoDouble(g_sym,SYMBOL_TRADE_TICK_SIZE),SymbolInfoDouble(g_sym,SYMBOL_TRADE_TICK_VALUE),
      SymbolInfoDouble(g_sym,SYMBOL_TRADE_TICK_VALUE_LOSS),SymbolInfoDouble(g_sym,SYMBOL_TRADE_CONTRACT_SIZE),SymbolInfoString(g_sym,SYMBOL_CURRENCY_PROFIT),
      AccountInfoString(ACCOUNT_CURRENCY),SymbolInfoDouble(g_sym,SYMBOL_VOLUME_MIN),SymbolInfoDouble(g_sym,SYMBOL_VOLUME_STEP),SymbolInfoDouble(g_sym,SYMBOL_VOLUME_MAX),
      (int)SymbolInfoInteger(g_sym,SYMBOL_TRADE_STOPS_LEVEL),(int)SymbolInfoInteger(g_sym,SYMBOL_TRADE_FREEZE_LEVEL));
   PrintFormat("[DamirPA] %s sizing check: 1 H4-ATR stop = %g price -> loss/lot %.2f %s (%s); budget %.2f -> %.2f lots",
      g_sym,atr,lpl,AccountInfoString(ACCOUNT_CURRENCY),how,risk,(lpl>0)?risk/lpl:0.0);
  }
double NP(double x){ int dg=(int)SymbolInfoInteger(g_sym,SYMBOL_DIGITS); return NormalizeDouble(x,dg); }
bool HasPosition(int j,ulong &tk)
  {
   int i; tk=0;
   for(i=PositionsTotal()-1;i>=0;i--){ ulong t=PositionGetTicket(i); if(!PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL)==g_sym && PositionGetInteger(POSITION_MAGIC)==SlvMagic(j)){ tk=t; return true; } }
   return false;
  }
bool HasPending(int j,ulong &tk)
  {
   int i; tk=0;
   for(i=OrdersTotal()-1;i>=0;i--){ ulong t=OrderGetTicket(i); if(!OrderSelect(t)) continue;
      if(OrderGetString(ORDER_SYMBOL)==g_sym && OrderGetInteger(ORDER_MAGIC)==SlvMagic(j)){ tk=t; return true; } }
   return false;
  }
string SetupGV(int j,long setup,int dir){ return GVP+SlvName(j)+"_u_"+IntegerToString(setup)+"_"+IntegerToString(dir); }
bool SetupUsed(int j,long setup,int dir){ return GlobalVariableCheck(SetupGV(j,setup,dir)); }
void MarkUsed(int j,long setup,int dir){ GlobalVariableSet(SetupGV(j,setup,dir),1); }
// comment format: DPA|<sleeve>|<setup>|<dir>
void MarkFilledFromHistory()
  {
   if(!HistorySelect(TimeCurrent()-5*86400,TimeCurrent()+60)) return;
   int n=HistoryDealsTotal(); int i;
   for(i=0;i<n;i++)
     {
      ulong tk=HistoryDealGetTicket(i);
      if(HistoryDealGetString(tk,DEAL_SYMBOL)!=g_sym) continue;
      long mg=HistoryDealGetInteger(tk,DEAL_MAGIC); int j=SlvFromMagic(mg); if(j<0) continue;
      if(HistoryDealGetInteger(tk,DEAL_ENTRY)!=DEAL_ENTRY_IN) continue;
      string cm=HistoryDealGetString(tk,DEAL_COMMENT);
      string parts[]; int k=StringSplit(cm,'|',parts);
      if(k<4) continue;
      long setup=StringToInteger(parts[2]); int dir=(int)StringToInteger(parts[3]);
      if(!SetupUsed(j,setup,dir)) MarkUsed(j,setup,dir);
     }
  }

void MarkUsedFromPosition(int j,ulong tk)
  {
   if(!PositionSelectByTicket(tk)) return;
   string parts[]; int k=StringSplit(PositionGetString(POSITION_COMMENT),'|',parts);
   if(k<4) return;
   long setup=StringToInteger(parts[2]); int dir=(int)StringToInteger(parts[3]);
   if(!SetupUsed(j,setup,dir)) MarkUsed(j,setup,dir);
  }
// spread filter, symbol-relative (see InpSpreadMode); atr = ATR(14) of the module timeframe at the signal bar
double MaxSpreadPrice(double atr)
  {
   if(InpSpreadMode==DPA_SPREAD_PRICE)  return InpMaxSpread;
   if(InpSpreadMode==DPA_SPREAD_POINTS) return InpMaxSpreadPts*SymbolInfoDouble(g_sym,SYMBOL_POINT);
   return InpMaxSpreadATR*atr;
  }
bool SpreadOK(double atr,string &txt)
  {
   double sp=SymbolInfoDouble(g_sym,SYMBOL_ASK)-SymbolInfoDouble(g_sym,SYMBOL_BID), mx=MaxSpreadPrice(atr);
   txt="spread "+DoubleToString(sp,g_digits)+" > max "+DoubleToString(mx,g_digits);
   return (sp<=mx);
  }

void ApplyOrder(int j,DPOrder &o,bool allowNew,DPSeries &s)
  {
   double atr=s.atr[s.n-1];
   ulong pt;
   bool hasPend=HasPending(j,pt);
   if(!o.valid || SetupUsed(j,o.setup,o.dir) || !allowNew)
     {
      if(o.valid && !allowNew && !SetupUsed(j,o.setup,o.dir)) Diag(21,SlvName(j)+" "+(g_lockWhy!=""?g_lockWhy:"max trades/day reached or prop max-DD lock"));
      if(hasPend) g_trade.OrderDelete(pt);
      return;
     }
   g_cnt[8]++; g_mCnt[g_cur*NCNT+8]++;
   long sk=o.setup*4+(o.dir+1);
   if(g_lastSig[g_cur*NSLV+j]!=sk){ g_lastSig[g_cur*NSLV+j]=sk; g_cnt[22]++; g_mCnt[g_cur*NCNT+22]++; }
   string gwhy; int gate=EntryGate(j,s,o,gwhy);
   if(gate>=0){ Diag(gate,SlvName(j)+" "+gwhy); if(hasPend) g_trade.OrderDelete(pt); return; }
   string cm=InpTradeComment+"|"+SlvName(j)+"|"+IntegerToString(o.setup)+"|"+IntegerToString(o.dir);
   double ask=SymbolInfoDouble(g_sym,SYMBOL_ASK), bid=SymbolInfoDouble(g_sym,SYMBOL_BID);
   double stopsLvl=SymbolInfoInteger(g_sym,SYMBOL_TRADE_STOPS_LEVEL)*SymbolInfoDouble(g_sym,SYMBOL_POINT);
   g_trade.SetExpertMagicNumber(SlvMagic(j));
   bool marketNow=(o.otype==DP_MARKET);
   // price already through a stop/limit level -> fill at market (same as the backtest simulator)
   if(o.otype==DP_STOP  && ((o.dir>0 && ask>=o.price-stopsLvl) || (o.dir<0 && bid<=o.price+stopsLvl))) marketNow=true;
   if(o.otype==DP_LIMIT && ((o.dir>0 && ask<=o.price+stopsLvl) || (o.dir<0 && bid>=o.price-stopsLvl))) marketNow=true;
   double entry=marketNow?((o.dir>0)?ask:bid):o.price;
   if((o.dir>0 && o.sl>=entry-stopsLvl) || (o.dir<0 && o.sl<=entry+stopsLvl))
     { Diag(3,SlvName(j)+" entry "+DoubleToString(entry,g_digits)+" SL "+DoubleToString(o.sl,g_digits)+" stops "+DoubleToString(stopsLvl,g_digits)); if(hasPend) g_trade.OrderDelete(pt); return; }
   double tp=(o.tp!=0)?NP(o.tp):0;
   if(tp!=0 && ((o.dir>0 && tp<=entry+stopsLvl) || (o.dir<0 && tp>=entry-stopsLvl)))
     { Diag(4,SlvName(j)+" entry "+DoubleToString(entry,g_digits)+" TP "+DoubleToString(tp,g_digits)+" stops "+DoubleToString(stopsLvl,g_digits)); if(hasPend) g_trade.OrderDelete(pt); return; }
   string why; double lots=LotsFor(o.dir,entry,o.sl,why);
   if(lots<=0){ Diag(1,SlvName(j)+" "+why); Notify(SlvName(j)+": lot size below minimum for "+DoubleToString(InpRiskPct,2)+"% risk - skipped"); MarkUsed(j,o.setup,o.dir); return; }
   lots=MarginFit(o.dir,lots,entry);
   if(lots<=0){ Notify(SlvName(j)+": not enough free margin - skipped"); MarkUsed(j,o.setup,o.dir); return; }
   string sptxt;
   if(marketNow)
     {
      if(hasPend) g_trade.OrderDelete(pt);
      if(!SpreadOK(atr,sptxt)){ Diag(2,SlvName(j)+" "+sptxt); Notify(SlvName(j)+": spread too wide, signal skipped"); return; }
      bool ok=(o.dir>0)?g_trade.Buy(lots,g_sym,0,NP(o.sl),tp,cm):g_trade.Sell(lots,g_sym,0,NP(o.sl),tp,cm);
      if(ok){ g_cnt[6]++; g_mCnt[g_cur*NCNT+6]++; MarkUsed(j,o.setup,o.dir); if(o.tpSlope!=0) GlobalVariableSet(GVP+"slope_"+SlvName(j),o.tpSlope);
              Notify(SlvName(j)+(o.dir>0?" BUY ":" SELL ")+DoubleToString(lots,2)+" SL "+DoubleToString(o.sl,g_digits)+" TP "+DoubleToString(tp,g_digits)); }
      else Diag(7,SlvName(j)+" market "+IntegerToString((int)g_trade.ResultRetcode())+" "+g_trade.ResultRetcodeDescription());
      return;
     }
   if(hasPend)
     {
      if(OrderSelect(pt))
        {
         double op=OrderGetDouble(ORDER_PRICE_OPEN), osl=OrderGetDouble(ORDER_SL), otp=OrderGetDouble(ORDER_TP);
         long otyp=OrderGetInteger(ORDER_TYPE);
         bool sameType=((o.otype==DP_STOP && (otyp==ORDER_TYPE_BUY_STOP||otyp==ORDER_TYPE_SELL_STOP)) || (o.otype==DP_LIMIT && (otyp==ORDER_TYPE_BUY_LIMIT||otyp==ORDER_TYPE_SELL_LIMIT)));
         string ocm=OrderGetString(ORDER_COMMENT);
         if(sameType && ocm==cm)
           {
            if(MathAbs(op-NP(o.price))>0 || MathAbs(osl-NP(o.sl))>0 || MathAbs(otp-tp)>0)
               g_trade.OrderModify(pt,NP(o.price),NP(o.sl),tp,ORDER_TIME_GTC,0);
            if(o.tpSlope!=0) GlobalVariableSet(GVP+"slope_"+SlvName(j),o.tpSlope);
            return;
           }
         g_trade.OrderDelete(pt);
        }
     }
   if(!SpreadOK(atr,sptxt)){ Diag(2,SlvName(j)+" pending: "+sptxt); return; }
   bool ok=false;
   if(o.otype==DP_STOP)  ok=(o.dir>0)?g_trade.BuyStop(lots,NP(o.price),g_sym,NP(o.sl),tp,ORDER_TIME_GTC,0,cm):g_trade.SellStop(lots,NP(o.price),g_sym,NP(o.sl),tp,ORDER_TIME_GTC,0,cm);
   if(o.otype==DP_LIMIT) ok=(o.dir>0)?g_trade.BuyLimit(lots,NP(o.price),g_sym,NP(o.sl),tp,ORDER_TIME_GTC,0,cm):g_trade.SellLimit(lots,NP(o.price),g_sym,NP(o.sl),tp,ORDER_TIME_GTC,0,cm);
   if(ok){ g_cnt[6]++; g_mCnt[g_cur*NCNT+6]++; if(o.tpSlope!=0) GlobalVariableSet(GVP+"slope_"+SlvName(j),o.tpSlope);
           Notify(SlvName(j)+(o.dir>0?" buy ":" sell ")+(o.otype==DP_STOP?"stop ":"limit ")+DoubleToString(o.price,g_digits)+" SL "+DoubleToString(o.sl,g_digits)); }
   else Diag(7,SlvName(j)+" pending "+IntegerToString((int)g_trade.ResultRetcode())+" "+g_trade.ResultRetcodeDescription());
  }

// manage an open position of sleeve j at the close of a sleeve bar
void ManagePosition(int j,DPSeries &s,ulong tk)
  {
   if(!PositionSelectByTicket(tk)) return;
   int n=s.n; if(n<3) return;
   int m=SlvModel(j);
   long ptype=PositionGetInteger(POSITION_TYPE);
   int dir=(ptype==POSITION_TYPE_BUY)?1:-1;
   double sl=PositionGetDouble(POSITION_SL), tp=PositionGetDouble(POSITION_TP);
   datetime opent=(datetime)PositionGetInteger(POSITION_TIME);
   double bid=SymbolInfoDouble(g_sym,SYMBOL_BID), ask=SymbolInfoDouble(g_sym,SYMBOL_ASK);
   double pt=SymbolInfoDouble(g_sym,SYMBOL_POINT);
   double minDist=MathMax((double)SymbolInfoInteger(g_sym,SYMBOL_TRADE_STOPS_LEVEL),(double)SymbolInfoInteger(g_sym,SYMBOL_TRADE_FREEZE_LEVEL))*pt;
   // B3 exit: H1 candle closed through the 200 EMA
   if(m==3 && InpB3_EmaExit)
     {
      if((dir>0 && s.c[n-1]<s.ema[n-1]) || (dir<0 && s.c[n-1]>s.ema[n-1]))
        { g_trade.PositionClose(tk); Notify("B3 exit: H1 close through 200 EMA"); return; }
     }
   bool trail=(m==2 && InpB2_Trail) || (m==1) || (m==4 && InpB4_Trail);
   double nsl=sl, ntp=tp;
   if(trail)
     {
      int pb; double lvl=DP_TrailLevel(s,n-1,dir,g_p.trail_k,g_p.trail_buf,pb);
      // only swings that formed after the entry bar
      if(pb>=0 && lvl!=0 && s.t[pb]>=(long)iTime(g_sym,SlvTF(j),iBarShift(g_sym,SlvTF(j),opent)))
        {
         if(dir>0 && lvl>nsl && lvl<bid-minDist) nsl=lvl;     // minDist = 0 on most brokers -> v1 behaviour
         if(dir<0 && lvl<nsl && lvl>ask+minDist) nsl=lvl;
        }
     }
   if(m==3 && InpB3_TpMode==1 && tp!=0 && GlobalVariableCheck(GVP+"slope_B3"))
      ntp=tp+GlobalVariableGet(GVP+"slope_B3");   // book trend-line TP moves one bar along the line
   if(NP(nsl)!=NP(sl) || NP(ntp)!=NP(tp)) g_trade.PositionModify(tk,NP(nsl),NP(ntp));
  }

//--- monthly trade-count diagnostics (never used to force trades) -----------
int MonthKey(datetime t){ MqlDateTime d; TimeToStruct(t,d); return d.year*100+d.mon; }
void MonthLine(int k,bool isPartial)
  {
   if(g_mKey[k]==0) return;
   g_months[k]++;
   if(InpTargetTradesMonth>0 && g_mFills[k]>=InpTargetTradesMonth) g_monthsHit[k]++;
   if(InpTargetTradesMonth>0 && InpDiagLog)
     {
      string t=StringFormat("[DamirPA][freq] %s %04d-%02d: fills %d (target %d)%s | unique setups %d, orders sent %d | blocked:",
                            g_syms[k],g_mKey[k]/100,g_mKey[k]%100,g_mFills[k],InpTargetTradesMonth,(g_mFills[k]>=InpTargetTradesMonth?" HIT":""),
                            g_mCnt[k*NCNT+22],g_mCnt[k*NCNT+6]);
      int c;
      for(c=9;c<=21;c++) if(g_mCnt[k*NCNT+c]>0) t+=" "+g_cntName[c]+"="+IntegerToString(g_mCnt[k*NCNT+c]);
      if(g_mCnt[k*NCNT+2]>0) t+=" spread="+IntegerToString(g_mCnt[k*NCNT+2]);
      if(g_mCnt[k*NCNT+1]>0) t+=" lot<min="+IntegerToString(g_mCnt[k*NCNT+1]);
      if(isPartial) t+=" (partial month)";
      Print(t);
     }
   int c2; for(c2=0;c2<NCNT;c2++) g_mCnt[k*NCNT+c2]=0;
   g_mFills[k]=0;
  }
void MonthRoll(int k)
  {
   int mk=MonthKey(TimeCurrent());
   if(g_mKey[k]==mk) return;
   if(g_mKey[k]!=0) MonthLine(k,false);
   g_mKey[k]=mk;
  }

//--- panel -------------------------------------------------------------
void PanelLine(int row,string txt,color col)
  {
   string nm="DPA_P"+IntegerToString(row);
   if(ObjectFind(0,nm)<0){ ObjectCreate(0,nm,OBJ_LABEL,0,0,0); ObjectSetInteger(0,nm,OBJPROP_CORNER,CORNER_LEFT_UPPER);
      ObjectSetInteger(0,nm,OBJPROP_XDISTANCE,10); ObjectSetInteger(0,nm,OBJPROP_YDISTANCE,20+row*16); ObjectSetInteger(0,nm,OBJPROP_FONTSIZE,9);
      ObjectSetString(0,nm,OBJPROP_FONT,"Consolas"); ObjectSetInteger(0,nm,OBJPROP_SELECTABLE,false); }
   ObjectSetString(0,nm,OBJPROP_TEXT,txt); ObjectSetInteger(0,nm,OBJPROP_COLOR,col);
  }
void DrawPanel()
  {
   if(!InpPanel) return;
   if(MQLInfoInteger(MQL_TESTER)!=0 && MQLInfoInteger(MQL_VISUAL_MODE)==0) return;   // no chart objects in a non-visual test
   double closed; int losses,entries; TodayStats(closed,losses,entries);
   double eq=AccountInfoDouble(ACCOUNT_EQUITY), fl=FloatingPnl();
   string mods="";
   if(SlvOn(SLV_B2H4)) mods+="B2-H4 ";
   if(SlvOn(SLV_B2H1)) mods+="B2-H1 ";
   if(SlvOn(SLV_B2M30)) mods+="B2-M30 ";
   if(InpUseB3) mods+="B3 ";
   if(InpUseB1) mods+="B1 ";
   if(InpUseB4) mods+="B4 ";
   if(InpConfluence) mods+="+CONF";
   string who=(InpTradeMode==DPA_MODE_BASKET)?("basket of "+IntegerToString(g_nsym)):_Symbol;
   PanelLine(0,"DamirPA EA v3.10  "+who+"  sleeves: "+mods+"  magic "+IntegerToString(InpMagic),clrWhite);
   PanelLine(1,"Risk/trade "+DoubleToString(InpRiskPct,2)+"%   trades today "+IntegerToString(entries)+"/"+IntegerToString(InpMaxTradesDay)+"   losses "+IntegerToString(losses)+"/"+IntegerToString(InpMaxLossesDay),clrSilver);
   PanelLine(2,"Today closed "+DoubleToString(closed,2)+"  floating "+DoubleToString(fl,2)+"  target "+DoubleToString(InpDailyTargetUSD,0)+(InpUseTargetLock?" (lock on)":" (lock off)"),clrSilver);
   double ddDay=(g_dayStartBal>0)?(eq-g_dayStartBal)/g_dayStartBal*100.0:0, ddMax=(g_initBal>0)?(eq-g_initBal)/g_initBal*100.0:0;
   PanelLine(3,"Day "+DoubleToString(ddDay,2)+"% (limit -"+DoubleToString(InpPropDailyDDPct,1)+"%)   vs initial "+DoubleToString(ddMax,2)+"% (limit -"+DoubleToString(InpPropMaxDDPct,1)+"%)",(ddDay<-1.0)?clrOrange:clrSilver);
   datetime until; bool cb=BasketPaused(until);
   string st=g_lockForever?"LOCKED (max DD) - reset GV to resume":(g_lockDay?"DONE FOR TODAY: "+g_lockWhy:(cb?"BASKET PAUSED until "+TimeToString(until):"ACTIVE"));
   if(InpTradeMode==DPA_MODE_CHART && !WLAllowed(_Symbol)) st="IDLE: "+_Symbol+" is not on the whitelist";
   PanelLine(4,"Status: "+st,(g_lockForever||g_lockDay||cb)?clrTomato:clrLime);
   string flt="Regime: ";
   if(InpRegTrendMode==DPA_REG_OFF) flt+="-"; else if(InpRegTrendMode==DPA_REG_ADX) flt+="ADX"; else flt+="ER";
   if(InpRegATRFilter) flt+=" ATR%";
   if(InpRegD1Slope) flt+=" D1slope";
   flt+="  Health: "; if(InpHealthN>0) flt+=IntegerToString(InpHealthN)+"tr"; else flt+="off";
   flt+="  News: "; if(InpNewsFilter) flt+=NewsSrcName(); else flt+="off";
   PanelLine(5,flt,clrSilver);
   PanelLine(6,"Last: "+g_lastMsg,clrGray);
   ChartRedraw(0);
  }

//--- per-symbol processing ---------------------------------------------------
void ProcessSymbol(int k,bool allow)
  {
   UseSym(k);
   MonthRoll(k);
   int q;
   for(q=0;q<NSLV;q++)
     {
      int j=g_order[q];
      if(!SlvOn(j)) continue;
      ENUM_TIMEFRAMES tf=SlvTF(j);
      datetime bt=iTime(g_sym,tf,0);
      int idx=k*NSLV+j;
      if(bt==0 || bt==g_lastBar[idx]) continue;        // closed-bar logic: act once per new bar
      ulong ptk;
      if(g_symAllowed[k]==0 && !HasPosition(j,ptk))   // not whitelisted: never look for entries, only manage what is open
        { g_lastBar[idx]=bt; ulong pd0; if(HasPending(j,pd0)) g_trade.OrderDelete(pd0); continue; }
      DPSeries s;
      if(!BuildSleeveSeries(j,s)) continue;            // history not ready: retry next tick (counted in diag)
      g_lastBar[idx]=bt;
      if(g_symSpec[k]==0 && g_h4.n>0) LogSpec(g_h4.atr[g_h4.n-1]);
      MarkFilledFromHistory();
      if(HasPosition(j,ptk)){ MarkUsedFromPosition(j,ptk); ManagePosition(j,s,ptk); ulong pd; if(HasPending(j,pd)) g_trade.OrderDelete(pd); continue; }
      if(g_symAllowed[k]==0) continue;
      HealthEvaluate(j);
      DPOrder o;
      bool got=false;
      DPParams p=g_sp[j];
      int m=SlvModel(j);
      if(m==2) got=B2_Order(s,s.n-1,p,o);
      if(m==3) got=B3_Order(s,s.n-1,p,o);
      if(m==1) got=B1_Order(s,s.n-1,p,o);
      if(m==4) got=B4_Order(s,s.n-1,p,o);
      if(!got) o.valid=0;
      ApplyOrder(j,o,allow,s);
     }
  }
void ProcessAll()
  {
   bool allow=GuardCheck();
   NewsManage();
   int k;
   for(k=0;k<g_nsym;k++)
     {
      if(g_symAllowed[k]==0) continue;                 // basket host symbol not on the whitelist: never traded
      ProcessSymbol(k,allow);
     }
   UseSym(0);
  }

//--- events --------------------------------------------------------------
int OnInit()
  {
   ParseWhitelist();
   g_nsym=0; ArrayResize(g_syms,0);
   g_cur=-1; g_sym="";
   g_magicBase=InpMagic;
   AddSym(_Symbol);                                   // index 0 = chart symbol (account keys live here, as in v2)
   if(InpTradeMode==DPA_MODE_BASKET)
     {
      if(g_nwl==0){ Print("[DamirPA] basket mode needs InpSymbolWhitelist"); return INIT_PARAMETERS_INCORRECT; }
      string sfx="";
      int i;
      for(i=0;i<g_nwl;i++) if(WLMatch(_Symbol,g_wl[i])){ sfx=StringSubstr(_Symbol,StringLen(g_wl[i])); break; }
      for(i=0;i<g_nwl;i++)
        {
         bool custom=false; string cand=g_wl[i]+sfx;
         if(!SymbolExist(cand,custom)){ cand=g_wl[i]; if(!SymbolExist(cand,custom)){ Print("[DamirPA] basket: symbol ",g_wl[i]," (",g_wl[i]+sfx,") not found at this broker - skipped"); continue; } }
         SymbolSelect(cand,true);
         AddSym(cand);
        }
      if(!WLAllowed(_Symbol)) Print("[DamirPA] basket: chart symbol ",_Symbol," is not on the whitelist - it hosts the EA but is not traded");
     }
   UseSym(0);
   g_acctGVP=g_symGVP[0];
   g_basketGVP="DPA_"+IntegerToString(InpMagic)+"_BASKET_";
   int c; for(c=0;c<NCNT;c++) g_cnt[c]=0;
   if(InpUseB2 && (InpB2_OnH1 || InpB2_OnM30) && !InpB2_H4Filter) Print("[DamirPA] note: B2 below H4 without the H4 trend filter is not the tested setup");
   if(InpUseB2 && InpB2_OnM30) Print("[DamirPA] note: B2 on M30 lost money in the 2020-23 test - frequency lever only, judge it on the 2024-26 split");
   FillParams();
   g_sessS=ParseHM(InpSessStart); g_sessE=ParseHM(InpSessEnd);
   if(InpRiskPct<=0 || InpRiskPct>5){ Print("Risk % must be in (0,5]"); return INIT_PARAMETERS_INCORRECT; }
   g_trade.SetDeviationInPoints(InpSlippagePts);
   g_trade.SetTypeFillingBySymbol(g_sym);
   if(InpInitialBalance>0) g_initBal=InpInitialBalance;
   else if(GlobalVariableCheck(g_acctGVP+"initbal")) g_initBal=GlobalVariableGet(g_acctGVP+"initbal");
   else { g_initBal=AccountInfoDouble(ACCOUNT_BALANCE); GlobalVariableSet(g_acctGVP+"initbal",g_initBal); }
   if(GlobalVariableCheck(g_acctGVP+"daykey") && (int)GlobalVariableGet(g_acctGVP+"daykey")==DayKey())
     { g_dayKey=DayKey(); g_dayStartBal=GlobalVariableGet(g_acctGVP+"daybal"); }
   g_lockForever=GlobalVariableCheck(g_acctGVP+"lockforever");
   int k; for(k=0;k<g_nsym;k++) GlobalVariablesDeleteAll(g_symGVP[k]+"B",TimeCurrent()-90*86400);   // tidy old setup ids
   NewsInit();
   EventSetTimer(5);
   string syms=""; for(k=0;k<g_nsym;k++) syms+=g_syms[k]+(g_symAllowed[k]!=0?"":"(not whitelisted)")+" ";
   string slv=""; int j; for(j=0;j<NSLV;j++) if(SlvOn(j)) slv+=SlvName(j)+"="+IntegerToString(SlvMagic(j))+" ";
   Notify("v3.10 started, symbols: "+syms+"| sleeves: "+slv+"| init balance "+DoubleToString(g_initBal,2));
   if(InpTradeMode==DPA_MODE_CHART && !WLAllowed(_Symbol))
      Print("[DamirPA] ",_Symbol," is NOT in InpSymbolWhitelist (",InpSymbolWhitelist,") - this instance will not open trades. It still manages any open DamirPA positions on this symbol.");
   DrawPanel();
   return INIT_SUCCEEDED;
  }
void OnDeinit(const int reason)
  {
   EventKillTimer(); ObjectsDeleteAll(0,"DPA_P");
   int k;
   for(k=0;k<g_nsym;k++) MonthLine(k,true);
   if(InpDiagLog)
     {
      string t="[DamirPA] summary:"; int c;
      for(c=0;c<NCNT;c++) t+=" "+g_cntName[c]+"="+IntegerToString(g_cnt[c])+";";
      Print(t);
      for(k=0;k<g_nsym;k++)
        {
         double pm=(g_months[k]>0)?(double)g_totFills[k]/g_months[k]:0;
         PrintFormat("[DamirPA][freq] %s total fills %d over %d months = %.2f/month%s",g_syms[k],g_totFills[k],g_months[k],pm,
                     (InpTargetTradesMonth>0)?StringFormat("; months at/above target %d: %d of %d",InpTargetTradesMonth,g_monthsHit[k],g_months[k]):"");
        }
     }
  }
void OnTimer()
  {
   if(InpTradeMode==DPA_MODE_BASKET){ ProcessAll(); DrawPanel(); return; }
   GuardCheck(); NewsManage(); DrawPanel();
  }

void OnTick()
  {
   if(InpTradeMode==DPA_MODE_BASKET){ ProcessAll(); DrawPanel(); return; }
   bool allow=GuardCheck();
   NewsManage();
   ProcessSymbol(0,allow);
   DrawPanel();
  }

// count fills per symbol for the monthly diagnostics
void OnTradeTransaction(const MqlTradeTransaction &trans,const MqlTradeRequest &request,const MqlTradeResult &result)
  {
   if(trans.type!=TRADE_TRANSACTION_DEAL_ADD) return;
   if(!HistoryDealSelect(trans.deal)) return;
   if(HistoryDealGetInteger(trans.deal,DEAL_ENTRY)!=DEAL_ENTRY_IN) return;
   if(!OurMagic(HistoryDealGetInteger(trans.deal,DEAL_MAGIC))) return;
   int k=SymIndex(HistoryDealGetString(trans.deal,DEAL_SYMBOL));
   if(k<0) return;
   int mk=MonthKey((datetime)HistoryDealGetInteger(trans.deal,DEAL_TIME));
   if(g_mKey[k]!=mk){ if(g_mKey[k]!=0) MonthLine(k,false); g_mKey[k]=mk; }
   g_mFills[k]++; g_totFills[k]++;
  }
