export interface Feature {
  id: string;
  name: string;
  displayName: string;
  description: string;
  tier: 1 | 2 | 3 | 4;
  complexity: 'S' | 'M' | 'L' | 'XL';
  package: string | null;
  status: 'extracted' | 'planned' | 'domain';
  bestSource: string;
  alsoIn: string[];
  dependencies: string[];
  configRequired: string[];
  tags: string[];
  category: string;
}

export interface AppRequest {
  id: string;
  name: string;
  description: string;
  selectedFeatures: string[];
  configuration: Record<string, string>;
  status: 'pending' | 'approved' | 'generating' | 'complete' | 'failed';
  createdAt: string;
  updatedAt: string;
  repoUrl?: string;
}

export interface DependencyResult {
  resolved: string[];
  tree: DependencyNode[];
}

export interface DependencyNode {
  id: string;
  name: string;
  dependencies: DependencyNode[];
}

export interface CatalogStats {
  totalFeatures: number;
  extractedCount: number;
  plannedCount: number;
  domainCount: number;
  totalPackages: number;
  byTier: Record<string, number>;
  byComplexity: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface NLPAnalysisResponse {
  message: string;
  features: SuggestedFeature[];
  followUp?: string;
}

export interface SuggestedFeature {
  id: string;
  name: string;
  displayName: string;
  confidence: number;
  reason: string;
}

export interface ChatEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  features?: SuggestedFeature[];
}

export type TierLabel = 'Foundation' | 'Shared' | 'Domain' | 'Enterprise';

export const TIER_LABELS: Record<number, TierLabel> = {
  1: 'Foundation',
  2: 'Shared',
  3: 'Domain',
  4: 'Enterprise',
};

export const TIER_COLORS: Record<number, string> = {
  1: 'bg-blue-100 text-blue-800',
  2: 'bg-green-100 text-green-800',
  3: 'bg-purple-100 text-purple-800',
  4: 'bg-orange-100 text-orange-800',
};

export const COMPLEXITY_COLORS: Record<string, string> = {
  S: 'bg-emerald-100 text-emerald-800',
  M: 'bg-yellow-100 text-yellow-800',
  L: 'bg-orange-100 text-orange-800',
  XL: 'bg-red-100 text-red-800',
};

export const STATUS_COLORS: Record<string, string> = {
  extracted: 'bg-green-500',
  planned: 'bg-yellow-500',
  domain: 'bg-gray-400',
};

export const REQUEST_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  generating: 'bg-blue-100 text-blue-800',
  complete: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

// ── Feature Registry Types ──────────────────────────────────────

export interface RegistryFeature extends Feature {
  version: string;
  updatePolicy: 'auto' | 'manual' | 'canary' | 'scheduled';
  maintainers: string[];
  versions: FeatureVersionEntry[];
  compatibilityRules: CompatibilityRuleEntry[];
}

export interface FeatureVersionEntry {
  version: string;
  releasedAt: string;
  changelog: string;
  breakingChanges: string[];
}

export interface CompatibilityRuleEntry {
  featureId: string;
  type: 'requires' | 'conflicts' | 'recommends';
  reason: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missingDeps: string[];
}

// ── Migration Types ─────────────────────────────────────────────

export interface MigrationInventory {
  appId: string;
  appName: string;
  repoUrl: string;
  migrationPolicy: 'full' | 'forward-only' | 'exception';
  complexity: 'low' | 'medium' | 'high' | 'extreme';
  priority: number;
  features: MigrationFeature[];
}

export interface MigrationFeature {
  sourceIdentifier: string;
  masterFeatureId: string | null;
  readiness: 'ready' | 'needs-adapter' | 'needs-refactor' | 'not-feasible' | 'exception';
  status: string;
  estimatedEffort: string;
}

export interface MigrationMetrics {
  totalApps: number;
  fullyMigrated: number;
  migrating: number;
  exceptions: number;
  totalMappings: number;
  featuresMigrated: number;
  duplicatedCodeReduction: number;
}

// ── Pipeline Types ──────────────────────────────────────────────

export interface PipelineRun {
  id: string;
  featureId: string;
  fromVersion: string;
  toVersion: string;
  status: string;
  targetApps: number;
  startedAt: string;
  completedAt?: string;
}

// ── Admin Dashboard ─────────────────────────────────────────────

export interface AdminDashboard {
  registry: {
    totalFeatures: number;
    extractedFeatures: number;
    totalApps: number;
    totalVersions: number;
  };
  migration: MigrationMetrics;
  pipeline: {
    totalRuns: number;
    active: number;
    completed: number;
    failed: number;
  };
  requests: {
    pending: number;
    inReview: number;
    delivered: number;
    enhancements: number;
  };
}

// ── Style Maps ──────────────────────────────────────────────────

export const READINESS_COLORS: Record<string, string> = {
  ready: 'bg-green-100 text-green-800',
  'needs-adapter': 'bg-yellow-100 text-yellow-800',
  'needs-refactor': 'bg-orange-100 text-orange-800',
  'not-feasible': 'bg-red-100 text-red-800',
  exception: 'bg-gray-100 text-gray-800',
};

export const POLICY_COLORS: Record<string, string> = {
  auto: 'bg-green-100 text-green-800',
  manual: 'bg-blue-100 text-blue-800',
  canary: 'bg-yellow-100 text-yellow-800',
  scheduled: 'bg-purple-100 text-purple-800',
};

export const PIPELINE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  running: 'bg-blue-100 text-blue-800',
  testing: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  'rolled-back': 'bg-orange-100 text-orange-800',
};
