import { z } from 'zod';
import { ArtworkIdSchema, ConfidenceSchema, NonEmptyTextSchema, PhotoIdSchema, RelativePathSchema, Sha256Schema } from './validation.js';

export const PublicFileReceiptSchema = z.object({
  path: RelativePathSchema.refine(path => !path.startsWith('public/') && !/[%?#]/u.test(path), { message: 'Public paths are unencoded application-relative file paths without query strings or fragments.' }),
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
}).strict();
export const PublicReviewStateSchema = z.enum(['pending', 'complete']);
const PublicLocationSchema = z.object({
  value: NonEmptyTextSchema.nullable(),
  confidence: ConfidenceSchema,
  reviewState: PublicReviewStateSchema,
}).strict().superRefine((location, ctx) => {
  if (location.reviewState === 'pending' && (location.value !== null || location.confidence !== 'unidentified')) {
    ctx.addIssue({ code: 'custom', message: 'An unreviewed location must remain unidentified.' });
  }
  if ((location.value === null) !== (location.confidence === 'unidentified')) {
    ctx.addIssue({ code: 'custom', message: 'A named location needs confirmed or likely confidence.' });
  }
});

export const PublicPreparedVersionSchema = z.object({
  contentVersion: Sha256Schema,
  package: PublicFileReceiptSchema,
  canonical: PublicFileReceiptSchema,
  accessibility: PublicFileReceiptSchema,
  keyboardNamesDraft: z.boolean(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  regionCount: z.number().int().positive(),
  reviewState: PublicReviewStateSchema,
}).strict().superRefine((version, ctx) => {
  if (version.keyboardNamesDraft && version.reviewState === 'complete') ctx.addIssue({ code: 'custom', message: 'Draft keyboard names cannot have a completed review.' });
});

export const PublicPhotoSchema = z.object({
  id: PhotoIdSchema,
  displayOrder: z.number().int().positive(),
  title: NonEmptyTextSchema,
  alt: NonEmptyTextSchema,
  description: NonEmptyTextSchema,
  image: z.object({
    web: PublicFileReceiptSchema,
    thumbnail: PublicFileReceiptSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict().nullable(),
  location: PublicLocationSchema,
  citations: z.array(NonEmptyTextSchema),
  relatedArtworkIds: z.array(ArtworkIdSchema),
  reviewState: PublicReviewStateSchema,
}).strict();

export const PublicArtworkSchema = z.object({
  id: ArtworkIdSchema,
  bookNumber: z.number().int().positive(),
  title: NonEmptyTextSchema,
  description: NonEmptyTextSchema,
  available: z.boolean(),
  printable: PublicFileReceiptSchema.optional(),
  availabilityMessage: NonEmptyTextSchema.nullable(),
  originalPhotoId: PhotoIdSchema.nullable(),
  originalPhotoConfidence: ConfidenceSchema.nullable(),
  pairingReviewState: PublicReviewStateSchema,
  location: PublicLocationSchema,
  citations: z.array(NonEmptyTextSchema),
  activeVersion: Sha256Schema.nullable(),
  versions: z.record(Sha256Schema, PublicPreparedVersionSchema),
  reviewState: PublicReviewStateSchema,
}).strict().superRefine((record, ctx) => {
  const active = record.activeVersion ? record.versions[record.activeVersion] : undefined;
  if (record.available !== Boolean(active)) ctx.addIssue({ code: 'custom', message: 'Availability must match a validated active version.' });
  if (record.activeVersion !== null && !active) ctx.addIssue({ code: 'custom', message: 'The active version is missing.' });
  if (record.activeVersion === null && Object.keys(record.versions).length !== 0) ctx.addIssue({ code: 'custom', message: 'Prepared versions need an active version.' });
  if (record.available !== (record.availabilityMessage === null)) ctx.addIssue({ code: 'custom', message: 'Available pages have no unavailable message.' });
  if (record.reviewState !== (active?.reviewState ?? 'pending')) ctx.addIssue({ code: 'custom', message: 'Artwork review state must match the active version.' });
  for (const [key, version] of Object.entries(record.versions)) {
    if (key !== version.contentVersion) ctx.addIssue({ code: 'custom', path: ['versions', key], message: 'Version key and contentVersion disagree.' });
  }
  if (record.originalPhotoId === null && record.originalPhotoConfidence !== null) ctx.addIssue({ code: 'custom', message: 'A withheld photo has no public pairing confidence.' });
  if (record.originalPhotoId !== null && (record.pairingReviewState !== 'complete' || !['confirmed', 'likely'].includes(record.originalPhotoConfidence ?? ''))) {
    ctx.addIssue({ code: 'custom', message: 'An original photo needs a current confirmed or likely pairing review.' });
  }
});

export const DevelopmentCatalogSchema = z.object({
  schemaVersion: z.literal(1),
    mode: z.enum(['development', 'release']),
    repositoryUrl: z.string().url().nullable().optional(),
  title: NonEmptyTextSchema,
  projectVersion: NonEmptyTextSchema,
  sourceSnapshotDigest: Sha256Schema,
  history: z.object({paragraphs:z.array(NonEmptyTextSchema).min(1),citations:z.array(NonEmptyTextSchema)}).strict().optional(),
  book: z.object({ file: PublicFileReceiptSchema, manifest: PublicFileReceiptSchema,
    totalPages: z.number().int().positive(), coloringPages: z.literal(48) }).strict().optional(),
  photos: z.array(PublicPhotoSchema),
  artworks: z.array(PublicArtworkSchema),
}).strict().superRefine((catalog, ctx) => {
  const photoIds = new Set<string>();
  const artworkIds = new Set<string>();
  for (const photo of catalog.photos) {
    if (photoIds.has(photo.id)) ctx.addIssue({ code: 'custom', message: `Duplicate photo ID: ${photo.id}.` });
    photoIds.add(photo.id);
  }
  for (const artwork of catalog.artworks) {
    if (artworkIds.has(artwork.id)) ctx.addIssue({ code: 'custom', message: `Duplicate artwork ID: ${artwork.id}.` });
    artworkIds.add(artwork.id);
    if (artwork.originalPhotoId !== null && !catalog.photos.some(photo => photo.id === artwork.originalPhotoId && photo.image !== null)) {
      ctx.addIssue({ code: 'custom', message: `The original photo for ${artwork.id} is missing or unavailable.` });
    }
  }
  for (const photo of catalog.photos) {
    const expected = catalog.artworks.filter(artwork => artwork.available && artwork.originalPhotoId === photo.id).map(artwork => artwork.id);
    if (new Set(photo.relatedArtworkIds).size !== photo.relatedArtworkIds.length
        || photo.relatedArtworkIds.length !== expected.length
        || photo.relatedArtworkIds.some(id => !expected.includes(id))) {
      ctx.addIssue({ code: 'custom', message: `Related artworks for ${photo.id} must match the reviewed available associations.` });
    }
  }
});

export type PublicFileReceipt = z.infer<typeof PublicFileReceiptSchema>;
export type PublicPreparedVersion = z.infer<typeof PublicPreparedVersionSchema>;
export type PublicPhoto = z.infer<typeof PublicPhotoSchema>;
export type PublicArtwork = z.infer<typeof PublicArtworkSchema>;
export type DevelopmentCatalog = z.infer<typeof DevelopmentCatalogSchema>;
