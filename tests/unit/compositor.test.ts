import { describe, expect, it } from 'vitest';
import { composeNative, renderViewport } from '../../src/editor/compositor.js';
import { createFitViewport } from '../../src/shared/coordinates.js';

describe('browser compositor', () => {
  it('renders blank pixels as grayscale from ink alpha', () => {
    const rgba = composeNative(new Uint32Array([0, 1, 1]), new Uint8Array([0, 128, 255]), new Map(), 3, 1);
    expect([...rgba]).toEqual([255,255,255,255,127,127,127,255,0,0,0,255]);
  });

  it('puts selected color beneath antialiased ink', () => {
    const rgba = composeNative(new Uint32Array([1]), new Uint8Array([128]), new Map([[1, '#D32F2F']]), 1, 1);
    // WP03 specifies Math.round(channel * (255 - inkAlpha) / 255) per channel.
    // 47 * 127 / 255 is 23.4…, so the green and blue channels round to 23.
    expect([...rgba]).toEqual([105,23,23,255]);
  });

  it('keeps explicit white distinct from no assignment while producing the same pixel', () => {
    const labels = new Uint32Array([1]); const ink = new Uint8Array([0]);
    expect([...composeNative(labels, ink, new Map([[1, '#FFFFFF']]), 1, 1)]).toEqual([...composeNative(labels, ink, new Map(), 1, 1)]);
  });

  it('renders viewport-sized opaque RGBA', () => {
    const native = new Uint8ClampedArray([255,0,0,255, 0,0,255,255, 0,255,0,255, 255,255,255,255]);
    const viewport = createFitViewport(2, 2, 2, 2, 2);
    const frame = renderViewport(native, 2, 2, viewport);
    expect(frame).toHaveLength(4 * 4 * 4);
    for (let i = 3; i < frame.length; i += 4) expect(frame[i]).toBe(255);
  });
});
