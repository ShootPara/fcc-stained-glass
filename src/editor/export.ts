import { encode } from 'fast-png';
import { composeNative } from './compositor.js';

/** Native pixels only: never a display canvas, photo, selection, or viewport crop. */
export function exportColoring(paint: Uint32Array, ink: Uint8Array, fills: readonly [number, string][], width: number, height: number): Uint8Array {
  const data = composeNative(paint, ink, new Map(fills), width, height);
  return encode({ width, height, channels: 4, depth: 8, data });
}
