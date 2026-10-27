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
export const roomGames = () => Object.keys(QUIZ_KIND);
const MODE = { '1v1': { title: '1 vs 1', max: 2, def: 8 }, room: { title: 'Room', max: 12, def: 8 } };
const REVEAL = 2500, LEAD = 3000;

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const pointsFor = (ok, leftMs, secs) => (ok ? 100 + Math.round((Math.max(0, leftMs) / (secs * 1000)) * 50) : 0);

/* ---------- create ---------- */
export function newRoomView(env, mode, game) {
  const { S, view, page, go, gameName } = env;
  const m = MODE[mode];
  if (!m || !QUIZ_KIND[game]) return go('/home');
  const nick = h('input', { id: 'nick', class: 'inp', maxlength: 20, value: S.profile.nickname || S.user.name || '', autocomplete: 'off' });
  const count = h('select', { id: 'qcount' }, [5, 8, 10].map((n) => h('option', { value: n }, `${n} questions`))); count.value = String(m.def);
  const secs = h('select', { id: 'qsecs' }, [15, 20, 30].map((n) => h('option', { value: n }, `${n} seconds each`))); secs.value = '20';
  const err = h('p', { class: 'err', role: 'alert' });
  const go1 = h('button', { class: 'btn', onclick: async () => {
    const name = nick.value.trim();
    if (!name) { err.textContent = 'Pick a nickname for this room.'; return; }
    go1.disabled = true; err.textContent = '';
    try {
      const pool = (await env.loadUsable(game)).filter((x) => x && x.id);
      const n = Math.min(Number(count.value), pool.length);
      if (n < 3) { err.textContent = 'This game does not have enough questions for a room yet.'; go1.disabled = false; return; }
      const items = shuffle(pool).slice(0, n).sort((a, b) => difficultyOf(a) - difficultyOf(b)).map((x) => ({ g: game, id: x.id }));
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
    h('p', { class: 'muted lede' }, mode === '1v1' ? `One colleague, the same ${plural(Number(count.value), 'question')}, side by side.` : 'Share a code. Everyone answers the same questions at the same time.'),
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
      h('p', { class: 'muted small' }, `${plural(room.items.length, 'question')}, ${room.secs} seconds each. Scores show at the end.`),
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
  async function runGame() {
    stage = 'playing';
    const secs = room.secs, per = secs * 1000 + REVEAL;
    // Everyone starts counting when they hear the host start the game, so the clocks agree within a moment.
    const t0 = Date.now();
    const items = [];
    const packs = {};
    for (const ref of room.items) {
      packs[ref.g] = packs[ref.g] || await env.loadUsable(ref.g);
      const it = packs[ref.g].find((x) => x.id === ref.id);
      if (it) items.push({ ...it, kind: QUIZ_KIND[ref.g], game: ref.g });
    }
    let score = 0, correct = 0;
    const clock = h('b', { class: 'rf-time' }), bar = h('i', {});
    const tick = (until, total) => {
      const l = Math.max(0, until - Date.now());
      clock.textContent = String(Math.ceil(l / 1000)); bar.style.width = `${(l / total) * 100}%`;
    };
    for (let i = 0; i < items.length && !closed; i++) {
      const it = items[i], qStart = t0 + LEAD + i * per, qEnd = qStart + secs * 1000;
      if (i === 0) {
        fill(box, h('h1', {}, 'Get ready'), h('p', { class: 'muted' }, 'The first question is coming up.'));
        await wait(qStart - Date.now());
      } else await wait(qStart - Date.now());
      if (closed) return;
      let picked = null, pickedAt = 0;
      const cue = QUESTION_CUES[it.game];
      const order = it.kind === 'tf' ? [{ t: 'Myth', v: false }, { t: 'Fact', v: true }] : shuffle(it.options.map((t, idx) => ({ t, v: idx })));
      const right = (o) => (it.kind === 'tf' ? o.v === it.answer : o.v === it.answer);
      const btns = order.map((o, k) => h('button', { class: `opt ${it.kind === 'tf' ? 'tf' : ''}`.trim(), onclick: () => {
        if (picked != null || Date.now() >= qEnd) return;
        picked = k; pickedAt = Date.now();
        btns.forEach((b, j) => { b.disabled = true; b.classList.toggle('sel', j === k); });
      } }, h('span', { class: 'l', 'aria-hidden': 'true' }, it.kind === 'tf' ? (k === 0 ? 'M' : 'F') : 'ABCD'[k]), h('span', { class: 'ot' }, o.t)));
      const status = h('p', { class: 'muted', role: 'status' }, 'Pick your answer.');
      fill(box,
        h('div', { class: 'rf-top' }, ic('clock'), clock, h('div', { class: 'rf-bar', role: 'presentation' }, bar)),
        h('p', { class: 'eyebrow' }, `Question ${i + 1} of ${items.length}${cue ? ` · ${cue[0]}` : ''}`),
        h('h2', { class: 'qtext' }, it.q), h('div', { class: `opts ${it.kind === 'tf' ? 'two' : ''}`.trim() }, btns), status);
      const iv = setInterval(() => { if (!box.isConnected || closed) { clearInterval(iv); return; } tick(qEnd, secs * 1000); }, 100);
      tick(qEnd, secs * 1000);
      await wait(qEnd - Date.now());
      clearInterval(iv);
      if (closed) return;
      const ok = picked != null && right(order[picked]);
      const gained = pointsFor(ok, qEnd - pickedAt, secs);
      if (ok) { correct++; score += gained; }
      myAnswers.push(picked == null ? -1 : picked);
      btns.forEach((b, j) => { b.disabled = true; if (right(order[j])) b.classList.add('ok'); else if (j === picked) b.classList.add('bad'); });
      status.textContent = picked == null ? 'Time is up. No answer.' : ok ? `Right! +${gained} points` : 'Not this time.';
      status.classList.add(ok ? 'good' : 'oops');
      await wait(qStart + per - Date.now());
    }
    if (closed) return;
    finished = true; stage = 'results';
    fill(box, h('h1', {}, 'Nicely done'), h('p', { class: 'muted' }, 'Waiting for everyone to finish…'));
    await S.store.savePlayer(code, S.user.uid, { score, correct, total: items.length, finished: true }).catch(() => {});
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
    if (r.state === 'lobby' && stage === 'lobby' && mine()) drawLobby();
    if (r.state === 'playing' && !started && mine()) { started = true; runGame().catch((e) => { console.error(e); fill(box, h('p', { class: 'err' }, 'Something went wrong in this room.'), h('a', { class: 'btn', href: '#/home' }, 'Back to home')); }); }
    if (r.state === 'playing' && !started && !mine()) fill(box, h('h1', {}, 'This game already started'), h('a', { class: 'btn', href: '#/home' }, 'Back to home'));
  }));
}
