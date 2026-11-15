//+------------------------------------------------------------------+
//| DamirPA_Core.mqh - closed-bar signal logic shared by the EA and   |
//| the Python/C++ backtest harness (same source, compiled twice).    |
//| All arrays are oldest-first (index 0 = oldest, n-1 = last CLOSED).|
//| Every function is stateless: "given bars 0..i, what order should  |
//| exist after bar i closes?"  See STRATEGY_SPEC.md for book refs.   |
//+------------------------------------------------------------------+
#ifndef DAMIRPA_CORE_MQH
#define DAMIRPA_CORE_MQH

#define DP_MARKET 0
#define DP_STOP   1
#define DP_LIMIT  2

struct DPSeries
  {
   int    n;
   long   t[];      // bar open time (seconds)
   double o[];
   double h[];
   double l[];
   double c[];
   int    sess[];   // 1 = bar opened inside the entry session
   double atr[];    // SMA(14) true range
   double ema[];    // EMA(200) of close
   double ctxA[];   // aligned higher-TF context A (module specific)
   double ctxB[];   // aligned higher-TF context B (D1 200EMA side, for confluence)
   double ctxC[];   // aligned higher-TF context C (H4 impulse bias, for confluence)
   double ctxD[];   // aligned higher-TF context D (H4 200EMA trend with B2 slope rule; B2 on H1/M30/M15)
  };

struct DPParams
  {
   // --- Module B2: "50 Pips a Day" (H4, 200EMA trend + horizontal S/R retest + big candle)
   int    b2_k;          // pivot strength (bars each side) for significant swings
   int    b2_lb;         // pivot look-back (bars)
   int    b2_slopeBars;  // EMA slope measured over N bars
   double b2_slope;      // minimum EMA slope, in ATR units over b2_slopeBars
   int    b2_maxSince;   // break must be within N bars
   double b2_tol;        // retest proximity tolerance (ATR)
   int    b2_minRet;     // retest must last >= N bars ("bigger than two 4h candles")
   double b2_body;       // signal candle body >= x * range
   double b2_closeZone;  // close within x * range of the extreme
   int    b2_bigN;       // signal candle range > each of previous N candles
   double b2_buf;        // SL buffer beyond retest extreme (ATR)
   double b2_tpR;        // TP as R multiple (0 = none, trail only)
   int    b2_d1;         // 1 = also require D1 200EMA side (book 2 "4h and daily trend")
   int    b2_h4;         // 1 = also require the H4 200EMA trend (ctxD) - used when B2 runs below H4
   // --- Module B3: "S&R Zones" (H1 entries, 4h+1h 200EMA, break + retest stop order)
   int    b3_k;
   int    b3_lb;
   double b3_prom;       // pivot prominence (ATR)
   int    b3_slopeBars;
   int    b3_nc;         // no H1 close on the wrong side of the EMA in last N bars ("completely above")
   double b3_big;        // breakout candle range >= x * ATR
   double b3_tol;        // retest proximity (ATR)
   double b3_fail;       // cancel if close back through level by x ATR
   int    b3_maxWait;    // bars from breakout until order expires
   double b3_buf;
   int    b3_tpMode;     // 0 none, 1 book trend-line through current+previous level, 2 fixed R
   double b3_tpR;
   int    b3_emaExit;    // 1 = exit when an H1 candle closes through the 200 EMA (book exit fallback)
   int    b3_sess;       // 1 = breakout candle must open in session (book: European session)
   // --- Module B1: "Price Patterns" (M30 continuation pattern break, H4 last-impulse bias)
   int    b1_k4;         // H4 swing strength for impulse bias
   int    b1_lmin;
   int    b1_lmax;
   int    b1_impLB;
   double b1_impK;       // impulse size >= x * ATR(M30)
   double b1_fibMin;     // correction must retrace >= x of impulse (0 = off)
   double b1_tol;        // retest tolerance (ATR)
   int    b1_wait;       // bars to wait for retest trigger
   double b1_buf;
   double b1_tpR;        // 0 = trail only (book), else fixed R
   // --- Module B4: "Price Action Breakdown" value area (M15, time-at-price profile)
   int    b4_win;        // profile window in M15 bars (e.g. 480 = 30 H4 bars)
   int    b4_bins;
   double b4_va;         // value area fraction (0.70)
   double b4_trendFrac;  // control-price shift that defines trend, fraction of VA width
   int    b4_sv;         // small value (rejection) look-back bars
   int    b4_iw;         // bars allowed for the initiative break of the small value
   int    b4_rw;         // bars allowed for the retest fill
   double b4_buf;
   double b4_rrMin;      // minimum reward:risk
   double b4_zone;       // "just above the control" allowance, fraction of VA width
   // --- common
   int    trail_k;       // fractal strength used for swing trailing
   double trail_buf;     // ATR buffer below/above the swing
   int    conf;          // 1 = confluence filter: D1 200EMA side AND H4 impulse bias must agree
  };

struct DPOrder
  {
   int    valid;
   int    dir;      // +1 buy, -1 sell
   int    otype;    // DP_MARKET / DP_STOP / DP_LIMIT
   double price;    // entry (market: reference close)
   double sl;
   double tp;       // 0 = none
   double tpSlope;  // per bar of the module TF (book trend-line TP); 0 = fixed
   int    tpRef;    // bar index at which tp applies
   long   setup;    // setup id (time of the defining bar) - one fill per setup
   int    sigBar;   // bar index that created the order
  };

void DP_Clear(DPOrder &o){ o.valid=0;o.dir=0;o.otype=0;o.price=0;o.sl=0;o.tp=0;o.tpSlope=0;o.tpRef=0;o.setup=0;o.sigBar=-1; }

void DP_DefaultParams(DPParams &p)
  {
   p.b2_k=5; p.b2_lb=150; p.b2_slopeBars=10; p.b2_slope=0.25; p.b2_maxSince=30; p.b2_tol=0.30; p.b2_minRet=3;
   p.b2_body=0.50; p.b2_closeZone=0.25; p.b2_bigN=3; p.b2_buf=0.10; p.b2_tpR=2.0; p.b2_d1=1; p.b2_h4=0;
   p.b3_k=5; p.b3_lb=150; p.b3_prom=1.0; p.b3_slopeBars=10; p.b3_nc=30; p.b3_big=1.0; p.b3_tol=0.50; p.b3_fail=0.50;
   p.b3_maxWait=24; p.b3_buf=0.10; p.b3_tpMode=1; p.b3_tpR=2.0; p.b3_emaExit=1; p.b3_sess=0;
   p.b1_k4=3; p.b1_lmin=6; p.b1_lmax=40; p.b1_impLB=20; p.b1_impK=3.0; p.b1_fibMin=0.382; p.b1_tol=0.30; p.b1_wait=8;
   p.b1_buf=0.10; p.b1_tpR=0.0;
   p.b4_win=480; p.b4_bins=60; p.b4_va=0.70; p.b4_trendFrac=0.25; p.b4_sv=6; p.b4_iw=8; p.b4_rw=8; p.b4_buf=0.10;
   p.b4_rrMin=1.0; p.b4_zone=0.10;
   p.trail_k=2; p.trail_buf=0.10; p.conf=0;
  }

//--- indicators (computed inside the window so EA and harness match)
void DP_CalcATR(DPSeries &s,int period)
  {
   ArrayResize(s.atr,s.n);
   double sum=0.0;
   int i;
   for(i=0;i<s.n;i++)
     {
      double tr=s.h[i]-s.l[i];
      if(i>0) tr=MathMax(s.h[i],s.c[i-1])-MathMin(s.l[i],s.c[i-1]);
      sum+=tr;
      if(i>=period)
        {
         double tr0=s.h[i-period]-s.l[i-period];
         if(i-period>0) tr0=MathMax(s.h[i-period],s.c[i-period-1])-MathMin(s.l[i-period],s.c[i-period-1]);
         sum-=tr0;
         s.atr[i]=sum/period;
        }
      else s.atr[i]=sum/(i+1);
     }
  }

void DP_CalcEMA(DPSeries &s,int period)
  {
   ArrayResize(s.ema,s.n);
   if(s.n<=0) return;
   double a=2.0/(period+1.0);
   s.ema[0]=s.c[0];
   int i;
   for(i=1;i<s.n;i++) s.ema[i]=s.ema[i-1]+a*(s.c[i]-s.ema[i-1]);
  }

bool DP_PivHigh(DPSeries &s,int j,int k)
  {
   if(j-k<0 || j+k>=s.n) return false;
   int m;
   for(m=1;m<=k;m++){ if(!(s.h[j]>s.h[j-m])) return false; if(!(s.h[j]>=s.h[j+m])) return false; }
   return true;
  }
bool DP_PivLow(DPSeries &s,int j,int k)
  {
   if(j-k<0 || j+k>=s.n) return false;
   int m;
   for(m=1;m<=k;m++){ if(!(s.l[j]<s.l[j-m])) return false; if(!(s.l[j]<=s.l[j+m])) return false; }
   return true;
  }
double DP_MaxH(DPSeries &s,int a,int b){ double x=-1e300; int i; if(a<0)a=0; for(i=a;i<=b;i++) if(s.h[i]>x) x=s.h[i]; return x; }
double DP_MinL(DPSeries &s,int a,int b){ double x=1e300; int i; if(a<0)a=0; for(i=a;i<=b;i++) if(s.l[i]<x) x=s.l[i]; return x; }

//--- higher-TF contexts --------------------------------------------------
// trend by 200 EMA side + slope: +1 / -1 / 0   (books 2 & 3)
double DP_EmaTrendAt(DPSeries &s,int i,int slopeBars,double slopeMin,bool needSlope)
  {
   if(i<slopeBars) return 0;
   double sl=(s.ema[i]-s.ema[i-slopeBars]);
   double thr=slopeMin*s.atr[i];
   if(s.c[i]>s.ema[i] && (!needSlope || sl>thr)) return 1;
   if(s.c[i]<s.ema[i] && (!needSlope || sl<-thr)) return -1;
   return 0;
  }
// direction of the most recent impulsive move (book 1 "Buy or Sell?"):
// bias flips when a close breaks the latest confirmed swing that started the last impulse.
double DP_ImpulseBiasAt(DPSeries &s,int i,int k,int maxBack)
  {
   int kk;
   int stop=i-maxBack; if(stop<k+1) stop=k+1;
   for(kk=i;kk>=stop;kk--)
     {
      // latest confirmed pivots as of bar kk-1
      double ph=0, pl=0; bool fh=false, fl=false; int j;
      for(j=kk-1-k;j>=0 && j>=kk-1-k-200;j--){ if(DP_PivHigh(s,j,k)){ ph=s.h[j]; fh=true; break; } }
      for(j=kk-1-k;j>=0 && j>=kk-1-k-200;j--){ if(DP_PivLow(s,j,k)){ pl=s.l[j]; fl=true; break; } }
      bool up=(fh && s.c[kk]>ph);
      bool dn=(fl && s.c[kk]<pl);
      if(up && !dn) return 1;
      if(dn && !up) return -1;
     }
   return 0;
  }
// map: for each low-TF bar i, index of last higher-TF bar CLOSED at or before low-TF bar close
void DP_Align(DPSeries &lo,int loSec,DPSeries &hi,int hiSec,double &hv[],double &out[])
  {
   ArrayResize(out,lo.n);
   int j=-1; int i;
   for(i=0;i<lo.n;i++)
     {
      long tc=lo.t[i]+loSec;
      while(j+1<hi.n && hi.t[j+1]+hiSec<=tc) j++;
      out[i]=(j>=0)?hv[j]:0;
     }
  }

bool DP_ConfOK(DPSeries &s,int i,int dir,DPParams &p)
  {
   if(p.conf==0) return true;
   return (s.ctxB[i]==dir && s.ctxC[i]==dir);
  }

//==========================================================================
// Module B2 - 50 Pips a Day (H4).  ctxA = D1 200EMA side (+1/-1/0)
//==========================================================================
// raw signal test for a given pivot j at bar i; returns SL via ref
bool B2_SignalFor(DPSeries &s,int i,int j,int dir,DPParams &p,double &sl,int &rsOut)
  {
   double P=(dir>0)?s.h[j]:s.l[j];
   int b=-1,x;
   for(x=j+p.b2_k+1;x<i;x++){ if((dir>0 && s.c[x]>P) || (dir<0 && s.c[x]<P)){ b=x; break; } }
   if(b<0 || b<i-p.b2_maxSince) return false;
   // retest start = latest extreme after the break
   int rs=b; double ext=(dir>0)?s.h[b]:s.l[b];
   for(x=b;x<=i-1;x++){ if(dir>0){ if(s.h[x]>=ext){ext=s.h[x];rs=x;} } else { if(s.l[x]<=ext){ext=s.l[x];rs=x;} } }
   if(i-1-rs<p.b2_minRet) return false;
   double a=s.atr[i];
   // retest must come back to (or near) the broken level and the level must hold
   double near=(dir>0)?DP_MinL(s,rs+1,i):DP_MaxH(s,rs+1,i);
   if(dir>0 && near>P+p.b2_tol*a) return false;
   if(dir<0 && near<P-p.b2_tol*a) return false;
   for(x=b+1;x<=i;x++){ if(dir>0 && s.c[x]<P-p.b2_tol*a) return false; if(dir<0 && s.c[x]>P+p.b2_tol*a) return false; }
   if(dir>0 && s.c[i]<=P) return false;
   if(dir<0 && s.c[i]>=P) return false;
   // signal candle: big body, closes at/near the extreme, bigger than preceding candles
   double rg=s.h[i]-s.l[i]; if(rg<=0) return false;
   if(dir>0){ if(!(s.c[i]>s.o[i])) return false; if(s.c[i]-s.o[i]<p.b2_body*rg) return false; if(s.h[i]-s.c[i]>p.b2_closeZone*rg) return false; }
   else     { if(!(s.c[i]<s.o[i])) return false; if(s.o[i]-s.c[i]<p.b2_body*rg) return false; if(s.c[i]-s.l[i]>p.b2_closeZone*rg) return false; }
   for(x=1;x<=p.b2_bigN;x++){ if(i-x<0) return false; if(s.h[i-x]-s.l[i-x]>=rg) return false; }
   sl=(dir>0)?(near-p.b2_buf*a):(near+p.b2_buf*a);
   rsOut=rs;
   return true;
  }

bool B2_TrendOK(DPSeries &s,int i,int dir,DPParams &p)
  {
   if(DP_EmaTrendAt(s,i,p.b2_slopeBars,p.b2_slope,true)!=dir) return false;
   if(p.b2_d1==1 && s.ctxA[i]!=dir) return false;
   if(p.b2_h4==1 && s.ctxD[i]!=dir) return false;
   return true;
  }

bool B2_Order(DPSeries &s,int i,DPParams &p,DPOrder &o)
  {
   DP_Clear(o);
   if(i<p.b2_k*2+5) return false;
   int dir;
   for(dir=1;dir>=-1;dir-=2)
     {
      if(!B2_TrendOK(s,i,dir,p)) continue;
      if(!DP_ConfOK(s,i,dir,p)) continue;
      // most recent broken pivot (support for buys = old resistance pivot HIGH that got broken)
      int j;
      for(j=i-p.b2_k-1;j>=i-p.b2_lb && j>=p.b2_k;j--)
        {
         bool piv=(dir>0)?DP_PivHigh(s,j,p.b2_k):DP_PivLow(s,j,p.b2_k);
         if(!piv) continue;
         double P=(dir>0)?s.h[j]:s.l[j];
         int x; bool broken=false;
         for(x=j+p.b2_k+1;x<i;x++){ if((dir>0 && s.c[x]>P)||(dir<0 && s.c[x]<P)){ broken=true; break; } }
         if(!broken) continue;          // unbroken levels are not tradeable here; keep looking older
         double sl=0; int rs=0;
         if(!B2_SignalFor(s,i,j,dir,p,sl,rs)) break;   // evaluate only the most recent broken level
         // one signal per level: no earlier bar fired for the same pivot
         bool dup=false; int y;
         for(y=rs+1;y<i;y++){ double s2; int r2; if(B2_TrendOK(s,y,dir,p) && DP_ConfOK(s,y,dir,p) && B2_SignalFor(s,y,j,dir,p,s2,r2)){ dup=true; break; } }
         if(dup) break;
         double risk=(dir>0)?(s.c[i]-sl):(sl-s.c[i]);
         if(risk<=0) break;
         o.valid=1; o.dir=dir; o.otype=DP_MARKET; o.price=s.c[i]; o.sl=sl;
         o.tp=(p.b2_tpR>0)?(s.c[i]+dir*p.b2_tpR*risk):0; o.tpSlope=0; o.tpRef=i;
         o.setup=s.t[j]; o.sigBar=i;
         return true;
        }
     }
   return false;
  }

//==========================================================================
// Module B3 - Day Trading with S&R Zones (H1).  ctxA = H4 200EMA trend (+1/-1/0)
//==========================================================================
bool B3_BreakAt(DPSeries &s,int b,int dir,DPParams &p,int &jOut,int &jPrev)
  {
   if(b<p.b3_nc+p.b3_k+2) return false;
   if(s.ctxA[b]!=dir) return false;
   if(DP_EmaTrendAt(s,b,p.b3_slopeBars,0.0,true)!=dir) return false;
   int x;
   for(x=b-p.b3_nc+1;x<=b;x++){ if(dir>0 && s.c[x]<s.ema[x]) return false; if(dir<0 && s.c[x]>s.ema[x]) return false; }
   if(p.b3_sess==1 && s.sess[b]==0) return false;
   if(!DP_ConfOK(s,b,dir,p)) return false;
   // most recent significant pivot (same "degree": prominence filter)
   int j; int found=-1;
   for(j=b-p.b3_k-1;j>=b-p.b3_lb && j>=p.b3_k;j--)
     {
      bool piv=(dir>0)?DP_PivHigh(s,j,p.b3_k):DP_PivLow(s,j,p.b3_k);
      if(!piv) continue;
      double prom=(dir>0)?(s.h[j]-DP_MinL(s,j-p.b3_k,j+p.b3_k)):(DP_MaxH(s,j-p.b3_k,j+p.b3_k)-s.l[j]);
      if(prom<p.b3_prom*s.atr[j]) continue;
      found=j; break;
     }
   if(found<0) return false;
   double P=(dir>0)?s.h[found]:s.l[found];
   for(x=found+p.b3_k+1;x<b;x++){ if(dir>0 && s.c[x]>P) return false; if(dir<0 && s.c[x]<P) return false; }
   // breakout candle: closes beyond with more than half its body, and is big
   double rg=s.h[b]-s.l[b];
   if(rg<p.b3_big*s.atr[b]) return false;
   if(dir>0){ if(!(s.c[b]>P && s.c[b]>s.o[b])) return false; if(s.c[b]-MathMax(s.o[b],P)<0.5*(s.c[b]-s.o[b])) return false; }
   else     { if(!(s.c[b]<P && s.c[b]<s.o[b])) return false; if(MathMin(s.o[b],P)-s.c[b]<0.5*(s.o[b]-s.c[b])) return false; }
   // previous significant pivot of the same side (for the book's trend-line take profit)
   int jp=-1;
   for(j=found-1;j>=found-p.b3_lb && j>=p.b3_k;j--)
     {
      bool piv=(dir>0)?DP_PivHigh(s,j,p.b3_k):DP_PivLow(s,j,p.b3_k);
      if(!piv) continue;
      double prom=(dir>0)?(s.h[j]-DP_MinL(s,j-p.b3_k,j+p.b3_k)):(DP_MaxH(s,j-p.b3_k,j+p.b3_k)-s.l[j]);
      if(prom<p.b3_prom*s.atr[j]) continue;
      jp=j; break;
     }
   jOut=found; jPrev=jp;
   return true;
  }

bool B3_Order(DPSeries &s,int i,DPParams &p,DPOrder &o)
  {
   DP_Clear(o);
   int b;
   for(b=i;b>=i-p.b3_maxWait && b>0;b--)
     {
      int dir;
      for(dir=1;dir>=-1;dir-=2)
        {
         int j=-1,jp=-1;
         if(!B3_BreakAt(s,b,dir,p,j,jp)) continue;
         // this is the latest breakout -> evaluate its retest state at bar i
         double P=(dir>0)?s.h[j]:s.l[j];
         double a=s.atr[b];
         double ext=(dir>0)?s.h[b]:s.l[b];
         int tk=-1,x;
         for(x=b+1;x<=i;x++)
           {
            if(tk<0)
              {
               if(dir>0){ ext=MathMax(ext,s.h[x]); if(s.l[x]<=P+p.b3_tol*a) tk=x; }
               else     { ext=MathMin(ext,s.l[x]); if(s.h[x]>=P-p.b3_tol*a) tk=x; }
              }
            else
              {
               if(dir>0 && s.h[x]>=ext) return false;   // stop already triggered -> setup done
               if(dir<0 && s.l[x]<=ext) return false;
              }
            if(dir>0 && s.c[x]<P-p.b3_fail*a) return false;   // level failed
            if(dir<0 && s.c[x]>P+p.b3_fail*a) return false;
           }
         if(tk<0) return false;                 // no retest yet
         if(i-b>=p.b3_maxWait) return false;    // expired
         double rl=(dir>0)?DP_MinL(s,tk,i):DP_MaxH(s,tk,i);
         double sl=(dir>0)?(rl-p.b3_buf*a):(rl+p.b3_buf*a);
         double risk=(dir>0)?(ext-sl):(sl-ext);
         if(risk<=0) return false;
         o.valid=1; o.dir=dir; o.otype=DP_STOP; o.price=ext; o.sl=sl; o.setup=s.t[b]; o.sigBar=i;
         o.tp=0; o.tpSlope=0; o.tpRef=i+1;
         if(p.b3_tpMode==1)
           {
            if(jp<0) return false;
            double Pp=(dir>0)?s.h[jp]:s.l[jp];
            double slope=(P-Pp)/(double)(j-jp);
            if(dir*slope<=0) return false;        // line must point in the trade direction
            double tpNow=P+slope*(i+1-j);
            if(dir*(tpNow-ext)<=0) { DP_Clear(o); return false; }   // TP before entry = no trade
            o.tp=tpNow; o.tpSlope=slope; o.tpRef=i+1;
           }
         else if(p.b3_tpMode==2) o.tp=ext+dir*p.b3_tpR*risk;
         return true;
        }
     }
   return false;
  }

//==========================================================================
// Module B1 - Day Trading with Price Patterns (M30).  ctxA = H4 impulse bias
//==========================================================================
// detect a continuation-pattern breakout at bar b. returns pattern line values.
bool B1_PatternBreak(DPSeries &s,int b,int dir,DPParams &p,int &aOut,double &uA,double &uSlope,int &lastPivOpp)
  {
   if(b<p.b1_lmax+p.b1_impLB+5) return false;
   if(s.ctxA[b]!=dir) return false;
   if(!DP_ConfOK(s,b,dir,p)) return false;
   int a=-1,x; double ext=(dir>0)?-1e300:1e300;
   for(x=b-p.b1_lmax;x<=b-1;x++){ if(dir>0){ if(s.h[x]>=ext){ext=s.h[x];a=x;} } else { if(s.l[x]<=ext){ext=s.l[x];a=x;} } }
   if(a<0 || b-a<p.b1_lmin) return false;
   double imp=(dir>0)?(s.h[a]-DP_MinL(s,a-p.b1_impLB,a)):(DP_MaxH(s,a-p.b1_impLB,a)-s.l[a]);
   if(imp<p.b1_impK*s.atr[a]) return false;
   double cor=(dir>0)?(s.h[a]-DP_MinL(s,a+1,b-1)):(DP_MaxH(s,a+1,b-1)-s.l[a]);
   if(p.b1_fibMin>0 && cor<p.b1_fibMin*imp) return false;
   if(cor>imp) return false;
   // pivots (strength 2) confirmed by bar b-1
   int k=2; int lastSame=-1, firstOpp=-1, lastOpp=-1;
   for(x=a+1;x<=b-1-k;x++)
     {
      bool ps=(dir>0)?DP_PivHigh(s,x,k):DP_PivLow(s,x,k);
      bool po=(dir>0)?DP_PivLow(s,x,k):DP_PivHigh(s,x,k);
      if(ps) lastSame=x;
      if(po){ if(firstOpp<0) firstOpp=x; lastOpp=x; }
     }
   if(lastSame<0 || firstOpp<0 || lastOpp==firstOpp) return false;   // >=2 highs and >=2 lows
   double y0=(dir>0)?s.h[a]:s.l[a], y1=(dir>0)?s.h[lastSame]:s.l[lastSame];
   double us=(y1-y0)/(double)(lastSame-a);              // breakout-side line
   double z0=(dir>0)?s.l[firstOpp]:s.h[firstOpp], z1=(dir>0)?s.l[lastOpp]:s.h[lastOpp];
   double ls=(z1-z0)/(double)(lastOpp-firstOpp);        // other line
   double tol=0.1*s.atr[b];
   for(x=a+1;x<=b-1;x++)
     {
      double U=y0+us*(x-a), L=z0+ls*(x-firstOpp);
      if(dir>0){ if(s.c[x]>U) return false; if(s.c[x]<L-tol) return false; }
      else     { if(s.c[x]<U) return false; if(s.c[x]>L+tol) return false; }
     }
   double Ub=y0+us*(b-a), Lb=z0+ls*(b-firstOpp);
   if(dir>0 && Ub<=Lb) return false;
   if(dir<0 && Ub>=Lb) return false;
   if(dir>0){ if(!(s.c[b]>Ub && s.c[b]>s.o[b])) return false; if(s.c[b]-MathMax(s.o[b],Ub)<0.5*(s.c[b]-s.o[b])) return false; }
   else     { if(!(s.c[b]<Ub && s.c[b]<s.o[b])) return false; if(MathMin(s.o[b],Ub)-s.c[b]<0.5*(s.o[b]-s.c[b])) return false; }
   aOut=a; uA=y0; uSlope=us; lastPivOpp=lastOpp;
   return true;
  }

bool B1_Order(DPSeries &s,int i,DPParams &p,DPOrder &o)
  {
   DP_Clear(o);
   int b;
   for(b=i-1;b>=i-1-p.b1_wait && b>0;b--)
     {
      int dir;
      for(dir=1;dir>=-1;dir-=2)
        {
         int a=0,lo=0; double uA=0,us=0;
         if(!B1_PatternBreak(s,b,dir,p,a,uA,us,lo)) continue;
         int f=b+1; double a1=s.atr[b];
         double U1=uA+us*(f-a);
         bool retest=(dir>0)?(s.l[f]<=U1+p.b1_tol*a1):(s.h[f]>=U1-p.b1_tol*a1);
         if(!retest)
           {
            // no retest after the first candle: enter at the close of the 2nd candle if its body is fully outside
            if(i!=f) return false;
            bool outside=(dir>0)?(MathMin(s.o[f],s.c[f])>U1):(MathMax(s.o[f],s.c[f])<U1);
            if(!outside) return false;
            double sl=(dir>0)?(s.l[lo]-p.b1_buf*a1):(s.h[lo]+p.b1_buf*a1);
            double risk=(dir>0)?(s.c[i]-sl):(sl-s.c[i]);
            if(risk<=0) return false;
            o.valid=1;o.dir=dir;o.otype=DP_MARKET;o.price=s.c[i];o.sl=sl;
            o.tp=(p.b1_tpR>0)?(s.c[i]+dir*p.b1_tpR*risk):0; o.tpRef=i; o.setup=s.t[b]; o.sigBar=i;
            return true;
           }
         // retest path: stop order at the extreme where the retest began, SL at the retest extreme
         double ext=(dir>0)?MathMax(s.h[b],s.h[f]):MathMin(s.l[b],s.l[f]);
         int x;
         for(x=f+1;x<=i;x++)
           {
            if(dir>0 && s.h[x]>=ext) return false;   // triggered already
            if(dir<0 && s.l[x]<=ext) return false;
            double Lx=uA+us*(x-a);
            if(dir>0 && s.c[x]<Lx-(ext-Lx)) return false;   // fell back deep into the pattern
            if(dir<0 && s.c[x]>Lx+(Lx-ext)) return false;
           }
         if(i-b>p.b1_wait) return false;
         double rl=(dir>0)?DP_MinL(s,f,i):DP_MaxH(s,f,i);
         double sl=(dir>0)?(rl-p.b1_buf*a1):(rl+p.b1_buf*a1);
         double risk=(dir>0)?(ext-sl):(sl-ext);
         if(risk<=0) return false;
         o.valid=1;o.dir=dir;o.otype=DP_STOP;o.price=ext;o.sl=sl;
         o.tp=(p.b1_tpR>0)?(ext+dir*p.b1_tpR*risk):0; o.tpRef=i+1; o.setup=s.t[b]; o.sigBar=i;
         return true;
        }
     }
   return false;
  }

//==========================================================================
// Module B4 - Price Action Breakdown: value area / control / excess / rejection (M15)
//==========================================================================
// time-at-price profile of bars [i-win+1, i]  -> control (POC), value high, value low
bool B4_Profile(DPSeries &s,int i,DPParams &p,double &poc,double &vah,double &val)
  {
   int a=i-p.b4_win+1; if(a<0) return false;
   double lo=DP_MinL(s,a,i), hi=DP_MaxH(s,a,i);
   if(hi<=lo) return false;
   int B=p.b4_bins; if(B>200) B=200;
   double w=(hi-lo)/B;
   double prof[200];
   int x,k;
   for(k=0;k<B;k++) prof[k]=0;
   double tot=0;
   for(x=a;x<=i;x++)
     {
      double bl=s.l[x], bh=s.h[x];
      if(bh-bl<1e-12){ int kb=(int)MathFloor((bl-lo)/w); if(kb>=B)kb=B-1; if(kb<0)kb=0; prof[kb]+=1; tot+=1; continue; }
      int k0=(int)MathFloor((bl-lo)/w), k1=(int)MathFloor((bh-lo)/w);
      if(k0<0)k0=0; if(k1>=B)k1=B-1;
      for(k=k0;k<=k1;k++)
        {
         double e0=lo+k*w, e1=e0+w;
         double ov=MathMin(e1,bh)-MathMax(e0,bl);
         if(ov>0){ prof[k]+=ov/(bh-bl); tot+=ov/(bh-bl); }
        }
     }
   int pk=0; for(k=1;k<B;k++) if(prof[k]>prof[pk]) pk=k;
   int up=pk, dn=pk; double acc=prof[pk];
   while(acc<p.b4_va*tot && (up<B-1 || dn>0))
     {
      double au=(up<B-1)?prof[up+1]:-1, ad=(dn>0)?prof[dn-1]:-1;
      if(au>=ad){ up++; acc+=au; } else { dn--; acc+=ad; }
     }
   poc=lo+(pk+0.5)*w; vah=lo+(up+1)*w; val=lo+dn*w;
   return true;
  }

// tail (excess) rejection bar at t, given the profile of bar t-1
bool B4_TailAt(DPSeries &s,int t,int dir,DPParams &p,double poc,double vah,double val,double poc0)
  {
   double vw=vah-val; if(vw<=0) return false;
   double sh=poc-poc0;
   int tr=0; if(sh>p.b4_trendFrac*vw) tr=1; else if(sh<-p.b4_trendFrac*vw) tr=-1;
   double rg=s.h[t]-s.l[t]; if(rg<=0) return false;
   if(dir>0)
     {
      if(!(s.l[t]<DP_MinL(s,t-p.b4_sv,t-1))) return false;                // protrudes below the small value
      if(MathMin(s.o[t],s.c[t])-s.l[t]<0.5*rg) return false;               // long lower tail
      bool pierce=((s.l[t]<val && s.c[t]>val) || (s.l[t]<poc && s.c[t]>poc) || (s.c[t]<val));
      if(!pierce) return false;
      if(tr>=0){ if(s.c[t]>poc+p.b4_zone*vw) return false; }                // buy: excess below value .. just above control
      else     { if(!(s.l[t]<val && s.c[t]<=val+p.b4_zone*vw)) return false; } // downtrend: buy only in excess below value
     }
   else
     {
      if(!(s.h[t]>DP_MaxH(s,t-p.b4_sv,t-1))) return false;
      if(s.h[t]-MathMax(s.o[t],s.c[t])<0.5*rg) return false;
      bool pierce=((s.h[t]>vah && s.c[t]<vah) || (s.h[t]>poc && s.c[t]<poc) || (s.c[t]>vah));
      if(!pierce) return false;
      if(tr<=0){ if(s.c[t]<poc-p.b4_zone*vw) return false; }
      else     { if(!(s.h[t]>vah && s.c[t]>=vah-p.b4_zone*vw)) return false; }
     }
   return true;
  }

bool B4_Order(DPSeries &s,int i,DPParams &p,DPOrder &o)
  {
   DP_Clear(o);
   int lag=p.b4_win/2;
   int t;
   for(t=i-1;t>=i-p.b4_iw-p.b4_rw-1 && t>p.b4_win+lag+p.b4_sv;t--)
     {
      double poc,vah,val,poc0,v1,v2;
      if(!B4_Profile(s,t-1,p,poc,vah,val)) continue;
      if(!B4_Profile(s,t-1-lag,p,poc0,v1,v2)) continue;
      int dir;
      for(dir=1;dir>=-1;dir-=2)
        {
         if(!B4_TailAt(s,t,dir,p,poc,vah,val,poc0)) continue;
         if(!DP_ConfOK(s,t,dir,p)) continue;
         if(s.sess[t]==0) continue;
         double svh=(dir>0)?DP_MaxH(s,t-p.b4_sv,t):DP_MinL(s,t-p.b4_sv,t);   // small value boundary
         double a=s.atr[t];
         double sl=(dir>0)?(s.l[t]-p.b4_buf*a):(s.h[t]+p.b4_buf*a);
         double tp;
         if(dir>0) tp=(svh<poc)?poc:vah; else tp=(svh>poc)?poc:val;
         double risk=dir*(svh-sl), rew=dir*(tp-svh);
         if(risk<=0 || rew<p.b4_rrMin*risk) return false;
         // initiative break of the small value, then limit order back at its boundary
         int kb=-1,x;
         for(x=t+1;x<=i;x++)
           {
            if(kb<0)
              {
               if(dir>0 && s.l[x]<=sl) return false;
               if(dir<0 && s.h[x]>=sl) return false;
               if((dir>0 && s.c[x]>svh)||(dir<0 && s.c[x]<svh)) kb=x;
               else if(x-t>=p.b4_iw) return false;
              }
            else
              {
               if(x>kb && ((dir>0 && s.l[x]<=svh)||(dir<0 && s.h[x]>=svh))) return false;  // already filled
              }
           }
         if(kb<0) return false;
         if(i-kb>=p.b4_rw) return false;
         o.valid=1;o.dir=dir;o.otype=DP_LIMIT;o.price=svh;o.sl=sl;o.tp=tp;o.tpRef=i+1;o.setup=s.t[t];o.sigBar=i;
         return true;
        }
     }
   return false;
  }

//--- swing trailing level as of bar i (latest confirmed fractal low/high) ------
// returns price (0 if none) and the pivot bar index via ref
double DP_TrailLevel(DPSeries &s,int i,int dir,int k,double buf,int &pivBar)
  {
   int j;
   pivBar=-1;
   for(j=i-k;j>=0 && j>=i-k-300;j--)
     {
      if(dir>0 && DP_PivLow(s,j,k)){ pivBar=j; return s.l[j]-buf*s.atr[i]; }
      if(dir<0 && DP_PivHigh(s,j,k)){ pivBar=j; return s.h[j]+buf*s.atr[i]; }
     }
   return 0;
  }
//==========================================================================
// v3 regime metrics (pure functions; nothing above this line changed).
// All are computed from the window the caller passes, so the EA (CopyRates
// window) and the harness (full history) agree once the warm-up is covered.
//==========================================================================
// Kaufman efficiency ratio over n bars ending at i: |net move| / sum |bar moves|, 0..1 (-1 = not enough bars)
double DP_ER(DPSeries &s,int i,int n)
  {
   if(n<1 || i-n<0) return -1;
   double net=MathAbs(s.c[i]-s.c[i-n]), path=0; int k;
   for(k=i-n+1;k<=i;k++) path+=MathAbs(s.c[k]-s.c[k-1]);
   if(path<=0) return 0;
   return net/path;
  }
// Wilder ADX(period) at bar i, computed over a fixed warm-up of `warm` bars before i (window-independent
// once i>=warm: the start-up error decays as ((period-1)/period)^warm). -1 = not enough bars.
double DP_ADXAt(DPSeries &s,int i,int period,int warm)
  {
   if(period<2) period=2;
   if(warm<3*period) warm=3*period;
   int a=i-warm; if(a<1) a=1;
   if(i-a<2*period) return -1;
   double trS=0,pS=0,mS=0,adx=0; int k,cnt=0,dxn=0;
   for(k=a;k<=i;k++)
     {
      double up=s.h[k]-s.h[k-1], dn=s.l[k-1]-s.l[k];
      double pdm=(up>dn && up>0)?up:0, mdm=(dn>up && dn>0)?dn:0;
      double tr=MathMax(s.h[k],s.c[k-1])-MathMin(s.l[k],s.c[k-1]);
      cnt++;
      if(cnt<=period){ trS+=tr; pS+=pdm; mS+=mdm; if(cnt<period) continue; }
      else { trS=trS-trS/period+tr; pS=pS-pS/period+pdm; mS=mS-mS/period+mdm; }
      double pdi=(trS>0)?100.0*pS/trS:0, mdi=(trS>0)?100.0*mS/trS:0;
      double dx=(pdi+mdi>0)?100.0*MathAbs(pdi-mdi)/(pdi+mdi):0;
      dxn++;
      if(dxn<=period){ adx+=dx; if(dxn==period) adx/=period; }
      else adx=(adx*(period-1)+dx)/period;
     }
   if(dxn<period) return -1;
   return adx;
  }
// percentile rank (0..100) of atr[i] within atr[i-lookback+1..i]; -1 = not enough bars
double DP_ATRPctAt(DPSeries &s,int i,int lookback)
  {
   if(lookback<2 || i-lookback+1<14) return -1;
   int k,le=0;
   for(k=i-lookback+1;k<=i;k++) if(s.atr[k]<=s.atr[i]) le++;
   return 100.0*le/lookback;
  }
// EMA(200) slope over `bars` bars in ATR units at bar i (sign = direction); 0 if not enough bars
double DP_EmaSlopeATR(DPSeries &s,int i,int bars)
  {
   if(bars<1 || i-bars<0 || s.atr[i]<=0) return 0;
   return (s.ema[i]-s.ema[i-bars])/s.atr[i];
  }
#endif
