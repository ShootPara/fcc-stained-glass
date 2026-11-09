import { describe, expect, it } from 'vitest';
import { decode } from 'fast-png';
import { exportColoring } from '../../src/editor/export.js';

describe('native colored PNG', () => {
  it('exports full extent with opaque alpha, antialiased ink and white background', () => {
    const image = decode(exportColoring(new Uint32Array([1, 0, 1, 2]), new Uint8Array([0, 0, 128, 255]), [[1, '#D32F2F']], 2, 2));
    expect([image.width, image.height, image.channels]).toEqual([2, 2, 4]);
    expect([...image.data]).toEqual([211,47,47,255, 255,255,255,255, 105,23,23,255, 0,0,0,255]);
  });
  it('does not mutate maps or depend on a viewport, photo, or canvas', () => {
    const paint = new Uint32Array([1]); const ink = new Uint8Array([0]);
    const first = exportColoring(paint, ink, [[1, '#1976D2']], 1, 1);
    exportColoring(paint, ink, [[1, '#FFFFFF']], 1, 1);
    expect([...decode(first).data]).toEqual([25,118,210,255]);
    expect([...paint]).toEqual([1]); expect([...ink]).toEqual([0]);
  });
});
