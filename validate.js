import { hash, norm } from './util.js';
import { generateGrid } from './crossword.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const need = (cond, msg) => { if (!cond) throw new Error(msg); };

function hintOf(raw) {
  const t = str(raw.hint);
  need(t.length <= 200, 'hint is too long (200 characters max)');
  return t || undefined;
}

function why(raw) {
  const w = str(raw.why);
  need(w.length >= 8, 'missing explanation ("why")');
  return w;
}

export function itemKey(game, it) {
  if (game === 'who-am-i') return norm(it.answer + ' ' + (it.clues || [])[0]);
  if (game === 'jargon-match') return norm(it.title + ' ' + it.pairs.map((p) => p.term).join(' '));
  if (game === 'ad-flow-builder' || game === 'stack-sorter' || game === 'crossword') return norm(it.title);
  return norm(it.q);
}

const STOP = new Set('the a an of to in on for and or is are was be it its this that what which who how does do did with as by at from not'.split(' '));
const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w)));

/* How alike two items read, 0 to 1 (shared meaningful words). 0.75 and up is treated as the same question reworded. */
export function similarity(game, a, b) {
  const x = words(itemKey(game, a)), y = words(itemKey(game, b));
  if (!x.size || !y.size) return 0;
  let both = 0; x.forEach((w) => { if (y.has(w)) both++; });
  return both / (x.size + y.size - both);
}
export const SIMILAR_AT = 0.75;
export function findSimilar(game, it, list) {
  let best = null, score = 0;
  for (const o of list) { const s = similarity(game, it, o); if (s > score) { score = s; best = o; } }
  return score >= SIMILAR_AT ? best : null;
}

/* level: 1 easy, 2 medium, 3 hard. Optional; items without one count as medium. */
export const DIFFICULTY = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
export const difficultyOf = (it) => (it && DIFFICULTY[it.level] ? it.level : 2);
function levelIn(raw) {
  const v = typeof raw.level === 'string' ? { easy: 1, medium: 2, hard: 3 }[raw.level.trim().toLowerCase()] ?? Number(raw.level) : Number(raw.level);
  return DIFFICULTY[v] ? v : undefined;
}

export function normalizeItem(game, raw) {
  need(raw && typeof raw === 'object', 'not an object');
  let it;
  if (game === 'acronym-decoder' || game === 'odd-one-out') {
    const q = str(raw.q || raw.question);
    need(q.length >= 8, 'question is missing or too short');
    need(Array.isArray(raw.options) && raw.options.length === 4, 'needs exactly 4 options');
    const options = raw.options.map(str);
    need(options.every(Boolean), 'an option is empty');
    need(new Set(options.map(norm)).size === 4, 'options must be different from each other');
    let answer = raw.answer;
    if (typeof answer === 'string' && !/^\d+$/.test(answer.trim())) answer = options.findIndex((o) => norm(o) === norm(answer));
    answer = Number(answer);
    need(Number.isInteger(answer) && answer >= 0 && answer <= 3, 'answer must be 0, 1, 2 or 3');
    it = { q, options, answer, why: why(raw) };
    const hn = hintOf(raw); if (hn) it.hint = hn;
  } else if (game === 'myth-or-fact') {
    const q = str(raw.q || raw.statement);
    need(q.length >= 8, 'statement is missing or too short');
    let a = raw.answer;
    if (typeof a === 'string') a = { fact: true, true: true, myth: false, false: false }[a.trim().toLowerCase()];
    need(typeof a === 'boolean', 'answer must be "fact" or "myth"');
    it = { q, answer: a, why: why(raw) };
    const hn2 = hintOf(raw); if (hn2) it.hint = hn2;
  } else if (game === 'who-am-i') {
    const answer = str(raw.answer);
    need(answer && answer.length <= 40, 'answer is missing (40 characters max)');
    need(Array.isArray(raw.clues) && raw.clues.length >= 3 && raw.clues.length <= 5, 'needs 3 to 5 clues, from vague to obvious');
    const clues = raw.clues.map(str);
    need(clues.every((c) => c && c.length <= 140), 'a clue is empty or too long (140 characters max)');
    need(Array.isArray(raw.wrong) && raw.wrong.length === 3, 'needs exactly 3 wrong choices');
    const wrong = raw.wrong.map(str);
    need(wrong.every(Boolean), 'a wrong choice is empty');
    need(new Set([answer, ...wrong].map(norm)).size === 4, 'the four choices must be different from each other');
    it = { title: answer, answer, clues, wrong, why: why(raw) };
  } else if (game === 'jargon-match') {
    const title = str(raw.title);
    need(title, 'title is missing');
    need(Array.isArray(raw.pairs) && raw.pairs.length >= 4 && raw.pairs.length <= 8, 'needs 4 to 8 pairs');
    const pairs = raw.pairs.map((p) => ({ term: str(p && p.term), def: str(p && p.def) }));
    need(pairs.every((p) => p.term && p.def), 'a pair has an empty term or meaning');
    need(new Set(pairs.map((p) => norm(p.term))).size === pairs.length, 'terms must be different');
    it = { title, pairs };
  } else if (game === 'ad-flow-builder') {
    const title = str(raw.title);
    need(title, 'title is missing');
    need(Array.isArray(raw.steps) && raw.steps.length >= 4 && raw.steps.length <= 9, 'needs 4 to 9 steps');
    const steps = raw.steps.map(str);
    need(steps.every(Boolean), 'a step is empty');
    need(new Set(steps.map(norm)).size === steps.length, 'steps must be different');
    it = { title, steps, why: why(raw) };
  } else if (game === 'stack-sorter') {
    const title = str(raw.title);
    need(title, 'title is missing');
    need(Array.isArray(raw.layers) && raw.layers.length >= 2 && raw.layers.length <= 4, 'needs 2 to 4 layers');
    const layers = raw.layers.map(str);
    need(layers.every(Boolean), 'a layer name is empty');
    const src = raw.cards || raw.items;
    need(Array.isArray(src) && src.length >= 4 && src.length <= 10, 'needs 4 to 10 cards');
    const cards = src.map((c) => ({ name: str(c && c.name), layer: Number(c && c.layer) }));
    need(cards.every((c) => c.name && Number.isInteger(c.layer) && c.layer >= 0 && c.layer < layers.length), 'a card has no name or a wrong layer number');
    need(layers.every((_, i) => cards.some((c) => c.layer === i)), 'every layer needs at least one card');
    it = { title, layers, cards, why: why(raw) };
  } else if (game === 'crossword') {
    const title = str(raw.title);
    need(title, 'title is missing');
    need(Array.isArray(raw.words) && raw.words.length >= 5 && raw.words.length <= 14, 'needs 5 to 14 words');
    const words = raw.words.map((w) => ({ answer: str(w && w.answer).toUpperCase().replace(/[^A-Z]/g, ''), clue: str(w && w.clue) }));
    need(words.every((w) => w.answer.length >= 3 && w.answer.length <= 14 && w.clue), 'each word needs 3 to 14 letters (A to Z only) and a clue');
    need(new Set(words.map((w) => w.answer)).size === words.length, 'answers must be different');
    const grid = generateGrid(words, 120);
    need(grid, 'these words do not connect into a crossword; use words that share letters');
    it = { title, words };
  } else {
    throw new Error('unknown game');
  }
  const lv = levelIn(raw); if (lv) it.level = lv;
  const key = itemKey(game, it);
  it.id = str(raw.id).replace(/[^\w-]/g, '').slice(0, 40) || `${game.slice(0, 3)}-${hash(key)}`;
  return it;
}

export function parseJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(t);
}

export function validatePack(game, data, existing = [], { allowSimilar = false } = {}) {
  const out = { valid: [], errors: [], dups: [], similar: [], warnings: [] };
  const list = Array.isArray(data) ? data : data && data.items;
  if (!Array.isArray(list) || !list.length) {
    out.errors.push({ n: 0, msg: 'Expected a JSON object with an "items" list.' });
    return out;
  }
  const seen = new Set(existing.map((e) => itemKey(game, e)));
  list.forEach((raw, i) => {
    try {
      const it = normalizeItem(game, raw);
      const key = itemKey(game, it);
      const near = !seen.has(key) && !allowSimilar ? findSimilar(game, it, [...existing, ...out.valid]) : null;
      if (seen.has(key)) out.dups.push({ n: i + 1, msg: 'looks like a duplicate of an existing item' });
      else if (near) out.similar.push({ n: i + 1, text: it.q || it.title, other: near.q || near.title });
      else { seen.add(key); out.valid.push(it); }
    } catch (e) {
      out.errors.push({ n: i + 1, msg: e.message });
    }
  });
  if (game === 'crossword') {
    out.valid.forEach((p) => {
      const g = generateGrid(p.words, 120);
      if (g && g.dropped) out.warnings.push(`"${p.title}": ${g.dropped} word(s) will not fit the grid and are skipped.`);
      if (g && g.cols > 16) out.warnings.push(`"${p.title}": the grid is ${g.cols} columns wide and may scroll sideways on phones. Shorter words help.`);
    });
  }
  return out;
}

const COMMON = (count, topic) => `You are writing training content for an AdTech learning game used by ad operations and publisher teams.
Create ${count} new items${topic ? ` focused on: ${topic}` : ''}.

Return ONLY one valid JSON object with an "items" list.
Deliver it two ways:
1. If you can create files, give me a downloadable file named {FILE} containing the JSON. Do not just show the text.
2. Also paste the same JSON in a single code block, with no commentary before or after it.

Content rules:
- Use evergreen concepts. Avoid anything that changes quickly (prices, version numbers, news, rankings).
- Be factually accurate. If you are not sure about a fact, leave it out.
- Plain English, short sentences, no vendor opinions.
- Mix difficulty from beginner to expert. Give every item a "level": 1 (easy, basic idea), 2 (medium) or 3 (hard, expert detail). Players see easy items first.
- Do not repeat or reword the same question twice.
- Every item needs a "why" of one or two sentences that teaches the idea.
`;

const SCHEMAS = {
  'myth-or-fact': `Each item is a statement. "answer" is "fact" or "myth". "hint" is optional: one short nudge (under 120 characters) that helps without giving the answer away.
Example:
{"items":[{"statement":"Ad requests and impressions are the same thing.","answer":"myth","hint":"One happens before an ad is served, the other after.","why":"A request asks for an ad. An impression is counted only when an ad is served."}]}`,
  'acronym-decoder': `Each item asks what an AdTech acronym stands for. Give exactly 4 options. "answer" is the index (0 to 3) of the correct option. Put the correct option in a different position from item to item. "hint" is optional: one short nudge that does not give the answer away. Without it, the Hint button removes two wrong options.
Example:
{"items":[{"q":"What does SSP stand for?","options":["Sales stack provider","Supply-side platform","Secure server protocol","Syndicated site package"],"answer":1,"why":"An SSP helps publishers sell inventory to many buyers."}]}`,
  'odd-one-out': `Each item names a category in the question and gives 4 options, three that belong and one that does not. "answer" is the index (0 to 3) of the odd one. Put the odd one in a different position from item to item.
Example:
{"items":[{"q":"Which one is not a pricing model?","options":["CPM","CTR","CPC","CPA"],"answer":1,"why":"CTR is a performance metric. The others are ways of pricing ads."}]}`,
  'jargon-match': `Each item is a set of 5 or 6 pairs of a term and a short meaning. Keep meanings under 12 words and make them clearly different from each other.
Example:
{"items":[{"title":"Metrics","pairs":[{"term":"Fill rate","def":"Share of ad requests that return an ad"},{"term":"CTR","def":"Clicks divided by impressions"}]}]}`,
  'ad-flow-builder': `Each item is a process written as 5 to 8 short steps in the CORRECT order. The game shuffles them.
Example:
{"items":[{"title":"A video ad with VAST","steps":["The player requests an ad","The ad server returns a VAST response","The player loads the creative","The ad plays","Tracking events fire"],"why":"VAST tells the player what to play and which events to track."}]}`,
  'stack-sorter': `Each item has 2 or 3 layers and 6 to 8 cards. Every card belongs to exactly one layer. "layer" is the index (starting at 0) of the layer in the "layers" list. Every layer needs at least one card.
Example:
{"items":[{"title":"Who sits where?","layers":["Sell side","Exchange","Buy side"],"cards":[{"name":"SSP","layer":0},{"name":"Ad exchange","layer":1},{"name":"DSP","layer":2},{"name":"Publisher ad server","layer":0}],"why":"Sell-side tools help publishers, buy-side tools help advertisers."}]}`,
  'who-am-i': `Each item is one AdTech term that "speaks" in the first person. "answer" is the term. "clues" is a list of 3 to 5 clues that go from vague (first) to obvious (last), each under 140 characters, and each one must be true of the answer. "wrong" is exactly 3 believable wrong choices of the same kind (not silly ones), none of which also fits the clues.
Example:
{"items":[{"answer":"SSP","clues":["I work for publishers, not advertisers.","I connect a site's ad space to many buyers at once.","My name means supply-side platform."],"wrong":["DSP","DMP","Ad verification tool"],"level":1,"why":"An SSP helps publishers sell their ad space to many buyers."}]}`,
  'crossword': `Each item is a crossword theme with 8 to 10 words. Answers use letters A to Z only (no spaces or hyphens), 4 to 12 letters. Choose words that share letters so they can cross. The app builds the grid, so do not draw one.
Example:
{"items":[{"title":"Programmatic","words":[{"answer":"BIDDER","clue":"Party that submits a price in an auction"},{"answer":"REQUEST","clue":"Call asking the server for an ad"}]}]}`
};

export function buildPrompt(game, { count = 20, topic = '' } = {}) {
  return (COMMON(count, topic.trim()) + '\nFormat for this game:\n' + SCHEMAS[game]).replace('{FILE}', `${game}-questions.json`);
}
