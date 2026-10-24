import { CONFIG } from './config.js';
import { STARTER } from './data.js';
import { itemKey } from './validate.js';
import { hash } from './util.js';

const starter = (game) => (STARTER[game] || []).map((it) => ({ ...it, id: it.id || `${game.slice(0, 3)}-${hash(itemKey(game, it))}` }));

const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
};

export const newProfile = (name = '') => ({
  name, coins: 0, streak: 0, bestStreak: 0, lastDay: '', missionDay: '', lastGame: '',
  played: {}, seenAll: {}, replayBest: {}, bestTime: {}, met: {}, howSeen: {}, reported: {},
  companion: 'panda', tourDone: false,
  settings: { petMode: 'fixed', liveTimer: false, motion: true, hintAds: true }
});

export function fixProfile(p, name = '') {
  const d = newProfile(name);
  const out = { ...d, ...(p || {}), settings: { ...d.settings, ...((p && p.settings) || {}) } };
  if (!out.coins && p && p.xp) out.coins = p.xp;
  return out;
}

const ttl = () => CONFIG.CACHE_MINUTES * 60 * 1000;
const cached = (key) => { const c = LS.get(key); return c && Date.now() - c.at < ttl() ? c.data : null; };
const cacheIt = (key, data) => LS.set(key, { at: Date.now(), data });
const previewOf = (it) => String(it.q || it.title || '').slice(0, 180);
const rkey = (game, id) => `${game}__${id}`.replace(/[^\w-]/g, '_');

/* ---------------- Demo store: no Firebase, data stays in this browser ---------------- */
function demoStore() {
  const user = { uid: 'demo', email: `demo@${CONFIG.ALLOWED_DOMAIN}`, name: 'Teja' };
  const reports = () => LS.get('rda_demo_reports', {});
  return {
    demo: true,
    async init(onUser) { onUser(LS.get('rda_demo_signed_out') ? null : user); },
    async signIn(onUser) { LS.del('rda_demo_signed_out'); onUser(user); },
    async signOut(onUser) { LS.set('rda_demo_signed_out', true); onUser(null); },
    async loadProfile() { return fixProfile(LS.get('rda_demo_profile'), user.name); },
    async saveProfile(_u, p) { LS.set('rda_demo_profile', p); },
    async isAdmin() { return true; },
    async loadPack(game) {
      const live = LS.get('rda_demo_pack_' + game);
      return live ? { items: live.items, version: live.version, source: 'live' } : { items: starter(game), version: 0, source: 'starter' };
    },
    async publishPack(game, items, note, by) {
      const cur = LS.get('rda_demo_pack_' + game) || { version: 0 };
      const version = cur.version + 1;
      LS.set('rda_demo_pack_' + game, { items, version });
      const vs = LS.get('rda_demo_versions_' + game, []);
      vs.unshift({ id: String(version), version, count: items.length, at: Date.now(), by, note, items });
      LS.set('rda_demo_versions_' + game, vs.slice(0, 10));
      return version;
    },
    async listVersions(game) { return LS.get('rda_demo_versions_' + game, []).map(({ items, ...m }) => m); },
    async restoreVersion(game, id, by) {
      const v = LS.get('rda_demo_versions_' + game, []).find((x) => x.id === id);
      if (!v) throw new Error('Version not found');
      return this.publishPack(game, v.items, `Restored version ${v.version}`, by);
    },
    async report(game, item, reason, uid) {
      const all = reports(), k = rkey(game, item.id), r = all[k];
      if (r) {
        if (r.reporters[uid]) return 'already';
        r.count++; r.reporters[uid] = true; r.reasons[reason] = (r.reasons[reason] || 0) + 1;
      } else all[k] = { id: k, game, itemId: item.id, count: 1, reporters: { [uid]: true }, reasons: { [reason]: 1 }, preview: previewOf(item), createdAt: Date.now() };
      LS.set('rda_demo_reports', all);
      return 'ok';
    },
    async listReports() { return Object.values(reports()).sort((a, b) => b.createdAt - a.createdAt); },
    async countReports() { return Object.keys(reports()).length; },
    async resolveReport(id) { const all = reports(); delete all[id]; LS.set('rda_demo_reports', all); }
  };
}

/* ---------------- Firebase store ---------------- */
async function firebaseStore() {
  const V = '10.14.1';
  const base = `https://www.gstatic.com/firebasejs/${V}/`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')
  ]);
  const app = initializeApp(CONFIG.FIREBASE);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const domainOk = (u) => !!u && u.emailVerified && (u.email || '').toLowerCase().endsWith('@' + CONFIG.ALLOWED_DOMAIN);
  const shape = (u) => ({ uid: u.uid, email: u.email, name: (u.displayName || u.email).split(' ')[0] });

  return {
    demo: false,
    async init(onUser) {
      A.onAuthStateChanged(auth, async (u) => {
        if (u && !domainOk(u)) { await A.signOut(auth); onUser(null, `Use your @${CONFIG.ALLOWED_DOMAIN} Google account to sign in.`); return; }
        onUser(u ? shape(u) : null);
      });
    },
    async signIn() {
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ hd: CONFIG.ALLOWED_DOMAIN, prompt: 'select_account' });
      await A.signInWithPopup(auth, p);
    },
    async signOut() { await A.signOut(auth); },
    async loadProfile(u) {
      const snap = await F.getDoc(F.doc(db, 'users', u.uid));
      return fixProfile(snap.exists() ? snap.data() : null, u.name);
    },
    async saveProfile(u, p) { await F.setDoc(F.doc(db, 'users', u.uid), { ...p, email: u.email, updatedAt: Date.now() }, { merge: true }); },
    async isAdmin(u) {
      try {
        const snap = await F.getDoc(F.doc(db, 'config', 'admins'));
        const list = snap.exists() ? (snap.data().emails || []) : [];
        return list.map((e) => String(e).toLowerCase()).includes(u.email.toLowerCase());
      } catch { return false; }
    },
    async loadPack(game) {
      const key = 'rda_pack_' + game;
      const hit = cached(key);
      if (hit) return hit;
      let res;
      try {
        const snap = await F.getDoc(F.doc(db, 'packs', game));
        res = snap.exists() ? { items: snap.data().items || [], version: snap.data().version || 1, source: 'live' }
          : { items: starter(game), version: 0, source: 'starter' };
      } catch { res = { items: starter(game), version: 0, source: 'starter' }; }
      cacheIt(key, res);
      return res;
    },
    async publishPack(game, items, note, by) {
      const ref = F.doc(db, 'packs', game);
      const cur = await F.getDoc(ref);
      const version = (cur.exists() ? cur.data().version || 0 : 0) + 1;
      await F.setDoc(ref, { items, version, updatedAt: Date.now(), updatedBy: by });
      await F.setDoc(F.doc(db, 'packs', game, 'versions', String(version)), { version, count: items.length, at: Date.now(), by, note, items });
      LS.del('rda_pack_' + game);
      return version;
    },
    async listVersions(game) {
      const q = F.query(F.collection(db, 'packs', game, 'versions'), F.orderBy('at', 'desc'), F.limit(5));
      const snap = await F.getDocs(q);
      return snap.docs.map((d) => { const { items, ...m } = d.data(); return { id: d.id, ...m }; });
    },
    async restoreVersion(game, id, by) {
      const snap = await F.getDoc(F.doc(db, 'packs', game, 'versions', id));
      if (!snap.exists()) throw new Error('Version not found');
      return this.publishPack(game, snap.data().items, `Restored version ${snap.data().version}`, by);
    },
    async report(game, item, reason, uid) {
      const ref = F.doc(db, 'reports', rkey(game, item.id));
      return F.runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          tx.set(ref, { game, itemId: item.id, count: 1, reporters: { [uid]: true }, reasons: { [reason]: 1 }, preview: previewOf(item), createdAt: Date.now() });
          return 'ok';
        }
        const d = snap.data();
        if (d.reporters && d.reporters[uid]) return 'already';
        tx.update(ref, { count: (d.count || 0) + 1, [`reporters.${uid}`]: true, [`reasons.${reason}`]: ((d.reasons && d.reasons[reason]) || 0) + 1 });
        return 'ok';
      });
    },
    async listReports() {
      const snap = await F.getDocs(F.query(F.collection(db, 'reports'), F.limit(50)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt);
    },
    async countReports() {
      try { const snap = await F.getDocs(F.query(F.collection(db, 'reports'), F.limit(50))); return snap.size; } catch { return 0; }
    },
    async resolveReport(id) { await F.deleteDoc(F.doc(db, 'reports', id)); }
  };
}

export async function createStore() {
  if (CONFIG.DEMO_MODE || !CONFIG.FIREBASE.apiKey) return demoStore();
  return firebaseStore();
}
