import { GAMES, LEVELS, GAME_LEVELS, BADGES, PETS } from './data.js';
import { h, ic, fill, toast } from './ui.js';
import { validatePack, parseJson, buildPrompt, normalizeItem } from './validate.js';
import { dateKey, weekKey } from './util.js';
import { resetProfile, qkey } from './store.js';
import { CONFIG } from './config.js';

const PACK_GAMES = GAMES.filter((g) => g.live && g.kind !== 'mission');
const LIVE_GAMES = GAMES.filter((g) => g.live);
const QUIZ = ['myth-or-fact', 'acronym-decoder', 'odd-one-out'];
const REASON_LABEL = { wrong: 'Wrong answer', unclear: 'Unclear', outdated: 'Outdated', other: 'Other' };
const TYPE_LABEL = { problem: 'Problem', idea: 'Idea', question: 'Question looks wrong' };
const titleOf = (id) => (GAMES.find((g) => g.id === id) || { title: id }).title;
const levelOf = (coins) => { let i = 0; LEVELS.forEach((l, k) => { if (coins >= l.t) i = k; }); return i + 1; };
const gameLevelOf = (correct) => { let l = 1; GAME_LEVELS.forEach((t, i) => { if (correct >= t) l = i + 1; }); return l; };
const pct = (c, t) => (t ? Math.round((c / t) * 100) : null);
const pad = (n) => String(n).padStart(2, '0');
const stamp = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const niceDate = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const addDays = (key, n) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + n); return dateKey(d); };
const nameOf = (u) => (u.fullName || u.name || '').trim() || '(no name yet)';

/* ---------- date ranges ---------- */
export function presetRange(id, today = dateKey()) {
  if (id === 'today') return { from: today, to: today };
  if (id === 'week') return { from: weekKey(new Date(`${today}T12:00:00`)), to: today };
  if (id === 'last30') return { from: addDays(today, -29), to: today };
  if (id === 'quarter') { const d = new Date(`${today}T12:00:00`); return { from: dateKey(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)), to: today }; }
  return { from: '0000-01-01', to: today };
}
const inRange = (day, r) => day >= r.from && day <= r.to;

/* ---------- CSV ---------- */
export function toCsv(rows) {
  const esc = (v) => {
    let t = v == null ? '' : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`; // text that looks like a formula must not run in Excel
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const fileDate = () => dateKey();

/* ---------- insights maths (kept separate so it can be tested) ---------- */
function daysOf(u) {
  const keys = Object.keys(u.activity || {});
  if (u.lastDay && !keys.includes(u.lastDay) && !keys.length) keys.push(u.lastDay); // played before daily records existed
  return keys;
}
function personStats(u, range, allTime) {
  let rounds = 0, correct = 0, total = 0, coins = 0;
  if (allTime) Object.values(u.played || {}).forEach((p) => { rounds += p.plays || 0; correct += p.correct || 0; total += p.total || 0; coins += p.coins || 0; });
  else Object.entries(u.activity || {}).forEach(([d, a]) => { if (inRange(d, range)) { rounds += a.r || 0; correct += a.c || 0; total += a.t || 0; coins += a.s || 0; } });
  return { rounds, correct, total, coins };
}
export function computeInsights(users, range, today = dateKey(), allTime = false) {
  const last30 = { from: addDays(today, -29), to: today };
  const neverPlayed = (u) => !Object.values(u.played || {}).some((p) => p.plays > 0);
  const kpi = {
    signedIn: users.length,
    totalSignIns: users.reduce((s, u) => s + (u.signIns || 0), 0),
    activeRange: users.filter((u) => daysOf(u).some((d) => inRange(d, range))).length,
    active30: users.filter((u) => daysOf(u).some((d) => inRange(d, last30))).length,
    neverPlayed: users.filter(neverPlayed).length
  };
  const games = LIVE_GAMES.map((g) => {
    let rounds = 0, correct = 0, total = 0, coins = 0, perfect = 0, active = 0, players = 0;
    const spread = [0, 0, 0, 0, 0];
    users.forEach((u) => {
      const p = (u.played || {})[g.id];
      if (p && p.plays > 0) { players++; spread[gameLevelOf(p.correct || 0) - 1]++; }
      if (allTime) { if (p) { rounds += p.plays || 0; correct += p.correct || 0; total += p.total || 0; coins += p.coins || 0; perfect += p.perfect || 0; } }
      let was = false;
      Object.entries(u.activity || {}).forEach(([d, a]) => {
        const ga = a.g && a.g[g.id];
        if (ga && inRange(d, range)) { was = true; if (!allTime) { rounds += ga.r || 0; correct += ga.c || 0; total += ga.t || 0; coins += ga.s || 0; perfect += ga.pf || 0; } }
      });
      if (was) active++;
    });
    return { id: g.id, title: g.title, players, active, rounds, accuracy: pct(correct, total), avgScore: rounds && coins ? Math.round(coins / rounds) : null, perfect, spread };
  });
  const people = users.map((u) => {
    const st = personStats(u, range, allTime);
    const last = Math.max(u.lastSeen || 0, u.lastDay ? new Date(`${u.lastDay}T12:00:00`).getTime() : 0);
    const streak = u.lastDay === today || u.lastDay === addDays(today, -1) ? u.streak || 0 : 0;
    return { uid: u.uid, name: nameOf(u), email: u.email || '', last, signIns: u.signIns || 0, level: levelOf(u.coins || 0), coins: u.coins || 0, spent: u.spent || 0,
      streak, bestStreak: u.bestStreak || 0, rounds: st.rounds, correct: st.correct, total: st.total, accuracy: pct(st.correct, st.total), badges: Object.keys(u.badges || {}).length, pets: Object.keys(u.met || {}).length, firstSeen: u.firstSeen || 0 };
  });
  return { kpi, games, people };
}
export function peopleCsv(users, range, allTime, today = dateKey()) {
  const { people } = computeInsights(users, range, today, allTime);
  return toCsv([['Name', 'Email', 'First seen', 'Last active', 'Sign-ins', 'Level', 'AdCoins earned', 'AdCoins spent', 'Streak', 'Best streak', 'Rounds in range', 'Correct answers', 'Questions answered', 'Accuracy %', 'Badges earned', 'Pets met'],
    ...people.map((p) => [p.name, p.email, stamp(p.firstSeen), stamp(p.last), p.signIns, p.level, p.coins, p.spent, p.streak, p.bestStreak, p.rounds, p.correct, p.total, p.accuracy ?? '', p.badges, p.pets])]);
}
export function personByGameCsv(users, range, allTime) {
  const rows = [['Name', 'Email', 'Game', 'Game level', 'Rounds in range', 'Correct answers', 'Questions answered', 'Accuracy %', 'Average score', 'Perfect rounds']];
  users.forEach((u) => LIVE_GAMES.forEach((g) => {
    const p = (u.played || {})[g.id]; if (!p || !p.plays) return;
    let r = 0, c = 0, t = 0, s = 0, pf = 0;
    if (allTime) { r = p.plays; c = p.correct || 0; t = p.total || 0; s = p.coins || 0; pf = p.perfect || 0; }
    else Object.entries(u.activity || {}).forEach(([d, a]) => { const ga = a.g && a.g[g.id]; if (ga && inRange(d, range)) { r += ga.r || 0; c += ga.c || 0; t += ga.t || 0; s += ga.s || 0; pf += ga.pf || 0; } });
    if (!allTime && !r) return;
    rows.push([nameOf(u), u.email || '', g.title, gameLevelOf(p.correct || 0), r, c, t, pct(c, t) ?? '', r && s ? Math.round(s / r) : '', pf]);
  }));
  return toCsv(rows);
}
export function gameSummaryCsv(users, range, allTime, today = dateKey()) {
  const { games } = computeInsights(users, range, today, allTime);
  return toCsv([['Game', 'Players', 'Active in range', 'Rounds', 'Accuracy %', 'Average score', 'Perfect rounds', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'],
    ...games.map((g) => [g.title, g.players, g.active, g.rounds, g.accuracy ?? '', g.avgScore ?? '', g.perfect, ...g.spread])]);
}
export function feedbackCsv(list) {
  return toCsv([['Date and time', 'Name', 'Email', 'Type', 'Message', 'Page', 'Game', 'Device', 'Browser', 'Screen size', 'App version', 'Status', 'Resolved by', 'Resolved on', 'Admin note'],
    ...list.map((f) => [stamp(f.createdAt), f.name || '', f.email || '', TYPE_LABEL[f.type] || f.type, f.message || '', f.page || '', f.game ? titleOf(f.game) : '', f.device || '', f.browser || '', f.screen || '', f.version || '', f.status === 'done' ? 'Done' : 'Open', f.resolvedBy || '', stamp(f.resolvedAt), f.note || ''])]);
}
export function reportsCsv(open, log) {
  const rows = [['Date and time', 'Reported by', 'Email', 'Game', 'Question', 'Reason', 'Reports on this question', 'Status', 'Resolved by', 'Resolved on', 'Admin note']];
  const add = (r, status) => {
    const entries = Object.values(r.reporters || {});
    const list = entries.length ? entries : [true];
    list.forEach((e) => {
      const info = e && typeof e === 'object' ? e : {};
      rows.push([stamp(info.at || r.createdAt), info.name || (typeof e === 'object' ? '' : 'Before names were recorded'), info.email || '', titleOf(r.game), r.preview || '', REASON_LABEL[info.reason] || info.reason || '', r.count || list.length,
        status, r.resolvedBy || '', stamp(r.resolvedAt), r.note || '']);
    });
  };
  open.forEach((r) => add(r, 'Open'));
  log.forEach((r) => add(r, ({ kept: 'Kept as is', edited: 'Edited', removed: 'Removed', dismissed: 'Dismissed' })[r.status] || r.status || 'Closed'));
  return toCsv(rows);
}

/* ---------- small building blocks ---------- */
const chip = (text, on, onclick) => h('button', { class: `chip ${on ? 'on' : ''}`, 'aria-pressed': String(!!on), onclick }, text);
const tscroll = (...kids) => h('div', { class: 'tscroll' }, kids);
const field = (label, input) => h('div', {}, h('label', {}, label), input);
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = t; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove();
  }
}
const cache = { users: null, at: 0 };
async function getUsers(S, force) {
  if (!force && cache.users && Date.now() - cache.at < 10 * 60 * 1000) return cache.users;
  cache.users = await S.store.listUsers(); cache.at = Date.now();
  return cache.users;
}

/* ---------- Insights ---------- */
function insightsTab(S) {
  let preset = 'week', range = presetRange('week'), sortKey = 'coins', sortDir = -1, q = '';
  let users = [];
  const body = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  const from = h('input', { type: 'date', class: 'inp date', 'aria-label': 'From date' }), to = h('input', { type: 'date', class: 'inp date', 'aria-label': 'To date' });
  const sync = () => { from.value = range.from === '0000-01-01' ? '' : range.from; to.value = range.to; };
  const setPreset = (id) => { preset = id; range = presetRange(id); sync(); draw(); };
  from.addEventListener('change', () => { if (from.value) { preset = 'custom'; range = { from: from.value, to: range.to }; draw(); } });
  to.addEventListener('change', () => { if (to.value) { preset = 'custom'; range = { from: range.from, to: to.value }; draw(); } });
  const presets = [['today', 'Today'], ['week', 'This week'], ['last30', 'Last 30 days'], ['quarter', 'This quarter'], ['all', 'All time']];
  const bar = h('div', { class: 'rangebar card' });
  const exportMenu = h('div', { class: 'xmenu', hidden: true },
    h('button', { onclick: () => { download(`people-summary-${fileDate()}.csv`, peopleCsv(users, range, preset === 'all')); exportMenu.hidden = true; } }, 'People summary'),
    h('button', { onclick: () => { download(`person-by-game-${fileDate()}.csv`, personByGameCsv(users, range, preset === 'all')); exportMenu.hidden = true; } }, 'Person by game'),
    h('button', { onclick: () => { download(`game-summary-${fileDate()}.csv`, gameSummaryCsv(users, range, preset === 'all')); exportMenu.hidden = true; } }, 'Game summary'));
  const drawBar = () => fill(bar, h('div', { class: 'row wrap gap' }, h('b', {}, 'Date range'), from, h('span', { class: 'muted' }, 'to'), to),
    h('div', { class: 'row wrap gap chips' }, presets.map(([id, t]) => chip(t, preset === id, () => setPreset(id)))));
  const head = h('div', { class: 'row wrap' }, h('h1', {}, 'Insights'), h('div', { class: 'grow' }),
    h('button', { class: 'btn ghost inline', onclick: async () => { fill(body, h('p', { class: 'muted' }, 'Refreshing…')); try { users = await getUsers(S, true); draw(); } catch { fill(body, h('p', { class: 'err' }, 'Could not load. Check your admin access.')); } } }, ic('refresh'), 'Refresh'),
    h('div', { class: 'xwrap' }, h('button', { class: 'btn inline', 'aria-haspopup': 'menu', onclick: () => { exportMenu.hidden = !exportMenu.hidden; } }, ic('download'), 'Export'), exportMenu));
  function draw() {
    drawBar();
    const allTime = preset === 'all';
    const { kpi, games, people } = computeInsights(users, range, dateKey(), allTime);
    const k = (n, label) => h('div', { class: 'kpi' }, h('b', {}, n), h('span', {}, label));
    const lvlBar = (a) => h('div', { class: 'sp5', role: 'img', 'aria-label': `Players at level 1 to 5: ${a.join(', ')}` }, a.map((v, i) => h('i', { class: `l${i + 1}`, style: `flex:${Math.max(v, 0.0001)}`, title: `Level ${i + 1}: ${v}` })));
    const filtered = people.filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => ((a[sortKey] ?? -1) > (b[sortKey] ?? -1) ? 1 : -1) * sortDir);
    const th = (key, text) => h('th', { 'aria-sort': sortKey === key ? (sortDir > 0 ? 'ascending' : 'descending') : 'none' }, h('button', { class: 'thb', onclick: () => { if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = key === 'name' || key === 'email' ? 1 : -1; } draw(); } }, text, sortKey === key ? (sortDir > 0 ? ' \u25B2' : ' \u25BC') : ''));
    const ago = (ts) => { if (!ts) return 'Never'; const d = Math.floor((Date.now() - ts) / 864e5); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`; };
    fill(body,
      h('div', { class: 'kpis' }, k(kpi.signedIn, 'People signed in'), k(kpi.totalSignIns, 'Total sign-ins'), k(kpi.activeRange, 'Active in the range'), k(kpi.active30, 'Active in the last 30 days'), k(kpi.neverPlayed, 'Signed in, never played')),
      h('p', { class: 'muted small' }, allTime ? 'All time uses each player\'s lifetime totals. Sign-ins are counted from the day tracking started.' : 'Ranges use daily activity, which is recorded from the day tracking started. Choose All time for lifetime totals.'),
      h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'By game'), h('p', { class: 'muted small' }, 'Rounds, not rankings. Level spread shows how many players are at level 1 to 5 in that game, by correct answers.'),
        tscroll(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Game', 'Players', 'Active in range', 'Rounds', 'Accuracy', 'Avg score', 'Perfect', 'Level spread'].map((t) => h('th', {}, t)))),
          h('tbody', {}, games.map((g) => h('tr', {}, h('td', {}, h('b', {}, g.title)), h('td', {}, g.players), h('td', {}, g.active), h('td', {}, g.rounds), h('td', {}, g.accuracy == null ? '\u2013' : `${g.accuracy}%`), h('td', {}, g.avgScore ?? '\u2013'), h('td', {}, g.perfect), h('td', {}, lvlBar(g.spread)))))))),
      h('div', { class: 'card' }, h('div', { class: 'row wrap' }, h('h3', { style: 'margin:0' }, 'By person'), h('div', { class: 'grow' }),
        h('input', { class: 'inp search', type: 'search', placeholder: 'Search name or email', 'aria-label': 'Search people', value: q, oninput: (e) => { q = e.target.value; const pos = e.target.selectionStart; draw(); const el = body.querySelector('.search'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } } })),
        tscroll(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, th('name', 'Name'), th('email', 'Email'), th('last', 'Last active'), th('signIns', 'Sign-ins'), th('level', 'Level'), th('coins', 'AdCoins'), th('streak', 'Streak'), th('rounds', 'Rounds'), th('accuracy', 'Accuracy'), th('badges', 'Badges'))),
          h('tbody', {}, filtered.length ? filtered.map((p) => h('tr', {}, h('td', {}, h('b', {}, p.name)), h('td', {}, p.email || '\u2013'), h('td', {}, ago(p.last)), h('td', {}, p.signIns || '\u2013'), h('td', {}, p.level), h('td', {}, p.coins), h('td', {}, p.streak), h('td', {}, p.rounds), h('td', {}, p.accuracy == null ? '\u2013' : `${p.accuracy}%`), h('td', {}, `${p.badges} of ${BADGES.length}`)))
            : h('tr', {}, h('td', { colspan: 10, class: 'muted' }, 'No one matches.'))))),
        h('p', { class: 'muted small', style: 'margin-top:8px' }, 'Export: People summary, Person by game and Game summary (CSV files for Excel or Google Sheets, for the date range above).')));
  }
  sync(); drawBar();
  getUsers(S).then((u) => { users = u; draw(); }).catch(() => fill(body, h('p', { class: 'err' }, 'Could not load the reports. Check your admin access.')));
  return h('div', {}, head, bar, body);
}

/* ---------- Add questions ---------- */
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
  const el = h('div', {}, h('h1', { style: 'margin-bottom:10px' }, 'Add questions'),
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

/* ---------- editing one item (used by the Question browser and by Reports) ---------- */
function editItemForm(S, game, item, pack, done, onSaved) {
  const quiz = QUIZ.includes(game), tf = game === 'myth-or-fact';
  const err = h('p', { class: 'err', role: 'alert' });
  let getRaw;
  const kids = [];
  if (quiz) {
    const q = h('textarea', { rows: 3 }); q.value = item.q || '';
    const why = h('textarea', { rows: 3 }); why.value = item.why || '';
    const hint = h('input', { value: item.hint || '' });
    const ans = h('select', {}, h('option', { value: 'myth' }, 'Myth'), h('option', { value: 'fact' }, 'Fact'));
    if (tf) ans.value = item.answer ? 'fact' : 'myth';
    const opts = (item.options || []).map((o) => h('input', { value: o }));
    const radios = opts.map((_, k) => h('input', { type: 'radio', name: `correct-${item.id}`, value: k, 'aria-label': `Option ${k + 1} is correct`, checked: item.answer === k }));
    kids.push(field(tf ? 'Statement' : 'Question', q),
      tf ? field('Correct answer', ans) : h('div', {}, h('label', {}, 'Options (select the correct one)'), opts.map((o, k) => h('div', { class: 'row gap' }, radios[k], o))),
      field('Explanation', why), field('Hint (optional): a nudge that does not give the answer away', hint));
    getRaw = () => (tf ? { id: item.id, q: q.value, answer: ans.value, why: why.value, hint: hint.value }
      : { id: item.id, q: q.value, options: opts.map((o) => o.value), answer: radios.findIndex((r) => r.checked), why: why.value, hint: hint.value });
  } else {
    const { id, disabled, ...rest } = item; // eslint-disable-line no-unused-vars
    const ta = h('textarea', { rows: 14, 'aria-label': 'Puzzle JSON' }); ta.value = JSON.stringify(rest, null, 2);
    kids.push(h('p', { class: 'muted small' }, 'This puzzle is edited as JSON. Keep the same field names.'), ta);
    getRaw = () => ({ id: item.id, ...JSON.parse(ta.value) });
  }
  const save = async () => {
    let fixed;
    try { fixed = normalizeItem(game, getRaw()); } catch (e) { err.textContent = `Fix this first: ${e.message}`; return; }
    if (item.disabled) fixed.disabled = true;
    try {
      await S.store.publishPack(game, pack.items.map((x) => (x.id === item.id ? fixed : x)), 'Edited an item', S.user.email);
      await onSaved(); toast('Saved.'); done();
    } catch (e) { console.error(e); toast('Could not save. Check your admin access.'); }
  };
  return h('div', { class: 'editbox' }, kids, err, h('div', { class: 'row gap wrap' }, h('button', { class: 'btn', onclick: save }, 'Save changes'), h('button', { class: 'btn ghost', onclick: done }, 'Cancel')));
}

/* ---------- Question browser ---------- */
function browseTab(S) {
  let game = PACK_GAMES[0].id, filter = 'all', q = '', limit = 40, pack = { items: [] }, stats = {}, openReports = {};
  const body = h('div', {});
  const sel = h('select', { id: 'bgame', 'aria-label': 'Game', onchange: () => { game = sel.value; limit = 40; load(); } }, PACK_GAMES.map((g) => h('option', { value: g.id }, g.title)));
  async function load() {
    fill(body, h('p', { class: 'muted' }, 'Loading…'));
    pack = await S.store.loadPack(game);
    stats = await S.store.getQStats(game).catch(() => ({}));
    const reps = await S.store.listReports().catch(() => []);
    openReports = {}; reps.filter((r) => r.game === game).forEach((r) => { openReports[r.itemId] = r.count; });
    draw();
  }
  const publish = async (items, note) => { await S.store.publishPack(game, items, note, S.user.email); pack = await S.store.loadPack(game); };
  function draw() {
    const rows = pack.items.filter((it) => (filter === 'all' || (filter === 'off') === !!it.disabled) && (!q || String(it.q || it.title).toLowerCase().includes(q.toLowerCase())));
    const quiz = QUIZ.includes(game);
    const rate = (it) => { const r = stats[`r_${qkey(it.id)}`] || 0, w = stats[`w_${qkey(it.id)}`] || 0; return r + w ? `${Math.round((r / (r + w)) * 100)}% (${r + w})` : '\u2013'; };
    fill(body,
      h('div', { class: 'row wrap gap chips' }, chip('All', filter === 'all', () => { filter = 'all'; draw(); }), chip('Live', filter === 'live', () => { filter = 'live'; draw(); }), chip('Off', filter === 'off', () => { filter = 'off'; draw(); }),
        h('div', { class: 'grow' }), h('input', { class: 'inp search', type: 'search', placeholder: 'Search questions', 'aria-label': 'Search questions', value: q, oninput: (e) => { q = e.target.value; const pos = e.target.selectionStart; draw(); const el = body.querySelector('.search'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } } })),
      h('p', { class: 'muted small' }, `${pack.items.length} items in this pack, ${pack.items.filter((i) => i.disabled).length} switched off. "Answered right" counts everyone's answers (number of answers in brackets).`),
      tscroll(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Question', quiz ? 'Hint' : null, 'Reports', 'Answered right', 'Live', ''].filter((x) => x !== null).map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.slice(0, limit).map((it) => {
          const row = h('tr', { class: it.disabled ? 'offrow' : '' });
          const cell = h('td', { colspan: quiz ? 6 : 5, class: 'editcell', hidden: true });
          const tr2 = h('tr', {}, cell);
          const sw = h('button', { class: `tg ${it.disabled ? '' : 'on'}`, role: 'switch', 'aria-checked': String(!it.disabled), 'aria-label': `${it.disabled ? 'Switch on' : 'Switch off'}: ${it.q || it.title}`, onclick: async () => {
            try { await publish(pack.items.map((x) => (x.id === it.id ? (it.disabled ? (({ disabled, ...r }) => r)(x) : { ...x, disabled: true }) : x)), it.disabled ? 'Switched an item on' : 'Switched an item off'); draw(); } catch { toast('Could not save. Check your admin access.'); }
          } });
          row.append(h('td', {}, h('b', {}, it.q || it.title)), quiz ? h('td', {}, it.hint ? 'Yes' : 'No') : null, h('td', {}, openReports[it.id] || 0), h('td', {}, rate(it)), h('td', {}, sw),
            h('td', { class: 'acts' }, h('button', { class: 'linkbtn', onclick: () => { cell.hidden = !cell.hidden; if (!cell.hidden) fill(cell, editItemForm(S, game, it, pack, () => { cell.hidden = true; load(); }, async () => {})); } }, ic('pencil'), 'Edit'),
              h('button', { class: 'linkbtn danger', onclick: async () => { if (!confirm('Delete this item from the pack?')) return; try { await publish(pack.items.filter((x) => x.id !== it.id), 'Deleted an item'); toast('Deleted.'); draw(); } catch { toast('Could not save. Check your admin access.'); } } }, ic('trash'), 'Delete')));
          return [row, tr2];
        })))),
      rows.length > limit ? h('button', { class: 'btn ghost', onclick: () => { limit += 40; draw(); } }, `Show more (${rows.length - limit} left)`) : null,
      rows.length === 0 ? h('p', { class: 'muted' }, 'Nothing matches.') : null);
  }
  const head = h('div', { class: 'row wrap' }, h('h1', {}, 'Question browser'), h('div', { class: 'grow' }),
    h('button', { class: 'btn ghost inline', onclick: () => { download(`${game}-pack-${fileDate()}.json`, JSON.stringify({ items: pack.items }, null, 2), 'application/json'); } }, ic('download'), 'Download pack (backup)'));
  load();
  return h('div', {}, head, h('div', { class: 'card' }, h('label', { for: 'bgame' }, 'Game'), sel), body);
}

/* ---------- Reports ---------- */
function reportCard(S, rep, pack, reload) {
  const item = pack && pack.items.find((x) => x.id === rep.itemId);
  const reasons = Object.entries(rep.reasons || {}).map(([k, v]) => `${REASON_LABEL[k] || k} (${v})`).join(', ');
  const who = Object.values(rep.reporters || {}).filter((e) => e && typeof e === 'object').map((e) => e.name || e.email).filter(Boolean);
  const body = h('div', {});
  const close = async (status, note) => { await S.store.resolveReport(rep.id, status, S.user.email, note || ''); };
  const showActions = () => {
    fill(body,
      h('p', { class: 'small muted' }, `${titleOf(rep.game)} \u00B7 ${rep.count} ${rep.count === 1 ? 'report' : 'reports'} \u00B7 first reported ${niceDate(rep.createdAt)}`),
      h('p', {}, h('b', {}, item ? (item.q || item.title) : rep.preview)),
      item && rep.game === 'myth-or-fact' ? h('p', { class: 'small' }, `Marked: ${item.answer ? 'Fact' : 'Myth'}`) : null,
      item && item.options ? h('ul', { class: 'plain small' }, item.options.map((o, k) => h('li', {}, k === item.answer ? `${o} (marked correct)` : o))) : null,
      item && item.why ? h('p', { class: 'small muted' }, `Explanation: ${item.why}`) : null,
      h('p', { class: 'small' }, `Reasons: ${reasons || 'none given'}`),
      who.length ? h('p', { class: 'small' }, `Reported by: ${who.join(', ')}`) : null,
      !item ? h('p', { class: 'err small' }, 'This item no longer exists in the pack.') : null,
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn ghost', onclick: async () => { await close(item ? 'kept' : 'dismissed'); toast('Report closed. Question kept.'); reload(); } }, item ? 'Keep as is' : 'Dismiss'),
        item ? h('button', { class: 'btn', onclick: () => fill(body, editItemForm(S, rep.game, item, pack, () => reload(), async () => { await close('edited'); })) }, ic('pencil'), 'Edit') : null,
        item ? h('button', { class: 'btn ghost danger', onclick: async () => {
          if (!confirm('Remove this question from the pack?')) return;
          await S.store.publishPack(rep.game, pack.items.filter((x) => x.id !== item.id), 'Removed item after a report', S.user.email);
          await close('removed'); toast('Question removed.'); reload();
        } }, ic('trash'), 'Remove') : null));
  };
  showActions();
  return h('div', { class: 'card' }, body);
}
function reportsTab(S, H) {
  const holder = h('div', {}, h('p', { class: 'muted' }, 'Loading reports…'));
  const head = h('div', { class: 'row wrap' }, h('h1', {}, 'Reported questions'), h('div', { class: 'grow' }),
    h('button', { class: 'btn inline', onclick: async () => {
      try { const [open, log] = await Promise.all([S.store.listReports(), S.store.listReportLog()]); download(`reported-questions-${fileDate()}.csv`, reportsCsv(open, log)); } catch { toast('Could not export. Check your admin access.'); }
    } }, ic('download'), 'Export'));
  async function load() {
    let list = [];
    try { list = await S.store.listReports(); } catch { fill(holder, h('p', { class: 'err' }, 'Could not load reports. Check your admin access.')); return; }
    H.setCounts(list.length, S.feedbackCount || 0);
    if (!list.length) { fill(holder, h('div', { class: 'card' }, h('p', {}, 'No open reports. Nice.'), h('p', { class: 'muted small' }, 'Reported questions stay live until you decide what to do. Closed reports are kept for the export.'))); return; }
    const packs = {};
    for (const r of list) if (!packs[r.game]) packs[r.game] = await S.store.loadPack(r.game);
    fill(holder, h('p', { class: 'muted small' }, 'Questions stay live while you review. Nothing is removed automatically.'), list.map((r) => reportCard(S, r, packs[r.game], load)));
  }
  load();
  return h('div', {}, head, holder);
}

/* ---------- People ---------- */
function peopleTab(S) {
  const body = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  const domain = `@${CONFIG.ALLOWED_DOMAIN}`;
  async function load() {
    let admins = [], users = [];
    try { admins = (await S.store.getAdmins()).map((e) => String(e).toLowerCase()); users = await getUsers(S, true); } catch { fill(body, h('p', { class: 'err' }, 'Could not load. Check your admin access.')); return; }
    const me = (S.user.email || '').toLowerCase();
    const nameFor = (email) => { const u = users.find((x) => (x.email || '').toLowerCase() === email); return u ? nameOf(u) : ''; };
    const addIn = h('input', { class: 'inp', type: 'email', placeholder: `Add an admin by email (${domain})`, 'aria-label': 'Admin email' });
    const err = h('p', { class: 'err', role: 'alert' });
    const saveList = async (list) => { await S.store.saveAdmins(list); await load(); };
    const q = h('input', { class: 'inp search', type: 'search', placeholder: 'Search players', 'aria-label': 'Search players' });
    const table = h('div', {});
    const drawPlayers = () => {
      const f = users.filter((u) => !q.value || `${nameOf(u)} ${u.email || ''}`.toLowerCase().includes(q.value.toLowerCase())).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      fill(table, tscroll(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Name', 'Email', 'Last active', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, f.slice(0, 100).map((u) => h('tr', {}, h('td', {}, h('b', {}, nameOf(u))), h('td', {}, u.email || '\u2013'), h('td', {}, u.lastSeen ? niceDate(u.lastSeen) : '\u2013'),
          h('td', {}, h('button', { class: 'btn ghost small-btn', onclick: async () => {
            if (!confirm(`Reset all progress for ${nameOf(u)}? Their AdCoins, levels, badges and question history go back to zero. This cannot be undone. If they are playing right now, ask them to reload the page afterwards.`)) return;
            try { await S.store.resetUser(u.uid, resetProfile(u)); cache.users = null; toast('Progress reset.'); load(); } catch { toast('Could not reset. Check your admin access.'); }
          } }, 'Reset progress\u2026')))))),
        f.length > 100 ? h('p', { class: 'muted small' }, `Showing the first 100 of ${f.length}. Use the search box.`) : null));
    };
    q.addEventListener('input', drawPlayers);
    fill(body,
      h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, `Admins (${admins.length})`), h('p', { class: 'muted small' }, 'Admins can see names, progress and scores, and change settings.'),
        tscroll(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Name', 'Email', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, admins.map((e) => h('tr', {}, h('td', {}, h('b', {}, nameFor(e) || '\u2013'), e === me ? h('span', { class: 'tag p', style: 'margin-left:6px' }, 'You') : null), h('td', {}, e),
            h('td', {}, e === me ? h('span', { class: 'muted small' }, "Can't remove yourself") : admins.length <= 1 ? h('span', { class: 'muted small' }, "Can't remove the last admin")
              : h('button', { class: 'btn ghost small-btn', onclick: async () => { if (!confirm(`Remove ${e} as an admin?`)) return; try { await saveList(admins.filter((x) => x !== e)); toast('Admin removed.'); } catch { toast('Could not save. Check your admin access.'); } } }, 'Remove'))))))),
        h('div', { class: 'row gap wrap', style: 'margin-top:10px' }, h('div', { class: 'grow' }, addIn), h('button', { class: 'btn inline', onclick: async () => {
          const email = addIn.value.trim().toLowerCase();
          if (!email.endsWith(domain) || email.length <= domain.length + 1) { err.textContent = `Use a ${domain} email address.`; return; }
          if (admins.includes(email)) { err.textContent = 'That person is already an admin.'; return; }
          err.textContent = '';
          try { await saveList([...admins, email]); toast('Admin added.'); } catch { err.textContent = 'Could not save. Check your admin access.'; }
        } }, 'Add admin')), err),
      h('div', { class: 'card' }, h('div', { class: 'row wrap' }, h('h3', { style: 'margin:0' }, `Players (${users.length})`), h('div', { class: 'grow' }), q), table));
    drawPlayers();
  }
  load();
  return h('div', {}, h('h1', { style: 'margin-bottom:10px' }, 'People'), body);
}

/* ---------- Feedback inbox ---------- */
function feedbackTab(S, H) {
  let all = [], type = 'all', status = 'all', q = '', from = '', to = '';
  const body = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
  const fromIn = h('input', { type: 'date', class: 'inp date', 'aria-label': 'From date' }), toIn = h('input', { type: 'date', class: 'inp date', 'aria-label': 'To date' });
  const filtered = () => all.filter((f) => (type === 'all' || f.type === type) && (status === 'all' || (f.status || 'open') === status)
    && (!from || stamp(f.createdAt).slice(0, 10) >= from) && (!to || stamp(f.createdAt).slice(0, 10) <= to)
    && (!q || `${f.name} ${f.email} ${f.message}`.toLowerCase().includes(q.toLowerCase())));
  const head = h('div', { class: 'row wrap' }, h('h1', {}, 'Feedback'), h('div', { class: 'grow' }),
    h('button', { class: 'btn inline', onclick: () => download(`feedback-${fileDate()}.csv`, feedbackCsv(filtered())) }, ic('download'), 'Export'));
  const updateCount = () => H.setCounts(S.reportCount || 0, all.filter((f) => (f.status || 'open') === 'open').length);
  function draw() {
    const list = filtered();
    fill(body,
      h('div', { class: 'card' }, h('div', { class: 'row wrap gap chips' },
        chip('All', type === 'all', () => { type = 'all'; draw(); }), chip('Problem', type === 'problem', () => { type = 'problem'; draw(); }), chip('Idea', type === 'idea', () => { type = 'idea'; draw(); }), chip('Question looks wrong', type === 'question', () => { type = 'question'; draw(); }),
        h('span', { class: 'sep' }), chip('Any status', status === 'all', () => { status = 'all'; draw(); }), chip('Open', status === 'open', () => { status = 'open'; draw(); }), chip('Done', status === 'done', () => { status = 'done'; draw(); })),
        h('div', { class: 'row wrap gap', style: 'margin-top:10px' }, h('b', {}, 'Date'), fromIn, h('span', { class: 'muted' }, 'to'), toIn, h('div', { class: 'grow' }),
          h('input', { class: 'inp search', type: 'search', placeholder: 'Search name, email or message', 'aria-label': 'Search feedback', value: q, oninput: (e) => { q = e.target.value; const pos = e.target.selectionStart; draw(); const el = body.querySelector('.search'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } } }))),
      list.length ? list.map((f) => {
        const open = (f.status || 'open') === 'open';
        const note = h('input', { class: 'inp', placeholder: 'Optional note for the record', 'aria-label': 'Admin note', value: f.note || '' });
        return h('div', { class: 'card fbcard' },
          h('div', { class: 'row wrap gap' }, h('span', { class: `tag ${f.type === 'idea' ? 'b' : f.type === 'question' ? 'p' : ''}` }, TYPE_LABEL[f.type] || f.type), h('b', {}, f.name || '(no name)'), h('span', { class: 'muted small' }, f.email || ''), h('div', { class: 'grow' }), h('span', { class: 'muted small' }, niceDate(f.createdAt)), h('span', { class: `tag ${open ? '' : 'g'}` }, open ? 'Open' : 'Done')),
          h('p', { class: 'msg' }, f.message),
          h('p', { class: 'muted small' }, [f.game ? titleOf(f.game) : f.page, f.device, f.browser, f.screen, f.version ? `v${f.version}` : ''].filter(Boolean).join(' \u00B7 ')),
          open ? h('div', { class: 'row gap wrap' }, h('div', { class: 'grow' }, note), h('button', { class: 'btn inline', onclick: async () => {
            try { await S.store.updateFeedback(f.id, { status: 'done', resolvedBy: S.user.email, resolvedAt: Date.now(), note: note.value.trim() }); Object.assign(f, { status: 'done', resolvedBy: S.user.email, resolvedAt: Date.now(), note: note.value.trim() }); updateCount(); draw(); } catch { toast('Could not save. Check your admin access.'); }
          } }, 'Mark done'))
            : h('div', { class: 'row gap wrap' }, h('span', { class: 'muted small' }, `Closed by ${f.resolvedBy || 'an admin'}${f.note ? `: ${f.note}` : ''}`), h('button', { class: 'linkbtn', onclick: async () => {
              try { await S.store.updateFeedback(f.id, { status: 'open', resolvedBy: '', resolvedAt: 0 }); Object.assign(f, { status: 'open', resolvedBy: '', resolvedAt: 0 }); updateCount(); draw(); } catch { toast('Could not save. Check your admin access.'); }
            } }, 'Reopen')));
      }) : h('div', { class: 'card' }, h('p', {}, 'Nothing here yet.')));
    updateCount();
  }
  fromIn.addEventListener('change', () => { from = fromIn.value; draw(); });
  toIn.addEventListener('change', () => { to = toIn.value; draw(); });
  S.store.listFeedback().then((l) => { all = l; draw(); }).catch(() => fill(body, h('p', { class: 'err' }, 'Could not load feedback. Check your admin access.')));
  return h('div', {}, head, body);
}

/* ---------- Game settings ---------- */
function settingsTab(S, H) {
  const e = H.eff(), cur = S.remote || {};
  const num = (id, label, value, min = 1) => { const i = h('input', { id, class: 'inp', type: 'number', min, value }); return [h('div', {}, h('label', { for: id }, label), i), i]; };
  const [fFloor, iFloor] = num('s-floor', 'Floor goal (rounds a week)', e.floorGoal);
  const [fWd, iWd] = num('s-wd', 'Weekly goal (days)', e.weekDays);
  const [fWb, iWb] = num('s-wb', 'Weekly bonus (AdCoins)', e.weekBonus, 0);
  const [fAs, iAs] = num('s-as', 'Joke ad length (seconds)', e.adSeconds);
  const [fSk, iSk] = num('s-sk', 'Skip appears after (seconds)', e.adSkip);
  const [fPr, iPr] = num('s-pr', 'Ad-free pass price (AdCoins)', e.adFreePrice);
  const [fDy, iDy] = num('s-dy', 'Ad-free pass length (days)', e.adFreeDays);
  const feat = h('select', { id: 's-feat' }, h('option', { value: '' }, 'None (recommend automatically)'), LIVE_GAMES.filter((g) => g.kind !== 'mission').map((g) => h('option', { value: g.id }, g.title)));
  feat.value = e.featured;
  const hide = {};
  const toggles = LIVE_GAMES.map((g) => {
    const b = h('button', { class: `tg ${e.hidden.includes(g.id) ? '' : 'on'}`, role: 'switch', 'aria-checked': String(!e.hidden.includes(g.id)), 'aria-label': `Show ${g.title}`, onclick: () => { const on = b.classList.toggle('on'); b.setAttribute('aria-checked', String(on)); } });
    hide[g.id] = b;
    return h('div', { class: 'sw tight' }, h('span', {}, g.title), b);
  });
  const err = h('p', { class: 'err', role: 'alert' });
  const save = async () => {
    const v = { floorGoal: Number(iFloor.value), weekDays: Number(iWd.value), weekBonus: Number(iWb.value), adSeconds: Number(iAs.value), adSkip: Number(iSk.value), adFreePrice: Number(iPr.value), adFreeDays: Number(iDy.value) };
    if (!(v.floorGoal >= 1 && v.weekDays >= 1 && v.weekDays <= 7 && v.weekBonus >= 0 && v.adSeconds >= 1 && v.adSkip >= 0 && v.adSkip <= v.adSeconds && v.adFreePrice >= 1 && v.adFreeDays >= 1)) { err.textContent = 'Check the numbers: weekly days must be 1 to 7, and the skip time cannot be longer than the ad.'; return; }
    err.textContent = '';
    const obj = { ...cur, ...v, featured: feat.value, hidden: LIVE_GAMES.filter((g) => !hide[g.id].classList.contains('on')).map((g) => g.id) };
    try { await S.store.saveSettings(obj); S.remote = obj; toast('Settings saved. People see them the next time they open the app.'); } catch { toast('Could not save. Check your admin access.'); }
  };
  return h('div', {}, h('h1', { style: 'margin-bottom:10px' }, 'Game settings'),
    h('div', { class: 'g2' },
      h('div', {}, h('div', { class: 'card' }, h('p', { class: 'muted small' }, 'Changes apply the next time someone opens the app.'), h('div', { class: 'fgrid' }, fFloor, fWd, fWb, fAs, fSk, fPr, fDy, field('Featured game this week', feat)), err, h('button', { class: 'btn', onclick: save }, 'Save settings'))),
      h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Show or hide a game'), h('p', { class: 'muted small' }, 'A hidden game shows as "Coming soon" for everyone. Press Save settings after changing it.'), toggles)));
}

/* ---------- Announcements ---------- */
function announceTab(S) {
  const a = S.announce || { banner: {}, entries: [], minor: '' };
  const banner = { ...(a.banner || {}) }, entries = [...(a.entries || [])];
  const text = h('textarea', { id: 'bn-text', class: 'inp', rows: 3, maxlength: 200 }); text.value = banner.text || '';
  const until = h('input', { id: 'bn-until', class: 'inp', type: 'date', value: banner.until || '' });
  const on = h('button', { class: `tg ${banner.on ? 'on' : ''}`, role: 'switch', 'aria-checked': String(!!banner.on), 'aria-label': 'Show banner', onclick: () => { const v = on.classList.toggle('on'); on.setAttribute('aria-checked', String(v)); } });
  const preview = h('div', { class: 'banner' });
  const drawPrev = () => fill(preview, ic('speakerphone'), h('span', {}, text.value || 'Your message appears here'));
  text.addEventListener('input', drawPrev); drawPrev();
  const title = h('input', { id: 'wn-title', class: 'inp', maxlength: 60 }), desc = h('textarea', { id: 'wn-text', class: 'inp', rows: 2, maxlength: 160 });
  const typeSel = h('select', { id: 'wn-type' }, h('option', { value: 'major' }, 'Major change'), h('option', { value: 'pack' }, 'New question pack'));
  const minor = h('input', { id: 'wn-minor', class: 'inp', maxlength: 120, value: a.minor || '' });
  const list = h('div', {});
  const err = h('p', { class: 'err', role: 'alert' });
  const persist = async (msg) => {
    const obj = { banner: { text: text.value.trim(), until: until.value, on: on.classList.contains('on') }, entries, minor: minor.value.trim() };
    try { await S.store.saveAnnounce(obj); S.announce = obj; toast(msg); } catch { toast('Could not save. Check your admin access.'); }
  };
  const drawList = () => fill(list, entries.length ? entries.map((e) => h('div', { class: 'wn' }, h('span', { class: `tag ${e.type === 'pack' ? 'b' : ''}` }, e.type === 'pack' ? 'Packs' : 'New'), h('div', { class: 'grow' }, h('b', {}, e.title), h('small', {}, e.text)),
    h('button', { class: 'linkbtn danger', onclick: async () => { entries.splice(entries.indexOf(e), 1); drawList(); await persist('Entry removed.'); } }, ic('trash'), 'Remove'))) : h('p', { class: 'muted small' }, 'No entries yet. Players see the built-in list until you add one.'));
  drawList();
  return h('div', {}, h('h1', { style: 'margin-bottom:10px' }, 'Announcements'),
    h('div', { class: 'g2' },
      h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Home page banner'), h('label', { for: 'bn-text' }, 'Banner text'), text,
        h('div', { class: 'row wrap gap', style: 'margin-top:8px' }, h('div', { class: 'grow' }, h('label', { for: 'bn-until' }, 'Show until'), until), h('div', { class: 'row gap' }, on, h('b', { style: 'font-weight:600' }, 'Show banner'))),
        h('label', {}, 'Preview'), preview, h('button', { class: 'btn', style: 'margin-top:12px', onclick: () => persist('Banner saved.') }, 'Save banner')),
      h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, "What's new"), list,
        h('h3', {}, 'Add an entry'), h('label', { for: 'wn-title' }, 'Title'), title, h('label', { for: 'wn-text' }, 'Short description'), desc, h('label', { for: 'wn-type' }, 'Type'), typeSel,
        err, h('button', { class: 'btn', style: 'margin-top:10px', onclick: async () => {
          if (!title.value.trim() || !desc.value.trim()) { err.textContent = 'Add a title and a short description.'; return; }
          err.textContent = '';
          entries.unshift({ id: `n${Date.now()}`, type: typeSel.value, title: title.value.trim(), text: desc.value.trim(), date: dateKey() });
          title.value = ''; desc.value = ''; drawList(); await persist('Entry published.');
        } }, 'Publish entry'),
        h('label', { for: 'wn-minor', style: 'margin-top:14px' }, 'One line for smaller fixes'), minor, h('p', { class: 'muted small' }, 'Smaller changes are rolled into this single line instead of their own entries.'),
        h('button', { class: 'btn ghost', onclick: () => persist('Saved.') }, 'Save line'))));
}

/* ---------- the admin page: a menu on the left and the chosen section on the right ---------- */
const SECTIONS = [
  { group: 'Insights', items: [['insights', 'Insights']] },
  { group: 'Content', items: [['add', 'Add questions'], ['browse', 'Question browser'], ['reports', 'Reports']] },
  { group: 'Players', items: [['people', 'People'], ['feedback', 'Feedback']] },
  { group: 'Controls', items: [['settings', 'Game settings'], ['announce', 'Announcements']] }
];
export function adminView(S, H, section = 'insights') {
  if (!S.admin) return H.go('/home');
  if (!SECTIONS.some((g) => g.items.some(([id]) => id === section))) section = 'insights';
  const counts = { reports: S.reportCount || 0, feedback: S.feedbackCount || 0 };
  const nav = h('nav', { class: 'adnav', 'aria-label': 'Admin sections' }, SECTIONS.map((g) => h('div', { class: 'adgroup' }, h('div', { class: 'gl' }, g.group),
    g.items.map(([id, t]) => h('a', { class: `ni ${id === section ? 'on' : ''}`, href: `#/admin/${id}`, 'aria-current': id === section ? 'page' : null }, t, counts[id] ? h('span', { class: 'cnt' }, counts[id]) : null)))));
  const tabs = { insights: insightsTab, add: addTab, browse: browseTab, reports: reportsTab, people: peopleTab, feedback: feedbackTab, settings: settingsTab, announce: announceTab };
  const content = h('div', { class: 'adcontent' }, tabs[section](S, H));
  H.view(H.page(h('div', { class: 'adlayout' }, nav, content)));
}
