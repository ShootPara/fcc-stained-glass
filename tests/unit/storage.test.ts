/// <reference lib="dom" />
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ColoringStore, SaveSession, recordKey, snapshotState, validateSnapshot, type Commit, type Identity, type Store } from '../../src/editor/storage.js';
import { editorReducer, initialEditorState } from '../../src/editor/reducer.js';

function identity(): Identity { return { namespace: `test:${crypto.randomUUID()}`, artworkId: 'design-002', contentVersion: 'a'.repeat(64) }; }
const filled = () => snapshotState(editorReducer(initialEditorState(), { type: 'fill', regionId: 1 }));

describe('local coloring storage', () => {
  it('allows only one winner when two tabs commit against the same baseline', async () => {
    const store = new ColoringStore(); const key = identity();
    const results = await Promise.all([store.commit(key, null, filled()), store.commit(key, null, filled())]);
    expect(results.map(result => result.kind).sort()).toEqual(['conflict', 'saved']);
  });
  it('preserves corrupt raw data before an explicit fresh start', async () => {
    const key = identity(); const store = new ColoringStore();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('fcc-kalamazoo-stained-glass', 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const raw = { key: recordKey(key), namespace: key.namespace, artworkId: key.artworkId, contentVersion: key.contentVersion, damaged: 'preserve me' };
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('colorings', 'readwrite'); tx.objectStore('colorings').put(raw); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
    expect((await store.load(key)).kind).toBe('corrupt');
    expect(await store.preserveAndRemove(key)).toBe(true);
    const recovered = await new Promise<unknown[]>((resolve, reject) => { const tx = db.transaction('recovery'); const req = tx.objectStore('recovery').getAll(); tx.oncomplete = () => resolve(req.result); tx.onabort = () => reject(tx.error); });
    expect(recovered).toContainEqual({ key: recordKey(key), raw }); db.close();
    expect(await store.load(key)).toEqual({ kind: 'missing' });
  });
  it('atomically commits against the revision read, isolating versions and deployments', async () => {
    const store = new ColoringStore(); const key = identity();
    expect(await store.load(key)).toEqual({ kind: 'missing' });
    expect(await store.commit(key, null, filled())).toEqual({ kind: 'saved', revision: 1 });
    expect(await store.commit(key, null, filled())).toEqual({ kind: 'conflict' });
    expect(await store.commit(key, 1, filled())).toEqual({ kind: 'saved', revision: 2 });
    expect((await store.load(key)).kind).toBe('found');
    expect(await store.load({ ...key, contentVersion: 'b'.repeat(64) })).toEqual({ kind: 'missing' });
    expect(await store.load({ ...key, namespace: 'another-base' })).toEqual({ kind: 'missing' });
    expect(await store.listSavedVersions(key.namespace, key.artworkId)).toEqual([key.contentVersion]);
    expect(recordKey(key)).not.toBe(recordKey({ ...key, namespace: 'another-base' }));
  });
  it('restores fills, palette, history, and viewport after reopening', async () => {
    const store = new ColoringStore(); const key = identity();
    const first = new SaveSession(key, 45, store); await first.loaded;
    const snapshot = { ...filled(), view: { zoom: 2, x: 0.4, y: 0.6 } };
    first.save(snapshot); await first.settled();
    const reopened = new SaveSession(key, 45, store); await reopened.loaded;
    expect(reopened.latest).toEqual(snapshot); expect(reopened.status).toBe('saved');
  });
  it('serializes delayed commits and keeps the newest local snapshot through navigation', async () => {
    const releases: Array<() => void> = []; const writes: number[] = [];
    const store: Store = { load: async () => ({ kind: 'missing' }), commit: async (_key, _expected, snapshot) => {
      writes.push(snapshot.localStateRevision); await new Promise<void>(resolve => releases.push(resolve));
      return { kind: 'saved', revision: writes.length };
    } };
    const session = new SaveSession(identity(), 45, store); await session.loaded;
    session.save(filled()); session.save({ ...filled(), localStateRevision: 2 }); session.save({ ...filled(), localStateRevision: 3 });
    expect(writes).toEqual([1]); expect(session.latest?.localStateRevision).toBe(3);
    releases.shift()!(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(writes).toEqual([1, 3]); releases.shift()!(); await session.settled();
    expect(session.status).toBe('saved');
  });
  it('never writes after failed or corrupt reads and retains unsaved edits', async () => {
    for (const load of [{ kind: 'unavailable' }, { kind: 'corrupt', raw: { damaged: true } }] as const) {
      let writes = 0;
      const session = new SaveSession(identity(), 45, { load: async () => load, commit: async () => { writes++; return { kind: 'saved', revision: 1 }; } });
      await session.loaded; session.save(filled()); await session.settled();
      expect(writes).toBe(0); expect(session.latest).toEqual(filled()); expect(session.status).toBe(load.kind);
    }
  });
  it.each(['conflict', 'unavailable'] as const)('stops writes after %s and retains latest work', async kind => {
    let writes = 0;
    const session = new SaveSession(identity(), 45, { load: async () => ({ kind: 'missing' }), commit: async (): Promise<Commit> => { writes++; return { kind }; } });
    await session.loaded; session.save(filled()); await session.settled();
    session.save({ ...filled(), localStateRevision: 2 }); await session.settled();
    expect(writes).toBe(1); expect(session.status).toBe(kind); expect(session.latest?.localStateRevision).toBe(2);
  });
  it('rejects unknown IDs, duplicate fills, invalid colors, and inconsistent history', () => {
    expect(() => validateSnapshot(filled(), 45)).not.toThrow();
    expect(() => validateSnapshot({ ...filled(), fills: [[46, '#1976D2']] }, 45)).toThrow();
    expect(() => validateSnapshot({ ...filled(), fills: [[1, '#1976D2'], [1, '#1976D2']] }, 45)).toThrow();
    expect(() => validateSnapshot({ ...filled(), selectedColor: 'blue' }, 45)).toThrow();
    expect(() => validateSnapshot({ ...filled(), fills: [[1, '#FFFFFF']] }, 45)).toThrow();
  });
});
