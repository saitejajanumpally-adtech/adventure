import { CONFIG } from './config.js';
import { CATS, GAMES, MODES, LEVELS, TIPS, GAME_TIPS, PETS, TOUR, CURRENCY, BADGES, LINES, GAME_LEVELS, TEXT_SIZES, WHATS_NEW, WHATS_NEW_MINOR } from './data.js';
import { shuffle, mulberry32, seedFrom, dateKey, yesterdayKey, weekKey, weekdayIndex, parseDevice } from './util.js';
import { createStore } from './store.js';
import { h, ic, fill, toast, petFigure, petById, wordmark, modal, fmtTime, initialsOf, confetti } from './ui.js';
import { showHintAd } from './ads.js';
import { makeTimer, runQuiz, runFlow, runMatch, runSort, runCross, hooks } from './engines.js';
import { adminView } from './admin.js';

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
const LIVE = GAMES.filter((g) => g.live);

/* Settings the admin can change in the app. They win over config.js. */
const eff = () => ({
  floorGoal: Number(S.remote.floorGoal) || CONFIG.FLOOR_GOAL,
  weekDays: Number(S.remote.weekDays) || CONFIG.WEEK_GOAL_DAYS,
  weekBonus: S.remote.weekBonus != null && S.remote.weekBonus !== '' ? Number(S.remote.weekBonus) : CONFIG.WEEK_BONUS,
  adSeconds: Number(S.remote.adSeconds) || CONFIG.AD_SECONDS,
  adSkip: Number(S.remote.adSkip) || CONFIG.AD_SKIP_AFTER,
  adFreePrice: Number(S.remote.adFreePrice) || CONFIG.AD_FREE_PRICE,
  adFreeDays: Number(S.remote.adFreeDays) || CONFIG.AD_FREE_DAYS,
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
  if (left.id === 'fire') return `${Math.max(1, 7 - (p.bestStreak || 0))} more ${7 - (p.bestStreak || 0) === 1 ? 'day' : 'days'} in a row earns On Fire.`;
  if (left.id === 'pals') return 'Meet all 8 pets to earn Pet Pals.';
  if (left.id === 'allround') return `${LIVE.filter((g) => !isHidden(g) && !p.played[g.id]).length} games left to earn All-Rounder.`;
  return `${Math.max(0, LEVELS[4].t - p.coins)} AdCoins to Level 5 and Yield Pro.`;
}

/* ---------- page frame: top bar with logo, streak, AdCoins and profile ---------- */
function topbar() {
  const p = S.profile, lv = levelInfo(p.coins), nn = newCount();
  const item = (href, icon, text, extra, badgeN) => h('a', { role: 'menuitem', href, onclick: extra }, ic(icon), text, badgeN ? h('span', { class: 'badge' }, badgeN) : null);
  const adminN = (S.reportCount || 0) + (S.feedbackCount || 0);
  const menu = h('div', { class: 'menu', role: 'menu', hidden: true },
    h('div', { class: 'menu-head' }, h('b', {}, p.nickname || p.name || S.user.name), h('span', {}, `Level ${lv.level} \u00B7 ${balanceOf(p)} ${CURRENCY}`)),
    item('#/card', 'chart-bar', 'My scorecard'),
    item('#/pets', 'paw', 'My pets'),
    item('#/settings', 'settings', 'Settings'),
    item('#/help', 'message-circle', 'Help and feedback'),
    item('#/new', 'sparkles', "What's new", null, nn),
    item('#/tour', 'map-2', 'Replay the tour', () => { S.tourI = 0; }),
    S.admin ? item('#/admin', 'inbox', 'Admin', null, adminN) : null,
    h('button', { role: 'menuitem', class: 'menu-out', onclick: () => { try { sessionStorage.removeItem('rda_sess'); } catch { /* ignore */ } S.store.signOut(onUser); } }, ic('logout'), 'Sign out'));
  const avatar = h('button', { class: 'avatar', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Profile menu', onclick: (e) => {
    e.stopPropagation();
    const open = menu.hidden; menu.hidden = !open; avatar.setAttribute('aria-expanded', String(open));
  } }, h('span', { class: 'ini' }, initialsOf(S.user)), ic('chevron-down'), nn ? h('span', { class: 'avdot', 'aria-hidden': 'true' }) : null);
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-in' },
      h('a', { class: 'brand', href: '#/home', 'aria-label': 'ADVenture home' }, wordmark('sm')),
      h('div', { class: 'tb-right' },
        h('span', { class: 'pill f', title: 'Streak' }, ic('flame'), String(streakNow())),
        h('span', { class: 'pill c', title: `${CURRENCY} you can spend` }, ic('coin'), String(balanceOf(p))),
        h('div', { class: 'avwrap' }, avatar, menu))));
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
function gameCard(g) {
  const c = catOf(g);
  if (!g.live || isHidden(g)) return h('div', { class: 'gcard soon', 'aria-label': `${g.title}, coming soon` }, h('span', { class: 'gic' }, ic(g.icon)), h('div', {}, h('b', {}, g.title), h('span', {}, 'Coming soon')));
  return h('a', { class: 'gcard', href: `#/game/${g.id}`, style: `--bg:${c.bg};--fg:${c.fg}` }, h('span', { class: 'gic' }, ic(g.icon)), h('div', {}, h('b', {}, g.title), h('span', {}, g.tag)));
}

function renderHome() {
  const p = S.profile, today = dateKey(), lv = levelInfo(p.coins), done = p.missionDay === today;
  const hr = new Date().getHours();
  const greet = `${hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}, ${greetName()}.`;
  const away = daysAway();
  const baseMood = !p.lastDay ? 'hello' : away >= 3 ? 'sleepy' : 'happy';
  const comp = petById(p.companion);
  const baseMsg = !p.lastDay ? 'Start with the daily quest. It takes about five minutes.' : away >= 3 ? 'We missed you. A quick round gets your streak going again.'
    : nudge() || TIPS[seedFrom(today) % TIPS.length];

  // mascot: tap to make it react
  const mascot = h('button', { class: 'mascot', 'aria-label': `${comp.name} the ${comp.species}. Tap to say hello.` });
  const bubble = h('div', { class: 'hbubble', role: 'status' });
  const setMascot = (mood, text) => { fill(mascot, petFigure(p.companion, mood, 'phero')); fill(bubble, h('b', {}, greet), h('p', {}, text)); };
  mascot.addEventListener('click', () => setMascot(pick(['hello', 'celebrate', 'happy', 'explain', 'proud']), pick(TIPS)));
  setMascot(baseMood, baseMsg);

  const live = LIVE.filter((g) => g.kind !== 'mission' && !isHidden(g));
  const featured = live.find((g) => g.id === eff().featured);
  let rec = featured || live.find((g) => g.id !== p.lastGame) || live[0];
  const recBox = h('section', { class: 'rec' });
  const drawRec = () => fill(recBox,
    h('span', { class: 'gic big' }, ic(rec.icon)),
    h('div', { class: 'rec-t' }, h('p', { class: 'small-lab' }, featured && rec.id === featured.id ? 'Featured this week' : 'Recommended for you'), h('b', {}, rec.title), h('p', { class: 'muted' }, rec.tag)),
    h('div', { class: 'rec-a' }, h('a', { class: 'btn inline ghost', href: `#/game/${rec.id}` }, ic('player-play'), 'Play'),
      h('button', { class: 'btn inline ghost', onclick: () => { const pool = live.filter((g) => g.id !== rec.id); go(`/game/${pick(pool).id}`); } }, ic('sparkles'), 'Surprise me')));
  drawRec();
  // work out which game has the most questions the player has not seen yet
  (async () => {
    try {
      let best = null;
      for (const g of live) {
        const items = ((await S.store.loadPack(g.id)).items || []).filter((x) => x && x.id && !x.disabled);
        const seen = new Set(seenOf(g.id));
        const fresh = items.filter((x) => !seen.has(x.id)).length;
        const score = fresh * 10 - (p.played[g.id] ? p.played[g.id].plays : 0) - (g.id === p.lastGame ? 1000 : 0);
        if (!best || score > best.score) best = { g, score };
      }
      if (!featured && best && best.g.id !== rec.id && recBox.isConnected) { rec = best.g; drawRec(); }
    } catch { /* keep the default */ }
  })();

  const wd = weekDaysNow(), todayIdx = weekdayIndex();
  const wbonus = p.weekBonusKey === weekKey();
  const journey = h('section', { class: 'jour' },
    h('div', { class: 'row wrap' }, h('b', {}, `Level ${lv.level}: ${lv.name}`), h('span', { class: 'muted' }, lv.next ? `${lv.next.t - p.coins} ${CURRENCY} to ${lv.next.n}` : 'Top level reached')),
    h('div', { class: 'path', role: 'img', 'aria-label': `Level ${lv.level} of ${LEVELS.length}` }, LEVELS.flatMap((l, k) => [
      k ? h('i', { class: `ln ${k <= lv.idx ? 'on' : ''}` }) : null,
      h('i', { class: `nd ${k < lv.idx ? 'on' : ''} ${k === lv.idx ? 'cur' : ''}` })])),
    h('div', { class: 'wk' }, h('b', {}, 'This week'),
      ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, k) => h('span', { class: `d ${wd.includes(k) ? 'on' : ''} ${k === todayIdx && !wd.includes(k) ? 'td' : ''}` }, d)),
      h('span', { class: 'muted' }, wbonus ? `Weekly bonus earned (+${eff().weekBonus})` : `${wd.length} of ${eff().weekDays} days \u00B7 +${eff().weekBonus} ${CURRENCY} at ${eff().weekDays}`)));

  const sections = CATS.map((c) => {
    const gs = GAMES.filter((g) => g.cat === c.id);
    return h('section', { class: 'cat', style: `--panel:${c.panel};--ink:${c.fg};--tag:${c.tagInk}` },
      h('div', { class: 'cat-head' }, h('b', {}, c.title), h('span', {}, c.tagline)),
      h('div', { class: 'gcards' }, gs.map(gameCard)));
  });

  const floorBar = h('i', { style: 'width:0%' }), floorTxt = h('p', { class: 'muted' }, 'Loading this week\u2019s total\u2026');
  const drawFloor = () => {
    const n = S.floor || 0, goal = eff().floorGoal;
    floorBar.style.width = `${Math.min(100, Math.round((n / goal) * 100))}%`;
    floorTxt.textContent = `${Math.min(n, goal)} of ${goal} puzzle rounds this week. No names, just the team.`;
  };
  S.store.getFloor(weekKey()).then((n) => { S.floor = n; if (floorTxt.isConnected) drawFloor(); }).catch(() => { floorTxt.textContent = 'The floor total is unavailable right now.'; });
  if (S.floor != null) drawFloor();

  const badgeTiles = BADGES.map((b) => {
    const got = !!p.badges[b.id];
    return h('div', { class: `bdg ${got ? 'got' : ''}`, title: `${b.title}: ${b.desc}`, 'aria-label': `${b.title}, ${got ? 'earned' : 'locked'}: ${b.desc}` }, h('span', { class: 'bi' }, ic(got ? b.icon : 'lock')), h('b', {}, b.title));
  });
  const extras = h('section', { class: 'extras' },
    h('div', { class: 'xcard' }, h('div', { class: 'row' }, h('b', {}, 'Badges'), h('span', { class: 'muted' }, `${Object.keys(p.badges).length} of ${BADGES.length}`)), h('div', { class: 'bdgs' }, badgeTiles)),
    h('div', { class: 'xcard' }, h('b', {}, 'Floor goal'), h('div', { class: 'bar floor' }, floorBar), floorTxt));

  const bn = S.announce.banner || {};
  const bannerOn = bn.on && bn.text && (!bn.until || today <= bn.until);
  view(page([
    bannerOn ? h('div', { class: 'banner', role: 'status' }, ic('speakerphone'), h('span', {}, bn.text)) : null,
    h('section', { class: 'qhero' },
      mascot,
      h('div', { class: 'qh-main' },
        bubble,
        h('p', { class: 'small-lab' }, "Today's quest"),
        h('h2', {}, done ? 'Quest complete' : '3 puzzles, 5 minutes'),
        h('div', { class: 'steps', 'aria-hidden': 'true' }, [0, 1, 2].map(() => h('i', { class: done ? 'on' : '' })), h('span', {}, done ? 'Completed today' : 'Not started yet')),
        h('div', { class: 'row gap wrap' },
          h('a', { class: 'btn quest', href: '#/play/daily-warmup' }, ic('player-play'), done ? 'Play again' : 'Start quest'),
          h('span', { class: 'rw' }, ic('coin'), done ? 'Bonus earned today' : `+${30} ${CURRENCY} bonus`)))),
    recBox, journey, sections, extras,
    S.store.demo ? h('p', { class: 'demo' }, 'Demo mode: no real login. Your progress stays in this browser.') : null]));
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
  if (!g || !g.live || isHidden(g)) return go('/home');
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
      h('div', { class: 'row gap wrap' }, h('button', { class: 'btn light inline', onclick: () => showHow(id) }, ic('question-mark'), 'How to play'), pool)),
    h('h3', {}, 'How do you want to play?'),
    h('div', { class: 'grid modes' }, MODES.map((m) => m.live
      ? h('a', { class: 'mode', href: `#/play/${id}` }, ic(m.icon, 'big'), h('div', {}, h('p', {}, m.title), h('span', {}, m.sub)))
      : h('div', { class: 'mode soon', 'aria-label': `${m.title}, coming soon` }, ic(m.icon, 'big'), h('div', {}, h('p', {}, m.title), h('span', {}, 'Coming soon')))))), { narrow: true }));
  if (!S.profile.howSeen[id]) { S.profile.howSeen[id] = true; save(); showHow(id); }
  try {
    if (g.kind === 'mission') { pool.textContent = 'Your three puzzles are picked from questions you have not seen yet.'; return; }
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
  const unit = g.kind === 'tf' || g.kind === 'mcq' || g.kind === 'mission' ? 'question' : 'puzzle';
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
  const setBubble = (main, mood, sub) => {
    fill(petBox, petFigure(hostPet, mood, 'pcoach'));
    fill(bubble, h('p', {}, main), sub ? h('p', { class: 'sub' }, sub) : null);
  };
  const tips = GAME_TIPS[g.id] || [''];
  const hideBtn = h('button', { class: 'chide', 'aria-label': 'Hide coach', onclick: () => setCoach(false) }, ic('chevron-left'));
  const panel = h('aside', { class: 'coachpanel', 'aria-label': `${pet.name}, your coach` },
    hideBtn, h('div', { class: 'cname' }, h('b', {}, pet.name), h('span', {}, `${g.title} coach`)),
    petBox, bubble, cnote, h('div', { class: 'cactions' }, hintCoach, howCoach));
  const thumb = petFigure(hostPet, 'happy', 'thumb');
  const rail = h('button', { class: 'coachrail', 'aria-label': 'Show coach', onclick: () => setCoach(true) }, thumb, h('span', {}, 'Coach'), ic('chevron-right'));
  const card = h('section', { class: 'qcard' }, head, box, hnote, h('div', { class: 'hint-under' }, hintCard, howCard), h('p', { class: 'kbtip' }, g.kind === 'tf' ? 'Tip: press M for Myth or F for Fact.' : g.kind === 'mcq' || g.kind === 'mission' ? 'Tip: press A, B, C or D on your keyboard.' : ''));
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
      cnote.textContent = ''; api.note('');
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
        if (left != null) cnote.textContent = `${left} ${left === 1 ? 'hint' : 'hints'} left in this round.`;
      }
    },
    lockHint() { stopIdle(); if (hintFn) hintBoth((b) => { b.disabled = true; }); },
    coach: {
      reset() { setBubble(pick(tips), 'explain'); cnote.textContent = ''; },
      react(kind) { answeredAny = true; setBubble(pick(lines[kind] || lines.right), MOOD[kind] || 'happy'); },
      hintBefore() { setBubble(pick(lines.hint), 'think'); },
      hintAfter(main, sub) { setBubble(main, 'explain', sub); },
      note(text) { cnote.textContent = text || ''; }
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
    else {
      pool = await loadUsable(id);
      items = pickFresh(pool, g.size || 1, seenOf(id)).map((it) => ({ ...it, kind: g.kind, game: id }));
    }
    if (!box.isConnected) return;
    if (!items.length) { fill(box, h('p', {}, 'No puzzles are available for this game right now.'), h('a', { class: 'btn', href: '#/home' }, 'Back to home')); return; }
    timer.start();
    if (sh.clock) S.clock = setInterval(() => { sh.clock.querySelector('.ct').textContent = fmtTime(timer.ms()); }, 500);
    const ctx = { gameId: id, timer, adsOn: () => !adFreeActive(), hostPet, shell: sh, showAd: (pet) => showHintAd(pet, { seconds: eff().adSeconds, skipAfter: eff().adSkip }), report: (it, reason) => reportItem(it.game || id, it, reason) };
    const res = ['mission', 'tf', 'mcq'].includes(g.kind) ? await runQuiz(box, items, ctx)
      : await ({ flow: runFlow, match: runMatch, sort: runSort, cross: runCross }[g.kind])(box, items[0], ctx);
    timer.stop(); sh.destroy();
    const ms = timer.ms();
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
  const metric = (label, value) => h('div', { class: 'metric' }, h('span', {}, label), h('b', {}, value));
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'My scorecard'),
    h('div', { class: 'grid4' }, metric('Level', `${lv.level}: ${lv.name}`), metric(`${CURRENCY} earned`, p.coins), metric('Spent', p.spent || 0), metric('Balance', balanceOf(p)), metric('Streak', plural(streakNow(), 'day')), metric('Best streak', plural(p.bestStreak || 0, 'day')), metric('Pets met', `${Object.keys(p.met).length} of ${PETS.length}`), metric('Badges', `${Object.keys(p.badges).length} of ${BADGES.length}`)),
    h('p', { class: 'muted small', style: 'margin-top:8px' }, 'Your level comes from everything you have earned, so spending AdCoins never lowers it.'),
    h('h3', {}, 'By game'),
    h('div', { class: 'card' }, GAMES.filter((g) => g.live).map((g) => {
      const s = p.played[g.id], bt = p.bestTime[g.id];
      return h('div', { class: 'srow' }, ic(g.icon), h('span', {}, g.title, s ? h('small', { class: 'lvtag' }, ` Level ${gameLevel(s.correct)}`) : null), h('span', { class: 'muted' }, s ? `${plural(s.plays, 'play')}, ${s.total ? Math.round((s.correct / s.total) * 100) : 0}% right${bt ? `, best ${fmtTime(bt)}` : ''}` : 'Not played yet'));
    })),
    h('h3', {}, 'Badges'),
    h('div', { class: 'card' }, BADGES.map((b) => h('div', { class: 'srow' }, ic(p.badges[b.id] ? b.icon : 'lock'), h('span', {}, `${b.title}: ${b.desc}`), h('span', { class: 'muted' }, p.badges[b.id] ? 'Earned' : 'Locked'))))), { narrow: true }));
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
  const p = S.profile, st = p.settings, e = eff();
  const toggle = (key, label, sub) => { const cb = h('input', { type: 'checkbox', id: `s-${key}`, checked: st[key] !== false && !!st[key], onchange: () => { st[key] = cb.checked; applyPrefs(); save(); } }); return h('label', { class: 'switch', for: `s-${key}` }, cb, h('span', {}, h('b', {}, label), h('small', {}, sub))); };
  const sizeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Text size' });
  const drawSize = () => fill(sizeSeg, TEXT_SIZES.map((t) => h('button', { class: `segb ${(st.textSize || 'standard') === t.id ? 'on' : ''}`, role: 'radio', 'aria-checked': String((st.textSize || 'standard') === t.id), onclick: () => { st.textSize = t.id; applyPrefs(); save(); drawSize(); } }, t.label)));
  drawSize();
  const passBox = h('div', { class: 'passbox' });
  const drawPass = () => {
    const active = adFreeActive(), bal = balanceOf(p);
    const until = new Date(p.adFreeUntil || 0).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const can = bal >= e.adFreePrice;
    fill(passBox,
      h('div', { class: 'passrow' }, h('div', { class: 'grow' }, h('b', {}, active ? `Ad-free hints until ${until}` : `Ad-free pass: ${e.adFreeDays} days`),
        h('div', { class: 'muted' }, active ? `Add ${e.adFreeDays} more days for ${e.adFreePrice} ${CURRENCY}.` : can ? `You have ${bal} ${CURRENCY}.` : `You have ${bal} ${CURRENCY}. You need ${e.adFreePrice - bal} more.`)),
        h('button', { class: `btn ${can ? '' : 'off'}`, disabled: !can, onclick: () => {
          const m = modal(h('div', { class: 'how' }, h('h2', {}, 'Buy the ad-free pass?'), h('p', { class: 'muted' }, `This spends ${e.adFreePrice} ${CURRENCY} for ${e.adFreeDays} days without the joke ad. Your level is not affected.`),
            h('div', { class: 'center-row gapb' }, h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Not now'), h('button', { class: 'btn', onclick: () => {
              if (balanceOf(p) < e.adFreePrice) { m.close(); return; }
              p.spent = (p.spent || 0) + e.adFreePrice; p.adFreeUntil = Math.max(Date.now(), p.adFreeUntil || 0) + e.adFreeDays * 864e5;
              save(); m.close(); toast('Ad-free hints are on.'); renderSettings();
            } }, `Buy for ${e.adFreePrice}`))), { label: 'Buy the ad-free pass' });
        } }, active ? `Add ${e.adFreeDays} days` : `Buy for ${e.adFreePrice}`)));
  };
  drawPass();
  const nick = h('input', { id: 'nick', class: 'inp', maxlength: 20, value: p.nickname || '', placeholder: p.name || 'Your name', autocomplete: 'off' });
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'Settings'),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Play'),
      toggle('coach', 'Show the coach panel on laptops', 'The pet panel beside the question. You can also hide it from the game screen.'),
      toggle('liveTimer', 'Show a timer while playing', 'Your time always shows on the results screen.'),
      toggle('motion', 'Animations', 'Pet movement, confetti and the logo animation.')),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Text size'), h('p', { class: 'muted', style: 'margin:2px 0 10px' }, 'Changes the question and answer text everywhere.'), sizeSeg),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Ad-free hints'), h('p', { class: 'muted', style: 'margin:2px 0 10px' }, 'Hints play a short joke ad first. Spend AdCoins to skip it for a while.'), passBox,
      h('p', { class: 'muted', style: 'margin-top:8px' }, 'Your level is based on everything you have earned, so spending never lowers it.')),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Your name in greetings'), h('label', { for: 'nick' }, 'Display name'), nick,
      h('p', { class: 'muted', style: 'margin:6px 0 10px' }, `Only used in "Good morning, ${greetName()}". Reports and leaderboards use your Google account name.`),
      h('button', { class: 'btn', onclick: () => { p.nickname = nick.value.trim(); save(); toast('Name saved.'); renderSettings(); } }, 'Save name')),
    h('p', { class: 'muted center', style: 'text-align:center' }, `R&D AdVenture \u00B7 version ${CONFIG.APP_VERSION}`)), { narrow: true }));
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
  if (a === 'help') return renderHelp();
  if (a === 'new') return renderNews();
  if (a === 'admin') return adminView(S, { page: (kids) => page(kids, { cls: 'adminpage' }), view, go, eff, setCounts: (r, f) => { S.reportCount = r; S.feedbackCount = f; } }, b || 'insights');
  return renderHome();
}
const go = (p) => { location.hash = '#' + p; };

async function onUser(u, msg) {
  S.loginMsg = msg || '';
  if (!u) { S.user = null; S.profile = null; S.admin = false; return renderLogin(); }
  try {
    S.user = u;
    S.profile = await S.store.loadProfile(u);
    S.admin = await S.store.isAdmin(u);
    S.remote = await S.store.getSettings().catch(() => ({}));
    S.announce = await S.store.getAnnounce().catch(() => ({ banner: {}, entries: [], minor: '' }));
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
    S.store.saveProfile(u, p).catch(() => {});
    applyPrefs();
  } catch (e) {
    console.error(e);
    S.user = null; S.loginMsg = 'Could not load your profile. Check your connection and try again.';
    return renderLogin();
  }
  route();
}

export async function boot() {
  S.store = await createStore();
  window.addEventListener('hashchange', route);
  document.addEventListener('click', () => document.querySelectorAll('.menu').forEach((m) => { m.hidden = true; }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.menu').forEach((m) => { m.hidden = true; }); });
  await S.store.init(onUser);
}
