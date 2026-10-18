const DB = "dibya-staff-preview-files";
const memory = new Map();
const urls = new Map();
function database() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("sources");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function addSources(files) {
  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]);
  for (const file of files) {
    if (!allowed.has(file.type))
      throw new Error("Gunakan JPG, PNG, WebP, atau PDF.");
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Batas ukuran tiap berkas adalah 10 MB.");
  }
  const db = await database();
  const result = [];
  try {
    for (const file of files) {
      const id = crypto.randomUUID();
      if (db)
        await new Promise((resolve, reject) => {
          const transaction = db.transaction("sources", "readwrite");
          transaction.objectStore("sources").put(file, id);
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
        });
      else memory.set(id, file);
      result.push({ id, name: file.name, type: file.type, size: file.size });
    }
  } finally {
    db?.close();
  }
  return result;
}
export async function sourceUrl(source) {
  if (urls.has(source.id)) return urls.get(source.id);
  let file = memory.get(source.id);
  const db = await database();
  try {
    if (db)
      file = await new Promise((resolve, reject) => {
        const request = db
          .transaction("sources")
          .objectStore("sources")
          .get(source.id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
  } finally {
    db?.close();
  }
  if (!file)
    throw new Error(
      "Berkas sumber tidak tersedia pada perangkat ini. Pilih kembali berkas untuk meninjaunya.",
    );
  const url = URL.createObjectURL(file);
  urls.set(source.id, url);
  return url;
}
export async function resetSources() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  memory.clear();
  const db = await database();
  try {
    if (db)
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("sources", "readwrite");
        transaction.objectStore("sources").clear();
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
  } finally {
    db?.close();
  }
}
