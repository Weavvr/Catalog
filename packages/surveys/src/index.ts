/**
 * @hmc/surveys - Survey/feedback engine with 13+ question types
 *
 * Provides:
 * - Survey lifecycle management (draft → active → closed)
 * - 13 question types with validation (text, rating, NPS, matrix, ranking, etc.)
 * - Anonymous response collection via session tokens
 * - Skip logic / conditional branching
 * - Question bank (reusable template library)
 * - Response analytics and completion tracking
 * - Soft-delete for GDPR compliance
 * - Custom branding per survey
 *
 * Uses adapter pattern for database persistence.
 */

import { createLogger } from '@hmc/logger';

const logger = createLogger('surveys');

// ── Question Types ──────────────────────────────────────────────

export const QUESTION_TYPES = [
  'text', 'textarea', 'radio', 'checkbox', 'dropdown',
  'rating', 'nps', 'file', 'matrix', 'ranking',
  'slider', 'image_choice', 'constant_sum',
] as const;

export type QuestionType = typeof QUESTION_TYPES[number];

export type SurveyStatus = 'draft' | 'active' | 'closed';

// ── Types ───────────────────────────────────────────────────────

export interface Survey {
  id: string;
  title: string;
  description?: string;
  status: SurveyStatus;
  anonymous: boolean;
  createdBy: string;
  branding?: SurveyBranding;
  welcomeMessage?: string;
  thankYouMessage?: string;
  closesAt?: Date;
  createdAt: Date;
}

export interface SurveyBranding {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
}

export interface Question {
  id: string;
  surveyId: string;
  text: string;
  type: QuestionType;
  required: boolean;
  orderIndex: number;
  /** JSON options for radio/checkbox/dropdown */
  options?: string[];
  /** Rating scale bounds */
  ratingMin?: number;
  ratingMax?: number;
  /** Custom labels for rating scale */
  ratingLabels?: Record<number, string>;
  /** Conditional logic: show this question based on prior answers */
  skipLogic?: SkipLogicRule[];
  /** For matrix questions */
  matrixRows?: string[];
  matrixColumns?: string[];
}

export interface SkipLogicRule {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string | number;
}

export interface Response {
  id: string;
  questionId: string;
  surveyId: string;
  sessionToken: string;
  responseIndex: number;
  textValue?: string;
  selectedOptions?: string[];
  ratingValue?: number;
  fileUrl?: string;
  createdAt: Date;
  isDeleted: boolean;
}

export interface SurveyCompletion {
  id: string;
  surveyId: string;
  sessionToken: string;
  respondentEmail?: string;
  completedAt: Date;
}

export interface QuestionBankItem {
  id: string;
  text: string;
  type: QuestionType;
  category: string;
  options?: string[];
  ratingMin?: number;
  ratingMax?: number;
  usageCount: number;
}

// ── Analytics Types ─────────────────────────────────────────────

export interface SurveySummary {
  surveyId: string;
  totalResponses: number;
  completionRate: number;
  averageCompletionTimeMs?: number;
  responsesByQuestion: Array<{
    questionId: string;
    questionText: string;
    questionType: QuestionType;
    responseCount: number;
    breakdown?: Record<string, number>;
    average?: number;
    npsScore?: number;
  }>;
}

// ── DB Adapter ──────────────────────────────────────────────────

export interface SurveyDbAdapter {
  // Surveys
  createSurvey(survey: Omit<Survey, 'id' | 'createdAt'>): Promise<Survey>;
  getSurvey(id: string): Promise<Survey | null>;
  updateSurvey(id: string, updates: Partial<Survey>): Promise<Survey | null>;
  listSurveys(options?: { createdBy?: string; status?: SurveyStatus }): Promise<Survey[]>;

  // Questions
  createQuestion(question: Omit<Question, 'id'>): Promise<Question>;
  getQuestions(surveyId: string): Promise<Question[]>;
  updateQuestion(id: string, updates: Partial<Question>): Promise<Question | null>;
  deleteQuestion(id: string): Promise<void>;
  reorderQuestions(surveyId: string, questionIds: string[]): Promise<void>;

  // Responses
  createResponse(response: Omit<Response, 'id' | 'createdAt' | 'isDeleted'>): Promise<Response>;
  getResponses(surveyId: string, options?: { sessionToken?: string }): Promise<Response[]>;
  softDeleteResponse(id: string, deletedBy: string, reason?: string): Promise<void>;

  // Completions
  markComplete(completion: Omit<SurveyCompletion, 'id' | 'completedAt'>): Promise<SurveyCompletion>;
  getCompletionCount(surveyId: string): Promise<number>;

  // Question Bank
  saveToBank(item: Omit<QuestionBankItem, 'id' | 'usageCount'>): Promise<QuestionBankItem>;
  searchBank(options?: { category?: string; search?: string }): Promise<QuestionBankItem[]>;
  incrementBankUsage(id: string): Promise<void>;
}

// ── Service State ───────────────────────────────────────────────

let adapter: SurveyDbAdapter | null = null;

export function initSurveys(dbAdapter: SurveyDbAdapter): void {
  adapter = dbAdapter;
  logger.info('Surveys initialized');
}

function getAdapter(): SurveyDbAdapter {
  if (!adapter) throw new Error('Surveys not initialized. Call initSurveys() first.');
  return adapter;
}

// ── Validation ──────────────────────────────────────────────────

/**
 * Validate a response against its question's constraints.
 */
export function validateResponse(question: Question, response: Partial<Response>): string | null {
  if (question.required) {
    const hasValue = response.textValue || response.selectedOptions?.length || response.ratingValue !== undefined || response.fileUrl;
    if (!hasValue) return `Question "${question.text}" is required`;
  }

  if (question.type === 'rating' || question.type === 'nps') {
    if (response.ratingValue !== undefined) {
      const min = question.ratingMin ?? (question.type === 'nps' ? 0 : 1);
      const max = question.ratingMax ?? (question.type === 'nps' ? 10 : 5);
      if (response.ratingValue < min || response.ratingValue > max) {
        return `Rating must be between ${min} and ${max}`;
      }
    }
  }

  if (question.type === 'radio' || question.type === 'dropdown') {
    if (response.selectedOptions && response.selectedOptions.length > 1) {
      return 'Only one option can be selected';
    }
  }

  return null;
}

/**
 * Evaluate skip logic to determine if a question should be shown.
 */
export function shouldShowQuestion(
  question: Question,
  priorResponses: Map<string, Response>,
): boolean {
  if (!question.skipLogic || question.skipLogic.length === 0) return true;

  for (const rule of question.skipLogic) {
    const priorResponse = priorResponses.get(rule.questionId);
    if (!priorResponse) return false;

    const responseValue = priorResponse.textValue || priorResponse.ratingValue?.toString() || priorResponse.selectedOptions?.[0] || '';

    switch (rule.operator) {
      case 'equals':
        if (responseValue !== String(rule.value)) return false;
        break;
      case 'not_equals':
        if (responseValue === String(rule.value)) return false;
        break;
      case 'contains':
        if (!responseValue.includes(String(rule.value))) return false;
        break;
      case 'greater_than':
        if (Number(responseValue) <= Number(rule.value)) return false;
        break;
      case 'less_than':
        if (Number(responseValue) >= Number(rule.value)) return false;
        break;
    }
  }

  return true;
}

// ── NPS Calculation ─────────────────────────────────────────────

/**
 * Calculate Net Promoter Score from NPS question responses.
 * Promoters (9-10), Passives (7-8), Detractors (0-6).
 * NPS = % Promoters - % Detractors (range: -100 to 100).
 */
export function calculateNPS(ratings: number[]): {
  score: number;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
} {
  if (ratings.length === 0) return { score: 0, promoters: 0, passives: 0, detractors: 0, total: 0 };

  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const r of ratings) {
    if (r >= 9) promoters++;
    else if (r >= 7) passives++;
    else detractors++;
  }

  const total = ratings.length;
  const score = Math.round(((promoters - detractors) / total) * 100);

  return { score, promoters, passives, detractors, total };
}

// ── Response Collection ─────────────────────────────────────────

/**
 * Submit a response with validation.
 */
export async function submitResponse(
  surveyId: string,
  sessionToken: string,
  questionId: string,
  data: { textValue?: string; selectedOptions?: string[]; ratingValue?: number; fileUrl?: string },
  responseIndex: number = 0,
): Promise<Response> {
  const db = getAdapter();

  const survey = await db.getSurvey(surveyId);
  if (!survey) throw new Error('Survey not found');
  if (survey.status !== 'active') throw new Error('Survey is not active');
  if (survey.closesAt && new Date(survey.closesAt) < new Date()) throw new Error('Survey has closed');

  const questions = await db.getQuestions(surveyId);
  const question = questions.find(q => q.id === questionId);
  if (!question) throw new Error('Question not found');

  const validationError = validateResponse(question, data);
  if (validationError) throw new Error(validationError);

  const response = await db.createResponse({
    questionId,
    surveyId,
    sessionToken,
    responseIndex,
    ...data,
  });

  logger.debug('Response submitted', { surveyId, questionId, sessionToken: sessionToken.slice(0, 8) });
  return response;
}

/**
 * Mark a survey session as complete.
 */
export async function markSurveyComplete(
  surveyId: string,
  sessionToken: string,
  respondentEmail?: string,
): Promise<SurveyCompletion> {
  const db = getAdapter();
  return db.markComplete({ surveyId, sessionToken, respondentEmail });
}
