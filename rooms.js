/* Rooms and 1 vs 1: everyone answers the same questions at the same time and sees the scores at the end.
   A room is one small document (who hosts, which questions, what state) plus one small document per player.
   No AdCoins are earned here, so there is nothing to gain by tampering with a score. */
import { h, ic, fill, toast, petFigure } from './ui.js';
import { shuffle } from './util.js';
import { difficultyOf } from './validate.js';
import { QUESTION_CUES } from './data.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L, so a code is easy to read out loud
export const newCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const QUIZ_KIND = { 'myth-or-fact': 'tf', 'acronym-decoder': 'mcq', 'odd-one-out': 'mcq' };
// How each game is played in a room: one question at a time (tf, mcq, who, number) or a race through all of them (rapid).
export const ROOM_KIND = { ...QUIZ_KIND, 'who-am-i': 'who', 'number-sense': 'number', 'rapid-fire': 'rapid' };
export const roomGames = () => Object.keys(ROOM_KIND);
const OPTIONS = {
  'who-am-i': { counts: [5, 8, 10], secs: [20, 30, 45], word: 'puzzle', def: [5, 30] },
  'number-sense': { counts: [5, 8, 10], secs: [20, 30, 45], word: 'puzzle', def: [5, 30] },
  'rapid-fire': { counts: [8, 10, 12], secs: [45, 60], word: 'question', def: [10, 60], total: true }
};
const optionsFor = (game) => OPTIONS[game] || { counts: [5, 8, 10], secs: [15, 20, 30], word: 'question', def: [null, 20] };
const MODE = { '1v1': { title: '1 vs 1', max: 2, def: 8 }, room: { title: 'Room', max: 12, def: 8 } };
const REVEAL = 2500, LEAD = 3000;

// What a room needs to play one question. Stored in the room, so every player sees exactly the host's questions
// even if their own copy of the question list is a few minutes old.
export const snapshotOf = (it, g) => {
  const base = { id: it.id, g };
  if (ROOM_KIND[g] === 'who') return { ...base, answer: it.answer, clues: it.clues, wrong: it.wrong };
  if (ROOM_KIND[g] === 'number') return { ...base, q: it.q, unit: it.unit || '', min: it.min, max: it.max, step: it.step, answer: it.answer };
  if (QUIZ_KIND[g] === 'tf') return { ...base, q: it.q, answer: it.answer };
  return { ...base, q: it.q, options: it.options, answer: it.answer };
};
const hasContent = (ref) => !!(ref && (ref.q || ref.clues));

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const pointsFor = (ok, leftMs, secs) => (ok ? 100 + Math.round((Math.max(0, leftMs) / (secs * 1000)) * 50) : 0);
// Who am I?: fewer clues is worth more, speed adds a little. 60 to 150 points.
export const pointsWho = (ok, shown, total, leftMs, secs) => (ok ? 60 + Math.round((60 * (total - shown)) / Math.max(1, total - 1)) + Math.round((30 * Math.max(0, leftMs)) / (secs * 1000)) : 0);
// Number sense: spot on (within 5%) is worth full points, close (within 15%) 60% of them.
export const bandFor = (guess, answer) => { const off = Math.abs(guess - answer) / Math.abs(answer); return off <= 0.05 ? 'spot' : off <= 0.15 ? 'close' : 'off'; };
export const pointsNumber = (band, leftMs, secs) => (band === 'spot' ? pointsFor(true, leftMs, secs) : band === 'close' ? Math.round(pointsFor(true, leftMs, secs) * 0.6) : 0);
// Rapid fire: 100 for each right answer, plus 2 for every second left if all of them were answered in time.
export const pointsRapid = (correct, answered, total, leftMs) => correct * 100 + (answered >= total ? Math.round(Math.max(0, leftMs) / 500) : 0);

/* ---------- create ---------- */
export function newRoomView(env, mode, game) {
  const { S, view, page, go, gameName } = env;
  const m = MODE[mode], opt = optionsFor(game);
  if (!m || !ROOM_KIND[game]) return go('/home');
  const nick = h('input', { id: 'nick', class: 'inp', maxlength: 20, value: S.profile.nickname || S.user.name || '', autocomplete: 'off' });
  const count = h('select', { id: 'qcount' }, opt.counts.map((n) => h('option', { value: n }, `${n} ${opt.word}s`))); count.value = String(opt.def[0] || m.def);
  const secs = h('select', { id: 'qsecs' }, opt.secs.map((n) => h('option', { value: n }, opt.total ? `${n} seconds in total` : `${n} seconds each`))); secs.value = String(opt.def[1]);
  const err = h('p', { class: 'err', role: 'alert' });
  const go1 = h('button', { class: 'btn', onclick: async () => {
    const name = nick.value.trim();
    if (!name) { err.textContent = 'Pick a nickname for this room.'; return; }
    go1.disabled = true; err.textContent = '';
    try {
      // Rapid fire mixes the three quiz games, like it does when played alone.
      const sources = ROOM_KIND[game] === 'rapid' ? Object.keys(QUIZ_KIND) : [game];
      const pool = [];
      for (const g of sources) (await env.loadUsable(g)).filter((x) => x && x.id).forEach((x) => pool.push({ ...x, _g: g }));
      const n = Math.min(Number(count.value), pool.length);
      if (n < 3) { err.textContent = 'This game does not have enough questions for a room yet.'; go1.disabled = false; return; }
      const items = shuffle(pool).slice(0, n).sort((a, b) => difficultyOf(a) - difficultyOf(b)).map((x) => snapshotOf(x, x._g));
      let code = '';
      for (let tries = 0; tries < 5 && !code; tries++) {
        const c = newCode();
        if (!(await S.store.getRoom(c))) code = c;
      }
      if (!code) throw new Error('no free code');
      await S.store.createRoom({ code, host: S.user.uid, hostNick: name, mode, game, items, secs: Number(secs.value), max: m.max, state: 'lobby', createdAt: Date.now() });
      await S.store.joinRoom(code, { uid: S.user.uid, nick: name, joinedAt: Date.now() });
      go(`/room/${code}`);
    } catch (e) { console.error(e); err.textContent = 'Could not create the room. Check your connection and try again.'; go1.disabled = false; }
  } }, mode === '1v1' ? 'Create the challenge' : 'Create the room');
  view(page(h('div', { class: 'stage room' },
    h('a', { class: 'back', href: `#/game/${game}` }, ic('arrow-left'), gameName(game)),
    h('h1', {}, mode === '1v1' ? '1 vs 1 challenge' : 'Start a room'),
    h('p', { class: 'muted lede' }, mode === '1v1' ? `One colleague, the same ${opt.word}s, side by side.` : `Share a code. Everyone plays the same ${opt.word}s at the same time.`),
    h('div', { class: 'card' },
      h('label', { for: 'nick' }, 'Your nickname in this room'), nick,
      h('label', { for: 'qcount' }, 'Questions'), count,
      h('label', { for: 'qsecs' }, 'Time per question'), secs, err, go1),
    h('p', { class: 'muted small' }, 'Rooms do not earn AdCoins, and scores are only shown to the people in the room, at the end.')), { narrow: true }));
}

/* ---------- join ---------- */
export function joinView(env, prefill = '') {
  const { S, view, page, go } = env;
  const code = h('input', { id: 'code', class: 'inp roomcode', maxlength: 6, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', value: cleanCode(prefill), placeholder: 'ABC234' });
  const nick = h('input', { id: 'nick', class: 'inp', maxlength: 20, value: S.profile.nickname || S.user.name || '', autocomplete: 'off' });
  const err = h('p', { class: 'err', role: 'alert' });
  const join = h('button', { class: 'btn', onclick: async () => {
    const c = cleanCode(code.value), name = nick.value.trim();
    if (c.length !== 6) { err.textContent = 'A room code has 6 letters and numbers.'; return; }
    if (!name) { err.textContent = 'Pick a nickname for this room.'; return; }
    join.disabled = true; err.textContent = '';
    try {
      const room = await S.store.getRoom(c);
      if (!room) { err.textContent = 'No room with that code. Check it with the host.'; join.disabled = false; return; }
      const players = await S.store.getPlayers(c);
      const mine = players.find((p) => p.uid === S.user.uid);
      if (!mine && players.some((p) => p.nick.trim().toLowerCase() === name.toLowerCase())) { err.textContent = 'That nickname is already used in this room. Pick another one.'; join.disabled = false; return; }
      if (!mine) {
        if (room.state !== 'lobby') { err.textContent = 'That game has already started.'; join.disabled = false; return; }
        if (players.length >= (room.max || 12)) { err.textContent = 'That room is full.'; join.disabled = false; return; }
        await S.store.joinRoom(c, { uid: S.user.uid, nick: name, joinedAt: Date.now() });
      }
      go(`/room/${c}`);
    } catch (e) { console.error(e); err.textContent = 'Could not join. Check your connection and try again.'; join.disabled = false; }
  } }, 'Join');
  code.addEventListener('input', () => { code.value = cleanCode(code.value); });
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join.click(); });
  view(page(h('div', { class: 'stage room' },
    h('a', { class: 'back', href: '#/home' }, ic('arrow-left'), 'Home'),
    h('h1', {}, 'Join a room'), h('p', { class: 'muted lede' }, 'Ask the host for the 6-character code.'),
    h('div', { class: 'card' }, h('label', { for: 'code' }, 'Room code'), code, h('label', { for: 'nick' }, 'Your nickname in this room'), nick, err, join)), { narrow: true }));
}

/* ---------- the room itself ---------- */
export async function roomView(env, code) {
  const { S, view, page, go, gameName } = env;
  code = cleanCode(code);
  let room = null, players = [], started = false, finished = false, myAnswers = [], closed = false, stage = 'lobby';
  const stops = [];
  const box = h('div', { class: 'roombox' });
  const leave = () => { closed = true; stops.splice(0).forEach((f) => { try { f(); } catch { /* already stopped */ } }); };
  S.roomCleanup = leave;
  view(page(h('div', { class: 'stage room' }, box), { narrow: true }));

  const first = await S.store.getRoom(code).catch(() => null);
  if (!first) return fill(box, h('h1', {}, 'Room not found'), h('p', { class: 'muted' }, 'This room has closed or the code is wrong.'), h('a', { class: 'btn', href: '#/join' }, 'Enter another code'));
  room = first;
  const isHost = () => room && room.host === S.user.uid;
  const mine = () => players.find((p) => p.uid === S.user.uid);

  /* --- lobby --- */
  const drawLobby = () => {
    const max = room.max || 12, ready = players.length >= 2;
    const link = `${location.origin}${location.pathname}#/join/${code}`;
    fill(box,
      h('p', { class: 'eyebrow' }, `${MODE[room.mode] ? MODE[room.mode].title : 'Room'} · ${gameName(room.game)}`),
      h('h1', {}, 'Room code'),
      h('div', { class: 'bigcode', 'aria-label': `Room code ${code.split('').join(' ')}` }, code),
      h('div', { class: 'row gap wrap center-row' },
        h('button', { class: 'btn ghost inline', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Link copied.'); } catch { toast(`Code: ${code}`); } } }, ic('copy'), 'Copy invite link')),
      h('p', { class: 'muted small' }, ROOM_KIND[room.game] === 'rapid' ? `${plural(room.items.length, 'question')} in ${room.secs} seconds. Scores show at the end.` : `${plural(room.items.length, optionsFor(room.game).word)}, ${room.secs} seconds each. Scores show at the end.`),
      h('h2', { class: 'subhead' }, `In the room (${players.length} of ${max})`),
      h('ul', { class: 'plist' }, players.map((p) => h('li', {}, h('b', {}, p.nick), p.uid === room.host ? h('span', { class: 'muted' }, ' · host') : null, p.uid === S.user.uid ? h('span', { class: 'muted' }, ' · you') : null))),
      isHost()
        ? h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn', id: 'start-room', disabled: !ready, onclick: async () => { await S.store.updateRoom(code, { state: 'playing', startedAt: Date.now() }).catch(() => toast('Could not start. Try again.')); } }, ready ? 'Start the game' : 'Waiting for someone to join'),
          h('button', { class: 'btn ghost', onclick: async () => { if (!confirm('Close this room for everyone?')) return; await S.store.closeRoom(code).catch(() => {}); go('/home'); } }, 'Close room'))
        : h('div', { class: 'row gap wrap' }, h('p', { class: 'muted' }, 'Waiting for the host to start…'),
          h('button', { class: 'btn ghost', onclick: async () => { await S.store.leaveRoom(code, S.user.uid).catch(() => {}); go('/home'); } }, 'Leave')));
  };

  /* --- the game: every player follows the same clock, started when the host starts --- */
  const wait = (ms) => new Promise((res) => setTimeout(res, Math.max(0, ms)));
  const clockBar = () => { const clock = h('b', { class: 'rf-time' }), bar = h('i', {}); return { clock, bar, top: h('div', { class: 'rf-top' }, ic('clock'), clock, h('div', { class: 'rf-bar', role: 'presentation' }, bar)), tick(until, total) { const l = Math.max(0, until - Date.now()); clock.textContent = String(Math.ceil(l / 1000)); bar.style.width = `${(l / total) * 100}%`; } }; };
  const every = (fn) => { const iv = setInterval(() => { if (!box.isConnected || closed) { clearInterval(iv); return; } fn(); }, 100); return () => clearInterval(iv); };
  const optBtn = (k, label, tf, onclick) => h('button', { class: `opt ${tf ? 'tf' : ''}`.trim(), onclick }, h('span', { class: 'l', 'aria-hidden': 'true' }, tf ? (k === 0 ? 'M' : 'F') : 'ABCD'[k]), h('span', { class: 'ot' }, label));

  /* one question with a choice of answers (myth or fact, acronym, odd one out) */
  async function askChoice(it, i, n, qEnd, secs) {
    let picked = null, pickedAt = 0;
    const cue = QUESTION_CUES[it.game];
    const tf = it.kind === 'tf';
    const order = tf ? [{ t: 'Myth', v: false }, { t: 'Fact', v: true }] : shuffle(it.options.map((t, idx) => ({ t, v: idx })));
    const right = (o) => o.v === it.answer;
    const btns = order.map((o, k) => optBtn(k, o.t, tf, () => {
      if (picked != null || Date.now() >= qEnd) return;
      picked = k; pickedAt = Date.now();
      btns.forEach((b, j) => { b.disabled = true; b.classList.toggle('sel', j === k); });
    }));
    const status = h('p', { class: 'muted', role: 'status' }, 'Pick your answer.');
    const cb = clockBar();
    fill(box, cb.top, h('p', { class: 'eyebrow' }, `Question ${i + 1} of ${n}${cue ? ` \u00B7 ${cue[0]}` : ''}`), h('h2', { class: 'qtext' }, it.q), h('div', { class: `opts ${tf ? 'two' : ''}`.trim() }, btns), status);
    const stop = every(() => cb.tick(qEnd, secs * 1000)); cb.tick(qEnd, secs * 1000);
    await wait(qEnd - Date.now()); stop();
    if (closed) return { gained: 0, ok: false };
    const ok = picked != null && right(order[picked]);
    const gained = pointsFor(ok, qEnd - pickedAt, secs);
    btns.forEach((b, j) => { b.disabled = true; if (right(order[j])) b.classList.add('ok'); else if (j === picked) b.classList.add('bad'); });
    status.textContent = picked == null ? 'Time is up. No answer.' : ok ? `Right! +${gained} points` : 'Not this time.';
    status.classList.add(ok ? 'good' : 'oops');
    return { gained, ok };
  }

  /* Who am I?: clues come one at a time, and fewer clues is worth more */
  async function askWho(it, i, n, qEnd, secs) {
    let picked = null, pickedAt = 0, shown = 1;
    const order = shuffle([it.answer, ...it.wrong].map((t, idx) => ({ t, ok: idx === 0 })));
    const list = h('ol', { class: 'who-clues', 'aria-label': 'Clues' });
    const more = h('button', { class: 'btn ghost inline' });
    const drawClues = () => { fill(list, it.clues.slice(0, shown).map((c, k) => h('li', { class: k === shown - 1 ? 'new' : '' }, c))); more.disabled = shown >= it.clues.length || picked != null; more.replaceChildren(ic('bulb'), shown >= it.clues.length ? 'No more clues' : 'Another clue'); };
    more.addEventListener('click', () => { if (shown < it.clues.length && picked == null) { shown++; drawClues(); } });
    const btns = order.map((o, k) => optBtn(k, o.t, false, () => {
      if (picked != null || Date.now() >= qEnd) return;
      picked = k; pickedAt = Date.now(); more.disabled = true;
      btns.forEach((b, j) => { b.disabled = true; b.classList.toggle('sel', j === k); });
    }));
    const status = h('p', { class: 'muted', role: 'status' }, 'Fewer clues is worth more points.');
    const cb = clockBar();
    fill(box, cb.top, h('p', { class: 'eyebrow' }, `Who am I? \u00B7 Puzzle ${i + 1} of ${n}`), list, h('div', { class: 'who-more' }, more), h('div', { class: 'opts' }, btns), status);
    drawClues();
    const stop = every(() => cb.tick(qEnd, secs * 1000)); cb.tick(qEnd, secs * 1000);
    await wait(qEnd - Date.now()); stop();
    if (closed) return { gained: 0, ok: false };
    const ok = picked != null && order[picked].ok;
    const gained = pointsWho(ok, shown, it.clues.length, qEnd - pickedAt, secs);
    btns.forEach((b, j) => { b.disabled = true; more.disabled = true; if (order[j].ok) b.classList.add('ok'); else if (j === picked) b.classList.add('bad'); });
    status.textContent = picked == null ? `Time is up. It was ${it.answer}.` : ok ? `Right! It was ${it.answer}. +${gained} points` : `Not this time. It was ${it.answer}.`;
    status.classList.add(ok ? 'good' : 'oops');
    return { gained, ok };
  }

  /* Number sense: whatever the slider shows when you lock in, or when the time ends, is your answer */
  async function askNumber(it, i, n, qEnd, secs) {
    let locked = false, lockedAt = 0;
    const mid = it.min + Math.round((it.max - it.min) / 2 / it.step) * it.step;
    const slider = h('input', { type: 'range', class: 'num-slider', min: it.min, max: it.max, step: it.step, 'aria-label': 'Your answer' });
    const typed = h('input', { type: 'number', class: 'num-typed', min: it.min, max: it.max, step: 'any', inputmode: 'decimal', 'aria-label': 'Type your answer', id: 'num-typed' });
    slider.value = mid; typed.value = mid;
    const fmt = (v) => (it.unit === '$' ? `$${Number(v).toLocaleString()}` : `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}${it.unit ? (/^[a-z]{2,}/i.test(it.unit) ? ' ' : '') + it.unit : ''}`);
    const readout = h('b', { class: 'num-out', 'aria-live': 'polite' }, fmt(mid));
    slider.addEventListener('input', () => { typed.value = slider.value; readout.textContent = fmt(slider.value); });
    typed.addEventListener('input', () => { if (typed.value !== '') { slider.value = typed.value; readout.textContent = fmt(typed.value); } });
    const lock = h('button', { class: 'btn', onclick: () => { if (!locked && Date.now() < qEnd) { locked = true; lockedAt = Date.now(); slider.disabled = true; typed.disabled = true; lock.disabled = true; status.textContent = 'Locked in. Waiting for the others\u2026'; } } }, 'Lock in my answer');
    const status = h('p', { class: 'muted', role: 'status' }, 'Drag the slider or type a number.');
    const cb = clockBar();
    fill(box, cb.top, h('p', { class: 'eyebrow' }, `Number sense \u00B7 Puzzle ${i + 1} of ${n}`), h('h2', { class: 'qtext' }, it.q),
      h('div', { class: 'num-box' }, readout, slider, h('div', { class: 'num-range' }, h('span', {}, fmt(it.min)), h('span', {}, fmt(it.max))), h('div', { class: 'row gap wrap' }, typed, lock)), status);
    const stop = every(() => cb.tick(qEnd, secs * 1000)); cb.tick(qEnd, secs * 1000);
    await wait(qEnd - Date.now()); stop();
    if (closed) return { gained: 0, ok: false };
    const guess = Number(typed.value === '' ? slider.value : typed.value);
    const band = Number.isFinite(guess) ? bandFor(guess, it.answer) : 'off';
    const gained = pointsNumber(band, locked ? qEnd - lockedAt : 0, secs), ok = band !== 'off';
    slider.disabled = true; typed.disabled = true; lock.disabled = true;
    status.textContent = `You said ${fmt(guess)}. The answer is ${fmt(it.answer)}. ${band === 'spot' ? 'Spot on' : band === 'close' ? 'Close' : 'Not quite'}${ok ? `! +${gained} points` : '.'}`;
    status.classList.add(ok ? 'good' : 'oops');
    return { gained, ok };
  }

  /* Rapid fire: one shared clock for the whole round. Race through the questions at your own pace. */
  async function raceThrough(items, endAt, total) {
    let correct = 0, answered = 0, i = 0;
    const cb = clockBar();
    const stage = h('div', {});
    fill(box, cb.top, stage);
    const stop = every(() => cb.tick(endAt, total * 1000)); cb.tick(endAt, total * 1000);
    const show = () => {
      const it = items[i];
      const tf = it.kind === 'tf';
      const order = tf ? [{ t: 'Myth', v: false }, { t: 'Fact', v: true }] : shuffle(it.options.map((t, idx) => ({ t, v: idx })));
      let done = false;
      const btns = order.map((o, k) => optBtn(k, o.t, tf, () => {
        if (done || Date.now() >= endAt) return;
        done = true; answered++;
        const ok = o.v === it.answer; if (ok) correct++;
        btns.forEach((b, j) => { b.disabled = true; if (order[j].v === it.answer) b.classList.add('ok'); else if (j === k) b.classList.add('bad'); });
        setTimeout(() => { i++; if (i < items.length && Date.now() < endAt && !closed) show(); }, ok ? 350 : 700);
      }));
      const cue = QUESTION_CUES[it.game];
      fill(stage, h('p', { class: 'eyebrow' }, `Question ${i + 1} of ${items.length}${cue ? ` \u00B7 ${cue[0]}` : ''}`), h('h2', { class: 'qtext' }, it.q), h('div', { class: `opts ${tf ? 'two' : ''}`.trim() }, btns));
    };
    show();
    // finished early, or time ran out
    while (!closed && Date.now() < endAt && answered < items.length) await wait(150);
    stop();
    if (answered >= items.length) await wait(750);
    return { correct, answered, left: endAt - Date.now() };
  }

  const progressKey = () => `rda_room_${code}_${S.user.uid}`;
  const saved = () => { try { return JSON.parse(sessionStorage.getItem(progressKey())) || { i: -1, score: 0, correct: 0 }; } catch { return { i: -1, score: 0, correct: 0 }; } };
  const keep = (p) => { try { sessionStorage.setItem(progressKey(), JSON.stringify(p)); } catch { /* private window */ } };
  async function runGame(t0, resumed) {
    stage = 'playing';
    const kind = ROOM_KIND[room.game];
    const secs = room.secs, per = secs * 1000 + REVEAL;
    // Everyone starts counting when they hear the host start the game, so the clocks agree within a moment.
    const items = [];
    const packs = {};
    for (const ref of room.items) {
      let it = hasContent(ref) ? ref : null;
      if (!it) { // a room made before the questions were stored in it
        packs[ref.g] = packs[ref.g] || await env.loadUsable(ref.g);
        it = packs[ref.g].find((x) => x.id === ref.id);
      }
      if (it) items.push({ ...it, kind: kind === 'rapid' || kind === 'tf' || kind === 'mcq' ? QUIZ_KIND[ref.g] : kind, game: ref.g });
    }
    if (items.length < room.items.length) toast('Some questions could not be loaded for you.');
    const back = resumed ? saved() : { i: -1, score: 0, correct: 0 };
    let score = back.score, correct = back.correct;
    if (kind === 'rapid') {
      if (Date.now() < t0 + LEAD) fill(box, h('h1', {}, 'Get ready'), h('p', { class: 'muted' }, `${plural(items.length, 'question')} in ${secs} seconds. Go as fast as you can.`));
      await wait(t0 + LEAD - Date.now());
      if (closed) return;
      if (Date.now() < t0 + LEAD + secs * 1000) {
        const r = await raceThrough(items, t0 + LEAD + secs * 1000, secs);
        if (closed) return;
        correct = r.correct; score = pointsRapid(r.correct, r.answered, items.length, r.left);
      }
    } else {
      const ask = kind === 'who' ? askWho : kind === 'number' ? askNumber : askChoice;
      for (let i = 0; i < items.length && !closed; i++) {
        const qStart = t0 + LEAD + i * per, qEnd = qStart + secs * 1000;
        if (i <= back.i || Date.now() >= qStart + per) continue; // already played, or over while this player was away
        if (i === 0) fill(box, h('h1', {}, 'Get ready'), h('p', { class: 'muted' }, 'The first one is coming up.'));
        await wait(qStart - Date.now());
        if (closed) return;
        const r = await ask(items[i], i, items.length, qEnd, secs);
        if (r.ok) correct++;
        score += r.gained;
        keep({ i, score, correct });
        await wait(qStart + per - Date.now());
      }
    }
    if (closed) return;
    finished = true; stage = 'results';
    fill(box, h('h1', {}, 'Nicely done'), h('p', { class: 'muted' }, 'Waiting for everyone to finish\u2026'));
    for (let attempt = 0; attempt < 4; attempt++) {
      try { await S.store.savePlayer(code, S.user.uid, { score: Math.min(score, 2000), correct, total: items.length, finished: true }); break; } catch (e) { await wait(700 * (attempt + 1)); }
    }
    if (isHost()) setTimeout(() => S.store.updateRoom(code, { state: 'done' }).catch(() => {}), 1500);
    showResults(items.length);
    // If somebody dropped out, show what we have after a short wait.
    setTimeout(() => { if (!closed && players.length) { drawResults(items.length, true); } }, 12000);
  }

  /* --- results --- */
  const drawResults = (total, force) => {
    const everyone = players.length > 0 && players.every((p) => p.finished);
    if (!everyone && !force) return;
    const ranked = players.filter((p) => p.finished).sort((a, b) => (b.score || 0) - (a.score || 0) || (b.correct || 0) - (a.correct || 0));
    const top = ranked[0], tie = ranked.length > 1 && ranked[1].score === top.score;
    const me = mine();
    fill(box,
      h('div', { class: 'row center-row' }, petFigure(S.profile.companion, top && me && top.uid === me.uid && !tie ? 'celebrate' : 'proud', 'phero')),
      h('h1', {}, ranked.length < 2 ? 'Round finished' : tie ? 'It’s a tie' : top.uid === S.user.uid ? 'You won' : `${top.nick} wins`),
      h('ol', { class: 'board' }, ranked.map((p, i) => h('li', { class: p.uid === S.user.uid ? 'me' : '' }, h('span', { class: 'rk' }, String(i + 1)), h('b', {}, p.nick), h('span', { class: 'muted' }, `${p.correct || 0} of ${p.total || total} right`), h('span', { class: 'pts' }, `${p.score || 0} pts`)))),
      players.length > ranked.length ? h('p', { class: 'muted small' }, `${plural(players.length - ranked.length, 'player')} did not finish.`) : null,
      h('p', { class: 'muted small' }, 'No AdCoins in rooms. Come back for another round any time.'),
      h('div', { class: 'row gap wrap center-row' },
        h('a', { class: 'btn', href: `#/game/${room.game}` }, `Play ${gameName(room.game)}`),
        isHost() ? h('button', { class: 'btn ghost', onclick: async () => { await S.store.closeRoom(code).catch(() => {}); go('/home'); } }, 'Close room') : h('a', { class: 'btn ghost', href: '#/home' }, 'Back to home')));
  };
  const showResults = (total) => { stops.push(S.store.watchPlayers(code, (list) => { players = list; if (stage === 'results') drawResults(total); })); };

  /* --- wiring --- */
  players = await S.store.getPlayers(code).catch(() => []);
  let sawLobby = room.state === 'lobby';
  const fail = (e) => { console.error(e); fill(box, h('p', { class: 'err' }, 'Something went wrong in this room.'), h('a', { class: 'btn', href: '#/home' }, 'Back to home')); };
  stops.push(S.store.watchPlayers(code, (list) => {
    players = list;
    if (stage === 'lobby' && room.state === 'lobby') {
      if (!mine()) return fill(box, h('h1', {}, 'You are not in this room'), h('a', { class: 'btn', href: `#/join/${code}` }, 'Join with a nickname'));
      drawLobby();
    }
  }));
  stops.push(S.store.watchRoom(code, (r) => {
    if (closed) return;
    if (!r) { if (stage !== 'results') { leave(); fill(box, h('h1', {}, 'This room was closed'), h('a', { class: 'btn', href: '#/home' }, 'Back to home')); } return; }
    room = r;
    if (r.state === 'lobby') { sawLobby = true; if (stage === 'lobby' && mine()) drawLobby(); }
    if (started || !mine()) {
      if (!mine() && !started && r.state !== 'lobby') fill(box, h('h1', {}, 'This game already started'), h('a', { class: 'btn', href: '#/home' }, 'Back to home'));
      return;
    }
    if (r.state === 'playing') {
      started = true;
      // Heard the host press Start: count from now. Opened the room after the game began (a refresh): count from the host's start time.
      const resumed = !sawLobby;
      runGame(resumed ? (r.startedAt || Date.now()) : Date.now(), resumed).catch(fail);
    } else if (r.state === 'done') {
      // The game is over. Show the scores to someone who comes back to the room.
      started = true; stage = 'results'; finished = true;
      fill(box, h('h1', {}, 'Loading the scores\u2026'));
      showResults(r.items.length);
      setTimeout(() => { if (!closed) drawResults(r.items.length, true); }, 1500);
    }
  }));
}
