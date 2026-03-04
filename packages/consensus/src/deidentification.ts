/**
 * De-identification engine for blind cross-review rounds.
 *
 * Assigns random analyst labels (A, B, C, ...) and strips provider
 * identity from analyses before passing them to the next round.
 */

import type { RoundAnalysis, AnalystLabelMapping } from './types.js';

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Assign randomized analyst labels for a set of analyses.
 * Returns a mapping of label → providerId for audit trail.
 */
export function assignAnalystLabels(
  roundId: string,
  analyses: RoundAnalysis[],
): AnalystLabelMapping[] {
  // Shuffle indices for randomization
  const indices = analyses.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return indices.map((originalIdx, labelIdx) => ({
    roundId,
    analystLabel: LABELS[labelIdx] || `Analyst-${labelIdx + 1}`,
    providerId: analyses[originalIdx].providerId,
    personaId: analyses[originalIdx].personaId,
  }));
}

/**
 * Prepare de-identified analyses for cross-review.
 * Strips provider/persona info and replaces with analyst labels.
 */
export function deIdentifyAnalyses(
  analyses: RoundAnalysis[],
  labelMappings: AnalystLabelMapping[],
): Array<{ analystLabel: string; response: RoundAnalysis['response'] }> {
  const providerToLabel = new Map<string, string>();
  for (const mapping of labelMappings) {
    providerToLabel.set(mapping.providerId, mapping.analystLabel);
  }

  return analyses
    .filter(a => a.response && a.status === 'complete')
    .map(a => ({
      analystLabel: providerToLabel.get(a.providerId) || 'Unknown',
      response: a.response,
    }));
}
