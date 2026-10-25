// Stand-in for the Firestore library, used only by the tests. It keeps data in memory and counts billed operations:
// a document read per getDoc, one read per document returned by a query (at least 1), one write per set/update/add/delete.
const S = (window.__fs = window.__fs || { docs: new Map(), reads: 0, writes: 0, deletes: 0, log: [] });
const note = (kind, path, n = 1) => { S[kind] += n; S.log.push(`${kind} ${path}${n !== 1 ? ` x${n}` : ''}`); };
const INC = Symbol('increment');
const clone = (v) => JSON.parse(JSON.stringify(v));

export const getFirestore = () => ({});
export const doc = (_db, ...segs) => ({ path: segs.join('/'), id: segs[segs.length - 1] });
export const collection = (_db, ...segs) => ({ path: segs.join('/'), coll: true });
export const increment = (n) => ({ [INC]: n });
export const orderBy = (field, dir = 'asc') => ({ t: 'order', field, dir });
export const limit = (n) => ({ t: 'limit', n });
export const where = (field, op, value) => ({ t: 'where', field, op, value });
export const query = (coll, ...c) => ({ ...coll, c });

const snap = (path, data) => ({ id: path.split('/').pop(), exists: () => data !== undefined, data: () => (data === undefined ? undefined : clone(data)) });
const apply = (base, patch) => {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split('.');
    let o = out;
    for (const p of parts.slice(0, -1)) { o[p] = { ...(o[p] || {}) }; o = o[p]; }
    const last = parts[parts.length - 1];
    o[last] = v && typeof v === 'object' && INC in v ? (o[last] || 0) + v[INC] : v;
  }
  return out;
};
const children = (path) => [...S.docs.entries()].filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'));

export async function getDoc(ref) { note('reads', ref.path); return snap(ref.path, S.docs.get(ref.path)); }
export async function getDocs(q) {
  let rows = children(q.path).map(([p, d]) => ({ p, d }));
  for (const c of q.c || []) {
    if (c.t === 'where' && c.op === '==') rows = rows.filter((r) => r.d[c.field] === c.value);
    if (c.t === 'order') rows.sort((a, b) => ((a.d[c.field] > b.d[c.field]) ? 1 : -1) * (c.dir === 'desc' ? -1 : 1));
    if (c.t === 'limit') rows = rows.slice(0, c.n);
  }
  note('reads', `${q.path} (query)`, Math.max(1, rows.length));
  const docs = rows.map((r) => snap(r.p, r.d));
  return { docs, size: docs.length, empty: !docs.length };
}
export async function setDoc(ref, data, opts = {}) { note('writes', ref.path); S.docs.set(ref.path, opts.merge ? apply(S.docs.get(ref.path), data) : apply({}, data)); }
export async function updateDoc(ref, data) { note('writes', ref.path); if (!S.docs.has(ref.path)) throw new Error('not-found'); S.docs.set(ref.path, apply(S.docs.get(ref.path), data)); }
export async function addDoc(coll, data) { const id = `auto${S.docs.size}${Math.random().toString(36).slice(2, 6)}`; await setDoc(doc(null, coll.path, id), data); return { id }; }
export async function deleteDoc(ref) { note('deletes', ref.path); S.docs.delete(ref.path); }
export async function runTransaction(_db, fn) {
  return fn({ get: getDoc, set: (ref, d) => setDoc(ref, d), update: (ref, d) => updateDoc(ref, d) });
}
