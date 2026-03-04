/**
 * Quality checks for council analyses.
 */

import type { AnalysisResponse, QualityThresholds, DEFAULT_QUALITY_THRESHOLDS } from './types.js';

/**
 * Check if an analysis response is empty or missing key fields.
 */
export function isAnalysisEmpty(response: AnalysisResponse | null): boolean {
  if (!response) return true;
  if (!response.summary || response.summary.trim().length === 0) return true;
  if (response.recommendation === undefined) return true;
  return false;
}

/**
 * Check if an analysis response meets minimum quality thresholds.
 */
export function isAnalysisLowQuality(
  response: AnalysisResponse,
  thresholds: QualityThresholds = {
    minSummaryLength: 100,
    minDetailLength: 500,
    minConfidenceScore: 0.01,
  },
): { lowQuality: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (response.summary.length < thresholds.minSummaryLength) {
    reasons.push(`Summary too short (${response.summary.length} < ${thresholds.minSummaryLength} chars)`);
  }

  if (response.detailedAnalysis && response.detailedAnalysis.length < thresholds.minDetailLength) {
    reasons.push(`Detail too short (${response.detailedAnalysis.length} < ${thresholds.minDetailLength} chars)`);
  }

  if (response.confidenceScore < thresholds.minConfidenceScore) {
    reasons.push(`Confidence too low (${response.confidenceScore} < ${thresholds.minConfidenceScore})`);
  }

  return { lowQuality: reasons.length > 0, reasons };
}

/**
 * Build retry instructions when analysis quality is insufficient.
 */
export function buildRetryInstructions(reasons: string[]): string {
  return [
    'Your previous analysis did not meet quality thresholds. Please provide a more thorough analysis.',
    'Issues:',
    ...reasons.map(r => `  - ${r}`),
    '',
    'Please ensure your response includes:',
    '  - A detailed summary (100+ characters)',
    '  - Thorough analysis with specific examples',
    '  - A clear recommendation with confidence score',
  ].join('\n');
}
