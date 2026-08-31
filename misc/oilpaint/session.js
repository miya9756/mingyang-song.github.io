// One working session, shared by the two pages.
//
// The tuner and the animator are separate documents, so navigating between them is a full
// page load and everything in memory goes. That was fine when there was one page; with two
// it means the animator opens on engine defaults with no picture, and going back to the
// tuner throws away the tuning you just did. Both are the same missing thing: nothing was
// written down.
//
// TWO STORES, because the state has two very different sizes.
//
//   SETUP -- parameters and placed swirl centres. A few hundred bytes of numbers, wanted
//   synchronously while the control panel is being built. localStorage.
//
//   IMAGE -- the source photograph as the data URL the pages already hand to `img.src`.
//   A full-resolution phone photo is 5-8 MB of base64, which is past localStorage's ~5 MB
//   quota on every browser: storing it there does not degrade, it THROWS, and takes the
//   setup with it if they share a write. IndexedDB has no such limit and is asynchronous,
//   which is fine because an image load already is.
//
// Everything here is wrapped. Both stores throw outright in a private window and in a
// browser set to block site data, and a session that cannot be saved must degrade to the
// old behaviour -- re-drop the image, retune -- rather than taking the page down.

const SETUP_KEY = 'oilpaint.setup';
const DB_NAME = 'oilpaint';
const STORE = 'session';
const IMAGE_KEY = 'image';

/** Parameters and placed swirl centres. Synchronous, small, best-effort. */
export function saveSetup(state) {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(Object.assign({ at: Date.now() }, state)));
    return true;
  } catch (e) {
    return false;                    // private window, or site data blocked
  }
}

export function loadSetup() {
  try {
    return JSON.parse(localStorage.getItem(SETUP_KEY) || 'null');
  } catch (e) {
    return null;                     // unreadable, or written by an older version
  }
}

export function clearSetup() {
  try { localStorage.removeItem(SETUP_KEY); } catch (e) { /* nothing to do */ }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB refused'));
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  });
}

function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

/**
 * The source image, as the data URL both pages already put in `img.src`.
 *
 * The URL rather than a Blob on purpose: it is what `upload()` produces on both pages and
 * what `<img>` consumes, so restoring is the same code path as loading, and there is no
 * second decode to get wrong.
 */
export async function saveImage(dataUrl, name) {
  try {
    await tx('readwrite', s => s.put({ dataUrl, name: name || 'image', at: Date.now() },
                                     IMAGE_KEY));
    return true;
  } catch (e) {
    return false;
  }
}

/** `{dataUrl, name}` or null. Never throws. */
export async function loadImage() {
  try {
    const v = await tx('readonly', s => s.get(IMAGE_KEY));
    return v && v.dataUrl ? v : null;
  } catch (e) {
    return null;
  }
}

export async function clearImage() {
  try { await tx('readwrite', s => s.delete(IMAGE_KEY)); } catch (e) { /* nothing to do */ }
}
