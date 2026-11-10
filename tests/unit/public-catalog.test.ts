import { expect, test } from 'vitest';
import { projectDevelopmentCatalog, type CatalogResources } from '../../scripts/build-catalog.js';
import { computeEditorialReviewDigest, computePhotoPreparationDigest } from '../../scripts/lib/asset-identity.js';
import type { CatalogData } from '../../scripts/validate-content.js';
import type { Assessment, ArtworkRecord, PhotoRecord } from '../../src/shared/contracts.js';
import { DevelopmentCatalogSchema, PublicFileReceiptSchema, type DevelopmentCatalog, type PublicPreparedVersion } from '../../src/shared/public-catalog.js';

function pending<T>(value: T | null = null): Assessment<T> {
  return { value, confidence: 'unidentified', rationale: 'Private filename candidate, not a completed review.', evidence: [] };
}

function fixture(): CatalogData {
  const photo = (id: PhotoRecord['id'], order: number): PhotoRecord => ({
    id, sourceId: id, displayOrder: order, coverage: 'unreviewed', title: id,
    alt: 'Stained glass photograph', description: 'Description pending.',
    subjects: pending<string[]>(), location: pending<string>(), historicalEvidence: [],
  });
  const artwork = (id: ArtworkRecord['id'], number: number): ArtworkRecord => ({
    id, sourceId: id, bookNumber: number, title: id, publicDescription: 'Description pending.',
    subjects: pending<string[]>(), location: pending<string>(),
    originalPhoto: pending('photo-002'), citations: [],
  });
  return {
    project: { siteId: 'test', title: 'Test collection', projectVersion: '0.1.0', repositoryUrl: null, defaultBranch: 'main', releaseDateUtc: '2026-11-06T00:00:00.000Z' },
    manifest: { schemaVersion: 1, files: [
      { id: 'photo-002', role: 'photo', path: 'source/photos/private name.jpg', originalFilename: 'private name.jpg', bytes: 10, sha256: 'a'.repeat(64), width: 10, height: 20, provenance: { sourceId: 'private-collection', form: 'original-file', referenceUrl: 'https://drive.google.com/file/d/private/view' } },
      { id: 'design-002', role: 'coloring', path: 'source/coloring/002.png', originalFilename: '002.png', bytes: 20, sha256: 'b'.repeat(64), width: 10, height: 20, provenance: { sourceId: 'private-collection', form: 'original-file' } },
      { id: 'photo-001', role: 'photo', path: 'source/photos/001.jpg', originalFilename: '001.jpg', bytes: 10, sha256: 'c'.repeat(64), width: 10, height: 20, provenance: { sourceId: 'private-collection', form: 'original-file' } },
      { id: 'design-003', role: 'coloring', path: 'source/coloring/003.png', originalFilename: '003.png', bytes: 20, sha256: 'd'.repeat(64), width: 10, height: 20, provenance: { sourceId: 'private-collection', form: 'original-file' } },
    ] },
    photos: [photo('photo-002', 2), photo('photo-001', 1)],
    artworks: [artwork('design-002', 2), artwork('design-003', 1)],
    subjects: [], sources: [], reviews: [],
    book: { schemaVersion: 1, title: 'Test', coverSourceId: 'cover', printableCoverSourceId: null, coverLines: ['Test'], intro: ['Test'], sourcesText: ['Test'], artworkOrder: ['design-003', 'design-002'], page: { width: 612, height: 792, margin: 36 }, layoutVersion: 'letter-v1', fontSourceId: 'font' },
    media: { schemaVersion: 1, photo: { maxLongEdge: 2000, format: 'webp', quality: 90 }, thumbnail: { maxLongEdge: 320, format: 'webp', quality: 85 }, withoutEnlargement: true, algorithmVersion: 'web-images-v1' },
  };
}

const CONTENT_VERSION = 'e'.repeat(64);
const FILE_HASH = 'f'.repeat(64);

function preparedVersion(id: ArtworkRecord['id']): PublicPreparedVersion {
  return {
    contentVersion: CONTENT_VERSION,
    package: { path: `art/${id}/${CONTENT_VERSION}/package.json`, bytes: 100, sha256: FILE_HASH },
    canonical: { path: `art/${id}/${CONTENT_VERSION}/canonical.png`, bytes: 200, sha256: FILE_HASH },
    accessibility: { path: `accessibility/${id}/${CONTENT_VERSION}/${FILE_HASH}.json`, bytes: 100, sha256: FILE_HASH },
    keyboardNamesDraft: false, width: 10, height: 20, regionCount: 2, reviewState: 'complete',
  };
}

/** These are synthetic projection inputs; file integrity belongs to assets validation. */
function resourcesFor(data: CatalogData): CatalogResources {
  const sourceDigest = data.manifest.files.find(file => file.id === 'photo-002')!.sha256;
  const preparationDigest = computePhotoPreparationDigest(sourceDigest, data.media);
  return {
    artworks: {
      'design-002': { activeVersion: CONTENT_VERSION, versions: { [CONTENT_VERSION]: preparedVersion('design-002') } },
    },
    photos: {
      'photo-002': {
        sourceDigest, preparationDigest,
        web: { path: `public/photos/photo-002/${preparationDigest}/web.webp`, bytes: 100, sha256: FILE_HASH },
        thumbnail: { path: `public/photos/photo-002/${preparationDigest}/thumbnail.webp`, bytes: 50, sha256: FILE_HASH },
        width: 10, height: 20,
      },
    },
  };
}

function recordReview(data: CatalogData, id: string, kind: Parameters<typeof computeEditorialReviewDigest>[2]): void {
  data.reviews.push({
    schemaVersion: 1, recordId: id, reviewKind: kind,
    reviewedDigest: computeEditorialReviewDigest(data, id, kind),
    reviewer: 'Private fixture reviewer', reviewedAtUtc: '2026-11-06T00:00:00.000Z', outcome: 'complete',
  });
}

function reviewedFixture(confidence: 'confirmed' | 'likely' = 'confirmed'): CatalogData {
  const data = fixture();
  data.artworks.find(artwork => artwork.id === 'design-002')!.originalPhoto = {
    value: 'photo-002', confidence,
    rationale: 'Private synthetic comparison; this test makes no historical identification.',
    evidence: [{ sourceId: 'photo-002', section: 'Synthetic comparison' }],
  };
  recordReview(data, 'design-002', 'photo-pairing');
  return data;
}

function publishedFixture(): DevelopmentCatalog {
  const data = reviewedFixture();
  return projectDevelopmentCatalog(data, resourcesFor(data));
}

function publishedArtwork(catalog: DevelopmentCatalog) {
  return catalog.artworks.find(artwork => artwork.id === 'design-002')!;
}

function publishedPhoto(catalog: DevelopmentCatalog) {
  return catalog.photos.find(photo => photo.id === 'photo-002')!;
}

test('public draft withholds candidate associations, source paths, provenance and review notes', () => {
  const output = projectDevelopmentCatalog(fixture());
  expect(output.artworks.every(artwork => artwork.originalPhotoId === null && !artwork.available)).toBe(true);
  expect(output.photos.every(photo => photo.relatedArtworkIds.length === 0 && photo.image === null)).toBe(true);
  const serialized = JSON.stringify(output);
  for (const privateText of ['drive.google.com', 'private name.jpg', 'source/photos', 'Private filename', 'rationale', 'provenance']) {
    expect(serialized).not.toContain(privateText);
  }
});

test('public ordering follows explicit order while stable IDs and book numbers remain intact', () => {
  const output = projectDevelopmentCatalog(fixture());
  expect(output.photos.map(photo => photo.id)).toEqual(['photo-001', 'photo-002']);
  expect(output.artworks.map(artwork => [artwork.id, artwork.bookNumber])).toEqual([['design-003', 1], ['design-002', 2]]);
});

test('source digest ignores inventory order and captions, but detects changed source bytes', () => {
  const data = fixture();
  const before = projectDevelopmentCatalog(data).sourceSnapshotDigest;
  data.manifest.files.reverse();
  data.photos[0]!.title = 'A revised caption';
  expect(projectDevelopmentCatalog(data).sourceSnapshotDigest).toBe(before);
  data.manifest.files[0]!.sha256 = '0'.repeat(64);
  expect(projectDevelopmentCatalog(data).sourceSnapshotDigest).not.toBe(before);
});

test('a confident assertion or a stale receipt cannot publish an original-photo link', () => {
  const data = reviewedFixture();
  const resources = resourcesFor(data);
  data.reviews = [];
  let output = projectDevelopmentCatalog(data, resources);
  expect(publishedArtwork(output)).toMatchObject({ originalPhotoId: null, originalPhotoConfidence: null, pairingReviewState: 'pending' });
  expect(publishedPhoto(output).relatedArtworkIds).toEqual([]);

  recordReview(data, 'design-002', 'photo-pairing');
  data.reviews[0]!.reviewedDigest = '0'.repeat(64);
  output = projectDevelopmentCatalog(data, resources);
  expect(publishedArtwork(output)).toMatchObject({ originalPhotoId: null, originalPhotoConfidence: null, pairingReviewState: 'pending' });
  expect(publishedPhoto(output).relatedArtworkIds).toEqual([]);
});

test.each(['confirmed', 'likely'] as const)('a current %s pairing publishes the prepared photo and reciprocal link', confidence => {
  const data = reviewedFixture(confidence);
  const resources = resourcesFor(data);
  const output = projectDevelopmentCatalog(data, resources);
  expect(publishedArtwork(output)).toMatchObject({
    available: true, originalPhotoId: 'photo-002', originalPhotoConfidence: confidence,
    pairingReviewState: 'complete', activeVersion: CONTENT_VERSION,
  });
  expect(publishedPhoto(output)).toMatchObject({
    image: {
      web: { ...resources.photos['photo-002']!.web, path: resources.photos['photo-002']!.web.path.slice('public/'.length) },
      thumbnail: { ...resources.photos['photo-002']!.thumbnail, path: resources.photos['photo-002']!.thumbnail.path.slice('public/'.length) },
      width: 10, height: 20,
    },
    relatedArtworkIds: ['design-002'],
  });
  expect(publishedArtwork(output).location).toEqual({ value: null, confidence: 'unidentified', reviewState: 'pending' });
  expect(publishedPhoto(output).reviewState).toBe('pending');
  expect(JSON.stringify(output)).not.toMatch(/Private synthetic|Private fixture reviewer|reviewedDigest|reviewedAtUtc/u);
});

test('a completed unidentified review stays complete without manufacturing a photo association', () => {
  const data = fixture();
  data.artworks.find(artwork => artwork.id === 'design-002')!.originalPhoto = pending();
  recordReview(data, 'design-002', 'photo-pairing');
  const output = projectDevelopmentCatalog(data, resourcesFor(data));
  expect(publishedArtwork(output)).toMatchObject({ available: true, pairingReviewState: 'complete', originalPhotoId: null, originalPhotoConfidence: null });
  expect(publishedPhoto(output).relatedArtworkIds).toEqual([]);
});

test('a current pairing requires a published photo derivative before it exposes a visitor link', () => {
  const data = reviewedFixture();
  const resources = resourcesFor(data);
  delete resources.photos['photo-002'];
  const output = projectDevelopmentCatalog(data, resources);
  expect(publishedArtwork(output)).toMatchObject({ available: true, pairingReviewState: 'complete', originalPhotoId: null, originalPhotoConfidence: null });
  expect(publishedPhoto(output)).toMatchObject({ image: null, relatedArtworkIds: [] });
});

test('reverse links use reviewed associations, allow multiple drawings, and omit unavailable drawings', () => {
  const data = reviewedFixture();
  data.artworks.find(artwork => artwork.id === 'design-003')!.originalPhoto = structuredClone(data.artworks[0]!.originalPhoto);
  recordReview(data, 'design-003', 'photo-pairing');
  const resources = resourcesFor(data);
  let output = projectDevelopmentCatalog(data, resources);
  expect(output.artworks.find(artwork => artwork.id === 'design-003')).toMatchObject({ available: false, originalPhotoId: 'photo-002' });
  expect(publishedPhoto(output).relatedArtworkIds).toEqual(['design-002']);

  resources.artworks['design-003'] = { activeVersion: CONTENT_VERSION, versions: { [CONTENT_VERSION]: preparedVersion('design-003') } };
  output = projectDevelopmentCatalog(data, resources);
  expect(publishedPhoto(output).relatedArtworkIds).toEqual(['design-003', 'design-002']);
  expect(output.photos.find(photo => photo.id === 'photo-001')!.relatedArtworkIds).toEqual([]);
});

test.each(['photo-002', 'design-002'])('changing examined source bytes for %s invalidates the pairing receipt', sourceId => {
  const data = reviewedFixture();
  data.manifest.files.find(file => file.id === sourceId)!.sha256 = '0'.repeat(64);
  // Model derivatives already rebuilt for the new source. The old editorial
  // receipt must still be stale even though media preparation is current.
  const output = projectDevelopmentCatalog(data, resourcesFor(data));
  expect(publishedArtwork(output)).toMatchObject({ pairingReviewState: 'pending', originalPhotoId: null });
  expect(publishedPhoto(output).relatedArtworkIds).toEqual([]);
});

const pairingChanges: Array<[string, (data: CatalogData) => void]> = [
  ['confidence', data => { data.artworks[0]!.originalPhoto.confidence = 'likely'; }],
  ['selected photo', data => { data.artworks[0]!.originalPhoto.value = 'photo-001'; }],
  ['review rationale', data => { data.artworks[0]!.originalPhoto.rationale = 'A revised synthetic assessment.'; }],
  ['evidence locator', data => { data.artworks[0]!.originalPhoto.evidence[0]!.locator = 'A different part of the fixture'; }],
];

test.each(pairingChanges)('changing the pairing %s invalidates its receipt', (_label, change) => {
  const data = reviewedFixture();
  change(data);
  expect(publishedArtwork(projectDevelopmentCatalog(data, resourcesFor(data)))).toMatchObject({ pairingReviewState: 'pending', originalPhotoId: null, originalPhotoConfidence: null });
});

test('caption edits, filename changes, and unrelated media changes leave a pairing review current', () => {
  const data = reviewedFixture('likely');
  const before = projectDevelopmentCatalog(data, resourcesFor(data));
  data.artworks[0]!.title = 'A clearer drawing title';
  data.artworks[0]!.publicDescription = 'Revised public drawing text.';
  data.photos[0]!.title = 'A clearer photo title';
  data.photos[0]!.alt = 'Revised alternative text.';
  data.photos[0]!.description = 'Revised public photo text.';
  const selected = data.manifest.files.find(file => file.id === 'photo-002')!;
  selected.path = 'source/photos/renamed fixture.jpg';
  selected.originalFilename = 'renamed fixture.jpg';
  data.manifest.files.find(file => file.id === 'photo-001')!.sha256 = '0'.repeat(64);
  const after = projectDevelopmentCatalog(data, resourcesFor(data));
  expect(publishedArtwork(after)).toMatchObject({ title: 'A clearer photo title', description: 'Revised public drawing text.', pairingReviewState: 'complete', originalPhotoId: 'photo-002', originalPhotoConfidence: 'likely' });
  expect(publishedPhoto(after)).toMatchObject({ title: 'A clearer photo title', alt: 'Revised alternative text.', description: 'Revised public photo text.', relatedArtworkIds: ['design-002'] });
  expect(after.sourceSnapshotDigest).not.toBe(before.sourceSnapshotDigest);
});

test('changed historical evidence bytes invalidate only the review that examined them', () => {
  const data = reviewedFixture();
  data.manifest.files.push({
    id: 'fixture-history-file', role: 'history', path: 'source/histories/private-fixture.txt',
    originalFilename: 'private-fixture.txt', bytes: 40, sha256: '1'.repeat(64),
    provenance: { sourceId: 'fixture-history', form: 'transcription', referenceUrl: 'https://drive.google.com/file/d/private-history/view' },
  });
  data.sources.push({
    id: 'fixture-history', title: 'Fixture history', sourceFileId: 'fixture-history-file',
    form: 'transcription', citation: 'Fixture history citation', referenceUrl: 'https://drive.google.com/file/d/private-history/view',
  });
  const evidence = { sourceId: 'fixture-history', section: 'Synthetic section', locator: 'Paragraph 2', printedPage: '7' };
  data.photos[0]!.location = { value: 'Fixture room', confidence: 'likely', rationale: 'Private location reasoning.', evidence: [evidence] };
  data.photos[0]!.historicalEvidence = [evidence, evidence];
  recordReview(data, 'photo-002', 'location');
  const before = projectDevelopmentCatalog(data, resourcesFor(data));
  expect(publishedPhoto(before).location).toEqual({ value: 'Fixture room', confidence: 'likely', reviewState: 'complete' });
  expect(publishedPhoto(before).citations).toEqual(['Fixture history citation — Synthetic section — Paragraph 2 — Page 7']);
  expect(JSON.stringify(before)).not.toMatch(/private-fixture|drive.google.com|Private location reasoning/u);

  data.manifest.files.find(file => file.id === 'fixture-history-file')!.sha256 = '2'.repeat(64);
  const after = projectDevelopmentCatalog(data, resourcesFor(data));
  expect(publishedPhoto(after).location).toEqual({ value: null, confidence: 'unidentified', reviewState: 'pending' });
  expect(publishedArtwork(after)).toMatchObject({ pairingReviewState: 'complete', originalPhotoId: 'photo-002' });
});

test('a changed location assertion becomes pending without changing the independently reviewed pairing', () => {
  const data = reviewedFixture();
  data.artworks[0]!.location = { value: 'Fixture room', confidence: 'likely', rationale: 'Synthetic location assessment.', evidence: [] };
  recordReview(data, 'design-002', 'location');
  expect(publishedArtwork(projectDevelopmentCatalog(data, resourcesFor(data))).location).toEqual({ value: 'Fixture room', confidence: 'likely', reviewState: 'complete' });
  data.artworks[0]!.location.value = 'Another fixture room';
  expect(publishedArtwork(projectDevelopmentCatalog(data, resourcesFor(data)))).toMatchObject({
    pairingReviewState: 'complete', originalPhotoId: 'photo-002',
    location: { value: null, confidence: 'unidentified', reviewState: 'pending' },
  });
});

test.each([
  '../outside.webp', '/absolute.webp', 'public/photos/image.webp',
  'https://example.test/image.webp', '//example.test/image.webp',
  'photos\\image.webp', 'photos/../image.webp', 'photos//image.webp',
  'photos/%2e%2e/image.webp', 'photos/%252e%252e/image.webp',
  'photos%2fimage.webp', 'photos/image.webp?download=1', 'photos/image.webp#another',
])('public file receipts reject a filesystem or URL escape: %s', filePath => {
  expect(PublicFileReceiptSchema.safeParse({ path: filePath, bytes: 100, sha256: FILE_HASH }).success).toBe(false);
});

test('public file receipts accept unencoded portable names under the application root', () => {
  expect(PublicFileReceiptSchema.safeParse({ path: 'photos/window detail.webp', bytes: 100, sha256: FILE_HASH }).success).toBe(true);
});

const malformedCatalogs: Array<[string, (catalog: DevelopmentCatalog) => void]> = [
  ['duplicate photo IDs', catalog => { catalog.photos.push(structuredClone(publishedPhoto(catalog))); }],
  ['duplicate artwork IDs', catalog => { catalog.artworks.push(structuredClone(publishedArtwork(catalog))); }],
  ['an original photo missing from the catalog', catalog => { publishedArtwork(catalog).originalPhotoId = 'photo-999'; }],
  ['an original photo with no public image', catalog => { publishedPhoto(catalog).image = null; }],
  ['an original association without a current review', catalog => { publishedArtwork(catalog).pairingReviewState = 'pending'; }],
  ['a confidence value for a withheld photo', catalog => { publishedArtwork(catalog).originalPhotoId = null; publishedPhoto(catalog).relatedArtworkIds = []; }],
  ['a missing reverse link', catalog => { publishedPhoto(catalog).relatedArtworkIds = []; }],
  ['a duplicate reverse link', catalog => { publishedPhoto(catalog).relatedArtworkIds.push('design-002'); }],
  ['a reverse link to a missing artwork', catalog => { publishedPhoto(catalog).relatedArtworkIds.push('design-999'); }],
  ['a reverse link on the wrong photo', catalog => { catalog.photos.find(photo => photo.id === 'photo-001')!.relatedArtworkIds = ['design-002']; }],
  ['an active version absent from its map', catalog => { publishedArtwork(catalog).activeVersion = '0'.repeat(64); }],
  ['a version key that disagrees with contentVersion', catalog => { publishedArtwork(catalog).versions[CONTENT_VERSION]!.contentVersion = '0'.repeat(64); }],
  ['prepared versions without an active version', catalog => { publishedArtwork(catalog).activeVersion = null; publishedArtwork(catalog).available = false; publishedArtwork(catalog).availabilityMessage = 'Not ready.'; }],
  ['a review state that disagrees with the active version', catalog => { publishedArtwork(catalog).reviewState = 'pending'; }],
  ['an unavailable message on an available drawing', catalog => { publishedArtwork(catalog).availabilityMessage = 'Not ready.'; }],
  ['completed review of draft keyboard names', catalog => { publishedArtwork(catalog).versions[CONTENT_VERSION]!.keyboardNamesDraft = true; }],
  ['a claimed but unreviewed location', catalog => { publishedPhoto(catalog).location = { value: 'Fixture room', confidence: 'likely', reviewState: 'pending' }; }],
  ['an unidentified location with a claimed value', catalog => { publishedPhoto(catalog).location = { value: 'Fixture room', confidence: 'unidentified', reviewState: 'complete' }; }],
  ['a confirmed location without a value', catalog => { publishedPhoto(catalog).location = { value: null, confidence: 'confirmed', reviewState: 'complete' }; }],
  ['an unsafe nested image URL', catalog => { publishedPhoto(catalog).image!.web.path = 'photos/%2e%2e/outside.webp'; }],
];

test.each(malformedCatalogs)('the browser contract rejects %s', (_label, change) => {
  const catalog = publishedFixture();
  change(catalog);
  expect(DevelopmentCatalogSchema.safeParse(catalog).success).toBe(false);
});

test('the public contract rejects accidental private fields instead of silently passing them through', () => {
  const catalog = publishedFixture();
  const raw: unknown = { ...catalog, acquisition: { referenceUrl: 'https://drive.google.com/file/d/private/view' } };
  expect(DevelopmentCatalogSchema.safeParse(raw).success).toBe(false);
  const photo = publishedPhoto(catalog);
  Object.assign(photo, { rationale: 'Private review notes' });
  expect(DevelopmentCatalogSchema.safeParse(catalog).success).toBe(false);
});
