import { CONFIG } from './config.js';
import { CATS, GAMES, MODES, LEVELS, TIPS, GAME_TIPS, PETS, TOUR, CURRENCY, BADGES, LINES } from './data.js';
import { shuffle, mulberry32, seedFrom, dateKey, yesterdayKey, weekKey, weekdayIndex } from './util.js';
import { createStore } from './store.js';
import { h, ic, fill, toast, petFigure, petById, wordmark, modal, fmtTime, initialsOf, confetti } from './ui.js';
import { showHintAd } from './ads.js';
import { makeTimer, runQuiz, runFlow, runMatch, runSort, runCross, hooks } from './engines.js';
import { adminView } from './admin.js';

const $app = document.getElementById('app');
const S = { store: null, user: null, profile: null, admin: false, reportCount: 0, loginMsg: '', timer: null, clock: null, host: {}, tourI: 0, pick: null, floor: null };
const gameById = (id) => GAMES.find((g) => g.id === id);
const catOf = (g) => CATS.find((c) => c.id === g.cat);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const save = () => S.store.saveProfile(S.user, S.profile).catch(() => toast('Could not save your progress. Check your connection.'));
const applyPrefs = () => document.body.classList.toggle('nomotion', !S.profile.settings.motion);
const seenOf = (g) => (S.profile.seenAll && S.profile.seenAll[g]) || [];
const LIVE = GAMES.filter((g) => g.live);

function view(el) {
  if (S.clock) { clearInterval(S.clock); S.clock = null; }
  if (S.timer) { S.timer.stop(); S.timer = null; }
  fill($app, el);
  window.scrollTo(0, 0);
}

function levelInfo(coins) {
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
  if (id === 'allround') return LIVE.every((g) => p.played[g.id]);
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
  if (left.id === 'allround') return `${LIVE.filter((g) => !p.played[g.id]).length} games left to earn All-Rounder.`;
  return `${Math.max(0, LEVELS[4].t - p.coins)} AdCoins to Level 5 and Yield Pro.`;
}

/* ---------- page frame: top bar with logo, streak, AdCoins and profile ---------- */
function topbar() {
  const p = S.profile, lv = levelInfo(p.coins);
  const item = (href, icon, text, extra) => h('a', { role: 'menuitem', href, onclick: extra }, ic(icon), text);
  const menu = h('div', { class: 'menu', role: 'menu', hidden: true },
    h('div', { class: 'menu-head' }, h('b', {}, p.name || S.user.name), h('span', {}, `Level ${lv.level} \u00B7 ${p.coins} ${CURRENCY}`)),
    item('#/card', 'chart-bar', 'My scorecard'),
    item('#/pets', 'paw', 'Pet collection'),
    item('#/settings', 'settings', 'Settings'),
    item('#/tour', 'map-2', 'Replay the tour', () => { S.tourI = 0; }),
    S.admin ? h('a', { role: 'menuitem', href: '#/admin' }, ic('inbox'), 'Admin', S.reportCount ? h('span', { class: 'badge' }, S.reportCount) : null) : null,
    h('button', { role: 'menuitem', class: 'menu-out', onclick: () => S.store.signOut(onUser) }, ic('logout'), 'Sign out'));
  const avatar = h('button', { class: 'avatar', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Profile menu', onclick: (e) => {
    e.stopPropagation();
    const open = menu.hidden; menu.hidden = !open; avatar.setAttribute('aria-expanded', String(open));
  } }, h('span', { class: 'ini' }, initialsOf(S.user)), ic('chevron-down'));
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-in' },
      h('a', { class: 'brand', href: '#/home', 'aria-label': 'ADVenture home' }, wordmark('sm')),
      h('div', { class: 'tb-right' },
        h('span', { class: 'pill f', title: 'Streak' }, ic('flame'), String(streakNow())),
        h('span', { class: 'pill c', title: CURRENCY }, ic('coin'), String(p.coins)),
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
    h('p', { class: 'tag' }, 'Learn AdTech by playing'), btn,
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
  if (!g.live) return h('div', { class: 'gcard soon', 'aria-label': `${g.title}, coming soon` }, h('span', { class: 'gic' }, ic(g.icon)), h('div', {}, h('b', {}, g.title), h('span', {}, 'Coming soon')));
  return h('a', { class: 'gcard', href: `#/game/${g.id}`, style: `--bg:${c.bg};--fg:${c.fg}` }, h('span', { class: 'gic' }, ic(g.icon)), h('div', {}, h('b', {}, g.title), h('span', {}, g.tag)));
}

function renderHome() {
  const p = S.profile, today = dateKey(), lv = levelInfo(p.coins), done = p.missionDay === today;
  const hr = new Date().getHours();
  const greet = `${hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}, ${p.name || S.user.name}.`;
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

  const live = LIVE.filter((g) => g.kind !== 'mission');
  const last = p.lastGame && gameById(p.lastGame);
  let rec = live.find((g) => g.id !== p.lastGame) || live[0];
  const recBox = h('section', { class: 'rec' });
  const drawRec = () => fill(recBox,
    h('span', { class: 'gic big' }, ic(rec.icon)),
    h('div', { class: 'rec-t' }, h('p', { class: 'small-lab' }, 'Recommended for you'), h('b', {}, rec.title), h('p', { class: 'muted' }, rec.tag)),
    h('div', { class: 'rec-a' }, h('a', { class: 'btn inline ghost', href: `#/game/${rec.id}` }, ic('player-play'), 'Play'),
      h('button', { class: 'btn inline ghost', onclick: () => { const pool = live.filter((g) => g.id !== rec.id); go(`/game/${pick(pool).id}`); } }, ic('sparkles'), 'Surprise me')));
  drawRec();
  // work out which game has the most questions the player has not seen yet
  (async () => {
    try {
      let best = null;
      for (const g of live) {
        const items = (await S.store.loadPack(g.id)).items || [];
        const seen = new Set(seenOf(g.id));
        const fresh = items.filter((x) => x && x.id && !seen.has(x.id)).length;
        const score = fresh * 10 - (p.played[g.id] ? p.played[g.id].plays : 0) - (g.id === p.lastGame ? 1000 : 0);
        if (!best || score > best.score) best = { g, score };
      }
      if (best && best.g.id !== rec.id && recBox.isConnected) { rec = best.g; drawRec(); }
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
      h('span', { class: 'muted' }, wbonus ? `Weekly bonus earned (+${CONFIG.WEEK_BONUS})` : `${wd.length} of ${CONFIG.WEEK_GOAL_DAYS} days \u00B7 +${CONFIG.WEEK_BONUS} ${CURRENCY} at ${CONFIG.WEEK_GOAL_DAYS}`)));

  const sections = CATS.map((c) => {
    const gs = GAMES.filter((g) => g.cat === c.id);
    return h('section', { class: 'cat', style: `--panel:${c.panel};--ink:${c.fg};--tag:${c.tagInk}` },
      h('div', { class: 'cat-head' }, h('b', {}, c.title), h('span', {}, c.tagline)),
      h('div', { class: 'gcards' }, gs.map(gameCard)));
  });

  const floorBar = h('i', { style: 'width:0%' }), floorTxt = h('p', { class: 'muted' }, 'Loading this week\u2019s total\u2026');
  const drawFloor = () => {
    const n = S.floor || 0, goal = CONFIG.FLOOR_GOAL;
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

  view(page([
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
  return (pack.items || []).filter((it) => it && it.id);
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
  const r = await S.store.report(game, item, reason, S.user.uid);
  S.profile.reported[key] = true; save();
  return r;
}

/* ---------- game intro ---------- */
async function renderIntro(id) {
  const g = gameById(id);
  if (!g || !g.live) return go('/home');
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
  if (p.weekDays.length >= CONFIG.WEEK_GOAL_DAYS && p.weekBonusKey !== wk) { weekBonus = CONFIG.WEEK_BONUS; p.weekBonusKey = wk; p.coins += weekBonus; }
  const s = p.played[gameId] || { plays: 0, correct: 0, total: 0 };
  s.plays++; s.correct += res.correct; s.total += res.total; p.played[gameId] = s;
  if (res.perfect) p.perfectRounds = (p.perfectRounds || 0) + 1;
  if (res.correct === res.total && (!p.bestTime[gameId] || ms < p.bestTime[gameId])) p.bestTime[gameId] = ms;
  res.items.forEach((it) => { const arr = (p.seenAll[it.game] || []).filter((x) => x !== it.id); arr.push(it.id); p.seenAll[it.game] = arr.slice(-2000); });
  p.lastGame = gameId;
  const b = checkBadges();
  const after = levelInfo(p.coins);
  S.floor = (S.floor || 0) + 1;
  S.store.bumpFloor(wk).catch(() => {});
  save();
  return { gain, bonus, weekBonus, badges: b.fresh, badgeCoins: b.coins, mode, best, leveled: after.idx > levelBefore, after };
}

function renderResult(g, res, r, ms, left) {
  const p = S.profile, comp = petById(p.companion);
  const ratio = res.total ? res.correct / res.total : 0;
  const head = ratio === 1 ? 'Perfect round' : ratio >= 0.7 ? 'Nice work' : 'Good practice';
  const mood = r.leveled || ratio === 1 ? 'celebrate' : ratio >= 0.7 ? 'proud' : 'encourage';
  const lines = LINES[p.companion] || LINES.panda;
  const petLine = pick(ratio >= 0.7 ? lines.great : lines.keep);
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
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${r.after.pct}%` })),
      h('p', { class: 'muted small' }, r.leveled ? `Level up! You are now ${r.after.name}.` : `Level ${r.after.level}: ${r.after.name}`),
      pool ? h('p', { class: 'muted small' }, pool) : null),
    h('div', { class: 'stack' },
      h('a', { class: 'btn', href: `#/play/${g.id}`, onclick: () => { if (location.hash === `#/play/${g.id}`) setTimeout(route, 0); } }, 'Play again'),
      h('a', { class: 'btn ghost', href: '#/home' }, 'Back to home'))), { narrow: true }));
  if (ratio === 1 || r.leveled || r.bonus || r.badges.length) confetti();
}

/* ---------- play: coach panel on the left, question card on the right ---------- */
function buildPlayShell(g, hostPet) {
  const st = S.profile.settings, pet = petById(hostPet), lines = LINES[hostPet] || LINES.panda;
  let answeredAny = false, hintFn = null;
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

  const mkHint = (cls) => h('button', { class: `hintbtn ${cls}`, hidden: true, onclick: () => { if (hintFn) hintFn(); } }, h('span', { class: 'bl' }, ic('bulb')), h('span', { class: 'hl' }, 'Hint'));
  const hintCoach = mkHint('in-coach'), hintCard = mkHint('in-card');
  const howBtn = h('button', { class: 'hintbtn in-coach how', onclick: () => showHow(g.id) }, h('span', { class: 'bl' }, ic('question-mark')), h('span', { class: 'hl' }, 'How to play'));
  const hintBoth = (fn) => [hintCoach, hintCard].forEach(fn);

  const petBox = h('div', { class: 'cpet' });
  const bubble = h('div', { class: 'cbubble', role: 'status' });
  const note = h('p', { class: 'cnote' });
  const setBubble = (main, mood, sub) => {
    fill(petBox, petFigure(hostPet, mood, 'pcoach'));
    fill(bubble, h('p', {}, main), sub ? h('p', { class: 'sub' }, sub) : null);
  };
  const tips = GAME_TIPS[g.id] || [''];
  const hideBtn = h('button', { class: 'chide', 'aria-label': 'Hide coach', onclick: () => setCoach(false) }, ic('chevron-left'));
  const panel = h('aside', { class: 'coachpanel', 'aria-label': `${pet.name}, your coach` },
    hideBtn, h('div', { class: 'cname' }, h('b', {}, pet.name), h('span', {}, `${g.title} coach`)),
    petBox, bubble, note, h('div', { class: 'cactions' }, hintCoach, howBtn));
  const thumb = petFigure(hostPet, 'happy', 'thumb');
  const rail = h('button', { class: 'coachrail', 'aria-label': 'Show coach', onclick: () => setCoach(true) }, thumb, h('span', {}, 'Coach'), ic('chevron-right'));
  const card = h('section', { class: 'qcard' }, head, box, h('div', { class: 'hint-under' }, hintCard), h('p', { class: 'kbtip' }, g.kind === 'tf' ? 'Tip: press M for Myth or F for Fact.' : g.kind === 'mcq' || g.kind === 'mission' ? 'Tip: press A, B, C or D on your keyboard.' : ''));
  const grid = h('div', { class: `playgrid ${st.coach === false ? 'nocoach' : ''}` }, panel, rail, card);
  const setCoach = (on) => { st.coach = on; grid.classList.toggle('nocoach', !on); save(); };

  const api = {
    box, grid, clock, setCoach,
    setHeader(text, pct) { qh.textContent = text; if (pct != null) bar.style.width = `${pct}%`; },
    setHint(fn) {
      hintFn = fn;
      hintBoth((b) => { b.hidden = !fn; b.disabled = false; b.classList.remove('used'); b.querySelector('.hl').textContent = 'Hint'; });
      howBtn.hidden = !!fn;
      card.querySelector('.hint-under').hidden = !fn;
      note.textContent = '';
    },
    hintBusy() { hintBoth((b) => { b.disabled = true; }); },
    hintUsed() { hintBoth((b) => { b.disabled = true; b.classList.add('used'); b.querySelector('.hl').textContent = 'Hint used'; }); note.textContent = 'This question now earns half AdCoins.'; },
    lockHint() { if (hintFn) hintBoth((b) => { b.disabled = true; }); },
    coach: {
      reset() { setBubble(pick(tips), 'explain'); note.textContent = ''; },
      react(kind) { answeredAny = true; setBubble(pick(lines[kind] || lines.right), MOOD[kind] || 'happy'); },
      hintSay(text) { setBubble(pick(lines.hint), 'think', text); }
    }
  };
  setBubble(pick(tips), 'explain');
  api.setHint(null);
  return api;
}

async function play(id) {
  const g = gameById(id);
  if (!g || !g.live) return go('/home');
  const hostPet = S.host[id] || hostFor(id);
  const st = S.profile.settings;
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
    const ctx = { gameId: id, timer, hintAds: st.hintAds, hostPet, shell: sh, showAd: showHintAd, report: (it, reason) => reportItem(it.game || id, it, reason) };
    const res = ['mission', 'tf', 'mcq'].includes(g.kind) ? await runQuiz(box, items, ctx)
      : await ({ flow: runFlow, match: runMatch, sort: runSort, cross: runCross }[g.kind])(box, items[0], ctx);
    timer.stop();
    const ms = timer.ms();
    const r = applyResult(id, res, g.kind === 'mission', ms);
    const left = pool ? pool.filter((x) => !seenOf(id).includes(x.id)).length : null;
    renderResult(g, res, r, ms, left);
  } catch (e) {
    console.error(e);
    if (box.isConnected) fill(box, h('p', { class: 'err' }, 'Something went wrong loading this game.'), h('a', { class: 'btn', href: '#/home' }, 'Back to home'));
  }
}

/* ---------- scorecard, pets, settings ---------- */
function renderCard() {
  const p = S.profile, lv = levelInfo(p.coins);
  const metric = (label, value) => h('div', { class: 'metric' }, h('span', {}, label), h('b', {}, value));
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'My scorecard'),
    h('div', { class: 'grid4' }, metric(CURRENCY, p.coins), metric('Level', `${lv.level}: ${lv.name}`), metric('Streak', plural(streakNow(), 'day')), metric('Best streak', plural(p.bestStreak || 0, 'day')), metric('Pets met', `${Object.keys(p.met).length} of ${PETS.length}`), metric('Badges', `${Object.keys(p.badges).length} of ${BADGES.length}`)),
    h('h3', {}, 'By game'),
    h('div', { class: 'card' }, GAMES.filter((g) => g.live).map((g) => {
      const s = p.played[g.id], bt = p.bestTime[g.id];
      return h('div', { class: 'srow' }, ic(g.icon), h('span', {}, g.title), h('span', { class: 'muted' }, s ? `${plural(s.plays, 'play')}, ${s.total ? Math.round((s.correct / s.total) * 100) : 0}% right${bt ? `, best ${fmtTime(bt)}` : ''}` : 'Not played yet'));
    })),
    h('h3', {}, 'Badges'),
    h('div', { class: 'card' }, BADGES.map((b) => h('div', { class: 'srow' }, ic(p.badges[b.id] ? b.icon : 'lock'), h('span', {}, `${b.title}: ${b.desc}`), h('span', { class: 'muted' }, p.badges[b.id] ? 'Earned' : 'Locked'))))), { narrow: true }));
}

function renderPets() {
  const p = S.profile, n = Object.keys(p.met).length;
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'Pet collection'),
    h('p', { class: 'muted' }, `You have met ${n} of ${PETS.length}. Take the tour or play their game to meet the rest.`),
    h('div', { class: 'petgrid' }, PETS.map((x) => {
      const game = GAMES.find((g) => g.pet === x.id), met = !!p.met[x.id];
      return h('div', { class: `petcard ${met ? '' : 'locked'}` }, met ? petFigure(x.id, 'hello', 'md') : h('div', { class: 'pet-fig md locked-fig', 'aria-hidden': 'true' }, h('span', { class: 'emo' }, '?')),
        h('b', {}, met ? `${x.name} the ${x.species}` : 'Not met yet'),
        h('p', { class: 'small' }, met ? x.line : `Play ${game.title} to meet this pet.`),
        met ? h('p', { class: 'muted small' }, `Hosts ${game.title}`) : null);
    }))), { narrow: true }));
}

function renderSettings() {
  const p = S.profile, st = p.settings;
  const toggle = (key, label, sub) => { const cb = h('input', { type: 'checkbox', id: `s-${key}`, checked: st[key] !== false && !!st[key], onchange: () => { st[key] = cb.checked; applyPrefs(); save(); } }); return h('label', { class: 'switch', for: `s-${key}` }, cb, h('span', {}, h('b', {}, label), h('small', {}, sub))); };
  const grid = h('div', { class: 'pickgrid', role: 'radiogroup', 'aria-label': 'Companion' });
  const drawPets = () => fill(grid, PETS.map((x) => h('button', { class: `pick ${p.companion === x.id ? 'on' : ''}`, role: 'radio', 'aria-checked': String(p.companion === x.id), onclick: () => { p.companion = x.id; meet(x.id); save(); drawPets(); } }, petFigure(x.id, 'hello', 'md'), h('b', {}, x.name), h('span', {}, x.species))));
  drawPets();
  const modeOpt = (v, t, sub) => h('label', { class: 'switch', for: `pm-${v}` }, h('input', { type: 'radio', name: 'petmode', id: `pm-${v}`, checked: st.petMode === v, onchange: () => { st.petMode = v; save(); } }), h('span', {}, h('b', {}, t), h('small', {}, sub)));
  view(page(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'Settings'),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Your companion'), grid),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Who hosts each game?'),
      modeOpt('fixed', 'Fixed', 'Each game keeps its own pet.'), modeOpt('shuffle', 'Shuffle', 'A random pet hosts each time you open a game.'), modeOpt('daily', 'Daily rotation', 'The host pets rotate every day.')),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Play'),
      toggle('coach', 'Show the coach panel on laptops', 'The pet panel beside the question. You can also hide it from the game screen.'),
      toggle('liveTimer', 'Show a timer while playing', 'Your time always shows on the results screen.'),
      toggle('hintAds', 'Joke ad before a hint', 'Hints play a short parody ad first. Turn off to get hints straight away.'),
      toggle('motion', 'Animations', 'Pet movement, confetti and the logo animation.')),
    h('div', { class: 'card' }, h('a', { class: 'btn ghost', href: '#/tour', onclick: () => { S.tourI = 0; } }, ic('map-2'), 'Replay the tour'))), { narrow: true }));
}

/* ---------- routing and auth ---------- */
function route() {
  const hash = location.hash.replace(/^#/, '') || '/home';
  document.querySelectorAll('.backdrop').forEach((b) => b.remove());
  if (!S.user || !S.profile) return renderLogin();
  const [, a, b] = hash.split('/');
  if (!S.profile.tourDone && a !== 'tour') { S.tourI = 0; return renderTour(); }
  if (a === 'tour') return renderTour();
  if (a === 'game') return renderIntro(b);
  if (a === 'play') return play(b);
  if (a === 'card') return renderCard();
  if (a === 'pets') return renderPets();
  if (a === 'settings') return renderSettings();
  if (a === 'admin') return adminView(S, (kids) => page(kids, { narrow: true }), view, (p) => { location.hash = '#' + p; });
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
    S.reportCount = S.admin ? await S.store.countReports().catch(() => 0) : 0;
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
