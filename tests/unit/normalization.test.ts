import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { MAX_REGION_PIXELS } from '../../src/shared/assets.js';
import { decodeBinaryMask, decodeCanonical, encodeCanonical, normalizeRgba } from '../../scripts/lib/algorithms/gray-v1.js';

async function png(data: number[], width: number, height: number, channels: 1 | 2 | 3 | 4): Promise<Buffer> {
  const image = sharp(Buffer.from(data), { raw: { width, height, channels } });
  return (channels <= 2 ? image.toColourspace('b-w') : image).png({ palette: false }).toBuffer();
}

describe('gray-v1 normalization', () => {
  test('preserves all 256 opaque grayscale values exactly', () => {
    const rgba = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i += 1) rgba.set([i, i, i, 255], i * 4);
    const before = rgba.slice();
    const image = normalizeRgba(16, 16, rgba);
    expect(image.pixels).toEqual(Uint8Array.from({ length: 256 }, (_, i) => i));
    expect(rgba).toEqual(before);
  });

  test('uses the specified integer alpha flatten and grayscale rounding', () => {
    const rgba = Uint8Array.from([
      0, 0, 0, 0,
      0, 0, 0, 1,
      0, 0, 0, 127,
      0, 0, 0, 128,
      1, 1, 1, 128,
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 0, 0, 128,
      255, 255, 255, 40,
    ]);
    expect([...normalizeRgba(10, 1, rgba).pixels]).toEqual([255, 254, 128, 127, 128, 77, 149, 29, 166, 255]);
  });

  test('rejects invalid dimensions and wrong pixel byte counts before allocation', () => {
    for (const [width, height] of [[0, 1], [2, -1], [1.5, 1], [MAX_REGION_PIXELS + 1, 1], [Number.MAX_SAFE_INTEGER, 2]]) {
      expect(() => normalizeRgba(width!, height!, new Uint8Array())).toThrow(/positive integer dimensions/);
    }
    expect(() => normalizeRgba(2, 2, new Uint8Array(15))).toThrow('exactly 16 bytes');
  });

  test('decodes RGB/alpha to the exact formula without changing source bytes', async () => {
    const input = await png([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 128], 4, 1, 4);
    const before = Buffer.from(input);
    const image = await decodeCanonical(input);
    expect(image).toEqual({ width: 4, height: 1, pixels: Uint8Array.from([77, 149, 29, 127]) });
    expect(input).toEqual(before);
  });

  test('uses an exact typed-array byte view, excluding unrelated surrounding bytes', async () => {
    const input = await png([0, 127, 255], 3, 1, 1);
    const wrapper = new Uint8Array(input.length + 12).fill(123);
    wrapper.set(input, 5);
    expect([...(await decodeCanonical(wrapper.subarray(5, 5 + input.length))).pixels]).toEqual([0, 127, 255]);
  });

  test('consumes orientation once and reports the oriented native dimensions', async () => {
    const rgb = [10, 20, 30, 40, 50, 60].flatMap(value => [value, value, value]);
    const input = await sharp(Buffer.from(rgb), { raw: { width: 2, height: 3, channels: 3 } }).withMetadata({ orientation: 6 }).png().toBuffer();
    const result = await decodeCanonical(input);
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
    expect([...result.pixels]).toEqual([50, 30, 10, 60, 40, 20]);
    const canonical = await encodeCanonical(result);
    expect(await decodeCanonical(canonical)).toEqual(result);
    expect((await sharp(canonical).metadata()).orientation).toBeUndefined();
  });

  test('encodes opaque single-channel PNG without changing any grayscale value', async () => {
    const image = { width: 16, height: 16, pixels: Uint8Array.from({ length: 256 }, (_, i) => i) };
    const first = await encodeCanonical(image);
    const second = await encodeCanonical(image);
    const metadata = await sharp(first).metadata();
    expect(metadata).toMatchObject({ format: 'png', width: 16, height: 16, channels: 1, depth: 'uchar', hasAlpha: false, bitsPerSample: 8 });
    expect(first).toEqual(second);
    expect(await decodeCanonical(first)).toEqual(image);
  });

  test('rejects a non-PNG source and corrupt image data with useful codes', async () => {
    const jpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).jpeg().toBuffer();
    await expect(decodeCanonical(jpeg)).rejects.toMatchObject({ code: 'E_NORMALIZE_FORMAT' });
    await expect(decodeCanonical(Uint8Array.from([1, 2, 3]))).rejects.toMatchObject({ code: 'E_NORMALIZE_DECODE' });
  });
});

describe('binary correction-mask decoding', () => {
  test.each([1, 2, 3, 4] as const)('accepts exact binary pixels with %i channel(s) and opaque alpha', async channels => {
    const data = [0, 255, 0].flatMap(value => channels === 1 ? [value] : channels === 2 ? [value, 255] : channels === 3 ? [value, value, value] : [value, value, value, 255]);
    const input = await png(data, 3, 1, channels);
    expect(await decodeBinaryMask(input, 3, 1)).toEqual(Uint8Array.from([0, 255, 0]));
  });

  test('rejects intermediate grays, unequal RGB channels and partial transparency', async () => {
    await expect(decodeBinaryMask(await png([127], 1, 1, 1), 1, 1)).rejects.toMatchObject({ code: 'E_MASK_BINARY' });
    await expect(decodeBinaryMask(await png([0, 0, 255], 1, 1, 3), 1, 1)).rejects.toMatchObject({ code: 'E_MASK_CHANNELS' });
    await expect(decodeBinaryMask(await png([255, 255, 255, 254], 1, 1, 4), 1, 1)).rejects.toMatchObject({ code: 'E_MASK_ALPHA' });
    await expect(decodeBinaryMask(await png([0, 0], 1, 1, 2), 1, 1)).rejects.toMatchObject({ code: 'E_MASK_ALPHA' });
  });

  test('rejects mismatched dimensions and sixteen-bit channels', async () => {
    await expect(decodeBinaryMask(await png([0, 255], 2, 1, 1), 1, 2)).rejects.toMatchObject({ code: 'E_MASK_DIMENSIONS' });
    const sixteen = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).toColourspace('rgb16').png().toBuffer();
    expect((await sharp(sixteen).metadata()).depth).toBe('ushort');
    await expect(decodeBinaryMask(sixteen, 1, 1)).rejects.toMatchObject({ code: 'E_MASK_DEPTH' });
  });

  test('rejects orientation tags so mask coordinates cannot silently rotate', async () => {
    const rotated = await sharp(Buffer.from([0, 0, 0, 255, 255, 255]), { raw: { width: 2, height: 1, channels: 3 } }).withMetadata({ orientation: 6 }).png().toBuffer();
    await expect(decodeBinaryMask(rotated, 2, 1)).rejects.toMatchObject({ code: 'E_MASK_ORIENTATION' });
  });

  test('decodes equal pixels identically despite PNG encoding/metadata differences', async () => {
    const binary = Buffer.from([0, 255, 255, 0]);
    const plain = await sharp(binary, { raw: { width: 2, height: 2, channels: 1 } }).toColourspace('b-w').png({ compressionLevel: 0 }).toBuffer();
    const alternate = await sharp(binary, { raw: { width: 2, height: 2, channels: 1 } }).toColourspace('b-w').withMetadata({ density: 144 }).png({ compressionLevel: 9 }).toBuffer();
    expect(plain.equals(alternate)).toBe(false);
    expect(await decodeBinaryMask(plain, 2, 2)).toEqual(await decodeBinaryMask(alternate, 2, 2));
  });
});
