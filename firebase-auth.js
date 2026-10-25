// Stand-in for Firebase Auth, used only by the tests. The signed-in person comes from window.__fakeUser.
export const getAuth = () => ({});
export class GoogleAuthProvider { setCustomParameters() {} }
let listener = null;
export function onAuthStateChanged(_auth, cb) { listener = cb; setTimeout(() => cb(window.__fakeUser || null), 0); return () => { listener = null; }; }
export async function signInWithPopup() { if (listener) listener(window.__fakeUser); }
export async function signOut() { window.__fakeUser = null; if (listener) listener(null); }
