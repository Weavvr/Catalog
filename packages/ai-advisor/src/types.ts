/**
 * AI Advisor Types
 * Types for AI-assisted feature selection, validation, and recommendation.
 */

/** User goal description for AI analysis */
export interface UserGoal {
  description: string;
  processSteps?: string[];
  constraints?: string[];
  existingTools?: string[];
  userRole?: string;
  industry?: string;
}

/** AI recommendation result */
export interface FeatureRecommendation {
  recommendedFeatures: RecommendedFeature[];
  reasoning: string;
  gaps: FeatureGap[];
  tradeoffs: Tradeoff[];
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  confidenceScore: number;
}

/** A single recommended feature with rationale */
export interface RecommendedFeature {
  featureId: string;
  featureName: string;
  reason: string;
  importance: 'required' | 'recommended' | 'optional';
  alternatives?: string[];
}

/** Gap identified between user needs and available features */
export interface FeatureGap {
  description: string;
  suggestedEnhancement: string;
  severity: 'blocking' | 'significant' | 'minor';
}

/** Tradeoff explanation */
export interface Tradeoff {
  choice: string;
  pros: string[];
  cons: string[];
  recommendation: string;
}

/** Validation feedback from AI */
export interface AIValidation {
  overallAssessment: 'strong' | 'adequate' | 'needs-work' | 'problematic';
  score: number;
  feedback: ValidationFeedback[];
  suggestions: string[];
  securityConcerns: string[];
  complianceNotes: string[];
}

/** Individual validation feedback item */
export interface ValidationFeedback {
  category: 'completeness' | 'compatibility' | 'security' | 'performance' | 'compliance';
  severity: 'info' | 'warning' | 'error';
  message: string;
  featureId?: string;
}

/** Prompt context for the AI model */
export interface AdvisorContext {
  availableFeatures: {
    id: string;
    name: string;
    displayName: string;
    description: string;
    tier: number;
    category: string;
    tags: string[];
    dependencies: string[];
  }[];
  featureOntology: Record<string, string[]>;
  compatibilityRules: string[];
}

/** AI chat message for conversational flow */
export interface AdvisorMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  recommendations?: FeatureRecommendation;
  validation?: AIValidation;
}
