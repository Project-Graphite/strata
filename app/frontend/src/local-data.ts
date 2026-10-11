function deleteDatabase(name: string) {
  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

export async function wipeLocalData() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    await (await registration?.pushManager?.getSubscription())?.unsubscribe();
  }
  if (typeof caches !== 'undefined') {
    await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
  }
  if (typeof indexedDB !== 'undefined' && 'databases' in indexedDB) {
    const databases = await indexedDB.databases();
    await Promise.all(databases.flatMap(({ name }) => (name ? [deleteDatabase(name)] : [])));
  }
}
