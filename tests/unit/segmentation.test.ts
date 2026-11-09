import { describe, expect, test } from 'vitest';
import { compositeRgba, normalizeExcludedSeedPoints, segmentRegions, type RgbColor } from '../../scripts/lib/algorithms/regions-v1.js';
import { fixtures, grayFixture, maskFixture } from '../fixtures/segmentation.js';

const options = { inkThreshold: 180, excludedSeedPoints: [] };

describe('four-connected hit regions', () => {
  test('diagonal touching pixels are separate regions with row-major IDs', () => {
    const result = segmentRegions(fixtures.diagonal(), options);
    expect([...result.hitLabels]).toEqual([1, 0, 0, 2]);
    expect(result.regions).toEqual([
      { id: 1, seed: [0, 0], pixelCount: 1, bbox: { x: 0, y: 0, width: 1, height: 1 }, centroid: [0.5, 0.5] },
      { id: 2, seed: [1, 1], pixelCount: 1, bbox: { x: 1, y: 1, width: 1, height: 1 }, centroid: [1.5, 1.5] },
    ]);
  });

  test('a tracked one-pixel correction closes a leak without changing visible linework', () => {
    const image = fixtures.onePixelGap();
    const before = image.pixels.slice();
    expect(segmentRegions(image, options).regions).toHaveLength(1);
    const add = new Uint8Array(image.pixels.length);
    add[2 * image.width + 3] = 255;
    const result = segmentRegions(image, { ...options, barrierAddMask: add });
    expect(result.regions.map(region => region.pixelCount)).toEqual([6, 6]);
    expect(result.regions.map(region => region.seed)).toEqual([[1, 1], [4, 1]]);
    expect(result.hitLabels[2 * image.width + 3]).toBe(0);
    expect(result.inkAlpha[2 * image.width + 3]).toBe(0);
    expect(image.pixels).toEqual(before);
  });

  test('a remove mask changes segmentation while the original black pixel stays black', () => {
    const image = grayFixture(['#####', '#.#.#', '#####']);
    expect(segmentRegions(image, options).regions).toHaveLength(2);
    const remove = new Uint8Array(image.pixels.length);
    remove[7] = 255;
    const result = segmentRegions(image, { ...options, barrierRemoveMask: remove });
    expect(result.regions).toHaveLength(1);
    expect(result.hitLabels[7]).toBe(1);
    expect(result.inkAlpha[7]).toBe(255);
    expect([...compositeRgba(image.width, image.height, result.paintLabels, result.inkAlpha, new Map([[1, [255, 0, 0] as RgbColor]])).slice(7 * 4, 7 * 4 + 4)]).toEqual([0, 0, 0, 255]);
  });

  test('single-pixel panes and edge-touching components remain available', () => {
    expect(segmentRegions(fixtures.smallPane(), options).regions.map(region => region.pixelCount)).toEqual([1, 3]);
    const frame = segmentRegions(fixtures.framedPane(), options);
    expect(frame.regions).toHaveLength(2);
    expect(frame.hitLabels[0]).toBe(1);
  });

  test('explicit background exclusion renumbers only retained components', () => {
    const image = fixtures.framedPane();
    const result = segmentRegions(image, { ...options, excludedSeedPoints: [[6, 4], [0, 0], [6, 4]] });
    expect(result.regions).toEqual([{ id: 1, seed: [2, 2], pixelCount: 3, bbox: { x: 2, y: 2, width: 3, height: 1 }, centroid: [3.5, 2.5] }]);
    expect(result.hitLabels[0]).toBe(0);
    expect(result.hitLabels[2 * image.width + 2]).toBe(1);
    expect(result.excludedSeedPoints).toEqual([[0, 0], [6, 4]]);
    expect(result.excludedMask[0]).toBe(255);
    expect(result.excludedMask[2 * image.width + 2]).toBe(0);
  });

  test('domain is applied before labeling, so disconnected remnants get separate IDs', () => {
    const image = grayFixture(['.....', '.....', '.....']);
    const result = segmentRegions(image, { ...options, domainMask: maskFixture(['XX.XX', 'XX.XX', 'XX.XX']) });
    expect(result.regions.map(region => region.pixelCount)).toEqual([6, 6]);
    expect([...result.hitLabels]).toEqual([1, 1, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0, 2, 2]);
  });

  test('a domain mask preserves the intended pane while excluding caption and exterior', () => {
    const image = fixtures.captionAndExterior();
    expect(segmentRegions(image, options).regions).toHaveLength(4);
    const domain = maskFixture([
      '.............', '.XXXXXXXXXXX.', '.XXXXXXXXXXX.', '.XXXXXXXXXXX.', '.XXXXXXXXXXX.',
      '.............', '.............', '.............', '.............', '.............',
    ]);
    const result = segmentRegions(image, { ...options, domainMask: domain });
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]).toMatchObject({ id: 1, seed: [2, 2], pixelCount: 18 });
    for (let i = 0; i < domain.length; i += 1) {
      if (domain[i] === 0) {
        expect(result.hitLabels[i]).toBe(0);
        expect(result.paintLabels[i]).toBe(0);
      }
    }
    expect(result.hitLabels[7 * image.width + 4]).toBe(0);
    expect(result.hitLabels[7 * image.width + 8]).toBe(0);
  });

  test('geometry uses inclusive minimum/exclusive maximum bounds and pixel-center centroids', () => {
    const result = segmentRegions(grayFixture(['..#', '.##', '###']), options);
    expect(result.regions[0]).toEqual({ id: 1, seed: [0, 0], pixelCount: 3, bbox: { x: 0, y: 0, width: 2, height: 2 }, centroid: [5 / 6, 5 / 6] });
  });

  test('effective masks and maps are deterministic and do not alias caller inputs', () => {
    const image = fixtures.onePixelGap();
    const domain = new Uint8Array(image.pixels.length).fill(255);
    const add = new Uint8Array(image.pixels.length);
    add[17] = 255;
    const sourceBefore = image.pixels.slice();
    const first = segmentRegions(image, { ...options, domainMask: domain, barrierAddMask: add });
    const second = segmentRegions(image, { ...options, domainMask: domain, barrierAddMask: add });
    expect(first).toEqual(second);
    expect(image.pixels).toEqual(sourceBefore);
    expect(first.domainMask).not.toBe(domain);
    expect(first.barrierAddMask).not.toBe(add);
    first.domainMask[0] = 0;
    expect(domain[0]).toBe(255);
  });
});

describe('deterministic paint ownership and compositing', () => {
  test('ownership ties use global pixel seed order, not the region ID', () => {
    const image = grayFixture(['.#.##', '.####', '...##']);
    const result = segmentRegions(image, options);
    expect(result.regions.map(region => region.seed)).toEqual([[0, 0], [2, 0]]);
    // The upper seed of region2 precedes the equally near lower seed of region1.
    expect(result.paintLabels[1 * image.width + 2]).toBe(2);
    expect(result.hitLabels[1 * image.width + 2]).toBe(0);
  });

  test('excluded zero-owned background participates in nearest-seed ties', () => {
    const image = grayFixture(['.a.'], { a: 100 });
    const leftExcluded = segmentRegions(image, { ...options, excludedSeedPoints: [[0, 0]] });
    expect([...leftExcluded.hitLabels]).toEqual([0, 0, 1]);
    expect([...leftExcluded.paintLabels]).toEqual([0, 0, 1]);
    const rightExcluded = segmentRegions(image, { ...options, excludedSeedPoints: [[2, 0]] });
    expect([...rightExcluded.paintLabels]).toEqual([1, 1, 0]);
  });

  test('fills extend beneath antialiased ink, black stays black, and no white halo is introduced', () => {
    const image = fixtures.antialiasedBoundary();
    const result = segmentRegions(image, options);
    expect([...result.hitLabels]).toEqual([1, 1, 0, 0, 0, 2, 2]);
    expect([...result.paintLabels]).toEqual([1, 1, 1, 1, 2, 2, 2]);
    const colors = new Map<number, RgbColor>([[1, [200, 80, 20]], [2, [40, 160, 220]]]);
    const rgba = compositeRgba(image.width, image.height, result.paintLabels, result.inkAlpha, colors);
    expect([...rgba.slice(8, 12)]).toEqual([75, 30, 8, 255]);
    expect([...rgba.slice(12, 16)]).toEqual([0, 0, 0, 255]);
    expect([...rgba.slice(16, 20)]).toEqual([15, 60, 83, 255]);
    for (let i = 0; i < image.pixels.length; i += 1) expect(rgba[i * 4 + 3]).toBe(255);
  });

  test('an unfilled render reproduces all grayscale values, including owner zero', () => {
    const labels = Uint32Array.from({ length: 256 }, (_, i) => i % 2);
    const ink = Uint8Array.from({ length: 256 }, (_, i) => 255 - i);
    const rgba = compositeRgba(16, 16, labels, ink);
    for (let i = 0; i < 256; i += 1) expect([...rgba.slice(i * 4, i * 4 + 4)]).toEqual([i, i, i, 255]);
  });

  test('all synthetic blank renders match their canonical pixel bytes', () => {
    for (const makeFixture of Object.values(fixtures)) {
      const image = makeFixture();
      const result = segmentRegions(image, options);
      const rgba = compositeRgba(image.width, image.height, result.paintLabels, result.inkAlpha);
      expect([...rgba]).toEqual([...image.pixels].flatMap(gray => [gray, gray, gray, 255]));
    }
  });
});

describe('invalid inputs give specific diagnostics', () => {
  test.each([-1, 256, 1.5, NaN])('rejects invalid threshold %s', inkThreshold => {
    expect(() => segmentRegions(grayFixture(['.']), { ...options, inkThreshold })).toThrow(/inkThreshold/);
  });

  test('threshold includes pixels equal to its value', () => {
    const image = grayFixture(['a.'], { a: 180 });
    expect([...segmentRegions(image, options).barrier]).toEqual([255, 0]);
  });

  test('rejects wrong-size/nonbinary masks and overlapping corrections', () => {
    const image = grayFixture(['..']);
    expect(() => segmentRegions(image, { ...options, domainMask: new Uint8Array(1) })).toThrow(/exactly 2/);
    expect(() => segmentRegions(image, { ...options, barrierAddMask: Uint8Array.from([0, 1]) })).toThrow(/nonbinary/);
    expect(() => segmentRegions(image, { ...options, barrierAddMask: Uint8Array.from([255, 0]), barrierRemoveMask: Uint8Array.from([255, 0]) })).toThrow(/both select pixel 0,0/);
  });

  test.each([[-1, 0], [2, 0], [0, 1], [0.5, 0], [Infinity, 0], [0, NaN]])('rejects invalid exclusion coordinate %s,%s', (x, y) => {
    expect(() => normalizeExcludedSeedPoints([[x, y]], 2, 1)).toThrow(/integer coordinates/);
  });

  test('rejects seeds on ink or outside the allowed domain', () => {
    const image = grayFixture(['.#.']);
    expect(() => segmentRegions(image, { ...options, excludedSeedPoints: [[1, 0]] })).toThrow(/allowed nonbarrier/);
    expect(() => segmentRegions(image, { ...options, domainMask: Uint8Array.from([0, 255, 255]), excludedSeedPoints: [[0, 0]] })).toThrow(/allowed nonbarrier/);
  });

  test('rejects a result with no positive regions', () => {
    expect(() => segmentRegions(grayFixture(['###']), options)).toThrow(/no fillable regions/);
    expect(() => segmentRegions(grayFixture(['...']), { ...options, excludedSeedPoints: [[0, 0]] })).toThrow(/no fillable regions/);
  });

  test('rejects malformed compositor buffers, out-of-range owners and invalid colors', () => {
    expect(() => compositeRgba(2, 1, new Uint32Array(1), new Uint8Array(2))).toThrow(/exactly 2/);
    expect(() => compositeRgba(1, 1, Uint32Array.from([2]), new Uint8Array(1))).toThrow(/region range/);
    expect(() => compositeRgba(1, 1, Uint32Array.from([1]), new Uint8Array(1), new Map([[1, [256, 0, 0]]]))).toThrow(/RGB channels/);
    expect(() => compositeRgba(1, 1, Uint32Array.from([0]), new Uint8Array(1), new Map([[0, [255, 0, 0]]]))).toThrow(/positive region IDs/);
  });
});
