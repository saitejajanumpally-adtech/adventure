import { shuffle } from './util.js';
import { generateGrid } from './crossword.js';
import { h, ic, fill, petFigure } from './ui.js';
import { HINTS, QUESTION_CUES } from './data.js';

/* Set by the app so feedback boxes can show the player's companion. */
export const hooks = { companion: null };

/* ---------- timer (pauses when the tab is hidden or an ad is playing) ---------- */
export function makeTimer() {
  let acc = 0, started = null, stopped = false;
  const t = {
    start() { if (started == null && !stopped) started = Date.now(); },
    pause() { if (started != null) { acc += Date.now() - started; started = null; } },
    resume() { if (started == null && !stopped) started = Date.now(); },
    ms() { return acc + (started != null ? Date.now() - started : 0); },
    stop() { stopped = true; t.pause(); document.removeEventListener('visibilitychange', vis); }
  };
  const vis = () => { if (document.hidden) t.pause(); else t.resume(); };
  document.addEventListener('visibilitychange', vis);
  return t;
}

export function feedbackBox(ok, why, extra, label, badge) {
  return h('div', { class: `fb ${ok ? 'ok' : 'bad'}`, role: 'status' },
    hooks.companion ? h('div', { class: 'fb-pet' }, petFigure(hooks.companion, ok ? 'correct' : 'oops', 'sm')) : null,
    h('div', { class: 'fb-body' }, h('div', { class: 'fb-head' }, h('b', {}, label || (ok ? 'Correct' : 'Not quite')), badge || null), why ? h('p', {}, why) : null, extra));
}

const REASONS = [['wrong', 'Wrong answer'], ['unclear', 'Unclear'], ['outdated', 'Outdated'], ['other', 'Other']];
function reportRow(it, ctx) {
  const row = h('div', { class: 'reasons', hidden: true });
  const btn = h('button', { class: 'linkbtn small', onclick: () => { row.hidden = false; btn.hidden = true; } }, ic('flag'), 'Report this question');
  REASONS.forEach(([rid, label]) => row.append(h('button', { class: 'rbtn', onclick: async () => {
    fill(row, h('span', { class: 'muted' }, 'Sending…'));
    let res = 'error';
    try { res = await ctx.report(it, rid); } catch { /* shown below */ }
    fill(row, h('span', { class: 'muted', role: 'status' }, res === 'already' ? 'You already reported this one.' : res === 'ok' ? 'Thanks. An admin will review it.' : 'Could not send the report.'));
  } }, label)));
  return h('div', {}, btn, row);
}

/* Plays the joke ad before a hint, unless the player has an ad-free pass. The clock pauses while it runs. */
async function adBreak(ctx) {
  if (ctx.skipAd()) return;
  ctx.timer.pause();
  try { await ctx.showAd(ctx.hostPet); } finally { ctx.timer.resume(); }
}
const limitOf = (gameId, key, dflt) => (HINTS[gameId] && HINTS[gameId][key]) || dflt;

/* ---------- quiz (myth or fact, acronym, odd one out, daily quest) ---------- */
function askOne(box, it, i, n, ctx) {
  const sh = ctx.shell;
  return new Promise((resolve) => {
    let hinted = false, answered = false, btns = [], order = [];
    const seenBefore = ctx.isSeen && it.game ? ctx.isSeen(it.game, it.id) : null;
    sh.setHeader(`Question ${i + 1} of ${n}${seenBefore == null ? '' : seenBefore ? ' \u00B7 Seen before' : ' \u00B7 New to you'}`, (i / n) * 100);
    sh.coach.reset(); sh.note('');
    const opts = h('div', { class: `opts ${it.kind === 'tf' ? 'two' : ''}`.trim() });
    const fbHolder = h('div', {});
    const letter = (k) => (it.kind === 'tf' ? (k === 0 ? 'M' : 'F') : 'ABCD'[k]);
    const onKey = (e) => {
      if (!box.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
      if (document.querySelector('.backdrop')) return; // a dialog or the joke ad is open
      const k = String(e.key).toLowerCase();
      if (k === 'h') { e.preventDefault(); sh.triggerHint(); return; }
      const idx = it.kind === 'tf' ? ({ m: 0, f: 1 }[k] ?? -1) : Math.max('abcd'.indexOf(k), '1234'.indexOf(k));
      if (idx >= 0 && btns[idx] && !btns[idx].disabled) { e.preventDefault(); btns[idx].click(); }
    };
    const offKey = () => document.removeEventListener('keydown', onKey);

    const finish = (ok, chosen, right) => {
      if (answered) return;
      answered = true; offKey();
      btns.forEach((b) => { b.disabled = true; });
      sh.lockHint();
      right.classList.add('ok'); if (!ok) chosen.classList.add('bad');
      sh.coach.react(ok ? 'right' : 'wrong');
      const next = h('button', { class: 'btn', onclick: () => resolve({ ok, hinted }) }, i + 1 === n ? 'See results' : 'Next');
      const chip = !ok ? null : seenBefore === false ? h('span', { class: 'pop' }, ic('coin'), `+${hinted ? 5 : 10} AdCoins`)
        : seenBefore ? h('span', { class: 'pop quiet', title: 'A question you have seen before only earns AdCoins if you beat your best replay.' }, 'Seen before') : null;
      fill(fbHolder, feedbackBox(ok, it.why, h('div', { class: 'fb-actions' }, next, reportRow(it, ctx)), null, chip));
      next.focus();
    };
    const mkBtn = (k, label, cls, onPick) => h('button', { class: `opt ${cls}`.trim(), onclick: onPick }, h('span', { class: 'l', 'aria-hidden': 'true' }, letter(k)), h('span', { class: 'ot' }, label));
    if (it.kind === 'tf') {
      btns = [['Myth', false], ['Fact', true]].map(([label, val], k) => mkBtn(k, label, 'tf', () => finish(val === it.answer, btns[val ? 1 : 0], btns[it.answer ? 1 : 0])));
    } else {
      order = shuffle(it.options.map((t, idx) => ({ t, idx })));
      btns = order.map((o, k) => mkBtn(k, o.t, '', () => finish(o.idx === it.answer, btns[k], btns[order.findIndex((x) => x.idx === it.answer)])));
    }
    opts.append(...btns);
    const cue = QUESTION_CUES[it.game];
    fill(box, h('div', { class: 'qblock' }, cue ? h('p', { class: 'eyebrow' }, cue[0]) : null, h('h2', { class: 'qtext' }, it.q), cue ? h('p', { class: 'muted instr' }, cue[1]) : null), opts, fbHolder);
    document.addEventListener('keydown', onKey);

    const canHint = it.kind === 'mcq' || !!it.hint;
    sh.setHint(canHint ? async () => {
      if (hinted || answered) return;
      hinted = true; sh.hintBusy(); sh.coach.hintBefore();
      await adBreak(ctx);
      if (!box.isConnected || answered) return;
      const clue = it.hint ? `Clue: ${it.hint}${/[.!?]$/.test(it.hint) ? '' : '.'}` : '';
      // The note under the question shows the clue too, because the coach panel is hidden on phones and tablets.
      if (it.kind === 'mcq') {
        const wrong = shuffle(order.map((o, k) => (o.idx === it.answer ? -1 : k)).filter((k) => k >= 0)).slice(0, 2);
        wrong.forEach((k) => { btns[k].disabled = true; btns[k].classList.add('gone'); });
        sh.coach.hintAfter('Two wrong answers removed.', clue);
        sh.note(`${clue} Two wrong answers removed. This question now earns half AdCoins.`.trim());
      } else {
        sh.coach.hintAfter('Here is a nudge.', clue);
        sh.note(`${clue || 'Hint used.'} This question now earns half AdCoins.`);
      }
      sh.hintUsed({});
    } : null);
  });
}

export async function runQuiz(box, items, ctx) {
  let correct = 0, hints = 0;
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const r = await askOne(box, items[i], i, items.length, ctx);
    if (r.ok) correct++;
    if (r.hinted) hints++;
    out.push({ id: items[i].id, game: items[i].game, coins: r.ok ? (r.hinted ? 5 : 10) : 0, ok: r.ok });
  }
  return { correct, total: items.length, perfect: correct === items.length && hints === 0, hints, items: out };
}

/* ---------- ad-flow builder: up to 3 checks, hints unlock after the first wrong check ---------- */
export function runFlow(box, pz, ctx) {
  return new Promise((resolve) => {
    const sh = ctx.shell, n = pz.steps.length, MAX_CHECKS = 3;
    let hintsLeft = limitOf(ctx.gameId, 'perRound', 2), attempts = 0, finished = false;
    const locked = new Set(), hinted = new Set();
    sh.setHeader('Put the steps in order', 0); sh.coach.reset(); sh.note('');
    let order = shuffle(pz.steps.map((t, idx) => ({ t, idx })));
    if (order.every((s, k) => s.idx === k)) order.push(order.shift());
    let checked = false;
    const list = h('ol', { class: 'sortlist' });
    const out = h('div', {});
    const nextFree = (k, d) => { let j = k + d; while (j >= 0 && j < n && locked.has(j)) j += d; return j; };
    // Locked steps always sit in their right place; everything else keeps its order around them.
    const normalize = () => {
      const free = order.filter((s) => !locked.has(s.idx));
      let f = 0;
      order = order.map((_, p) => (locked.has(p) ? order.find((s) => s.idx === p) : free[f++]));
    };
    const move = (k, d) => {
      const j = nextFree(k, d); if (j < 0 || j >= n) return;
      [order[k], order[j]] = [order[j], order[k]];
      const idx = order[j].idx; draw();
      const li = [...list.children].find((x) => x.dataset.idx === String(idx));
      const btn = li && li.querySelectorAll('.arr')[d < 0 ? 0 : 1];
      if (btn && !btn.disabled) btn.focus(); else if (li) li.querySelector('.arr:not(:disabled)')?.focus();
    };
    function draw() {
      fill(list, order.map((s, k) => {
        const lock = locked.has(s.idx);
        return h('li', { class: `sl ${lock ? 'locked' : ''} ${checked ? (s.idx === k ? 'ok' : 'bad') : ''}`.trim(), 'data-idx': s.idx },
          checked || lock ? h('span', { class: 'grip off', 'aria-hidden': 'true' }, lock ? ic('lock') : null) : h('span', { class: 'grip', 'aria-hidden': 'true', title: 'Drag to reorder' }, ic('grip-vertical')),
          h('span', { class: 'num' }, k + 1), h('span', { class: 'sl-text' }, s.t),
          checked || lock ? null : h('span', { class: 'arrows' },
            h('button', { class: 'arr', 'aria-label': `Move up: ${s.t}`, disabled: nextFree(k, -1) < 0, onclick: () => move(k, -1) }, ic('chevron-up')),
            h('button', { class: 'arr', 'aria-label': `Move down: ${s.t}`, disabled: nextFree(k, 1) >= n, onclick: () => move(k, 1) }, ic('chevron-down'))));
      }));
    }
    const finalise = () => {
      finished = true; checked = true; draw(); checkBtn.remove(); tip.remove(); sh.lockHint();
      const correct = order.filter((s, k) => s.idx === k).length;
      sh.setHeader('Put the steps in order', 100); sh.coach.react(correct === n ? 'right' : 'wrong');
      const coins = order.reduce((sum, s, k) => sum + (s.idx === k ? (hinted.has(s.idx) ? 5 : 10) : 0), 0);
      fill(out, feedbackBox(correct === n, pz.why, h('div', {},
        correct === n ? null : h('p', { class: 'muted' }, 'Correct order:'),
        correct === n ? null : h('ol', { class: 'plain' }, pz.steps.map((s) => h('li', {}, s))),
        h('button', { class: 'btn', onclick: () => resolve({ correct, total: n, perfect: correct === n && attempts === 1 && hinted.size === 0, hints: hinted.size, items: [{ id: pz.id, game: ctx.gameId, coins }] }) }, 'See results'))));
    };
    const check = () => {
      if (finished) return;
      attempts++;
      const correct = order.filter((s, k) => s.idx === k).length;
      if (correct === n || attempts >= MAX_CHECKS) { finalise(); return; }
      const left = MAX_CHECKS - attempts;
      sh.coach.react('wrong');
      sh.coach.note(hintsLeft > 0 ? 'Stuck? A hint can place a step for you.' : '');
      sh.hintEnable(hintsLeft > 0);
      fill(out, h('div', { class: 'fb bad', role: 'status' }, h('div', { class: 'fb-body' }, h('b', {}, `${correct} of ${n} steps are in the right place`),
        h('p', {}, `You can check ${left} more ${left === 1 ? 'time' : 'times'}. Keep moving steps, or finish now.`),
        h('div', { class: 'fb-actions' }, h('button', { class: 'btn ghost', onclick: () => fill(out) }, 'Keep trying'), h('button', { class: 'linkbtn', onclick: finalise }, 'Finish now')))));
    };
    const tip = h('p', { class: 'muted' }, `Drag the grip on the left, or use the arrows. You can check up to ${MAX_CHECKS} times.`);
    const checkBtn = h('button', { class: 'btn', onclick: check }, 'Check order');
    fill(box, h('h2', { class: 'qtext' }, pz.title), tip, list, h('div', { class: 'center-row' }, checkBtn), out);
    draw();
    if (window.Sortable) {
      window.Sortable.create(list, { handle: '.grip', draggable: '.sl:not(.locked)', animation: 150, ghostClass: 'sl-ghost', onEnd: () => {
        order = [...list.children].map((li) => order.find((s) => String(s.idx) === li.dataset.idx));
        normalize(); draw();
      } });
    }
    sh.setHint(async () => {
      if (finished || hintsLeft <= 0 || attempts < 1) return;
      const k = order.findIndex((s, p) => s.idx !== p && !locked.has(p));
      if (k < 0) return;
      hintsLeft--; sh.hintBusy(); sh.coach.hintBefore();
      await adBreak(ctx);
      if (!box.isConnected || finished) return;
      const from = order.findIndex((s) => s.idx === k);
      [order[k], order[from]] = [order[from], order[k]];
      locked.add(k); hinted.add(k); fill(out); draw();
      sh.coach.hintAfter(`Step ${k + 1} placed for you.`, 'It is now locked in place.');
      sh.note(`Step ${k + 1} placed and locked. That step now earns half AdCoins.`);
      sh.hintUsed({ left: hintsLeft, again: true });
      sh.hintEnable(hintsLeft > 0 && order.some((s, p) => s.idx !== p));
    }, hintsLeft);
    sh.hintEnable(false);
    sh.coach.note('The hint unlocks after your first check.');
  });
}

/* ---------- jargon match with three lives ---------- */
export function runMatch(box, pz, ctx) {
  return new Promise((resolve) => {
    const sh = ctx.shell, n = pz.pairs.length, hintLimit = limitOf(ctx.gameId, 'perRound', 1);
    let hintsLeft = hintLimit;
    sh.coach.reset(); sh.note('');
    const finish = (shown, win, mistakes, hintedCount, matchedCount) => {
      const coins = win ? Math.max(0, n - mistakes - hintedCount) * 10 + hintedCount * 5 : Math.max(0, matchedCount - hintedCount) * 10 + hintedCount * 5;
      const used = hintLimit - hintsLeft; // counts a hint used before "Try again" too
      resolve({ correct: shown, total: n, perfect: win && mistakes === 0 && used === 0, hints: Math.max(hintedCount, used), items: [{ id: pz.id, game: ctx.gameId, coins }] });
    };
    function round() {
      sh.setHeader('Match each term', 0);
      const defs = shuffle(pz.pairs.map((p, idx) => ({ d: p.def, idx })));
      let sel = null, mistakes = 0, lives = 3, over = false;
      const matched = new Set(), hintedPairs = new Set();
      const hearts = h('div', { class: 'hearts' });
      const msg = h('p', { class: 'muted', role: 'status' }, 'Tap a term, then its meaning.');
      const out = h('div', {});
      const drawHearts = () => fill(hearts, [0, 1, 2].map((i) => ic(i < lives ? 'heart-filled' : 'heart-broken', i < lives ? 'life' : 'life lost')));
      hearts.setAttribute('aria-label', 'Lives left');
      const termBtns = pz.pairs.map((p, idx) => h('button', { class: 'mbtn', onclick: () => { if (matched.has(idx) || over) return; sel = idx; paint(); } }, p.term));
      const defBtns = defs.map((d, k) => h('button', { class: 'mbtn def', onclick: () => pick(d, defBtns[k]) }, d.d));
      const paint = () => {
        termBtns.forEach((b, i) => { b.classList.toggle('sel', sel === i); b.classList.toggle('ok', matched.has(i)); b.disabled = matched.has(i) || over; });
        defBtns.forEach((b, i) => { b.classList.toggle('ok', matched.has(defs[i].idx)); b.disabled = matched.has(defs[i].idx) || over; });
      };
      const checkEnd = () => {
        paint();
        if (matched.size === n) {
          over = true; paint(); sh.lockHint(); sh.coach.react(mistakes === 0 && hintedPairs.size === 0 ? 'great' : 'right');
          out.append(feedbackBox(mistakes === 0, mistakes === 0 ? (hintedPairs.size ? 'No mistakes, with a little help.' : 'No mistakes.') : `You made ${mistakes} wrong ${mistakes === 1 ? 'match' : 'matches'}.`,
            h('div', { class: 'fb-actions' }, h('button', { class: 'btn', onclick: () => finish(Math.max(0, n - mistakes), true, mistakes, hintedPairs.size, matched.size) }, 'See results'))));
        } else if (lives <= 0) {
          over = true; paint(); sh.lockHint();
          out.append(feedbackBox(false, `You matched ${matched.size} of ${n}. Want another go?`,
            h('div', { class: 'row gap wrap' },
              h('button', { class: 'btn', onclick: () => round() }, 'Try again'),
              h('button', { class: 'btn ghost', onclick: () => finish(matched.size, false, mistakes, hintedPairs.size, matched.size) }, 'See results')), 'Out of lives'));
        }
      };
      const pick = (d, btn) => {
        if (over) return;
        if (sel == null) { msg.textContent = 'Pick a term first.'; return; }
        if (d.idx === sel) { matched.add(sel); sel = null; msg.textContent = 'Matched.'; sh.setHeader(`Matched ${matched.size} of ${n}`, (matched.size / n) * 100); sh.coach.react('right'); }
        else {
          mistakes++; lives--; sel = null; drawHearts();
          btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 500);
          msg.textContent = lives > 0 ? `Not that one. ${lives} ${lives === 1 ? 'life' : 'lives'} left.` : 'Out of lives.';
          sh.coach.react('wrong');
        }
        checkEnd();
      };
      fill(box, h('div', { class: 'row' }, h('h2', { class: 'qtext' }, pz.title), hearts), msg, h('div', { class: 'mcols' }, h('div', {}, termBtns), h('div', {}, defBtns)), out);
      drawHearts(); paint();
      sh.setHint(async () => {
        if (over || hintsLeft <= 0) return;
        const left = pz.pairs.map((_, i) => i).filter((i) => !matched.has(i));
        if (!left.length) return;
        const idx = left[Math.floor(Math.random() * left.length)];
        hintsLeft--; sh.hintBusy(); sh.coach.hintBefore();
        await adBreak(ctx);
        if (!box.isConnected || over) return;
        matched.add(idx); hintedPairs.add(idx); sel = null;
        msg.textContent = `Matched: ${pz.pairs[idx].term}.`;
        sh.setHeader(`Matched ${matched.size} of ${n}`, (matched.size / n) * 100);
        sh.coach.hintAfter('One pair matched for you.', `${pz.pairs[idx].term} goes with that meaning.`);
        sh.note('One pair revealed. That pair now earns half AdCoins.');
        sh.hintUsed({ left: hintsLeft, again: false });
        checkEnd();
      }, hintsLeft);
      if (hintsLeft <= 0) sh.hintEnable(false);
    }
    round();
  });
}

/* ---------- stack sorter ---------- */
export function runSort(box, pz, ctx) {
  return new Promise((resolve) => {
    const sh = ctx.shell, cards = shuffle(pz.cards);
    const cols = pz.layers.map(() => []);
    const layersEl = h('div', { class: 'layers' });
    let i = 0, correct = 0, earned = 0, hintsLeft = limitOf(ctx.gameId, 'perRound', 3), hintsUsed = 0;
    const drawLayers = () => fill(layersEl, pz.layers.map((l, k) =>
      h('div', { class: 'layer' }, h('b', {}, l), h('ul', {}, cols[k].map((x) => h('li', { class: x.ok ? 'ok' : 'bad' }, x.name))))));
    const draw = () => {
      const c = cards[i], last = i + 1 === cards.length, fb = h('div', {});
      let answered = false, cardHinted = false;
      sh.setHeader(`Card ${i + 1} of ${cards.length}`, (i / cards.length) * 100); sh.coach.reset(); sh.note('');
      const btns = pz.layers.map((l, k) => h('button', { class: 'opt', onclick: () => {
        if (answered) return; answered = true;
        const ok = k === c.layer;
        if (ok) { correct++; earned += cardHinted ? 5 : 10; }
        cols[k].push({ name: c.name, ok });
        btns.forEach((b) => { b.disabled = true; });
        btns[c.layer].classList.add('ok');
        if (!ok) btns[k].classList.add('bad');
        drawLayers(); sh.lockHint();
        sh.coach.react(ok ? 'right' : 'wrong');
        const why = [ok ? '' : `${c.name} belongs in "${pz.layers[c.layer]}".`, last ? pz.why : ''].filter(Boolean).join(' ');
        const nextBtn = h('button', { class: 'btn', onclick: () => {
          if (last) resolve({ correct, total: cards.length, perfect: correct === cards.length && hintsUsed === 0, hints: hintsUsed, items: [{ id: pz.id, game: ctx.gameId, coins: earned }] });
          else { i++; draw(); }
        } }, last ? 'See results' : 'Next');
        fill(fb, feedbackBox(ok, why, h('div', { class: 'fb-actions' }, nextBtn)));
        nextBtn.focus();
      } }, l));
      fill(box, h('h2', { class: 'qtext' }, pz.title),
        h('p', { class: 'muted' }, 'Where does this belong?'), h('div', { class: 'bigcard' }, c.name), h('div', { class: 'opts' }, btns), fb, layersEl);
      drawLayers();
      sh.setHint(async () => {
        if (answered || cardHinted || hintsLeft <= 0) return;
        cardHinted = true; hintsLeft--; hintsUsed++; sh.hintBusy(); sh.coach.hintBefore();
        await adBreak(ctx);
        if (!box.isConnected || answered) return;
        const wrong = shuffle(pz.layers.map((_, k) => k).filter((k) => k !== c.layer));
        const grey = wrong.slice(0, Math.max(1, Math.floor((pz.layers.length - 1) / 2)));
        grey.forEach((k) => { btns[k].disabled = true; btns[k].classList.add('gone'); });
        const one = grey.length === 1;
        sh.coach.hintAfter(`${one ? 'One wrong layer' : `${grey.length} wrong layers`} greyed out.`, 'Think about who pays whom.');
        sh.note(`${one ? 'One wrong layer' : `${grey.length} wrong layers`} greyed out. This card now earns half AdCoins.`);
        sh.hintUsed({ left: hintsLeft, again: false });
      }, hintsLeft);
    };
    draw();
  });
}

/* ---------- crossword ---------- */
export function runCross(box, pz, ctx) {
  return new Promise((resolve) => {
    const sh = ctx.shell;
    const g = generateGrid(pz.words);
    if (!g) { fill(box, h('p', {}, 'This crossword could not be built. Try another game.'), h('a', { class: 'btn', href: '#/home' }, 'Home')); return; }
    const solved = new Set(), filled = new Set(), hintedWords = new Set(), hintCells = new Map();
    let selIdx = null, hintsLeft = limitOf(ctx.gameId, 'perRound', 3);
    sh.coach.reset(); sh.note('');
    const startNum = new Map(g.entries.map((e) => [`${e.r},${e.c}`, e.n]));
    const cellsOf = (e) => Array.from({ length: e.answer.length }, (_, k) => `${e.r + (e.dir === 'down' ? k : 0)},${e.c + (e.dir === 'across' ? k : 0)}`);
    const gridEl = h('div', { class: 'cw-grid' });
    // Cell size follows the space available, again whenever the screen is resized or rotated.
    const sizeGrid = () => {
      if (!box.isConnected) { window.removeEventListener('resize', sizeGrid); return; }
      const avail = Math.min(box.clientWidth || 340, 640);
      const cell = Math.max(18, Math.min(40, Math.floor((avail - 8) / g.cols) - 2));
      gridEl.style.cssText = `grid-template-columns:repeat(${g.cols},${cell}px);grid-auto-rows:${cell}px;font-size:${Math.round(cell * 0.55)}px`;
    };
    window.addEventListener('resize', sizeGrid);
    const panel = h('div', { class: 'cw-panel', hidden: true });
    const cluesEl = h('div', { class: 'clues' });
    const status = h('p', { class: 'muted', role: 'status' });
    const label = h('label', { for: 'cw-in' });
    const input = h('input', { id: 'cw-in', class: 'cw-in', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Your answer' });
    const err = h('p', { class: 'err', role: 'alert' });
    const refreshHint = () => sh.hintEnable(hintsLeft > 0 && selIdx != null && !solved.has(selIdx) && !hintedWords.has(selIdx));
    const paint = () => {
      const selCells = selIdx != null ? new Set(cellsOf(g.entries[selIdx])) : new Set();
      fill(gridEl, g.letters.flatMap((row, r) => row.map((ch, c) => {
        if (!ch) return h('div', { class: 'cw-empty' });
        const k = `${r},${c}`;
        return h('div', { class: `cw-cell ${selCells.has(k) ? 'sel' : ''} ${filled.has(k) ? 'done' : ''} ${hintCells.has(k) && !filled.has(k) ? 'hintc' : ''}`.trim() }, startNum.has(k) ? h('small', {}, startNum.get(k)) : null, filled.has(k) ? ch : hintCells.has(k) ? hintCells.get(k) : '');
      })));
      const list = (dir) => h('div', {}, h('b', {}, dir === 'across' ? 'Across' : 'Down'), g.entries.map((e, i) => e.dir !== dir ? null :
        h('button', { class: `clue ${solved.has(i) ? 'ok' : ''} ${selIdx === i ? 'sel' : ''}`, disabled: solved.has(i), onclick: () => { selIdx = i; err.textContent = ''; paint(); input.value = ''; input.focus(); } }, `${e.n}. ${e.clue} (${e.answer.length})`)));
      fill(cluesEl, list('across'), list('down'));
      status.textContent = `${solved.size} of ${g.entries.length} solved`;
      sh.setHeader(`${solved.size} of ${g.entries.length} solved`, (solved.size / g.entries.length) * 100);
      panel.hidden = selIdx == null;
      if (selIdx != null) { const e = g.entries[selIdx]; label.textContent = `${e.n} ${e.dir === 'across' ? 'Across' : 'Down'}, ${e.answer.length} letters`; input.maxLength = e.answer.length; }
      refreshHint();
    };
    const done = () => {
      const all = solved.size === g.entries.length;
      sh.lockHint();
      const coins = [...solved].reduce((s, i) => s + (hintedWords.has(i) ? 5 : 10), 0);
      box.append(feedbackBox(all, all ? 'Every clue solved.' : 'The remaining answers are now shown.',
        h('div', { class: 'fb-actions' }, h('button', { class: 'btn', onclick: () => { window.removeEventListener('resize', sizeGrid); resolve({ correct: solved.size, total: g.entries.length, perfect: all && hintedWords.size === 0, hints: hintedWords.size, items: [{ id: pz.id, game: ctx.gameId, coins }] }); } }, 'See results'))));
      panel.hidden = true;
    };
    const submit = () => {
      if (selIdx == null) return;
      const e = g.entries[selIdx], v = input.value.toUpperCase().replace(/[^A-Z]/g, '');
      if (v !== e.answer) { err.textContent = v.length === e.answer.length ? 'Not quite. Try again.' : `Needs ${e.answer.length} letters.`; input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 500); return; }
      err.textContent = ''; solved.add(selIdx); cellsOf(e).forEach((k) => filled.add(k)); selIdx = null; input.value = ''; sh.coach.react('right');
      paint(); if (solved.size === g.entries.length) done();
    };
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submit(); });
    panel.append(label, h('div', { class: 'row gap' }, input, h('button', { class: 'btn inline', onclick: submit }, 'Check')), err);
    const giveUp = h('button', { class: 'linkbtn', onclick: () => { g.entries.forEach((e, i) => { if (!solved.has(i)) cellsOf(e).forEach((k) => filled.add(k)); }); selIdx = null; paint(); giveUp.remove(); done(); } }, 'Give up and show answers');
    fill(box, h('h2', { class: 'qtext' }, pz.title), status, h('div', { class: 'cw-wrap' }, gridEl), panel, cluesEl, giveUp);
    sizeGrid();
    sh.setHint(async () => {
      const idx = selIdx;
      if (idx == null || hintsLeft <= 0 || hintedWords.has(idx) || solved.has(idx)) return;
      hintsLeft--; hintedWords.add(idx); sh.hintBusy(); sh.coach.hintBefore();
      await adBreak(ctx);
      if (!box.isConnected) return;
      const e = g.entries[idx], first = `${e.r},${e.c}`;
      hintCells.set(first, e.answer[0]);
      sh.coach.hintAfter('First letter revealed.', `The word starts with ${e.answer[0]}.`);
      sh.note('First letter revealed. That word now earns half AdCoins.');
      sh.hintUsed({ left: hintsLeft, again: true });
      paint();
    }, hintsLeft);
    paint();
    sh.coach.note('Pick a clue, then tap Hint to reveal its first letter.');
  });
}
