import { shuffle } from './util.js';
import { generateGrid } from './crossword.js';
import { h, ic, fill, petFigure } from './ui.js';

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

export function feedbackBox(ok, why, extra, label) {
  return h('div', { class: `fb ${ok ? 'ok' : 'bad'}`, role: 'status' },
    hooks.companion ? h('div', { class: 'fb-pet' }, petFigure(hooks.companion, ok ? 'correct' : 'oops', 'sm')) : null,
    h('div', { class: 'fb-body' }, h('b', {}, label || (ok ? 'Correct' : 'Not quite')), why ? h('p', {}, why) : null, extra));
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

/* ---------- quiz (myth or fact, acronym, odd one out, daily quest) ---------- */
function askOne(box, it, i, n, ctx) {
  const sh = ctx.shell;
  return new Promise((resolve) => {
    let hinted = false, answered = false, btns = [], order = [];
    sh.setHeader(`Question ${i + 1} of ${n}`, (i / n) * 100);
    sh.coach.reset();
    const opts = h('div', { class: `opts ${it.kind === 'tf' ? 'two' : ''}`.trim() });
    const fbHolder = h('div', {});
    const letter = (k) => (it.kind === 'tf' ? (k === 0 ? 'M' : 'F') : 'ABCD'[k]);
    const onKey = (e) => {
      if (!box.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
      const k = String(e.key).toLowerCase();
      let idx = it.kind === 'tf' ? ({ m: 0, f: 1 }[k] ?? -1) : Math.max('abcd'.indexOf(k), '1234'.indexOf(k));
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
      fill(fbHolder, feedbackBox(ok, it.why, h('div', { class: 'fb-actions' }, next, reportRow(it, ctx))));
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
    fill(box, h('h2', { class: 'qtext' }, it.q), opts, fbHolder);
    document.addEventListener('keydown', onKey);

    const canHint = it.kind === 'mcq' || !!it.hint;
    sh.setHint(canHint ? async () => {
      if (hinted || answered) return;
      hinted = true; sh.hintBusy();
      if (ctx.hintAds) { ctx.timer.pause(); try { await ctx.showAd(ctx.hostPet); } finally { ctx.timer.resume(); } }
      if (!box.isConnected || answered) return;
      if (it.hint) sh.coach.hintSay(`Hint: ${it.hint}`);
      else {
        const wrong = shuffle(order.map((o, k) => (o.idx === it.answer ? -1 : k)).filter((k) => k >= 0)).slice(0, 2);
        wrong.forEach((k) => { btns[k].disabled = true; btns[k].classList.add('gone'); });
        sh.coach.hintSay('Two wrong answers removed.');
      }
      sh.hintUsed();
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
    out.push({ id: items[i].id, game: items[i].game, coins: r.ok ? (r.hinted ? 5 : 10) : 0 });
  }
  return { correct, total: items.length, perfect: correct === items.length && hints === 0, items: out };
}

/* ---------- ad-flow builder: drag to reorder (or use the arrows) ---------- */
export function runFlow(box, pz, ctx) {
  return new Promise((resolve) => {
    const n = pz.steps.length;
    ctx.shell.setHeader('Put the steps in order', 0); ctx.shell.setHint(null); ctx.shell.coach.reset();
    let order = shuffle(pz.steps.map((t, idx) => ({ t, idx })));
    if (order.every((s, k) => s.idx === k)) order.push(order.shift());
    let checked = false;
    const list = h('ol', { class: 'sortlist' });
    const out = h('div', {});
    const move = (k, d) => {
      const j = k + d; if (j < 0 || j >= n) return;
      [order[k], order[j]] = [order[j], order[k]];
      const idx = order[j].idx; draw();
      const li = [...list.children].find((x) => x.dataset.idx === String(idx));
      const btn = li && li.querySelectorAll('.arr')[d < 0 ? 0 : 1];
      if (btn && !btn.disabled) btn.focus(); else if (li) li.querySelector('.arr:not(:disabled)')?.focus();
    };
    function draw() {
      fill(list, order.map((s, k) => h('li', { class: `sl ${checked ? (s.idx === k ? 'ok' : 'bad') : ''}`, 'data-idx': s.idx },
        checked ? null : h('span', { class: 'grip', 'aria-hidden': 'true', title: 'Drag to reorder' }, ic('grip-vertical')),
        h('span', { class: 'num' }, k + 1), h('span', { class: 'sl-text' }, s.t),
        checked ? null : h('span', { class: 'arrows' },
          h('button', { class: 'arr', 'aria-label': `Move up: ${s.t}`, disabled: k === 0, onclick: () => move(k, -1) }, ic('chevron-up')),
          h('button', { class: 'arr', 'aria-label': `Move down: ${s.t}`, disabled: k === n - 1, onclick: () => move(k, 1) }, ic('chevron-down'))))));
    }
    const check = () => {
      checked = true; draw(); checkBtn.remove(); hint.remove();
      const correct = order.filter((s, k) => s.idx === k).length;
      ctx.shell.setHeader('Put the steps in order', 100); ctx.shell.coach.react(correct === n ? 'right' : 'wrong');
      out.append(feedbackBox(correct === n, pz.why, h('div', {},
        correct === n ? null : h('p', { class: 'muted' }, 'Correct order:'),
        correct === n ? null : h('ol', { class: 'plain' }, pz.steps.map((s) => h('li', {}, s))),
        h('button', { class: 'btn', onclick: () => resolve({ correct, total: n, perfect: correct === n, items: [{ id: pz.id, game: ctx.gameId, coins: correct * 10 }] }) }, 'See results'))));
    };
    const hint = h('p', { class: 'muted' }, 'Drag the grip on the left, or use the arrows. Nothing is locked until you check.');
    const checkBtn = h('button', { class: 'btn', onclick: check }, 'Check order');
    fill(box, h('h2', { class: 'qtext' }, pz.title), hint, list, checkBtn, out);
    draw();
    if (window.Sortable) {
      window.Sortable.create(list, { handle: '.grip', animation: 150, ghostClass: 'sl-ghost', onEnd: () => {
        order = [...list.children].map((li) => order.find((s) => String(s.idx) === li.dataset.idx));
        draw();
      } });
    }
  });
}

/* ---------- jargon match with three lives ---------- */
export function runMatch(box, pz, ctx) {
  return new Promise((resolve) => {
    const n = pz.pairs.length;
    ctx.shell.setHeader('Match each term', 0); ctx.shell.setHint(null); ctx.shell.coach.reset();
    const finish = (correct, win, mistakes) => resolve({ correct, total: n, perfect: win && mistakes === 0, items: [{ id: pz.id, game: ctx.gameId, coins: correct * 10 }] });
    function round() {
      ctx.shell.setHeader('Match each term', 0);
      const defs = shuffle(pz.pairs.map((p, idx) => ({ d: p.def, idx })));
      let sel = null, mistakes = 0, lives = 3, over = false;
      const matched = new Set();
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
      const pick = (d, btn) => {
        if (over) return;
        if (sel == null) { msg.textContent = 'Pick a term first.'; return; }
        if (d.idx === sel) { matched.add(sel); sel = null; msg.textContent = 'Matched.'; ctx.shell.setHeader(`Matched ${matched.size} of ${n}`, (matched.size / n) * 100); ctx.shell.coach.react('right'); }
        else {
          mistakes++; lives--; sel = null; drawHearts();
          btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 500);
          msg.textContent = lives > 0 ? `Not that one. ${lives} ${lives === 1 ? 'life' : 'lives'} left.` : 'Out of lives.';
          ctx.shell.coach.react('wrong');
        }
        paint();
        if (matched.size === n) {
          over = true; paint(); ctx.shell.coach.react(mistakes === 0 ? 'great' : 'right');
          out.append(feedbackBox(mistakes === 0, mistakes === 0 ? 'No mistakes.' : `You made ${mistakes} wrong ${mistakes === 1 ? 'match' : 'matches'}.`,
            h('button', { class: 'btn', onclick: () => finish(Math.max(0, n - mistakes), true, mistakes) }, 'See results')));
        } else if (lives <= 0) {
          over = true; paint();
          out.append(feedbackBox(false, `You matched ${matched.size} of ${n}. Want another go?`,
            h('div', { class: 'row gap wrap' },
              h('button', { class: 'btn', onclick: () => round() }, 'Try again'),
              h('button', { class: 'btn ghost', onclick: () => finish(matched.size, false, mistakes) }, 'See results')), 'Out of lives'));
        }
      };
      fill(box, h('div', { class: 'row' }, h('h2', { class: 'qtext' }, pz.title), hearts), msg, h('div', { class: 'mcols' }, h('div', {}, termBtns), h('div', {}, defBtns)), out);
      drawHearts(); paint();
    }
    round();
  });
}

/* ---------- stack sorter ---------- */
export function runSort(box, pz, ctx) {
  return new Promise((resolve) => {
    const cards = shuffle(pz.cards);
    const cols = pz.layers.map(() => []);
    const layersEl = h('div', { class: 'layers' });
    let i = 0, correct = 0;
    ctx.shell.setHint(null);
    const drawLayers = () => fill(layersEl, pz.layers.map((l, k) =>
      h('div', { class: 'layer' }, h('b', {}, l), h('ul', {}, cols[k].map((x) => h('li', { class: x.ok ? 'ok' : 'bad' }, x.name))))));
    const draw = () => {
      const c = cards[i], last = i + 1 === cards.length, fb = h('div', {});
      ctx.shell.setHeader(`Card ${i + 1} of ${cards.length}`, (i / cards.length) * 100); ctx.shell.coach.reset();
      const btns = pz.layers.map((l, k) => h('button', { class: 'opt', onclick: () => {
        const ok = k === c.layer;
        if (ok) correct++;
        cols[k].push({ name: c.name, ok });
        btns.forEach((b) => { b.disabled = true; });
        btns[c.layer].classList.add('ok');
        if (!ok) btns[k].classList.add('bad');
        drawLayers();
        ctx.shell.coach.react(ok ? 'right' : 'wrong');
        const why = [ok ? '' : `${c.name} belongs in "${pz.layers[c.layer]}".`, last ? pz.why : ''].filter(Boolean).join(' ');
        const nextBtn = h('button', { class: 'btn', onclick: () => {
          if (last) resolve({ correct, total: cards.length, perfect: correct === cards.length, items: [{ id: pz.id, game: ctx.gameId, coins: correct * 10 }] });
          else { i++; draw(); }
        } }, last ? 'See results' : 'Next');
        fill(fb, feedbackBox(ok, why, nextBtn));
        nextBtn.focus();
      } }, l));
      fill(box, h('h2', { class: 'qtext' }, pz.title),
        h('p', { class: 'muted' }, 'Where does this belong?'), h('div', { class: 'bigcard' }, c.name), h('div', { class: 'opts' }, btns), layersEl, fb);
      drawLayers();
    };
    draw();
  });
}

/* ---------- crossword ---------- */
export function runCross(box, pz, ctx) {
  return new Promise((resolve) => {
    const g = generateGrid(pz.words);
    if (!g) { fill(box, h('p', {}, 'This crossword could not be built. Try another game.'), h('a', { class: 'btn', href: '#/home' }, 'Home')); return; }
    const solved = new Set(), filled = new Set();
    let selIdx = null;
    ctx.shell.setHint(null); ctx.shell.coach.reset();
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
    const paint = () => {
      const selCells = selIdx != null ? new Set(cellsOf(g.entries[selIdx])) : new Set();
      fill(gridEl, g.letters.flatMap((row, r) => row.map((ch, c) => {
        if (!ch) return h('div', { class: 'cw-empty' });
        const k = `${r},${c}`;
        return h('div', { class: `cw-cell ${selCells.has(k) ? 'sel' : ''} ${filled.has(k) ? 'done' : ''}` }, startNum.has(k) ? h('small', {}, startNum.get(k)) : null, filled.has(k) ? ch : '');
      })));
      const list = (dir) => h('div', {}, h('b', {}, dir === 'across' ? 'Across' : 'Down'), g.entries.map((e, i) => e.dir !== dir ? null :
        h('button', { class: `clue ${solved.has(i) ? 'ok' : ''} ${selIdx === i ? 'sel' : ''}`, disabled: solved.has(i), onclick: () => { selIdx = i; err.textContent = ''; paint(); input.value = ''; input.focus(); } }, `${e.n}. ${e.clue} (${e.answer.length})`)));
      fill(cluesEl, list('across'), list('down'));
      status.textContent = `${solved.size} of ${g.entries.length} solved`;
      ctx.shell.setHeader(`${solved.size} of ${g.entries.length} solved`, (solved.size / g.entries.length) * 100);
      panel.hidden = selIdx == null;
      if (selIdx != null) { const e = g.entries[selIdx]; label.textContent = `${e.n} ${e.dir === 'across' ? 'Across' : 'Down'}, ${e.answer.length} letters`; input.maxLength = e.answer.length; }
    };
    const done = () => {
      const all = solved.size === g.entries.length;
      box.append(feedbackBox(all, all ? 'Every clue solved.' : 'The remaining answers are now shown.',
        h('button', { class: 'btn', onclick: () => { window.removeEventListener('resize', sizeGrid); resolve({ correct: solved.size, total: g.entries.length, perfect: all, items: [{ id: pz.id, game: ctx.gameId, coins: solved.size * 10 }] }); } }, 'See results')));
      panel.hidden = true;
    };
    const submit = () => {
      if (selIdx == null) return;
      const e = g.entries[selIdx], v = input.value.toUpperCase().replace(/[^A-Z]/g, '');
      if (v !== e.answer) { err.textContent = v.length === e.answer.length ? 'Not quite. Try again.' : `Needs ${e.answer.length} letters.`; input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 500); return; }
      err.textContent = ''; solved.add(selIdx); cellsOf(e).forEach((k) => filled.add(k)); selIdx = null; input.value = ''; ctx.shell.coach.react('right');
      paint(); if (solved.size === g.entries.length) done();
    };
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submit(); });
    panel.append(label, h('div', { class: 'row gap' }, input, h('button', { class: 'btn inline', onclick: submit }, 'Check')), err);
    const giveUp = h('button', { class: 'linkbtn', onclick: () => { g.entries.forEach((e, i) => { if (!solved.has(i)) cellsOf(e).forEach((k) => filled.add(k)); }); selIdx = null; paint(); giveUp.remove(); done(); } }, 'Give up and show answers');
    fill(box, h('h2', { class: 'qtext' }, pz.title), status, h('div', { class: 'cw-wrap' }, gridEl), panel, cluesEl, giveUp);
    sizeGrid();
    paint();
  });
}
