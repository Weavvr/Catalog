/**
 * @hmc/consensus - Multi-round council deliberation engine
 *
 * Provides:
 * - Multi-round analysis pipeline (initial → risk → cross-review → competitive → chairman)
 * - De-identified blind cross-review
 * - Per-round persona/provider assignment
 * - Quality checks and retry logic
 * - Progress tracking via callbacks
 * - Final vote aggregation and report generation
 *
 * Uses adapter pattern for database persistence and LLM integration.
 */

export type {
  RoundType,
  AnalysisStatus,
  Vote,
  RoundConfig,
  Session,
  Round,
  RoundAnalysis,
  AnalysisResponse,
  ChairmanOutput,
  Persona,
  ProviderRoundConfig,
  AnalystLabelMapping,
  ProgressUpdate,
  ProgressCallback,
  QualityThresholds,
  ConsensusDbAdapter,
} from './types.js';

export { DEFAULT_ROUNDS, DEFAULT_QUALITY_THRESHOLDS } from './types.js';

export {
  assignAnalystLabels,
  deIdentifyAnalyses,
} from './deidentification.js';

export {
  isAnalysisEmpty,
  isAnalysisLowQuality,
  buildRetryInstructions,
} from './quality.js';

export type { AnalysisFn, CreateSessionOptions } from './orchestrator.js';

export {
  initConsensus,
  createSession,
  getSessionResult,
} from './orchestrator.js';
