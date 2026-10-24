import { GAMES } from './data.js';
import { h, ic, fill, toast } from './ui.js';
import { validatePack, parseJson, buildPrompt, normalizeItem } from './validate.js';

const PACK_GAMES = GAMES.filter((g) => g.live && g.kind !== 'mission');
const QUIZ = ['myth-or-fact', 'acronym-decoder', 'odd-one-out'];
const REASON_LABEL = { wrong: 'Wrong answer', unclear: 'Unclear', outdated: 'Outdated', other: 'Other' };
const titleOf = (id) => (GAMES.find((g) => g.id === id) || { title: id }).title;

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = t; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove();
  }
}

/* ---------- Add questions tab ---------- */
function addTab(S) {
  let game = PACK_GAMES[0].id, checked = null, current = { items: [], version: 0, source: 'starter' };
  const info = h('p', { class: 'muted' }), results = h('div', {}), versionsEl = h('div', {});
  const sel = h('select', { id: 'pack', onchange: () => { game = sel.value; checked = null; fill(results); refresh(); } }, PACK_GAMES.map((g) => h('option', { value: g.id }, g.title)));
  const topic = h('input', { id: 'topic', placeholder: 'Optional focus, for example header bidding' });
  const count = h('input', { id: 'count', type: 'number', min: 5, max: 60, value: 20 });
  const paste = h('textarea', { id: 'paste', rows: 6, placeholder: 'Paste the JSON here, or choose a file below' });
  const file = h('input', { type: 'file', accept: '.json,.txt,application/json', 'aria-label': 'Choose a JSON file', onchange: async () => { if (file.files[0]) paste.value = await file.files[0].text(); } });
  const modeAdd = h('input', { type: 'radio', name: 'mode', value: 'add', checked: true, id: 'm1' });
  const modeRep = h('input', { type: 'radio', name: 'mode', value: 'replace', id: 'm2' });

  async function refresh() {
    current = await S.store.loadPack(game);
    info.textContent = `Live pack: ${current.items.length} items (${current.source === 'starter' ? 'built-in starter content' : 'version ' + current.version}).`;
    const vs = await S.store.listVersions(game).catch(() => []);
    fill(versionsEl, h('h3', {}, 'Versions'), vs.length ? vs.map((v) => h('div', { class: 'srow' }, h('span', {}, `Version ${v.version}${v.id === String(current.version) ? ' (live)' : ''}`), h('span', { class: 'muted' }, `${v.count} items`),
      v.id === String(current.version) ? null : h('button', { class: 'linkbtn', onclick: async () => { if (!confirm(`Restore version ${v.version}?`)) return; await S.store.restoreVersion(game, v.id, S.user.email); toast('Version restored.'); refresh(); } }, 'Restore'))) : h('p', { class: 'muted' }, 'No published versions yet.'));
  }

  function check() {
    fill(results);
    let data;
    try { data = parseJson(paste.value); } catch { results.append(h('p', { class: 'err' }, 'This is not valid JSON. Ask the AI to return only JSON, then paste it again.')); return; }
    checked = validatePack(game, data, modeRep.checked ? [] : current.items);
    const v = checked;
    results.append(h('div', { class: 'card' },
      h('b', {}, `${v.valid.length} ready`), h('p', { class: 'muted' }, `${v.errors.length} need a fix, ${v.dups.length} duplicates skipped`),
      v.errors.slice(0, 8).map((e) => h('p', { class: 'err small' }, `Item ${e.n}: ${e.msg}`)),
      v.errors.length > 8 ? h('p', { class: 'muted' }, `…and ${v.errors.length - 8} more`) : null,
      v.warnings.map((w) => h('p', { class: 'muted small' }, w)),
      v.valid.length ? h('details', {}, h('summary', {}, 'Preview'), v.valid.slice(0, 5).map((it) => h('p', { class: 'small' }, it.q || it.title))) : null,
      v.valid.length ? h('button', { class: 'btn', onclick: publish }, `Publish ${v.valid.length} ${v.valid.length === 1 ? 'item' : 'items'}`) : null));
  }

  async function publish() {
    const items = modeRep.checked ? checked.valid : [...current.items, ...checked.valid];
    if (JSON.stringify(items).length > 900000) { toast('This pack would be too large. Use Replace all instead.'); return; }
    if (modeRep.checked && !confirm('Replace every existing item with this upload?')) return;
    try {
      const ver = await S.store.publishPack(game, items, modeRep.checked ? 'Replaced pack' : 'Added items', S.user.email);
      toast(`Published version ${ver}.`); paste.value = ''; file.value = ''; fill(results); checked = null; refresh();
    } catch (e) { console.error(e); toast('Publish failed. You may not have admin access.'); }
  }

  const el = h('div', {},
    h('div', { class: 'card' }, h('label', { for: 'pack' }, 'Game pack'), sel, info),
    h('div', { class: 'card' }, h('b', {}, 'Step 1: copy the prompt'), h('p', { class: 'muted' }, 'Paste it into Claude or any AI tool. It asks for a downloadable .json file and a pasted copy.'),
      h('label', { for: 'topic' }, 'Focus'), topic, h('label', { for: 'count' }, 'How many items'), count,
      h('button', { class: 'btn ghost', onclick: async () => { await copyText(buildPrompt(game, { count: Math.max(1, Math.min(60, Number(count.value) || 20)), topic: topic.value })); toast('Prompt copied.'); } }, ic('copy'), 'Copy prompt')),
    h('div', { class: 'card' }, h('b', {}, 'Step 2: upload the result'), file, paste,
      h('div', { class: 'row gap wrap' }, h('label', { for: 'm1', class: 'inl' }, modeAdd, 'Add to existing'), h('label', { for: 'm2', class: 'inl' }, modeRep, 'Replace all')),
      h('button', { class: 'btn', onclick: check }, 'Check content')),
    results, h('div', { class: 'card' }, versionsEl));
  refresh();
  return el;
}

/* ---------- Reports tab ---------- */
function field(label, input) { return h('div', {}, h('label', {}, label), input); }

function editForm(S, rep, item, pack, done) {
  const tf = rep.game === 'myth-or-fact';
  const q = h('textarea', { rows: 3 }); q.value = item.q || '';
  const why = h('textarea', { rows: 3 }); why.value = item.why || '';
  const hint = h('input', { value: item.hint || '' });
  const ans = h('select', {}, h('option', { value: 'myth' }, 'Myth'), h('option', { value: 'fact' }, 'Fact'));
  if (tf) ans.value = item.answer ? 'fact' : 'myth';
  const opts = (item.options || []).map((o) => { const i = h('input', { value: o }); return i; });
  const radios = opts.map((_, k) => h('input', { type: 'radio', name: 'correct', value: k, 'aria-label': `Option ${k + 1} is correct`, checked: item.answer === k }));
  const err = h('p', { class: 'err', role: 'alert' });
  const save = async () => {
    const raw = tf ? { id: item.id, q: q.value, answer: ans.value, why: why.value, hint: hint.value }
      : { id: item.id, q: q.value, options: opts.map((o) => o.value), answer: radios.findIndex((r) => r.checked), why: why.value, hint: hint.value };
    let fixed;
    try { fixed = normalizeItem(rep.game, raw); } catch (e) { err.textContent = `Fix this first: ${e.message}`; return; }
    try {
      await S.store.publishPack(rep.game, pack.items.map((x) => (x.id === item.id ? fixed : x)), 'Edited item after a report', S.user.email);
      await S.store.resolveReport(rep.id); toast('Saved and report closed.'); done();
    } catch (e) { console.error(e); toast('Could not save. Check your admin access.'); }
  };
  return h('div', { class: 'editbox' },
    field(tf ? 'Statement' : 'Question', q),
    tf ? field('Correct answer', ans) : h('div', {}, h('label', {}, 'Options (select the correct one)'), opts.map((o, k) => h('div', { class: 'row gap' }, radios[k], o))),
    field('Explanation', why), field('Hint (optional)', hint), err,
    h('div', { class: 'row gap wrap' }, h('button', { class: 'btn', onclick: save }, 'Save changes'), h('button', { class: 'btn ghost', onclick: done }, 'Cancel')));
}

function reportCard(S, rep, pack, reload) {
  const item = pack && pack.items.find((x) => x.id === rep.itemId);
  const reasons = Object.entries(rep.reasons || {}).map(([k, v]) => `${REASON_LABEL[k] || k} (${v})`).join(', ');
  const body = h('div', {});
  const showActions = () => {
    fill(body,
      h('p', { class: 'small muted' }, `${titleOf(rep.game)} · ${rep.count} ${rep.count === 1 ? 'report' : 'reports'}`),
      h('p', {}, h('b', {}, item ? (item.q || item.title) : rep.preview)),
      item && rep.game === 'myth-or-fact' ? h('p', { class: 'small' }, `Marked: ${item.answer ? 'Fact' : 'Myth'}`) : null,
      item && item.options ? h('ul', { class: 'plain small' }, item.options.map((o, k) => h('li', {}, k === item.answer ? `${o} (marked correct)` : o))) : null,
      item && item.why ? h('p', { class: 'small muted' }, `Explanation: ${item.why}`) : null,
      h('p', { class: 'small' }, `Reasons: ${reasons || 'none given'}`),
      !item ? h('p', { class: 'err small' }, 'This item no longer exists in the pack.') : null,
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn ghost', onclick: async () => { await S.store.resolveReport(rep.id); toast('Report closed. Question kept.'); reload(); } }, item ? 'Keep as is' : 'Dismiss'),
        item && QUIZ.includes(rep.game) ? h('button', { class: 'btn', onclick: () => fill(body, editForm(S, rep, item, pack, () => reload())) }, ic('pencil'), 'Edit') : null,
        item ? h('button', { class: 'btn ghost danger', onclick: async () => {
          if (!confirm('Remove this question from the pack?')) return;
          await S.store.publishPack(rep.game, pack.items.filter((x) => x.id !== item.id), 'Removed item after a report', S.user.email);
          await S.store.resolveReport(rep.id); toast('Question removed.'); reload();
        } }, ic('trash'), 'Remove') : null),
      item && !QUIZ.includes(rep.game) ? h('p', { class: 'small muted' }, 'To change this puzzle, remove it and upload a corrected version.') : null);
  };
  showActions();
  return h('div', { class: 'card' }, body);
}

function reportsTab(S, setBadge) {
  const holder = h('div', {}, h('p', { class: 'muted' }, 'Loading reports…'));
  async function load() {
    let list = [];
    try { list = await S.store.listReports(); } catch { fill(holder, h('p', { class: 'err' }, 'Could not load reports. Check your admin access.')); return; }
    setBadge(list.length);
    if (!list.length) { fill(holder, h('div', { class: 'card' }, h('p', {}, 'No open reports. Nice.'), h('p', { class: 'muted small' }, 'Reported questions stay live until you decide what to do.'))); return; }
    const packs = {};
    for (const r of list) if (!packs[r.game]) packs[r.game] = await S.store.loadPack(r.game);
    fill(holder, h('p', { class: 'muted small' }, 'Questions stay live while you review. Nothing is removed automatically.'), list.map((r) => reportCard(S, r, packs[r.game], load)));
  }
  load();
  return holder;
}

export function adminView(S, shell, view, go, initialTab = 'add') {
  if (!S.admin) return go('/home');
  let tab = initialTab;
  const body = h('div', {});
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const setBadge = (n) => { S.reportCount = n; drawTabs(); };
  function drawTabs() {
    fill(tabs,
      h('button', { class: `tab ${tab === 'add' ? 'on' : ''}`, role: 'tab', 'aria-selected': String(tab === 'add'), onclick: () => { tab = 'add'; drawTabs(); drawBody(); } }, 'Add questions'),
      h('button', { class: `tab ${tab === 'reports' ? 'on' : ''}`, role: 'tab', 'aria-selected': String(tab === 'reports'), onclick: () => { tab = 'reports'; drawTabs(); drawBody(); } }, 'Reports', S.reportCount ? h('span', { class: 'badge' }, S.reportCount) : null));
  }
  function drawBody() { fill(body, tab === 'add' ? addTab(S) : reportsTab(S, setBadge)); }
  drawTabs(); drawBody();
  view(shell(h('div', { class: 'stage' }, h('div', { class: 'row' }, h('h1', {}, 'Admin'), h('span', { class: 'pill' }, 'R&D admin')), tabs, body)));
}
