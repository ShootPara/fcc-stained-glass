/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from '../shared/editor-protocol.js';
import { composeNative, renderViewport } from './compositor.js';
import { loadRegionPackage } from './package-loader.js';
import { exportColoring } from './export.js';

declare const self: DedicatedWorkerGlobalScope;

let active: Awaited<ReturnType<typeof loadRegionPackage>> | null = null;
let sessionId = -1;
let artworkId = '';
let contentVersion = '';
let nativeCache: { paintRevision: number; rgba: Uint8ClampedArray } | null = null;

function respond(message: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}

function errorFor(request: WorkerRequest, operation: 'load' | 'render' | 'export', error: unknown): void {
  respond({
    type: 'error', sessionId: request.sessionId, requestId: request.requestId,
    artworkId: request.artworkId, contentVersion: request.contentVersion,
    operation, errorCode: operation === 'load' ? 'PACKAGE_LOAD_FAILED' : 'RENDER_FAILED',
    message: error instanceof Error ? error.message : 'The coloring tool could not complete this request.',
  });
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'load') {
    void (async () => {
      try {
        const loaded = await loadRegionPackage(request);
        active = loaded; sessionId = request.sessionId; artworkId = request.artworkId; contentVersion = request.contentVersion; nativeCache = null;
        const hitBuffer = loaded.hitLabels.buffer as ArrayBuffer;
        respond({
          type: 'ready', sessionId, requestId: request.requestId, artworkId, contentVersion,
          width: loaded.packageData.width, height: loaded.packageData.height, regionCount: loaded.packageData.regionCount,
          regions: loaded.regions, hitLabels: hitBuffer,
        }, [hitBuffer]);
      } catch (error) { errorFor(request, 'load', error); }
    })();
    return;
  }
  if (request.sessionId !== sessionId || request.artworkId !== artworkId || request.contentVersion !== contentVersion || !active) {
    errorFor(request, request.type, new Error('The coloring session is no longer active.'));
    return;
  }
  if (request.type === 'export') {
    try {
      const png = exportColoring(active.paintLabels, active.inkAlpha, request.fills, active.packageData.width, active.packageData.height);
      const buffer = Uint8Array.from(png).buffer;
      respond({ type: 'exported', sessionId, artworkId, contentVersion, requestId: request.requestId, paintRevision: request.paintRevision, png: buffer }, [buffer]);
    } catch (error) { errorFor(request, 'export', error); }
    return;
  }
  try {
    if (!nativeCache || nativeCache.paintRevision !== request.paintRevision) {
      nativeCache = {
        paintRevision: request.paintRevision,
        rgba: composeNative(active.paintLabels, active.inkAlpha, new Map(request.fills), active.packageData.width, active.packageData.height),
      };
    }
    const rgba = renderViewport(nativeCache.rgba, active.packageData.width, active.packageData.height, request.viewport);
    const buffer = rgba.buffer as ArrayBuffer;
    respond({
      type: 'frame', sessionId, requestId: request.requestId, artworkId, contentVersion,
      rgba: buffer, pixelWidth: request.viewport.pixelWidth, pixelHeight: request.viewport.pixelHeight,
      paintRevision: request.paintRevision, viewportRevision: request.viewportRevision,
    }, [buffer]);
  } catch (error) { errorFor(request, 'render', error); }
};
