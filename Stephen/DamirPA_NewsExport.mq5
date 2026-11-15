//+------------------------------------------------------------------+
//|                                          DamirPA_NewsExport.mq5  |
//|  SCRIPT. Run it once on a LIVE or DEMO chart (not in the tester):|
//|  it reads the MT5 economic calendar and writes the CSV that      |
//|  DamirPA_EA v3.10 reads in the Strategy Tester, where the calendar  |
//|  functions are not allowed (error 4014).                         |
//|  Output: Terminal\Common\Files\DamirPA_news.csv, times in trade  |
//|  SERVER time (first line "#tz=server"). Use the same broker as   |
//|  the tester so server times line up.                             |
//+------------------------------------------------------------------+
#property copyright "Built for Stephen"
#property version   "3.10"
#property script_show_inputs
#property strict

input string   InpCurrencies = "USD,EUR,GBP,JPY,CHF,CAD";   // Currencies to export
input datetime InpFrom       = D'2019.12.01';               // From (server time)
input datetime InpTo         = 0;                           // To (0 = now + 30 days)
input int      InpMinImpact  = 2;                           // Export impact >= (3 high, 2 moderate, 1 low); the EA filters again
input string   InpFile       = "DamirPA_news.csv";          // File name
input bool     InpCommon     = true;                        // Write to Terminal\Common\Files (tester agents can read it)

void OnStart()
  {
   datetime to=(InpTo>0)?InpTo:TimeTradeServer()+30*86400;
   int fl=FILE_WRITE|FILE_TXT|FILE_ANSI; if(InpCommon) fl|=FILE_COMMON;
   int h=FileOpen(InpFile,fl);
   if(h==INVALID_HANDLE){ Print("DamirPA_NewsExport: cannot open ",InpFile," err ",GetLastError()); return; }
   FileWriteString(h,"#tz=server\r\n");
   FileWriteString(h,"# exported by DamirPA_NewsExport from the MT5 economic calendar on "+TimeToString(TimeTradeServer())+" (server time)\r\n");
   FileWriteString(h,"# time,currency,impact(3 high/2 moderate/1 low),title\r\n");
   string parts[]; int n=StringSplit(InpCurrencies,',',parts); int i,k, total=0;
   for(i=0;i<n;i++)
     {
      string c=parts[i]; StringTrimLeft(c); StringTrimRight(c); StringToUpper(c);
      if(c=="") continue;
      MqlCalendarValue v[];
      ResetLastError();
      int got=CalendarValueHistory(v,InpFrom,to,NULL,c);
      if(got<0){ Print("DamirPA_NewsExport: calendar error ",GetLastError()," for ",c," (the calendar only works on a connected live/demo chart, not in the tester)"); continue; }
      int kept=0;
      for(k=0;k<got;k++)
        {
         MqlCalendarEvent ev;
         if(!CalendarEventById(v[k].event_id,ev)) continue;
         int imp=(ev.importance==CALENDAR_IMPORTANCE_HIGH)?3:(ev.importance==CALENDAR_IMPORTANCE_MODERATE)?2:(ev.importance==CALENDAR_IMPORTANCE_LOW)?1:0;
         if(imp<InpMinImpact) continue;
         string title=ev.name; StringReplace(title,",",";");
         FileWriteString(h,TimeToString(v[k].time,TIME_DATE|TIME_MINUTES)+","+c+","+IntegerToString(imp)+","+title+"\r\n");
         kept++;
        }
      total+=kept;
      Print("DamirPA_NewsExport: ",c," ",got," values, ",kept," exported (impact >= ",InpMinImpact,")");
     }
   FileClose(h);
   Print("DamirPA_NewsExport: wrote ",total," events to ",(InpCommon?"Terminal\\Common\\Files\\":"MQL5\\Files\\"),InpFile,
         ". Check: US Non-Farm Payrolls should read 15:30 on a NY-close (UTC+2/+3) server.");
  }
