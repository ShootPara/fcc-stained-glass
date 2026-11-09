import { z } from 'zod';
import type { EditorState, HexColor } from './reducer.js';

const color = z.string().regex(/^#[0-9A-F]{6}$/u).transform(value => value as HexColor);
const id = z.number().int().positive();
const change = z.object({ regionId: id, before: color.optional(), after: color.optional() }).strict()
  .transform(c => ({ regionId: c.regionId, before: c.before, after: c.after }));
const command = z.object({ kind: z.enum(['fill', 'reset']), changes: z.array(change).min(1).max(100000) }).strict();
export const SnapshotSchema = z.object({
  fills: z.array(z.tuple([id, color])).max(100000), selectedColor: color,
  undoStack: z.array(command).max(100), redoStack: z.array(command).max(100),
  paintRevision: z.number().int().nonnegative(), localStateRevision: z.number().int().nonnegative(),
  view: z.object({ zoom: z.number().min(1).max(8), x: z.number().min(0).max(1), y: z.number().min(0).max(1), referenceVisible: z.boolean().optional() }).strict().optional(),
}).strict();
export type Snapshot = z.infer<typeof SnapshotSchema>;
export const RecordSchema = z.object({ key: z.string(), namespace: z.string(), artworkId: z.string(), contentVersion: z.string(),
  schemaVersion: z.literal(1), storedRevision: z.number().int().positive(), snapshot: SnapshotSchema }).strict();
export type SavedRecord = z.infer<typeof RecordSchema>;
export type Identity = Pick<SavedRecord, 'namespace' | 'artworkId' | 'contentVersion'>;
export function recordKey(identity: Identity): string { return JSON.stringify([identity.namespace, identity.artworkId, identity.contentVersion]); }
export function snapshotState(state: EditorState, view?: Snapshot['view']): Snapshot {
  return SnapshotSchema.parse({ fills: [...state.fills], selectedColor: state.selectedColor, undoStack: state.undoStack, redoStack: state.redoStack,
    paintRevision: state.paintRevision, localStateRevision: state.localStateRevision, ...(view ? { view } : {}) });
}
export function validateSnapshot(raw: unknown, regionCount: number): Snapshot {
  const snapshot = SnapshotSchema.parse(raw);
  const ids = snapshot.fills.map(([region]) => region);
  if (new Set(ids).size !== ids.length || ids.some(region => region > regionCount)) throw new Error('Invalid saved region.');
  for (const entry of [...snapshot.undoStack, ...snapshot.redoStack]) {
    if (entry.kind === 'fill' && entry.changes.length !== 1) throw new Error('Invalid fill command.');
    if (entry.changes.length > regionCount || (entry.kind === 'reset' && entry.changes.some(c => c.before === undefined || c.after !== undefined))) throw new Error('Invalid reset command.');
    if (new Set(entry.changes.map(c => c.regionId)).size !== entry.changes.length
        || entry.changes.some(c => c.regionId > regionCount || c.before === c.after)) throw new Error('Invalid saved history.');
  }
  // Undo/redo must describe the saved pixels, not merely contain valid shapes.
  const verify = (commands: Snapshot['undoStack'], direction: 'before' | 'after') => {
    const fills = new Map(snapshot.fills);
    for (const entry of [...commands].reverse()) for (const c of entry.changes) {
      if (fills.get(c.regionId) !== c[direction === 'before' ? 'after' : 'before']) throw new Error('Inconsistent saved history.');
      if (c[direction] === undefined) fills.delete(c.regionId); else fills.set(c.regionId, c[direction]!);
    }
  };
  verify(snapshot.undoStack, 'before'); verify(snapshot.redoStack, 'after');
  return snapshot;
}

export type Load = { kind: 'found'; record: SavedRecord } | { kind: 'missing' } | { kind: 'corrupt'; raw: unknown } | { kind: 'unavailable' };
export type Commit = { kind: 'saved'; revision: number } | { kind: 'conflict' } | { kind: 'unavailable' };
export interface Store {
  load(identity: Identity): Promise<Load>;
  commit(identity: Identity, expected: number | null, snapshot: Snapshot): Promise<Commit>;
}

export class ColoringStore implements Store {
  async preserveAndRemove(identity: Identity): Promise<boolean> {
    try {
      const db = await this.open();
      return await new Promise(resolve => {
        const tx = db.transaction(['colorings', 'recovery'], 'readwrite');
        const store = tx.objectStore('colorings'); const req = store.get(recordKey(identity));
        req.onsuccess = () => {
          if (req.result !== undefined) tx.objectStore('recovery').add({ key: recordKey(identity), raw: req.result });
          store.delete(recordKey(identity));
        };
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onabort = tx.onerror = () => { db.close(); resolve(false); };
      });
    } catch { return false; }
  }
  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open('fcc-kalamazoo-stained-glass', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.createObjectStore('colorings', { keyPath: 'key' });
        store.createIndex('artwork', ['namespace', 'artworkId']);
        db.createObjectStore('recovery', { autoIncrement: true });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new Error('Storage upgrade blocked.')); };
      request.onsuccess = () => { const db = request.result; if (blocked) { db.close(); return; } db.onversionchange = () => db.close(); resolve(db); };
    });
  }
  async load(identity: Identity): Promise<Load> {
    try {
      const db = await this.open();
      return await new Promise<Load>(resolve => {
        const tx = db.transaction('colorings'); const request = tx.objectStore('colorings').get(recordKey(identity));
        tx.oncomplete = () => {
          db.close(); const raw: unknown = request.result;
          if (raw === undefined) { resolve({ kind: 'missing' }); return; }
          const parsed = RecordSchema.safeParse(raw);
          resolve(parsed.success && parsed.data.key === recordKey(identity) && parsed.data.namespace === identity.namespace
            && parsed.data.artworkId === identity.artworkId && parsed.data.contentVersion === identity.contentVersion
            ? { kind: 'found', record: parsed.data } : { kind: 'corrupt', raw });
        };
        tx.onabort = tx.onerror = () => { db.close(); resolve({ kind: 'unavailable' }); };
      });
    } catch { return { kind: 'unavailable' }; }
  }
  async listSavedVersions(namespace: string, artworkId: string): Promise<string[]> {
    try {
      const db = await this.open();
      return await new Promise(resolve => {
        const tx = db.transaction('colorings');
        const req = tx.objectStore('colorings').index('artwork').getAll([namespace, artworkId]);
        tx.oncomplete = () => { db.close(); resolve(req.result.map((r: SavedRecord) => r.contentVersion)); };
        tx.onabort = tx.onerror = () => { db.close(); resolve([]); };
      });
    } catch { return []; }
  }
  async commit(identity: Identity, expected: number | null, snapshot: Snapshot): Promise<Commit> {
    try {
      const db = await this.open();
      return await new Promise<Commit>(resolve => {
        let result: Commit = { kind: 'unavailable' };
        const tx = db.transaction('colorings', 'readwrite'); const store = tx.objectStore('colorings');
        const get = store.get(recordKey(identity));
        get.onsuccess = () => {
          const current = get.result as SavedRecord | undefined;
          if ((current === undefined ? null : current.storedRevision) !== expected) { result = { kind: 'conflict' }; return; }
          const revision = (expected ?? 0) + 1;
          store.put({ ...identity, key: recordKey(identity), schemaVersion: 1, storedRevision: revision, snapshot });
          result = { kind: 'saved', revision };
        };
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onabort = tx.onerror = () => { db.close(); resolve({ kind: 'unavailable' }); };
      });
    } catch { return { kind: 'unavailable' }; }
  }
}

export type SaveStatus = 'loading' | 'saving' | 'saved' | 'unavailable' | 'conflict' | 'corrupt';
export class SaveSession {
  latest?: Snapshot;
  status: SaveStatus = 'loading';
  private expected: number | null | undefined;
  private pending?: Snapshot;
  private running?: Promise<void>;
  private listeners = new Set<() => void>();
  readonly loaded: Promise<void>;
  constructor(readonly identity: Identity, private readonly regionCount: number, private readonly store: Store) {
    this.loaded = this.initialize();
  }
  private async initialize(): Promise<void> {
    const result = await this.store.load(this.identity);
    if (result.kind === 'found') {
      try { this.latest = validateSnapshot(result.record.snapshot, this.regionCount); this.expected = result.record.storedRevision; this.status = 'saved'; }
      catch { this.status = 'corrupt'; }
    } else if (result.kind === 'missing') { this.expected = null; this.status = 'saved'; }
    else this.status = result.kind;
    this.notify();
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); listener(); return () => this.listeners.delete(listener); }
  private notify(): void { for (const listener of this.listeners) listener(); }
  save(snapshot: Snapshot): void {
    this.latest = structuredClone(snapshot);
    if (this.expected === undefined || ['conflict', 'corrupt', 'unavailable'].includes(this.status)) { this.notify(); return; }
    this.pending = this.latest; this.status = 'saving'; this.notify();
    if (!this.running) this.running = this.pump().finally(() => { this.running = undefined; });
  }
  private async pump(): Promise<void> {
    while (this.pending) {
      const next = this.pending; this.pending = undefined;
      const result = await this.store.commit(this.identity, this.expected!, next);
      if (result.kind !== 'saved') { this.status = result.kind; this.pending = undefined; this.notify(); return; }
      this.expected = result.revision;
    }
    this.status = 'saved'; this.notify();
  }
  async settled(): Promise<void> { await this.loaded; await this.running; }
}

// Application lifetime: navigating disposes workers, not queued writes or unsaved work.
export const coloringStore = new ColoringStore();
const sessions = new Map<string, SaveSession>();
export function openSaveSession(identity: Identity, regionCount: number): SaveSession {
  const key = recordKey(identity);
  let session = sessions.get(key);
  if (!session) { session = new SaveSession(identity, regionCount, coloringStore); sessions.set(key, session); }
  return session;
}
export async function listSavedVersions(namespace: string, artworkId: string): Promise<string[]> {
  const persisted = await coloringStore.listSavedVersions(namespace, artworkId);
  const cached = [...sessions.values()].filter(session => session.identity.namespace === namespace
    && session.identity.artworkId === artworkId && session.latest).map(session => session.identity.contentVersion);
  return [...new Set([...persisted, ...cached])];
}
