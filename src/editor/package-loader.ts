import { gunzipSync } from 'fflate';
import { AccessibilityMetadataSchema, RegionGeometryFileSchema, RegionPackageSchema, type RegionGeometry, type RegionPackage } from '../shared/assets.js';
import type { LoadRequest, RuntimeRegion } from '../shared/editor-protocol.js';

export interface LoadedRegionPackage {
  packageData: RegionPackage;
  hitLabels: Uint32Array;
  paintLabels: Uint32Array;
  inkAlpha: Uint8Array;
  regions: RuntimeRegion[];
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer)));
}

async function fetchBytes(url: string, expectedBytes: number, expectedSha256: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${new URL(url).pathname}: HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== expectedBytes) throw new Error(`Unexpected byte count for ${new URL(url).pathname}.`);
  if (await sha256Hex(bytes) !== expectedSha256) throw new Error(`Checksum failed for ${new URL(url).pathname}.`);
  return bytes;
}

function decodeJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function assertZeroTimestampGzip(bytes: Uint8Array): void {
  if (bytes.length < 10 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8) throw new Error('A region map is not a supported gzip stream.');
  if (bytes[4] !== 0 || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 0) throw new Error('A region map has a nonzero gzip timestamp.');
}

async function loadBinary(baseUrl: string, receipt: RegionPackage['hitLabels'] | RegionPackage['paintLabels'] | RegionPackage['inkAlpha']): Promise<Uint8Array> {
  const url = new URL(receipt.path, baseUrl).href;
  const compressed = await fetchBytes(url, receipt.compressedBytes, receipt.compressedSha256);
  assertZeroTimestampGzip(compressed);
  const raw = gunzipSync(compressed);
  if (raw.byteLength !== receipt.uncompressedBytes) throw new Error(`Unexpected expanded byte count for ${receipt.path}.`);
  if (await sha256Hex(raw) !== receipt.rawSha256) throw new Error(`Expanded checksum failed for ${receipt.path}.`);
  return raw;
}

function u32le(bytes: Uint8Array): Uint32Array {
  if (bytes.byteLength % 4 !== 0) throw new Error('A u32 region map has an invalid byte count.');
  const result = new Uint32Array(bytes.byteLength / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < result.length; i += 1) result[i] = view.getUint32(i * 4, true);
  return result;
}

function pngDimensions(bytes: Uint8Array): readonly [number, number] {
  const signature = [137,80,78,71,13,10,26,10];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)
      || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('Canonical image is not a valid PNG header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16, false), view.getUint32(20, false)];
}

function validateMaps(pkg: RegionPackage, hit: Uint32Array, paint: Uint32Array, geometries: readonly RegionGeometry[]): void {
  const count = pkg.width * pkg.height;
  if (hit.length !== count || paint.length !== count) throw new Error('Region-map dimensions do not agree with the package.');
  if (geometries.length !== pkg.regionCount) throw new Error('Region geometry count does not agree with the package.');

  interface Measured {
    first: number;
    count: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    sumX: number;
    sumY: number;
  }
  const measured = new Map<number, Measured>();
  for (let i = 0; i < count; i += 1) {
    const h = hit[i]!;
    const p = paint[i]!;
    if (h > pkg.regionCount || p > pkg.regionCount) throw new Error('A region map contains an out-of-range region ID.');
    if (h > 0 && p !== h) throw new Error(`Paint ownership changes retained region ${h} at pixel ${i}.`);
    if (h === 0) continue;
    const x = i % pkg.width;
    const y = Math.floor(i / pkg.width);
    const current = measured.get(h);
    if (!current) measured.set(h, { first: i, count: 1, minX: x, minY: y, maxX: x, maxY: y, sumX: x + 0.5, sumY: y + 0.5 });
    else {
      current.count += 1;
      current.minX = Math.min(current.minX, x); current.maxX = Math.max(current.maxX, x);
      current.minY = Math.min(current.minY, y); current.maxY = Math.max(current.maxY, y);
      current.sumX += x + 0.5; current.sumY += y + 0.5;
    }
  }

  let priorFirst = -1;
  for (let index = 0; index < geometries.length; index += 1) {
    const region = geometries[index]!;
    const id = index + 1;
    const actual = measured.get(id);
    if (region.id !== id || !actual) throw new Error(`Region geometry must contain positive ID ${id} in order.`);
    if (actual.first <= priorFirst) throw new Error('Positive region IDs are not in first-pixel row-major order.');
    priorFirst = actual.first;
    const expectedSeed: readonly [number, number] = [actual.first % pkg.width, Math.floor(actual.first / pkg.width)];
    const expectedBbox = { x: actual.minX, y: actual.minY, width: actual.maxX - actual.minX + 1, height: actual.maxY - actual.minY + 1 };
    if (region.seed[0] !== expectedSeed[0] || region.seed[1] !== expectedSeed[1]
        || region.pixelCount !== actual.count
        || region.bbox.x !== expectedBbox.x || region.bbox.y !== expectedBbox.y
        || region.bbox.width !== expectedBbox.width || region.bbox.height !== expectedBbox.height
        || Math.abs(region.centroid[0] - actual.sumX / actual.count) > 1e-9
        || Math.abs(region.centroid[1] - actual.sumY / actual.count) > 1e-9) {
      throw new Error(`Region ${id} geometry does not agree with the hit map.`);
    }
  }
}

export async function loadRegionPackage(request: LoadRequest): Promise<LoadedRegionPackage> {
  const packageBytes = await fetchBytes(request.packageUrl, request.packageReceipt.bytes, request.packageReceipt.sha256);
  const pkg = RegionPackageSchema.parse(decodeJson(packageBytes));
  if (pkg.artworkId !== request.artworkId || pkg.contentVersion !== request.contentVersion) throw new Error('Prepared package identity does not match the selected artwork.');
  const baseUrl = request.packageUrl;

  const regionsBytes = await fetchBytes(new URL(pkg.regions.path, baseUrl).href, pkg.regions.bytes, pkg.regions.sha256);
  const geometryFile = RegionGeometryFileSchema.parse(decodeJson(regionsBytes));
  const canonicalBytes = await fetchBytes(new URL(pkg.canonical.path, baseUrl).href, pkg.canonical.bytes, pkg.canonical.sha256);
  const [pngWidth, pngHeight] = pngDimensions(canonicalBytes);
  if (pngWidth !== pkg.width || pngHeight !== pkg.height) throw new Error('Canonical PNG dimensions do not match the prepared package.');

  const [hitRaw, paintRaw, inkAlpha] = await Promise.all([
    loadBinary(baseUrl, pkg.hitLabels),
    loadBinary(baseUrl, pkg.paintLabels),
    loadBinary(baseUrl, pkg.inkAlpha),
  ]);
  const hitLabels = u32le(hitRaw);
  const paintLabels = u32le(paintRaw);
  validateMaps(pkg, hitLabels, paintLabels, geometryFile.regions);

  const accessibilityBytes = await fetchBytes(request.accessibilityUrl, request.accessibilityReceipt.bytes, request.accessibilityReceipt.sha256);
  const accessibility = AccessibilityMetadataSchema.parse(decodeJson(accessibilityBytes));
  if (accessibility.artworkId !== request.artworkId || accessibility.contentVersion !== request.contentVersion) throw new Error('Accessibility metadata identity does not match the selected artwork.');
  if (accessibility.regions.length !== pkg.regionCount) throw new Error('Accessibility metadata does not name every region.');
  const accessById = new Map(accessibility.regions.map(region => [region.id, region]));
  const orders = new Set(accessibility.regions.map(region => region.order));
  if (accessById.size !== pkg.regionCount || orders.size !== pkg.regionCount) throw new Error('Accessibility metadata contains duplicate IDs or navigation order.');

  const regions: RuntimeRegion[] = geometryFile.regions.map(region => {
    const access = accessById.get(region.id);
    if (!access) throw new Error(`Region ${region.id} has no accessibility name.`);
    return { ...region, name: access.name, order: access.order };
  }).sort((a, b) => a.order - b.order);
  return { packageData: pkg, hitLabels, paintLabels, inkAlpha, regions };
}
