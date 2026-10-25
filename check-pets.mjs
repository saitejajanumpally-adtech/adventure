// Run before every upload:  node check-pets.mjs
// Fails if the code asks for a pet mood that has no picture, or if any of the 72 pet files is missing or misspelt.
// (GitHub Pages is case-sensitive: "Cat-Happy.webp" is NOT "cat-happy.webp".)
import { readFileSync, readdirSync } from 'node:fs';
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const data = read('./data.js'), ui = read('./ui.js');
const pets = [...data.matchAll(/\{ id: '([a-z]+)', name: '/g)].map((m) => m[1]);
const real = ui.match(/PET_MOODS = \[([^\]]*)\]/)[1].match(/'([a-z]+)'/g).map((s) => s.replace(/'/g, ''));
const alias = Object.fromEntries([...ui.match(/MOOD_ALIAS = \{([^}]*)\}/)[1].matchAll(/(\w+):\s*'(\w+)'/g)].map((m) => [m[1], m[2]]));
const files = new Set(readdirSync(new URL('./pets/', import.meta.url)));
let bad = 0;
for (const p of pets) for (const m of real) if (!files.has(`${p}-${m}.webp`)) { console.log('MISSING FILE  pets/' + `${p}-${m}.webp`); bad++; }
for (const [k, v] of Object.entries(alias)) if (!real.includes(v)) { console.log(`ALIAS ${k} -> ${v} points at a mood with no picture`); bad++; }
const used = new Set([...(read('./app.js') + read('./engines.js') + read('./ads.js')).matchAll(/petFigure\([^,]+,\s*'([a-z]+)'/g)].map((m) => m[1]));
for (const m of data.matchAll(/mood: '([a-z]+)'/g)) used.add(m[1]);
for (const m of read('./app.js').matchAll(/setBubble\([^)]*?,\s*'([a-z]+)'/g)) used.add(m[1]);
for (const m of read('./app.js').matchAll(/MOOD = \{([^}]*)\}/g)) for (const x of m[1].matchAll(/:\s*'([a-z]+)'/g)) used.add(x[1]);
for (const m of used) if (!real.includes(m) && !alias[m] && m !== 'happy') { console.log('UNKNOWN MOOD used in code: ' + m); bad++; }
console.log(`${pets.length} pets x ${real.length} moods checked. Moods used in code: ${[...used].sort().join(', ')}. Aliases: ${JSON.stringify(alias)}`);
console.log(bad ? `FAILED (${bad} problems)` : 'OK: every pet picture exists and every mood used has a picture.');
process.exit(bad ? 1 : 0);
