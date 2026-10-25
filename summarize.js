// Turns tests/reports/screens-<browser>--<batch>.json into a short list of problems, grouped by type and element.
// Usage: node tests/screens/summarize.js  (writes tests/reports/screens-summary.md)
import fs from 'node:fs';

const files = fs.readdirSync('tests/reports').filter((f) => /^screens-(chromium|webkit|firefox)--.+\.json$/.test(f));
const LABEL = { hscroll: 'Page scrolls sideways', offscreen: 'Past the screen edge', clipped: 'Text cut off', small: 'Tap target under 44px', tinyText: 'Text under 12px', petOverText: 'Pet picture over text', overlap: 'Controls overlap', modal: 'Dialog does not fit and cannot scroll', topbar: 'Top bar covers content or is too tall', error: 'Screen could not be reached' };
const groups = {};
const add = (type, what, where) => { const k = `${type}||${what}`; (groups[k] ||= new Set()).add(where); };
const clean = (s) => s.replace(/"[^"]*"/g, (m) => (m.length > 26 ? `${m.slice(0, 24)}…"` : m)).replace(/ \d+x\d+$/, '').replace(/ x=-?\d+\.\.-?\d+$/, '').replace(/ \d+(\.\d+)?px$/, '');
for (const f of files) {
  const browser = f.slice(8).split('--')[0], data = JSON.parse(fs.readFileSync(`tests/reports/${f}`, 'utf8'));
  for (const [where, r] of Object.entries(data)) {
    const at = `${browser} ${where}`;
    if (r.error) { add('error', r.error.slice(0, 80), at); continue; }
    if (r.hscroll) add('hscroll', 'page', at);
    for (const t of ['offscreen', 'clipped', 'small', 'tinyText', 'petOverText', 'overlap']) for (const x of r[t] || []) add(t, clean(x), at);
    if (r.modal && !r.modal.fits && r.modal.scrolls !== 'auto') add('modal', `dialog ${r.modal.h}px in ${r.modal.vh}px`, at);
    if (r.topbar && (r.topbar.coversMain || r.topbar.share > 0.25)) add('topbar', `top bar ${r.topbar.height}px (${Math.round(r.topbar.share * 100)}% of the height)`, at);
  }
}
const lines = ['# Screen sweep findings', ''];
for (const type of Object.keys(LABEL)) {
  const rows = Object.entries(groups).filter(([k]) => k.startsWith(`${type}||`)).sort((a, b) => b[1].size - a[1].size);
  if (!rows.length) continue;
  lines.push(`## ${LABEL[type]} (${rows.length})`, '');
  for (const [k, set] of rows) { const list = [...set]; lines.push(`- **${k.split('||')[1]}**: ${list.length} screens, e.g. ${list.slice(0, 4).join('; ')}`); }
  lines.push('');
}
fs.writeFileSync('tests/reports/screens-summary.md', lines.join('\n'));
console.log(lines.join('\n'));
