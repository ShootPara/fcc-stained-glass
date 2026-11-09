import sharp from 'sharp';
import { MAX_REGION_PIXELS } from '../../../src/shared/assets.js';
import { CliError } from '../cli.js';

export const NORMALIZATION_VERSION = 'gray-v1' as const;

export interface CanonicalImage {
  width: number;
  height: number;
  /** One opaque grayscale byte per pixel, in row-major order. */
  pixels: Uint8Array;
}

export function assertImageDimensions(width: number, height: number, label = 'Image'): number {
  const count = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
      || !Number.isSafeInteger(count) || count > MAX_REGION_PIXELS) {
    throw new CliError('E_DIMENSIONS', `${label} needs positive integer dimensions within ${MAX_REGION_PIXELS} pixels.`, 3);
  }
  return count;
}

export function assertCanonicalImage(image: CanonicalImage): number {
  if (!image || typeof image !== 'object') throw new CliError('E_CANONICAL_IMAGE', 'A canonical grayscale image is required.', 3);
  const count = assertImageDimensions(image.width, image.height, 'Canonical image');
  if (!(image.pixels instanceof Uint8Array) || image.pixels.length !== count) {
    throw new CliError('E_IMAGE_LENGTH', `Canonical grayscale needs exactly ${count} bytes.`, 3);
  }
  return count;
}

/** Integer-only gray-v1 normalization. No library flatten/grayscale operation
 * is applied before or after these exact channel calculations. */
export function normalizeRgba(width: number, height: number, rgba: Uint8Array): CanonicalImage {
  const count = assertImageDimensions(width, height, 'RGBA image');
  if (!(rgba instanceof Uint8Array) || rgba.length !== count * 4) {
    throw new CliError('E_IMAGE_LENGTH', `RGBA normalization needs exactly ${count * 4} bytes.`, 3);
  }
  const pixels = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const offset = i * 4;
    const alpha = rgba[offset + 3]!;
    const white = 255 * (255 - alpha) + 127;
    const red = Math.floor((rgba[offset]! * alpha + white) / 255);
    const green = Math.floor((rgba[offset + 1]! * alpha + white) / 255);
    const blue = Math.floor((rgba[offset + 2]! * alpha + white) / 255);
    pixels[i] = Math.floor((77 * red + 150 * green + 29 * blue + 128) / 256);
  }
  return { width, height, pixels };
}

function sharpInput(input: string | Uint8Array): string | Buffer {
  return typeof input === 'string' ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

/** Source orientation is consumed once; width and height come from the decoded
 * oriented pixels, not from the source's unrotated metadata. */
export async function decodeCanonical(input: string | Uint8Array): Promise<CanonicalImage> {
  try {
    const decoder = sharp(sharpInput(input), { failOn: 'error', limitInputPixels: MAX_REGION_PIXELS });
    const metadata = await decoder.metadata();
    if (metadata.format !== 'png') throw new CliError('E_NORMALIZE_FORMAT', 'The coloring source must be a PNG.', 3);
    if ((metadata.pages ?? 1) !== 1) throw new CliError('E_NORMALIZE_FORMAT', 'The coloring source must contain one image, not animation frames.', 3);
    const { data, info } = await decoder.autoOrient().toColourspace('srgb').ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw new CliError('E_IMAGE_CHANNELS', `Source normalization expected four RGBA channels, found ${info.channels}.`, 3);
    return normalizeRgba(info.width, info.height, data);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('E_NORMALIZE_DECODE', `Cannot decode the coloring PNG: ${error instanceof Error ? error.message : String(error)}`, 3);
  }
}

/** PNG is only a container: canonical identity is the decoded pixels. */
export async function encodeCanonical(image: CanonicalImage): Promise<Buffer> {
  assertCanonicalImage(image);
  return sharp(Buffer.from(image.pixels.buffer, image.pixels.byteOffset, image.pixels.byteLength), {
    raw: { width: image.width, height: image.height, channels: 1 },
  }).toColourspace('b-w').png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, progressive: false }).toBuffer();
}

/** Decode binary data without applying an ICC transform or accepting opacity
 * that could silently change its selected pixels. Opaque grayscale-alpha is
 * equivalent to grayscale; RGB/RGBA channels must agree pixel by pixel. */
export async function decodeBinaryMask(input: string | Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const count = assertImageDimensions(width, height, 'Mask');
  try {
    const decoder = sharp(sharpInput(input), { failOn: 'error', ignoreIcc: true, limitInputPixels: MAX_REGION_PIXELS });
    const metadata = await decoder.metadata();
    if (metadata.format !== 'png' || (metadata.pages ?? 1) !== 1) throw new CliError('E_MASK_FORMAT', 'A correction/domain mask must be a single PNG image.', 3);
    if (metadata.depth !== 'uchar') throw new CliError('E_MASK_DEPTH', 'A correction/domain mask must use 8-bit channels.', 3);
    if (metadata.width !== width || metadata.height !== height) {
      throw new CliError('E_MASK_DIMENSIONS', `Mask dimensions ${metadata.width}×${metadata.height} do not match canonical ${width}×${height}.`, 3);
    }
    if ((metadata.orientation ?? 1) !== 1) throw new CliError('E_MASK_ORIENTATION', 'Masks must be authored in canonical pixel orientation, without a rotation/mirroring tag.', 3);
    const grayscale = metadata.space === 'b-w';
    if ((!grayscale && metadata.space !== 'srgb' && metadata.space !== 'rgb')
        || (grayscale ? ![1, 2].includes(metadata.channels) : ![3, 4].includes(metadata.channels))) {
      throw new CliError('E_MASK_CHANNELS', 'A mask must be grayscale or RGB/RGBA with equal color channels.', 3);
    }
    // Keep alpha observable. Sharp's raw b-w output drops a grayscale-alpha
    // channel; expanding gray to equal RGB channels avoids that loss.
    const { data, info } = await decoder.toColourspace('srgb').raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    if (info.width !== width || info.height !== height || data.length !== count * channels
        || ![3, 4].includes(channels) || (metadata.hasAlpha && channels !== 4)) {
      throw new CliError('E_MASK_DECODE', 'The decoded mask has an unexpected shape or channel count.', 3);
    }
    const mask = new Uint8Array(count);
    const alphaChannel = channels === 4 ? 3 : -1;
    for (let i = 0; i < count; i += 1) {
      const offset = i * channels;
      const value = data[offset]!;
      if (data[offset + 1] !== value || data[offset + 2] !== value) {
        throw new CliError('E_MASK_CHANNELS', `Mask color channels differ at pixel ${i % width},${Math.floor(i / width)}.`, 3);
      }
      if (alphaChannel >= 0 && data[offset + alphaChannel] !== 255) {
        throw new CliError('E_MASK_ALPHA', `Mask alpha is not fully opaque at pixel ${i % width},${Math.floor(i / width)}.`, 3);
      }
      if (value !== 0 && value !== 255) throw new CliError('E_MASK_BINARY', `Mask value ${value} at pixel ${i % width},${Math.floor(i / width)} must be 0 or 255.`, 3);
      mask[i] = value;
    }
    return mask;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('E_MASK_DECODE', `Cannot decode the mask PNG: ${error instanceof Error ? error.message : String(error)}`, 3);
  }
}
