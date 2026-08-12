// js/fomcDiff.js — word-level redline diff between two FOMC statements.
//
// Statement-to-statement wording changes ARE the signal — the Fed edits a
// template paragraph-by-paragraph each meeting, and traders read the deltas
// ("transitory" → "persistent") as the real hawkish/dovish tell, often more
// than the headline decision itself. Pure function, no I/O — tokenize +
// classic LCS diff (statements run ~300-600 words, so an O(n*m) DP table is
// cheap; no need for a diff library).

// Split on whitespace, keeping punctuation attached to its word (so "goal."
// and "goal" are treated as different tokens on purpose — a trailing period
// change is noise, but this stays simple and the UI re-joins with spaces
// anyway, so a punctuation-only "change" just renders as a same-looking word).
function tokenize(text) {
  return text.split(/\s+/).filter(Boolean);
}

// Returns [{type:'same'|'add'|'del', text}], where 'del' segments come from
// `prevText` (shown struck-through) and 'add'/'same' come from `text`.
export function wordDiff(prevText, text) {
  const a = tokenize(prevText || '');
  const b = tokenize(text || '');
  const n = a.length, m = b.length;

  // LCS length table.
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Walk the table to emit same/del/add runs, then coalesce consecutive
  // same-type tokens into single segments for a cleaner render.
  const raw = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { raw.push({ type: 'same', text: b[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { raw.push({ type: 'del', text: a[i] }); i++; }
    else { raw.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < n) { raw.push({ type: 'del', text: a[i++] }); }
  while (j < m) { raw.push({ type: 'add', text: b[j++] }); }

  const segments = [];
  for (const tok of raw) {
    const last = segments.at(-1);
    if (last && last.type === tok.type) last.text += ' ' + tok.text;
    else segments.push({ type: tok.type, text: tok.text });
  }

  const unchanged = raw.filter(t => t.type === 'same').length;
  const changed = raw.length - unchanged;
  return {
    segments,
    stats: {
      prevWords: n, words: m,
      unchanged, added: raw.filter(t => t.type === 'add').length, removed: raw.filter(t => t.type === 'del').length,
      changeRatio: raw.length ? +(changed / raw.length).toFixed(3) : 0,
    },
  };
}

// Structured cell-level diff for SEP-style tables (js/fomcFetch.js's
// extractTables output — array of tables, each an array of rows, each row's
// first cell a label). A word-diff on the markdown rendering would work but
// loses row/column identity where it matters most: SEP year columns ROLL
// FORWARD every meeting (this meeting's "2027" column sits at a different
// index than last meeting's "2027" column), so columns are matched by their
// HEADER TEXT, not position — the one thing a positional diff would get
// wrong on exactly the data where it matters most.
export function diffTables(prevTables, curTables) {
  const lines = [];
  const n = Math.max(prevTables.length, curTables.length);
  for (let t = 0; t < n; t++) {
    const prevRows = prevTables[t] || [];
    const curRows = curTables[t] || [];
    const prevHeader = prevRows[0] || [];
    const curHeader = curRows[0] || [];
    const prevByLabel = new Map(prevRows.slice(1).map(r => [r[0], r]));
    for (const row of curRows.slice(1)) {
      const label = row[0];
      const prevRow = prevByLabel.get(label);
      if (!prevRow) { lines.push(`Table ${t + 1}: NEW ROW "${label}" = ${row.slice(1).join(', ')}`); continue; }
      for (let c = 1; c < row.length; c++) {
        const curCol = curHeader[c] ?? `col${c}`;
        const prevIdx = prevHeader.indexOf(curCol);
        const prevVal = prevIdx >= 0 ? prevRow[prevIdx] : undefined;
        const curVal = row[c];
        if (prevIdx < 0) { if (curVal) lines.push(`Table ${t + 1} "${label}" — new column "${curCol}": ${curVal}`); }
        else if (prevVal !== curVal) lines.push(`Table ${t + 1} "${label}" (${curCol}): ${prevVal} → ${curVal}`);
      }
    }
  }
  return lines;
}

// Plain-text summary of just the changed spans (add/del segments with >=1
// word), for feeding the sentiment prompt without the full statement twice —
// "REMOVED: 'growth has slowed' / ADDED: 'growth has moderated'" style lines.
export function diffToPromptLines(diffResult, minWords = 1) {
  const lines = [];
  for (const seg of diffResult.segments) {
    if (seg.type === 'same') continue;
    if (seg.text.split(/\s+/).length < minWords) continue;
    lines.push(`${seg.type === 'add' ? 'ADDED' : 'REMOVED'}: "${seg.text}"`);
  }
  return lines;
}
