import sharp from 'sharp';
import type { AccessibilityMetadata, EffectiveSegmentation } from '../../src/shared/assets.js';
import type { EvidenceRef, MediaConfig, ReviewReceipt } from '../../src/shared/contracts.js';
import type { CatalogData } from '../validate-content.js';
import { canonicalJson, sha256Bytes } from './digests.js';
import { CliError } from './cli.js';

export interface PreparationIdentityInput {
  width: number;
  height: number;
  settings: EffectiveSegmentation;
  canonicalSha256: string;
  domainMaskSha256: string;
  barrierAddMaskSha256: string;
  barrierRemoveMaskSha256: string;
}
export interface ContentIdentityInput extends PreparationIdentityInput {
  hitLabelsSha256: string;
  paintLabelsSha256: string;
  inkAlphaSha256: string;
}

// Explicit fields prevent accidental inclusion of notes, filenames, timestamps,
// source-container metadata, captions, or other incidental object properties.
function identityFields(input: PreparationIdentityInput) {
  return {
    width: input.width, height: input.height,
    settings: {
      algorithmVersion: input.settings.algorithmVersion,
      normalizationVersion: input.settings.normalizationVersion,
      inkThreshold: input.settings.inkThreshold,
      excludedSeedPoints: input.settings.excludedSeedPoints,
    },
    canonicalSha256: input.canonicalSha256,
    domainMaskSha256: input.domainMaskSha256,
    barrierAddMaskSha256: input.barrierAddMaskSha256,
    barrierRemoveMaskSha256: input.barrierRemoveMaskSha256,
  };
}

export function computeContentVersion(input: ContentIdentityInput): string {
  return sha256Bytes(canonicalJson({
    kind: 'fcc-region-content-v1', ...identityFields(input),
    hitLabelsSha256: input.hitLabelsSha256,
    paintLabelsSha256: input.paintLabelsSha256,
    inkAlphaSha256: input.inkAlphaSha256,
  }));
}

export function computePreparationDigest(sourceDigest: string, input: PreparationIdentityInput): string {
  return sha256Bytes(canonicalJson({ kind: 'fcc-region-preparation-v1', sourceDigest, ...identityFields(input) }));
}

export const PHOTO_ENCODER_VERSION = `sharp-${sharp.versions.sharp};vips-${sharp.versions.vips};webp-${sharp.versions.webp ?? 'unknown'}`;
export function computePhotoPreparationDigest(sourceDigest: string, media: MediaConfig, encoderVersion = PHOTO_ENCODER_VERSION): string {
  return sha256Bytes(canonicalJson({
    kind: 'fcc-photo-preparation-v1', sourceDigest, encoderVersion,
    algorithmVersion: media.algorithmVersion,
    autoOrient: true, colourspace: 'srgb', preserveComposition: true,
    withoutEnlargement: media.withoutEnlargement,
    photo: { maxLongEdge: media.photo.maxLongEdge, format: media.photo.format, quality: media.photo.quality },
    thumbnail: { maxLongEdge: media.thumbnail.maxLongEdge, format: media.thumbnail.format, quality: media.thumbnail.quality },
  }));
}

type EditorialKind = 'photo-pairing' | 'subject' | 'location';
function sorted<T extends { id: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function sourceHashes(data: CatalogData, sourceIds: Iterable<string>) {
  const files = new Map(data.manifest.files.map(file => [file.id, file]));
  return sorted([...new Set(sourceIds)].map(id => {
    const source = files.get(id);
    if (!source) throw new CliError('E_REVIEW_SOURCE', `Review evidence references missing source file ${id}.`, 3);
    return { id, sha256: source.sha256 };
  }));
}

function evidenceSourceIds(data: CatalogData, evidence: readonly EvidenceRef[]): string[] {
  const citations = new Map(data.sources.map(source => [source.id, source]));
  const files = new Set(data.manifest.files.map(file => file.id));
  const result: string[] = [];
  for (const ref of evidence) {
    if (files.has(ref.sourceId)) { result.push(ref.sourceId); continue; }
    const citation = citations.get(ref.sourceId);
    if (!citation) throw new CliError('E_REVIEW_EVIDENCE', `Review evidence references missing citation source ${ref.sourceId}.`, 3);
    if (citation.sourceFileId) result.push(citation.sourceFileId);
  }
  return result;
}

export function computeEditorialReviewDigest(data: CatalogData, recordId: string, kind: EditorialKind): string {
  const record = data.artworks.find(item => item.id === recordId) ?? data.photos.find(item => item.id === recordId);
  if (!record) throw new CliError('E_REVIEW_RECORD', `Cannot review missing record ${recordId}.`, 3);
  const isArtwork = 'originalPhoto' in record;
  const selectedMedia = [record.sourceId];
  if (isArtwork && record.originalPhoto.value) {
    const photo = data.photos.find(item => item.id === record.originalPhoto.value);
    if (!photo) throw new CliError('E_REVIEW_PHOTO', `Photo association references missing ${record.originalPhoto.value}.`, 3);
    selectedMedia.push(photo.sourceId);
  }
  if (kind === 'photo-pairing') {
    if (!isArtwork) throw new CliError('E_REVIEW_KIND', 'Photo-pairing reviews belong to artwork records.', 3);
    return sha256Bytes(canonicalJson({
      kind: 'fcc-editorial-review-v1', recordId, reviewKind: kind,
      assertion: record.originalPhoto,
      sourceHashes: sourceHashes(data, [...selectedMedia, ...evidenceSourceIds(data, record.originalPhoto.evidence)]),
    }));
  }
  const assessment = kind === 'subject' ? record.subjects : record.location;
  const subjectIds = kind === 'subject' ? (record.subjects.value ?? []) : [];
  const subjects = sorted(subjectIds.map(id => {
    const subject = data.subjects.find(item => item.id === id);
    if (!subject) throw new CliError('E_REVIEW_SUBJECT', `Review references missing historical subject ${id}.`, 3);
    return subject;
  }));
  const evidence = [...assessment.evidence, ...subjects.flatMap(subject => subject.evidence)];
  return sha256Bytes(canonicalJson({
    kind: 'fcc-editorial-review-v1', recordId, reviewKind: kind,
    assertion: assessment,
    subjects,
    sourceHashes: sourceHashes(data, [...selectedMedia, ...evidenceSourceIds(data, evidence)]),
  }));
}

export function hasCurrentEditorialReview(data: CatalogData, recordId: string, kind: EditorialKind): boolean {
  const digest = computeEditorialReviewDigest(data, recordId, kind);
  return data.reviews.some(review => review.recordId === recordId && review.reviewKind === kind
    && review.outcome === 'complete' && review.reviewedDigest === digest);
}

export function computeKeyboardMetadataDigest(metadata: AccessibilityMetadata): string {
  return sha256Bytes(canonicalJson(metadata));
}

export function computeSegmentationReviewDigest(artworkId: string, contentVersion: string, keyboardMetadataDigest: string): string {
  return sha256Bytes(canonicalJson({ kind: 'fcc-segmentation-review-v1', artworkId, contentVersion, keyboardMetadataDigest }));
}

export function hasCurrentSegmentationReview(
  reviews: readonly ReviewReceipt[], artworkId: string, contentVersion: string, keyboardMetadataDigest: string,
): boolean {
  const reviewedDigest = computeSegmentationReviewDigest(artworkId, contentVersion, keyboardMetadataDigest);
  return reviews.some(review => review.recordId === artworkId && review.reviewKind === 'segmentation'
    && review.outcome === 'complete' && review.contentVersion === contentVersion
    && review.keyboardMetadataDigest === keyboardMetadataDigest && review.reviewedDigest === reviewedDigest);
}
