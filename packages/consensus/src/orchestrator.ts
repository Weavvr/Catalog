/**
 * Session orchestrator - manages the lifecycle of a multi-round
 * council deliberation session.
 *
 * Uses adapter pattern for DB persistence and LLM gateway for
 * routing analysis requests to council members (LLM providers).
 */

import { createLogger } from '@hmc/logger';
import { randomUUID } from 'crypto';
import type {
  Session,
  Round,
  RoundConfig,
  RoundType,
  AnalysisStatus,
  AnalysisResponse,
  ProviderRoundConfig,
  ConsensusDbAdapter,
  ProgressCallback,
  ProgressUpdate,
  QualityThresholds,
} from './types.js';
import { DEFAULT_ROUNDS, DEFAULT_QUALITY_THRESHOLDS } from './types.js';
import { assignAnalystLabels, deIdentifyAnalyses } from './deidentification.js';
import { isAnalysisEmpty, isAnalysisLowQuality, buildRetryInstructions } from './quality.js';

const logger = createLogger('consensus');

// ── Service State ───────────────────────────────────────────────

let dbAdapter: ConsensusDbAdapter | null = null;
let analysisFn: AnalysisFn | null = null;

/**
 * Function that sends a prompt to an LLM provider and returns structured analysis.
 * Implement this to integrate with @hmc/llm-gateway or any LLM service.
 */
export type AnalysisFn = (request: {
  providerId: string;
  personaInstructions: string;
  subjectContent: string;
  contextFromPriorRounds?: string;
  systemPrompt?: string;
}) => Promise<AnalysisResponse>;

/**
 * Initialize the consensus engine.
 */
export function initConsensus(adapter: ConsensusDbAdapter, analysis: AnalysisFn): void {
  dbAdapter = adapter;
  analysisFn = analysis;
  logger.info('Consensus engine initialized');
}

function getAdapter(): ConsensusDbAdapter {
  if (!dbAdapter) throw new Error('Consensus not initialized. Call initConsensus() first.');
  return dbAdapter;
}

function getAnalysisFn(): AnalysisFn {
  if (!analysisFn) throw new Error('Consensus not initialized. Call initConsensus() first.');
  return analysisFn;
}

// ── Session Lifecycle ───────────────────────────────────────────

export interface CreateSessionOptions {
  subjectId: string;
  subjectContent: string;
  strategyId?: string;
  rounds?: RoundConfig[];
  qualityThresholds?: QualityThresholds;
  metadata?: Record<string, unknown>;
  onProgress?: ProgressCallback;
}

/**
 * Create and start a multi-round deliberation session.
 */
export async function createSession(options: CreateSessionOptions): Promise<Session> {
  const adapter = getAdapter();
  const rounds = options.rounds || DEFAULT_ROUNDS;

  const session = await adapter.createSession({
    id: randomUUID(),
    subjectId: options.subjectId,
    strategyId: options.strategyId,
    status: 'processing',
    currentRound: 1,
    totalRounds: rounds.length,
    createdAt: new Date(),
    metadata: options.metadata,
  });

  logger.info('Session created', { sessionId: session.id, rounds: rounds.length });

  // Create round records
  for (const roundConfig of rounds) {
    await adapter.createRound({
      id: randomUUID(),
      sessionId: session.id,
      roundNumber: roundConfig.order,
      roundType: roundConfig.type,
      status: 'pending',
    });
  }

  // Execute rounds sequentially
  try {
    await executeRounds(session.id, options);
  } catch (error) {
    await adapter.updateSessionStatus(session.id, 'failed');
    throw error;
  }

  return (await adapter.getSession(session.id))!;
}

async function executeRounds(sessionId: string, options: CreateSessionOptions): Promise<void> {
  const adapter = getAdapter();
  const analyze = getAnalysisFn();
  const rounds = options.rounds || DEFAULT_ROUNDS;
  const thresholds = options.qualityThresholds || DEFAULT_QUALITY_THRESHOLDS;

  const session = await adapter.getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  let priorAnalysesContext = '';

  for (const roundConfig of rounds) {
    const round = session.rounds.find(r => r.roundNumber === roundConfig.order);
    if (!round) continue;

    emitProgress(options.onProgress, {
      sessionId,
      round: roundConfig.order,
      roundType: roundConfig.type,
      stage: 'starting',
      status: 'processing',
      message: `Starting ${roundConfig.label}`,
    });

    await adapter.updateRoundStatus(round.id, 'processing');
    await adapter.updateSessionStatus(sessionId, 'processing');

    // Get providers for this round
    const providers = await adapter.getProviderConfigs(options.strategyId);
    const activeProviders = providers.filter(p => {
      const roundCfg = p.rounds[roundConfig.type];
      return roundCfg?.enabled;
    });

    if (activeProviders.length === 0) {
      logger.warn('No providers for round', { roundType: roundConfig.type });
      await adapter.updateRoundStatus(round.id, 'complete');
      continue;
    }

    // De-identify for cross-review rounds
    let labelMappings;
    if (roundConfig.deIdentified) {
      const priorRound = session.rounds.find(r => r.roundNumber === roundConfig.order - 1);
      if (priorRound) {
        const priorAnalyses = await adapter.getAnalysesForRound(priorRound.id);
        labelMappings = assignAnalystLabels(round.id, priorAnalyses);
        for (const mapping of labelMappings) {
          await adapter.storeLabelMapping(mapping);
        }
        const deIdentified = deIdentifyAnalyses(priorAnalyses, labelMappings);
        priorAnalysesContext = deIdentified
          .map(a => `[${a.analystLabel}]: ${a.response?.summary || 'No summary'}`)
          .join('\n\n');
      }
    }

    // Execute analysis for each provider
    const labelIndex = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    for (let i = 0; i < activeProviders.length; i++) {
      const provider = activeProviders[i];
      const label = labelIndex[i] || `Analyst-${i + 1}`;
      const roundCfg = provider.rounds[roundConfig.type];

      emitProgress(options.onProgress, {
        sessionId,
        round: roundConfig.order,
        roundType: roundConfig.type,
        stage: 'processing',
        provider: provider.displayName,
        analystLabel: label,
        status: 'processing',
        message: `${provider.displayName} analyzing...`,
        phase: 'sending',
      });

      const analysis = await adapter.createAnalysis({
        roundId: round.id,
        providerId: provider.providerId,
        personaId: roundCfg?.personaId,
        analystLabel: label,
        response: null,
        status: 'processing',
        startedAt: new Date(),
      });

      try {
        // Get persona instructions
        let personaInstructions = '';
        if (roundCfg?.personaId) {
          const persona = await adapter.getPersona(roundCfg.personaId);
          if (persona) personaInstructions = persona.instructions;
        }

        const startTime = Date.now();
        const response = await analyze({
          providerId: provider.providerId,
          personaInstructions,
          subjectContent: options.subjectContent,
          contextFromPriorRounds: roundConfig.includesPriorContext ? priorAnalysesContext : undefined,
        });

        // Quality check
        if (isAnalysisEmpty(response)) {
          logger.warn('Empty analysis', { provider: provider.displayName, round: roundConfig.type });
        } else {
          const quality = isAnalysisLowQuality(response, thresholds);
          if (quality.lowQuality) {
            logger.warn('Low quality analysis', { provider: provider.displayName, reasons: quality.reasons });
          }
        }

        await adapter.updateAnalysis(analysis.id, {
          response,
          status: 'complete',
          completedAt: new Date(),
          processingTimeMs: Date.now() - startTime,
        });
      } catch (error) {
        logger.error('Analysis failed', {
          provider: provider.displayName,
          error: error instanceof Error ? error.message : String(error),
        });
        await adapter.updateAnalysis(analysis.id, {
          status: 'failed',
          completedAt: new Date(),
        });
      }
    }

    // Update prior context for next round
    const completedAnalyses = await adapter.getAnalysesForRound(round.id);
    priorAnalysesContext = completedAnalyses
      .filter(a => a.response && a.status === 'complete')
      .map(a => `[${a.analystLabel}]: ${a.response?.summary || ''}`)
      .join('\n\n');

    await adapter.updateRoundStatus(round.id, 'complete');

    emitProgress(options.onProgress, {
      sessionId,
      round: roundConfig.order,
      roundType: roundConfig.type,
      stage: 'complete',
      status: 'complete',
      message: `${roundConfig.label} complete`,
    });
  }

  await adapter.updateSessionStatus(sessionId, 'complete');
}

function emitProgress(callback: ProgressCallback | undefined, update: ProgressUpdate): void {
  if (callback) {
    try {
      callback(update);
    } catch {
      // Don't let progress callback errors break the pipeline
    }
  }
}

/**
 * Get the final recommendation from a completed session.
 */
export async function getSessionResult(sessionId: string): Promise<{
  vote: string;
  confidence: number;
  summary: string;
  chairmanOutputs: Array<{ type: string; content: string }>;
} | null> {
  const adapter = getAdapter();
  const session = await adapter.getSession(sessionId);
  if (!session || session.status !== 'complete') return null;

  const chairmanRound = session.rounds.find(r => r.roundType === 'chairman');
  if (!chairmanRound) return null;

  const chairmanAnalyses = await adapter.getAnalysesForRound(chairmanRound.id);
  const primary = chairmanAnalyses.find(a => a.status === 'complete' && a.response);
  if (!primary?.response) return null;

  const outputs = await adapter.getChairmanOutputs(sessionId);

  return {
    vote: primary.response.recommendation,
    confidence: primary.response.confidenceScore,
    summary: primary.response.summary,
    chairmanOutputs: outputs.map(o => ({ type: o.outputType, content: o.content })),
  };
}
