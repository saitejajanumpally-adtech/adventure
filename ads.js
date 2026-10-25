import { CONFIG } from './config.js';
import { ADS } from './data.js';
import { h, modal, toast, petFigure } from './ui.js';

const lastByPet = {};

/* Picks one of the host pet's two ads, avoiding an immediate repeat. */
export function pickAd(petId) {
  const mine = ADS.filter((a) => a.pet === petId);
  const pool = mine.length ? mine : ADS;
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && lastByPet[petId] === i) i = (i + 1) % pool.length;
  lastByPet[petId] = i;
  return pool[i];
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const mmss = (secs) => `0:${String(Math.max(0, secs)).padStart(2, '0')}`;

const THEME = {
  video: { bg: '#B5D4F4', ink: '#042C53' },
  countdown: { bg: '#FAC775', ink: '#412402' },
  prize: { bg: '#FAEEDA', ink: '#633806' },
  install: { bg: '#CECBF6', ink: '#26215C' },
  cookie: { bg: '#FFFFFF', ink: '#26215C' }
};

/* Plays a joke ad before a hint. Resolves when the ad ends or is skipped. */
export function showHintAd(petId, opts = {}) {
  return new Promise((resolve) => {
    const ad = pickAd(petId);
    const th = THEME[ad.fmt] || THEME.video;
    const choice = ad.fmt === 'cookie' || ad.fmt === 'install'; // two buttons instead of a Skip button
    const total = Math.max(0.2, Number(opts.seconds ?? CONFIG.AD_SECONDS) || 5) * 1000;
    const skipAt = Math.min(total, (Number(opts.skipAfter ?? CONFIG.AD_SKIP_AFTER) || 3) * 1000);
    const t0 = Date.now();
    let done = false, timer, unlocked = false, m;

    const status = h('p', { class: 'sr-only', role: 'status' }, 'A short joke ad is playing before your hint.');
    const count = h('span', { class: 'ad-count', 'aria-hidden': 'true' }, `Ad \u00B7 ${mmss(Math.ceil(total / 1000))}`);
    const fillBar = h('div', { class: 'ad-fill' });
    const aboutLine = h('p', { class: 'ad-about', hidden: true }, 'This is a joke ad. Nothing about you is shared.');
    const about = h('button', { class: 'ad-i', 'aria-label': 'About this ad', onclick: () => { aboutLine.hidden = !aboutLine.hidden; } }, 'i');
    const cd = h('b', { class: 'ad-cd' }, mmss(Math.ceil(total / 1000)));

    const finish = () => { if (done) return; done = true; clearInterval(timer); if (m) m.close(); resolve(); };

    const skip = h('button', { class: 'ad-skip', disabled: true, onclick: finish }, `Skip ad in ${Math.ceil(skipAt / 1000)}`);
    const primary = h('button', { class: 'ad-cta', disabled: choice, onclick: () => { toast(ad.joke); if (choice) finish(); } }, ad.cta);
    const secondary = ad.alt ? h('button', { class: 'ad-alt', disabled: true, onclick: finish }, ad.alt) : null;

    const pet = petFigure(ad.pet, ad.mood, 'pad');
    let creative;
    if (ad.fmt === 'cookie') {
      creative = h('div', { class: 'ad-creative cookie', style: `background:${th.bg};color:${th.ink}` },
        pet, h('p', { class: 'ad-head' }, ad.head), h('p', { class: 'ad-body' }, ad.body), h('p', { class: 'ad-small' }, ad.small), primary, secondary);
    } else if (ad.fmt === 'install') {
      creative = h('div', { class: 'ad-creative install', style: `background:${th.bg};color:${th.ink}` },
        h('div', { class: 'ad-app' }, h('div', { class: 'ad-appicon' }, pet), h('div', {}, h('p', { class: 'ad-brand' }, ad.brand), h('p', { class: 'ad-free' }, 'Free'))),
        h('p', { class: 'ad-head' }, ad.head), h('p', { class: 'ad-small' }, ad.small), primary, secondary);
    } else {
      const headNodes = ad.fmt === 'countdown' ? [ad.head, ' ', cd] : [ad.head];
      creative = h('div', { class: `ad-creative ${ad.fmt}`, style: `background:${th.bg};color:${th.ink}` },
        h('div', { class: 'ad-text' }, h('p', { class: 'ad-brand' }, ad.brand), h('p', { class: 'ad-head' }, headNodes), h('p', { class: 'ad-small' }, ad.small), primary), pet);
    }
    creative.append(about);

    const footer = choice
      ? h('p', { class: 'ad-note' }, 'Buttons unlock in a moment. Just a joke ad: nothing about you is shared.')
      : h('div', { class: 'ad-foot' }, h('span', { class: 'ad-url' }, `${slug(ad.brand)}.example`), skip);

    const card = h('div', { class: 'adcard' },
      status,
      h('div', { class: 'ad-top' }, h('span', { class: 'ad-badge' }, 'Ad'), h('span', { class: 'ad-lead' }, 'Your hint is coming up'), count, about),
      creative, aboutLine,
      h('div', { class: 'ad-bar' }, fillBar), footer);
    m = modal(card, { dismissible: false, label: 'Advertisement before your hint' });

    timer = setInterval(() => {
      if (done) return;
      if (!card.isConnected) { finish(); return; } // the page changed while the ad was showing
      const el = Date.now() - t0;
      fillBar.style.width = `${Math.min(100, (el / total) * 100)}%`;
      const left = Math.max(0, Math.ceil((total - el) / 1000));
      count.textContent = `Ad \u00B7 ${mmss(left)}`;
      cd.textContent = mmss(left);
      if (el >= skipAt && !unlocked) {
        unlocked = true;
        skip.disabled = false; skip.textContent = 'Skip ad';
        if (choice) { primary.disabled = false; if (secondary) secondary.disabled = false; }
        status.textContent = 'You can skip the ad now.';
        (choice ? primary : skip).focus();
      } else if (!unlocked) skip.textContent = `Skip ad in ${Math.ceil((skipAt - el) / 1000)}`;
      if (el >= total) finish();
    }, 100);
  });
}
