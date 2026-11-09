import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { preparePhotoDerivative } from '../../scripts/lib/photo-derivatives.js';
import { sha256Bytes } from '../../scripts/lib/digests.js';
import { parsePreparationArgs } from '../../scripts/prepare-assets.js';
import { computePhotoPreparationDigest } from '../../scripts/lib/asset-identity.js';

describe('rounded whole-photo derivatives', () => {
  it.each([1, 6])('rounds both oriented dimensions with EXIF orientation %i', async orientation => {
    const bytes = await sharp({ create: { width: 1001, height: 1633, channels: 3, background: '#1976D2' } }).withMetadata({ orientation }).jpeg().toBuffer();
    const photo = await preparePhotoDerivative('photo-006', sha256Bytes(bytes), bytes, {
      schemaVersion: 1, photo: { maxLongEdge: 2000, format: 'webp', quality: 90 }, thumbnail: { maxLongEdge: 320, format: 'webp', quality: 85 },
      withoutEnlargement: true, algorithmVersion: 'web-images-v2',
    });
    const thumbnail = await sharp(photo.files[1]!.bytes).metadata();
    expect([thumbnail.width, thumbnail.height]).toEqual(orientation === 6 ? [320, 196] : [196, 320]);
    expect([photo.derivative.width, photo.derivative.height]).toEqual(orientation === 6 ? [1633, 1001] : [1001, 1633]);
  });
  it('allows photo-only batches without admitting conflicting scopes', () => {
    expect(parsePreparationArgs(['--all', '--photos-only'])).toMatchObject({ all: true, photosOnly: true });
    expect(() => parsePreparationArgs(['--id', 'design-002', '--photos-only'])).toThrow();
    expect(() => parsePreparationArgs(['--all', '--include-archives', '--photos-only'])).toThrow();
  });
  it('versions the rounding change so existing photo directories are preserved', () => {
    const policy = { schemaVersion: 1 as const, photo: { maxLongEdge: 2000, format: 'webp' as const, quality: 90 },
      thumbnail: { maxLongEdge: 320, format: 'webp' as const, quality: 85 }, withoutEnlargement: true as const, algorithmVersion: 'web-images-v1' };
    expect(computePhotoPreparationDigest('a'.repeat(64), policy)).not.toBe(computePhotoPreparationDigest('a'.repeat(64), { ...policy, algorithmVersion: 'web-images-v2' }));
  });
});
