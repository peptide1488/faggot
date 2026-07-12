/**
 * Generic localStorage-backed list-of-JSON-entries, keyed by `id`. Shared by the custom
 * materials library and the custom objects library (customMaterials.js / customObjects.js)
 * — identical shape, different storage keys, so this is the one place that logic lives.
 */
export function makeLibrary(storageKey) {
  function hasLocalStorage() {
    return typeof localStorage !== 'undefined';
  }

  function load() {
    if (!hasLocalStorage()) return [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function save(entries) {
    if (!hasLocalStorage()) return;
    localStorage.setItem(storageKey, JSON.stringify(entries));
  }

  /** Adds a new entry, or replaces an existing one with the same `id` in place. */
  function add(entry) {
    const lib = load();
    const idx = lib.findIndex((e) => e.id === entry.id);
    if (idx >= 0) lib[idx] = entry;
    else lib.push(entry);
    save(lib);
    return lib;
  }

  function remove(id) {
    const lib = load().filter((e) => e.id !== id);
    save(lib);
    return lib;
  }

  return { load, save, add, remove };
}
