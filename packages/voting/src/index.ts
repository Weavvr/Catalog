/**
 * @hmc/voting - Weighted scoring and judging system
 *
 * Provides:
 * - Configurable scoring dimensions (default: 5 × 5-point scale)
 * - Entry management with finalist filtering
 * - Judge assignment and role management
 * - Score finalization workflow (draft → final, immutable after finalize)
 * - Results aggregation with category awards
 * - Completion gates (judges must score ALL entries before viewing results)
 *
 * Uses adapter pattern for database persistence.
 */

import { createLogger } from '@hmc/logger';

const logger = createLogger('voting');

// ── Types ───────────────────────────────────────────────────────

export interface ScoringDimension {
  key: string;
  label: string;
  description: string;
  minScore: number;
  maxScore: number;
  weight: number;
}

export const DEFAULT_DIMENSIONS: ScoringDimension[] = [
  { key: 'impact', label: 'Impact', description: 'Business value, cost savings, revenue potential', minScore: 1, maxScore: 5, weight: 1 },
  { key: 'strategic_alignment', label: 'Strategic Alignment', description: 'Alignment with organizational objectives', minScore: 1, maxScore: 5, weight: 1 },
  { key: 'feasibility', label: 'Feasibility', description: 'Resource requirements, technical complexity, timeline', minScore: 1, maxScore: 5, weight: 1 },
  { key: 'clarity_quality', label: 'Clarity & Quality', description: 'Explanation depth, actionability, professionalism', minScore: 1, maxScore: 5, weight: 1 },
  { key: 'innovation', label: 'Innovation', description: 'Originality, creativity, breakthrough potential', minScore: 1, maxScore: 5, weight: 1 },
];

export interface Entry {
  id: string;
  title: string;
  description: string;
  submitter: string;
  department?: string;
  isFinalist: boolean;
  attachments?: Array<{ name: string; url: string; type: string }>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Judge {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isJudge: boolean;
}

export interface Score {
  id: string;
  judgeId: string;
  entryId: string;
  scores: Record<string, number>;
  comments?: string;
  isFinal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AggregatedResult {
  entryId: string;
  title: string;
  submitter: string;
  department?: string;
  averages: Record<string, number>;
  averageTotal: number;
  judgeCount: number;
}

export interface CategoryAward {
  category: string;
  label: string;
  entryId: string;
  entryTitle: string;
  score: number;
}

// ── DB Adapter ──────────────────────────────────────────────────

export interface VotingDbAdapter {
  getEntries(options?: { finalistsOnly?: boolean }): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | null>;
  createEntry(entry: Omit<Entry, 'id' | 'createdAt'>): Promise<Entry>;
  updateEntry(id: string, updates: Partial<Entry>): Promise<Entry | null>;
  deleteEntry(id: string): Promise<void>;

  getJudge(id: string): Promise<Judge | null>;
  getJudges(): Promise<Judge[]>;

  getScoresByJudge(judgeId: string): Promise<Score[]>;
  getScoresByEntry(entryId: string): Promise<Score[]>;
  upsertScore(score: Omit<Score, 'id' | 'createdAt' | 'updatedAt'>): Promise<Score>;
  deleteScore(judgeId: string, entryId: string): Promise<void>;
}

// ── Service ─────────────────────────────────────────────────────

let adapter: VotingDbAdapter | null = null;
let dimensions: ScoringDimension[] = DEFAULT_DIMENSIONS;

export function initVoting(dbAdapter: VotingDbAdapter, customDimensions?: ScoringDimension[]): void {
  adapter = dbAdapter;
  if (customDimensions) dimensions = customDimensions;
  logger.info('Voting system initialized', { dimensions: dimensions.length });
}

function getAdapter(): VotingDbAdapter {
  if (!adapter) throw new Error('Voting not initialized. Call initVoting() first.');
  return adapter;
}

export function getScoringDimensions(): ScoringDimension[] {
  return [...dimensions];
}

/**
 * Submit or update a score. Rejects if the existing score is already finalized.
 */
export async function submitScore(
  judgeId: string,
  entryId: string,
  scores: Record<string, number>,
  options?: { comments?: string; isFinal?: boolean },
): Promise<Score> {
  const db = getAdapter();

  // Validate score dimensions
  for (const dim of dimensions) {
    const value = scores[dim.key];
    if (value === undefined) {
      throw new Error(`Missing score for dimension: ${dim.key}`);
    }
    if (value < dim.minScore || value > dim.maxScore) {
      throw new Error(`Score for ${dim.key} must be between ${dim.minScore} and ${dim.maxScore}`);
    }
  }

  // Check if already finalized
  const existing = (await db.getScoresByJudge(judgeId)).find(s => s.entryId === entryId);
  if (existing?.isFinal) {
    throw new Error('Score already finalized and cannot be modified');
  }

  const score = await db.upsertScore({
    judgeId,
    entryId,
    scores,
    comments: options?.comments,
    isFinal: options?.isFinal ?? false,
  });

  logger.info('Score submitted', { judgeId, entryId, isFinal: score.isFinal });
  return score;
}

/**
 * Check if a judge has finalized all eligible entries.
 */
export async function isJudgeComplete(judgeId: string): Promise<{
  complete: boolean;
  finalized: number;
  total: number;
}> {
  const db = getAdapter();
  const entries = await db.getEntries({ finalistsOnly: true });
  const scores = await db.getScoresByJudge(judgeId);
  const finalizedScores = scores.filter(s => s.isFinal);

  return {
    complete: finalizedScores.length >= entries.length,
    finalized: finalizedScores.length,
    total: entries.length,
  };
}

/**
 * Aggregate results across all judges. Only counts finalized scores.
 */
export async function getResults(): Promise<AggregatedResult[]> {
  const db = getAdapter();
  const entries = await db.getEntries();
  const results: AggregatedResult[] = [];

  for (const entry of entries) {
    const scores = await db.getScoresByEntry(entry.id);
    const finalScores = scores.filter(s => s.isFinal);

    if (finalScores.length === 0) {
      results.push({
        entryId: entry.id,
        title: entry.title,
        submitter: entry.submitter,
        department: entry.department,
        averages: {},
        averageTotal: 0,
        judgeCount: 0,
      });
      continue;
    }

    const averages: Record<string, number> = {};
    let weightedTotal = 0;
    let totalWeight = 0;

    for (const dim of dimensions) {
      const values = finalScores.map(s => s.scores[dim.key]).filter(v => v !== undefined);
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      averages[dim.key] = Math.round(avg * 100) / 100;
      weightedTotal += avg * dim.weight;
      totalWeight += dim.weight;
    }

    results.push({
      entryId: entry.id,
      title: entry.title,
      submitter: entry.submitter,
      department: entry.department,
      averages,
      averageTotal: totalWeight > 0 ? Math.round((weightedTotal / totalWeight) * 100) / 100 : 0,
      judgeCount: finalScores.length,
    });
  }

  return results.sort((a, b) => b.averageTotal - a.averageTotal);
}

/**
 * Get category awards (best score per dimension).
 */
export async function getCategoryAwards(): Promise<CategoryAward[]> {
  const results = await getResults();
  const awards: CategoryAward[] = [];

  for (const dim of dimensions) {
    const best = results
      .filter(r => r.averages[dim.key] !== undefined && r.judgeCount > 0)
      .sort((a, b) => (b.averages[dim.key] || 0) - (a.averages[dim.key] || 0))[0];

    if (best) {
      awards.push({
        category: dim.key,
        label: dim.label,
        entryId: best.entryId,
        entryTitle: best.title,
        score: best.averages[dim.key] || 0,
      });
    }
  }

  return awards;
}
