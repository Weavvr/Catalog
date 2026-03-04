/**
 * @hmc/consensus - Type definitions for multi-round council deliberation
 */

// ── Round Types ─────────────────────────────────────────────────

export type RoundType = 'initial' | 'risk' | 'cross_review' | 'competitive_intel' | 'chairman';
export type AnalysisStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'cancelled';
export type Vote = 'approve' | 'reject' | 'conditional' | 'needs_more_info';

export interface RoundConfig {
  type: RoundType;
  order: number;
  label: string;
  description: string;
  /** Whether prior round analyses are injected as context */
  includesPriorContext: boolean;
  /** Whether analyst identities are masked */
  deIdentified: boolean;
}

/** Default 5-round deliberation pipeline */
export const DEFAULT_ROUNDS: RoundConfig[] = [
  { type: 'initial', order: 1, label: 'Initial Analysis', description: 'Independent first-pass analysis by each council member', includesPriorContext: false, deIdentified: false },
  { type: 'risk', order: 2, label: 'Risk Assessment', description: 'Focused risk analysis with specialized risk personas', includesPriorContext: true, deIdentified: false },
  { type: 'cross_review', order: 3, label: 'Cross-Review', description: 'De-identified peer review of prior analyses', includesPriorContext: true, deIdentified: true },
  { type: 'competitive_intel', order: 4, label: 'Competitive Intelligence', description: 'Analysis enriched with external competitive context', includesPriorContext: true, deIdentified: false },
  { type: 'chairman', order: 5, label: 'Chairman Synthesis', description: 'Final synthesis, vote recommendation, and report generation', includesPriorContext: true, deIdentified: false },
];

// ── Session & Round ─────────────────────────────────────────────

export interface Session {
  id: string;
  subjectId: string;
  strategyId?: string;
  status: AnalysisStatus;
  currentRound: number;
  totalRounds: number;
  rounds: Round[];
  createdAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface Round {
  id: string;
  sessionId: string;
  roundNumber: number;
  roundType: RoundType;
  status: AnalysisStatus;
  analyses: RoundAnalysis[];
  startedAt?: Date;
  completedAt?: Date;
}

export interface RoundAnalysis {
  id: string;
  roundId: string;
  providerId: string;
  personaId?: string;
  analystLabel: string;
  response: AnalysisResponse | null;
  status: AnalysisStatus;
  startedAt?: Date;
  completedAt?: Date;
  processingTimeMs?: number;
}

// ── Analysis Response ───────────────────────────────────────────

export interface AnalysisResponse {
  summary: string;
  recommendation: Vote;
  confidenceScore: number;
  riskFactors: string[];
  opportunities: string[];
  keyMetrics: Record<string, unknown>;
  detailedAnalysis?: string;
  questions?: string[];
}

export interface ChairmanOutput {
  id: string;
  roundAnalysisId: string;
  outputType: 'full_report' | 'synopsis' | 'vote_recommendation' | 'questions' | 'strategy_alignment';
  content: string;
}

// ── Personas & Providers ────────────────────────────────────────

export interface Persona {
  id: string;
  name: string;
  title: string;
  instructions: string;
  description?: string;
}

export interface ProviderRoundConfig {
  providerId: string;
  providerName: string;
  displayName: string;
  modelId?: string;
  /** Which rounds this provider participates in */
  rounds: {
    [K in RoundType]?: {
      enabled: boolean;
      personaId?: string;
      personaName?: string;
    };
  };
}

// ── De-identification ───────────────────────────────────────────

export interface AnalystLabelMapping {
  roundId: string;
  analystLabel: string;
  providerId: string;
  personaId?: string;
}

// ── Progress Tracking ───────────────────────────────────────────

export interface ProgressUpdate {
  sessionId: string;
  round: number;
  roundType: RoundType;
  stage: 'starting' | 'processing' | 'complete' | 'failed';
  provider?: string;
  analystLabel?: string;
  status: AnalysisStatus;
  message: string;
  elapsedMs?: number;
  phase?: 'sending' | 'thinking' | 'generating';
}

export type ProgressCallback = (update: ProgressUpdate) => void;

// ── Quality Checks ──────────────────────────────────────────────

export interface QualityThresholds {
  minSummaryLength: number;
  minDetailLength: number;
  minConfidenceScore: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  minSummaryLength: 100,
  minDetailLength: 500,
  minConfidenceScore: 0.01,
};

// ── DB Adapter ──────────────────────────────────────────────────

export interface ConsensusDbAdapter {
  createSession(session: Omit<Session, 'rounds'>): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  updateSessionStatus(sessionId: string, status: AnalysisStatus): Promise<void>;

  createRound(round: Omit<Round, 'analyses'>): Promise<Round>;
  updateRoundStatus(roundId: string, status: AnalysisStatus): Promise<void>;

  createAnalysis(analysis: Omit<RoundAnalysis, 'id'>): Promise<RoundAnalysis>;
  updateAnalysis(analysisId: string, updates: Partial<RoundAnalysis>): Promise<void>;
  getAnalysesForRound(roundId: string): Promise<RoundAnalysis[]>;

  createChairmanOutput(output: Omit<ChairmanOutput, 'id'>): Promise<ChairmanOutput>;
  getChairmanOutputs(sessionId: string): Promise<ChairmanOutput[]>;

  storeLabelMapping(mapping: AnalystLabelMapping): Promise<void>;
  getLabelMappings(roundId: string): Promise<AnalystLabelMapping[]>;

  getProviderConfigs(strategyId?: string): Promise<ProviderRoundConfig[]>;
  getPersona(personaId: string): Promise<Persona | null>;
}
