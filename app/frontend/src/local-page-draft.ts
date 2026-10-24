import * as Y from 'yjs';

export type DraftStatus = 'loading' | 'saving' | 'saved' | 'unavailable';

export class LocalPageDraft {
  status: DraftStatus = 'loading';
  failure?: 'load' | 'save';
  private database?: IDBDatabase;
  private readonly listeners = new Set<() => void>();
  private pending: Uint8Array[] = [];
  private loaded = false;
  private writing = false;
  private failed = false;
  private closing = false;
  private opening = 0;

  constructor(private readonly name: string, private readonly document: Y.Doc) {
    document.on('update', this.updated);
    this.open();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  retry() {
    if (!this.failed || this.closing) return;
    this.failed = false;
    this.loaded = false;
    this.pending = [];
    this.database = undefined;
    this.failure = undefined;
    this.setStatus('loading');
    this.open();
  }

  destroy() {
    this.closing = true;
    this.document.off('update', this.updated);
    this.listeners.clear();
    if (this.failed) this.database?.close();
    else if (this.loaded) this.flush();
  }

  private setStatus(status: DraftStatus) {
    if (this.status === status) return;
    this.status = status;
    if (!this.closing) for (const listener of this.listeners) listener();
  }

  private fail = () => {
    this.failure = this.loaded ? 'save' : 'load';
    this.failed = true;
    this.writing = false;
    this.database?.close();
    this.setStatus('unavailable');
  };

  private updated = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.failed || this.closing) return;
    this.pending.push(update);
    if (this.loaded) this.flush();
  };

  private open() {
    const opening = ++this.opening;
    const fail = () => {
      window.clearTimeout(timer);
      if (opening === this.opening) this.fail();
    };
    const timer = window.setTimeout(fail, 8_000);
    try {
      const request = indexedDB.open(this.name);
      request.onerror = fail;
      request.onblocked = fail;
      request.onupgradeneeded = () => {
        try {
          if (!request.result.objectStoreNames.contains('updates')) request.result.createObjectStore('updates', { autoIncrement: true });
          if (!request.result.objectStoreNames.contains('custom')) request.result.createObjectStore('custom');
        } catch {
          request.transaction?.abort();
          fail();
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        if (this.failed || opening !== this.opening) { window.clearTimeout(timer); database.close(); return; }
        this.database = database;
        database.onversionchange = fail;
        database.onclose = () => { if (!this.closing) fail(); };
        try {
          const transaction = database.transaction('updates', 'readonly');
          const updates = transaction.objectStore('updates').getAll();
          transaction.onabort = fail;
          transaction.oncomplete = () => {
            if (this.failed || opening !== this.opening) return;
            try {
              if (!this.closing) {
                const restored = new Y.Doc();
                try {
                  for (const update of updates.result) {
                    if (!(update instanceof Uint8Array)) throw new Error('Invalid device draft');
                    Y.applyUpdate(restored, update);
                  }
                  Y.applyUpdate(this.document, Y.encodeStateAsUpdate(restored), this);
                } finally {
                  restored.destroy();
                }
                this.pending.push(Y.encodeStateAsUpdate(this.document));
              }
              this.loaded = true;
              window.clearTimeout(timer);
              this.flush();
            } catch {
              fail();
            }
          };
        } catch {
          fail();
        }
      };
    } catch {
      fail();
    }
  }

  private flush() {
    if (!this.database || this.failed || this.writing) return;
    if (this.pending.length === 0) {
      if (this.closing) this.database.close();
      else this.setStatus('saved');
      return;
    }
    this.writing = true;
    this.setStatus('saving');
    const opening = this.opening;
    const fail = () => { if (opening === this.opening) this.fail(); };
    try {
      const transaction = this.database.transaction('updates', 'readwrite');
      const store = transaction.objectStore('updates');
      store.add(Y.mergeUpdates(this.pending));
      this.pending = [];
      const count = store.count();
      count.onsuccess = () => {
        if (count.result < 500) return;
        const updates = store.getAll();
        updates.onsuccess = () => {
          const compacted = new Y.Doc();
          try {
            for (const update of updates.result) Y.applyUpdate(compacted, update);
            store.clear();
            store.add(Y.encodeStateAsUpdate(compacted));
          } catch {
            transaction.abort();
          } finally {
            compacted.destroy();
          }
        };
      };
      transaction.onabort = fail;
      transaction.oncomplete = () => {
        if (opening !== this.opening) return;
        this.writing = false;
        this.flush();
      };
    } catch {
      fail();
    }
  }
}
