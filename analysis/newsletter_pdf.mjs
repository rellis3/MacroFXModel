// Print a saved newsletter page to PDF the way a browser's "Save as PDF" does, using headless Chrome and the page's own print CSS (@page, page breaks).
//   node analysis/newsletter_pdf.mjs <issue.html> <out.pdf>
// The newsletter is a self-contained HTML file, so this needs nothing but Chrome. The magazine edition sets A4 portrait pages and one landscape spread for the chain.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const [, , inp, out] = process.argv;
if (!inp || !out) { console.error('usage: node analysis/newsletter_pdf.mjs <issue.html> <out.pdf>'); process.exit(2); }
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p));
if (!chrome) { console.error('Chrome not found: set CHROME to its path'); process.exit(3); }
const r = spawnSync(chrome, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${resolve(out)}`, 'file:///' + resolve(inp).replace(/\\/g, '/')], { stdio: 'ignore', timeout: 180000 });
if (r.status !== 0 || !existsSync(out)) { console.error('PDF was not written'); process.exit(1); }
console.log('wrote', resolve(out));
