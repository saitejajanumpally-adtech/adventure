// Firestore security rules, tested against the Firestore emulator. Run: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, increment, deleteField } from 'firebase/firestore';

let env;
const ME = { uid: 'me', email: 'me@databeat.io' };
const OTHER = { uid: 'other', email: 'other@databeat.io' };
const BOSS = { uid: 'boss', email: 'boss@databeat.io' };
const as = (u, extra = {}) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true, ...extra }).firestore();
const outsider = () => env.authenticatedContext('x', { email: 'x@gmail.com', email_verified: true }).firestore();
const unverified = () => env.authenticatedContext('me', { email: ME.email, email_verified: false }).firestore();
const lookalike = () => env.authenticatedContext('y', { email: 'y@databeat.io.evil.com', email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-adventure', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host, port: Number(port) } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config/admins'), { emails: [BOSS.email] });
    await setDoc(doc(db, 'config/settings'), { floorGoal: 300 });
    await setDoc(doc(db, 'users/me'), { name: 'Me', email: ME.email, coins: 10 });
    await setDoc(doc(db, 'users/other'), { name: 'Other', email: OTHER.email, coins: 99 });
    await setDoc(doc(db, 'packs/myth-or-fact'), { items: [], version: 1 });
    await setDoc(doc(db, 'floor/2026-10-26'), { count: 5 });
    await setDoc(doc(db, 'qstats/myth-or-fact'), { r_t1: 3 });
    await setDoc(doc(db, 'reports/myth-or-fact__t1'), { game: 'myth-or-fact', itemId: 't1', count: 1, reporters: { other: { name: 'Other' } }, reasons: { wrong: 1 }, preview: 'Q', createdAt: 1 });
    await setDoc(doc(db, 'feedback/f1'), { uid: 'other', type: 'idea', message: 'hi', status: 'open' });
    await setDoc(doc(db, 'reportlog/l1'), { status: 'kept' });
  });
});

/* ---------- users ---------- */
test('a player reads and writes only their own profile', async () => {
  await assertSucceeds(getDoc(doc(as(ME), 'users/me')));
  await assertSucceeds(setDoc(doc(as(ME), 'users/me'), { coins: 20, email: ME.email }, { merge: true }));
  await assertFails(getDoc(doc(as(ME), 'users/other')));
  await assertFails(setDoc(doc(as(ME), 'users/other'), { coins: 0 }, { merge: true }));
  await assertFails(getDocs(collection(as(ME), 'users')));
});
test('a player cannot put someone else\'s email on their profile', async () => {
  await assertFails(setDoc(doc(as(ME), 'users/me'), { email: BOSS.email }, { merge: true }));
});
test('a new player can create their own profile on first sign-in', async () => {
  const NEW = { uid: 'new', email: 'new@databeat.io' };
  await assertSucceeds(setDoc(doc(as(NEW), 'users/new'), { name: 'New', email: NEW.email, coins: 0 }, { merge: true }));
});
test('an admin reads every profile and can reset one', async () => {
  await assertSucceeds(getDocs(collection(as(BOSS), 'users')));
  await assertSucceeds(setDoc(doc(as(BOSS), 'users/other'), { name: 'Other', email: OTHER.email, coins: 0 }));
});

/* ---------- config, packs, reportlog ---------- */
test('only admins change settings, packs and the report history; everyone in the domain reads settings and packs', async () => {
  await assertSucceeds(getDoc(doc(as(ME), 'config/settings')));
  await assertSucceeds(getDoc(doc(as(ME), 'packs/myth-or-fact')));
  await assertFails(setDoc(doc(as(ME), 'config/settings'), { floorGoal: 1 }));
  await assertFails(setDoc(doc(as(ME), 'config/admins'), { emails: [ME.email] }));
  await assertFails(setDoc(doc(as(ME), 'config/announce'), { banner: { on: true, text: 'hi' } }));
  await assertFails(setDoc(doc(as(ME), 'packs/myth-or-fact'), { items: [] }));
  await assertFails(setDoc(doc(as(ME), 'packs/myth-or-fact/versions/2'), { items: [] }));
  await assertFails(getDoc(doc(as(ME), 'reportlog/l1')));
  await assertFails(setDoc(doc(as(ME), 'reportlog/l2'), { status: 'kept' }));
  await assertSucceeds(setDoc(doc(as(BOSS), 'config/settings'), { floorGoal: 200 }));
  await assertSucceeds(setDoc(doc(as(BOSS), 'packs/myth-or-fact'), { items: [], version: 2 }));
  await assertSucceeds(addDoc(collection(as(BOSS), 'reportlog'), { status: 'kept' }));
});
test('admins cannot empty or delete the admin list', async () => {
  await assertFails(setDoc(doc(as(BOSS), 'config/admins'), { emails: [] }));
  await assertFails(setDoc(doc(as(BOSS), 'config/admins'), { other: 1 }));
  await assertFails(deleteDoc(doc(as(BOSS), 'config/admins')));
  await assertSucceeds(setDoc(doc(as(BOSS), 'config/admins'), { emails: [BOSS.email, ME.email] }));
});

/* ---------- feedback ---------- */
test('feedback: own uid, a valid type and up to 2000 characters; only admins read it', async () => {
  const ok = { uid: 'me', email: ME.email, type: 'problem', message: 'x'.repeat(2000), status: 'open', createdAt: 1 };
  await assertSucceeds(addDoc(collection(as(ME), 'feedback'), ok));
  await assertFails(addDoc(collection(as(ME), 'feedback'), { ...ok, uid: 'other' }));
  await assertFails(addDoc(collection(as(ME), 'feedback'), { ...ok, type: 'spam' }));
  await assertFails(addDoc(collection(as(ME), 'feedback'), { ...ok, message: 'x'.repeat(2001) }));
  await assertFails(addDoc(collection(as(ME), 'feedback'), { ...ok, message: 42 }));
  await assertFails(getDoc(doc(as(ME), 'feedback/f1')));
  await assertFails(getDocs(collection(as(ME), 'feedback')));
  await assertFails(updateDoc(doc(as(ME), 'feedback/f1'), { status: 'done' }));
  await assertSucceeds(getDocs(collection(as(BOSS), 'feedback')));
  await assertSucceeds(updateDoc(doc(as(BOSS), 'feedback/f1'), { status: 'done' }));
});
test('feedback cannot be sent under someone else\'s email or arrive already closed', async () => {
  const ok = { uid: 'me', email: ME.email, type: 'problem', message: 'hello', status: 'open', createdAt: 1 };
  await assertFails(addDoc(collection(as(ME), 'feedback'), { ...ok, email: BOSS.email }));
  await assertFails(addDoc(collection(as(ME), 'feedback'), { ...ok, status: 'done' }));
});

/* ---------- floor ---------- */
test('floor: only +1 at a time, and no names', async () => {
  await assertSucceeds(setDoc(doc(as(ME), 'floor/2026-10-26'), { count: increment(1) }, { merge: true }));
  await assertSucceeds(setDoc(doc(as(ME), 'floor/2026-11-02'), { count: increment(1) }, { merge: true })); // first round of a new week
  await assertSucceeds(getDoc(doc(as(ME), 'floor/2026-10-26')));
  await assertFails(setDoc(doc(as(ME), 'floor/2026-10-26'), { count: increment(2) }, { merge: true }));
  await assertFails(setDoc(doc(as(ME), 'floor/2026-10-26'), { count: 0 }));
  await assertFails(setDoc(doc(as(ME), 'floor/2026-10-26'), { count: increment(1), who: 'me' }, { merge: true }));
  await assertFails(setDoc(doc(as(ME), 'floor/2026-11-09'), { count: 50 }));
  await assertFails(deleteDoc(doc(as(ME), 'floor/2026-10-26')));
});

/* ---------- qstats ---------- */
test('qstats: everyone adds to the tallies, only admins read them', async () => {
  await assertSucceeds(setDoc(doc(as(ME), 'qstats/myth-or-fact'), { r_t1: increment(1), w_t2: increment(1) }, { merge: true }));
  await assertSucceeds(setDoc(doc(as(ME), 'qstats/odd-one-out'), { r_o1: increment(1) }, { merge: true }));
  await assertFails(getDoc(doc(as(ME), 'qstats/myth-or-fact')));
  await assertSucceeds(getDoc(doc(as(BOSS), 'qstats/myth-or-fact')));
});
// Known gap, not fixed: rules cannot check every key of a document, so a player could overwrite a tally.
// Fixing it means one document per question (more writes). Impact: only the admin "answered right" figures.
test('qstats: a player cannot overwrite or lower the tallies', { todo: 'known gap: rules cannot check every key; see report' }, async () => {
  await assertFails(setDoc(doc(as(ME), 'qstats/myth-or-fact'), { r_t1: 0 }, { merge: true }));
  await assertFails(setDoc(doc(as(ME), 'qstats/myth-or-fact'), { r_t1: 1000 }, { merge: true }));
  await assertFails(setDoc(doc(as(ME), 'qstats/myth-or-fact'), { r_t1: increment(-3) }, { merge: true }));
  await assertFails(setDoc(doc(as(ME), 'qstats/myth-or-fact'), { r_t1: 'x' }, { merge: true }));
  await assertFails(deleteDoc(doc(as(ME), 'qstats/myth-or-fact')));
});

/* ---------- reports ---------- */
const newReport = (uid) => ({ game: 'odd-one-out', itemId: 'o1', count: 1, reporters: { [uid]: { name: 'Me', email: ME.email, at: 1, reason: 'wrong' } }, reasons: { wrong: 1 }, preview: 'Q', createdAt: 1 });
test('reports: one report per player, and no other fields can change', async () => {
  await assertSucceeds(setDoc(doc(as(ME), 'reports/odd-one-out__o1'), newReport('me')));
  const add = { count: 2, 'reporters.me': { name: 'Me', at: 1, reason: 'unclear' }, 'reasons.unclear': 1 };
  await assertSucceeds(updateDoc(doc(as(ME), 'reports/myth-or-fact__t1'), add));
  await assertFails(updateDoc(doc(as(ME), 'reports/myth-or-fact__t1'), { ...add, count: 3, 'reasons.unclear': 2 })); // a second report
  await assertFails(updateDoc(doc(as(OTHER), 'reports/myth-or-fact__t1'), { count: 2, 'reporters.other': { name: 'x' }, 'reasons.wrong': 2 }));
  await assertFails(updateDoc(doc(as(ME), 'reports/myth-or-fact__t1'), { count: 2, 'reporters.me': { name: 'Me' }, preview: 'changed' }));
  await assertFails(updateDoc(doc(as(ME), 'reports/myth-or-fact__t1'), { count: 2, 'reporters.me': { name: 'Me' }, 'reporters.other': deleteField() }));
  await assertFails(getDoc(doc(as(ME), 'reports/myth-or-fact__t1')));
  await assertFails(deleteDoc(doc(as(ME), 'reports/myth-or-fact__t1')));
  await assertSucceeds(getDocs(collection(as(BOSS), 'reports')));
  await assertSucceeds(deleteDoc(doc(as(BOSS), 'reports/myth-or-fact__t1')));
});
test('reports: the count can only go up together with the reporter\'s own entry', async () => {
  await assertFails(updateDoc(doc(as(ME), 'reports/myth-or-fact__t1'), { count: 2 })); // count up without adding yourself
  await assertFails(setDoc(doc(as(ME), 'reports/odd-one-out__o1'), { ...newReport('me'), reporters: {} })); // create without yourself
  await assertFails(updateDoc(doc(as(ME), 'reports/myth-or-fact__t1'), { count: 2, 'reporters.me': true, 'reasons.wrong': 50 })); // reason tally jumps
});

/* ---------- outside the domain ---------- */
test('anyone outside @databeat.io, unverified or signed out is denied everything', async () => {
  for (const db of [outsider(), unverified(), lookalike(), anon()]) {
    await assertFails(getDoc(doc(db, 'config/settings')));
    await assertFails(getDoc(doc(db, 'packs/myth-or-fact')));
    await assertFails(getDoc(doc(db, 'floor/2026-10-26')));
    await assertFails(setDoc(doc(db, 'floor/2026-10-26'), { count: increment(1) }, { merge: true }));
    await assertFails(setDoc(doc(db, 'qstats/myth-or-fact'), { r_t1: increment(1) }, { merge: true }));
    await assertFails(addDoc(collection(db, 'feedback'), { uid: 'x', type: 'idea', message: 'hi' }));
    await assertFails(setDoc(doc(db, 'reports/odd-one-out__o1'), newReport('x')));
  }
  await assertFails(setDoc(doc(outsider(), 'users/x'), { coins: 1 }));
  await assertFails(getDoc(doc(unverified(), 'users/me')));
});
