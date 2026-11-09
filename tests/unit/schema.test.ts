import { describe, expect, it } from 'vitest';
import {
  ArtworkRecordSchema, EvidenceRefSchema, PhotoAssessmentSchema, RelativePathSchema,
  ReviewReceiptSchema, Sha256Schema,
} from '../../src/shared/validation.js';
import { SourceEntrySchema, SourceManifestSchema } from '../../scripts/lib/contracts.js';

const digest = 'a'.repeat(64);
const evidence = { sourceId: 'H28', section: 'The windows', locator: 'Window I' };
const source = {
  id: 'design-002', role: 'coloring', path: 'source/coloring/002.png',
  originalFilename: '002.png', bytes: 100, sha256: digest, width: 20, height: 30,
  provenance: { sourceId: 'supplied-file-002', form: 'original-file' },
};
const pending = { value: null, confidence: 'unidentified', rationale: 'Not reviewed.', evidence: [] };

describe('portable source contracts', () => {
  it.each([
    '../outside.png', 'source/../outside.png', '/source/a.png', 'C:/source/a.png',
    'source\\a.png', 'source//a.png', 'source/./a.png', 'source/a?.png',
    'source/a\0.png', 'source/CON.txt', 'source/LPT1.png', 'source/a.png ',
  ])('rejects unsafe or nonportable path %j', (path) => {
    expect(RelativePathSchema.safeParse(path).success).toBe(false);
  });

  it('preserves spaces and apostrophes in supplied filenames', () => {
    const path = "source/photos/001 - Brian's original photograph.jpg";
    expect(RelativePathSchema.parse(path)).toBe(path);
    expect(SourceEntrySchema.parse({ ...source, path: 'source/coloring/002.png' }).path).toBe(source.path);
  });

  it('requires measured nonempty source metadata and image dimensions', () => {
    expect(SourceEntrySchema.safeParse(source).success).toBe(true);
    expect(SourceEntrySchema.safeParse({ ...source, bytes: 0 }).success).toBe(false);
    expect(SourceEntrySchema.safeParse({ ...source, width: undefined }).success).toBe(false);
    expect(SourceEntrySchema.safeParse({ ...source, width: undefined, height: undefined }).success).toBe(false);
    expect(SourceEntrySchema.safeParse({ ...source, path: 'public/002.png' }).success).toBe(false);
    expect(SourceEntrySchema.safeParse({ ...source, originalFilename: '../002.png' }).success).toBe(false);
  });

  it('allows nondimensional history text and font sources', () => {
    const { width: _width, height: _height, ...text } = source;
    expect(SourceEntrySchema.safeParse({ ...text, id: 'H28', role: 'history', path: 'source/histories/h28.txt' }).success).toBe(true);
    expect(SourceEntrySchema.safeParse({ ...text, id: 'font-main', role: 'font', path: 'source/fonts/main.ttf' }).success).toBe(true);
  });

  it('rejects placeholder or malformed hashes and unknown fields', () => {
    expect(Sha256Schema.safeParse('0'.repeat(64)).success).toBe(false);
    expect(Sha256Schema.safeParse('A'.repeat(64)).success).toBe(false);
    expect(Sha256Schema.safeParse('abc').success).toBe(false);
    expect(SourceEntrySchema.safeParse({ ...source, accessToken: 'unexpected' }).success).toBe(false);
    expect(SourceManifestSchema.safeParse({ schemaVersion: 2, files: [source] }).success).toBe(false);
  });

  it('rejects credentials and unsupported URL schemes in provenance', () => {
    for (const referenceUrl of ['file:///tmp/a.png', 'https://user:password@example.com/a.png']) {
      expect(SourceEntrySchema.safeParse({ ...source, provenance: { ...source.provenance, referenceUrl } }).success).toBe(false);
    }
  });
});

describe('independent assessments and evidence', () => {
  it('permits an unidentified candidate without presenting it as established', () => {
    const candidate = PhotoAssessmentSchema.parse({ ...pending, value: 'photo-002' });
    expect(candidate.value).toBe('photo-002');
    expect(candidate.confidence).toBe('unidentified');
  });

  it.each(['likely', 'confirmed'])('requires a value and evidence for %s', (confidence) => {
    expect(PhotoAssessmentSchema.safeParse({ ...pending, confidence, evidence: [evidence] }).success).toBe(false);
    expect(PhotoAssessmentSchema.safeParse({ ...pending, value: 'photo-002', confidence }).success).toBe(false);
    expect(PhotoAssessmentSchema.safeParse({ ...pending, value: 'photo-002', confidence, evidence: [evidence] }).success).toBe(true);
  });

  it('does not copy pairing confidence into subject or location', () => {
    const parsed = ArtworkRecordSchema.parse({
      id: 'design-002', sourceId: 'design-002', bookNumber: 1,
      title: 'A window', publicDescription: 'Choose your colors.',
      originalPhoto: { ...pending, value: 'photo-002', confidence: 'confirmed', evidence: [evidence] },
      subjects: pending, location: pending, citations: [],
    });
    expect(parsed.originalPhoto.confidence).toBe('confirmed');
    expect(parsed.subjects).toEqual(pending);
    expect(parsed.location).toEqual(pending);
  });

  it('requires meaningful rationale and exact evidence fields', () => {
    expect(PhotoAssessmentSchema.safeParse({ ...pending, rationale: '  ' }).success).toBe(false);
    expect(EvidenceRefSchema.safeParse({ sourceId: 'H28', section: '' }).success).toBe(false);
    expect(EvidenceRefSchema.safeParse({ ...evidence, printedPage: 12 }).success).toBe(false);
    expect(EvidenceRefSchema.safeParse({ ...evidence, inferredPage: 12 }).success).toBe(false);
  });

  it('does not accept an editable reviewState as review evidence', () => {
    expect(PhotoAssessmentSchema.safeParse({ ...pending, reviewState: 'complete' }).success).toBe(false);
  });

  it('binds a segmentation receipt to its content and keyboard metadata', () => {
    const receipt = {
      schemaVersion: 1, recordId: 'design-002', reviewKind: 'segmentation',
      reviewedDigest: digest, reviewer: 'Reviewer', reviewedAtUtc: '2026-11-06T00:00:00.000Z', outcome: 'complete',
    };
    expect(ReviewReceiptSchema.safeParse(receipt).success).toBe(false);
    expect(ReviewReceiptSchema.safeParse({ ...receipt, contentVersion: digest, keyboardMetadataDigest: digest }).success).toBe(true);
    expect(ReviewReceiptSchema.safeParse({ ...receipt, reviewKind: 'photo-pairing', reviewedAtUtc: '2026-11-06' }).success).toBe(false);
  });
});
