/* Life Dashboard local-first data layer. No personal data is sent to GitHub. */
const LifeDB = (() => {
  const DB_NAME = 'LifeDashboardDB';
  const DB_VERSION = 1;
  const STORES = ['tasks', 'lists', 'plans', 'files', 'inbox', 'settings'];
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'id' });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function tx(storeName, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      try {
        result = action(store);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll(storeName) {
    const db = await open();
    const transaction = db.transaction(storeName, 'readonly');
    return requestResult(transaction.objectStore(storeName).getAll());
  }

  async function get(storeName, id) {
    const db = await open();
    const transaction = db.transaction(storeName, 'readonly');
    return requestResult(transaction.objectStore(storeName).get(id));
  }

  async function put(storeName, item) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(item);
      transaction.oncomplete = () => resolve(item);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function remove(storeName, id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function clear(storeName) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function replaceAll(data) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES, 'readwrite');
      for (const storeName of STORES) {
        const store = transaction.objectStore(storeName);
        store.clear();
        for (const item of data[storeName] || []) store.put(item);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async function exportAll() {
    const data = {};
    for (const store of STORES) data[store] = await getAll(store);
    return data;
  }

  return { DB_NAME, DB_VERSION, STORES, open, getAll, get, put, remove, clear, replaceAll, exportAll };
})();
