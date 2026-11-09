import sharp from 'sharp';
import { PhotoDerivativeSchema, type PhotoDerivative } from '../../src/shared/assets.js';
import type { MediaConfig } from '../../src/shared/contracts.js';
import { computePhotoPreparationDigest } from './asset-identity.js';
import { CliError } from './cli.js';
import { sha256Bytes } from './digests.js';

export interface PreparedPhoto {
  derivative: PhotoDerivative;
  files: Array<{ path: string; bytes: Uint8Array }>;
}

/** A photograph remains in full composition; it never supplies drawing geometry. */
export async function preparePhotoDerivative(
  photoId: string, sourceDigest: string, sourceBytes: Uint8Array, media: MediaConfig,
): Promise<PreparedPhoto> {
  if (sha256Bytes(sourceBytes) !== sourceDigest) throw new CliError('E_PHOTO_SOURCE_HASH', `${photoId}: photo bytes do not match their source digest.`, 3);
  const metadata = await sharp(sourceBytes, { failOn: 'error' }).metadata();
  if (metadata.format !== 'jpeg') throw new CliError('E_PHOTO_FORMAT', `${photoId}: the original photograph must be JPEG.`, 3);
  if (!metadata.width || !metadata.height) throw new CliError('E_PHOTO_DIMENSIONS', 'Photo dimensions are missing.', 3);
  if (!['web-images-v1', 'web-images-v2'].includes(media.algorithmVersion)) throw new CliError('E_PHOTO_ALGORITHM', 'Unsupported photo recipe.', 3);
  const rotated = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
  const sourceWidth = rotated ? metadata.height : metadata.width;
  const sourceHeight = rotated ? metadata.width : metadata.height;
  const preparationDigest = computePhotoPreparationDigest(sourceDigest, media);
  const directory = `public/photos/${photoId}/${preparationDigest}`;
  const transform = (maxLongEdge: number, quality: number) => {
    const scale = Math.min(1, maxLongEdge / Math.max(sourceWidth, sourceHeight));
    const image = sharp(sourceBytes, { failOn: 'error' }).autoOrient().toColourspace('srgb');
    // Preserve v1 regeneration; v2 explicitly rounds both oriented dimensions.
    // fit: fill resamples the entire image to those exact integer dimensions;
    // it does not crop and never enlarges the source.
    const resized = media.algorithmVersion === 'web-images-v1'
      ? image.resize({ width: maxLongEdge, height: maxLongEdge, fit: 'inside', withoutEnlargement: true })
      : image.resize({ width: Math.max(1, Math.round(sourceWidth * scale)), height: Math.max(1, Math.round(sourceHeight * scale)), fit: 'fill' });
    return resized.webp({ quality }).toBuffer({ resolveWithObject: true });
  };
  const web = await transform(media.photo.maxLongEdge, media.photo.quality);
  const thumbnail = await transform(media.thumbnail.maxLongEdge, media.thumbnail.quality);
  const webPath = `${directory}/web.webp`;
  const thumbnailPath = `${directory}/thumbnail.webp`;
  const derivative = PhotoDerivativeSchema.parse({
    sourceDigest, preparationDigest,
    web: { path: webPath, bytes: web.data.byteLength, sha256: sha256Bytes(web.data) },
    thumbnail: { path: thumbnailPath, bytes: thumbnail.data.byteLength, sha256: sha256Bytes(thumbnail.data) },
    width: web.info.width, height: web.info.height,
  });
  return { derivative, files: [{ path: webPath, bytes: web.data }, { path: thumbnailPath, bytes: thumbnail.data }] };
}
