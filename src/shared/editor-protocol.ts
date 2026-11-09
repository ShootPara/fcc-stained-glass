import type { PublicFileReceipt } from './public-catalog.js';
import type { Viewport } from './coordinates.js';

export interface EditorEnvelope {
  sessionId: number;
  requestId: number;
  artworkId: string;
  contentVersion: string;
}

export interface RuntimeRegion {
  id: number;
  seed: readonly [number, number];
  pixelCount: number;
  bbox: { x: number; y: number; width: number; height: number };
  centroid: readonly [number, number];
  name: string;
  order: number;
}

export interface LoadRequest extends EditorEnvelope {
  type: 'load';
  packageUrl: string;
  packageReceipt: PublicFileReceipt;
  accessibilityUrl: string;
  accessibilityReceipt: PublicFileReceipt;
}

export interface RenderRequest extends EditorEnvelope {
  type: 'render';
  fills: readonly [number, string][];
  viewport: Viewport;
  paintRevision: number;
  viewportRevision: number;
}

export interface ExportRequest extends EditorEnvelope {
  type: 'export';
  fills: readonly [number, string][];
  paintRevision: number;
}
export interface ExportedResponse extends EditorEnvelope {
  type: 'exported';
  png: ArrayBuffer;
  paintRevision: number;
}
export type WorkerRequest = LoadRequest | RenderRequest | ExportRequest;

export interface ReadyResponse extends EditorEnvelope {
  type: 'ready';
  width: number;
  height: number;
  regionCount: number;
  regions: RuntimeRegion[];
  hitLabels: ArrayBuffer;
}

export interface FrameResponse extends EditorEnvelope {
  type: 'frame';
  rgba: ArrayBuffer;
  pixelWidth: number;
  pixelHeight: number;
  paintRevision: number;
  viewportRevision: number;
}

export interface ErrorResponse extends EditorEnvelope {
  type: 'error';
  operation: 'load' | 'render' | 'export';
  errorCode: string;
  message: string;
}

export type WorkerResponse = ReadyResponse | FrameResponse | ExportedResponse | ErrorResponse;
