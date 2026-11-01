/**
 * The magazine edition (V2). The same research as the current issue, laid out as an editorial publication: a feature article that carries the story across
 * the opening pages, the chain of impact as the signature spread, the competing explanations argued rather than listed, an accountability page for the
 * last issue's forecast, and then the Data Desk, which holds every reference table behind the story.
 *
 * Nothing here changes a threshold or a calculation. Every figure is drawn from data the current issue already carries (yield moves, chain links, the
 * hypothesis checks, the stored forecast audit). Where a sentence is generated it states a measured fact; where a claim is a reading it is attributed to
 * "the desk's reading" and set beside its counter-argument.
 *
 * Pure: strings in, string out. Helpers (escaping, colours, small SVG builders) come from the caller so this file has no import cycle with newsletter.js.
 * Tested in js/newsletter.test.mjs and by rendering the pages (see plans/NEWSLETTER_MAGAZINE.md).
 */

export const MAG_CSS = `
.mgw{max-width:860px;padding:0 0 40px}
.pg{background:#fff;margin:0 0 18px;padding:26px 28px 28px;border-radius:4px;box-shadow:0 1px 0 rgba(0,0,0,.04),0 8px 24px rgba(11,18,32,.07);font-family:Georgia,'Times New Roman',serif;color:#14202e}
.pg *{box-sizing:border-box}
.pg .mh{display:flex;justify-content:space-between;align-items:baseline;gap:10px;border-bottom:3px double #14202e;padding-bottom:7px;margin-bottom:16px;font-family:'Segoe UI',system-ui,sans-serif;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#14202e}
.pg .mh b{font-family:Georgia,serif;font-size:17px;letter-spacing:.06em}
.pg .kick{font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#d98a00;font-weight:700;margin:0 0 6px}
.pg h1.hd{font-size:41px;line-height:1.05;letter-spacing:-.015em;margin:0 0 12px;font-weight:700}
.pg .sf{font-size:19px;line-height:1.42;font-style:italic;color:#3a4756;margin:0 0 10px}
.pg .tdy{margin:2px 0 10px;border-top:2px solid #0f1b2d;border-bottom:1px solid #dfe6f1;font-family:var(--sans)}.pg .tdy p{display:grid;grid-template-columns:78px 1fr;gap:10px;margin:0;padding:6px 0;border-top:1px solid #e6ecf5;font-size:13.5px;line-height:1.38;color:#1c2a3f}.pg .tdy p:first-child{border-top:0}.pg .tdy b{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#c25a00;padding-top:3px}
.pg .g3{font-family:var(--mono);font-size:10px;letter-spacing:.04em;color:#4a5a70;margin:2px 0 0}.pg .g3 b{color:#0f1b2d}
.pg .t3{width:100%;border-collapse:collapse;font-family:var(--sans);font-size:12px;line-height:1.4;color:#1c2a3f;margin:6px 0 4px}.pg .t3 th{font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#6b7a90;text-align:left;font-weight:600;padding:4px 8px 4px 0;border-bottom:2px solid #0f1b2d}.pg .t3 td{padding:5px 8px 5px 0;border-bottom:1px solid #e6ecf5;vertical-align:top}.pg .t3 .n{font-weight:600;color:#0f1b2d;white-space:nowrap}.pg .t3 .n small{display:block;font-weight:400;font-size:10px;color:#6b7a90}.pg .t3 .v{font-variant-numeric:tabular-nums;white-space:nowrap}.pg .t3 .v small{color:#9a6200;font-size:9.5px}.pg .t3 .m{font-variant-numeric:tabular-nums;white-space:nowrap;color:#33445c}.pg .t3 .w{color:#4a5a70;font-size:11.5px}.pg .t3 .u{white-space:nowrap;font-variant-numeric:tabular-nums}.pg .t3 .bar3{display:inline-block;width:70px;height:7px;border-radius:4px;background:#e6ecf5;vertical-align:middle;margin-right:6px;overflow:hidden}.pg .t3 .bar3 i{display:block;height:100%;background:#2f6fdd}.pg .t3 .up3{color:#0e8a63}.pg .t3 .dn3{color:#c4412b}.pg .small3{font-family:var(--sans);font-size:10.5px;line-height:1.45;color:#6b7a90;margin:4px 0 0}
.pg .ld{font-family:var(--sans);font-size:14px;line-height:1.5;color:#1c2a3f;margin:2px 0 8px}
.pg .dsh{margin:0 0 8px;border-top:2px solid #0f1b2d;font-family:var(--sans)}.pg .dsh .dh{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:#c25a00;padding:5px 0 3px}
.pg .dsh .dr{display:grid;grid-template-columns:70px 1fr;gap:10px;padding:4px 0;border-top:1px solid #e6ecf5;font-size:12.5px;line-height:1.38;color:#1c2a3f}.pg .dsh .dsw{font-family:var(--mono);font-size:11px;font-weight:600;color:#0f1b2d;padding-top:1px}.pg .dsh .dsn b{color:#0f1b2d;font-weight:600}.pg .dsh .dsn i{font-style:normal;color:#4a5a70}
.pg .brd{display:grid;grid-template-columns:repeat(6,1fr);gap:0;margin:0 0 8px;border-top:1px solid #dfe6f1;border-bottom:1px solid #dfe6f1;font-family:var(--sans)}.pg .brd>div{padding:5px 6px;border-left:1px solid #e6ecf5}.pg .brd>div:first-child{border-left:0;padding-left:0}.pg .brd small{display:block;font-family:var(--mono);font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#6b7a90}.pg .brd b{display:block;font-size:15px;color:#0f1b2d;font-variant-numeric:tabular-nums}.pg .brd em{display:block;font-style:normal;font-size:9.5px;color:#4a5a70}
.pg .mo{font-family:var(--sans);font-size:12.5px;line-height:1.4;color:#3a4756;margin:0 0 8px}.pg .mo b{color:#0f1b2d;font-weight:600}
.pg .by{font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;color:#5b6b82;letter-spacing:.04em;margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid #d8e0ec}
.pg h2.sh{font-size:25px;line-height:1.15;margin:4px 0 10px;letter-spacing:-.01em}
.pg h3.ss{font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#14202e;margin:14px 0 4px}
.pg p{font-size:15.5px;line-height:1.55;margin:0 0 10px}
.pg .cols p.lead::first-letter{float:left;font-size:58px;line-height:.82;padding:5px 7px 0 0;font-weight:700;color:#d98a00}
.pg .cols{column-gap:30px;column-rule:1px solid #e6ecf5}
@media (min-width:640px){.pg .cols{column-count:2}.pg .split{display:grid;grid-template-columns:1fr 210px;gap:26px}.pg .two{display:grid;grid-template-columns:1fr 1fr;gap:22px}.pg .fig2{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
.pg .split>.cols{min-width:0}
.pg .cols .pq{column-span:all}
.pg .pq{font-size:25px;line-height:1.22;font-style:italic;font-weight:600;color:#14202e;border-top:3px solid #d98a00;border-bottom:1px solid #d8e0ec;padding:12px 2px;margin:12px 0 14px;break-inside:avoid}
.pg .pq small{display:block;font-family:'Segoe UI',system-ui,sans-serif;font-style:normal;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#5b6b82;margin-top:6px;font-weight:400}
.pg aside.side{font-family:'Segoe UI',system-ui,sans-serif;font-size:12px;line-height:1.45;background:#f3f6fb;border-top:3px solid #14202e;padding:12px 13px;align-self:start}
.pg aside.side h4{margin:0 0 6px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
.pg aside.side .big{font-family:Georgia,serif;font-size:32px;line-height:1;font-weight:700;display:block;margin-top:8px}
.pg aside.side .big small{font:11px 'Segoe UI',sans-serif;color:#5b6b82;display:block;margin-top:2px}
.pg aside.side p{font-size:12px;line-height:1.45;margin:6px 0 0}
.pg figure{margin:6px 0 14px;break-inside:avoid}
.pg figure>svg,.pg figure .fsvg{display:block;width:100%;height:auto}
.pg figcaption{font-family:'Segoe UI',system-ui,sans-serif;font-size:11.5px;line-height:1.4;color:#5b6b82;margin-top:5px;border-top:1px solid #e1e8f2;padding-top:5px}
.pg figcaption b{color:#14202e}
.pg .chain-fig svg{background:#fff!important;border:0!important;border-radius:0!important}
.pg .notes{display:grid;gap:8px;margin-top:8px}
@media (min-width:640px){.pg .notes{grid-template-columns:1fr 1fr}}
.pg .note4{display:grid;grid-template-columns:26px 1fr;gap:9px;font-family:'Segoe UI',system-ui,sans-serif;font-size:12.5px;line-height:1.45;border-top:1px solid #e1e8f2;padding-top:7px;break-inside:avoid}
.pg .note4 .no{width:24px;height:24px;border-radius:50%;background:#d98a00;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:13px}
.pg .note4 b{display:block;font-size:13px}
.pg .tx{width:100%;border-collapse:collapse;font-family:'Segoe UI',system-ui,sans-serif;font-size:12px}
.pg .tx th{font-size:10px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:2px solid #14202e;padding:3px 6px 3px 0;color:#14202e}
.pg .tx td{border-bottom:1px solid #e6ecf5;padding:5px 6px 5px 0;vertical-align:top;line-height:1.35}
.pg .em{width:100%;border-collapse:collapse;font-family:'Segoe UI',system-ui,sans-serif;font-size:12px;margin:6px 0 4px}
.pg .em th{font-size:10.5px;text-align:center;padding:4px 4px;vertical-align:bottom;border-bottom:2px solid #14202e;line-height:1.25}
.pg .em th:first-child{text-align:left}
.pg .em td{border-bottom:1px solid #e6ecf5;padding:2px 4px;text-align:center;line-height:1.25}
.pg .em td:first-child{text-align:left}
.pg .em .y{color:#0f9f6e;font-weight:700}.pg .em .x{color:#d98a00;font-weight:700}.pg .em .n{color:#9aa8bb}
.pg .em .lb{display:block;font-weight:400;color:#5b6b82;font-size:10px;margin-top:2px}
.pg .wkd,.pg .ev2,.pg .ev2 *,.pg section,.pg section p{font-family:'Segoe UI',system-ui,sans-serif}.pg section p{font-size:13px;line-height:1.5}.pg .th2{break-inside:avoid;margin:0 0 10px}.pg .th2 h3{text-transform:none;letter-spacing:0;font-family:Georgia,serif;color:#14202e}.pg .th2 .chipx{display:block;width:max-content;margin:3px 0 4px}
.pg .th2 h3{font-size:17px;margin:0 0 3px}
.pg .th2 p{font-size:13.5px;line-height:1.42;margin:0 0 4px}
.pg .th2 .lim{color:#5b6b82;font-style:italic}
.pg .chipx{font-family:'Segoe UI',system-ui,sans-serif;font-size:10.5px;letter-spacing:.04em;background:#eef2f8;border-radius:999px;padding:2px 9px;font-weight:600;color:#14202e}
.pg .sfl{display:block;font-family:'Segoe UI',system-ui,sans-serif;font-style:normal;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#5b6b82;margin-bottom:3px}
.pg .keep{break-inside:avoid}.pg aside.side .lb2{display:block;font-size:12.5px;margin:2px 0 3px}
.acctn .num{font-family:Georgia,serif;font-size:40px;line-height:1;font-weight:700}.acctn .num small{display:block;font:11px/1.35 'Segoe UI',sans-serif;color:#5b6b82;margin-top:4px;font-weight:400}
.pg .box{background:#f3f6fb;border-left:4px solid #2f6bff;padding:11px 14px;margin:6px 0 14px;break-inside:avoid;font-family:'Segoe UI',system-ui,sans-serif;font-size:13px;line-height:1.5}
.pg .box h4{margin:0 0 4px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#2f6bff}
.pg .box p{font-size:13px;line-height:1.5;margin:0 0 6px}
.pg .lst{margin:0;padding-left:18px;font-family:'Segoe UI',system-ui,sans-serif;font-size:12.5px;line-height:1.45}
.pg .lst li{margin-bottom:5px}
.pg .lst small{display:block;color:#5b6b82}
.pg .deskhd{background:#14202e;color:#fff;margin:-26px -28px 18px;padding:18px 28px 14px}
.pg .deskhd .kick{color:#f2b64d}
.pg .deskhd h2{font-size:30px;margin:0;color:#fff;letter-spacing:-.01em}
.pg .deskhd p{color:#c4d0e2;font-size:13.5px;margin:6px 0 0;font-family:'Segoe UI',system-ui,sans-serif}
.pg.desk,.pg.desk p,.pg.desk li,.pg.desk td{font-family:'Segoe UI',system-ui,sans-serif}.pg.desk p{font-size:13.5px;line-height:1.5}.pg.desk .small,.pg.desk small{font-size:12px}
.pg .tl6{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0 12px}.pg .tl{background:var(--navy);border-radius:10px;padding:9px 11px;color:#cfe0f5;-webkit-print-color-adjust:exact}.pg .tl small{display:block;font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#8aa0bd}.pg .tl b{display:block;font-family:var(--mono);font-size:19px;color:#fff;margin:2px 0}.pg .tl i{display:block;font-family:var(--mono);font-style:normal;font-size:10.5px;margin-bottom:4px}.pg .tl i.up{color:var(--up)}.pg .tl i.dn{color:var(--dn)}
.pg table.ft{width:100%;border-collapse:collapse;font-family:var(--sans);font-size:11.5px;margin:4px 0 10px}.pg table.ft th{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:2px solid var(--navy);padding:4px 6px 4px 0;color:var(--navy)}.pg table.ft td{border-bottom:1px solid #e3e9f2;padding:4px 6px 4px 0;vertical-align:top;line-height:1.35}.pg table.ft .r{text-align:right;font-family:var(--mono);white-space:nowrap}.pg table.ft td.up,.pg table.ft .up{color:#0a8f6c;font-weight:700}.pg table.ft td.dn,.pg table.ft .dn{color:#d63a52;font-weight:700}
.pg .dsec{border-top:2px solid var(--navy);margin:14px 0 8px;padding-top:6px}.pg .dsec h3{font-family:var(--sans);font-weight:800;font-size:19px;letter-spacing:-.01em;margin:0 0 2px;text-transform:none;color:var(--navy)}
.pg .bk{display:grid;grid-template-columns:150px 86px 1fr 200px;gap:2px 12px;align-items:center;padding:5px 0;border-top:1px solid #dfe6f1;break-inside:avoid;font-family:var(--sans);font-size:11px;line-height:1.35}.pg .bk:first-of-type{border-top:2px solid var(--navy)}.pg .bk .bkn{display:flex;gap:8px;align-items:center}.pg .bk .bkn b{font-size:13px;display:block}.pg .bk .bkn small{color:#5b6b82;font-family:var(--mono);font-size:10px}.pg .bk .bkm{font-family:var(--mono);font-size:11px}.pg .bk .bks{grid-column:1/4}.pg .bk .bki{grid-column:1/-1;color:#4a5a70;font-size:10.5px}.pg .bk .bki b{color:var(--navy)}.pg .bk .bkc{min-width:0}.pg .bk .bkc .cot2{margin:0;background:none;border:0;padding:0}
.pg.desk section{box-shadow:none;border:0;border-radius:0;border-top:2px solid var(--navy);padding:8px 0 4px;background:transparent}
.pg.desk section{margin:0 0 14px}
.pg.desk .ccg2{display:block;column-count:1;column-gap:12px}.pg.desk .pcg{display:grid;grid-template-columns:1fr;gap:10px}.pg.desk .pcg>.pc,.pg.desk .ccg2>.cc2{break-inside:avoid;margin:0 0 12px;display:block}.pg.desk .pcg>.pc{margin:0}
@media (min-width:640px){.pg.desk .ccg2{column-count:2}.pg.desk .pcg{grid-template-columns:1fr 1fr}}
.acct{display:grid;gap:14px}
.acct .num{font-family:Georgia,serif;font-size:44px;line-height:1;font-weight:700}
.acct .num small{display:block;font:11px 'Segoe UI',sans-serif;color:#5b6b82;margin-top:3px;letter-spacing:.03em}
.acctn{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;border-top:3px solid #14202e;border-bottom:1px solid #d8e0ec;padding:10px 0}
.pg .al{display:grid;gap:8px}
.pg .al>div{background:#fff;border:1px solid #d8e0ec;border-top:3px solid #14202e;padding:9px 11px;font-family:'Segoe UI',system-ui,sans-serif;font-size:12.5px;line-height:1.45}
.pg .al>div.w{border-top-color:#d98a00}
.pg .al b.n2{font-family:Georgia,serif;font-size:26px;display:block;line-height:1}
@media (max-width:560px){.pg figure{overflow-x:auto}.pg .fw{min-width:540px}.pg .chain-fig svg{min-width:720px}.pg .mh span:nth-child(2){display:none}.pg .mh{font-size:9px}.pg .mh b{font-size:15px}.pg{padding:18px 15px 20px;border-radius:0}.pg h1.hd{font-size:31px}.pg .deskhd{margin:-18px -15px 14px;padding:14px 15px 12px}.pg aside.side{margin-top:6px}.acctn{grid-template-columns:1fr}}
@page land{size:A4 landscape;margin:10mm}
@media print{
  html,body{background:#fff!important}
  .mgw{max-width:none;padding:0;margin:0}
  .pg{box-shadow:none;border-radius:0;margin:0;padding:0;break-after:page;page-break-after:always}
  .pg:last-of-type{break-after:auto}
  .pg.land{page:land}
  .pg .cols{column-count:2}.pg .split{display:grid;grid-template-columns:1fr 200px;gap:22px}.pg .two{display:grid;grid-template-columns:1fr 1fr;gap:20px}.pg .fig2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .pg .notes{grid-template-columns:1fr 1fr 1fr 1fr}
  .pg .deskhd{margin:0 0 14px;padding:14px 20px 12px}
  .pg h1.hd{font-size:38px}
  .pg .acctn .num{font-size:30pt}.pg p{font-size:11.5pt}.pg .th2 p{font-size:9pt;line-height:1.35;margin:0 0 3px}.pg .th2 h3{font-size:13.5pt}.pg .th2{margin:0 0 7px}.pg .em{font-size:10px}.pg .em td{padding:1px 4px}.pg .qnote{display:none}.pg .sf{font-size:13.5pt}.pg .box{margin:4px 0 8px;padding:8px 12px}.pg .box p{font-size:8.6pt;line-height:1.38;margin:0 0 3px}.pg .p5 figcaption{font-size:8.5pt}
  .pg .pgbreak{break-before:page}.pg .tx td{padding:3px 6px 3px 0}.pg .two h3.ss{margin:6px 0 2px}.pg .acsf{display:none}.p1 .cols p{font-size:10.4pt;line-height:1.46}.p1 aside.side{font-size:8.8pt}.p1 aside.side p{font-size:8.6pt;line-height:1.4}.p1 .al>div{padding:6px 9px}.p1 .evkey{margin:0 0 4px}.p1 .evb{font-size:7.5px;padding:1px 5px}.pg.land .sf{display:none}.pg.land .chain-fig{padding:8px 8px 4px}.pg.land .chain-fig svg{width:80%;margin:0 auto}.pg.land .chain-fig figcaption{font-size:7.6pt;line-height:1.35}.pg table.wkr td,.pg table.wkr th{padding-top:1px;padding-bottom:1px;font-size:11.5px}.pg.desk .gg{padding-top:2px;padding-bottom:2px;margin:0}.pg.desk section table:not(.ft) td,.pg.desk section table:not(.ft) th{padding-top:2px;padding-bottom:2px}.pg.desk section table:not(.ft){margin-bottom:4px}.pg .meth{font-size:7.8pt;line-height:1.4;margin-top:6px;padding-top:5px}.pg.desk section{padding:6px 0 2px;margin:0 0 5px}.pg.desk section .small.muted{font-size:8.6pt;line-height:1.35}.pg .bk .bkc .cot2{grid-template-columns:1fr 70px;font-size:10px;line-height:1.25}.pg .bk .bkc .cot2 small{font-size:9px}.pg.desk table{break-inside:avoid}.pg .refs{padding:7px 12px;margin:8px 0;font-size:9.5px}.pg .refs .rf{padding:0}.pg .foot{margin-top:8px}.pg .foot p{font-size:8.6pt;margin:0 0 4px}.pg.desk p,.pg.desk li{font-size:9.4pt;line-height:1.4}.pg.desk .cc2,.pg.desk .pc{padding:9px 11px}.pg section table td,.pg section table th{padding-top:3px;padding-bottom:3px}.pg .wkd{padding:5px 0}.pg .refs,.pg .foot,.pg .box{break-inside:avoid}.pg section>h2{break-inside:avoid}  .pg.desk .ccg2{column-count:2}.pg.desk .pcg{display:grid;grid-template-columns:1fr 1fr;gap:10px;column-count:auto}.pg.desk section{break-inside:auto}.pg.desk section>h2,.pg.desk section>h3{break-after:avoid-page;page-break-after:avoid}.pg.desk section>h2+*{break-before:avoid-page}.pg.desk .pcg>.pc:first-child,.pg.desk .ccg2>.cc2:first-child{break-before:avoid-page}.pg.desk .pc,.pg.desk .cc2,.pg.desk .rw2,.pg.desk tr{break-inside:avoid}
}

/* ── terminal theme ── */
.pg{--navy:#0b1220;--navy2:#111c2f;--grid:#1c2a40;--up:#19d3a0;--dn:#ff5d73;--amb:#ffb020;--cy:#4cc9f0;--mono:Consolas,'SF Mono',Menlo,monospace;--sans:'Segoe UI',Inter,system-ui,sans-serif}
.pg .mh{background:var(--navy);color:#cfe0f5;border:0;margin:-26px -28px 0;padding:11px 18px;font-family:var(--mono);font-size:10px;letter-spacing:.12em}
.pg .mh b{display:flex;align-items:center;gap:9px;font-family:var(--sans);font-weight:800;font-size:15px;letter-spacing:.14em;color:#fff;text-transform:uppercase}
.pg .mh .logo{display:block}
.pg .tape{display:flex;flex-wrap:wrap;gap:3px 20px;background:var(--navy2);color:#cfe0f5;border-bottom:3px solid var(--up);margin:0 -28px 18px;padding:8px 18px;font-family:var(--mono);font-size:10.5px;line-height:1.35;white-space:nowrap;-webkit-print-color-adjust:exact}
.pg .tape b{color:#fff;font-weight:700}.pg .tape i{font-style:normal;font-weight:700}.pg .tape i.up{color:var(--up)}.pg .tape i.dn{color:var(--dn)}
.pg .deskhd .tape{margin:-18px -28px 14px;background:#0f1a2e}
.pg .kick{font-family:var(--mono);color:var(--amb);letter-spacing:.14em;display:flex;align-items:center;gap:8px;margin-top:16px}
.pg .kick::before{content:'';width:6px;height:13px;background:var(--up);box-shadow:0 -4px 0 -2.5px var(--up),0 4px 0 -2.5px var(--up);flex:none}
.pg .mh+.kick{margin-top:18px}
.pg .box.warn{border-left-color:#d98a00;background:#fff7e8}.pg .box.warn h4{color:#9a6200}.pg aside.side p.chk{color:#ffb020;font-size:8.8pt;margin-top:8px}.pg .evb{display:inline-block;font-family:var(--mono);font-size:8.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border-radius:3px;padding:2px 6px;margin-right:6px;vertical-align:1px;border:1px solid var(--navy);color:var(--navy);background:#fff;white-space:nowrap}.pg .evb.model{background:var(--navy);color:var(--cy);border-color:var(--navy)}.pg .evb.tested{background:#e6f8f2;color:#0a8f6c;border-color:#0a8f6c}.pg .evb.context{background:#f1f3f7;color:#5b6b82;border-color:#9aa8bb}.pg .evb.hyp{background:#fff4de;color:#9a6200;border-color:#d98a00}.pg .evb.untested{background:#fff;color:#8a5a5a;border-color:#c9a3a3;border-style:dashed}
.pg .evl{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 6px;align-items:center}.pg .evkey{font-family:var(--mono);font-size:9px;color:#5b6b82;margin:0 0 10px;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center}.pg .meth{font-family:var(--sans);font-size:10.5px;line-height:1.45;color:#5b6b82;border-top:1px solid var(--grid);margin-top:10px;padding-top:8px;columns:2;column-gap:24px}.pg .meth b{color:var(--navy)}
.pg h1.hd,.pg h2.sh{font-family:var(--sans);font-weight:800;letter-spacing:-.028em;color:var(--navy)}
.pg h1.hd{font-size:45px;line-height:1.02}
.pg h2.sh{font-size:29px;line-height:1.08}
.pg .by{font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid var(--grid)}
.pg .sf{border-left:4px solid var(--up);padding-left:13px}
.pg .sfl{font-family:var(--mono)}
.pg .pq{border-top:0;border-bottom:0;border-left:6px solid var(--up);padding:6px 4px 6px 16px;background:linear-gradient(90deg,rgba(25,211,160,.09),transparent)}
.pg .pq small{font-family:var(--mono)}
.pg .cols p.lead::first-letter{color:var(--up);font-family:var(--sans)}
.pg h3.ss{font-family:var(--mono);letter-spacing:.14em;color:var(--navy)}
.pg aside.side{background:var(--navy);color:#dbe7f7;border-top:3px solid var(--up);-webkit-print-color-adjust:exact}
.pg aside.side h4{font-family:var(--mono);color:var(--up)}
.pg aside.side .big{font-family:var(--mono);color:#fff}.pg aside.side .big small{color:#8aa0bd;font-family:var(--sans)}
.pg aside.side p{color:#cfe0f5}
.pg .al>div{background:var(--navy2);border:1px solid var(--grid);border-top:3px solid var(--up);color:#cfe0f5}
.pg .al>div.w{border-top-color:var(--amb)}
.pg .al b.n2{font-family:var(--mono);color:#fff}.pg .al .lb2{color:#fff}
.pg figure>svg,.pg figure .fsvg{border-radius:10px}
.pg figcaption{font-family:var(--mono);font-size:10.5px;letter-spacing:.01em;border-top:1px solid #dfe6f1}
.pg figcaption b{color:var(--navy)}
.pg .chain-fig{background:var(--navy);border-radius:12px;padding:14px 14px 10px;-webkit-print-color-adjust:exact}
.pg .chain-fig svg{background:transparent!important}
.pg .chain-fig figcaption{color:#8aa0bd;border-top-color:var(--grid)}.pg .chain-fig figcaption b{color:#fff}
.pg .tx th,.pg .em th{font-family:var(--mono);letter-spacing:.1em;border-bottom-color:var(--navy)}
.pg .tx td{font-family:var(--sans)}
.pg .em .y{color:var(--up)}.pg .em .x{color:var(--dn)}
.pg .acctn{border-top:3px solid var(--navy)}
.pg .acctn .num,.pg .acct .num{font-family:var(--mono);color:var(--navy)}
.pg .acctn .num small{font-family:var(--sans)}
.pg .box{border-left-color:var(--up);background:#eef6f4}.pg .box h4{font-family:var(--mono);color:#0a8f6c}
.pg .th2 .chipx{font-family:var(--mono);background:var(--navy);color:var(--up)}
.pg .deskhd{background:var(--navy);-webkit-print-color-adjust:exact}.pg .deskhd .kick{color:var(--amb)}
.pg .deskhd h2{font-family:var(--sans);font-weight:800}
.pg .dgh{display:flex;align-items:center;gap:10px;font-family:var(--mono);font-weight:700;font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--navy);border-bottom:2px solid var(--navy);margin:20px 0 10px;padding-bottom:6px;break-after:avoid}.pg .dgh b{background:var(--navy);color:var(--up);width:22px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px;-webkit-print-color-adjust:exact}.pg .dgh:first-child{margin-top:0}
.pg.desk section h2{font-family:var(--sans)}
@page{@bottom-right{content:counter(page);font:9px Consolas,monospace;color:#8aa0bd}}
@media (max-width:560px){.pg .mh{margin:-18px -15px 0;padding:10px 12px}.pg .tape{margin:0 -15px 14px;flex-wrap:nowrap;overflow-x:auto;padding:8px 12px}.pg .deskhd .tape{margin:-14px -15px 12px}.pg h1.hd{font-size:33px}.pg h2.sh{font-size:25px}}
@media print{.pg .mh{margin:0}.pg .tape{margin:0 0 14px}.pg .deskhd .tape{margin:0 0 12px}}


/* V4: the reader's guide, the three voices, the stress panel and the hypothesis cards */
.pg .rg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 16px;margin:10px 0 12px;padding:11px 14px;background:#eef3fb;border-radius:10px;font-family:var(--sans);font-size:11.5px;line-height:1.45;-webkit-print-color-adjust:exact}
.pg .rg>div b{display:block;font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#2f6fb5;margin-bottom:2px}
.pg .rg .u{grid-column:1/-1;border-top:1px solid #cdd9ea;padding-top:6px;margin-top:2px}.pg .rg .u b{color:#9a6200}
.pg .rg.sm{font-size:10.8px;padding:8px 12px;margin:6px 0 8px}
.pg .fiu{margin:6px 0 14px;font-family:var(--sans)}
.pg .fiu>div{position:relative;padding:9px 14px 6px 18px;margin:0 0 7px;border-radius:8px;-webkit-print-color-adjust:exact}
.pg .fiu>div:before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;border-radius:8px 0 0 8px}
.pg .fiu b.v{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:3px}
.pg .fiu p{margin:0 0 4px;font-size:12.3px;line-height:1.42;color:#1b2a40}
.pg .fiu .f{background:#e9f8f2}.pg .fiu .f:before{background:#19b88a}.pg .fiu .f b.v{color:#0a8f6c}
.pg .fiu .i{background:#eaf1fc}.pg .fiu .i:before{background:#3b7be0}.pg .fiu .i b.v{color:#2f66bf}
.pg .fiu .x{background:#fff6e5}.pg .fiu .x:before{background:#e09a00}.pg .fiu .x b.v{color:#9a6200}
.pg .map{font-family:var(--mono);font-size:9.5px;letter-spacing:.04em;color:#5b6b82;border-top:1px solid #dfe6f1;padding-top:7px;margin:8px 0 0;line-height:1.7}.pg .map b{color:var(--navy)}
.pg .cnt{display:flex;gap:6px;align-items:stretch;margin:8px 0;font-family:var(--sans)}.pg .cnt div{flex:1;background:var(--navy);border-radius:8px;padding:7px 9px;color:#cfe0f5;-webkit-print-color-adjust:exact}.pg .cnt div b{display:block;font-family:var(--mono);font-size:21px;color:#fff;line-height:1.1}.pg .cnt div small{font-size:9.6px;line-height:1.25;display:block}.pg .cnt div.g b{color:#19d3a0}.pg .cnt div.r b{color:#ff8a9a}.pg .cnt div.q b{color:#8aa0bd}
.pg .sdiv{break-after:avoid}.pg .stv{display:flex;gap:14px;align-items:center;background:var(--navy);color:#e6eefb;border-radius:10px;padding:12px 16px;margin:8px 0 10px;-webkit-print-color-adjust:exact}.pg .stv b.n{font-family:var(--mono);font-size:34px;color:#19d3a0;line-height:1}.pg .stv .t{font-family:var(--sans);font-size:15px;font-weight:800}.pg .stv small{display:block;font-family:var(--sans);font-weight:400;font-size:11.5px;color:#9db1cc;margin-top:2px}
.pg table.fl{width:100%;border-collapse:collapse;font-family:var(--sans);font-size:11.3px;margin:4px 0 8px}.pg table.fl th{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:2px solid var(--navy);padding:4px 8px 4px 0;color:var(--navy)}.pg table.fl td{border-bottom:1px solid #e3e9f2;padding:5px 8px 5px 0;vertical-align:top}.pg table.fl .st{font-family:var(--mono);font-size:10px;font-weight:700;white-space:nowrap}.pg table.fl .st.off{color:#0a8f6c}.pg table.fl .st.on{color:#d63a52}.pg table.fl .st.na{color:#9a6200}
.pg .hc{border:1px solid #d6e0ee;border-radius:10px;padding:6px 12px;margin:0 0 6px;font-family:var(--sans);font-size:10.7px;line-height:1.36;break-inside:avoid;background:#fff}.pg .hc h3{font-size:15px;margin:0 0 2px;color:var(--navy);display:flex;gap:10px;align-items:center;justify-content:space-between}.pg .hc .sc{font-family:var(--mono);font-size:10px;background:var(--navy);color:#fff;border-radius:999px;padding:3px 9px;white-space:nowrap}
.pg .hc dl{display:grid;grid-template-columns:112px 1fr;gap:2px 12px;margin:4px 0 0}.pg .hc dt{font-family:var(--mono);font-size:8.8px;letter-spacing:.1em;text-transform:uppercase;color:#5b6b82;padding-top:2px}.pg .hc dd{margin:0}.pg .hc dd.ok{color:#0a7a5c}.pg .hc dd.no{color:#c4303f}
.pg .rl{border:1px solid #d6e0ee;border-radius:10px;padding:0 0 9px;overflow:hidden;break-inside:avoid;font-family:var(--sans);font-size:11px;line-height:1.42;background:#fff}.pg .rl .fsvg{display:block;border-radius:0;width:100%}.pg .rl .in{padding:8px 12px 0}.pg .rl .in p{margin:0 0 4px}.pg .rl .in b.k{font-family:var(--mono);font-size:8.8px;letter-spacing:.1em;text-transform:uppercase;color:#5b6b82}.pg .rl .chip{display:inline-block;font-family:var(--mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:2px 8px;margin-bottom:5px;font-weight:700}.pg .rl .chip.d{background:#fde9ec;color:#c4303f}.pg .rl .chip.t{background:#fff1d6;color:#9a6200}
.pg .bkey{font-family:var(--sans);font-size:11px;line-height:1.5;background:#f4f7fc;border-radius:8px;padding:9px 13px;margin:6px 0 10px;color:#33445c}.pg .bkey b{color:var(--navy)}
.pg .sdiv{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#2f6fb5;margin:12px 0 2px;border-bottom:1px solid #cdd9ea;padding-bottom:3px}
.pg .bk .tg{display:inline-block;font-family:var(--mono);font-size:8px;letter-spacing:.1em;text-transform:uppercase;background:#fff1d6;color:#9a6200;border-radius:999px;padding:1px 7px;margin-left:6px;vertical-align:middle}
.pg .bk .facts{grid-column:1/-1;display:grid;grid-template-columns:1.1fr 1.2fr 1fr;gap:3px 16px;font-size:10.8px;line-height:1.4;color:#33445c}.pg .bk .facts b{display:block;font-family:var(--mono);font-size:8.6px;letter-spacing:.1em;text-transform:uppercase;color:#5b6b82;font-weight:700}
@media screen{.pg .hdchk{display:block}}
.pg .hdchk{font-family:var(--sans);font-size:11.5px;color:#9a6200;background:#fff6e5;border-left:4px solid #e09a00;padding:5px 10px;margin:4px 0 6px;border-radius:0 6px 6px 0;-webkit-print-color-adjust:exact}
@media screen{.pg .lsplit{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start}}
@media print{.pg .lsplit{display:grid;grid-template-columns:1.55fr 1fr;gap:14px;align-items:start}.pg .lside .rg{margin-top:6px}}
.pg .rg.col{grid-template-columns:1fr}.pg .lside .cnt{flex-wrap:wrap}.pg .lside .cnt div{flex:1 1 30%}
.pg .dsec.k{break-inside:avoid}.pg.desk figure{break-inside:avoid}
.pg .bk2 .tg{display:inline-block;font-family:var(--mono);font-size:8px;letter-spacing:.1em;text-transform:uppercase;background:#fff1d6;color:#9a6200;border-radius:999px;padding:1px 7px;margin-left:8px;vertical-align:middle}.pg .bk2 .facts .cot2 span>b{display:none}
.pg .bk2 .facts .cot2{display:block}.pg .bk2 .facts .cot2 small{display:inline;margin-left:4px}
@media print{.pg.p5 h2.sh{font-size:23px;margin:2px 0 6px}.pg.p1 h1.hd{font-size:40px;margin:0 0 8px}.pg.p1 .fiu p{font-size:11.9px;line-height:1.38}.pg.p1 .fiu>div{padding:7px 14px 4px 18px;margin:0 0 6px}.pg.p1 .map{margin:4px 0 0;padding-top:5px}.pg.p5 .rg{margin:6px 0 6px}.pg.p5 h3.ss{margin:8px 0 4px!important}.pg.p5 .box{margin:8px 0}.pg .rg{break-inside:avoid}.pg .stv{break-inside:avoid}}
@media (max-width:560px){.pg .rg{grid-template-columns:1fr}.pg .cnt{flex-wrap:wrap}.pg .hc dl{grid-template-columns:1fr}.pg .bk .facts{grid-template-columns:1fr}}
.pg .bk2{padding:6px 0 5px;border-top:1px solid #dfe6f1;break-inside:avoid;font-family:var(--sans);font-size:11.5px}.pg .bk2:first-of-type{border-top:0}.pg .bk2 .h{display:grid;grid-template-columns:200px 120px 1fr;gap:10px;align-items:center}.pg .bk2 .nm{display:flex;gap:9px;align-items:center}.pg .bk2 .nm b{font-size:15px;color:var(--navy)}.pg .bk2 .nm small{display:block;font-family:var(--mono);font-size:10.5px;color:#5b6b82}.pg .bk2 .mv{font-family:var(--mono);font-size:12px}.pg .bk2 .mv small{display:block;font-family:var(--sans);font-size:10.5px;color:#5b6b82;margin-top:1px}.pg .bk2 .s{margin:5px 0 4px}.pg .bk2 .s svg{display:block;max-width:100%;height:auto}.pg .bk2 .facts{display:grid;grid-template-columns:1.05fr 1.25fr 1fr;gap:3px 18px;font-size:11px;line-height:1.42;color:#33445c}.pg .bk2 .facts b{display:block;font-family:var(--mono);font-size:8.8px;letter-spacing:.1em;text-transform:uppercase;color:#5b6b82}.pg .bk2 .facts small{display:block;color:#6b7b92;font-size:10.2px}.pg .bk2 .facts .cot2{margin:0}.pg .bk2 .sy{margin:4px 0 0;font-size:11px;color:#4a5a70;border-left:3px solid #cdd9ea;padding-left:9px}
.pg .bk2 .shb{margin:4px 0 0;font-size:11px;line-height:1.45;color:#2b3b52}.pg .bk2 .shb b{color:#4a5a70}.pg .bk2 .shb small{display:block;font-size:10px;color:#6b7a90;margin-top:1px}.pg .bk2 .muted{color:#8a98ad}
@media (max-width:560px){.pg .bk2 .h{grid-template-columns:1fr}.pg .bk2 .facts{grid-template-columns:1fr}}

/* narrative cards: a currency in a few sentences, with its drivers and where it differs most from another */
.pg .cc2{border:1px solid #d6e0ee;border-radius:12px;overflow:hidden;margin:0 0 10px;break-inside:avoid;font-family:var(--sans);background:#fff}
.pg .cc2 .hd{display:flex;align-items:center;gap:12px;background:#0b1220;color:#e6eefb;padding:9px 14px;-webkit-print-color-adjust:exact}
.pg .cc2 .hd .nm{flex:1}.pg .cc2 .hd b{font-size:19px;letter-spacing:.02em;display:block;line-height:1.1}.pg .cc2 .hd small{font-size:10.5px;color:#8aa0bd}
.pg .cc2 .chip{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:3px 10px;border:1px solid #2b3d5c;color:#9db1cc;white-space:nowrap}
.pg .cc2 .chip.u{color:#19d3a0;border-color:#19d3a0}.pg .cc2 .chip.d{color:#ff8a9a;border-color:#ff5d73}
.pg .cc2 .sc{text-align:right;font-family:var(--mono)}.pg .cc2 .sc b{font-size:19px;color:#fff}.pg .cc2 .sc small{display:block;font-size:9.5px}
.pg .cc2 .bd{padding:9px 14px 8px}
.pg .cc2 p.syn{margin:0 0 7px;font-size:11.6px;line-height:1.5;color:#1b2a40;border-left:3px solid #e0b64a;padding-left:10px}
.pg .cc2 .dr{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0 0 6px}
.pg .cc2 .dr span,.pg .nar .dr span{display:block;border:1px solid #d6e0ee;border-radius:7px;padding:5px 8px;font-size:10.4px;line-height:1.35;color:#33445c;background:#f7f9fd}
.pg .cc2 .dr i,.pg .nar .dr i{display:block;font-style:normal;font-family:var(--mono);font-size:8.3px;letter-spacing:.1em;text-transform:uppercase;color:#7a52c9;margin-bottom:1px}
.pg .cc2 .gp{font-size:10.5px;line-height:1.4;color:#33445c;background:#f4f7fc;border-radius:7px;padding:5px 9px;margin:0 0 6px}.pg .cc2 .gp b{font-family:var(--mono);font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#5b6b82;display:block}
.pg .cc2 .cy{display:flex;gap:8px;align-items:center;font-size:10.4px;color:#5b6b82}.pg .cc2 .cy b{font-family:var(--mono);font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:#5b6b82}.pg .cc2 .cy em{font-style:normal;font-weight:700;color:#9a6200;border:1px solid #e0b64a;background:#fff6e0;border-radius:6px;padding:1px 8px}
.pg .cc2 .un{font-size:10px;color:#8a98ad;margin-top:3px}
.pg .nar{grid-column:1/-1;margin:5px 0 4px}.pg .nar p{margin:0 0 5px;font-size:11.2px;line-height:1.48;color:#1b2a40;border-left:3px solid #e0b64a;padding-left:9px}.pg .nar .dr{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.pg .nar .un{font-size:9.8px;color:#8a98ad;margin-top:3px}
@media (max-width:560px){.pg .cc2 .dr,.pg .nar .dr{grid-template-columns:1fr}.pg .cc2 .hd{flex-wrap:wrap}}

/* Data Desk: structured tables for what changed, the signal panel, the calendar, positioning and the bigger picture */
.pg .dsub{break-after:avoid;font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#2f6fb5;margin:12px 0 2px;font-weight:700}
.pg .kt{display:inline-block;font-family:var(--mono);font-size:8.6px;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:2px 8px;font-weight:700;white-space:nowrap}
.pg .kt.r{background:#fde9ec;color:#c4303f}.pg .kt.g{background:#e3f6ee;color:#0a7a5c}.pg .kt.b{background:#e9f0fb;color:#2f66bf}.pg .kt.a{background:#fff1d6;color:#9a6200}
.pg .lit{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:-1px;border:1.5px solid #9db1cc}.pg .lit.on{background:#e09a00;border-color:#e09a00}
.pg .rpn{display:flex;gap:10px;align-items:baseline;margin:2px 0 4px;font-family:var(--sans)}.pg .rpn b{font-family:var(--mono);font-size:26px;color:var(--navy)}.pg .rpn span{font-size:12px;color:#33445c}
.pg table.ft td.l b{color:var(--navy)}.pg table.ft td.g svg{display:block;width:150px;height:18px}.pg table.ft td.m{font-size:10.6px;color:#5b6b82}
`;

const N = x => (Number.isFinite(x) ? x : null);
/** Evidence-status labels: what kind of statement the figure or paragraph next to them is. */
export const EV = { observed: ['Observed data', 'Market prices and published figures, nothing modelled'], model: ['Model output', "The desk's own model, fitted on past data"], tested: ['Tested association', "A finding the desk's own pre-registered tests passed"], context: ['Context, not a signal', 'Shown for who is exposed; tested and found not to predict direction'], hyp: ['Hypothesis', 'An explanation consistent with the data and not established by it'], untested: ['Untested interpretation', 'A reading of the data that has not been tested on this market'] };
export const evBadge = k => `<span class="evb ${k}" title="${EV[k][1]}">${EV[k][0]}</span>`;
/** The terminal palette the charts are drawn in: deep navy panels with green and red for direction, amber for what did not hold, cyan for the series being read. */
const T = { bg: '#0b1220', panel: '#111c2f', grid: '#1c2a40', zero: '#5b7090', txt: '#8aa0bd', hi: '#e6eefb', up: '#19d3a0', down: '#ff5d73', amber: '#ffb020', cyan: '#4cc9f0' };
const asList = v => (Array.isArray(v) ? v : v ? [v] : []);

/** The three yield moves as lines in basis points since the window began: the 10-year, its real part, and its inflation part. Annotated at the ends. */
export function yieldDecompChart(S, H) {
  const nom = S?.us10y, real = S?.real, bei = S?.bei;
  if (!nom || !real || !bei || nom.length < 5) return '';
  const L = Math.min(nom.length, real.length, bei.length, 26), cut = s => s.slice(-L).map(v => v - s.slice(-L)[0]);
  const A = cut(nom), R = cut(real), B = cut(bei), W = 700, Ht = 262, left = 46, right = 206, top = 22, bot = 32;
  const all = [...A, ...R, ...B], lo = Math.min(0, ...all), hi = Math.max(0, ...all), span = Math.max(8, hi - lo), y0 = lo - span * 0.12, y1 = hi + span * 0.12;
  const X = i => left + i * (W - left - right) / (L - 1), Y = v => top + (1 - (v - y0) / (y1 - y0)) * (Ht - top - bot);
  const step = span > 60 ? 20 : span > 30 ? 10 : 5, ticks = []; for (let t = Math.ceil(y0 / step) * step; t <= y1; t += step) ticks.push(t);
  const P = s => s.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const ends = [['10-year yield', A, '#ffffff', 2.8], ['Real yield', R, T.cyan, 2.5], ['Expected inflation', B, T.amber, 2.5]];
  const lab = ends.map(([name, s, c]) => ({ name, v: s[L - 1], c, y: Y(s[L - 1]) })).sort((p, q) => p.y - q.y);
  for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 30) lab[i].y = lab[i - 1].y + 30;
  const sgn = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}bp`;
  const shareReal = A[L - 1] !== 0 ? Math.round(100 * R[L - 1] / A[L - 1]) : null;
  const area = `${P(A)} L${X(L - 1).toFixed(1)} ${Y(0).toFixed(1)} L${X(0).toFixed(1)} ${Y(0).toFixed(1)} Z`;
  return `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="The ten-year yield move split into the real yield and expected inflation over the last 20 days" class="fsvg fw" font-family="Consolas,'SF Mono',Menlo,monospace">`
    + `<rect width="${W}" height="${Ht}" rx="10" fill="${T.bg}"/><path d="${area}" fill="rgba(255,255,255,.05)"/>`
    + ticks.map(t => `<line x1="${left}" y1="${Y(t).toFixed(1)}" x2="${W - right}" y2="${Y(t).toFixed(1)}" stroke="${t === 0 ? T.zero : T.grid}" stroke-width="${t === 0 ? 1.2 : 1}"/><text x="${left - 7}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="${T.txt}">${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(t)}</text>`).join('')
    + `<text x="${left}" y="${Ht - 10}" font-size="10" fill="${T.txt}">20 DAYS AGO</text><text x="${W - right}" y="${Ht - 10}" text-anchor="end" font-size="10" fill="${T.txt}">LATEST</text><text x="${left - 7}" y="13" text-anchor="end" font-size="9.5" fill="${T.txt}">BP</text>`
    + ends.map(([, s, c, w]) => `<path d="${P(s)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(L - 1).toFixed(1)}" cy="${Y(s[L - 1]).toFixed(1)}" r="4.5" fill="${c}" stroke="${T.bg}" stroke-width="2"/>`).join('')
    + lab.map(l => `<text x="${W - right + 13}" y="${(l.y + 4).toFixed(1)}" font-size="12" font-weight="700" fill="${l.c}">${l.name.toUpperCase()} ${sgn(l.v)}</text>`).join('')
    + (shareReal != null && Math.abs(A[L - 1]) >= 5 ? `<text x="${left + 12}" y="${top + 8}" font-size="12" font-weight="700" fill="${T.cyan}">${shareReal}% OF THE ${Math.abs(Math.round(A[L - 1]))}BP MOVE IS THE REAL YIELD</text>` : '')
    + `</svg>`;
}

/** One broken relationship as a large annotated pair of lines, each in units of that market's own usual wobble so a yield and an index can share an axis. */
export function relationChart(l, S, H) {
  const sa = S?.[l.a.key], sb = S?.[l.b.key]; if (!sa || !sb || sa.length < 5 || sb.length < 5) return '';
  const L = Math.min(sa.length, sb.length, 26), floor = k => H.CHAIN_NODES[k]?.floor ?? 1, cut = s => s.slice(-L), nrm = (s, k) => cut(s).map(v => (v - cut(s)[0]) / floor(k));
  const A = nrm(sa, l.a.key), B = nrm(sb, l.b.key), W = 330, Ht = 172, left = 10, right = 98, top = 16, bot = 24, m = Math.max(1.5, ...A.map(Math.abs), ...B.map(Math.abs)) * 1.12;
  const X = i => left + i * (W - left - right) / (L - 1), Y = v => top + (1 - (v + m) / (2 * m)) * (Ht - top - bot);
  const P = s => s.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const la = { y: Y(A[L - 1]), t: l.a.label, mv: l.a.text, c: T.cyan }, lb = { y: Y(B[L - 1]), t: l.b.label, mv: l.b.text, c: T.amber };
  const arr = [la, lb].sort((p, q) => p.y - q.y); if (arr[1].y - arr[0].y < 34) arr[1].y = arr[0].y + 34; const spill = arr[1].y - (Ht - 30); if (spill > 0) { arr[0].y -= spill; arr[1].y -= spill; }
  const short = t => String(t).replace(/\s*\(.*\)/, '');
  return `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${H.esc(l.a.label)} and ${H.esc(l.b.label)} over 20 days" class="fsvg" font-family="Consolas,'SF Mono',Menlo,monospace">`
    + `<rect width="${W}" height="${Ht}" rx="10" fill="${T.bg}"/>`
    + `<line x1="${left}" y1="${Y(0)}" x2="${W - right}" y2="${Y(0)}" stroke="${T.zero}" stroke-width="1"/>`
    + `<line x1="${left}" y1="${Y(1).toFixed(1)}" x2="${W - right}" y2="${Y(1).toFixed(1)}" stroke="${T.grid}" stroke-dasharray="3 3"/><line x1="${left}" y1="${Y(-1).toFixed(1)}" x2="${W - right}" y2="${Y(-1).toFixed(1)}" stroke="${T.grid}" stroke-dasharray="3 3"/>`
    + `<text x="${left + 2}" y="${(Y(1) - 4).toFixed(1)}" font-size="8.5" fill="${T.txt}" stroke="${T.bg}" stroke-width="3" paint-order="stroke">ONE USUAL WOBBLE</text>`
    + `<path d="${P(A)}" fill="none" stroke="${la.c}" stroke-width="2.4" stroke-linejoin="round"/><path d="${P(B)}" fill="none" stroke="${lb.c}" stroke-width="2.4" stroke-linejoin="round"/>`
    + `<circle cx="${X(L - 1)}" cy="${Y(A[L - 1]).toFixed(1)}" r="4" fill="${la.c}" stroke="${T.bg}" stroke-width="2"/><circle cx="${X(L - 1)}" cy="${Y(B[L - 1]).toFixed(1)}" r="4" fill="${lb.c}" stroke="${T.bg}" stroke-width="2"/>`
    + arr.map(e => `<text x="${W - right + 11}" y="${(e.y - 2).toFixed(1)}" font-size="10" font-weight="700" fill="${e.c}">${H.esc(short(e.t)).toUpperCase().slice(0, 14)}</text><text x="${W - right + 11}" y="${(e.y + 11).toFixed(1)}" font-size="11" fill="${T.hi}">${H.esc(e.mv)}</text>`).join('')
    + `<text x="${left}" y="${Ht - 8}" font-size="9" fill="${T.txt}">20D AGO</text><text x="${W - right}" y="${Ht - 8}" text-anchor="end" font-size="9" fill="${T.txt}">LATEST</text></svg>`;
}

/** A horizontal bar figure on a dark panel: each row a market, the bar its move over the window (green up, red down), the value and today's move written beside it. rows: [{ label, v, sub }] */
export function barFigure(title, rows, H, { unit = '%', note = '' } = {}) {
  const R = (rows ?? []).filter(r => Number.isFinite(r.v)); if (!R.length) return '';
  const W = 660, row = 19, top = 30, left = 152, right = 190, Ht = top + R.length * row + 14, mx = Math.max(1, ...R.map(r => Math.abs(r.v))), zero = left + (W - left - right) / 2, half = (W - left - right) / 2;
  const f = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
  return `<figure><svg viewBox="0 0 ${W} ${Ht}" class="fsvg fw" role="img" aria-label="${H.esc(title)}" font-family="Consolas,'SF Mono',Menlo,monospace"><rect width="${W}" height="${Ht}" rx="10" fill="${T.bg}"/>`
    + `<text x="12" y="17" font-size="10.5" font-weight="700" fill="${T.hi}" letter-spacing="1">${H.esc(title.toUpperCase())}</text><line x1="${zero}" y1="${top - 6}" x2="${zero}" y2="${Ht - 8}" stroke="${T.zero}"/>`
    + R.map((r, i) => { const y = top + i * row, w = Math.max(1.5, Math.abs(r.v) / mx * half), x = r.v >= 0 ? zero : zero - w, c = r.v >= 0 ? T.up : T.down;
      return `<text x="12" y="${y + 12}" font-size="12" fill="${T.hi}">${H.esc(String(r.label).slice(0, 22))}</text><rect x="${x.toFixed(1)}" y="${y + 2}" width="${w.toFixed(1)}" height="12" rx="2" fill="${c}"/>${r.note ? `<text x="${r.v >= 0 ? zero - 8 : zero + 8}" y="${y + 12}" text-anchor="${r.v >= 0 ? 'end' : 'start'}" font-size="10" fill="${T.amber}">${H.esc(r.note)}</text>` : ''}<text x="${W - right + 14}" y="${y + 12}" font-size="12" font-weight="700" fill="${c}">${f(r.v)}${unit}</text><text x="${W - 12}" y="${y + 12}" text-anchor="end" font-size="10.5" fill="${T.txt}">${Number.isFinite(r.sub) ? f(r.sub, 2) + ' today' : ''}</text>`; }).join('')
    + `</svg>${note ? `<figcaption>${note}</figcaption>` : ''}</figure>`;
}

/** Commodity tiles on dark panels: name, price, the move, and a sparkline. items: [{ name, value, sub, tone, spark }] */
export function tileRow(items, H) {
  const sp = a => { if (!Array.isArray(a) || a.length < 3) return ''; const lo = Math.min(...a), hi = Math.max(...a), W = 120, Ht = 28, X = i => 2 + i * (W - 4) / (a.length - 1), Y = v => Ht - 3 - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (Ht - 6); return `<svg viewBox="0 0 ${W} ${Ht}" width="100%" height="28" aria-hidden="true"><path d="${a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${a.at(-1) >= a[0] ? T.up : T.down}" stroke-width="1.8" stroke-linejoin="round"/></svg>`; };
  return `<div class="tl6">${(items ?? []).map(t => `<div class="tl"><small>${H.esc(t.name)}</small><b>${H.esc(t.value)}</b><i class="${t.tone === 'up' ? 'up' : t.tone === 'dn' ? 'dn' : ''}">${H.esc(t.sub)}</i>${sp(t.spark)}</div>`).join('')}</div>`;
}

/** A flat editorial table: header row, then rows of cells (already escaped strings). Up and down values take a class from the sign. */
export function flatTable(head, rows, align = []) {
  const cl = i => (align[i] ?? (i ? 'r' : 'l')) === 'r' ? ' class="r"' : '';
  return `<table class="ft"><tr>${head.map((h, i) => `<th${cl(i)}>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((c, i) => `<td${cl(i)}>${c}</td>`).join('')}</tr>`).join('')}</table>`;
}

/** The evidence matrix: every distinct check as a row, every explanation as a column. A mark is a fact about the day's moves, not a weight. */
export function evidenceMatrix(theories, H) {
  const rows = []; for (const t of theories) for (const c of t.checks) if (!rows.includes(c.text)) rows.push(c.text);
  const cell = (t, text) => { const c = t.checks.find(x => x.text === text); return !c ? '<td class="n">·</td>' : c.ok === true ? '<td class="y">✓</td>' : c.ok === false ? '<td class="x">✗</td>' : '<td class="n">–</td>'; };
  return `<table class="em"><tr><th>What the day's moves show</th>${theories.map(t => `<th>${H.esc(t.name)}<span class="lb">${t.measurable ? `${t.agree} of ${t.measurable} agree` : 'not tested'}</span></th>`).join('')}</tr>${rows.map(r => `<tr><td>${H.esc(r)}</td>${theories.map(t => cell(t, r)).join('')}</tr>`).join('')}</table>`;
}

const NAME = { GOLD: 'Gold', NQ: 'Nasdaq', SPX500: 'S&P 500', US30: 'Dow', US2000: 'Russell 2000', DE30: 'DAX', UK100: 'FTSE 100', BTCUSD: 'Bitcoin', EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', AUDUSD: 'AUD/USD', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NZDUSD: 'NZD/USD' };

/** Last issue's forecast audit: each market's real day against the size the issue expected, with the half-to-one-and-a-half band shaded. */
export function auditChart(rows, H) {
  const R = (rows ?? []).filter(r => N(r.ratio) != null).sort((a, b) => b.ratio - a.ratio); if (R.length < 3) return '';
  const W = 640, row = 12, top = 24, left = 96, right = 44, Ht = top + R.length * row + 30, mx = Math.max(2, ...R.map(r => r.ratio)) * 1.05, X = v => left + v / mx * (W - left - right);
  return `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Each market's realised day as a multiple of the expected size" class="fsvg fw" font-family="Consolas,'SF Mono',Menlo,monospace">`
    + `<rect width="${W}" height="${Ht}" rx="10" fill="${T.bg}"/><rect x="${X(0.5)}" y="${top - 6}" width="${X(1.5) - X(0.5)}" height="${R.length * row + 8}" fill="rgba(25,211,160,.10)"/>`
    + [0, 0.5, 1, 1.5, 2].filter(t => t <= mx).map(t => `<line x1="${X(t)}" y1="${top - 6}" x2="${X(t)}" y2="${top + R.length * row + 2}" stroke="${t === 1 ? T.hi : T.grid}" stroke-width="${t === 1 ? 1.3 : 1}"/><text x="${X(t)}" y="${top - 11}" text-anchor="middle" font-size="10" fill="${T.txt}">${t}×</text>`).join('')
    + R.map((r, i) => { const y = top + i * row, out = r.ratio < 0.5 || r.ratio > 1.5; return `<text x="${left - 9}" y="${y + 11}" text-anchor="end" font-size="11" fill="${T.hi}">${H.esc(NAME[r.key] ?? r.key)}</text><rect x="${X(0)}" y="${y + 2}" width="${Math.max(2, X(r.ratio) - X(0))}" height="11" rx="2" fill="${out ? T.amber : T.cyan}"/><text x="${X(r.ratio) + 6}" y="${y + 11.5}" font-size="10.5" fill="${T.hi}">${r.ratio.toFixed(2)}×</text>`; }).join('')
    + `<text x="${X(1)}" y="${Ht - 9}" text-anchor="middle" font-size="9.5" fill="${T.txt}">1× = THE DAY WAS EXACTLY THE SIZE EXPECTED · GREEN BAND = HALF TO ONE-AND-A-HALF TIMES</text></svg>`;
}

/** The recurring accountability feature. record = { line, score, date, history, week }; eod = { hook, right, wrong } (the stored review of the last call).
 *  Two different things are scored and they are kept on separate halves of the page: the SIZE forecast (how big each market's day was against the range the issue printed)
 *  and the DIRECTIONAL read of the previous brief. They measure different things and must not be blended into one verdict. */
export function accountabilityPage(record, eod, H, ag = null) {
  const s = record?.score, wk = record?.week; if (!s && !wk && !eod?.hook) return '';
  const rows = s?.rows ?? [], out = rows.filter(r => r.ratio < 0.5 || r.ratio > 1.5), inBand = rows.length - out.length;
  const wide = out.filter(r => r.ratio > 1.5).map(r => `${NAME[r.key] ?? r.key} ${r.ratio.toFixed(1)}×`), quiet = out.filter(r => r.ratio < 0.5).map(r => `${NAME[r.key] ?? r.key} ${r.ratio.toFixed(1)}×`);
  const hist = (record?.history ?? []).slice(0, 6), nIssues = (record?.history ?? []).length;
  const stat = (v, l) => `<div class="num">${v}<small>${H.esc(l)}</small></div>`;
  const right = [wk && !s ? `${wk.withinShare}% of the ${wk.n} market-days this week landed inside half to one-and-a-half times the expected size.` : '', s ? `${inBand} of ${rows.length} markets landed inside half to one-and-a-half times the expected size.` : ''].filter(Boolean);
  const wrong = [out.length ? `${wide.length ? `Wider than expected: ${wide.join(', ')}. ` : ''}${quiet.length ? `Much quieter than expected: ${quiet.join(', ')}. ` : ''}` : (s ? 'No market landed outside the band.' : wk ? `${100 - wk.withinShare}% of market-days landed outside the band.` : '')].filter(Boolean);
  const calib = s ? `The median market came in at ${s.median}× the expected size and ${s.pastShare}% ran past it. A calibrated forecast has the median near 1× and about half running past.` : wk ? `Across the week the median was ${wk.median}× the expected size and ${wk.pastShare}% ran past it; a calibrated forecast has the median near 1× and about half running past.` : '';
  const sample = s ? `Sample: one issue and ${rows.length} markets. ${nIssues > 1 ? `${nIssues} scored issues are on record, which is still a short run.` : 'This is the only scored issue so far.'} One issue cannot show whether the forecast is biased; only a long record can, and this one is too short to say.` : wk ? `Sample: ${wk.days} daily issues and ${wk.n} market-days. A week is a short run and cannot show a bias on its own.` : '';
  return `<div class="pg"><div class="mh"><b>The Chain</b><span>The accountability page</span><span>${H.esc(record?.date ? 'Issue of ' + record.date : '')}</span></div>
<div class="kick">How we did</div><h2 class="sh" style="font-size:30px">${wk && !s ? "This week's calls, marked" : "Last issue's call, marked"}</h2>
<p class="sf acsf" style="font-size:14px">Two different things are scored here and they are kept apart. The size forecast says how big each market's day should be. The directional read is a separate test. A good score on one says nothing about the other.</p>
${s || wk ? `<h3 class="ss">${evBadge('model')}1. The size forecast against what happened</h3>
<p style="font-size:12.5px;margin:2px 0 6px;font-family:var(--sans)">Built from the sizes printed in that issue when it was written and the audit stored after the close. Nothing was re-estimated afterwards.</p>
${wk && !s ? `<div class="acctn">${stat(`${wk.withinShare}%`, `of ${wk.n} market-days inside the expected band`)}${stat(`${wk.median}×`, 'median against the expected size')}${stat(`${wk.pastShare}%`, 'ran past the expected size (about half is calibrated)')}</div>` : ''}${s ? `<div class="acctn">${stat(`${inBand} of ${rows.length}`, 'markets inside the expected band')}${stat(`${s.median}×`, 'median against the expected size')}${stat(`${s.pastShare}%`, 'ran past the expected size (about half is calibrated)')}</div>
<figure>${auditChart(rows, H)}<figcaption><b>Figure.</b> Each bar is one market: the real range divided by the range the issue expected. Amber bars landed outside half to one-and-a-half times.</figcaption></figure>` : ''}${guide(ag && { looking: ag.looking, matters: ag.matters, tells: ag.tells, unsure: ag.unsure }, H, 'sm')}
<p style="font-size:12.5px;line-height:1.5;margin:6px 0 8px;font-family:var(--sans)"><b style="color:#0f9f6e">Inside the band.</b> ${right.map(x => H.esc(x)).join(' ')} <b style="color:#d98a00">Outside it.</b> ${wrong.map(x => H.esc(x)).join(' ')}</p>
${hist.length > 2 ? `<table class="tx"><tr><th>Issue</th><th>Median vs expected</th><th>Ran past it</th><th>Inside the band</th></tr>${hist.map(h => `<tr><td>${H.esc(h.date)}</td><td>${h.median}×</td><td>${h.pastShare}%</td><td>${h.withinShare}%</td></tr>`).join('')}</table>` : ''}` : ''}
${eod?.hook ? `<h3 class="ss" style="margin-top:16px">${evBadge('model')}2. A separate test: the previous brief's directional read</h3>
<div class="box"><p>${H.esc(eod.hook)}</p>${asList(eod.right).length ? `<p><b>Right:</b> ${H.esc(asList(eod.right).slice(0, 3).join('; '))}</p>` : ''}${asList(eod.wrong).length ? `<p><b>Wrong:</b> ${H.esc(asList(eod.wrong).slice(0, 3).join('; '))}</p>` : ''}<p style="font-size:11.5px;color:#5b6b82">${H.esc(ag?.direction ?? "Scored on its own; it does not feed the size record. In the desk's tests, direction calls from price patterns are close to a coin flip, so a poor score here is expected and says nothing about the size forecast.")}</p></div>` : ''}
</div>`;
}

/** The reader's guide under a figure: what it is, why it matters, what it says today, and what is uncertain. Every part is optional. */
export function guide(gd, H, cls = '') {
  if (!gd) return '';
  const cell = (h, t) => (t ? `<div><b>${h}</b>${H.esc(t)}</div>` : '');
  const body = cell('What you are looking at', gd.looking) + cell('Why it matters', gd.matters) + cell('What it tells us', gd.tells);
  return body || gd.unsure ? `<div class="rg ${cls}">${body}${gd.unsure ? `<div class="u"><b>What is uncertain</b>${H.esc(gd.unsure)}</div>` : ''}</div>` : '';
}

/** Fact, interpretation, uncertainty: three kinds of statement, kept apart and coloured. */
export function threeVoices(iv, H) {
  const blk = (cls, label, arr) => (arr?.length ? `<div class="${cls}"><b class="v">${label}</b>${arr.map(t => `<p>${H.esc(t)}</p>`).join('')}</div>` : '');
  return `<div class="fiu">${blk('f', 'What the data shows', iv.fact)}${blk('i', 'What it might mean', iv.why)}${blk('x', 'What we cannot confirm', iv.unsure)}</div>`;
}

/** The count of links, from everything defined down to what was judged and what broke. */
export function countStrip(c) {
  const t = (cls, n, l) => `<div class="${cls}"><b>${n}</b><small>${l}</small></div>`;
  return `<div class="cnt">${t('', c.defined, 'links defined')}${t('', c.measurable, `measurable today${c.unmeasured ? `, ${c.unmeasured} lack data` : ''}`)}${t('q', c.quiet, 'quiet: an end barely moved')}${t('', c.judged, 'judged')}${t('g', c.holding, 'held')}${t('r', c.broken, 'broke')}</div>`;
}

/** The stress dashboard: the broad warnings against the narrower watched conditions, and what would change the reading. */
export function stressPanel(sr, H) {
  if (!sr) return '';
  const st = f => (f.state === 'on' ? '<span class="st on">ON</span>' : f.state === 'off' ? '<span class="st off">off</span>' : '<span class="st na">not measured</span>');
  return `<div class="stv"><b class="n">${sr.active}/${sr.measured}</b><div class="t">${H.esc(sr.verdict)}<small>${H.esc(sr.why)}</small></div></div>
<table class="fl"><tr><th>Broad warning</th><th>Reading now and the level that trips it</th><th>Status</th></tr>${sr.flags.map(f => `<tr><td><b>${H.esc(f.label)}</b></td><td>${H.esc(f.detail)}</td><td>${st(f)}</td></tr>`).join('')}</table>
<p style="font-family:var(--sans);font-size:12px;line-height:1.5;margin:4px 0">${H.esc([sr.split, sr.closest, sr.change, sr.na].filter(Boolean).join(' '))}</p>`;
}

const lcf = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
/** One explanation as a card of ordinary-language answers. t comes from buildTheories(). */
export function theoryCard(t, H) {
  const yes = t.checks.filter(c => c.ok === true).map(c => c.text), no = t.checks.filter(c => c.ok === false).map(c => c.text), nm = t.checks.filter(c => c.ok === null).map(c => c.text);
  const row = (k, v, cls = '') => (v ? `<dt>${k}</dt><dd${cls ? ` class="${cls}"` : ''}>${H.esc(v)}</dd>` : '');
  return `<div class="hc"><h3>${H.esc(t.name)}<span class="sc">${t.measurable ? `${t.agree} of ${t.measurable} checks agree` : 'not tested'}</span></h3><dl>`
    + row('In plain terms', t.plain || t.blurb)
    + row('If it were true we would see', t.checks.map(c => lcf(c.text)).join('; ') + '.')
    + row('What fits today', yes.length ? yes.join('; ') + '.' : 'Nothing measured agrees.', 'ok')
    + row('What does not fit', no.length ? no.join('; ') + '.' : '', 'no')
    + row('Not measured today', nm.length ? nm.join('; ') + '.' : '')
    + row('Other stories that look the same', t.alsoFits)
    + row('What would separate them', t.separate)
    + `</dl></div>`;
}

/** A currency as a narrative card: header with today's standing, a few sentences, three drivers, where it differs most from another currency, and its monetary cycle. */
export function currencyCard(nv, H, flag = '') {
  if (!nv) return '';
  const cls = nv.rank === 1 ? 'u' : nv.rank === nv.n ? 'd' : '';
  return `<div class="cc2"><div class="hd">${flag}<div class="nm"><b>${H.esc(nv.ccy)}</b><small>${H.esc(nv.name)}${nv.bank ? ` — ${H.esc(nv.bank)}` : ''}</small></div><span class="chip ${cls}">${H.esc(nv.state)}</span><div class="sc"><b>${nv.score > 0 ? '+' : nv.score < 0 ? '−' : ''}${Math.abs(nv.score).toFixed(2)}%</b><small>${nv.rank} of ${nv.n} today</small></div></div>`
    + `<div class="bd"><p class="syn">${H.esc(nv.synthesis)}</p>${nv.drivers.length ? `<div class="dr">${nv.drivers.map(d => `<span><i>${H.esc(d.tag)}</i>${H.esc(d.text)}</span>`).join('')}</div>` : ''}`
    + `${nv.pairs.length ? `<div class="gp"><b>Where it differs most from another currency today</b>${nv.pairs.map(p => H.esc(p.text)).join(' ')} A gap describes today's move; it is not a signal.</div>` : ''}`
    + `${nv.cycle ? `<div class="cy"><b>Monetary cycle</b><em>${H.esc(nv.cycle.label)}</em><span>${H.esc(nv.cycle.note)}</span></div>` : ''}${nv.uncertain.length ? `<div class="un">Not available: ${H.esc(nv.uncertain.join(' '))}</div>` : ''}</div></div>`;
}

/** A market's narrative: a few sentences and up to three drivers, placed under its strip. */
export function marketNarrative(pn, H) {
  if (!pn?.synthesis) return '';
  return `<div class="nar"><p>${H.esc(pn.synthesis)}</p>${pn.drivers.length ? `<div class="dr">${pn.drivers.map(d => `<span><i>${H.esc(d.tag)}</i>${H.esc(d.text)}</span>`).join('')}</div>` : ''}${pn.uncertain.length ? `<div class="un">${H.esc(pn.uncertain.join(' '))}</div>` : ''}</div>`;
}

/** Trim the empty band under a diagram: the viewBox ends 40 units below the lowest thing drawn. */
const cropSvg = s => String(s ?? '').replace(/viewBox="0 0 ([\d.]+) ([\d.]+)"/, (m, w, h) => { const bottoms = [...String(s).matchAll(/<rect[^>]* y="(-?[\d.]+)" width="[\d.]+" height="([\d.]+)"/g)].map(x => +x[1] + +x[2]); const mx = Math.max(0, ...bottoms); return mx > 0 && mx + 14 < +h ? `viewBox="0 0 ${w} ${Math.ceil(mx + 14)}"` : m; });

/** Compose the whole magazine page. All inputs are strings or plain data prepared by buildNewsletter. */
export function composeMagazine(c, H) {
  const { esc } = H, M = c.meta;
  const candles = '<svg class="logo" viewBox="0 0 28 22" width="26" height="20" aria-hidden="true"><g stroke-width="1.6" stroke-linecap="round"><line x1="5" y1="2" x2="5" y2="20" stroke="#19d3a0"/><rect x="2.5" y="7" width="5" height="9" rx="1" fill="#19d3a0" stroke="none"/><line x1="14" y1="1" x2="14" y2="17" stroke="#ff5d73"/><rect x="11.5" y="4" width="5" height="9" rx="1" fill="#ff5d73" stroke="none"/><line x1="23" y1="4" x2="23" y2="21" stroke="#ffb020"/><rect x="20.5" y="8" width="5" height="9" rx="1" fill="#ffb020" stroke="none"/></g></svg>';
  const mh = (sec) => `<div class="mh"><b>${candles}The Chain</b><span>${esc(sec)}</span><span>${esc(M.edition)}${M.tag ? ' · ' + esc(M.tag) : ''} · ${esc(M.date)}</span></div>`;
  const tape = (c.ticker ?? []).length ? `<div class="tape">${c.ticker.map(t => `<span>${esc(t.label)} <b>${esc(t.price)}</b> <i class="${t.chg >= 0 ? 'up' : 'dn'}">${t.chg >= 0 ? '▲' : '▼'} ${Math.abs(t.chg).toFixed(2)}%</i></span>`).join('')}</div>` : '';
  const paras = (arr, lead = true) => (arr ?? []).filter(Boolean).map((p, i) => `<p${i === 0 && lead ? ' class="lead"' : ''}>${p.head ? `<b>${esc(p.head)}</b> ` : ''}${esc(typeof p === 'string' ? p : p.text)}</p>`).join('');
  const feature = c.feature;
  // page 1: the situation in plain terms, before any analysis
  const p1 = `<div class="pg p1">${mh('The story')}${tape}
${c.today ? `<div class="kick">${esc(c.today.kicker)} · ${esc(M.regime)} regime</div><h1 class="hd">${esc(c.today.headline)}</h1>
${c.today.lede ? `<p class="ld">${esc(c.today.lede)}</p>` : ''}${c.today.note ? `<p class="small3">${esc(c.today.note)}</p>` : ''}${c.today.sheet?.length ? `<div class="dsh"><div class="dh">On the clock · UK time</div>${c.today.sheet.map(r => `<div class="dr"><span class="dsw">${esc(r.when)}</span><span class="dsn"><b>${esc(r.name)}</b>${r.detail ? ` <i>${esc(r.detail)}</i>` : ''}</span></div>`).join('')}</div>` : ''}${c.today.board?.length ? `<div class="brd">${c.today.board.map(b => `<div><small>${esc(b.label)}</small><b>${esc(b.value)}</b><em>${esc(b.move)}</em></div>`).join('')}</div>` : ''}
<p class="mo"><span class="sfl">${esc(c.today.story ?? 'The month in one line')}</span><b>${esc(feature.headline)}</b>${feature.standfirst ? ' ' + esc(feature.standfirst) : ''}</p>` : `<div class="kick">${esc(M.regime)} regime · the investigation</div><h1 class="hd">${esc(feature.headline)}</h1>${feature.standfirst ? `<p class="sf"><span class="sfl">The desk's reading</span>${esc(feature.standfirst)}</p>` : ''}`}
<p class="by">By The Chain research desk · ${esc(M.date)}</p>
<div class="split"${c.v3 ? ' style="display:block"' : ''}><div>${c.intro && !c.v3 ? threeVoices(c.intro, H) : ''}
<p class="map"><b>How the issue builds.</b> ${c.v3 ? 'Today by level: the global backdrop, the currencies, then pair by pair · the 20-day backdrop · Stress and data checks · the Data Desk' : '1 What happened · 2 Why it might be happening · 3 How markets connect · 4 What broke · 5 Stress and data checks · 6 Competing explanations · 7 What does not fit · 8 The scorecard · the Data Desk'}</p>
<p class="evkey" style="margin-top:6px"><span>LABELS</span>${evBadge('observed')}${evBadge('model')}${evBadge('tested')}${evBadge('context')}${evBadge('hyp')}${evBadge('untested')}</p></div>
${c.v3 ? `<p class="g3"><b>${esc(c.glance.broken)}</b> of ${esc(c.glance.testable)} chain links broken over 20 days · <b>${esc(c.glance.stress)}</b> broad stress warnings${c.glance.next ? ` · Next: <b>${esc(c.glance.next)}</b>` : ''}</p>` : `<aside class="side"><h4>At a glance</h4><span class="big">${esc(c.glance.broken)}<small>chain links broken of ${esc(c.glance.testable)} judged</small></span>${c.glance.next ? `<p><b>Next:</b> ${esc(c.glance.next)}</p>` : ''}<h4 style="margin-top:14px">Two kinds of alarm</h4>${c.alarms}${(c.checks ?? []).some(k => k.id === 'dollar') ? '<p class="chk"><b>Check:</b> the dollar links use an index that ends days before the rest. See the data check in Exhibit 5.</p>' : ''}</aside>`}</div></div>`;
  // page 2: what happened, the first piece of evidence
  const p2 = c.yieldFig ? `<div class="pg">${mh('What happened')}
<div class="kick">Exhibit 1 · what happened</div><h2 class="sh">What the fall in yields is made of</h2>
<figure>${c.yieldFig}<figcaption>${evBadge('observed')}<b>Figure 1.</b> Moves in basis points over the last 20 days. ${esc(c.yieldCaption)}</figcaption></figure>
${guide(c.yieldGuide, H)}
${c.textbook ? `<div class="keep"><h3 class="ss">Textbook against today</h3><p class="evl">${evBadge('hyp')}<span style="font:11px var(--sans);color:#5b6b82">The right-hand column is observed; the reading of it is not established.</span></p>${c.textbook}</div>` : ''}</div>` : '';
  // page 3: the desk's reading of why
  const p3 = ((feature.opening ?? []).length || (feature.evidence ?? []).length) ? `<div class="pg">${mh("The desk's reading")}
<div class="kick">Exhibit 2 · why it might be happening</div><h2 class="sh">The desk's reading of the story</h2>
<p class="evl">${evBadge('hyp')}<span style="font:11px var(--sans);color:#5b6b82">The desk's written interpretation of the figures. It is argued from the data and set against its counter-arguments in Exhibit 6.</span></p>
<div class="cols">${paras(feature.opening)}${feature.pull ? `<div class="pq">“${esc(feature.pull)}”<small>The desk's reading, set against its counter-arguments in Exhibit 6</small></div>` : ''}${paras(feature.continued, false)}${paras(feature.evidence, false)}</div></div>` : '';
  // page 4: the signature spread, landscape in print
  const p4 = c.chainFig ? `<div class="pg land">${mh('The chain of impact')}
<div class="kick">Exhibit 3 · how markets are connected</div><h2 class="sh">Where the textbook is not working</h2>
<figure class="chain-fig">${cropSvg(c.chainFig)}<figcaption>${evBadge('observed')}<b>Figure 2.</b> Each box is a market; each arrow a textbook link from cause to effect, judged on the last 20 days at both ends. Green flows the textbook way, grey has an end inside its noise floor, orange did not hold. Numbered markers are the broken links, drawn on the next page.</figcaption></figure>${c.chainGuide ? countStrip(c.chainGuide.c) : ''}${guide(c.chainGuide && { looking: c.chainGuide.looking, matters: c.chainGuide.matters, tells: c.chainGuide.tells, unsure: c.chainGuide.unsure }, H, 'sm')}</div>` : '';
  // page 5: the broken relationships, drawn and explained
  const p5 = c.relationFigs ? `<div class="pg">${mh('The evidence')}
<div class="kick">Exhibit 4 · what did not hold</div><h2 class="sh">The relationships that did not hold</h2>
<p class="sf" style="font-size:14px">${esc(c.relationLead)}</p>
<div class="fig2">${c.relationFigs}</div>${c.chainMethod ? `<div class="box"><h4>How the chain was built</h4>${c.chainGuide ? `<p><b>How the numbers reconcile.</b> ${esc(c.chainGuide.counts)}</p>` : ''}${c.chainMethod}</div>` : ''}</div>` : '';
  // page 6: is it stress, and can we trust the comparison
  const p6 = (c.stress || (c.checks ?? []).length) ? `<div class="pg">${mh('Stress and data checks')}
<div class="kick">Exhibit 5 · is this stress, and can we trust the comparison</div><h2 class="sh">Isolated warning signs, or a broad stress event?</h2>
${c.stress ? `<p class="evl">${evBadge('model')}<span style="font:11px var(--sans);color:#5b6b82">The broad warnings are fixed rules in the desk's own dashboard. The watched conditions are narrower.</span></p>${stressPanel(c.stress, H)}` : ''}
${(c.checks ?? []).length ? `<div class="box warn"><h4>Data checks: what could not be reconciled</h4>${c.checks.map(k => `<p><b>${esc(k.title)}.</b> ${esc(k.body)}</p>`).join('')}</div>` : ''}</div>` : '';
  const p9in = (c.watch || c.theoryCaution || (c.notFit ?? []).length) ? `
${(c.notFit ?? []).length ? `<h2 class="sh">What none of the stories explain</h2><div class="box warn" style="margin-top:6px"><ul class="lst" style="margin:0">${c.notFit.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
${c.theoryCaution ? `<div class="box"><h4>How to hold the four readings</h4><p>${esc(c.theoryCaution)}</p></div>` : ''}
${c.watch ? `<div class="kick" style="margin-top:14px">The next test</div><h2 class="sh">What would change the story</h2><div class="two">${c.watch}</div>` : ''}${M.edition === 'Weekly' ? '' : c.aheadHtml}` : '';
  // page 7: competing explanations, the matrix and how to read the count
  const p7 = c.theoriesData?.length ? `<div class="pg p5">${mh('Competing explanations')}
<div class="kick">Exhibit 6 · hypotheses, not conclusions</div><h2 class="sh">Four ways to read the same move</h2>
<p class="sf" style="font-size:14px">${esc(c.theoryLead)}</p>
<figure>${c.matrix}<figcaption><b>Figure 3.</b> ✓ the day's moves agree with the check, ✗ they do not, · the check does not apply to that story. Counts are agreeing checks, not probabilities or independent proof.</figcaption></figure>
<div class="rg"><div><b>What the count measures</b>${esc('How many of the checks we could run agree with a story. "4 of 4" means every check we ran fits it.')}</div><div><b>What it does not mean</b>${esc('It is not the chance the story is true. Several stories can fit every check, the checks overlap, and a story that fits can still be wrong.')}</div><div><b>How to use it</b>${esc('Read the counter-arguments as seriously as the count. The question is what evidence would separate the stories, listed under each one.')}</div></div>
<h3 class="ss" style="margin:12px 0 6px">What each explanation says, and what would tell them apart</h3>${c.theoriesData.map(t => theoryCard(t, H)).join('')}${p9in ? `<div class="kick" style="margin-top:16px">Exhibit 7 · what does not fit and what to watch</div>${p9in}` : ''}</div>` : '';
  const p8 = '';
  // page 9: what does not fit, what to watch
  const p9 = c.theoriesData?.length ? '' : (p9in ? `<div class="pg">${mh('What to watch')}${p9in}</div>` : '');
  const pAhead = M.edition === 'Weekly' && (c.aheadHtml || c.weekRanges) ? `<div class="pg">${mh('The week ahead')}${c.aheadHtml}${c.weekRanges ?? ''}</div>` : '';
  const pAcc = c.accountability;
  // data desk
  const desk = `<div class="pg desk"><div class="deskhd">${tape}<div class="kick">The Data Desk</div><h2>Market monitor and reference</h2><p>Everything behind the story. Each section opens with what to notice, why it matters and whether it supports or challenges the main story.</p></div>${c.desk}</div>`;
  const back = (c.qod || c.refs) ? `<div class="pg">${mh('Back page')}${c.qod ?? ''}${c.refs ?? ''}</div>` : '';
  if (c.v3 && c.v3t) {
    const t = c.v3t, bd = p4 ? p4.replace('Exhibit 3 · how markets are connected', 'The 20-day backdrop · how markets are connected') : '';
    const pT = `<div class="pg">${mh('Today by level')}<div class="kick">The state of the levels today</div><h2 class="sh">The backdrop: rates, credit, fear and the dollar</h2>${t.globalHtml}<h2 class="sh" style="margin-top:18px">The currencies</h2>${t.countryHtml}</div>`;
    const pW = t.worldHtml ? `<div class="pg">${mh('The economies')}<div class="kick">The economies behind the currency scores</div><h2 class="sh">Growth, prices, jobs and spending, side by side</h2>${t.worldHtml}</div>` : '';
    const pP = t.pairsHtml ? `<div class="pg">${mh('Pair by pair')}<div class="kick">Pair by pair, today</div><h2 class="sh">Where each market stands this morning</h2>${t.pairsHtml}</div>` : '';
    const pR = c.aheadHtml ? `<div class="pg">${mh('Releases to come')}<div class="kick">Still to come</div><h2 class="sh">The releases that can move the day</h2>${c.aheadHtml}</div>` : '';
    return `<div class="mg">${p1}${pT}${pW}${pP}${p2}${pR}${bd}${p6}${desk}${back}</div>`;
  }
  return `<div class="mg">${p1}${p2}${p3}${p4}${p5}${p6}${p7}${p8}${p9}${pAhead}${pAcc}${desk}${back}</div>`;
}
