/**
 * Offline Mutation Queue
 * Queues create/update/status operations when offline.
 * Replays on reconnect with idempotency keys to prevent duplicates.
 */
import { signal } from '@preact/signals';

const DB_NAME = 'docboard_offline';
const STORE_NAME = 'queue';
const DB_VERSION = 1;

export const queueCount = signal(0);
export const syncState = signal('idle'); // idle, syncing, error, conflict

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(action, path, data) {
  const db = await openDB();
  const idempotencyKey = crypto.randomUUID();
  const entry = {
    action, path, data: { ...data, idempotency_key: idempotencyKey },
    idempotencyKey,
    createdAt: new Date().toISOString(),
    status: 'pending'
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(entry);
    tx.oncomplete = () => { updateCount(); resolve(entry); };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function remove(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { updateCount(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

export async function markConflict(id, error) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const entry = req.result;
      if (entry) {
        entry.status = 'conflict';
        entry.error = error;
        store.put(entry);
      }
    };
    tx.oncomplete = () => { updateCount(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function updateCount() {
  try {
    const items = await getAll();
    queueCount.value = items.filter(i => i.status === 'pending').length;
  } catch { queueCount.value = 0; }
}

export async function replayQueue(requestFn) {
  const items = await getAll();
  const pending = items.filter(i => i.status === 'pending');
  if (pending.length === 0) return { replayed: 0, conflicts: 0 };

  syncState.value = 'syncing';
  let replayed = 0;
  let conflicts = 0;

  for (const item of pending) {
    try {
      await requestFn(item.path, {
        method: item.action,
        body: JSON.stringify(item.data)
      });
      await remove(item.id);
      replayed++;
    } catch (err) {
      if (err.message && err.message.includes('idempotency')) {
        // Already processed — safe to remove
        await remove(item.id);
        replayed++;
      } else {
        await markConflict(item.id, err.message);
        conflicts++;
      }
    }
  }

  syncState.value = conflicts > 0 ? 'conflict' : 'idle';
  await updateCount();
  return { replayed, conflicts };
}

export async function clearConflicts() {
  const items = await getAll();
  for (const item of items) {
    if (item.status === 'conflict') await remove(item.id);
  }
  syncState.value = 'idle';
}

// Init count on load
if (typeof indexedDB !== 'undefined') {
  updateCount().catch(() => {});
}
