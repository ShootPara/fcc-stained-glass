import { z } from 'zod';
import type { ArtworkId, PhotoId } from './contracts.js';

export const NonEmptyTextSchema = z.string().min(1).refine(
  (value) => value.trim().length > 0,
  { message: 'Use nonblank text.' },
);
export const StableIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const PhotoIdSchema = z.string().regex(/^photo-\d{3}$/).transform((id) => id as PhotoId);
export const ArtworkIdSchema = z.string().regex(/^design-\d{3}$/).transform((id) => id as ArtworkId);
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/).refine(
  (value) => value !== '0'.repeat(64),
  { message: 'Use the measured SHA-256, not a placeholder.' },
);
export const UtcDateTimeSchema = z.string().datetime({ offset: false });
export const PublicReferenceUrlSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
}, { message: 'Use an HTTP(S) reference URL without embedded credentials.' });

/** JSON stores POSIX relative paths. The Node helper also checks filesystem links. */
export function isPortableRelativePath(value: string): boolean {
  if (!value || value.startsWith('/') || value.includes('\\')) return false;
  if (/[\x00-\x1f\x7f<>:"|?*]/u.test(value)) return false;
  return value.split('/').every((part) => (
    part !== '' && part !== '.' && part !== '..'
    && !/[. ]$/u.test(part)
    && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(part)
  ));
}

export const RelativePathSchema = z.string().refine(isPortableRelativePath, {
  message: 'Use a portable project-relative path with forward slashes and no traversal.',
});

export const EvidenceRefSchema = z.object({
  sourceId: StableIdSchema,
  section: NonEmptyTextSchema,
  locator: NonEmptyTextSchema.optional(),
  printedPage: NonEmptyTextSchema.optional(),
}).strict();

export const ConfidenceSchema = z.enum(['confirmed', 'likely', 'unidentified']);

export function assessmentSchema<T extends z.ZodType>(valueSchema: T) {
  return z.object({
    value: valueSchema.nullable(),
    confidence: ConfidenceSchema,
    rationale: NonEmptyTextSchema,
    evidence: z.array(EvidenceRefSchema),
  }).strict().superRefine((value, ctx) => {
    if (value.confidence !== 'unidentified') {
      // Zod's generic object output cannot resolve whether T is optional here.
      // Read only the presence of the value; the supplied schema checks its type.
      const assessedValue = (value as Record<string, unknown>).value;
      if (assessedValue === null || assessedValue === undefined) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'A likely or confirmed assessment needs a value.' });
      }
      if (value.evidence.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'A likely or confirmed assessment needs recorded evidence.' });
      }
    }
  });
}

export const SubjectAssessmentSchema = assessmentSchema(z.array(StableIdSchema).min(1));
export const LocationAssessmentSchema = assessmentSchema(NonEmptyTextSchema);
export const PhotoAssessmentSchema = assessmentSchema(PhotoIdSchema);

export const PhotoRecordSchema = z.object({
  id: PhotoIdSchema,
  sourceId: StableIdSchema,
  displayOrder: z.number().int().positive(),
  coverage: z.enum(['whole-window', 'panels', 'panel', 'detail', 'unreviewed']),
  title: NonEmptyTextSchema,
  alt: NonEmptyTextSchema,
  description: NonEmptyTextSchema,
  extendedDescription: NonEmptyTextSchema.optional(),
  subjects: SubjectAssessmentSchema,
  location: LocationAssessmentSchema,
  historicalEvidence: z.array(EvidenceRefSchema),
}).strict();

export const ArtworkRecordSchema = z.object({
  id: ArtworkIdSchema,
  sourceId: StableIdSchema,
  bookNumber: z.number().int().min(1).max(48),
  title: NonEmptyTextSchema,
  publicDescription: NonEmptyTextSchema,
  originalPhoto: PhotoAssessmentSchema,
  subjects: SubjectAssessmentSchema,
  location: LocationAssessmentSchema,
  citations: z.array(EvidenceRefSchema),
}).strict();

export const HistoricalSubjectSchema = z.object({
  id: StableIdSchema,
  sourceId: StableIdSchema,
  section: NonEmptyTextSchema,
  windowNumber: z.number().int().positive().optional(),
  subjectNumber: z.number().int().positive().optional(),
  sourceLabel: NonEmptyTextSchema,
  title: NonEmptyTextSchema,
  sourceLocation: NonEmptyTextSchema.optional(),
  designer: NonEmptyTextSchema.optional(),
  memorial: NonEmptyTextSchema.optional(),
  evidence: z.array(EvidenceRefSchema).min(1),
}).strict();

export const CitationSourceSchema = z.object({
  id: StableIdSchema,
  title: NonEmptyTextSchema,
  sourceFileId: StableIdSchema.optional(),
  form: z.enum(['transcription', 'original-file', 'prepared-art', 'collection']),
  citation: NonEmptyTextSchema,
  referenceUrl: PublicReferenceUrlSchema.optional(),
}).strict();

export const PhotoCollectionSchema = z.object({ schemaVersion: z.literal(1), photos: z.array(PhotoRecordSchema) }).strict();
export const ArtworkCollectionSchema = z.object({ schemaVersion: z.literal(1), artworks: z.array(ArtworkRecordSchema) }).strict();
export const HistoricalSubjectCollectionSchema = z.object({ schemaVersion: z.literal(1), subjects: z.array(HistoricalSubjectSchema) }).strict();
export const CitationSourceCollectionSchema = z.object({ schemaVersion: z.literal(1), sources: z.array(CitationSourceSchema) }).strict();

export const ProjectConfigSchema = z.object({
  siteId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: NonEmptyTextSchema,
  projectVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  repositoryUrl: PublicReferenceUrlSchema.nullable(),
  defaultBranch: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_./-]*$/),
  releaseDateUtc: UtcDateTimeSchema,
  customDomain: z.string().regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/).nullable().optional(),
}).strict();

export const BookConfigSchema = z.object({
  schemaVersion: z.literal(1),
  title: NonEmptyTextSchema,
  coverSourceId: StableIdSchema,
  printableCoverSourceId: StableIdSchema.nullable(),
  coverLines: z.array(NonEmptyTextSchema).min(1),
  intro: z.array(NonEmptyTextSchema).min(1),
  sourcesText: z.array(NonEmptyTextSchema).min(1),
  artworkOrder: z.array(ArtworkIdSchema),
  page: z.object({
    width: z.literal(612), height: z.literal(792), margin: z.number().min(36).max(144),
  }).strict(),
  layoutVersion: StableIdSchema,
  fontSourceId: StableIdSchema,
}).strict();

const ImagePolicySchema = z.object({
  maxLongEdge: z.number().int().positive().max(10000),
  format: z.literal('webp'),
  quality: z.number().int().min(1).max(100),
}).strict();
export const MediaConfigSchema = z.object({
  schemaVersion: z.literal(1),
  photo: ImagePolicySchema,
  thumbnail: ImagePolicySchema,
  withoutEnlargement: z.literal(true),
  algorithmVersion: StableIdSchema,
}).strict();

export const ReviewReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  recordId: StableIdSchema,
  reviewKind: z.enum(['photo-pairing', 'subject', 'location', 'segmentation']),
  reviewedDigest: Sha256Schema,
  reviewer: NonEmptyTextSchema,
  reviewedAtUtc: UtcDateTimeSchema,
  outcome: z.literal('complete'),
  contentVersion: Sha256Schema.optional(),
  keyboardMetadataDigest: Sha256Schema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.reviewKind === 'segmentation' && (!value.contentVersion || !value.keyboardMetadataDigest)) {
    ctx.addIssue({ code: 'custom', message: 'A segmentation review must bind its content version and keyboard metadata digest.' });
  }
});
