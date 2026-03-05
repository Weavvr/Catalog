/**
 * AI Feature Advisor
 * Uses an LLM to translate user goals into feature recommendations,
 * validate feature combinations, and provide actionable feedback.
 * Designed to work with Claude or any compatible LLM API.
 */

import type { FeatureRegistry, RegisteredFeature } from '@hmc/feature-registry';
import type {
  UserGoal,
  FeatureRecommendation,
  RecommendedFeature,
  FeatureGap,
  Tradeoff,
  AIValidation,
  ValidationFeedback,
  AdvisorContext,
  AdvisorMessage,
} from './types.js';

/** LLM client interface — inject your preferred provider */
export interface LLMClient {
  complete(systemPrompt: string, userMessage: string): Promise<string>;
}

export class AIAdvisor {
  private conversationHistory: AdvisorMessage[] = [];

  constructor(
    private registry: FeatureRegistry,
    private llm: LLMClient,
  ) {}

  /** Recommend features based on user goals */
  async recommendFeatures(goal: UserGoal): Promise<FeatureRecommendation> {
    const context = this.buildContext();
    const systemPrompt = this.buildRecommendationPrompt(context);

    const userMessage = this.formatGoal(goal);

    const response = await this.llm.complete(systemPrompt, userMessage);

    const recommendation = this.parseRecommendation(response, context);

    this.conversationHistory.push(
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
      {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
        recommendations: recommendation,
      },
    );

    return recommendation;
  }

  /** Validate a user's feature selection */
  async validateSelection(featureIds: string[]): Promise<AIValidation> {
    const context = this.buildContext();
    const registryValidation = this.registry.validateFeatureSet(featureIds);

    const selectedFeatures = featureIds
      .map((id) => this.registry.getFeature(id))
      .filter((f): f is RegisteredFeature => f !== undefined);

    const systemPrompt = this.buildValidationPrompt(context);
    const userMessage = [
      'Validate this feature selection:',
      '',
      ...selectedFeatures.map((f) => `- ${f.displayName} (${f.id}): ${f.description}`),
      '',
      'Registry validation results:',
      `- Valid: ${registryValidation.valid}`,
      `- Errors: ${registryValidation.errors.join('; ') || 'none'}`,
      `- Warnings: ${registryValidation.warnings.join('; ') || 'none'}`,
      `- Missing deps: ${registryValidation.missingDeps.join(', ') || 'none'}`,
    ].join('\n');

    const response = await this.llm.complete(systemPrompt, userMessage);
    const validation = this.parseValidation(response, registryValidation);

    this.conversationHistory.push(
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
      {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
        validation,
      },
    );

    return validation;
  }

  /** Interactive chat for refining requirements */
  async chat(message: string): Promise<AdvisorMessage> {
    const context = this.buildContext();

    const history = this.conversationHistory
      .slice(-10)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');

    const systemPrompt = this.buildChatPrompt(context);
    const fullMessage = history ? `${history}\n\nuser: ${message}` : message;

    const response = await this.llm.complete(systemPrompt, fullMessage);

    const userMsg: AdvisorMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    const assistantMsg: AdvisorMessage = {
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
    };

    this.conversationHistory.push(userMsg, assistantMsg);

    return assistantMsg;
  }

  /** Get conversation history */
  getHistory(): AdvisorMessage[] {
    return [...this.conversationHistory];
  }

  /** Clear conversation history */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /** Build the feature ontology for the AI context */
  buildFeatureOntology(): Record<string, string[]> {
    const ontology: Record<string, string[]> = {};
    const features = this.registry.getAllFeatures();

    for (const feature of features) {
      if (!ontology[feature.category]) {
        ontology[feature.category] = [];
      }
      ontology[feature.category].push(
        `${feature.id}: ${feature.displayName} — ${feature.description}`,
      );
    }

    return ontology;
  }

  private buildContext(): AdvisorContext {
    const features = this.registry.getAllFeatures();

    return {
      availableFeatures: features.map((f) => ({
        id: f.id,
        name: f.name,
        displayName: f.displayName,
        description: f.description,
        tier: f.tier,
        category: f.category,
        tags: f.tags,
        dependencies: f.dependencies.map((d) => d.featureId),
      })),
      featureOntology: this.buildFeatureOntology(),
      compatibilityRules: features.flatMap((f) =>
        f.compatibilityRules.map(
          (r) => `${f.displayName} ${r.type} ${r.featureId}: ${r.reason}`,
        ),
      ),
    };
  }

  private buildRecommendationPrompt(context: AdvisorContext): string {
    return [
      'You are the HMC App Platform AI Advisor. Your role is to recommend modular features',
      'from the HMC feature library to assemble applications that meet user goals.',
      '',
      'Available Features:',
      ...context.availableFeatures.map(
        (f) => `  ${f.id} | ${f.displayName} (Tier ${f.tier}, ${f.category}): ${f.description}`,
      ),
      '',
      'Rules:',
      '- Always include required dependencies',
      '- Foundation features (Tier 1) are required for most apps',
      '- Explain why each feature is recommended',
      '- Identify gaps where no existing feature covers the need',
      '- Suggest tradeoffs when multiple approaches exist',
      '',
      'Respond in structured JSON with keys: recommendedFeatures, reasoning, gaps, tradeoffs, estimatedComplexity, confidenceScore',
      'Each recommendedFeature has: featureId, featureName, reason, importance (required/recommended/optional)',
    ].join('\n');
  }

  private buildValidationPrompt(context: AdvisorContext): string {
    return [
      'You are the HMC App Platform AI Advisor validating a feature selection.',
      'Evaluate the selection for completeness, compatibility, security, performance, and compliance.',
      '',
      'Available Features:',
      ...context.availableFeatures.map(
        (f) => `  ${f.id} | ${f.displayName}: ${f.description}`,
      ),
      '',
      'Respond in structured JSON with keys: overallAssessment (strong/adequate/needs-work/problematic),',
      'score (0-100), feedback (array of {category, severity, message}),',
      'suggestions (array of strings), securityConcerns (array), complianceNotes (array)',
    ].join('\n');
  }

  private buildChatPrompt(context: AdvisorContext): string {
    return [
      'You are the HMC App Platform AI Advisor. Help users understand features,',
      'plan their apps, and refine requirements through conversation.',
      '',
      `There are ${context.availableFeatures.length} features across ${Object.keys(context.featureOntology).length} categories.`,
      '',
      'Feature categories and counts:',
      ...Object.entries(context.featureOntology).map(
        ([cat, features]) => `  ${cat}: ${features.length} features`,
      ),
      '',
      'Be concise, actionable, and proactive about suggesting features.',
      'When a user describes a process, map each step to relevant features.',
      'Flag any gaps or risks you identify.',
    ].join('\n');
  }

  private formatGoal(goal: UserGoal): string {
    const parts = [`Goal: ${goal.description}`];

    if (goal.processSteps?.length) {
      parts.push('Process steps:', ...goal.processSteps.map((s, i) => `  ${i + 1}. ${s}`));
    }
    if (goal.constraints?.length) {
      parts.push('Constraints:', ...goal.constraints.map((c) => `  - ${c}`));
    }
    if (goal.existingTools?.length) {
      parts.push('Existing tools:', ...goal.existingTools.map((t) => `  - ${t}`));
    }
    if (goal.userRole) parts.push(`User role: ${goal.userRole}`);
    if (goal.industry) parts.push(`Industry: ${goal.industry}`);

    return parts.join('\n');
  }

  private parseRecommendation(
    response: string,
    context: AdvisorContext,
  ): FeatureRecommendation {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          recommendedFeatures: parsed.recommendedFeatures ?? [],
          reasoning: parsed.reasoning ?? response,
          gaps: parsed.gaps ?? [],
          tradeoffs: parsed.tradeoffs ?? [],
          estimatedComplexity: parsed.estimatedComplexity ?? 'moderate',
          confidenceScore: parsed.confidenceScore ?? 0.7,
        };
      }
    } catch {
      // Fall through to default
    }

    // Fallback: extract feature IDs from the response text
    const mentionedIds = context.availableFeatures
      .filter((f) => response.includes(f.id) || response.includes(f.displayName))
      .map((f) => ({
        featureId: f.id,
        featureName: f.displayName,
        reason: 'Mentioned in AI recommendation',
        importance: 'recommended' as const,
      }));

    return {
      recommendedFeatures: mentionedIds,
      reasoning: response,
      gaps: [],
      tradeoffs: [],
      estimatedComplexity: 'moderate',
      confidenceScore: 0.5,
    };
  }

  private parseValidation(
    response: string,
    registryValidation: { valid: boolean; errors: string[]; warnings: string[] },
  ): AIValidation {
    const feedback: ValidationFeedback[] = [];

    // Always include registry validation results
    for (const error of registryValidation.errors) {
      feedback.push({ category: 'compatibility', severity: 'error', message: error });
    }
    for (const warning of registryValidation.warnings) {
      feedback.push({ category: 'completeness', severity: 'warning', message: warning });
    }

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          overallAssessment: parsed.overallAssessment ?? (registryValidation.valid ? 'adequate' : 'needs-work'),
          score: parsed.score ?? (registryValidation.valid ? 70 : 40),
          feedback: [...feedback, ...(parsed.feedback ?? [])],
          suggestions: parsed.suggestions ?? [],
          securityConcerns: parsed.securityConcerns ?? [],
          complianceNotes: parsed.complianceNotes ?? [],
        };
      }
    } catch {
      // Fall through
    }

    return {
      overallAssessment: registryValidation.valid ? 'adequate' : 'needs-work',
      score: registryValidation.valid ? 70 : 40,
      feedback,
      suggestions: [response],
      securityConcerns: [],
      complianceNotes: [],
    };
  }
}
