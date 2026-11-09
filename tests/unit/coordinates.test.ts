import { describe, expect, it } from 'vitest';
import { clientPointToImage, createFitViewport, outputPixelCenterToImage, panViewport, relativeZoom, resizeViewport, zoomViewportAt } from '../../src/shared/coordinates.js';

describe('editor coordinates', () => {
  it('fits and centers an image', () => {
    const v = createFitViewport(320, 480, 1024, 1536, 2);
    expect(v.scale).toBeCloseTo(0.3125);
    expect(v.translateX).toBeCloseTo(0);
    expect(v.translateY).toBeCloseTo(0);
    expect(v.pixelWidth).toBe(640);
    expect(v.pixelHeight).toBe(960);
  });

  it('maps client points independent of DPR and page offset', () => {
    const v = createFitViewport(320, 480, 1024, 1536, 2);
    expect(clientPointToImage(v, 170, 260, 10, 20, 1024, 1536)).toEqual({ x: 512, y: 768 });
    expect(clientPointToImage(v, 9, 20, 10, 20, 1024, 1536)).toBeNull();
  });

  it('preserves the anchor while zooming', () => {
    const initial = createFitViewport(400, 500, 1000, 1000, 1);
    const before = clientPointToImage(initial, 200, 250, 0, 0, 1000, 1000);
    const zoomed = zoomViewportAt(initial, 1000, 1000, 4, 200, 250);
    const after = clientPointToImage(zoomed, 200, 250, 0, 0, 1000, 1000);
    expect(before).toEqual(after);
    expect(relativeZoom(zoomed, 1000, 1000)).toBeCloseTo(4);
  });

  it('clamps pan and preserves relative zoom on resize', () => {
    let v = createFitViewport(300, 400, 1000, 1000, 1);
    v = zoomViewportAt(v, 1000, 1000, 2, 150, 200);
    v = panViewport(v, 1000, 1000, 10000, -10000);
    expect(v.translateX).toBeLessThanOrEqual(0);
    expect(v.translateY).toBeLessThanOrEqual(0);
    const resized = resizeViewport(v, 1000, 1000, 360, 640, 2);
    expect(relativeZoom(resized, 1000, 1000)).toBeCloseTo(2);
  });

  it('maps output pixel centers through the same inverse transform', () => {
    const v = createFitViewport(100, 100, 100, 100, 1);
    expect(outputPixelCenterToImage(v, 49, 49)).toEqual({ x: 49.5, y: 49.5 });
  });
});
