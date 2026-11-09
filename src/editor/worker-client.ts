import { assetUrl } from '../config.js';
import type { PublicArtwork, PublicPreparedVersion } from '../shared/public-catalog.js';
import type { FrameResponse, ReadyResponse, RenderRequest, WorkerResponse } from '../shared/editor-protocol.js';
import type { Viewport } from '../shared/coordinates.js';
import type { HexColor } from './reducer.js';

let nextSessionId = 1;

interface RenderSpec {
  fills: readonly [number, HexColor][];
  viewport: Viewport;
  paintRevision: number;
  viewportRevision: number;
}

export class ColoringWorkerClient {
  readonly sessionId = nextSessionId++;
  private readonly worker: Worker;
  private requestId = 0;
  private disposed = false;
  private loadResolve: ((value: ReadyResponse) => void) | null = null;
  private loadReject: ((reason: Error) => void) | null = null;
  private inFlight: RenderSpec | null = null;
  private pending: RenderSpec | null = null;
  private desired: RenderSpec | null = null;
  private exports = new Map<number, { resolve: (value: ArrayBuffer) => void; reject: (error: Error) => void }>();

  constructor(
    private readonly artwork: PublicArtwork,
    private readonly prepared: PublicPreparedVersion,
    private readonly onFrame: (frame: FrameResponse) => void,
    private readonly onRenderError: (message: string) => void,
  ) {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = event => this.handleMessage(event.data as WorkerResponse);
    this.worker.onerror = () => {
      for (const job of this.exports.values()) job.reject(new Error('The coloring worker could not export the picture.'));
      this.exports.clear();
      if (this.loadReject) this.loadReject(new Error('The coloring worker could not start.'));
      this.loadResolve = null; this.loadReject = null;
      this.inFlight = null;
      this.onRenderError('The coloring tool stopped unexpectedly.');
    };
  }

  load(): Promise<ReadyResponse> {
    if (this.disposed) return Promise.reject(new Error('The coloring session has ended.'));
    if (!this.artwork.activeVersion) return Promise.reject(new Error('This drawing has no active prepared version.'));
    const requestId = ++this.requestId;
    const packageUrl = assetUrl(this.prepared.package.path);
    const accessibilityUrl = assetUrl(this.prepared.accessibility.path);
    return new Promise((resolve, reject) => {
      this.loadResolve = resolve;
      this.loadReject = reject;
      this.worker.postMessage({
        type: 'load', sessionId: this.sessionId, requestId,
        artworkId: this.artwork.id, contentVersion: this.prepared.contentVersion,
        packageUrl, packageReceipt: this.prepared.package,
        accessibilityUrl, accessibilityReceipt: this.prepared.accessibility,
      });
    });
  }

  requestRender(spec: RenderSpec): void {
    if (this.disposed) return;
    this.desired = spec;
    this.pending = spec;
    this.pump();
  }

  export(fills: readonly [number, HexColor][], paintRevision: number): Promise<ArrayBuffer> {
    if (this.disposed) return Promise.reject(new Error('The coloring session has ended.'));
    const requestId = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.exports.set(requestId, { resolve, reject });
      this.worker.postMessage({ type: 'export', sessionId: this.sessionId, requestId, artworkId: this.artwork.id,
        contentVersion: this.prepared.contentVersion, fills: structuredClone(fills), paintRevision });
    });
  }

  private pump(): void {
    if (this.disposed || this.inFlight || !this.pending) return;
    const spec = this.pending;
    this.pending = null;
    this.inFlight = spec;
    const request: RenderRequest = {
      type: 'render', sessionId: this.sessionId, requestId: ++this.requestId,
      artworkId: this.artwork.id, contentVersion: this.prepared.contentVersion,
      fills: spec.fills, viewport: spec.viewport,
      paintRevision: spec.paintRevision, viewportRevision: spec.viewportRevision,
    };
    this.worker.postMessage(request);
  }

  private matches(frame: FrameResponse, spec: RenderSpec | null): boolean {
    return Boolean(spec
      && frame.sessionId === this.sessionId
      && frame.artworkId === this.artwork.id
      && frame.contentVersion === this.prepared.contentVersion
      && frame.paintRevision === spec.paintRevision
      && frame.viewportRevision === spec.viewportRevision);
  }

  private handleMessage(message: WorkerResponse): void {
    if (this.disposed || message.sessionId !== this.sessionId || message.artworkId !== this.artwork.id || message.contentVersion !== this.prepared.contentVersion) return;
    if (message.type === 'ready') {
      const resolve = this.loadResolve;
      this.loadResolve = null; this.loadReject = null;
      resolve?.(message);
      return;
    }
    if (message.type === 'exported') {
      this.exports.get(message.requestId)?.resolve(message.png);
      this.exports.delete(message.requestId);
      return;
    }
    if (message.type === 'error') {
      if (message.operation === 'export') {
        this.exports.get(message.requestId)?.reject(new Error(message.message));
        this.exports.delete(message.requestId);
        return;
      }
      if (message.operation === 'load') {
        const reject = this.loadReject;
        this.loadResolve = null; this.loadReject = null;
        reject?.(new Error(message.message));
      } else {
        this.inFlight = null;
        this.onRenderError(message.message);
        this.pump();
      }
      return;
    }
    const wasInFlight = this.inFlight;
    this.inFlight = null;
    if (this.matches(message, wasInFlight) && this.matches(message, this.desired)) this.onFrame(message);
    this.pump();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = null; this.desired = null; this.inFlight = null;
    this.loadReject?.(new Error('The coloring session has ended.'));
    this.loadResolve = null; this.loadReject = null;
    this.worker.terminate();
    for (const job of this.exports.values()) job.reject(new Error('The coloring session has ended.'));
    this.exports.clear();
  }
}
