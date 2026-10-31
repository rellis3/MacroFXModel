let seed = 20260923;
const rnd = () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mean = x => x.reduce((s, v) => s + v, 0) / x.length;
const drawBlock = (x, block) => { const n = x.length, nb = Math.ceil(n / block), s = []; for (let q = 0; q < nb; q++) { const st = Math.floor(rnd() * (n - block + 1)); for (let i = 0; i < block && s.length < n; i++) s.push(x[st + i]); } return s; };
for (const n of [7, 9, 14]) { const a = Array.from({length:n}, (_, i) => i * 0.1 + Math.sin(i)); const ms = new Set(); for (let k=0;k<1000;k++) ms.add(mean(drawBlock(a, Math.min(10, n))).toFixed(6)); console.log(`n=${n}: distinct bootstrap means of the firing arm over 1000 reps = ${ms.size}`); }
