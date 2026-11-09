/** Stable identities are independent of captions, gallery order, and book numbering. */
export type PhotoId = `photo-${string}`;
export type ArtworkId = `design-${string}`;
export type Confidence = 'confirmed' | 'likely' | 'unidentified';

export const EXPECTED_PHOTO_IDS: readonly PhotoId[] = Object.freeze(
  Array.from({ length: 55 }, (_, i) => `photo-${String(i + 1).padStart(3, '0')}` as PhotoId),
);
export const EXPECTED_ARTWORK_IDS: readonly ArtworkId[] = Object.freeze(
  Array.from({ length: 48 }, (_, i) => `design-${String(i + 2).padStart(3, '0')}` as ArtworkId),
);

export interface EvidenceRef {
  sourceId: string;
  section: string;
  locator?: string;
  printedPage?: string;
}

/** Completion is derived from content/reviews, never edited on an assessment. */
export interface Assessment<T> {
  value: T | null;
  confidence: Confidence;
  rationale: string;
  evidence: EvidenceRef[];
}

export interface PhotoRecord {
  id: PhotoId;
  sourceId: string;
  displayOrder: number;
  coverage: 'whole-window' | 'panels' | 'panel' | 'detail' | 'unreviewed';
  title: string;
  alt: string;
  description: string;
  extendedDescription?: string;
  subjects: Assessment<string[]>;
  location: Assessment<string>;
  historicalEvidence: EvidenceRef[];
}

export interface ArtworkRecord {
  id: ArtworkId;
  sourceId: string;
  bookNumber: number;
  title: string;
  publicDescription: string;
  originalPhoto: Assessment<PhotoId>;
  subjects: Assessment<string[]>;
  location: Assessment<string>;
  citations: EvidenceRef[];
}

export interface HistoricalSubject {
  id: string;
  sourceId: string;
  section: string;
  windowNumber?: number;
  subjectNumber?: number;
  sourceLabel: string;
  title: string;
  sourceLocation?: string;
  designer?: string;
  memorial?: string;
  evidence: EvidenceRef[];
}

export interface CitationSource {
  id: string;
  title: string;
  sourceFileId?: string;
  form: 'transcription' | 'original-file' | 'prepared-art' | 'collection';
  citation: string;
  referenceUrl?: string;
}

export interface ProjectConfig {
  siteId: string;
  title: string;
  projectVersion: string;
  repositoryUrl: string | null;
  defaultBranch: string;
  releaseDateUtc: string;
  customDomain?: string | null;
}

export interface BookConfig {
  schemaVersion: 1;
  title: string;
  coverSourceId: string;
  printableCoverSourceId: string | null;
  coverLines: string[];
  intro: string[];
  sourcesText: string[];
  artworkOrder: ArtworkId[];
  page: { width: number; height: number; margin: number };
  layoutVersion: string;
  fontSourceId: string;
}

export interface MediaConfig {
  schemaVersion: 1;
  photo: { maxLongEdge: number; format: 'webp'; quality: number };
  thumbnail: { maxLongEdge: number; format: 'webp'; quality: number };
  withoutEnlargement: true;
  algorithmVersion: string;
}

export interface ReviewReceipt {
  schemaVersion: 1;
  recordId: string;
  reviewKind: 'photo-pairing' | 'subject' | 'location' | 'segmentation';
  reviewedDigest: string;
  reviewer: string;
  reviewedAtUtc: string;
  outcome: 'complete';
  contentVersion?: string;
  keyboardMetadataDigest?: string;
}

export interface ValidationIssue {
  code: string;
  file: string;
  message: string;
  recordId?: string;
  field?: string;
  command?: string;
}
