import { CONFIG } from './config.js';
import { applyContent, CATS, GAMES, MODES, LEVELS, TIPS, GAME_TIPS, PETS, TOUR, CURRENCY, BADGES, LINES, GAME_LEVELS, TEXT_SIZES, WHATS_NEW, WHATS_NEW_MINOR, HINTS, SHOP_SOON, SHOP_DEFAULTS } from './data.js';
import { shuffle, mulberry32, seedFrom, dateKey, yesterdayKey, weekKey, weekdayIndex, parseDevice } from './util.js';
import { createStore } from './store.js';
import { h, ic, fill, toast, petFigure, preloadPets, PET_MOODS, petById, wordmark, modal, fmtTime, initialsOf, confetti } from './ui.js';
import { showHintAd } from './ads.js';
import { makeTimer, runQuiz, runRapid, runWho, runFlow, runMatch, runSort, runCross, hooks } from './engines.js';
import { adminView } from './admin.js';
import { difficultyOf } from './validate.js';

const $app = document.getElementById('app');
const S = { store: null, user: null, profile: null, admin: false, reportCount: 0, feedbackCount: 0, loginMsg: '', timer: null, clock: null, host: {}, tourI: 0, pick: null, floor: null, remote: {}, announce: { banner: {}, entries: [], minor: '' }, prevHash: '' };
const gameById = (id) => GAMES.find((g) => g.id === id);
const catOf = (g) => CATS.find((c) => c.id === g.cat);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const save = () => S.store.saveProfile(S.user, S.profile).catch(() => toast('Could not save your progress. Check your connection.'));
const applyPrefs = () => {
  document.body.classList.toggle('nomotion', !S.profile.settings.motion);
  TEXT_SIZES.forEach((t) => document.body.classList.toggle(`ts-${t.id}`, (S.profile.settings.textSize || 'standard') === t.id));
};
const seenOf = (g) => (S.profile.seenAll && S.profile.seenAll[g]) || [];
const LIVE = GAMES.filter((g) => g.live && !g.practice);

/* Settings the admin can change in the app. They win over config.js. */
const eff = () => ({
  floorGoal: Number(S.remote.floorGoal) || CONFIG.FLOOR_GOAL,
  weekDays: Number(S.remote.weekDays) || CONFIG.WEEK_GOAL_DAYS,
  weekBonus: S.remote.weekBonus != null && S.remote.weekBonus !== '' ? Number(S.remote.weekBonus) : CONFIG.WEEK_BONUS,
  adSeconds: Number(S.remote.adSeconds) || CONFIG.AD_SECONDS,
  adSkip: Number(S.remote.adSkip) || CONFIG.AD_SKIP_AFTER,
  adFreePrice: Number(S.remote.adFreePrice) || CONFIG.AD_FREE_PRICE,
  adFreeDays: Number(S.remote.adFreeDays) || CONFIG.AD_FREE_DAYS,
  adHintPrice: Number(S.remote.adHintPrice) || SHOP_DEFAULTS.adHintPrice,
  adHintMax: Number(S.remote.adHintMax) || SHOP_DEFAULTS.adHintMax,
  giftMax: Number(S.remote.giftMax) || SHOP_DEFAULTS.giftMax,
  shopHidden: Array.isArray(S.remote.shopHidden) ? S.remote.shopHidden : [],
  featured: S.remote.featured || '',
  hidden: Array.isArray(S.remote.hidden) ? S.remote.hidden : []
});
const isHidden = (g) => eff().hidden.includes(g.id);
const balanceOf = (p) => Math.max(0, (p.coins || 0) - (p.spent || 0));
const adFreeActive = () => (S.profile.adFreeUntil || 0) > Date.now();
const gameLevel = (correct) => { let l = 1; GAME_LEVELS.forEach((t, i) => { if (correct >= t) l = i + 1; }); return l; };
const greetName = () => (S.profile.nickname || S.profile.name || S.user.name || '').trim();
const newsList = () => (S.announce.entries && S.announce.entries.length ? S.announce.entries : WHATS_NEW);
const newCount = () => { const list = newsList(), seen = S.profile.newSeen; const i = list.findIndex((e) => e.id === seen); return i < 0 ? list.length : i; };

function view(el) {
  document.body.classList.remove('noscroll');
  if (S.clock) { clearInterval(S.clock); S.clock = null; }
  if (S.timer) { S.timer.stop(); S.timer = null; }
  fill($app, el);
  window.scrollTo(0, 0);
}

function levelInfo(coins) { // level always comes from everything ever earned, so spending never lowers it
  let idx = 0;
  LEVELS.forEach((l, i) => { if (coins >= l.t) idx = i; });
  const cur = LEVELS[idx], next = LEVELS[idx + 1];
  return { idx, name: cur.n, level: idx + 1, next, pct: next ? Math.round(((coins - cur.t) / (next.t - cur.t)) * 100) : 100 };
}
function streakNow() { const p = S.profile; return p.lastDay === dateKey() || p.lastDay === yesterdayKey() ? p.streak : 0; }
function daysAway() { const p = S.profile; if (!p.lastDay) return 0; return Math.round((new Date(dateKey()) - new Date(p.lastDay)) / 864e5); }
function meet(id) { if (!S.profile.met[id]) { S.profile.met[id] = true; save(); } }
const weekDaysNow = () => (S.profile.weekKey === weekKey() ? S.profile.weekDays : []);

function hostFor(gameId) {
  const g = gameById(gameId), mode = S.profile.settings.petMode;
  if (mode === 'shuffle') return PETS[Math.floor(Math.random() * PETS.length)].id;
  if (mode === 'daily') { const day = Math.floor(Date.now() / 864e5); return PETS[(day + GAMES.findIndex((x) => x.id === gameId)) % PETS.length].id; }
  return g.pet;
}

/* ---------- badges ---------- */
function badgeEarnedNow(id) {
  const p = S.profile;
  if (id === 'first') return Object.values(p.played).some((x) => x.plays > 0);
  if (id === 'flawless') return (p.perfectRounds || 0) > 0;
  if (id === 'fire') return (p.bestStreak || 0) >= 7;
  if (id === 'pals') return Object.keys(p.met).length >= PETS.length;
  if (id === 'allround') return LIVE.filter((g) => !isHidden(g)).every((g) => p.played[g.id]);
  if (id === 'yield') return levelInfo(p.coins).level >= 5;
  return false;
}
function checkBadges() {
  const p = S.profile, fresh = [];
  let coins = 0;
  BADGES.forEach((b) => { if (!p.badges[b.id] && badgeEarnedNow(b.id)) { p.badges[b.id] = Date.now(); coins += b.coins; fresh.push(b); } });
  if (coins) p.coins += coins;
  return { fresh, coins };
}
function nudge() {
  const p = S.profile;
  const left = BADGES.find((b) => !p.badges[b.id]);
  if (!left) return null;
  if (left.id === 'first') return 'Finish a game to earn First Steps.';
  if (left.id === 'flawless') return 'One perfect round earns Flawless.';
  if (left.id === 'fire') { const n = Math.max(1, 7 - (p.bestStreak || 0)); return `${n} more ${n === 1 ? 'day' : 'days'} in a row earns On Fire.`; }
  if (left.id === 'pals') return 'Meet all 8 pets to earn Pet Pals.';
  if (left.id === 'allround') return `${LIVE.filter((g) => !isHidden(g) && !p.played[g.id]).length} games left to earn All-Rounder.`;
  return `${Math.max(0, LEVELS[4].t - p.coins)} AdCoins to Level 5 and Yield Pro.`;
}

/* ---------- page frame: top bar with logo, streak, AdCoins and profile ---------- */
function topbar() {
  const p = S.profile, lv = levelInfo(p.coins), nn = newCount(), bal = balanceOf(p);
  const shown = (p.nickname || p.name || S.user.name || '').trim();
  const link = (href, icon, text, note, badgeN, extra) => h('a', { class: 'mi2', href, onclick: extra },
    h('span', { class: 'ic' }, ic(icon)), text, badgeN ? h('span', { class: 'badge' }, badgeN) : note ? h('em', {}, note) : null);
  const group = (title, ...items) => h('div', { class: 'mg' }, h('h4', {}, title), items);
  const adminN = (S.reportCount || 0) + (S.feedbackCount || 0);
  const signOut = h('button', { class: 'mi2 out', onclick: () => { try { sessionStorage.removeItem('rda_sess'); } catch { /* ignore */ } S.store.signOut(onUser); } }, h('span', { class: 'ic' }, ic('logout')), 'Sign out');
  const menu = h('div', { class: 'menu', id: 'acct-menu', hidden: true, 'aria-label': 'Your menu' },
    h('div', { class: 'who' }, h('span', { class: 'big' }, initialsOf(S.user)),
      h('div', {}, h('b', {}, p.fullName || S.user.fullName || shown), h('small', {}, S.user.email || ''),
        h('div', { class: 'chips2' }, h('span', {}, ic('rocket'), `Level ${lv.level} · ${lv.name}`), h('span', {}, ic('coin'), `${bal} ${CURRENCY}`)))),
    group('Me', link('#/profile', 'user-circle', 'My profile', 'name, nickname'), link('#/card', 'chart-bar', 'My scorecard'), link('#/pets', 'paw', 'My pets', `${Object.keys(p.met).length} of ${PETS.length}`)),
    group(CURRENCY, link('#/coins', 'coins', `My ${CURRENCY}`, 'earn · spend'), link('#/guide', 'book-2', 'How AdVenture works', 'rules')),
    group('Settings and help', link('#/settings', 'settings', 'Settings', 'text size, timer'), link('#/help', 'message-circle', 'Help and feedback'),
      link('#/new', 'sparkles', "What's new", null, nn), link('#/tour', 'map-2', 'Replay the tour', null, 0, () => { S.tourI = 0; })),
    S.admin ? group('Admin only', link('#/admin', 'inbox', 'Admin', null, adminN)) : null,
    h('div', { class: 'mdiv' }), signOut);
  const scrim = h('div', { class: 'scrim', onclick: () => setOpen(false) });
  const avatar = h('button', { class: 'avatar', 'aria-expanded': 'false', 'aria-controls': 'acct-menu', 'aria-label': 'Open your menu', onclick: (e) => { e.stopPropagation(); setOpen(menu.hidden); } },
    ic('menu-2', 'mi-ic'), h('span', { class: 'ini' }, initialsOf(S.user)), h('span', { class: 'an' }, shown), h('span', { class: 'menuw' }, 'Menu'), ic('chevron-down', 'chev'),
    nn ? h('span', { class: 'avdot', 'aria-hidden': 'true' }) : null);
  const setOpen = (on) => {
    menu.hidden = !on; scrim.classList.toggle('on', on); avatar.setAttribute('aria-expanded', String(on));
    avatar.setAttribute('aria-label', on ? 'Close your menu' : 'Open your menu'); document.body.classList.toggle('noscroll', on);
  };
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-in' },
      h('a', { class: 'brand', href: '#/home', 'aria-label': 'ADVenture home' }, wordmark('sm')),
      h('div', { class: 'tb-right' },
        h('span', { class: 'pill f', title: 'Streak' }, ic('flame'), String(streakNow())),
        h('a', { class: 'pill c', href: '#/coins', 'aria-label': `${bal} ${CURRENCY}. Open My ${CURRENCY}.`, title: `Your ${CURRENCY}. Tap to see how to earn and spend them.` }, ic('coin'), String(bal), h('span', { class: 'pl' }, ` ${CURRENCY}`)),
        h('div', { class: 'avwrap' }, avatar, scrim, menu))));
}
const page = (kids, { narrow = false, cls = '' } = {}) => h('div', { class: `app ${narrow ? 'narrow' : ''} ${cls}`.trim() }, topbar(), h('main', { class: 'page' }, kids));

/* ---------- login ---------- */
function renderLogin() {
  const msg = h('p', { class: 'err', role: 'alert' }, S.loginMsg || '');
  const btn = h('button', { class: 'gbtn', onclick: async () => {
    msg.textContent = '';
    try { await S.store.signIn(onUser); } catch (e) {
      msg.textContent = e && e.code === 'auth/popup-closed-by-user' ? 'Sign-in was closed. Try again.' : 'Could not sign in. Allow pop-ups for this site and try again.';
    }
  } }, ic('brand-google'), 'Continue with Google');
  view(h('main', { class: 'login' },
    petFigure('penguin', 'hello', 'pstage'), wordmark('lg'),
    h('p', { class: 'tagline' }, 'Learn AdTech by playing'), btn,
    h('p', { class: 'muted' }, `DataBeat accounts only (@${CONFIG.ALLOWED_DOMAIN})`), msg,
    S.store.demo ? h('p', { class: 'demo' }, 'Demo mode: no real login. Your progress stays in this browser.') : null));
}

/* ---------- tour: one pet per slide, then pick a companion ---------- */
function renderTour() {
  const i = S.tourI, last = TOUR.length, p = S.profile;
  const finish = (pickCompanion) => {
    if (pickCompanion) { p.companion = S.pick || p.companion; PETS.forEach((x) => { p.met[x.id] = true; }); }
    p.tourDone = true;
    const b = checkBadges();
    save(); S.tourI = 0; S.pick = null; applyPrefs();
    if (b.fresh.length) toast(`Badge unlocked: ${b.fresh.map((x) => x.title).join(', ')}`);
    go('/home');
  };
  const skip = h('button', { class: 'linkbtn tour-skip', onclick: () => finish(false) }, 'Skip tour');
  const dots = h('div', { class: 'dots', 'aria-label': `Step ${i + 1} of ${last + 1}` }, Array.from({ length: last + 1 }, (_, k) => h('i', { class: k === i ? 'on' : '' })));
  if (i < last) {
    const t = TOUR[i], pet = petById(t.pet);
    view(h('main', { class: 'tour' }, skip,
      i === 0 ? wordmark('lg') : null,
      petFigure(t.pet, i === 0 ? 'hello' : 'explain', 'pstage'),
      h('p', { class: 'pet-says' }, `${pet.name} the ${pet.species} says`),
      h('h1', {}, t.title), h('p', { class: 'tour-text' }, t.text), dots,
      h('div', { class: 'row gap wrap center' },
        i > 0 ? h('button', { class: 'btn ghost', onclick: () => { S.tourI--; renderTour(); } }, 'Back') : null,
        h('button', { class: 'btn', onclick: () => { S.tourI++; renderTour(); } }, 'Next'))));
    return;
  }
  S.pick = S.pick || p.companion;
  const grid = h('div', { class: 'pickgrid', role: 'radiogroup', 'aria-label': 'Choose your companion' });
  const draw = () => fill(grid, PETS.map((x) => h('button', { class: `pick ${S.pick === x.id ? 'on' : ''}`, role: 'radio', 'aria-checked': String(S.pick === x.id), onclick: () => { S.pick = x.id; draw(); } },
    petFigure(x.id, 'hello', 'md'), h('b', {}, x.name), h('span', {}, x.species))));
  draw();
  view(h('main', { class: 'tour' }, skip, h('h1', {}, 'Choose your companion'), h('p', { class: 'tour-text' }, 'They will cheer you on across the app. You can change them any time in Settings.'), grid, dots,
    h('div', { class: 'row gap wrap center' }, h('button', { class: 'btn ghost', onclick: () => { S.tourI--; renderTour(); } }, 'Back'), h('button', { class: 'btn', onclick: () => finish(true) }, 'Start playing'))));
}

/* ---------- home ---------- */
const sectionHead = (title, sub, extra) => h('div', { class: 'sec-head' }, h('div', {}, h('h2', {}, title), sub ? h('p', { class: 'muted' }, sub) : null), extra || null);
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function gameCard(g) {
  const c = catOf(g);
  if (!g.live || isHidden(g)) return h('div', { class: 'gcard soon', 'aria-label': `${g.title}, coming soon` }, h('span', { class: 'gic' }, ic(g.icon)), h('div', {}, h('b', {}, g.title), h('span', {}, 'Coming soon')));
  const played = S.profile.played[g.id];
  return h('a', { class: 'gcard', href: `#/game/${g.id}`, style: `--bg:${c.bg};--fg:${c.fg}` }, h('span', { class: 'gic' }, ic(g.icon)),
    h('div', {}, h('b', {}, g.title), h('span', {}, g.tag), h('small', { class: 'gmeta', 'data-game': g.id }, played ? `Level ${gameLevel(played.correct)}` : 'Not played yet')));
}

function gymCard() {
  const n = missedCount();
  if (!n) return null;
  return h('section', { class: 'gymcard', 'aria-label': 'Brain gym' }, h('span', { class: 'gic' }, ic('barbell')),
    h('div', {}, h('b', {}, 'Brain gym'), h('p', { class: 'muted' }, `${plural(n, 'question')} you missed ${n === 1 ? 'is' : 'are'} waiting. A short practice round with no pressure.`)),
    h('a', { class: 'btn inline', href: '#/play/brain-gym' }, 'Practise'));
}
function renderHome() {
  const p = S.profile, today = dateKey(), lv = levelInfo(p.coins), done = p.missionDay === today;
  const away = daysAway();
  const baseMood = !p.lastDay ? 'hello' : away >= 3 ? 'sleepy' : 'happy';
  const comp = petById(p.companion);
  const baseMsg = !p.lastDay ? 'Start with the daily quest. It takes about five minutes.' : away >= 3 ? 'We missed you. A quick round gets your streak going again.'
    : nudge() || TIPS[seedFrom(today) % TIPS.length];

  // mascot: tap to make it react
  const mascot = h('button', { class: 'mascot', 'aria-label': `${comp.name} the ${comp.species}. Tap to say hello.` });
  const bubble = h('div', { class: 'hbubble', role: 'status' });
  const setMascot = (mood, text) => { fill(mascot, petFigure(p.companion, mood, 'phero')); fill(bubble, h('b', {}, `${comp.name} says`), h('p', {}, text)); };
  mascot.addEventListener('click', () => setMascot(pick(['hello', 'celebrate', 'happy', 'explain', 'proud']), pick(TIPS)));
  setMascot(baseMood, baseMsg);

  const live = LIVE.filter((g) => g.kind !== 'mission' && g.kind !== 'rapid' && !isHidden(g));
  const featured = live.find((g) => g.id === eff().featured);
  let rec = featured || live.find((g) => g.id !== p.lastGame) || live[0];
  const recBox = h('section', { class: 'rec', 'aria-label': 'Recommended game' });
  const drawRec = () => fill(recBox,
    h('span', { class: 'gic big' }, ic(rec.icon)),
    h('div', { class: 'rec-t' }, h('p', { class: 'eyebrow' }, featured && rec.id === featured.id ? 'Featured this week' : 'Recommended for you'), h('b', {}, rec.title), h('p', { class: 'muted' }, rec.tag)),
    h('div', { class: 'rec-a' }, h('a', { class: 'btn inline ghost', href: `#/game/${rec.id}` }, ic('player-play'), 'Play'),
      h('button', { class: 'btn inline ghost', onclick: () => { const pool = live.filter((g) => g.id !== rec.id); go(`/game/${pick(pool).id}`); } }, ic('sparkles'), 'Surprise me')));
  drawRec();
  // work out which game has the most questions the player has not seen yet, and show "N new" on each tile
  (async () => {
    try {
      let best = null;
      for (const g of live) {
        const items = ((await S.store.loadPack(g.id)).items || []).filter((x) => x && x.id && !x.disabled);
        const seen = new Set(seenOf(g.id));
        const fresh = items.filter((x) => !seen.has(x.id)).length;
        const meta = recBox.isConnected && $app.querySelector(`.gmeta[data-game="${g.id}"]`);
        if (meta) { const played = p.played[g.id]; meta.textContent = `${played ? `Level ${gameLevel(played.correct)} · ` : ''}${fresh ? `${fresh} new` : 'all seen'}`; }
        const score = fresh * 10 - (p.played[g.id] ? p.played[g.id].plays : 0) - (g.id === p.lastGame ? 1000 : 0);
        if (!best || score > best.score) best = { g, score };
      }
      if (!featured && best && best.g.id !== rec.id && recBox.isConnected) { rec = best.g; drawRec(); }
    } catch { /* keep the default */ }
  })();

  // quest hero (left) and progress card (right)
  const hero = h('section', { class: 'qhero', 'aria-label': "Today's quest" },
    mascot,
    h('div', { class: 'qh-main' },
      bubble,
      h('p', { class: 'eyebrow' }, 'A five-minute break for your brain'),
      h('h1', { class: 'hello' }, `Hey ${greetName()}, ready for an “aha”?`),
      h('p', { class: 'questline' }, done ? 'Today’s quest is complete. Replay it for practice.' : 'Today’s quest: 3 puzzles, 5 minutes. A little more AdTech confidence.'),
      h('div', { class: 'steps', 'aria-hidden': 'true' }, [0, 1, 2].map(() => h('i', { class: done ? 'on' : '' })), h('span', {}, done ? 'Completed today' : 'Not started yet')),
      h('div', { class: 'row gap wrap' },
        h('a', { class: 'btn quest', href: '#/play/daily-warmup' }, ic('player-play'), done ? 'Play again' : 'Start quest'),
        h('span', { class: 'rw' }, ic('coin'), done ? 'Bonus earned today' : `+${30} ${CURRENCY} bonus`))));

  const wd = weekDaysNow(), todayIdx = weekdayIndex(), wbonus = p.weekBonusKey === weekKey();
  const left = Math.max(0, eff().weekDays - wd.length);
  const weekMsg = wbonus ? `Weekly bonus earned: +${eff().weekBonus} ${CURRENCY}. Lovely rhythm.`
    : left === 1 ? `One more day for +${eff().weekBonus} ${CURRENCY}. A little learning goes far.` : `${left} more days for +${eff().weekBonus} ${CURRENCY}.`;
  const progress = h('section', { class: 'prog', 'aria-label': 'Your progress' },
    h('div', { class: 'lvl' }, h('span', { class: 'lvl-ic' }, ic('rocket')), h('div', {}, h('p', { class: 'eyebrow' }, `Level ${lv.level} of ${LEVELS.length}`), h('b', {}, lv.name))),
    h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Progress to the next level', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(lv.pct) }, h('div', { class: 'fill', style: `width:${lv.pct}%` })),
    h('p', { class: 'muted small' }, lv.next ? `${lv.next.t - p.coins} ${CURRENCY} to ${lv.next.n}` : 'Top level reached'),
    h('div', { class: 'streakrow' }, ic('flame'), h('span', {}, streakNow() ? `${streakNow()}-day streak. Keep it going.` : 'Play today to start a streak.')),
    h('div', { class: 'wkh' }, h('b', {}, 'Your weekly rhythm'), h('span', { class: 'muted' }, `${wd.length} of ${eff().weekDays} days`)),
    h('div', { class: 'week', role: 'group', 'aria-label': 'This week' }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, k) => {
      const on = wd.includes(k), td = k === todayIdx;
      return h('div', { class: `wd ${on ? 'on' : ''} ${td && !on ? 'td' : ''}`.trim() },
        h('span', { class: 'wl', 'aria-hidden': 'true' }, d),
        h('span', { class: 'wc', role: 'img', 'aria-label': `${DAY_NAMES[k]}: ${on ? 'played' : td ? 'today' : 'not played'}` }, on ? ic('check') : null));
    })),
    h('p', { class: 'muted small' }, weekMsg));

  // lifetime journey, with the level names so nobody has to guess what the dots are
  const journey = h('section', { class: 'jour', 'aria-label': 'Your learning journey' },
    h('div', { class: 'sec-head tight' }, h('h2', {}, 'A little wiser, every day'), h('p', { class: 'muted' }, 'Your lifetime learning journey')),
    h('ol', { class: 'path' }, LEVELS.map((l, k) => h('li', { class: `pn ${k < lv.idx ? 'done' : ''} ${k === lv.idx ? 'cur' : ''}`.trim(), 'aria-current': k === lv.idx ? 'step' : null },
      h('i', { class: 'nd' }, k < lv.idx ? ic('check') : String(k + 1)), h('span', { class: 'pname' }, l.n, h('span', { class: 'sr-only' }, k < lv.idx ? ', reached' : k === lv.idx ? ', your level' : ', not yet'))))));

  const liveCount = LIVE.filter((g) => !isHidden(g)).length;
  const sections = CATS.map((c) => {
    const gs = GAMES.filter((g) => g.cat === c.id);
    return h('section', { class: 'cat', style: `--panel:${c.panel};--ink:${c.fg};--tag:${c.tagInk};--n:${gs.length}`, 'aria-label': c.title },
      h('div', { class: 'cat-head' }, h('b', {}, c.title), h('span', {}, c.tagline)),
      h('p', { class: 'cat-about' }, c.about),
      h('div', { class: 'gcards' }, gs.map(gameCard)));
  });

  const floorBar = h('i', { style: 'width:0%' }), floorTxt = h('p', { class: 'muted' }, 'Loading this week’s total…');
  const drawFloor = () => {
    const n = S.floor || 0, goal = eff().floorGoal;
    floorBar.style.width = `${Math.min(100, Math.round((n / goal) * 100))}%`;
    floorTxt.textContent = `${Math.min(n, goal)} of ${goal} puzzle rounds this week. No names, just the team.`;
  };
  S.store.getFloor(weekKey()).then((n) => { S.floor = n; if (floorTxt.isConnected) drawFloor(); }).catch(() => { floorTxt.textContent = 'The floor total is unavailable right now.'; });
  if (S.floor != null) drawFloor();

  const badgeTiles = BADGES.map((b) => {
    const got = !!p.badges[b.id];
    return h('div', { class: `bdg ${got ? 'got' : ''}`, title: `${b.title}: ${b.desc}`, 'aria-label': `${b.title}, ${got ? 'earned' : 'locked'}: ${b.desc}` },
      h('span', { class: 'bi' }, ic(got ? b.icon : 'lock')), h('b', {}, b.title), h('small', { class: 'bst' }, got ? 'Earned' : 'Locked'));
  });
  const extras = h('section', { class: 'extras' },
    h('div', { class: 'xcard wins' }, h('div', { class: 'row' }, h('h2', {}, 'Little wins, proudly collected'), h('span', { class: 'muted' }, `${Object.keys(p.badges).length} of ${BADGES.length}`)), h('div', { class: 'bdgs' }, badgeTiles)),
    h('div', { class: 'xcard floorcard' }, h('p', { class: 'eyebrow' }, 'Better together'), h('h2', {}, 'One floor. One shared goal.'), h('div', { class: 'bar floor' }, floorBar), floorTxt));

  const welcome = p.introSeen ? null : h('section', { class: 'welcome', 'aria-label': 'How AdVenture works' }, ic('sparkles'),
    h('div', {}, h('b', {}, 'Welcome! Here is how it works.'), h('p', {}, `Play short puzzles, collect ${CURRENCY} and level up. Spend ${CURRENCY} on ad-free hints. Everything is explained in your menu.`),
      h('div', { class: 'row gap wrap' }, h('a', { class: 'linkbtn', href: '#/guide' }, 'Learn more'),
        h('button', { class: 'linkbtn', onclick: () => { p.introSeen = true; save(); welcome.remove(); } }, 'Got it'))));
  const bn = S.announce.banner || {};
  const bannerOn = bn.on && bn.text && (!bn.until || today <= bn.until);
  view(page([
    bannerOn ? h('div', { class: 'banner', role: 'status' }, ic('speakerphone'), h('span', {}, bn.text)) : null,
    welcome,
    h('div', { class: 'hero2' }, hero, progress),
    gymCard(),
    recBox,
    sectionHead('Find your kind of play', 'Small puzzles. Big “oh, that makes sense” moments.', h('span', { class: 'chip-count' }, `${liveCount} games to explore`)),
    sections, journey, extras,
    S.store.demo ? h('p', { class: 'demo' }, 'Demo mode: no real login. Your progress stays in this browser.') : null], { cls: 'homepage' }));
}

/* ---------- how to play ---------- */
function showHow(id) {
  const g = gameById(id), pet = S.host[id] || g.pet;
  const m = modal(h('div', { class: 'how' },
    h('div', { class: 'row gap top' }, petFigure(pet, 'explain', 'md'), h('div', {}, h('h2', {}, `How to play ${g.title}`), h('p', { class: 'muted' }, `${petById(pet).name} explains`))),
    h('ol', { class: 'steps2' }, g.how.steps.map((s) => h('li', {}, s))),
    h('div', { class: 'example' }, h('b', {}, 'Example'), h('p', {}, g.how.example)),
    h('p', { class: 'muted small' }, g.how.scoring),
    h('div', { class: 'center-row' }, h('button', { class: 'btn', onclick: () => m.close() }, "Got it, let's play"))), { label: `How to play ${g.title}` });
}

/* ---------- loading and picking puzzles ---------- */
async function loadUsable(gameId) {
  const pack = await S.store.loadPack(gameId);
  return (pack.items || []).filter((it) => it && it.id && !it.disabled);
}
// Unseen first. If fewer than n are unseen, top up with the ones seen longest ago.
function pickFresh(pool, n, seenArr) {
  const seen = new Set(seenArr);
  const fresh = shuffle(pool.filter((x) => !seen.has(x.id)));
  if (fresh.length >= n) return fresh.slice(0, n);
  const old = pool.filter((x) => seen.has(x.id)).sort((a, b) => seenArr.indexOf(a.id) - seenArr.indexOf(b.id));
  return fresh.concat(old).slice(0, n);
}
const GYM_GAMES = [['myth-or-fact', 'tf'], ['acronym-decoder', 'mcq'], ['odd-one-out', 'mcq']];
const missedCount = () => Object.values(S.profile.missed || {}).reduce((n, a) => n + a.length, 0);
// Up to five questions the player missed, easy first. Questions that no longer exist are dropped from the list.
async function gymItems() {
  const p = S.profile, out = [];
  p.missed = p.missed || {};
  for (const [gid, kind] of GYM_GAMES) {
    const ids = p.missed[gid] || [];
    if (!ids.length) continue;
    const pool = await loadUsable(gid), live = new Set(pool.map((x) => x.id));
    const keep = ids.filter((x) => live.has(x));
    if (keep.length) p.missed[gid] = keep; else delete p.missed[gid];
    pool.filter((x) => keep.includes(x.id)).forEach((x) => out.push({ ...x, kind, game: gid }));
  }
  return shuffle(out).slice(0, 5).sort((a, b) => difficultyOf(a) - difficultyOf(b));
}
function applyPractice(res) {
  const p = S.profile; p.missed = p.missed || {};
  let cleared = 0;
  res.items.forEach((it) => {
    if (!it.ok) return;
    const had = p.missed[it.game] || [];
    if (had.includes(it.id)) cleared++;
    const rest = had.filter((x) => x !== it.id);
    if (rest.length) p.missed[it.game] = rest; else delete p.missed[it.game];
  });
  p.cleared = (p.cleared || 0) + cleared;
  save();
  return { cleared, left: missedCount() };
}
function renderGymResult(res, r) {
  const p = S.profile;
  view(page(h('div', { class: 'stage result' },
    petFigure(p.companion, r.left === 0 ? 'celebrate' : 'proud', 'phero'),
    h('h1', {}, r.left === 0 ? 'All weak spots cleared' : 'Good practice'),
    h('p', { class: 'score' }, `${res.correct} of ${res.total}`),
    h('p', {}, r.cleared ? `${plural(r.cleared, 'weak spot')} cleared.` : 'Nothing cleared this time. Those questions will come back for another go.'),
    h('p', { class: 'muted small' }, `${plural(r.left, 'weak spot')} still to practise. Brain gym earns no ${CURRENCY}, so there is no pressure.`),
    h('div', { class: 'row gap wrap center-row' },
      r.left ? h('a', { class: 'btn', href: '#/play/brain-gym', onclick: () => { if (location.hash === '#/play/brain-gym') setTimeout(route, 0); } }, 'Practise again') : null,
      h('a', { class: `btn ${r.left ? 'ghost' : ''}`.trim(), href: '#/home' }, 'Back to home')))));
}
// Ten questions from the three quiz games, ones the player has not seen first, easy to hard.
async function rapidItems(n) {
  const all = [];
  for (const [gid, kind] of GYM_GAMES) {
    const seen = new Set(seenOf(gid));
    (await loadUsable(gid)).forEach((x) => all.push({ ...x, kind, game: gid, _seen: seen.has(x.id) }));
  }
  const fresh = shuffle(all.filter((x) => !x._seen)), old = shuffle(all.filter((x) => x._seen));
  return fresh.concat(old).slice(0, n).sort((a, b) => difficultyOf(a) - difficultyOf(b));
}
async function missionItems() {
  const out = [];
  for (const [gid, kind] of [['myth-or-fact', 'tf'], ['acronym-decoder', 'mcq'], ['odd-one-out', 'mcq']]) {
    const pool = await loadUsable(gid);
    if (!pool.length) continue;
    const seen = seenOf(gid);
    const unseen = pool.filter((x) => !seen.includes(x.id));
    const cand = unseen.length ? unseen : pool.slice().sort((a, b) => seen.indexOf(a.id) - seen.indexOf(b.id));
    const rnd = mulberry32(seedFrom(S.user.uid + dateKey() + gid));
    out.push({ ...cand[Math.floor(rnd() * (unseen.length ? cand.length : Math.min(cand.length, 3)))], kind, game: gid });
  }
  return out;
}
async function reportItem(game, item, reason) {
  const key = `${game}:${item.id}`;
  if (S.profile.reported[key]) return 'already';
  const r = await S.store.report(game, item, reason, S.user);
  S.profile.reported[key] = true; save();
  return r;
}

/* ---------- game intro ---------- */
async function renderIntro(id) {
  const g = gameById(id);
  if (!g || !g.live || g.practice || isHidden(g)) return go('/home');
  const c = catOf(g), pet = hostFor(id);
  S.host[id] = pet; meet(pet);
  const tips = GAME_TIPS[id] || [];
  const tip = tips[seedFrom(dateKey() + id) % Math.max(tips.length, 1)] || '';
  const pool = h('p', { class: 'muted pool' });
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'),
    h('section', { class: 'hero', style: `--bg:${c.bg};--fg:${c.fg}` },
      h('div', { class: 'row gap top' }, petFigure(pet, 'explain', 'lg'), h('div', {}, h('h1', {}, g.title), h('p', {}, g.blurb))),
      h('div', { class: 'bubble' }, h('span', {}, `${petById(pet).name} says`), h('p', {}, tip)),
      h('div', { class: 'rwd' }, ic('coins'), h('span', {}, g.earn || g.how.scoring)),
      h('div', { class: 'row gap wrap' }, h('button', { class: 'btn light inline', onclick: () => showHow(id) }, ic('question-mark'), 'How to play'), pool)),
    h('h2', { class: 'subhead' }, 'How do you want to play?'),
    h('p', { class: 'muted small' }, 'Solo is open today. More ways to play are on the way.'),
    h('div', { class: 'grid modes' }, MODES.map((m) => m.live
      ? h('a', { class: 'mode', href: `#/play/${id}` }, ic(m.icon, 'big'), h('div', {}, h('p', {}, m.title), h('span', {}, m.sub)))
      : h('div', { class: 'mode soon', 'aria-label': `${m.title}, coming soon` }, ic(m.icon, 'big'), h('div', {}, h('p', {}, m.title), h('span', {}, 'Coming soon')))))), { narrow: true }));
  if (!S.profile.howSeen[id]) { S.profile.howSeen[id] = true; save(); showHow(id); }
  try {
    if (g.kind === 'mission') { pool.textContent = 'Your three puzzles are picked from questions you have not seen yet.'; return; }
    if (g.kind === 'rapid') { pool.textContent = 'Ten questions from the quiz games, picked from ones you have not seen yet.'; return; }
    const items = await loadUsable(id), seen = new Set(seenOf(id));
    const left = items.filter((x) => !seen.has(x.id)).length;
    const unit = g.kind === 'tf' || g.kind === 'mcq' ? 'question' : 'puzzle';
    pool.textContent = left === 0 ? `You have seen every ${unit}. Replays earn ${CURRENCY} only when you beat your best.` : `${left} of ${items.length} ${unit}s still new to you.`;
  } catch { /* the line is optional */ }
}

/* ---------- AdCoins, streak, weekly goal, badges and no-repeat bookkeeping ---------- */
function applyResult(gameId, res, isMission, ms) {
  const p = S.profile, today = dateKey(), levelBefore = levelInfo(p.coins).idx;
  const isNew = (it) => !(p.seenAll[it.game] || []).includes(it.id);
  const sum = (a) => a.reduce((s, x) => s + x.coins, 0);
  const newIt = res.items.filter(isNew);
  const best = p.replayBest[gameId] || 0;
  let gain = 0, mode = 'new', round = 0;
  if (newIt.length === res.items.length) gain = sum(newIt) + (res.perfect ? 20 : 0);
  else if (newIt.length > 0) { gain = sum(newIt); mode = 'mixed'; }
  else { mode = 'replay'; round = sum(res.items) + (res.perfect ? 20 : 0); gain = Math.max(0, round - best); p.replayBest[gameId] = Math.max(best, round); }
  let bonus = 0;
  if (isMission && p.missionDay !== today) { bonus = 30; p.missionDay = today; }
  p.coins += gain + bonus;
  if (p.lastDay !== today) { p.streak = p.lastDay === yesterdayKey() ? p.streak + 1 : 1; p.lastDay = today; p.bestStreak = Math.max(p.bestStreak || 0, p.streak); }
  // weekly goal: play on N different days in a Monday to Sunday week
  const wk = weekKey();
  if (p.weekKey !== wk) { p.weekKey = wk; p.weekDays = []; }
  const di = weekdayIndex();
  if (!p.weekDays.includes(di)) p.weekDays.push(di);
  let weekBonus = 0;
  if (p.weekDays.length >= eff().weekDays && p.weekBonusKey !== wk) { weekBonus = eff().weekBonus; p.weekBonusKey = wk; p.coins += weekBonus; }
  const roundCoins = res.items.reduce((a, x) => a + x.coins, 0) + (res.perfect ? 20 : 0);
  const s = p.played[gameId] || { plays: 0, correct: 0, total: 0 };
  s.plays++; s.correct += res.correct; s.total += res.total; s.perfect = (s.perfect || 0) + (res.perfect ? 1 : 0); s.coins = (s.coins || 0) + roundCoins; p.played[gameId] = s;
  if (res.perfect) p.perfectRounds = (p.perfectRounds || 0) + 1;
  // one small record per day, so admins can look at any date range
  const act = p.activity[today] || { r: 0, c: 0, t: 0, s: 0, pf: 0, h: 0, g: {} };
  act.r++; act.c += res.correct; act.t += res.total; act.s += roundCoins; act.pf += res.perfect ? 1 : 0; act.h += res.hints || 0;
  const ga = act.g[gameId] || { r: 0, c: 0, t: 0, s: 0, pf: 0 };
  ga.r++; ga.c += res.correct; ga.t += res.total; ga.s += roundCoins; ga.pf += res.perfect ? 1 : 0; act.g[gameId] = ga;
  p.activity[today] = act;
  p.missed = p.missed || {};
  res.items.forEach((it) => {
    if (typeof it.ok !== 'boolean' || !GYM_GAMES.some(([g]) => g === it.game)) return;
    const arr = (p.missed[it.game] || []).filter((x) => x !== it.id);
    if (!it.ok) arr.push(it.id);
    if (arr.length) p.missed[it.game] = arr.slice(-40); else delete p.missed[it.game];
  });
  const keep = Object.keys(p.activity).sort().slice(-400);
  Object.keys(p.activity).forEach((k) => { if (!keep.includes(k)) delete p.activity[k]; });
  if (res.correct === res.total && (!p.bestTime[gameId] || ms < p.bestTime[gameId])) p.bestTime[gameId] = ms;
  res.items.forEach((it) => { const arr = (p.seenAll[it.game] || []).filter((x) => x !== it.id); arr.push(it.id); p.seenAll[it.game] = arr.slice(-2000); });
  p.lastGame = gameId;
  const b = checkBadges();
  const after = levelInfo(p.coins);
  S.floor = (S.floor || 0) + 1;
  S.store.bumpFloor(wk).catch(() => {});
  // right and wrong tallies per question (no names), one write per game in this round
  const byGame = {};
  res.items.forEach((it) => { if (typeof it.ok === 'boolean') (byGame[it.game] = byGame[it.game] || []).push({ id: it.id, ok: it.ok }); });
  Object.entries(byGame).forEach(([gm, list]) => S.store.bumpQStats(gm, list).catch(() => {}));
  save();
  return { gain, bonus, weekBonus, badges: b.fresh, badgeCoins: b.coins, mode, best, leveled: after.idx > levelBefore, after };
}

function renderResult(g, res, r, ms, left) {
  const p = S.profile, comp = petById(p.companion);
  const ratio = res.total ? res.correct / res.total : 0;
  const head = res.perfect ? 'Perfect round' : ratio === 1 ? 'All correct' : ratio >= 0.7 ? 'Nice work' : 'Good practice';
  const mood = r.leveled || res.perfect ? 'celebrate' : ratio >= 0.7 ? 'proud' : 'encourage';
  const lines = LINES[p.companion] || LINES.panda;
  const petLine = pick(res.perfect ? lines.great : ratio >= 0.7 ? lines.right : lines.keep); // only a truly perfect round gets the "perfect" lines
  const note = r.mode === 'mixed' ? 'Some of these were repeats, so only the new ones earned AdCoins.'
    : r.mode === 'replay' ? (r.gain > 0 ? `Replay bonus: you beat your best replay (${r.best}) and earned ${r.gain} more.` : `Replays earn ${CURRENCY} only when you beat your best replay${r.best ? ` (${r.best})` : ''}.`) : '';
  const unit = g.kind === 'tf' || g.kind === 'mcq' || g.kind === 'mission' || g.kind === 'rapid' || g.kind === 'who' ? 'question' : 'puzzle';
  const pool = left == null ? '' : left === 0 ? `You have seen every ${unit} in this game. Replays earn ${CURRENCY} only when you beat your best.` : `${plural(left, `new ${unit}`)} left before repeats begin.`;
  const total = r.gain + r.bonus + r.weekBonus + r.badgeCoins;
  view(page(h('div', { class: 'stage result' },
    petFigure(p.companion, mood, 'phero'),
    h('p', { class: 'pet-says' }, `${comp.name} says`),
    h('h1', {}, head), h('p', { class: 'score' }, `${res.correct} of ${res.total}`), h('p', { class: 'petline' }, petLine),
    h('div', { class: 'stats' },
      h('div', {}, h('b', {}, fmtTime(ms)), h('span', {}, 'Time')),
      h('div', {}, h('b', {}, `+${total}`), h('span', {}, CURRENCY)),
      h('div', {}, h('b', {}, plural(S.profile.streak, 'day')), h('span', {}, 'Streak'))),
    h('div', { class: 'card left' },
      r.bonus ? h('p', { class: 'small' }, `Includes a ${r.bonus} ${CURRENCY} quest bonus.`) : null,
      r.weekBonus ? h('p', { class: 'small' }, `Weekly goal reached: +${r.weekBonus} ${CURRENCY}.`) : null,
      r.badges.map((b) => h('p', { class: 'small badge-line' }, ic(b.icon), `Badge unlocked: ${b.title}${b.coins ? ` (+${b.coins})` : ''}`)),
      note ? h('p', { class: 'small' }, note) : null,
      res.hints ? h('p', { class: 'small' }, `Hints used: ${res.hints}. Those items earned half AdCoins, and a round with hints can't be perfect.`) : null,
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${r.after.pct}%` })),
      h('p', { class: 'muted small' }, r.leveled ? `Level up! You are now ${r.after.name}.` : `Level ${r.after.level}: ${r.after.name}`),
      h('p', { class: 'small' }, h('b', {}, `Your ${CURRENCY}: ${balanceOf(p)}.`), ' ', coinGoal(), ' ', h('a', { class: 'more', href: '#/coins' }, `See your ${CURRENCY} \u2192`)),
      pool ? h('p', { class: 'muted small' }, pool) : null),
    h('div', { class: 'stack' },
      h('a', { class: 'btn', href: `#/play/${g.id}`, onclick: () => { if (location.hash === `#/play/${g.id}`) setTimeout(route, 0); } }, 'Play again'),
      h('a', { class: 'btn ghost', href: '#/home' }, 'Back to home'))), { narrow: true }));
  if (res.perfect || r.leveled || r.bonus || r.badges.length) confetti();
}

/* ---------- play: coach panel on the left, question card on the right ---------- */
function buildPlayShell(g, hostPet) {
  const st = S.profile.settings, pet = petById(hostPet), lines = LINES[hostPet] || LINES.panda;
  let answeredAny = false, hintFn = null, nudged = false, idleT = null;
  const MOOD = { right: 'correct', wrong: 'oops', hint: 'think', great: 'celebrate', keep: 'encourage' };

  const hn = h('span', { class: 'hn' }, `${g.title} \u00B7 `);
  const qh = h('span', { class: 'qh-t' }, 'Loading\u2026');
  const bar = h('i', {});
  const clock = st.liveTimer ? h('span', { class: 'qclock', 'aria-label': 'Time so far' }, ic('clock'), h('span', { class: 'ct' }, '0:00')) : null;
  const askQuit = () => {
    if (!answeredAny) { go(`/game/${g.id}`); return; }
    const m = modal(h('div', { class: 'how' }, h('h2', {}, 'Leave this round?'), h('p', { class: 'muted' }, 'Your answers so far will not count.'),
      h('div', { class: 'center-row gapb' }, h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Keep playing'), h('button', { class: 'btn', onclick: () => { m.close(); go(`/game/${g.id}`); } }, 'Leave'))), { label: 'Leave this round?' });
  };
  const xbtn = h('button', { class: 'xbtn', 'aria-label': 'Quit game', onclick: askQuit }, ic('x'));
  const head = h('div', { class: 'qhead' }, h('span', { class: 'qh' }, hn, qh), h('div', { class: 'qbar' }, bar), clock, xbtn);
  const box = h('div', { class: 'play' }, h('p', { class: 'muted' }, 'Loading puzzles\u2026'));
  const noteTxt = h('span', {});
  const hnote = h('div', { class: 'hnote', role: 'status', hidden: true }, ic('bulb'), noteTxt);

  const mkHint = (cls) => h('button', { class: `hintbtn ${cls}`, hidden: true, onclick: () => { if (hintFn) hintFn(); } }, h('span', { class: 'bl' }, ic('bulb')), h('span', { class: 'hl' }, 'Hint'));
  const hintCoach = mkHint('in-coach'), hintCard = mkHint('in-card');
  const mkHow = () => h('button', { class: 'linkbtn how', onclick: () => showHow(g.id) }, ic('question-mark'), 'How to play');
  const howCoach = mkHow(), howCard = mkHow();
  const hintBoth = (fn) => [hintCoach, hintCard].forEach(fn);
  const label = (b, t) => { b.querySelector('.hl').textContent = t; };

  const petBox = h('div', { class: 'cpet' });
  const bubble = h('div', { class: 'cbubble', role: 'status' });
  const cnote = h('p', { class: 'cnote' });
  const coachFig = petFigure(hostPet, 'explain', 'pcoach'); // one picture for the whole round: only its mood changes, so it never flickers
  petBox.append(coachFig);
  // Phones and tablets: a slim coach strip instead of the side panel. Tap it to read a little more.
  const stripFig = petFigure(hostPet, 'explain', 'sthumb');
  const stripMain = h('span', { class: 'cs-main' }), stripSub = h('span', { class: 'cs-sub' }), stripNote = h('span', { class: 'cs-note' });
  const stripMore = h('div', { class: 'cs-more', id: 'cs-more', hidden: true }, stripSub, stripNote);
  const stripBtn = h('button', { class: 'cs-btn', 'aria-expanded': 'false', 'aria-controls': 'cs-more', 'aria-label': `${pet.name}, your coach. Show more`, onclick: () => {
    const open = stripMore.hidden; stripMore.hidden = !open; stripBtn.setAttribute('aria-expanded', String(open)); strip.classList.toggle('open', open);
  } }, stripFig, h('span', { class: 'cs-name' }, h('b', {}, pet.name), stripMain), ic('chevron-down'));
  const strip = h('div', { class: 'cstrip', role: 'status' }, stripBtn, stripMore);
  const DEFAULT_SUB = 'Stuck? Tap Hint. A hinted question earns half AdCoins.';
  const setNote = (t) => { cnote.textContent = t || ''; stripNote.textContent = t || ''; };
  const setBubble = (main, mood, sub) => {
    coachFig.setMood(mood); stripFig.setMood(mood);
    fill(bubble, h('p', {}, main), sub ? h('p', { class: 'sub' }, sub) : null);
    stripMain.textContent = main; stripSub.textContent = sub || DEFAULT_SUB;
  };
  const tips = GAME_TIPS[g.id] || [''];
  const hideBtn = h('button', { class: 'chide', 'aria-label': 'Hide coach', onclick: () => setCoach(false) }, ic('chevron-left'));
  const panel = h('aside', { class: 'coachpanel', 'aria-label': `${pet.name}, your coach` },
    hideBtn, h('div', { class: 'cname' }, h('b', {}, pet.name), h('span', {}, `${g.title} coach`)),
    petBox, bubble, cnote, h('div', { class: 'cactions' }, hintCoach, howCoach));
  const thumb = petFigure(hostPet, 'happy', 'thumb');
  const rail = h('button', { class: 'coachrail', 'aria-label': 'Show coach', onclick: () => setCoach(true) }, thumb, h('span', {}, 'Coach'), ic('chevron-right'));
  const card = h('section', { class: 'qcard' }, head, strip, box, hnote, h('div', { class: 'hint-under' }, hintCard, howCard), h('p', { class: 'kbtip' }, g.kind === 'tf' ? 'Tip: press M for Myth or F for Fact, and H for a hint.' : g.kind === 'mcq' || g.kind === 'mission' ? 'Tip: press A, B, C or D to answer, and H for a hint.' : g.kind === 'rapid' ? 'Tip: press M or F, or A to D, to answer fast.' : ''));
  const grid = h('div', { class: `playgrid ${st.coach === false ? 'nocoach' : ''}` }, panel, rail, card);
  const setCoach = (on) => { st.coach = on; grid.classList.toggle('nocoach', !on); save(); };

  // If someone sits on a question for a while, the pet offers help.
  const secs = Number(CONFIG.IDLE_NUDGE_SECONDS) || 15;
  const stopIdle = () => { clearTimeout(idleT); idleT = null; };
  const armIdle = () => {
    stopIdle();
    if (!hintFn || nudged) return;
    idleT = setTimeout(() => {
      if (!card.isConnected || !hintFn || hintCoach.disabled) return;
      nudged = true; setBubble('Stuck? Tap Hint.', 'think');
      hintBoth((b) => b.classList.add('nudge'));
      setTimeout(() => hintBoth((b) => b.classList.remove('nudge')), 4000);
    }, secs * 1000);
  };
  ['pointerdown', 'keydown', 'input'].forEach((ev) => card.addEventListener(ev, armIdle));

  const api = {
    box, grid, clock, setCoach,
    setHeader(text, pct) { qh.textContent = text; if (pct != null) bar.style.width = `${pct}%`; },
    note(text) { noteTxt.textContent = text || ''; hnote.hidden = !text; },
    /* fn = what the Hint button does (null hides it). left = hints still available this round (null = not limited). */
    setHint(fn, left = null) {
      hintFn = fn; nudged = false;
      const txt = left == null ? 'Hint' : left === 0 ? 'No hints left' : `Hint (${left} left)`;
      hintBoth((b) => { b.hidden = !fn; b.disabled = !fn || left === 0; b.classList.remove('used', 'nudge'); label(b, txt); });
      setNote(''); api.note('');
      armIdle();
    },
    hintEnable(on) { if (!hintFn) return; hintBoth((b) => { if (!b.classList.contains('used')) b.disabled = !on; }); if (on) armIdle(); else stopIdle(); },
    hintBusy() { hintBoth((b) => { b.disabled = true; }); stopIdle(); },
    hintUsed({ left, again } = {}) {
      stopIdle();
      if (again) {
        const txt = left > 0 ? `Hint (${left} left)` : 'No hints left';
        hintBoth((b) => { b.disabled = left <= 0; b.classList.remove('nudge'); label(b, txt); });
      } else {
        hintBoth((b) => { b.disabled = true; b.classList.remove('nudge'); b.classList.add('used'); label(b, 'Hint used'); });
        if (left != null) setNote(`${left} ${left === 1 ? 'hint' : 'hints'} left in this round.`);
      }
    },
    lockHint() { stopIdle(); if (hintFn) hintBoth((b) => { b.disabled = true; }); },
    triggerHint() { const b = [hintCard, hintCoach].find((x) => !x.hidden && !x.disabled && x.offsetParent !== null); if (b) b.click(); },
    coach: {
      reset() { setBubble(pick(tips), 'explain'); setNote(''); },
      react(kind) { answeredAny = true; setBubble(pick(lines[kind] || lines.right), MOOD[kind] || 'happy'); },
      hintBefore() { setBubble(pick(lines.hint), 'think'); },
      hintAfter(main, sub) { setBubble(main, 'explain', sub); },
      note(text) { setNote(text); }
    },
    destroy() { stopIdle(); }
  };
  setBubble(pick(tips), 'explain');
  api.setHint(null);
  return api;
}

async function play(id) {
  const g = gameById(id);
  if (!g || !g.live) return go('/home');
  if (isHidden(g)) return go('/home');
  const hostPet = S.host[id] || hostFor(id);
  const sh = buildPlayShell(g, hostPet);
  view(page(sh.grid, { cls: 'playpage' }));
  const timer = makeTimer(); S.timer = timer;
  hooks.companion = S.profile.companion;
  const box = sh.box;
  if (!box.isConnected) return;
  try {
    let items, pool = null;
    if (g.kind === 'mission') items = await missionItems();
    else if (g.kind === 'practice') items = await gymItems();
    else if (g.kind === 'rapid') items = await rapidItems(g.size);
    else {
      pool = await loadUsable(id);
      items = pickFresh(pool, g.size || 1, seenOf(id)).sort((a, b) => difficultyOf(a) - difficultyOf(b)).map((it) => ({ ...it, kind: g.kind, game: id }));
    }
    if (!box.isConnected) return;
    if (!items.length) { fill(box, h('p', {}, g.kind === 'practice' ? 'No weak spots right now. Play a few rounds first, and the questions you miss will show up here.' : 'No puzzles are available for this game right now.'), h('a', { class: 'btn', href: '#/home' }, 'Back to home')); return; }
    timer.start();
    if (sh.clock) S.clock = setInterval(() => { sh.clock.querySelector('.ct').textContent = fmtTime(timer.ms()); }, 500);
    const ctx = { gameId: id, timer, isSeen: (game, qid) => seenOf(game).includes(qid), skipAd, hostPet, practice: g.kind === 'practice', seconds: g.seconds, shell: sh, showAd: (pet) => showHintAd(pet, { seconds: eff().adSeconds, skipAfter: eff().adSkip }), report: (it, reason) => reportItem(it.game || id, it, reason) };
    const res = g.kind === 'rapid' ? await runRapid(box, items, ctx) : g.kind === 'who' ? await runWho(box, items, ctx) : ['mission', 'tf', 'mcq', 'practice'].includes(g.kind) ? await runQuiz(box, items, ctx)
      : await ({ flow: runFlow, match: runMatch, sort: runSort, cross: runCross }[g.kind])(box, items[0], ctx);
    timer.stop(); sh.destroy();
    const ms = timer.ms();
    if (g.kind === 'practice') { renderGymResult(res, applyPractice(res)); return; }
    const r = applyResult(id, res, g.kind === 'mission', ms);
    const left = pool ? pool.filter((x) => !seenOf(id).includes(x.id)).length : null;
    renderResult(g, res, r, ms, left);
  } catch (e) {
    console.error(e);
    if (box.isConnected) fill(box, h('p', { class: 'err' }, 'Something went wrong loading this game.'), h('a', { class: 'btn', href: '#/home' }, 'Back to home'));
  }
}

/* ---------- scorecard, pets, settings, help, what's new ---------- */
function renderCard() {
  const p = S.profile, lv = levelInfo(p.coins);
  const metric = (icon, label, value) => h('div', { class: 'metric' }, h('span', { class: 'mi' }, ic(icon)), h('b', {}, value), h('span', { class: 'ml' }, label));
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'My scorecard'),
    h('p', { class: 'muted lede' }, 'Your AdCoins, streaks and progress in one place.'),
    h('div', { class: 'grid4' },
      metric('rocket', 'Level', `${lv.level}: ${lv.name}`), metric('coins', `${CURRENCY} earned`, p.coins), metric('shopping-cart', 'Spent', p.spent || 0), metric('wallet', 'Balance', balanceOf(p)),
      metric('flame', 'Streak', plural(streakNow(), 'day')), metric('trophy', 'Best streak', plural(p.bestStreak || 0, 'day')), metric('paw', 'Pets met', `${Object.keys(p.met).length} of ${PETS.length}`), metric('medal', 'Badges', `${Object.keys(p.badges).length} of ${BADGES.length}`)),
    h('p', { class: 'muted small note-c' }, 'Your level comes from everything you have earned, so spending AdCoins never lowers it.'),
    h('h2', { class: 'subhead' }, 'By game'),
    h('p', { class: 'muted small' }, 'How you are doing in each game. A game levels up as you answer more questions right.'),
    h('div', { class: 'gstats' }, GAMES.filter((g) => g.live).map((g) => {
      const s = p.played[g.id], bt = p.bestTime[g.id];
      return h('div', { class: `gs ${s ? '' : 'idle'}`.trim() }, h('span', { class: 'gic' }, ic(g.icon)), h('b', {}, g.title),
        s ? h('span', { class: 'lvtag' }, `Level ${gameLevel(s.correct)}`) : null,
        h('span', { class: 'muted' }, s ? `${plural(s.plays, 'play')} \u00B7 ${s.total ? Math.round((s.correct / s.total) * 100) : 0}% right` : 'Not played yet'),
        s && bt ? h('span', { class: 'muted' }, `Best time ${fmtTime(bt)}`) : null);
    })),
    h('h2', { class: 'subhead' }, 'Badges'),
    h('p', { class: 'muted small' }, 'Little wins, proudly collected.'),
    h('div', { class: 'bgrid' }, BADGES.map((b) => {
      const got = !!p.badges[b.id];
      return h('div', { class: `bdg big ${got ? 'got' : ''}`.trim(), 'aria-label': `${b.title}, ${got ? 'earned' : 'locked'}: ${b.desc}` },
        h('span', { class: 'bi' }, ic(got ? b.icon : 'lock')), h('b', {}, b.title), h('small', { class: 'bd' }, b.desc), h('small', { class: 'bst' }, got ? 'Earned' : 'Locked'));
    }))), { narrow: true }));
}

function renderPets() {
  const p = S.profile, n = Object.keys(p.met).length, st = p.settings;
  const grid = h('div', { class: 'pkg', role: 'radiogroup', 'aria-label': 'Choose your companion' });
  const draw = () => fill(grid, PETS.map((x) => {
    const game = GAMES.find((g) => g.pet === x.id), met = !!p.met[x.id], on = p.companion === x.id;
    if (!met) return h('div', { class: 'pk locked', 'aria-label': `${x.name}, not met yet` }, h('div', { class: 'pet-fig md locked-fig', 'aria-hidden': 'true' }, ic('lock')), h('b', {}, 'Not met yet'), h('span', {}, `Play ${game.title} to meet this pet`));
    return h('button', { class: `pk ${on ? 'on' : ''}`, role: 'radio', 'aria-checked': String(on), onclick: () => { p.companion = x.id; save(); draw(); } },
      petFigure(x.id, 'hello', 'md'), h('b', {}, x.name), h('span', {}, x.species), h('em', {}, `Hosts ${game.title}`), on ? h('i', { class: 'ck' }, 'Your companion') : null);
  }));
  draw();
  const modeOpt = (v, t, sub) => h('label', { class: 'switch', for: `pm-${v}` }, h('input', { type: 'radio', name: 'petmode', id: `pm-${v}`, checked: st.petMode === v, onchange: () => { st.petMode = v; save(); } }), h('span', {}, h('b', {}, t), h('small', {}, sub)));
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'My pets'),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Choose your companion'), h('p', { class: 'muted' }, `Pick the one whose style and job you like. They cheer you on across the app. You have met ${n} of ${PETS.length}.`), grid),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Who hosts each game?'),
      modeOpt('fixed', 'Fixed', 'Each game keeps its own pet.'), modeOpt('shuffle', 'Shuffle', 'A random pet hosts each time you open a game.'), modeOpt('daily', 'Daily rotation', 'The host pets rotate every day.'))), { narrow: true }));
}

function renderSettings() {
  const p = S.profile, st = p.settings;
  const toggle = (key, label, sub) => { const cb = h('input', { type: 'checkbox', id: `s-${key}`, checked: st[key] !== false && !!st[key], onchange: () => { st[key] = cb.checked; applyPrefs(); save(); } }); return h('label', { class: 'switch', for: `s-${key}` }, cb, h('span', {}, h('b', {}, label), h('small', {}, sub))); };
  const sizeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Text size' });
  const drawSize = () => fill(sizeSeg, TEXT_SIZES.map((t) => h('button', { class: `segb ${(st.textSize || 'standard') === t.id ? 'on' : ''}`, role: 'radio', 'aria-checked': String((st.textSize || 'standard') === t.id), onclick: () => { st.textSize = t.id; applyPrefs(); save(); drawSize(); } }, t.label)));
  drawSize();
  const stock = p.adHints || 0;
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'Settings'),
    h('p', { class: 'muted lede' }, 'Make AdVenture feel right for you.'),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Play'),
      toggle('coach', 'Show the coach panel on laptops', 'The pet panel beside the question. You can also hide it from the game screen.'),
      toggle('liveTimer', 'Show a timer while playing', 'Your time always shows on the results screen.'),
      toggle('motion', 'Animations', 'Pet movement, confetti and the logo animation.')),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Text size'), h('p', { class: 'muted', style: 'margin:2px 0 10px' }, 'Changes the question and answer text everywhere.'), sizeSeg),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Ad-free hints'),
      h('p', { class: 'muted', style: 'margin:2px 0 8px' }, adFreeActive() ? `Your ad-free pass is on until ${untilText(p.adFreeUntil)}.` : `Hints play a short joke ad first. You have ${stock} ad-free ${stock === 1 ? 'hint' : 'hints'} saved.`),
      toggle('useAdHints', 'Use my ad-free hints automatically', 'When you tap Hint, a saved ad-free hint skips the joke ad. Turn this off to keep them for later.'),
      h('p', { style: 'margin:8px 0 0' }, h('a', { class: 'more', href: '#/coins' }, `Buy ad-free hints and passes in My ${CURRENCY} →`))),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Your name'),
      h('p', { class: 'muted', style: 'margin:2px 0 8px' }, 'Your nickname, name and email are in My profile.'),
      h('a', { class: 'btn ghost inline', href: '#/profile' }, ic('user-circle'), 'Open My profile')),
    h('p', { class: 'muted center', style: 'text-align:center' }, `R&D AdVenture · version ${CONFIG.APP_VERSION}`)), { narrow: true }));
}

function renderHelp() {
  let type = 'problem';
  const types = [['problem', 'Problem'], ['idea', 'Idea'], ['question', 'Question looks wrong']];
  const seg = h('div', { class: 'seg wrapseg', role: 'radiogroup', 'aria-label': 'What kind of feedback?' });
  const drawSeg = () => fill(seg, types.map(([id, t]) => h('button', { class: `segb ${type === id ? 'on' : ''}`, role: 'radio', 'aria-checked': String(type === id), onclick: () => { type = id; drawSeg(); } }, t)));
  drawSeg();
  const msg = h('textarea', { id: 'fb-msg', class: 'inp', rows: 6, maxlength: 2000, placeholder: 'Tell us what you saw, or what you would like to see\u2026' });
  const err = h('p', { class: 'err', role: 'alert' });
  const send = h('button', { class: 'btn', onclick: async () => {
    const text = msg.value.trim();
    if (text.length < 5) { err.textContent = 'Please write a few words so we can help.'; return; }
    err.textContent = ''; send.disabled = true;
    const dev = parseDevice(navigator.userAgent, window.innerWidth);
    const gm = (S.prevHash.match(/#\/(?:game|play)\/([\w-]+)/) || [])[1] || '';
    try {
      await S.store.sendFeedback({ uid: S.user.uid, name: S.user.fullName || S.profile.name || '', email: S.user.email || '', type, message: text,
        page: S.prevHash || '#/home', game: gm, device: dev.device, browser: dev.browser, screen: `${window.innerWidth}x${window.innerHeight}`, version: CONFIG.APP_VERSION });
      view(page(h('div', { class: 'stage result' }, petFigure(S.profile.companion, 'happy', 'phero'), h('h1', {}, 'Thank you'), h('p', { class: 'muted' }, 'Your message went to the R&D admins.'),
        h('div', { class: 'stack' }, h('a', { class: 'btn', href: '#/home' }, 'Back to home'))), { narrow: true }));
    } catch (e) { console.error(e); err.textContent = 'Could not send. Check your connection and try again.'; send.disabled = false; }
  } }, 'Send');
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'Help and feedback'),
    h('div', { class: 'card' }, h('p', { class: 'muted', style: 'margin-bottom:10px' }, 'Goes straight to the admin inbox.'), seg,
      h('label', { for: 'fb-msg' }, 'What happened?'), msg,
      h('p', { class: 'muted', style: 'margin:10px 0 12px' }, 'R&D also receives the page you were on, your device type and the app version, so they can reproduce the problem.'), err, send)), { narrow: true }));
}

function renderNews() {
  const list = newsList();
  if (list[0] && S.profile.newSeen !== list[0].id) { S.profile.newSeen = list[0].id; save(); }
  const minor = S.announce.entries && S.announce.entries.length ? S.announce.minor : WHATS_NEW_MINOR;
  const first = list[0] && list[0].date;
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, "What's new"),
    h('div', { class: 'card' }, first ? h('p', { class: 'muted', style: 'margin-bottom:6px' }, `Latest: ${first}`) : null,
      list.map((e) => h('div', { class: 'wn' }, h('span', { class: `tag ${e.type === 'pack' ? 'b' : ''}` }, e.type === 'pack' ? 'Packs' : 'New'), h('div', {}, h('b', {}, e.title), h('small', {}, e.text)))),
      minor ? h('p', { class: 'muted', style: 'margin-top:10px' }, minor) : null)), { narrow: true }));
}

/* ---------- AdCoins: wallet, shop, rules, profile, gifts ---------- */
const logEntry = (n, what) => { const p = S.profile; p.log = [{ t: Date.now(), n, what }, ...(p.log || [])].slice(0, 20); };
const keepScroll = (fn) => { const y = window.scrollY; fn(); window.scrollTo(0, y); };
const fmtDay = (t) => {
  if (!t) return '';
  const k = dateKey(new Date(t));
  return k === dateKey() ? 'Today' : k === yesterdayKey() ? 'Yesterday' : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const untilText = (t) => new Date(t || 0).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/* A confirm step before anything is bought: price, balance after, and what you get. */
function confirmBuy({ title, text, price, label }) {
  return new Promise((resolve) => {
    const m = modal(h('div', { class: 'how buy' }, h('h2', {}, title), h('p', { class: 'muted' }, text),
      h('div', { class: 'buyrows' },
        h('div', {}, h('span', {}, 'Price'), h('b', {}, `${price} ${CURRENCY}`)),
        h('div', {}, h('span', {}, 'Balance after'), h('b', {}, `${balanceOf(S.profile) - price} ${CURRENCY}`))),
      h('div', { class: 'center-row gapb' },
        h('button', { class: 'btn ghost', onclick: () => { m.close(); resolve(false); } }, 'Not now'),
        h('button', { class: 'btn', onclick: () => { m.close(); resolve(true); } }, label || `Buy for ${price}`))), { label: title });
  });
}
const onCoinsPage = () => location.hash === '#/coins';

async function buyAdHint() {
  const p = S.profile, e = eff();
  if (balanceOf(p) < e.adHintPrice) { toast(`You need ${e.adHintPrice - balanceOf(p)} more ${CURRENCY}.`); return; }
  if ((p.adHints || 0) >= e.adHintMax) { toast(`You can keep up to ${e.adHintMax} ad-free hints.`); return; }
  const ok = await confirmBuy({ title: 'Buy an ad-free hint?', text: `Your next hint skips the joke ad. You can keep up to ${e.adHintMax} at a time.`, price: e.adHintPrice });
  if (!ok || balanceOf(p) < e.adHintPrice || (p.adHints || 0) >= e.adHintMax) return;
  p.spent = (p.spent || 0) + e.adHintPrice; p.adHints = (p.adHints || 0) + 1;
  logEntry(-e.adHintPrice, 'Bought an ad-free hint'); save(); toast('Ad-free hint added.');
  if (onCoinsPage()) keepScroll(renderCoins);
}
async function buyPass() {
  const p = S.profile, e = eff();
  if (balanceOf(p) < e.adFreePrice) { toast(`You need ${e.adFreePrice - balanceOf(p)} more ${CURRENCY}.`); return; }
  const ok = await confirmBuy({ title: 'Buy the ad-free pass?', text: `Hints skip the joke ad for ${e.adFreeDays} days. Your level is not affected.`, price: e.adFreePrice });
  if (!ok || balanceOf(p) < e.adFreePrice) return;
  p.spent = (p.spent || 0) + e.adFreePrice; p.adFreeUntil = Math.max(Date.now(), p.adFreeUntil || 0) + e.adFreeDays * 864e5;
  logEntry(-e.adFreePrice, 'Bought the ad-free pass'); save(); toast('Ad-free hints are on.');
  if (onCoinsPage()) keepScroll(renderCoins);
}
/* Called before every hint. True means "no joke ad this time". An ad-free pass wins; otherwise one saved ad-free hint is used. */
function skipAd() {
  const p = S.profile;
  if (adFreeActive()) return true;
  if (p.settings.useAdHints !== false && (p.adHints || 0) > 0) {
    p.adHints -= 1; save(); toast(`Used 1 ad-free hint (${p.adHints} left)`); return true;
  }
  return false;
}

/* R&D Gifts: new gifts for this player are added to their AdCoins once, then remembered by id. */
async function claimGifts() {
  const p = S.profile;
  let g;
  try { g = await S.store.getGifts(S.user.uid); } catch { return null; }
  const have = new Set(p.giftIds || []);
  const fresh = ((g && g.list) || []).filter((x) => x && x.id && Number(x.n) > 0 && !have.has(x.id)).sort((a, b) => (a.at || 0) - (b.at || 0));
  if (!fresh.length) return null;
  const sum = fresh.reduce((a, x) => a + Number(x.n), 0);
  p.coins += sum;
  p.giftIds = [...(p.giftIds || []), ...fresh.map((x) => x.id)].slice(-200);
  p.log = [...fresh.map((x) => ({ t: x.at || Date.now(), n: Number(x.n), what: `R&D Gift: ${x.note}`, gift: true })), ...(p.log || [])].sort((a, b) => b.t - a.t).slice(0, 20);
  const b = checkBadges();
  save();
  return { sum, notes: fresh.map((x) => x.note).filter(Boolean), badges: b.fresh };
}
function showGift(g) {
  const m = modal(h('div', { class: 'giftpop' },
    h('span', { class: 'gi' }, ic('gift')),
    h('div', {}, h('h2', {}, `You got an R&D Gift: +${g.sum} ${CURRENCY}`), g.notes.slice(0, 3).map((n) => h('p', { class: 'gnote' }, `“${n}”`)),
      g.badges.length ? h('p', { class: 'gnote' }, `Badge unlocked: ${g.badges.map((b) => b.title).join(', ')}`) : null,
      h('button', { class: 'btn', onclick: () => m.close() }, 'Lovely, thanks'))), { label: 'You got an R&D Gift' });
}

function renderCoins() {
  const p = S.profile, e = eff(), bal = balanceOf(p), lv = levelInfo(p.coins), active = adFreeActive();
  const stock = p.adHints || 0;
  const canPass = bal >= e.adFreePrice, canHint = bal >= e.adHintPrice && stock < e.adHintMax;
  const earn = (amt, tag, title, sub) => h('div', { class: 'earn' }, h('div', { class: 'amt' }, amt, h('small', {}, tag)), h('div', {}, h('b', {}, title), h('span', {}, sub)));
  const goal = active
    ? h('div', { class: 'goal' }, h('b', {}, `Your ad-free pass is on until ${untilText(p.adFreeUntil)}`), h('p', { class: 'muted small' }, 'Hints skip the joke ad. You can add more days below.'))
    : h('div', { class: 'goal' }, h('b', {}, 'Your next goal: the ad-free pass'),
      h('p', { class: 'muted small' }, canPass ? `Costs ${e.adFreePrice} ${CURRENCY}. You have enough.` : `${e.adFreePrice - bal} ${CURRENCY} to go.`),
      h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Progress to the ad-free pass', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, Math.round((bal / e.adFreePrice) * 100))) }, h('div', { class: 'fill', style: `width:${Math.min(100, Math.round((bal / e.adFreePrice) * 100))}%` })));
  const shopCard = ({ icon, title, text, price, note, btnId, btnText, ok, onBuy }) => h('div', { class: 'card2' },
    h('div', { class: 'top' }, h('span', { class: 'big-ic' }, ic(icon)), h('b', {}, title)), h('p', {}, text),
    h('span', { class: 'price' }, ic('coin'), String(price)), note ? h('small', { class: 'muted' }, note) : null,
    h('button', { class: 'btn ghost inline', id: btnId, disabled: !ok, onclick: onBuy }, btnText));
  const wantRow = (x) => {
    const row = h('div', { class: 'want' });
    const note = h('small', { class: 'muted' }, 'Tap again to undo');
    const btn = h('button', { class: 'btn inline', onclick: () => { p.wants = p.wants || {}; if (p.wants[x.id]) delete p.wants[x.id]; else p.wants[x.id] = true; save(); paint(); } });
    const paint = () => { const on = !!(p.wants || {})[x.id]; btn.className = `btn inline ${on ? 'want-on' : 'ghost'}`; btn.setAttribute('aria-pressed', String(on)); fill(btn, ic(on ? 'heart-filled' : 'heart'), on ? 'You want this' : 'I want this'); note.hidden = !on; };
    row.append(btn, note); paint();
    return row;
  };
  const soon = SHOP_SOON.filter((x) => !e.shopHidden.includes(x.id));
  const activity = (p.log || []).length
    ? (p.log || []).map((x) => h('div', { class: 'actrow' }, h('span', { class: `a ${x.gift ? 'gift' : x.n > 0 ? 'pos' : 'neg'}` }, `${x.n > 0 ? '+' : '−'}${Math.abs(x.n)}`), h('span', {}, x.what), h('small', {}, fmtDay(x.t))))
    : [h('p', { class: 'muted small' }, 'Nothing yet. Your purchases and R&D Gifts will show here.')];
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, `My ${CURRENCY}`),
    h('p', { class: 'muted lede' }, 'Play, learn, collect. AdCoins are the points you earn for learning AdTech, a nod to the ad revenue everyone here works with.'),
    h('div', { class: 'wallet' }, h('span', { class: 'coin' }, ic('coins')),
      h('div', {}, h('div', { class: 'bal' }, String(bal)), h('div', { class: 'bal-l' }, `${CURRENCY} you can spend`)),
      h('div', { class: 'meta' }, h('div', {}, h('b', {}, String(p.coins)), 'earned in total'), h('div', {}, h('b', {}, String(p.spent || 0)), 'spent'), h('div', {}, h('b', {}, `Level ${lv.level}`), 'never drops'))),
    goal,
    h('h2', { class: 'subhead' }, 'Ways to earn'), h('p', { class: 'muted small' }, 'The more you play, the more you collect. New questions pay most.'),
    h('div', { class: 'earnlist' },
      earn('+10', 'each', 'A correct answer on a new question', '5 if you used a hint. Seen it before? It only counts if you beat your best replay.'),
      earn('+20', 'bonus', 'A perfect round', 'Every answer right and no hints.'),
      earn('+30', 'daily', 'Finish the daily quest', 'Three quick puzzles, once a day.'),
      earn(`+${e.weekBonus}`, 'weekly', `Play on ${e.weekDays} different days in a week`, 'Monday to Sunday. See your weekly rhythm on the home page.'),
      earn('+10–30', 'badges', 'Badges', 'First Steps, Flawless, On Fire, Pet Pals and All-Rounder each pay a one-time bonus.')),
    h('h2', { class: 'subhead' }, 'Shop'), h('p', { class: 'muted small' }, 'Spending never lowers your level.'),
    h('div', { class: 'shopgrid' },
      shopCard({ icon: 'bulb', title: 'One ad-free hint', text: 'Skip the joke ad once. Your next hint uses it automatically.', price: e.adHintPrice,
        note: stock >= e.adHintMax ? `You have ${stock}, the most you can keep.` : bal < e.adHintPrice ? `You have ${stock}. You need ${e.adHintPrice - bal} more ${CURRENCY}.` : `You have ${stock}. You can keep up to ${e.adHintMax}.`,
        btnId: 'buy-hint', btnText: 'Buy', ok: canHint, onBuy: buyAdHint }),
      shopCard({ icon: 'ad-off', title: 'Ad-free pass', text: `${e.adFreeDays} days of hints without the joke ad.`, price: e.adFreePrice,
        note: active ? `On until ${untilText(p.adFreeUntil)}.` : bal < e.adFreePrice ? `You need ${e.adFreePrice - bal} more ${CURRENCY}.` : null,
        btnId: 'buy-pass', btnText: active ? `Add ${e.adFreeDays} days` : 'Buy', ok: canPass, onBuy: buyPass }),
      soon.map((x) => h('div', { class: 'card2 soon' }, h('div', { class: 'top' }, h('span', { class: 'big-ic' }, ic(x.icon)), h('b', {}, x.title)), h('p', {}, x.text), h('small', { class: 'muted' }, 'Coming soon'), wantRow(x)))),
    soon.length ? h('p', { class: 'muted small' }, 'Tell us what to build next. It is a vote, not a promise.') : null,
    h('h2', { class: 'subhead' }, 'Recent activity'), h('div', { class: 'card2 actlist' }, activity),
    h('p', { style: 'margin-top:14px' }, h('a', { class: 'more', href: '#/guide' }, 'See all the rules →'))), { narrow: true }));
}

function renderGuide() {
  const e = eff();
  const row = (a, b) => h('tr', {}, h('td', {}, a), h('td', {}, b));
  const table = (heads, rows) => h('div', { class: 'tsc' }, h('table', { class: 'rules' }, h('thead', {}, h('tr', {}, heads.map((t) => h('th', {}, t)))), h('tbody', {}, rows)));
  const badgeLine = BADGES.filter((b) => b.coins).map((b) => `${b.title} +${b.coins}`).join(', ');
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'How AdVenture works'),
    h('p', { class: 'muted lede' }, 'Short puzzles, a little every day. Here is the whole idea.'),
    h('div', { class: 'flow' },
      h('div', {}, h('span', { class: 'n' }, '1'), h('b', {}, 'Play'), h('p', {}, 'Pick a game. Each round takes about five minutes.')),
      h('div', {}, h('span', { class: 'n' }, '2'), h('b', {}, `Earn ${CURRENCY}`), h('p', {}, 'Right answers pay. New questions pay most.')),
      h('div', {}, h('span', { class: 'n' }, '3'), h('b', {}, 'Grow'), h('p', {}, `Level up, collect badges, spend ${CURRENCY} in the shop.`))),
    h('h2', { class: 'subhead' }, `Earning ${CURRENCY}`),
    table(['What you do', 'You get'], [
      row('Correct answer on a new question', '10'), row('Correct answer with a hint', '5'), row('Perfect round (all right, no hints)', '+20'),
      row('Finish the daily quest (once a day)', '+30'), row(`Play on ${e.weekDays} different days in a Monday to Sunday week`, `+${e.weekBonus}`),
      row('A question you have seen before', 'only if you beat your best replay'), row('Badges (one time each)', badgeLine)]),
    h('p', { class: 'muted small' }, 'You will not see a question again until you have seen them all.'),
    h('h2', { class: 'subhead' }, 'Levels'), h('p', { class: 'muted small' }, `Your level comes from every ${CURRENCY} you have earned. Spending never lowers it.`),
    table(['Level', 'Name', `${CURRENCY} earned`], LEVELS.map((l, i) => h('tr', {}, h('td', {}, String(i + 1)), h('td', {}, l.n), h('td', {}, String(l.t))))),
    h('p', { class: 'muted small' }, 'Each game also has its own skill level, from 1 to 5, based on your correct answers in that game.'),
    h('h2', { class: 'subhead' }, 'Hints'),
    table(['Game', 'Hints'], [
      row('Quiz games (Myth or fact, Acronym decoder, Odd one out, daily quest)', '1 per question'), row('Stack sorter', `${HINTS['stack-sorter'].perRound} per round, once per card`),
      row('Ad-flow builder', `${HINTS['ad-flow-builder'].perRound} per puzzle, after your first wrong check`), row('Crossword', `${HINTS.crossword.perRound} per puzzle, one per word`), row('Jargon match', `${HINTS['jargon-match'].perRound} per puzzle`)]),
    h('p', { class: 'muted small' }, 'A hinted answer earns half, and a round with a hint cannot be perfect. Every hint starts with a short joke ad, unless you have an ad-free pass or an ad-free hint.'),
    h('h2', { class: 'subhead' }, 'Shop'),
    table(['Item', 'Price'], [row('One ad-free hint (your next hint skips the ad)', `${e.adHintPrice} ${CURRENCY}`), row(`Ad-free pass (${e.adFreeDays} days)`, `${e.adFreePrice} ${CURRENCY}`)]),
    h('h2', { class: 'subhead' }, 'Streaks, weekly rhythm and badges'),
    h('p', { class: 'muted' }, `A streak counts every day you finish a round. The weekly rhythm counts different days in a Monday to Sunday week. There are ${BADGES.length} badges to collect. The floor goal adds up everyone's rounds, with no names.`),
    h('h2', { class: 'subhead' }, 'Game by game'), h('p', { class: 'muted small' }, 'Tap a game to read how it works.'),
    h('div', { class: 'gstats' }, GAMES.filter((g) => g.live).map((g) => h('button', { class: 'gs gbtn2', onclick: () => showHow(g.id) }, h('span', { class: 'gic' }, ic(g.icon)), h('b', {}, g.title), h('span', { class: 'muted' }, g.tag)))),
    h('h2', { class: 'subhead' }, 'Who can see what'),
    h('div', { class: 'priv' }, ic('shield-lock'), h('div', {}, h('b', {}, 'Your scores are not a leaderboard'),
      h('p', {}, 'Teammates only see the floor total, with no names. Admins, the managers of this tool, can see names, levels and scores so they can help the team learn. Your nickname is only used to greet you.')))), { narrow: true }));
}

function renderProfile() {
  const p = S.profile, lv = levelInfo(p.coins), comp = petById(p.companion);
  const google = p.fullName || S.user.fullName || p.name || '';
  const nick = h('input', { id: 'nick', class: 'inp', maxlength: 20, value: p.nickname || '', placeholder: google.split(' ')[0] || 'Your nickname', autocomplete: 'off', 'aria-describedby': 'nick-prev' });
  const prev = h('p', { class: 'prev', id: 'nick-prev' });
  const drawPrev = () => { prev.textContent = `Preview: “Hey ${nick.value.trim() || p.name || S.user.name}, ready for an aha?”`; };
  nick.addEventListener('input', drawPrev); drawPrev();
  const lock = h('span', { class: 'lock' }, ic('lock'), 'From your Google account');
  const since = p.firstSeen ? new Date(p.firstSeen).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'My profile'),
    h('div', { class: 'pf' },
      h('div', { class: 'pf-top' }, h('div', { class: 'pf-av', 'aria-hidden': 'true' }, initialsOf(S.user)),
        h('div', {}, h('div', { class: 'pf-name' }, greetName()), h('div', { class: 'muted' }, `Level ${lv.level} · ${lv.name}${since ? ` · playing since ${since}` : ''}`))),
      h('div', { class: 'pf-row' }, h('label', { class: 'lab', for: 'nick' }, 'Nickname'),
        h('div', { class: 'val' }, nick, h('button', { class: 'btn inline', id: 'save-nick', onclick: () => { p.nickname = nick.value.trim(); save(); toast('Nickname saved.'); keepScroll(renderProfile); } }, 'Save'), prev)),
      h('div', { class: 'pf-row' }, h('span', { class: 'lab' }, 'Name'), h('div', { class: 'val' }, h('span', { id: 'pf-name' }, google || '–'), lock)),
      h('div', { class: 'pf-row' }, h('span', { class: 'lab' }, 'Email'), h('div', { class: 'val' }, h('span', { id: 'pf-email' }, S.user.email || p.email || '–'), lock.cloneNode(true))),
      h('div', { class: 'pf-row' }, h('span', { class: 'lab' }, 'Companion'), h('div', { class: 'val' }, petFigure(p.companion, 'hello', 'xs'), h('span', {}, `${comp.name} the ${comp.species}`), h('a', { class: 'more', href: '#/pets' }, 'Change'))),
      h('div', { class: 'pf-row' }, h('span', { class: 'lab' }, 'Where your name shows'),
        h('div', { class: 'val plain-v' }, 'Your nickname greets you on the home page. Reports and feedback use your Google name. Admins can see your name and scores. Teammates cannot.'))),
    h('div', { class: 'center-row' }, h('button', { class: 'btn ghost', onclick: () => { try { sessionStorage.removeItem('rda_sess'); } catch { /* ignore */ } S.store.signOut(onUser); } }, ic('logout'), 'Sign out'))), { narrow: true }));
}

const coinGoal = () => (adFreeActive() ? 'Your ad-free pass is on.' : balanceOf(S.profile) >= eff().adFreePrice ? `You can buy the ad-free pass (${eff().adFreePrice}).` : `${eff().adFreePrice - balanceOf(S.profile)} to go for the ad-free pass.`);

/* ---------- routing and auth ---------- */
function route() {
  const hash = location.hash.replace(/^#/, '') || '/home';
  document.querySelectorAll('.backdrop').forEach((b) => b.remove());
  if (!S.user || !S.profile) return renderLogin();
  const [, a, b] = hash.split('/');
  if (!S.profile.tourDone && a !== 'tour') { S.tourI = 0; return renderTour(); }
  if (a !== 'help') S.prevHash = `#${hash}`;
  if (a === 'tour') return renderTour();
  if (a === 'game') return renderIntro(b);
  if (a === 'play') return play(b);
  if (a === 'card') return renderCard();
  if (a === 'pets') return renderPets();
  if (a === 'settings') return renderSettings();
  if (a === 'coins') return renderCoins();
  if (a === 'guide') return renderGuide();
  if (a === 'profile') return renderProfile();
  if (a === 'help') return renderHelp();
  if (a === 'new') return renderNews();
  if (a === 'admin') return adminView(S, { page: (kids) => page(kids, { cls: 'adminpage' }), view, go, eff, setCounts: (r, f) => { S.reportCount = r; S.feedbackCount = f; } }, b || 'insights');
  return renderHome();
}
const go = (p) => { location.hash = '#' + p; };

async function onUser(u, msg) {
  S.loginMsg = msg || '';
  if (!u) { S.user = null; S.profile = null; S.admin = false; return renderLogin(); }
  let gift = null;
  try {
    S.user = u;
    S.profile = await S.store.loadProfile(u);
    S.admin = await S.store.isAdmin(u);
    S.remote = await S.store.getSettings().catch(() => ({}));
    S.announce = await S.store.getAnnounce().catch(() => ({ banner: {}, entries: [], minor: '' }));
    applyContent(S.announce);
    if (S.admin) {
      S.reportCount = await S.store.countReports().catch(() => 0);
      S.feedbackCount = await S.store.countOpenFeedback().catch(() => 0);
    }
    // who signed in and when (counted once per browser session)
    const p = S.profile;
    p.fullName = u.fullName || p.fullName || ''; p.email = u.email || p.email || '';
    if (!p.firstSeen) p.firstSeen = Date.now();
    let fresh = true;
    try { fresh = !sessionStorage.getItem('rda_sess'); sessionStorage.setItem('rda_sess', '1'); } catch { /* storage blocked */ }
    if (fresh) p.signIns = (p.signIns || 0) + 1;
    p.lastSeen = Date.now();
    gift = await claimGifts();
    S.store.saveProfile(u, p).catch(() => {});
    applyPrefs();
    startPetPreload(S.profile.companion);
  } catch (e) {
    console.error(e);
    S.user = null; S.loginMsg = 'Could not load your profile. Check your connection and try again.';
    return renderLogin();
  }
  route();
  if (gift) showGift(gift);
}

/* Pet images load in order of need: the sign-in pet first (the page waits up to 2 seconds for it), then the tour and
   companion-picker poses, then everything else quietly in the background. */
function startPetPreload(companion) {
  const ids = PETS.map((x) => x.id);
  const order = companion ? [companion, ...ids.filter((x) => x !== companion)] : ids;
  return preloadPets({
    first: companion ? PET_MOODS.map((m) => [companion, m]) : [['penguin', 'hello']],
    then: ids.flatMap((id) => [[id, 'hello'], [id, 'explain']]),
    later: order.flatMap((id) => PET_MOODS.map((m) => [id, m])),
  });
}

export async function boot() {
  const petsReady = startPetPreload(null);
  S.store = await createStore();
  window.addEventListener('hashchange', route);
  // Close the menu on an outside click or Escape, and tell screen readers it is closed.
  const closeMenus = (refocus) => document.querySelectorAll('.menu:not([hidden])').forEach((mn) => {
    mn.hidden = true;
    const wrap = mn.parentElement, av = wrap && wrap.querySelector('.avatar'), sc = wrap && wrap.querySelector('.scrim');
    if (sc) sc.classList.remove('on');
    document.body.classList.remove('noscroll');
    if (av) { av.setAttribute('aria-expanded', 'false'); av.setAttribute('aria-label', 'Open your menu'); if (refocus && mn.contains(document.activeElement)) av.focus(); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) closeMenus(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(true); });
  await petsReady; // at most 2 seconds, so the sign-in pet is already there when the page appears
  await S.store.init(onUser);
}
