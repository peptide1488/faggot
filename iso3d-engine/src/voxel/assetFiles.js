/**
 * Optional, best-effort mirror of uploaded art (billboards/decals/materials) onto real files on
 * disk, via the File System Access API (Chrome/Edge only — `window.showDirectoryPicker`; no
 * polyfill, no fallback UI for unsupported browsers, they just silently keep working exactly as
 * before). This is deliberately NOT the source of truth: localStorage (see contentLibrary.js)
 * remains the one thing every Maker panel actually reads from on page load. Every function here
 * is a pure side effect — never throws, never blocks a create/save flow, and a user who never
 * grants folder access (or is on an unsupported browser) sees no difference at all.
 *
 * Motivation: uploaded art previously only ever existed as an opaque base64 blob inside
 * localStorage — no real file anywhere to open, diff, or put under version control. This gives
 * every upload a real on-disk copy purely for visibility, without touching how the engine itself
 * loads/persists content.
 */

const DB_NAME = 'iso3d.assetFiles';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'assetsDir';

export function hasFSAccess() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Extension (including the leading dot) inferred from a filename; ".png" if none is present —
 * every asset written to disk needs SOME extension for it to open correctly in an image viewer. */
export function extOf(filename) {
  const match = /\.[^./\\]+$/.exec(filename || '');
  return match ? match[0] : '.png';
}

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadPersistedHandle() {
  try {
    const db = await openHandleDB();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

async function savePersistedHandle(handle) {
  try {
    const db = await openHandleDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Persisting is itself best-effort — a handle that only lasts this page load still works.
  }
}

/** Must be called from a real click handler — showDirectoryPicker() requires transient user
 * activation, so this can never be invoked automatically (e.g. on page load). Returns the chosen
 * handle (also persisted to IndexedDB for reuse across reloads), or null if the user cancelled or
 * the browser doesn't support the API at all. */
export async function chooseAssetsFolder() {
  if (!hasFSAccess()) return null;
  try {
    const handle = await window.showDirectoryPicker({ id: 'iso3d-assets', mode: 'readwrite' });
    await savePersistedHandle(handle);
    return handle;
  } catch {
    return null; // user cancelled the picker — not an error
  }
}

/** Returns the persisted assets directory handle ONLY if permission is already granted from a
 * prior chooseAssetsFolder() call — deliberately never re-prompts (queryPermission can't request
 * a gesture), so a page load or a background save attempt can call this freely without risking an
 * unexpected permission dialog. Returns null if unsupported, never connected, or access lapsed. */
export async function getAssetsDirHandle() {
  if (!hasFSAccess()) return null;
  const handle = await loadPersistedHandle();
  if (!handle) return null;
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    return perm === 'granted' ? handle : null;
  } catch {
    return null;
  }
}

/** Best-effort write of `fileOrBlob` to `<assets dir>/<subfolder>/<fileName>`, creating any
 * intermediate folder that doesn't exist yet. No-ops silently (console.warn only) if there's no
 * connected assets folder, the browser doesn't support the API, or the write fails for any
 * reason — this must never interrupt the actual create/save flow it's called from. */
export async function saveAssetFile(subfolder, fileName, fileOrBlob) {
  try {
    const rootHandle = await getAssetsDirHandle();
    if (!rootHandle || !fileOrBlob) return;
    const dirHandle = await rootHandle.getDirectoryHandle(subfolder, { create: true });
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(fileOrBlob);
    await writable.close();
  } catch (e) {
    console.warn(`saveAssetFile: failed to save "${subfolder}/${fileName}" to disk (art still saved to localStorage as normal):`, e);
  }
}
