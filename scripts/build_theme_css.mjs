// Writes js/terminal/themes.css from js/terminal/themes.js (the single source of the Desk Terminal's colour themes).
//   node scripts/build_theme_css.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { themesCssText } from '../js/terminal/themes.js';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'terminal', 'themes.css');
fs.writeFileSync(out, themesCssText());
console.log('wrote', out);
