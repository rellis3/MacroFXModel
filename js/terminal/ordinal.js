// js/terminal/ordinal.js: one ordinal for every percentile on the terminal ("1st", "52nd", "83rd", "41st"; was a hard-coded "th": "41th", "1th").
// A value that is not a number (a '–' placeholder) comes back as it was.
export const ordinal = v => {
  const n = Number(v); if (v == null || v === '' || !Number.isFinite(n)) return v == null ? '–' : String(v);
  const r = Math.round(n), k = Math.abs(r) % 100, j = k % 10;
  return `${r}${k >= 11 && k <= 13 ? 'th' : j === 1 ? 'st' : j === 2 ? 'nd' : j === 3 ? 'rd' : 'th'}`;
};
