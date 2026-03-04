/**
 * @hmc/document-processing - Document extraction, classification, and embeddings
 *
 * Provides:
 * - Text extraction from DOCX, PDF, PPTX, XLSX files
 * - Document classification (NDA type, jurisdiction, clauses)
 * - Embedding generation with pluggable providers
 * - Redline/track-changes support for DOCX
 *
 * Uses adapter pattern for embedding storage and classification customization.
 */

import { createLogger } from '@hmc/logger';

const logger = createLogger('document-processing');

// ── Text Extraction Types ───────────────────────────────────────

export type SupportedFormat = 'docx' | 'doc' | 'pdf' | 'pptx' | 'xlsx' | 'txt';

export interface ExtractionResult {
  text: string;
  format: SupportedFormat;
  pageCount?: number;
  wordCount: number;
  metadata?: Record<string, unknown>;
}

export interface ExtractionProvider {
  extractFromBuffer(buffer: Buffer, format: SupportedFormat): Promise<ExtractionResult>;
}

// ── Classification Types ────────────────────────────────────────

export type NDAType = 'mutual' | 'one_way_disclosing' | 'one_way_receiving' | 'unknown';
export type Jurisdiction = 'us_state' | 'uk' | 'eu' | 'international' | 'unknown';

export interface DetectedClause {
  type: string;
  startOffset: number;
  endOffset: number;
  confidence: number;
  text: string;
}

export interface ClassificationResult {
  ndaType: NDAType;
  ndaTypeConfidence: number;
  jurisdiction: Jurisdiction;
  jurisdictionConfidence: number;
  governingLaw?: string;
  detectedClauses: DetectedClause[];
  partyCount: number;
  hasArbitrationClause: boolean;
  hasNonSolicitClause: boolean;
  hasNonCompeteClause: boolean;
  termYears?: number;
}

// ── Embedding Types ─────────────────────────────────────────────

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  tokenCount: number;
}

export type EmbeddingSourceType = 'document_clause' | 'common_edit' | 'full_document' | 'custom';

export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<EmbeddingResult>;
  generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]>;
}

export interface EmbeddingStorageAdapter {
  store(params: {
    entityType: EmbeddingSourceType;
    entityId: string;
    embedding: number[];
    text: string;
    model: string;
  }): Promise<void>;
  search(params: {
    embedding: number[];
    entityType?: EmbeddingSourceType;
    limit?: number;
    threshold?: number;
  }): Promise<Array<{ entityId: string; entityType: string; text: string; similarity: number }>>;
}

// ── Redline Types ───────────────────────────────────────────────

export interface DocumentEdit {
  oldText: string;
  newText: string;
  context?: string;
  editType?: string;
  source?: string;
}

export interface RedlineResult {
  originalText: string;
  edits: DocumentEdit[];
  editCount: number;
}

// ── Service State ───────────────────────────────────────────────

let extractionProvider: ExtractionProvider | null = null;
let embeddingProvider: EmbeddingProvider | null = null;
let embeddingStorage: EmbeddingStorageAdapter | null = null;

export function initDocumentProcessing(options: {
  extraction?: ExtractionProvider;
  embedding?: EmbeddingProvider;
  embeddingStorage?: EmbeddingStorageAdapter;
}): void {
  if (options.extraction) extractionProvider = options.extraction;
  if (options.embedding) embeddingProvider = options.embedding;
  if (options.embeddingStorage) embeddingStorage = options.embeddingStorage;
  logger.info('Document processing initialized');
}

// ── Text Extraction ─────────────────────────────────────────────

/**
 * Extract text from a document buffer.
 */
export async function extractText(buffer: Buffer, format: SupportedFormat): Promise<ExtractionResult> {
  if (!extractionProvider) {
    throw new Error('Extraction provider not initialized. Call initDocumentProcessing().');
  }
  const result = await extractionProvider.extractFromBuffer(buffer, format);
  logger.info('Text extracted', { format, wordCount: result.wordCount });
  return result;
}

/**
 * Detect file format from filename extension.
 */
export function detectFormat(filename: string): SupportedFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  const formats: Record<string, SupportedFormat> = {
    docx: 'docx', doc: 'doc', pdf: 'pdf',
    pptx: 'pptx', xlsx: 'xlsx', txt: 'txt',
  };
  return formats[ext || ''] || null;
}

// ── Classification ──────────────────────────────────────────────

const NDA_MUTUAL_PATTERNS = [
  /mutual/i, /reciprocal/i, /each party/i, /both parties/i,
  /disclosing party.*receiving party.*and.*receiving party.*disclosing party/is,
];

const NDA_ONE_WAY_PATTERNS = [
  /the disclosing party/i, /one[- ]way/i,
  /(?:company|employer|corporation).*(?:shall not|agrees to|will not).*disclose/i,
];

const JURISDICTION_PATTERNS: Array<{ pattern: RegExp; jurisdiction: Jurisdiction; law?: string }> = [
  { pattern: /governed by.*laws? of.*(?:state of\s+)?(\w[\w\s]*)/i, jurisdiction: 'us_state' },
  { pattern: /english law/i, jurisdiction: 'uk', law: 'English Law' },
  { pattern: /laws? of England/i, jurisdiction: 'uk', law: 'English Law' },
  { pattern: /(?:EU|European Union) (?:law|regulation)/i, jurisdiction: 'eu' },
  { pattern: /GDPR/i, jurisdiction: 'eu' },
];

const CLAUSE_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'arbitration', pattern: /arbitrat(?:ion|e)/i },
  { type: 'non_solicit', pattern: /non[- ]?solicit/i },
  { type: 'non_compete', pattern: /non[- ]?compet/i },
  { type: 'indemnification', pattern: /indemnif/i },
  { type: 'termination', pattern: /terminat(?:ion|e)/i },
  { type: 'confidentiality', pattern: /confidential/i },
  { type: 'intellectual_property', pattern: /intellectual property|IP rights/i },
  { type: 'data_protection', pattern: /data protection|personal data/i },
];

/**
 * Classify a document based on its text content.
 */
export function classifyDocument(text: string): ClassificationResult {
  // NDA Type
  const isMutual = NDA_MUTUAL_PATTERNS.some(p => p.test(text));
  const isOneWay = NDA_ONE_WAY_PATTERNS.some(p => p.test(text));
  const ndaType: NDAType = isMutual ? 'mutual' : isOneWay ? 'one_way_disclosing' : 'unknown';
  const ndaTypeConfidence = isMutual || isOneWay ? 0.85 : 0.3;

  // Jurisdiction
  let jurisdiction: Jurisdiction = 'unknown';
  let jurisdictionConfidence = 0.3;
  let governingLaw: string | undefined;
  for (const jp of JURISDICTION_PATTERNS) {
    const match = text.match(jp.pattern);
    if (match) {
      jurisdiction = jp.jurisdiction;
      jurisdictionConfidence = 0.8;
      governingLaw = jp.law || match[1]?.trim();
      break;
    }
  }

  // Clauses
  const detectedClauses: DetectedClause[] = [];
  for (const cp of CLAUSE_PATTERNS) {
    const matches = text.matchAll(new RegExp(cp.pattern, 'gi'));
    for (const match of matches) {
      if (match.index !== undefined) {
        detectedClauses.push({
          type: cp.type,
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          confidence: 0.75,
          text: text.slice(Math.max(0, match.index - 50), match.index + match[0].length + 50),
        });
      }
    }
  }

  // Party count (heuristic)
  const partyMatches = text.match(/(?:party|parties|between|and|Company|Recipient|Disclos)/gi);
  const partyCount = Math.min(Math.max(2, (partyMatches?.length || 0) > 10 ? 3 : 2), 5);

  // Term
  const termMatch = text.match(/(\d+)\s*(?:year|yr)/i);
  const termYears = termMatch ? parseInt(termMatch[1], 10) : undefined;

  return {
    ndaType, ndaTypeConfidence,
    jurisdiction, jurisdictionConfidence,
    governingLaw,
    detectedClauses,
    partyCount,
    hasArbitrationClause: detectedClauses.some(c => c.type === 'arbitration'),
    hasNonSolicitClause: detectedClauses.some(c => c.type === 'non_solicit'),
    hasNonCompeteClause: detectedClauses.some(c => c.type === 'non_compete'),
    termYears,
  };
}

/**
 * Get a human-readable summary of classification results.
 */
export function getClassificationSummary(result: ClassificationResult): string {
  const parts = [
    `Type: ${result.ndaType} (${Math.round(result.ndaTypeConfidence * 100)}%)`,
    `Jurisdiction: ${result.jurisdiction}${result.governingLaw ? ` (${result.governingLaw})` : ''}`,
    `Parties: ${result.partyCount}`,
    `Clauses: ${result.detectedClauses.length} detected`,
  ];
  if (result.termYears) parts.push(`Term: ${result.termYears} years`);
  return parts.join(' | ');
}

// ── Embeddings ──────────────────────────────────────────────────

/**
 * Generate and optionally store embeddings for text.
 */
export async function generateAndStoreEmbedding(
  text: string,
  entityType: EmbeddingSourceType,
  entityId: string,
  model: string = 'text-embedding-ada-002',
): Promise<EmbeddingResult> {
  if (!embeddingProvider) throw new Error('Embedding provider not initialized.');

  const result = await embeddingProvider.generateEmbedding(text);

  if (embeddingStorage) {
    await embeddingStorage.store({ entityType, entityId, embedding: result.embedding, text, model });
  }

  return result;
}

/**
 * Search for similar documents/clauses by embedding.
 */
export async function searchSimilar(
  queryText: string,
  options?: { entityType?: EmbeddingSourceType; limit?: number; threshold?: number },
): Promise<Array<{ entityId: string; entityType: string; text: string; similarity: number }>> {
  if (!embeddingProvider) throw new Error('Embedding provider not initialized.');
  if (!embeddingStorage) throw new Error('Embedding storage not initialized.');

  const queryEmbedding = await embeddingProvider.generateEmbedding(queryText);
  return embeddingStorage.search({
    embedding: queryEmbedding.embedding,
    entityType: options?.entityType,
    limit: options?.limit || 10,
    threshold: options?.threshold || 0.7,
  });
}
