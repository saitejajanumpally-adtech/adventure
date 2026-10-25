import { shuffle } from './util.js';

const clean = (w) => String(w || '').toUpperCase().replace(/[^A-Z]/g, '');

function tryLayout(order) {
  const cells = new Map(); // "r,c" -> {ch, dirs:Set}
  const placed = [];
  const key = (r, c) => `${r},${c}`;
  const get = (r, c) => cells.get(key(r, c));

  function fits(word, r0, c0, dir) {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    const br = r0 - dr, bc = c0 - dc, ar = r0 + dr * word.length, ac = c0 + dc * word.length;
    if (get(br, bc) || get(ar, ac)) return -1;
    let crosses = 0;
    for (let k = 0; k < word.length; k++) {
      const r = r0 + dr * k, c = c0 + dc * k;
      const cell = get(r, c);
      if (cell) {
        if (cell.ch !== word[k] || cell.dirs.has(dir)) return -1;
        crosses++;
      } else {
        const n1 = dir === 'across' ? get(r - 1, c) : get(r, c - 1);
        const n2 = dir === 'across' ? get(r + 1, c) : get(r, c + 1);
        if (n1 || n2) return -1;
      }
    }
    return crosses;
  }

  function put(entry, r0, c0, dir) {
    const dr = dir === 'down' ? 1 : 0, dc = dir === 'across' ? 1 : 0;
    for (let k = 0; k < entry.answer.length; k++) {
      const r = r0 + dr * k, c = c0 + dc * k;
      const cell = get(r, c) || { ch: entry.answer[k], dirs: new Set() };
      cell.dirs.add(dir);
      cells.set(key(r, c), cell);
    }
    placed.push({ ...entry, r: r0, c: c0, dir });
  }

  put(order[0], 0, 0, 'across');
  for (let i = 1; i < order.length; i++) {
    const entry = order[i];
    let best = null;
    for (const p of placed) {
      const dir = p.dir === 'across' ? 'down' : 'across';
      for (let a = 0; a < p.answer.length; a++) {
        for (let b = 0; b < entry.answer.length; b++) {
          if (p.answer[a] !== entry.answer[b]) continue;
          const r0 = dir === 'down' ? p.r + (p.dir === 'across' ? 0 : a) - b : p.r + a;
          const c0 = dir === 'across' ? p.c + (p.dir === 'down' ? 0 : a) - b : p.c + a;
          // crossing cell is on p at index a
          const rr = p.dir === 'across' ? p.r : p.r + a;
          const cc = p.dir === 'across' ? p.c + a : p.c;
          const sr = dir === 'down' ? rr - b : rr;
          const sc = dir === 'across' ? cc - b : cc;
          const score = fits(entry.answer, sr, sc, dir);
          if (score >= 1 && (!best || score > best.score)) best = { sr, sc, dir, score };
        }
      }
    }
    if (best) put(entry, best.sr, best.sc, best.dir);
  }
  return { placed, cells };
}

function area(lay) {
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const k of lay.cells.keys()) {
    const [r, c] = k.split(',').map(Number);
    minR = Math.min(minR, r); minC = Math.min(minC, c); maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
  }
  const w = maxC - minC + 1, hh = maxR - minR + 1;
  return (w > 15 ? 1e6 : 0) + Math.max(w, hh) * 1000 + w * hh; // prefer compact grids, and keep them narrow enough for phones
}

export function generateGrid(words, tries = 300) {
  const entries = words
    .map((w) => ({ answer: clean(w.answer), clue: String(w.clue || '') }))
    .filter((w) => w.answer.length >= 3 && w.answer.length <= 14 && w.clue);
  if (entries.length < 2) return null;
  let best = null;
  for (let t = 0; t < tries; t++) {
    const sorted = entries.slice().sort((a, b) => b.answer.length - a.answer.length);
    const order = t === 0 ? sorted : [sorted[0], ...shuffle(sorted.slice(1))];
    const lay = tryLayout(order);
    lay.size = area(lay);
    if (!best || lay.placed.length > best.placed.length ||
        (lay.placed.length === best.placed.length && lay.size < best.size)) best = lay;
  }
  if (best.placed.length < 4) return null;

  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const k of best.cells.keys()) {
    const [r, c] = k.split(',').map(Number);
    minR = Math.min(minR, r); minC = Math.min(minC, c); maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
  }
  const rows = maxR - minR + 1, cols = maxC - minC + 1;
  const placed = best.placed.map((p) => ({ ...p, r: p.r - minR, c: p.c - minC }));
  const letters = Array.from({ length: rows }, () => Array(cols).fill(''));
  for (const p of placed) {
    for (let k = 0; k < p.answer.length; k++) {
      const r = p.r + (p.dir === 'down' ? k : 0), c = p.c + (p.dir === 'across' ? k : 0);
      letters[r][c] = p.answer[k];
    }
  }
  // number starts in reading order
  const starts = [...new Set(placed.map((p) => `${p.r},${p.c}`))]
    .map((s) => s.split(',').map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const numOf = new Map(starts.map((s, i) => [`${s[0]},${s[1]}`, i + 1]));
  const entriesOut = placed.map((p) => ({ ...p, n: numOf.get(`${p.r},${p.c}`) }))
    .sort((a, b) => a.n - b.n);
  return { rows, cols, letters, entries: entriesOut, dropped: entries.length - placed.length };
}
