import { CONFIG } from './config.js';
import { ADS } from './data.js';
import { h, ic, modal, toast } from './ui.js';

let last = -1;

/* Plays a joke ad before a hint. Resolves when the ad ends or is skipped. */
export function showHintAd() {
  return new Promise((resolve) => {
    let idx = Math.floor(Math.random() * ADS.length);
    if (idx === last) idx = (idx + 1) % ADS.length;
    last = idx;
    const ad = ADS[idx];
    const total = Math.max(0.2, Number(CONFIG.AD_SECONDS) || 5) * 1000;
    const skipAt = Math.min(total, (Number(CONFIG.AD_SKIP_AFTER) || 3) * 1000);
    const t0 = Date.now();

    const count = h('span', { class: 'ad-count', role: 'status' }, 'Your hint is coming up');
    const fillBar = h('div', { class: 'ad-fill' });
    const skip = h('button', { class: 'ad-skip', disabled: true, onclick: () => finish() }, 'Skip ad in ', Math.ceil(skipAt / 1000));
    const cta = h('button', { class: 'ad-cta', onclick: () => toast(ad.joke) }, ad.cta);
    const body = h('div', { class: 'ad-body', style: `background:${ad.bg};color:${ad.fg}` },
      h('div', { class: 'ad-brand' }, ic(ad.icon), ad.brand),
      h('p', { class: 'ad-head' }, ad.head), h('p', { class: 'ad-sub' }, ad.sub), cta);
    const card = h('div', { class: 'adcard' },
      h('div', { class: 'ad-top' }, h('span', { class: 'ad-badge' }, 'Ad'), count), body,
      h('div', { class: 'ad-bar' }, fillBar), h('div', { class: 'ad-foot' }, h('span', {}, 'Hint unlocks after this ad'), skip));
    const m = modal(card, { dismissible: false, label: 'Advertisement before your hint' });

    let done = false, timer;
    function finish() { if (done) return; done = true; clearInterval(timer); m.close(); resolve(); }
    timer = setInterval(() => {
      const el = Date.now() - t0;
      fillBar.style.width = `${Math.min(100, (el / total) * 100)}%`;
      const left = Math.max(0, Math.ceil((total - el) / 1000));
      count.textContent = left > 0 ? `Ad · ${left}s` : 'Ad over';
      if (el >= skipAt && skip.disabled) { skip.disabled = false; skip.textContent = 'Skip ad'; skip.focus(); }
      else if (el < skipAt) skip.textContent = `Skip ad in ${Math.ceil((skipAt - el) / 1000)}`;
      if (el >= total) finish();
    }, 100);
  });
}
