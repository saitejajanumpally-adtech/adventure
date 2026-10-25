export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function yesterdayKey(d = new Date()) {
  const y = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  return dateKey(y);
}

export const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Prefer items the player has not seen recently, then fill from seen ones.
export function pickItems(items, n, seenIds = [], rnd = Math.random) {
  const seen = new Set(seenIds);
  const fresh = shuffle(items.filter((x) => !seen.has(x.id)), rnd);
  const old = shuffle(items.filter((x) => seen.has(x.id)), rnd);
  return fresh.concat(old).slice(0, n);
}

/* Monday of the week that contains d, as YYYY-MM-DD. */
export function weekKey(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = (m.getDay() + 6) % 7; // Monday = 0
  m.setDate(m.getDate() - back);
  return dateKey(m);
}
/* 0 = Monday ... 6 = Sunday */
export function weekdayIndex(d = new Date()) { return (d.getDay() + 6) % 7; }
