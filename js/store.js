/*
 * Archivio locale (IndexedDB). Tutto resta sul dispositivo.
 * Stessa struttura di Listino in tasca, ma in un database nuovo, così le app
 * precedenti restano intatte:
 *  - kv:     catalogo estratto, impostazioni, bozza del preventivo, book sbloccato
 *  - files:  il PDF del listino (serve per disegnare figure e pagine)
 *  - quotes: preventivi salvati
 */
export const DB_NAME = 'preventivo-in-tasca';
const DB_VERSION = 1;
let dbp = null;

export function apri(nome = DB_NAME) {
  if (nome === DB_NAME && dbp) return dbp;
  const p = new Promise((resolve, reject) => {
    const req = indexedDB.open(nome, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      if (!db.objectStoreNames.contains('quotes')) db.createObjectStore('quotes', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (nome === DB_NAME) { dbp = p; p.catch(() => { dbp = null; }); }
  return p;
}

function tx(store, mode, fn) {
  return apri().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Operazione annullata'));
  }));
}

export const Store = {
  get: (store, key) => tx(store, 'readonly', s => s.get(key)),
  set: (store, key, value) => tx(store, 'readwrite', s => (key === null ? s.put(value) : s.put(value, key))),
  del: (store, key) => tx(store, 'readwrite', s => s.delete(key)),
  all: store => tx(store, 'readonly', s => s.getAll()),
  clear: store => tx(store, 'readwrite', s => s.clear()),
  async persist() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* non supportato */ }
    return false;
  }
};

/* Preferenze piccole (tema, scelte dei moduli): localStorage con prefisso pit_. */
export const Pref = {
  get(chiave, predefinito = null) {
    try { const v = localStorage.getItem('pit_' + chiave); return v === null ? predefinito : JSON.parse(v); } catch (e) { return predefinito; }
  },
  set(chiave, valore) {
    try { if (valore === null || valore === undefined) localStorage.removeItem('pit_' + chiave); else localStorage.setItem('pit_' + chiave, JSON.stringify(valore)); } catch (e) { /* spazio pieno o navigazione privata */ }
  }
};
