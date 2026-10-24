import { CONFIG } from './config.js';
import { CATS, GAMES, MODES, LEVELS, TIPS, GAME_TIPS, PETS, TOUR, CURRENCY } from './data.js';
import { shuffle, mulberry32, seedFrom, dateKey, yesterdayKey } from './util.js';
import { createStore } from './store.js';
import { h, ic, fill, toast, petFigure, petById, wordmark, modal, fmtTime } from './ui.js';
import { showHintAd } from './ads.js';
import { makeTimer, runQuiz, runFlow, runMatch, runSort, runCross, hooks } from './engines.js';
import { adminView } from './admin.js';

const $app = document.getElementById('app');
const S = { store: null, user: null, profile: null, admin: false, reportCount: 0, loginMsg: '', timer: null, clock: null, host: {}, tourI: 0, pick: null };
const gameById = (id) => GAMES.find((g) => g.id === id);
const catOf = (g) => CATS.find((c) => c.id === g.cat);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const save = () => S.store.saveProfile(S.user, S.profile).catch(() => toast('Could not save your progress. Check your connection.'));
const applyPrefs = () => document.body.classList.toggle('nomotion', !S.profile.settings.motion);
const seenOf = (g) => (S.profile.seenAll && S.profile.seenAll[g]) || [];

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

function hostFor(gameId) {
  const g = gameById(gameId), mode = S.profile.settings.petMode;
  if (mode === 'shuffle') return PETS[Math.floor(Math.random() * PETS.length)].id;
  if (mode === 'daily') { const day = Math.floor(Date.now() / 864e5); return PETS[(day + GAMES.findIndex((x) => x.id === gameId)) % PETS.length].id; }
  return g.pet;
}

/* ---------- page frame: top bar with settings and profile ---------- */
function topbar() {
  const p = S.profile, lv = levelInfo(p.coins);
  const logo = h('img', { class: 'logo-img', alt: '', src: 'assets/logo.png' });
  logo.onerror = () => { if (!logo.dataset.t) { logo.dataset.t = '1'; logo.src = 'assets/logo.svg'; } else logo.remove(); };
  const item = (href, icon, text, extra) => h('a', { role: 'menuitem', href, onclick: extra }, ic(icon), text);
  const menu = h('div', { class: 'menu', role: 'menu', hidden: true },
    h('div', { class: 'menu-head' }, h('b', {}, p.name || S.user.name), h('span', {}, `Level ${lv.level} · ${p.coins} ${CURRENCY}`)),
    item('#/card', 'chart-bar', 'My scorecard'),
    item('#/pets', 'paw', 'Pet collection'),
    item('#/settings', 'settings', 'Change my companion'),
    item('#/tour', 'map-2', 'Replay the tour', () => { S.tourI = 0; }),
    S.admin ? h('a', { role: 'menuitem', href: '#/admin' }, ic('inbox'), 'Admin', S.reportCount ? h('span', { class: 'badge' }, S.reportCount) : null) : null,
    h('button', { role: 'menuitem', class: 'menu-out', onclick: () => S.store.signOut(onUser) }, ic('logout'), 'Sign out'));
  const avatar = h('button', { class: 'avatar', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Profile menu', onclick: (e) => {
    e.stopPropagation();
    const open = menu.hidden; menu.hidden = !open; avatar.setAttribute('aria-expanded', String(open));
  } }, petFigure(p.companion, 'happy', 'xs'));
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-in' },
      h('a', { class: 'brand', href: '#/home', 'aria-label': 'ADVenture home' }, logo, wordmark('sm')),
      h('div', { class: 'tb-right' },
        h('a', { class: 'iconbtn', href: '#/settings', 'aria-label': 'Settings' }, ic('settings')),
        h('div', { class: 'avwrap' }, avatar, menu))));
}
const shell = (...kids) => h('div', { class: 'app' }, topbar(), h('main', { class: 'page' }, ...kids));

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
    petFigure('penguin', 'hello', 'xl'), wordmark('lg'),
    h('p', { class: 'tag' }, 'Learn AdTech by playing'), btn,
    h('p', { class: 'muted' }, `DataBeat accounts only (@${CONFIG.ALLOWED_DOMAIN})`), msg,
    S.store.demo ? h('p', { class: 'demo' }, 'Demo mode: no real login. Your progress stays in this browser.') : null));
}

/* ---------- tour: one pet per slide, then pick a companion ---------- */
function renderTour() {
  const i = S.tourI, last = TOUR.length, p = S.profile;
  const finish = (pickCompanion) => {
    if (pickCompanion) { p.companion = S.pick || p.companion; PETS.forEach((x) => { p.met[x.id] = true; }); }
    p.tourDone = true; save(); S.tourI = 0; S.pick = null; applyPrefs(); go('/home');
  };
  const skip = h('button', { class: 'linkbtn tour-skip', onclick: () => finish(false) }, 'Skip tour');
  const dots = h('div', { class: 'dots', 'aria-label': `Step ${i + 1} of ${last + 1}` }, Array.from({ length: last + 1 }, (_, k) => h('i', { class: k === i ? 'on' : '' })));
  if (i < last) {
    const t = TOUR[i];
    const pet = petById(t.pet);
    view(h('main', { class: 'tour' }, skip,
      i === 0 ? wordmark('lg') : null,
      petFigure(t.pet, i === 0 ? 'hello' : 'explain', 'xl'),
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
function tile(g) {
  const c = catOf(g);
  if (!g.live) return h('div', { class: 'tile soon', 'aria-label': `${g.title}, coming soon` }, ic(g.icon, 'big'), h('div', {}, h('p', {}, g.title), h('span', {}, 'Coming soon')));
  return h('a', { class: 'tile', href: `#/game/${g.id}`, style: `--bg:${c.bg};--fg:${c.fg}` }, ic(g.icon, 'big'), h('p', {}, g.title));
}

function renderHome() {
  const p = S.profile, today = dateKey(), lv = levelInfo(p.coins), done = p.missionDay === today;
  const hr = new Date().getHours();
  const greet = `${hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}, ${p.name || S.user.name}.`;
  const away = daysAway();
  const mood = !p.lastDay ? 'hello' : away >= 3 ? 'sleepy' : 'happy';
  const comp = petById(p.companion);
  const msg = !p.lastDay ? 'Start with the Daily mission. It takes about five minutes.' : away >= 3 ? 'We missed you. A quick round gets your streak going again.'
    : done ? 'Mission done. Try another game, or replay for practice.' : TIPS[seedFrom(today) % TIPS.length];
  const live = GAMES.filter((g) => g.live && g.kind !== 'mission');
  const last = p.lastGame && gameById(p.lastGame);
  const surprise = () => { const pool = live.filter((g) => g.id !== p.lastGame); go(`/game/${pool[Math.floor(Math.random() * pool.length)].id}`); };
  view(shell(
    h('section', { class: 'hero2' },
      h('div', { class: 'panel greet' },
        h('div', { class: 'row gap top' }, petFigure(p.companion, mood, 'lg'), h('div', { class: 'bubble' }, h('span', {}, `${comp.name} says`), h('b', {}, greet), h('p', {}, msg))),
        h('div', { class: 'chips' }, h('span', { class: 'chip' }, ic('flame'), plural(streakNow(), 'day')), h('span', { class: 'chip l' }, `Level ${lv.level}: ${lv.name}`)),
        h('div', { class: 'row small-row' }, h('span', { class: 'muted' }, `${CURRENCY}`), h('span', { class: 'muted' }, lv.next ? `${p.coins} / ${lv.next.t}` : String(p.coins))),
        h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${lv.pct}%` }))),
      h('div', { class: 'panel mission' },
        h('p', { class: 'muted2' }, "Today's mission"), h('h2', {}, done ? 'Mission complete' : '3 puzzles, 5 minutes'),
        h('div', { class: 'mdots', 'aria-hidden': 'true' }, [0, 1, 2].map(() => h('i', { class: done ? 'on' : '' }))),
        h('p', {}, done ? 'Nice work. Replay for practice.' : 'Fresh questions picked just for you.'),
        h('a', { class: 'btn light', href: '#/play/daily-warmup' }, ic('player-play'), done ? 'Play again' : 'Start mission'))),
    h('section', { class: 'cont' },
      h('div', {}, h('b', {}, last ? 'Pick up where you left off' : 'Not sure where to start?'), h('p', { class: 'muted small' }, last ? last.title : 'Let a pet choose a game for you.')),
      h('div', { class: 'row gap wrap' }, last ? h('a', { class: 'btn inline', href: `#/game/${last.id}` }, 'Continue') : null, h('button', { class: 'btn inline ghost', onclick: surprise }, ic('sparkles'), 'Surprise me'))),
    CATS.map((c) => {
      const gs = GAMES.filter((g) => g.cat === c.id);
      return h('section', { class: 'cat' },
        h('div', { class: 'cat-head' }, h('b', {}, h('i', { class: 'dot', style: `background:${c.bg}` }), c.title), h('span', {}, `${gs.length} games`)),
        h('div', { class: 'grid' }, gs.map(tile)));
    }),
    S.store.demo ? h('p', { class: 'demo' }, 'Demo mode: no real login. Your progress stays in this browser.') : null));
}

/* ---------- how to play ---------- */
function showHow(id) {
  const g = gameById(id), pet = S.host[id] || g.pet;
  const m = modal(h('div', { class: 'how' },
    h('div', { class: 'row gap top' }, petFigure(pet, 'explain', 'md'), h('div', {}, h('h2', {}, `How to play ${g.title}`), h('p', { class: 'muted' }, `${petById(pet).name} explains`))),
    h('ol', { class: 'steps' }, g.how.steps.map((s) => h('li', {}, s))),
    h('div', { class: 'example' }, h('b', {}, 'Example'), h('p', {}, g.how.example)),
    h('p', { class: 'muted small' }, g.how.scoring),
    h('button', { class: 'btn', onclick: () => m.close() }, "Got it, let's play")), { label: `How to play ${g.title}` });
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
  view(shell(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'),
    h('section', { class: 'hero', style: `--bg:${c.bg};--fg:${c.fg}` },
      h('div', { class: 'row gap top' }, petFigure(pet, 'explain', 'lg'), h('div', {}, h('h1', {}, g.title), h('p', {}, g.blurb))),
      h('div', { class: 'bubble' }, h('span', {}, `${petById(pet).name} says`), h('p', {}, tip)),
      h('div', { class: 'row gap wrap' }, h('button', { class: 'btn light inline', onclick: () => showHow(id) }, ic('question-mark'), 'How to play'), pool)),
    h('h3', {}, 'How do you want to play?'),
    h('div', { class: 'grid modes' }, MODES.map((m) => m.live
      ? h('a', { class: 'mode', href: `#/play/${id}` }, ic(m.icon, 'big'), h('div', {}, h('p', {}, m.title), h('span', {}, m.sub)))
      : h('div', { class: 'mode soon', 'aria-label': `${m.title}, coming soon` }, ic(m.icon, 'big'), h('div', {}, h('p', {}, m.title), h('span', {}, 'Coming soon'))))))));
  if (!S.profile.howSeen[id]) { S.profile.howSeen[id] = true; save(); showHow(id); }
  try {
    if (g.kind === 'mission') { pool.textContent = 'Your three puzzles are picked from questions you have not seen yet.'; return; }
    const items = await loadUsable(id), seen = new Set(seenOf(id));
    const left = items.filter((x) => !seen.has(x.id)).length;
    const unit = g.kind === 'tf' || g.kind === 'mcq' ? 'question' : 'puzzle';
    pool.textContent = left === 0 ? `You have seen every ${unit}. Replays earn ${CURRENCY} only when you beat your best.` : `${left} of ${items.length} ${unit}s still new to you.`;
  } catch { /* the line is optional */ }
}

/* ---------- AdCoins, streak and no-repeat bookkeeping ---------- */
function applyResult(gameId, res, isMission, ms) {
  const p = S.profile, today = dateKey(), before = levelInfo(p.coins);
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
  const s = p.played[gameId] || { plays: 0, correct: 0, total: 0 };
  s.plays++; s.correct += res.correct; s.total += res.total; p.played[gameId] = s;
  if (res.correct === res.total && (!p.bestTime[gameId] || ms < p.bestTime[gameId])) p.bestTime[gameId] = ms;
  res.items.forEach((it) => { const arr = (p.seenAll[it.game] || []).filter((x) => x !== it.id); arr.push(it.id); p.seenAll[it.game] = arr.slice(-2000); });
  p.lastGame = gameId;
  const after = levelInfo(p.coins);
  save();
  return { gain, bonus, mode, best, leveled: after.idx > before.idx, after };
}

function renderResult(g, res, r, ms, left) {
  const ratio = res.total ? res.correct / res.total : 0;
  const head = ratio === 1 ? 'Perfect round' : ratio >= 0.7 ? 'Nice work' : 'Good practice';
  const mood = r.leveled || ratio === 1 ? 'celebrate' : ratio >= 0.7 ? 'proud' : 'encourage';
  const line = ratio === 1 ? 'Every answer was right.' : ratio >= 0.7 ? 'You are getting the hang of this.' : 'The explanations are where the learning happens. Try again.';
  const note = r.mode === 'mixed' ? 'Some of these were repeats, so only the new ones earned AdCoins.'
    : r.mode === 'replay' ? (r.gain > 0 ? `Replay bonus: you beat your best replay (${r.best}) and earned ${r.gain} more.` : `Replays earn ${CURRENCY} only when you beat your best replay${r.best ? ` (${r.best})` : ''}.`) : '';
  const unit = g.kind === 'tf' || g.kind === 'mcq' || g.kind === 'mission' ? 'question' : 'puzzle';
  const pool = left == null ? '' : left === 0 ? `You have seen every ${unit} in this game. Replays earn ${CURRENCY} only when you beat your best.` : `${plural(left, `new ${unit}`)} left before repeats begin.`;
  view(shell(h('div', { class: 'stage result' },
    petFigure(S.profile.companion, mood, 'xl'),
    h('h1', {}, head), h('p', { class: 'score' }, `${res.correct} of ${res.total}`), h('p', {}, line),
    h('div', { class: 'stats' },
      h('div', {}, h('b', {}, fmtTime(ms)), h('span', {}, 'Time')),
      h('div', {}, h('b', {}, `+${r.gain + r.bonus}`), h('span', {}, CURRENCY)),
      h('div', {}, h('b', {}, plural(S.profile.streak, 'day')), h('span', {}, 'Streak'))),
    h('div', { class: 'card left' },
      r.bonus ? h('p', { class: 'small' }, `Includes a ${r.bonus} ${CURRENCY} mission bonus.`) : null,
      note ? h('p', { class: 'small' }, note) : null,
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${r.after.pct}%` })),
      h('p', { class: 'muted small' }, r.leveled ? `Level up! You are now ${r.after.name}.` : `Level ${r.after.level}: ${r.after.name}`),
      pool ? h('p', { class: 'muted small' }, pool) : null),
    h('div', { class: 'stack' },
      h('a', { class: 'btn', href: `#/play/${g.id}`, onclick: () => { if (location.hash === `#/play/${g.id}`) setTimeout(route, 0); } }, 'Play again'),
      h('a', { class: 'btn ghost', href: '#/home' }, 'Back to home')))));
}

/* ---------- play ---------- */
async function play(id) {
  const g = gameById(id);
  if (!g || !g.live) return go('/home');
  const box = h('div', { class: 'play' }, h('p', { class: 'muted' }, 'Loading puzzles…'));
  const st = S.profile.settings;
  const clock = st.liveTimer ? h('span', { class: 'clock', 'aria-label': 'Time so far' }, ic('clock'), h('span', { class: 'ct' }, '0:00')) : null;
  view(shell(h('div', { class: 'stage' },
    h('div', { class: 'play-top' },
      h('a', { class: 'back', href: `#/game/${id}` }, ic('x'), 'Quit'), h('span', { class: 'pill' }, g.title), clock,
      h('button', { class: 'iconbtn sm', 'aria-label': 'How to play', onclick: () => showHow(id) }, ic('question-mark'))),
    box)));
  const timer = makeTimer(); S.timer = timer;
  hooks.companion = S.profile.companion;
  try {
    let items, pool = null;
    if (g.kind === 'mission') items = await missionItems();
    else {
      pool = await loadUsable(id);
      items = pickFresh(pool, g.size || 1, seenOf(id)).map((it) => ({ ...it, kind: g.kind, game: id }));
    }
    if (!items.length) { fill(box, h('p', {}, 'No puzzles are available for this game right now.'), h('a', { class: 'btn', href: '#/home' }, 'Back to home')); return; }
    timer.start();
    if (clock) S.clock = setInterval(() => { clock.querySelector('.ct').textContent = fmtTime(timer.ms()); }, 500);
    const ctx = { gameId: id, timer, hintAds: st.hintAds, showAd: showHintAd, report: (it, reason) => reportItem(it.game || id, it, reason) };
    const res = ['mission', 'tf', 'mcq'].includes(g.kind) ? await runQuiz(box, items, ctx)
      : await ({ flow: runFlow, match: runMatch, sort: runSort, cross: runCross }[g.kind])(box, items[0], ctx);
    timer.stop();
    const ms = timer.ms();
    const r = applyResult(id, res, g.kind === 'mission', ms);
    const left = pool ? pool.filter((x) => !seenOf(id).includes(x.id)).length : null;
    renderResult(g, res, r, ms, left);
  } catch (e) {
    console.error(e);
    fill(box, h('p', { class: 'err' }, 'Something went wrong loading this game.'), h('a', { class: 'btn', href: '#/home' }, 'Back to home'));
  }
}

/* ---------- scorecard, pets, settings ---------- */
function renderCard() {
  const p = S.profile, lv = levelInfo(p.coins);
  const metric = (label, value) => h('div', { class: 'metric' }, h('span', {}, label), h('b', {}, value));
  view(shell(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'My scorecard'),
    h('div', { class: 'grid4' }, metric(CURRENCY, p.coins), metric('Level', `${lv.level}: ${lv.name}`), metric('Streak', plural(streakNow(), 'day')), metric('Best streak', plural(p.bestStreak || 0, 'day')), metric('Pets met', `${Object.keys(p.met).length} of ${PETS.length}`)),
    h('h3', {}, 'By game'),
    h('div', { class: 'card' }, GAMES.filter((g) => g.live).map((g) => {
      const s = p.played[g.id], bt = p.bestTime[g.id];
      return h('div', { class: 'srow' }, ic(g.icon), h('span', {}, g.title), h('span', { class: 'muted' }, s ? `${plural(s.plays, 'play')}, ${s.total ? Math.round((s.correct / s.total) * 100) : 0}% right${bt ? `, best ${fmtTime(bt)}` : ''}` : 'Not played yet'));
    })))));
}

function renderPets() {
  const p = S.profile, n = Object.keys(p.met).length;
  view(shell(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'Pet collection'),
    h('p', { class: 'muted' }, `You have met ${n} of ${PETS.length}. Take the tour or play their game to meet the rest.`),
    h('div', { class: 'petgrid' }, PETS.map((x) => {
      const game = GAMES.find((g) => g.pet === x.id), met = !!p.met[x.id];
      return h('div', { class: `petcard ${met ? '' : 'locked'}` }, met ? petFigure(x.id, 'hello', 'md') : h('div', { class: 'pet-fig md locked-fig', 'aria-hidden': 'true' }, h('span', { class: 'emo' }, '?')),
        h('b', {}, met ? `${x.name} the ${x.species}` : 'Not met yet'),
        h('p', { class: 'small' }, met ? x.line : `Play ${game.title} to meet this pet.`),
        met ? h('p', { class: 'muted small' }, `Hosts ${game.title}`) : null);
    })))));
}

function renderSettings() {
  const p = S.profile, st = p.settings;
  const toggle = (key, label, sub) => { const cb = h('input', { type: 'checkbox', id: `s-${key}`, checked: !!st[key], onchange: () => { st[key] = cb.checked; applyPrefs(); save(); } }); return h('label', { class: 'switch', for: `s-${key}` }, cb, h('span', {}, h('b', {}, label), h('small', {}, sub))); };
  const grid = h('div', { class: 'pickgrid', role: 'radiogroup', 'aria-label': 'Companion' });
  const drawPets = () => fill(grid, PETS.map((x) => h('button', { class: `pick ${p.companion === x.id ? 'on' : ''}`, role: 'radio', 'aria-checked': String(p.companion === x.id), onclick: () => { p.companion = x.id; meet(x.id); save(); drawPets(); } }, petFigure(x.id, 'hello', 'md'), h('b', {}, x.name), h('span', {}, x.species))));
  drawPets();
  const modeOpt = (v, t, sub) => h('label', { class: 'switch', for: `pm-${v}` }, h('input', { type: 'radio', name: 'petmode', id: `pm-${v}`, checked: st.petMode === v, onchange: () => { st.petMode = v; save(); } }), h('span', {}, h('b', {}, t), h('small', {}, sub)));
  view(shell(h('div', { class: 'stage' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'), h('h1', {}, 'Settings'),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Your companion'), grid),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Who hosts each game?'),
      modeOpt('fixed', 'Fixed', 'Each game keeps its own pet.'), modeOpt('shuffle', 'Shuffle', 'A random pet hosts each time you open a game.'), modeOpt('daily', 'Daily rotation', 'The host pets rotate every day.')),
    h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Play'),
      toggle('liveTimer', 'Show a timer while playing', 'Your time always shows on the results screen.'),
      toggle('hintAds', 'Joke ad before a hint', 'Hints play a short parody ad first. Turn off to get hints straight away.'),
      toggle('motion', 'Animations', 'Pet movement and the logo animation.')),
    h('div', { class: 'card' }, h('a', { class: 'btn ghost', href: '#/tour', onclick: () => { S.tourI = 0; } }, ic('map-2'), 'Replay the tour')))));
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
  if (a === 'admin') return adminView(S, shell, view, (p) => { location.hash = '#' + p; });
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
