const storage = new Map();

const localStorageStub = {
  get length() { return storage.size; },
  clear() { storage.clear(); },
  getItem(key) { return storage.has(String(key)) ? storage.get(String(key)) : null; },
  key(index) { return Array.from(storage.keys())[index] ?? null; },
  removeItem(key) { storage.delete(String(key)); },
  setItem(key, value) { storage.set(String(key), String(value)); },
};

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageStub,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageStub,
  });
}
