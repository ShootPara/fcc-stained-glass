import type { Viewport } from '../shared/coordinates.js';
import { outputPixelCenterToImage } from '../shared/coordinates.js';

function channel(value: string, offset: number): number {
  return Number.parseInt(value.slice(offset, offset + 2), 16);
}

export function isHexColor(value: string): value is `#${string}` {
  return /^#[0-9A-F]{6}$/u.test(value);
}

export function composeNative(
  paintLabels: Uint32Array,
  inkAlpha: Uint8Array,
  fills: ReadonlyMap<number, string>,
  width: number,
  height: number,
): Uint8ClampedArray {
  const count = width * height;
  if (paintLabels.length !== count || inkAlpha.length !== count) throw new Error('Region maps do not match the image dimensions.');
  const colors = new Map<number, readonly [number, number, number]>();
  for (const [id, value] of fills) {
    if (!Number.isInteger(id) || id <= 0 || !isHexColor(value)) continue;
    colors.set(id, [channel(value, 1), channel(value, 3), channel(value, 5)]);
  }
  const rgba = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i += 1) {
    const color = colors.get(paintLabels[i]!) ?? [255, 255, 255] as const;
    const factor = 255 - inkAlpha[i]!;
    const out = i * 4;
    rgba[out] = Math.round(color[0] * factor / 255);
    rgba[out + 1] = Math.round(color[1] * factor / 255);
    rgba[out + 2] = Math.round(color[2] * factor / 255);
    rgba[out + 3] = 255;
  }
  return rgba;
}

function sampleNearest(native: Uint8ClampedArray, width: number, height: number, x: number, y: number, out: Uint8ClampedArray, offset: number): void {
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
    out[offset] = 255; out[offset + 1] = 255; out[offset + 2] = 255; out[offset + 3] = 255;
    return;
  }
  const source = (sy * width + sx) * 4;
  out[offset] = native[source]!;
  out[offset + 1] = native[source + 1]!;
  out[offset + 2] = native[source + 2]!;
  out[offset + 3] = 255;
}

function sampleAverage(native: Uint8ClampedArray, width: number, height: number, centerX: number, centerY: number, spanX: number, spanY: number, out: Uint8ClampedArray, offset: number): void {
  const minX = Math.max(0, Math.floor(centerX - spanX / 2));
  const maxX = Math.min(width - 1, Math.ceil(centerX + spanX / 2) - 1);
  const minY = Math.max(0, Math.floor(centerY - spanY / 2));
  const maxY = Math.min(height - 1, Math.ceil(centerY + spanY / 2) - 1);
  if (maxX < minX || maxY < minY || centerX < -spanX || centerY < -spanY || centerX > width + spanX || centerY > height + spanY) {
    out[offset] = 255; out[offset + 1] = 255; out[offset + 2] = 255; out[offset + 3] = 255;
    return;
  }
  let r = 0; let g = 0; let b = 0; let count = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const source = (y * width + x) * 4;
      r += native[source]!; g += native[source + 1]!; b += native[source + 2]!; count += 1;
    }
  }
  if (count === 0) { sampleNearest(native, width, height, centerX, centerY, out, offset); return; }
  out[offset] = Math.round(r / count);
  out[offset + 1] = Math.round(g / count);
  out[offset + 2] = Math.round(b / count);
  out[offset + 3] = 255;
}

export function renderViewport(native: Uint8ClampedArray, width: number, height: number, viewport: Viewport): Uint8ClampedArray {
  const { pixelWidth, pixelHeight } = viewport;
  if (pixelWidth <= 0 || pixelHeight <= 0 || viewport.cssWidth <= 0 || viewport.cssHeight <= 0 || viewport.scale <= 0) {
    return new Uint8ClampedArray();
  }
  const out = new Uint8ClampedArray(pixelWidth * pixelHeight * 4);
  const spanX = viewport.cssWidth / pixelWidth / viewport.scale;
  const spanY = viewport.cssHeight / pixelHeight / viewport.scale;
  const average = spanX > 1 || spanY > 1;
  for (let py = 0; py < pixelHeight; py += 1) {
    for (let px = 0; px < pixelWidth; px += 1) {
      const image = outputPixelCenterToImage(viewport, px, py);
      const offset = (py * pixelWidth + px) * 4;
      if (average) sampleAverage(native, width, height, image.x, image.y, spanX, spanY, out, offset);
      else sampleNearest(native, width, height, image.x, image.y, out, offset);
    }
  }
  return out;
}
