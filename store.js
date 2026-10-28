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
  badges: {}, weekKey: '', weekDays: [], weekBonusKey: '', perfectRounds: 0,
  adHints: 0, log: [], wants: {}, giftIds: [], introSeen: false,
  fullName: '', email: '', nickname: '', spent: 0, adFreeUntil: 0, newSeen: '',
  signIns: 0, firstSeen: 0, lastSeen: 0, activity: {},
  companion: 'panda', tourDone: false,
  settings: { petMode: 'fixed', liveTimer: false, motion: true, coach: true, textSize: 'standard', useAdHints: true }
});

/* What an admin reset keeps: identity, sign-in tracking, companion and the pets already met. */
export function resetProfile(p) {
  const f = newProfile(p.name);
  return { ...f, fullName: p.fullName || '', email: p.email || '', nickname: p.nickname || '', signIns: p.signIns || 0, firstSeen: p.firstSeen || 0, lastSeen: p.lastSeen || 0, tourDone: true, companion: p.companion || 'panda', met: p.met || {}, giftIds: p.giftIds || [], introSeen: !!p.introSeen };
}

export const qkey = (id) => String(id).replace(/[^\w-]/g, '_');
const reporterInfo = (u, reason) => ({ name: u.fullName || u.name || '', email: u.email || '', at: Date.now(), reason });

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
const giftId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ---------------- Demo store: no Firebase, data stays in this browser ---------------- */
function demoStore() {
  // Two browser tabs share one storage entry for rooms. Re-read and re-check after writing, so a write at the same
  // moment as another tab's is retried instead of lost. (The real database keeps each player in their own document.)
  const roomWrite = async (change, landed) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const all = LS.get('rda_demo_rooms', {}); change(all); LS.set('rda_demo_rooms', all);
      await new Promise((r) => setTimeout(r, 15 + Math.floor(Math.random() * 25)));
      if (landed(LS.get('rda_demo_rooms', {}))) return;
    }
  };
  const user = { uid: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('rda_demo_uid')) || 'demo', email: `demo@${CONFIG.ALLOWED_DOMAIN}`, name: 'Teja', fullName: 'Saiteja Janumpally' };
  const reports = () => LS.get('rda_demo_reports', {});
  return {
    demo: true,
    async init(onUser) { onUser(LS.get('rda_demo_signed_out') ? null : user); },
    async signIn(onUser) { LS.del('rda_demo_signed_out'); onUser(user); },
    async signOut(onUser) { LS.set('rda_demo_signed_out', true); onUser(null); },
    async loadProfile() { return fixProfile(LS.get('rda_demo_profile'), user.name); },
    async getFloor(week) { return LS.get('rda_demo_floor_' + week, 0); },
    async bumpFloor(week) { LS.set('rda_demo_floor_' + week, LS.get('rda_demo_floor_' + week, 0) + 1); },
    async saveProfile(_u, p) { LS.set('rda_demo_profile', p); },
    async isAdmin() { return true; },
    async getRoom(code) { const r = LS.get('rda_demo_rooms', {})[code]; return r ? r.room : null; },
    async createRoom(room) { const all = LS.get('rda_demo_rooms', {}); all[room.code] = { room, players: {} }; LS.set('rda_demo_rooms', all); },
    async updateRoom(code, patch) { await roomWrite((all) => { if (all[code]) all[code].room = { ...all[code].room, ...patch }; }, (all) => !all[code] || Object.entries(patch).every(([k, v]) => all[code].room[k] === v)); },
    async joinRoom(code, player) { await roomWrite((all) => { if (all[code]) all[code].players[player.uid] = player; }, (all) => !all[code] || !!all[code].players[player.uid]); },
    async savePlayer(code, uid, patch) { await roomWrite((all) => { if (all[code] && all[code].players[uid]) all[code].players[uid] = { ...all[code].players[uid], ...patch }; }, (all) => !all[code] || !all[code].players[uid] || Object.entries(patch).every(([k, v]) => all[code].players[uid][k] === v)); },
    async leaveRoom(code, uid) { await roomWrite((all) => { if (all[code]) delete all[code].players[uid]; }, (all) => !all[code] || !all[code].players[uid]); },
    async closeRoom(code) { await roomWrite((all) => { delete all[code]; }, (all) => !all[code]); },
    async getPlayers(code) { const r = LS.get('rda_demo_rooms', {})[code]; return r ? Object.values(r.players).sort((a, b) => a.joinedAt - b.joinedAt) : []; },
    watchRoom(code, cb) { let last; const t = setInterval(() => { const r = LS.get('rda_demo_rooms', {})[code]; const s = JSON.stringify(r ? r.room : null); if (s !== last) { last = s; cb(r ? r.room : null); } }, 250); return () => clearInterval(t); },
    watchPlayers(code, cb) { let last; const t = setInterval(() => { const r = LS.get('rda_demo_rooms', {})[code]; const list = r ? Object.values(r.players).sort((a, b) => a.joinedAt - b.joinedAt) : []; const s = JSON.stringify(list); if (s !== last) { last = s; cb(list); } }, 250); return () => clearInterval(t); },
    async getSettings() { return LS.get('rda_demo_cfg', {}); },
    async saveSettings(obj) { LS.set('rda_demo_cfg', obj); },
    async getAnnounce() { return LS.get('rda_demo_announce', { banner: {}, entries: [], minor: '' }); },
    async saveAnnounce(obj) { LS.set('rda_demo_announce', obj); },
    async sendFeedback(f) {
      const all = LS.get('rda_demo_feedback', []);
      all.unshift({ id: 'f' + Date.now(), ...f, createdAt: Date.now(), status: 'open' });
      LS.set('rda_demo_feedback', all);
    },
    async listFeedback() { return LS.get('rda_demo_feedback', []); },
    async updateFeedback(id, patch) { LS.set('rda_demo_feedback', LS.get('rda_demo_feedback', []).map((x) => (x.id === id ? { ...x, ...patch } : x))); },
    async countOpenFeedback() { return LS.get('rda_demo_feedback', []).filter((x) => x.status === 'open').length; },
    async listUsers() { return [{ uid: user.uid, ...fixProfile(LS.get('rda_demo_profile'), user.name) }, ...LS.get('rda_demo_others', [])]; },
    async resetUser(uid) { if (uid === user.uid) LS.set('rda_demo_profile', resetProfile(fixProfile(LS.get('rda_demo_profile'), user.name))); },
    async getAdmins() { return LS.get('rda_demo_admins', [user.email]); },
    async saveAdmins(list) { LS.set('rda_demo_admins', list); },
    async bumpQStats(game, results) {
      const all = LS.get('rda_demo_qstats_' + game, {});
      results.forEach((r) => { const k = (r.ok ? 'r_' : 'w_') + qkey(r.id); all[k] = (all[k] || 0) + 1; });
      LS.set('rda_demo_qstats_' + game, all);
    },
    async getQStats(game) { return LS.get('rda_demo_qstats_' + game, {}); },
    async listReportLog() { return LS.get('rda_demo_reportlog', []); },
    async getGifts(uid) { return LS.get('rda_demo_gifts_' + uid, { total: 0, list: [] }); },
    async sendGift(uids, n, note, by, label) {
      const item = { id: giftId(), n, note, at: Date.now() };
      uids.forEach((uid) => { const g = LS.get('rda_demo_gifts_' + uid, { total: 0, list: [] }); g.total += n; g.list.push(item); LS.set('rda_demo_gifts_' + uid, g); });
      const log = LS.get('rda_demo_giftlog', []); log.unshift({ id: item.id, at: item.at, by, label, count: uids.length, n, note }); LS.set('rda_demo_giftlog', log.slice(0, 100));
      return uids.length;
    },
    async listGiftLog() { return LS.get('rda_demo_giftlog', []); },
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
    async report(game, item, reason, u) {
      const all = reports(), k = rkey(game, item.id), r = all[k], uid = u.uid;
      if (r) {
        if (r.reporters[uid]) return 'already';
        r.count++; r.reporters[uid] = reporterInfo(u, reason); r.reasons[reason] = (r.reasons[reason] || 0) + 1;
      } else all[k] = { id: k, game, itemId: item.id, count: 1, reporters: { [uid]: reporterInfo(u, reason) }, reasons: { [reason]: 1 }, preview: previewOf(item), createdAt: Date.now() };
      LS.set('rda_demo_reports', all);
      return 'ok';
    },
    async listReports() { return Object.values(reports()).sort((a, b) => b.createdAt - a.createdAt); },
    async countReports() { return Object.keys(reports()).length; },
    async resolveReport(id, status = 'kept', by = '', note = '') {
      const all = reports(), r = all[id];
      if (r) { const log = LS.get('rda_demo_reportlog', []); log.unshift({ ...r, status, resolvedBy: by, resolvedAt: Date.now(), note }); LS.set('rda_demo_reportlog', log.slice(0, 500)); }
      delete all[id]; LS.set('rda_demo_reports', all);
    }
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
  const shape = (u) => ({ uid: u.uid, email: u.email, name: (u.displayName || u.email).split(' ')[0], fullName: u.displayName || '' });

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
    async saveProfile(u, p) { await F.setDoc(F.doc(db, 'users', u.uid), { ...p, email: u.email, fullName: u.fullName || p.fullName || '', updatedAt: Date.now() }, { merge: true }); },
    async getFloor(week) {
      const key = 'rda_floor_' + week, hit = LS.get(key);
      if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.n;
      let n = 0;
      try { const snap = await F.getDoc(F.doc(db, 'floor', week)); n = snap.exists() ? snap.data().count || 0 : 0; } catch { n = hit ? hit.n : 0; }
      LS.set(key, { at: Date.now(), n });
      return n;
    },
    async bumpFloor(week) {
      const key = 'rda_floor_' + week, hit = LS.get(key);
      if (hit) LS.set(key, { at: hit.at, n: hit.n + 1 });
      await F.setDoc(F.doc(db, 'floor', week), { count: F.increment(1) }, { merge: true });
    },
    async isAdmin(u) {
      try {
        const snap = await F.getDoc(F.doc(db, 'config', 'admins'));
        const list = snap.exists() ? (snap.data().emails || []) : [];
        return list.map((e) => String(e).toLowerCase()).includes(u.email.toLowerCase());
      } catch { return false; }
    },
    async getRoom(code) { const snap = await F.getDoc(F.doc(db, 'rooms', code)); return snap.exists() ? snap.data() : null; },
    async createRoom(room) { await F.setDoc(F.doc(db, 'rooms', room.code), room); },
    async updateRoom(code, patch) { await F.updateDoc(F.doc(db, 'rooms', code), patch); },
    async joinRoom(code, player) { await F.setDoc(F.doc(db, 'rooms', code, 'players', player.uid), player); },
    async savePlayer(code, uid, patch) { await F.updateDoc(F.doc(db, 'rooms', code, 'players', uid), patch); },
    async leaveRoom(code, uid) { await F.deleteDoc(F.doc(db, 'rooms', code, 'players', uid)); },
    async getPlayers(code) { const snap = await F.getDocs(F.collection(db, 'rooms', code, 'players')); return snap.docs.map((d) => d.data()).sort((a, b) => a.joinedAt - b.joinedAt); },
    async closeRoom(code) {
      const snap = await F.getDocs(F.collection(db, 'rooms', code, 'players'));
      await Promise.all(snap.docs.map((d) => F.deleteDoc(d.ref).catch(() => {})));
      await F.deleteDoc(F.doc(db, 'rooms', code));
    },
    watchRoom(code, cb) { return F.onSnapshot(F.doc(db, 'rooms', code), (snap) => cb(snap.exists() ? snap.data() : null), () => cb(null)); },
    watchPlayers(code, cb) { return F.onSnapshot(F.collection(db, 'rooms', code, 'players'), (snap) => cb(snap.docs.map((d) => d.data()).sort((a, b) => a.joinedAt - b.joinedAt)), () => cb([])); },
    async getSettings() {
      const key = 'rda_cfg', hit = LS.get(key);
      if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
      let data = {};
      try { const snap = await F.getDoc(F.doc(db, 'config', 'settings')); data = snap.exists() ? snap.data() : {}; } catch { data = hit ? hit.data : {}; }
      LS.set(key, { at: Date.now(), data });
      return data;
    },
    async saveSettings(obj) { await F.setDoc(F.doc(db, 'config', 'settings'), obj); LS.del('rda_cfg'); },
    async getAnnounce() {
      const key = 'rda_announce', hit = LS.get(key);
      if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
      let data = { banner: {}, entries: [], minor: '' };
      try { const snap = await F.getDoc(F.doc(db, 'config', 'announce')); if (snap.exists()) data = { ...data, ...snap.data() }; } catch { if (hit) data = hit.data; }
      LS.set(key, { at: Date.now(), data });
      return data;
    },
    async saveAnnounce(obj) { await F.setDoc(F.doc(db, 'config', 'announce'), obj); LS.del('rda_announce'); },
    async sendFeedback(f) { await F.addDoc(F.collection(db, 'feedback'), { ...f, createdAt: Date.now(), status: 'open' }); },
    async listFeedback() {
      const snap = await F.getDocs(F.query(F.collection(db, 'feedback'), F.orderBy('createdAt', 'desc'), F.limit(500)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async updateFeedback(id, patch) { await F.updateDoc(F.doc(db, 'feedback', id), patch); },
    async countOpenFeedback() {
      try { const snap = await F.getDocs(F.query(F.collection(db, 'feedback'), F.where('status', '==', 'open'), F.limit(99))); return snap.size; } catch { return 0; }
    },
    async listUsers() {
      const snap = await F.getDocs(F.query(F.collection(db, 'users'), F.limit(1000)));
      return snap.docs.map((d) => ({ uid: d.id, ...fixProfile(d.data(), (d.data() || {}).name || '') }));
    },
    async resetUser(uid, fresh) { await F.setDoc(F.doc(db, 'users', uid), { ...fresh, updatedAt: Date.now() }); },
    async getAdmins() { const snap = await F.getDoc(F.doc(db, 'config', 'admins')); return snap.exists() ? (snap.data().emails || []) : []; },
    async saveAdmins(list) { await F.setDoc(F.doc(db, 'config', 'admins'), { emails: list }); },
    async bumpQStats(game, results) {
      const data = {};
      results.forEach((r) => { data[(r.ok ? 'r_' : 'w_') + qkey(r.id)] = F.increment(1); });
      if (Object.keys(data).length) await F.setDoc(F.doc(db, 'qstats', game), data, { merge: true });
    },
    async getQStats(game) { const snap = await F.getDoc(F.doc(db, 'qstats', game)); return snap.exists() ? snap.data() : {}; },
    async listReportLog() {
      const snap = await F.getDocs(F.query(F.collection(db, 'reportlog'), F.orderBy('resolvedAt', 'desc'), F.limit(500)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    async report(game, item, reason, u) {
      const ref = F.doc(db, 'reports', rkey(game, item.id)), uid = u.uid;
      return F.runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          tx.set(ref, { game, itemId: item.id, count: 1, reporters: { [uid]: reporterInfo(u, reason) }, reasons: { [reason]: 1 }, preview: previewOf(item), createdAt: Date.now() });
          return 'ok';
        }
        const d = snap.data();
        if (d.reporters && d.reporters[uid]) return 'already';
        tx.update(ref, { count: (d.count || 0) + 1, [`reporters.${uid}`]: reporterInfo(u, reason), [`reasons.${reason}`]: ((d.reasons && d.reasons[reason]) || 0) + 1 });
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
    /* R&D Gifts: one small document per player holds the running total and the list of gifts. Only admins write it,
       so a gift can never be overwritten by a player who happens to be mid-game. */
    async getGifts(uid) {
      const snap = await F.getDoc(F.doc(db, 'gifts', uid));
      return snap.exists() ? { total: snap.data().total || 0, list: snap.data().list || [] } : { total: 0, list: [] };
    },
    async sendGift(uids, n, note, by, label) {
      const item = { id: giftId(), n, note, at: Date.now() };
      let done = 0;
      for (let i = 0; i < uids.length; i += 20) {
        await Promise.all(uids.slice(i, i + 20).map(async (uid) => { await F.setDoc(F.doc(db, 'gifts', uid), { total: F.increment(n), list: F.arrayUnion(item) }, { merge: true }); done++; }));
      }
      await F.addDoc(F.collection(db, 'giftlog'), { gid: item.id, at: item.at, by, label, count: done, n, note });
      return done;
    },
    async listGiftLog() {
      const snap = await F.getDocs(F.query(F.collection(db, 'giftlog'), F.orderBy('at', 'desc'), F.limit(100)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async resolveReport(id, status = 'kept', by = '', note = '') {
      const ref = F.doc(db, 'reports', id), snap = await F.getDoc(ref);
      if (snap.exists()) await F.addDoc(F.collection(db, 'reportlog'), { ...snap.data(), reportId: id, status, resolvedBy: by, resolvedAt: Date.now(), note });
      await F.deleteDoc(ref);
    }
  };
}

export async function createStore() {
  if (CONFIG.DEMO_MODE || !CONFIG.FIREBASE.apiKey) return demoStore();
  return firebaseStore();
}
