import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { RegionGeometry } from '../../src/shared/assets.js';
import type { CanonicalImage } from './algorithms/gray-v1.js';
import { compositeRgba } from './algorithms/regions-v1.js';
import type { SegmentationResult } from './region-package.js';
import { jsonBytes } from './digests.js';
import { assertSafeProjectPath } from './paths.js';

type Rgb = [number, number, number];

function colorFor(id: number): Rgb {
  const hue = (id * 0.618033988749895) % 1;
  const saturation = 0.72;
  const lightness = 0.58;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const k = (offset + hue * 12) % 12;
    return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)];
}

// Fixed bitmap numerals avoid a system-font dependency in review regeneration.
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
};

function labelPositions(width: number, labels: Uint32Array, regions: RegionGeometry[]): Array<[number, number]> {
  const positions: Array<[number, number]> = [[0, 0], ...regions.map(region => [...region.seed] as [number, number])];
  const distances = new Float64Array(regions.length + 1).fill(Infinity);
  for (let index = 0; index < labels.length; index += 1) {
    const id = labels[index]!;
    if (id === 0) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const centroid = regions[id - 1]!.centroid;
    const distance = (x + 0.5 - centroid[0]) ** 2 + (y + 0.5 - centroid[1]) ** 2;
    if (distance < distances[id]!) { distances[id] = distance; positions[id] = [x, y]; }
  }
  return positions;
}

function drawNumber(pixels: Uint8Array, width: number, height: number, text: string, centerX: number, centerY: number): void {
  const scale = 2;
  const boxWidth = (text.length * 4 - 1) * scale + 4;
  const boxHeight = 5 * scale + 4;
  const left = Math.max(0, Math.min(width - boxWidth, Math.round(centerX - boxWidth / 2)));
  const top = Math.max(0, Math.min(height - boxHeight, Math.round(centerY - boxHeight / 2)));
  const set = (x: number, y: number, value: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width + x) * 4;
    pixels[index] = value; pixels[index + 1] = value; pixels[index + 2] = value; pixels[index + 3] = 255;
  };
  for (let y = 0; y < boxHeight; y += 1) {
    for (let x = 0; x < boxWidth; x += 1) set(left + x, top + y, x === 0 || y === 0 || x === boxWidth - 1 || y === boxHeight - 1 ? 30 : 255);
  }
  for (const [digitIndex, digit] of [...text].entries()) {
    const glyph = DIGITS[digit]!;
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 3; x += 1) if (glyph[y]![x] === '1') {
      for (let dy = 0; dy < scale; dy += 1) for (let dx = 0; dx < scale; dx += 1) {
        set(left + 2 + digitIndex * 4 * scale + x * scale + dx, top + 2 + y * scale + dy, 0);
      }
    }
  }
}

function rgbaPng(bytes: Uint8Array, width: number, height: number): Promise<Buffer> {
  return sharp(bytes, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

/** Reproducible inspection aids; this function never authors a review receipt. */
export async function writeReviewImages(
  root: string, artworkId: string, contentVersion: string,
  image: CanonicalImage, segmentation: SegmentationResult,
): Promise<{ directory: string; files: string[] }> {
  const directory = `.work/review/${artworkId}/${contentVersion}`;
  const absolute = await assertSafeProjectPath(directory, root, { allowMissing: true });
  await mkdir(absolute, { recursive: true });
  const files: string[] = [];
  const save = async (name: string, bytes: Uint8Array) => {
    const relativePath = `${directory}/${name}`;
    await writeFile(await assertSafeProjectPath(relativePath, root, { allowMissing: true }), bytes);
    files.push(relativePath);
  };
  const colors = new Map<number, Rgb>(segmentation.regions.map(region => [region.id, colorFor(region.id)]));
  const colored = compositeRgba(image.width, image.height, segmentation.paintLabels, segmentation.inkAlpha, colors);
  await save('regions-colored.png', await rgbaPng(colored, image.width, image.height));
  const sampleColors = new Map<number, Rgb>(segmentation.regions.map(region => [region.id, [31, 118, 183]]));
  await save('fill-sample.png', await rgbaPng(compositeRgba(image.width, image.height, segmentation.paintLabels, segmentation.inkAlpha, sampleColors), image.width, image.height));
  const numberedWidth = image.width * 2;
  const numberedHeight = image.height * 2;
  const numbered = await sharp(colored, { raw: { width: image.width, height: image.height, channels: 4 } })
    .resize(numberedWidth, numberedHeight, { kernel: 'nearest' }).raw().toBuffer();
  const positions = labelPositions(image.width, segmentation.hitLabels, segmentation.regions);
  for (const region of segmentation.regions) {
    const [x, y] = positions[region.id]!;
    drawNumber(numbered, numberedWidth, numberedHeight, String(region.id), x * 2 + 1, y * 2 + 1);
  }
  await save('regions-numbered-2x.png', await rgbaPng(numbered, numberedWidth, numberedHeight));
  const masks = new Uint8Array(image.pixels.length * 4);
  for (let index = 0; index < image.pixels.length; index += 1) {
    let color: Rgb = [image.pixels[index]!, image.pixels[index]!, image.pixels[index]!];
    if (segmentation.domainMask[index] === 0) color = [235, 200, 200];
    else if (segmentation.excludedMask[index] !== 0) color = [225, 225, 235];
    if (segmentation.barrierAddMask[index] !== 0) color = [255, 0, 160];
    if (segmentation.barrierRemoveMask[index] !== 0) color = [0, 180, 240];
    masks.set([...color, 255], index * 4);
  }
  await save('correction-masks.png', await rgbaPng(masks, image.width, image.height));
  await save('regions.json', jsonBytes({ schemaVersion: 1, regions: segmentation.regions }));
  const csv = ['id,pixelCount,seedX,seedY,x,y,width,height,centroidX,centroidY', ...segmentation.regions.map(region => [
    region.id, region.pixelCount, ...region.seed, region.bbox.x, region.bbox.y,
    region.bbox.width, region.bbox.height, ...region.centroid,
  ].join(','))].join('\n') + '\n';
  await save('regions.csv', Buffer.from(csv, 'utf8'));
  await save('accessibility-draft.json', jsonBytes({
    schemaVersion: 1, artworkId, contentVersion,
    regions: segmentation.regions.map(region => ({ id: region.id, name: `Area ${region.id}`, order: region.id })),
  }));
  await save('review.json', jsonBytes({
    schemaVersion: 1, artworkId, contentVersion, width: image.width, height: image.height,
    regionCount: segmentation.regions.length,
    retainedSmallRegionIds: segmentation.regions.filter(region => region.pixelCount < 25).map(region => region.id),
    excludedSeedPoints: segmentation.excludedSeedPoints,
    reviewReceiptWritten: false,
    maskLegend: { outsideDomain: 'pale red', excludedComponent: 'pale gray-blue', addedBarrier: 'magenta', removedBarrier: 'cyan' },
    notes: 'Inspect all regions and correction boundaries. Small regions remain included. The accessibility draft is not a completed review.',
  }));
  return { directory, files };
}
