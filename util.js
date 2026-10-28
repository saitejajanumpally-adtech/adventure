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

/* Device type and browser name from the user agent, for feedback. Nothing else is read. */
export function parseDevice(ua = '', width = 0) {
  const u = String(ua);
  const device = /iPad|Tablet|PlayBook|Silk/i.test(u) || (/Android/i.test(u) && !/Mobile/i.test(u)) ? 'Tablet'
    : /Mobi|iPhone|iPod|Android/i.test(u) ? 'Phone' : 'Laptop or desktop';
  const browser = /Edg\//.test(u) ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Other';
  return { device, browser, width };
}

/* The slider range for a Number sense puzzle. The answer must never sit in the middle, because that would give it away.
   So the far end is placed at about 1.3 to 1.6 times, or 2.6 to 4 times, the answer. The same puzzle always gets the same range. */
export function numberRange(it) {
  const min = Number(it.min), answer = Number(it.answer);
  if (!(answer > min)) return { min, max: Number(it.max) };
  let hsh = 0;
  for (const c of String(it.id || it.q)) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  const f = hsh % 2 ? 1.3 + ((hsh >>> 1) % 31) / 100 : 2.6 + ((hsh >>> 1) % 141) / 100;
  const step = Number(it.step) > 0 ? Number(it.step) : (Number(it.max) - min) / 100;
  const max = min + Math.ceil(((answer - min) * f) / step) * step;
  return { min, max: Math.round(Math.max(max, answer + step) * 1e6) / 1e6 };
}

