import { z } from 'zod';
import {
  NonEmptyTextSchema, PublicReferenceUrlSchema, RelativePathSchema, Sha256Schema, StableIdSchema,
} from '../../src/shared/validation.js';

export const SourceEntrySchema = z.object({
  id: StableIdSchema,
  role: z.enum(['photo', 'coloring', 'cover', 'history', 'font']),
  path: RelativePathSchema.refine((value) => value.startsWith('source/'), {
    message: 'Acquired source paths must be under source/.',
  }),
  originalFilename: NonEmptyTextSchema.refine((value) => !/[\\/\x00-\x1f]/u.test(value), {
    message: 'originalFilename is a filename, not a directory or URL.',
  }),
  bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: Sha256Schema,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  provenance: z.object({
    sourceId: NonEmptyTextSchema,
    referenceUrl: PublicReferenceUrlSchema.optional(),
    form: z.enum(['original-file', 'transcription', 'prepared-art']),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if ((value.width === undefined) !== (value.height === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['width'], message: 'Record both width and height, or neither.' });
  }
  if ((value.role === 'photo' || value.role === 'coloring' || /\.(png|jpe?g|webp)$/iu.test(value.path))
      && (value.width === undefined || value.height === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['width'], message: 'An image source needs measured native dimensions.' });
  }
});

export const SourceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  files: z.array(SourceEntrySchema),
}).strict();

export type SourceEntry = z.infer<typeof SourceEntrySchema>;
export type SourceManifest = z.infer<typeof SourceManifestSchema>;
