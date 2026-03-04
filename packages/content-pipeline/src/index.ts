/**
 * @hmc/content-pipeline - Multi-stage content generation and distribution
 *
 * Provides:
 * - Content distillation (long-form → structured summary)
 * - Multi-stage generation pipeline (distill → overview → generate per-unit)
 * - Campaign drip generation (N-day content sequences)
 * - Auto-tagging with configurable taxonomy
 * - Post scheduling across platforms
 *
 * Uses adapter pattern for DB persistence and LLM integration.
 */

import { createLogger } from '@hmc/logger';

const logger = createLogger('content-pipeline');

// ── Distillation Types ──────────────────────────────────────────

export interface DistilledContent {
  mainThemes: string[];
  keyPoints: string[];
  references: string[];
  targetAudienceInsights: string;
  emphasis: string;
  practicalApplications: string[];
  keyQuotes: string[];
  structure: {
    introduction: string;
    body: string;
    conclusion: string;
    callToAction: string;
  };
}

// ── Generation Pipeline Types ───────────────────────────────────

export interface SeriesOverview {
  overallTheme: string;
  unitProgression: string;
  keyThreads: string[];
  targetAudienceInsights: string;
  suggestedApproach: string;
  coreReferences: string[];
}

export interface UnitContent {
  unitNumber: number;
  title: string;
  theme: string;
  keyReferences: string[];
  leaderGuide: {
    overview: string;
    preparationNotes: string;
    timingBreakdown: string;
    outline: string;
    discussionQuestions: string[];
    applicationPoints: string[];
    facilitatorTips: string;
  };
  participantHandout: {
    title: string;
    theme: string;
    summary: string;
    discussionQuestions: string[];
    personalReflection: string[];
    weeklyApplication: string;
  };
}

export interface GenerationSettings {
  targetAudience?: string;
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced';
  duration: string;
  includeDiscussionQuestions: boolean;
  includeApplications: boolean;
  toneStyle?: string;
  customInstructions?: string;
}

export interface GenerationProgress {
  phase: 'distilling' | 'overview' | 'generating_units' | 'complete' | 'failed';
  currentUnit?: number;
  totalUnits?: number;
  message: string;
}

// ── Campaign Drip Types ─────────────────────────────────────────

export interface CampaignInput {
  title: string;
  sourceContent: string;
  targetAudience?: string;
  toneStyle?: string;
  dripDays: number;
  brandContext?: {
    organizationName?: string;
    voiceContext?: string;
    styleGuide?: string;
  };
}

export interface DripDay {
  dayNumber: number;
  dayLabel: string;
  title: string;
  body: string;
  reflectionQuestion?: string;
  callToAction?: string;
}

export interface CampaignResult {
  fullDocumentHtml: string;
  fullDocumentPlaintext: string;
  dailyDrip: DripDay[];
  modelMetadata: { model: string; tokens: number; durationMs: number };
}

// ── Auto-Tagging Types ──────────────────────────────────────────

export interface Tag {
  id: string;
  name: string;
  category: string;
  description?: string;
}

export interface TagResult {
  tagId: string;
  tagName: string;
  confidence: number;
  reason: string;
}

// ── Post Scheduling Types ───────────────────────────────────────

export type Platform = 'twitter' | 'facebook' | 'instagram' | 'tiktok' | 'linkedin';
export type PostStatus = 'pending' | 'posted' | 'failed' | 'cancelled';

export interface ScheduledPost {
  id: string;
  campaignId?: string;
  connectionId: string;
  platform: Platform;
  content: string;
  mediaUrls?: string[];
  scheduledFor: Date;
  status: PostStatus;
}

// ── LLM Integration ─────────────────────────────────────────────

export type ContentLLMFn = (prompt: string, systemPrompt?: string) => Promise<{
  text: string;
  model: string;
  tokens: number;
  durationMs: number;
}>;

// ── DB Adapter ──────────────────────────────────────────────────

export interface ContentPipelineDbAdapter {
  storeDistillation(sourceId: string, content: DistilledContent, model: string, tokens: number): Promise<void>;
  getDistillation(sourceId: string): Promise<DistilledContent | null>;

  storeUnitContent(buildId: string, unit: UnitContent, model: string, tokens: number): Promise<void>;
  getUnitContents(buildId: string): Promise<UnitContent[]>;

  storeCampaignResult(campaignId: string, result: CampaignResult): Promise<void>;
  getCampaignResult(campaignId: string): Promise<CampaignResult | null>;

  storeScheduledPost(post: Omit<ScheduledPost, 'id'>): Promise<ScheduledPost>;
  updatePostStatus(postId: string, status: PostStatus): Promise<void>;
  getPendingPosts(): Promise<ScheduledPost[]>;
}

// ── Service State ───────────────────────────────────────────────

let dbAdapter: ContentPipelineDbAdapter | null = null;
let llmFn: ContentLLMFn | null = null;

export function initContentPipeline(adapter: ContentPipelineDbAdapter, llm: ContentLLMFn): void {
  dbAdapter = adapter;
  llmFn = llm;
  logger.info('Content pipeline initialized');
}

function getAdapter(): ContentPipelineDbAdapter {
  if (!dbAdapter) throw new Error('Content pipeline not initialized. Call initContentPipeline().');
  return dbAdapter;
}

function getLLM(): ContentLLMFn {
  if (!llmFn) throw new Error('Content pipeline not initialized. Call initContentPipeline().');
  return llmFn;
}

// ── Distillation ────────────────────────────────────────────────

/**
 * Distill long-form content into a structured summary.
 */
export async function distillContent(
  sourceId: string,
  sourceText: string,
  options?: { customInstructions?: string },
): Promise<DistilledContent> {
  const llm = getLLM();
  const adapter = getAdapter();

  // Check cache
  const cached = await adapter.getDistillation(sourceId);
  if (cached) return cached;

  const systemPrompt = [
    'You are a content analysis expert. Distill the provided content into a structured summary.',
    'Return valid JSON matching the DistilledContent schema.',
    options?.customInstructions,
  ].filter(Boolean).join('\n');

  const result = await llm(sourceText, systemPrompt);

  let distilled: DistilledContent;
  try {
    distilled = JSON.parse(result.text);
  } catch {
    logger.error('Failed to parse distillation response as JSON');
    throw new Error('LLM returned invalid JSON for distillation');
  }

  await adapter.storeDistillation(sourceId, distilled, result.model, result.tokens);
  logger.info('Content distilled', { sourceId, themes: distilled.mainThemes.length });
  return distilled;
}

// ── Campaign Drip Generation ────────────────────────────────────

/**
 * Generate a multi-day drip campaign from source content.
 */
export async function generateCampaignDrip(
  campaignId: string,
  input: CampaignInput,
): Promise<CampaignResult> {
  const llm = getLLM();
  const adapter = getAdapter();

  const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const systemPrompt = [
    `Generate a ${input.dripDays}-day content drip campaign based on the source content.`,
    `Target audience: ${input.targetAudience || 'general'}`,
    `Tone: ${input.toneStyle || 'professional'}`,
    input.brandContext?.organizationName ? `Organization: ${input.brandContext.organizationName}` : '',
    input.brandContext?.voiceContext ? `Voice context: ${input.brandContext.voiceContext}` : '',
    '',
    `Return valid JSON with:`,
    `- fullDocumentHtml: HTML version of the full campaign`,
    `- fullDocumentPlaintext: Plain text version`,
    `- dailyDrip: Array of ${input.dripDays} objects with {dayNumber, dayLabel, title, body, reflectionQuestion, callToAction}`,
  ].filter(Boolean).join('\n');

  const startTime = Date.now();
  const result = await llm(input.sourceContent, systemPrompt);
  const durationMs = Date.now() - startTime;

  let parsed: { fullDocumentHtml: string; fullDocumentPlaintext: string; dailyDrip: DripDay[] };
  try {
    parsed = JSON.parse(result.text);
  } catch {
    throw new Error('LLM returned invalid JSON for campaign drip');
  }

  // Ensure day labels
  for (let i = 0; i < parsed.dailyDrip.length; i++) {
    parsed.dailyDrip[i].dayNumber = i + 1;
    parsed.dailyDrip[i].dayLabel = parsed.dailyDrip[i].dayLabel || dayLabels[i % 7];
  }

  const campaignResult: CampaignResult = {
    fullDocumentHtml: parsed.fullDocumentHtml,
    fullDocumentPlaintext: parsed.fullDocumentPlaintext,
    dailyDrip: parsed.dailyDrip,
    modelMetadata: { model: result.model, tokens: result.tokens, durationMs },
  };

  await adapter.storeCampaignResult(campaignId, campaignResult);
  logger.info('Campaign drip generated', { campaignId, days: parsed.dailyDrip.length });
  return campaignResult;
}

// ── Auto-Tagging ────────────────────────────────────────────────

/**
 * Auto-tag content using AI against a provided taxonomy.
 */
export async function autoTag(
  content: string,
  availableTags: Tag[],
  maxTags: number = 5,
): Promise<TagResult[]> {
  const llm = getLLM();

  const tagList = availableTags.map(t => `- ${t.id}: ${t.name} (${t.category})`).join('\n');

  const systemPrompt = [
    `Analyze the content and select the most relevant tags from this taxonomy:`,
    tagList,
    ``,
    `Return JSON array of {tagId, tagName, confidence (0-1), reason} objects.`,
    `Select at most ${maxTags} tags. Only include tags with confidence > 0.5.`,
  ].join('\n');

  const result = await llm(content, systemPrompt);

  try {
    const tags: TagResult[] = JSON.parse(result.text);
    return tags
      .filter(t => t.confidence > 0.5)
      .slice(0, maxTags)
      .sort((a, b) => b.confidence - a.confidence);
  } catch {
    logger.error('Failed to parse auto-tag response');
    return [];
  }
}
