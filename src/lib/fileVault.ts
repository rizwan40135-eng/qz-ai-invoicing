/** Browser IndexedDB store for the original uploaded invoice files, keyed by invoice id. */
const DB = "qap-files";
const STORE = "originals";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function saveOriginal(invoiceId: string, file: File) {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ name: file.name, type: file.type, blob: file }, invoiceId);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getOriginal(invoiceId: string): Promise<{ name: string; type: string; blob: Blob } | null> {
  const db = await open();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).get(invoiceId);
    r.onsuccess = () => res((r.result as { name: string; type: string; blob: Blob } | undefined) ?? null);
    r.onerror = () => rej(r.error);
  });
}

export async function listOriginalIds(): Promise<Set<string>> {
  const db = await open();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).getAllKeys();
    r.onsuccess = () => res(new Set(r.result.map(String)));
    r.onerror = () => rej(r.error);
  });
}

export async function deleteOriginal(invoiceId: string) {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(invoiceId);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
