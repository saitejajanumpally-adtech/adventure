import { PETS } from './data.js';

/* Text is always set as text, never as HTML. */
export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
};
export const ic = (n, cls = '') => h('i', { class: `ti ti-${n} ${cls}`.trim(), 'aria-hidden': 'true' });
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
export const petById = (id) => PETS.find((p) => p.id === id) || PETS[1];

export function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let toastTimer;
export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2800);
}

/* ---------- pet pictures ----------
   Each pet has these moods as real pictures in /pets (petname-mood.webp). Other mood names map to the closest real one. */
export const PET_MOODS = ['hello', 'explain', 'celebrate', 'happy', 'correct', 'oops', 'encourage', 'proud', 'sleepy'];
const MOOD_ALIAS = { think: 'explain', streak: 'celebrate', hurt: 'oops' };
const realMood = (m) => (PET_MOODS.includes(m) ? m : MOOD_ALIAS[m] || 'happy');

const loads = new Map(); // picture address -> promise of true/false
const loadUrl = (url) => {
  if (!loads.has(url)) loads.set(url, new Promise((done) => { const i = new Image(); i.onload = () => done(true); i.onerror = () => done(false); i.src = url; }));
  return loads.get(url);
};
const found = new Map(); // "pet|mood" -> promise of the address of a picture that really loads, or null
function pictureFor(petId, mood) {
  const key = `${petId}|${mood}`;
  if (!found.has(key)) {
    const tries = [...new Set([realMood(mood), 'happy', 'hello'])].flatMap((m) => [`pets/${petId}-${m}.webp`, `pets/${petId}-${m}.png`]);
    found.set(key, (async () => { for (const u of tries) if (await loadUrl(u)) return u; return null; })());
  }
  return found.get(key);
}

/* Loads pictures in order of need: "first" (the page waits for these, but never longer than 2 seconds),
   then "then", then "later" a few at a time in the background. Returns a promise for the first step. */
export function preloadPets({ first = [], then = [], later = [] } = {}) {
  const run = (list) => Promise.all(list.map(([p, m]) => pictureFor(p, m)));
  const firstDone = run(first);
  firstDone.then(() => run(then)).then(async () => {
    for (let i = 0; i < later.length; i += 4) await run(later.slice(i, i + 4));
  }).catch(() => {});
  return Promise.race([firstDone, new Promise((r) => setTimeout(r, 2000))]);
}

/* Pet picture. Shows the emoji until the picture is ready. figure.setMood('oops') swaps the picture in place,
   so a pet that stays on screen (the coach) never flickers or reloads. */
export function petFigure(petId, mood = 'happy', size = 'md') {
  const pet = petById(petId);
  const wrap = h('div', { class: `pet-fig m-${mood} ${size}`, role: 'img', 'aria-label': `${pet.name} the ${pet.species}` },
    h('span', { class: 'emo', 'aria-hidden': 'true' }, pet.emoji));
  if (typeof Image === 'undefined') { wrap.setMood = () => {}; return wrap; }
  let img = null, latest = 0;
  wrap.setMood = (m) => {
    wrap.className = wrap.className.split(' ').map((c) => (c.startsWith('m-') ? `m-${m}` : c)).join(' ');
    const mine = ++latest;
    pictureFor(petId, m).then((url) => {
      if (mine !== latest || !url) return; // a newer mood was asked for, or no picture exists (the emoji stays)
      if (!img) { img = new Image(); img.alt = ''; img.className = 'pet-img'; }
      if (img.getAttribute('src') !== url) img.src = url;
      if (img.parentNode !== wrap) wrap.replaceChildren(img);
    });
  };
  wrap.setMood(mood);
  return wrap;
}

const triangle = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 22'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'polygon');
  p.setAttribute('points', '1,2 23,2 12,21'); p.setAttribute('fill', 'currentColor');
  s.append(p); return s;
};

const flask = () => h('span', { class: 'flask' }, ic('flask'), h('i', { class: 'b' }), h('i', { class: 'b' }), h('i', { class: 'b' }));

/* The AD play-triangle V enture wordmark. size: 'lg' (login, tour) or 'sm' (top bar). */
export function wordmark(size = 'lg') {
  const word = h('span', { class: `word ${size}`, role: 'img', 'aria-label': 'ADVenture' },
    h('span', { class: 'l' }, 'A'), h('span', { class: 'l' }, 'D'), h('span', { class: 'v' }, triangle()), h('span', { class: 'e' }, 'enture'));
  if (size === 'lg') return h('div', { class: 'wm lg' }, h('div', { class: 'presents' }, flask(), 'R&D Labs presents'), word);
  return h('div', { class: 'wm sm' }, word, h('div', { class: 'presents' }, flask(), 'R&D Labs'));
}

/* Dialog. Returns { close }. dismissible=false blocks Esc and backdrop clicks (used by the joke ad).
   Tab and Shift+Tab stay inside the dialog, and focus goes back to where it was when the dialog closes. */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function modal(content, { dismissible = true, label = 'Dialog' } = {}) {
  const prev = document.activeElement;
  const back = h('div', { class: 'backdrop' });
  const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' }, content);
  back.append(box);
  const close = () => { document.removeEventListener('keydown', onKey); back.remove(); if (prev && prev.isConnected && prev.focus) prev.focus(); };
  const onKey = (e) => {
    if (!back.isConnected) { document.removeEventListener('keydown', onKey); return; } // removed by a page change
    const all = document.querySelectorAll('.backdrop');
    if (all[all.length - 1] !== back) return; // only the top dialog reacts
    if (dismissible && e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...box.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length);
    if (!f.length) { e.preventDefault(); box.focus(); return; }
    const first = f[0], last = f[f.length - 1], at = document.activeElement;
    if (!box.contains(at)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (at === first || at === box)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  };
  if (dismissible) back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  box.focus();
  return { close, box };
}

/* Initials for the profile circle, from the Google name (or the email as a fallback). */
export function initialsOf(user) {
  const clean = (s) => String(s || '').trim();
  let parts = clean(user && (user.fullName || '')).split(/\s+/).filter(Boolean);
  if (parts.length === 0 && user && user.email) parts = clean(user.email.split('@')[0]).split(/[._-]+/).filter(Boolean);
  if (parts.length === 0 && user && user.name) parts = clean(user.name).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0], last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/* A short burst of confetti. Skipped when animations are off. */
export function confetti() {
  if (document.body.classList.contains('nomotion')) return;
  const colors = ['#534AB7', '#FAC775', '#7F77DD', '#B5D4F4', '#C0DD97', '#CECBF6'];
  const host = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 42; i++) {
    const p = h('i', { style: `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.5}s;animation-duration:${1.6 + Math.random() * 1.2}s;transform:rotate(${Math.random() * 360}deg)` });
    host.append(p);
  }
  document.body.append(host);
  setTimeout(() => host.remove(), 3200);
}
