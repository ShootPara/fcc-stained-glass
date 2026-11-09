import { MAX_REGION_PIXELS, type RegionGeometry } from '../../../src/shared/assets.js';
import { CliError } from '../cli.js';
import { assertCanonicalImage, assertImageDimensions, type CanonicalImage } from './gray-v1.js';

export const REGIONS_ALGORITHM_VERSION = 'regions-v1' as const;
export type PixelPoint = [number, number];
export type RgbColor = readonly [number, number, number];

export interface SegmentationOptions {
  inkThreshold: number;
  domainMask?: Uint8Array;
  barrierAddMask?: Uint8Array;
  barrierRemoveMask?: Uint8Array;
  excludedSeedPoints?: ReadonlyArray<readonly [number, number]>;
}

export interface SegmentationResult {
  hitLabels: Uint32Array;
  paintLabels: Uint32Array;
  inkAlpha: Uint8Array;
  regions: RegionGeometry[];
  /** Binary working masks use the same 0/255 convention as authored masks. */
  barrier: Uint8Array;
  domainMask: Uint8Array;
  barrierAddMask: Uint8Array;
  barrierRemoveMask: Uint8Array;
  excludedMask: Uint8Array;
  excludedSeedPoints: PixelPoint[];
}

export function normalizeExcludedSeedPoints(
  points: ReadonlyArray<readonly [number, number]>, width: number, height: number,
): PixelPoint[] {
  assertImageDimensions(width, height, 'Exclusion image');
  if (!Array.isArray(points)) throw new CliError('E_EXCLUSION_POINT', 'excludedSeedPoints must be an array of [x,y] coordinates.', 3);
  const unique = new Map<number, PixelPoint>();
  for (const [index, point] of points.entries()) {
    if (!Array.isArray(point) || point.length !== 2 || !Number.isInteger(point[0]) || !Number.isInteger(point[1])
        || point[0] < 0 || point[0] >= width || point[1] < 0 || point[1] >= height) {
      throw new CliError('E_EXCLUSION_POINT', `excludedSeedPoints[${index}] must contain integer coordinates inside ${width}×${height}.`, 3);
    }
    unique.set(point[1] * width + point[0], [point[0], point[1]]);
  }
  return [...unique.entries()].sort(([a], [b]) => a - b).map(([, point]) => point);
}

function effectiveMask(mask: Uint8Array | undefined, count: number, defaultValue: 0 | 255, name: string): Uint8Array {
  if (mask === undefined) return new Uint8Array(count).fill(defaultValue);
  if (!(mask instanceof Uint8Array) || mask.length !== count) throw new CliError('E_MASK_LENGTH', `${name} needs exactly ${count} decoded bytes.`, 3);
  for (let i = 0; i < count; i += 1) {
    if (mask[i] !== 0 && mask[i] !== 255) throw new CliError('E_MASK_BINARY', `${name} contains nonbinary value ${mask[i]} at pixel index ${i}.`, 3);
  }
  return Uint8Array.from(mask);
}

interface Component {
  seed: number;
  pixelCount: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerXSum: number;
  centerYSum: number;
}

/** Deterministic four-connected segmentation and nearest-seed paint ownership.
 * No component is removed because it touches an edge or contains few pixels. */
export function segmentRegions(image: CanonicalImage, options: SegmentationOptions): SegmentationResult {
  const count = assertCanonicalImage(image);
  const { width, height, pixels } = image;
  if (!options || !Number.isInteger(options.inkThreshold) || options.inkThreshold < 0 || options.inkThreshold > 255) {
    throw new CliError('E_THRESHOLD', 'inkThreshold must be an integer from 0 through 255.', 3);
  }
  const domainMask = effectiveMask(options.domainMask, count, 255, 'domainMask');
  const barrierAddMask = effectiveMask(options.barrierAddMask, count, 0, 'barrierAddMask');
  const barrierRemoveMask = effectiveMask(options.barrierRemoveMask, count, 0, 'barrierRemoveMask');
  const excludedSeedPoints = normalizeExcludedSeedPoints(options.excludedSeedPoints ?? [], width, height);
  const barrier = new Uint8Array(count);
  const inkAlpha = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    if (barrierAddMask[i] && barrierRemoveMask[i]) throw new CliError('E_MASK_OVERLAP', `Barrier add/remove masks both select pixel ${i % width},${Math.floor(i / width)}.`, 3);
    barrier[i] = barrierAddMask[i] || (pixels[i]! <= options.inkThreshold && !barrierRemoveMask[i]) ? 255 : 0;
    inkAlpha[i] = 255 - pixels[i]!;
  }

  // Temporary positive component IDs are assigned in row-major seed order.
  // The same buffer becomes the final hit map after explicit exclusions.
  const hitLabels = new Uint32Array(count);
  const queue = new Uint32Array(count);
  const components: Component[] = [];
  for (let seed = 0; seed < count; seed += 1) {
    if (barrier[seed] || !domainMask[seed] || hitLabels[seed]) continue;
    const id = components.length + 1;
    const component: Component = {
      seed, pixelCount: 0, minX: width, minY: height, maxX: -1, maxY: -1,
      centerXSum: 0, centerYSum: 0,
    };
    let head = 0;
    let tail = 1;
    queue[0] = seed;
    hitLabels[seed] = id;
    const enqueue = (index: number) => {
      if (!barrier[index] && domainMask[index] && !hitLabels[index]) {
        hitLabels[index] = id;
        queue[tail++] = index;
      }
    };
    while (head < tail) {
      const index = queue[head++]!;
      const x = index % width;
      const y = Math.floor(index / width);
      component.pixelCount += 1;
      component.minX = Math.min(component.minX, x);
      component.minY = Math.min(component.minY, y);
      component.maxX = Math.max(component.maxX, x);
      component.maxY = Math.max(component.maxY, y);
      component.centerXSum += x + 0.5;
      component.centerYSum += y + 0.5;
      if (y > 0) enqueue(index - width);
      if (x > 0) enqueue(index - 1);
      if (x + 1 < width) enqueue(index + 1);
      if (y + 1 < height) enqueue(index + width);
    }
    components.push(component);
  }

  const excludedIds = new Set<number>();
  for (const [x, y] of excludedSeedPoints) {
    const id = hitLabels[y * width + x]!;
    if (id === 0) throw new CliError('E_EXCLUSION_AREA', `Exclusion seed ${x},${y} is not inside an allowed nonbarrier component.`, 3);
    excludedIds.add(id);
  }
  const retainedIds = new Uint32Array(components.length + 1);
  const regions: RegionGeometry[] = [];
  for (const [index, component] of components.entries()) {
    const componentId = index + 1;
    if (excludedIds.has(componentId)) continue;
    const id = regions.length + 1;
    retainedIds[componentId] = id;
    regions.push({
      id, seed: [component.seed % width, Math.floor(component.seed / width)],
      pixelCount: component.pixelCount,
      bbox: { x: component.minX, y: component.minY, width: component.maxX - component.minX + 1, height: component.maxY - component.minY + 1 },
      centroid: [component.centerXSum / component.pixelCount, component.centerYSum / component.pixelCount],
    });
  }
  if (regions.length === 0) throw new CliError('E_REGIONS_EMPTY', 'The settings leave no fillable regions. Inspect threshold, domain and excluded seeds.', 3);
  const excludedMask = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const component = hitLabels[i]!;
    if (excludedIds.has(component)) excludedMask[i] = 255;
    hitLabels[i] = retainedIds[component]!;
  }

  // Seed every nonbarrier pixel BEFORE expanding any owner. The queue order is
  // global row-major order, including zero-owned background seeds. A separate
  // visited map is essential: owner zero is a real propagated value.
  const paintLabels = new Uint32Array(count);
  const visited = new Uint8Array(count);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < count; i += 1) {
    if (!barrier[i]) {
      visited[i] = 1;
      paintLabels[i] = hitLabels[i]!;
      queue[tail++] = i;
    }
  }
  const enqueuePaint = (neighbor: number, owner: number) => {
    if (!visited[neighbor]) {
      visited[neighbor] = 1;
      paintLabels[neighbor] = owner;
      queue[tail++] = neighbor;
    }
  };
  while (head < tail) {
    const index = queue[head++]!;
    const owner = paintLabels[index]!;
    const x = index % width;
    const y = Math.floor(index / width);
    if (y > 0) enqueuePaint(index - width, owner);
    if (x > 0) enqueuePaint(index - 1, owner);
    if (x + 1 < width) enqueuePaint(index + 1, owner);
    if (y + 1 < height) enqueuePaint(index + width, owner);
  }
  for (let i = 0; i < count; i += 1) {
    if (!domainMask[i] || excludedMask[i]) paintLabels[i] = 0;
  }
  return { hitLabels, paintLabels, inkAlpha, regions, barrier, domainMask, barrierAddMask, barrierRemoveMask, excludedMask, excludedSeedPoints };
}

/** Reference compositor for preparation/review and exact pixel fixtures. */
export function compositeRgba(
  width: number, height: number, paintLabels: Uint32Array, inkAlpha: Uint8Array,
  colors: ReadonlyMap<number, RgbColor> = new Map(),
): Uint8Array {
  const count = assertImageDimensions(width, height, 'Composite');
  if (!(paintLabels instanceof Uint32Array) || paintLabels.length !== count
      || !(inkAlpha instanceof Uint8Array) || inkAlpha.length !== count) {
    throw new CliError('E_COMPOSITE_LENGTH', `Composite maps need exactly ${count} labels and ink bytes.`, 3);
  }
  for (const [id, color] of colors) {
    if (!Number.isInteger(id) || id <= 0 || id > MAX_REGION_PIXELS || !Array.isArray(color) || color.length !== 3
        || color.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
      throw new CliError('E_COLOR', 'Colors must map positive region IDs to three integer RGB channels from 0 through 255.', 3);
    }
  }
  const white: RgbColor = [255, 255, 255];
  const rgba = new Uint8Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const owner = paintLabels[i]!;
    if (owner > count) throw new CliError('E_LABEL_RANGE', `Paint owner ${owner} at pixel index ${i} exceeds the possible region range.`, 3);
    const color = owner === 0 ? white : colors.get(owner) ?? white;
    const gray = 255 - inkAlpha[i]!;
    const offset = i * 4;
    rgba[offset] = Math.floor((color[0] * gray + 127) / 255);
    rgba[offset + 1] = Math.floor((color[1] * gray + 127) / 255);
    rgba[offset + 2] = Math.floor((color[2] * gray + 127) / 255);
    rgba[offset + 3] = 255;
  }
  return rgba;
}
