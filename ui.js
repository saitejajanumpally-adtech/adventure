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

/* Pet picture. Tries pets/{pet}-{mood}.webp/.png, then -happy, then -hello, then shows the emoji. */
const missing = new Set();
export function petFigure(petId, mood = 'happy', size = 'md') {
  const pet = petById(petId);
  const wrap = h('div', { class: `pet-fig m-${mood} ${size}`, role: 'img', 'aria-label': `${pet.name} the ${pet.species}` },
    h('span', { class: 'emo', 'aria-hidden': 'true' }, pet.emoji));
  if (typeof Image === 'undefined') return wrap;
  const tries = [...new Set([mood, 'happy', 'hello'])].flatMap((m) => [`pets/${pet.id}-${m}.webp`, `pets/${pet.id}-${m}.png`]).filter((u) => !missing.has(u));
  let i = 0;
  const next = () => {
    if (i >= tries.length) return;
    const url = tries[i++];
    const img = new Image();
    img.alt = ''; img.className = 'pet-img';
    img.onload = () => wrap.replaceChildren(img);
    img.onerror = () => { missing.add(url); next(); };
    img.src = url;
  };
  next();
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

/* Dialog. Returns { close }. dismissible=false blocks Esc and backdrop clicks (used by the joke ad). */
export function modal(content, { dismissible = true, label = 'Dialog' } = {}) {
  const prev = document.activeElement;
  const back = h('div', { class: 'backdrop' });
  const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' }, content);
  back.append(box);
  const close = () => { document.removeEventListener('keydown', onKey); back.remove(); if (prev && prev.focus) prev.focus(); };
  const onKey = (e) => { if (dismissible && e.key === 'Escape') close(); };
  if (dismissible) back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  box.focus();
  return { close, box };
}
