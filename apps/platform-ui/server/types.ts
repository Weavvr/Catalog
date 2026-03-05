// ── Feature Catalog Types ───────────────────────────────────────

export interface Feature {
  id: string;
  name: string;
  displayName: string;
  description: string;
  tier: number;
  complexity: 'low' | 'medium' | 'high';
  package: string;
  status: 'stable' | 'beta' | 'planned' | 'deprecated';
  bestSource: string;
  alsoIn: string[];
  dependencies: string[];
  configRequired: string[];
  tags: string[];
  category: string;
}

// ── Dependency Resolution ───────────────────────────────────────

export interface DependencyNode {
  id: string;
  name: string;
  displayName: string;
  children: DependencyNode[];
}

// ── App Request ─────────────────────────────────────────────────

export type AppRequestStatus =
  | 'pending'
  | 'approved'
  | 'generating'
  | 'complete'
  | 'failed';

export interface AppRequest {
  id: string;
  name: string;
  description: string;
  selectedFeatures: string[];
  configuration: Record<string, string>;
  status: AppRequestStatus;
  createdAt: string;
  updatedAt: string;
  repoUrl?: string;
  nlpConversation?: Array<{ role: string; content: string }>;
}

// ── Generator ───────────────────────────────────────────────────

export interface GenerateOptions {
  name: string;
  description: string;
  features: string[];
  config: Record<string, string>;
}

export interface GenerateResult {
  success: boolean;
  repoUrl?: string;
  features: string[];
  config: Record<string, string>;
  error?: string;
}

// ── NLP ─────────────────────────────────────────────────────────

export interface NLPResult {
  response: string;
  suggestedFeatures: string[];
  confidence: Record<string, number>;
}

// ── Catalog Stats ───────────────────────────────────────────────

export interface CatalogStats {
  totalFeatures: number;
  byTier: Record<number, number>;
  byStatus: Record<string, number>;
  byComplexity: Record<string, number>;
  byCategory: Record<string, number>;
}

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

// ── Registered App ──────────────────────────────────────────────

export interface RegisteredAppEntry {
  id: string;
  name: string;
  displayName: string;
  repoUrl: string;
  features: AppFeatureBindingEntry[];
  updatePolicy: 'auto' | 'manual' | 'canary' | 'scheduled';
  status: 'active' | 'migrating' | 'deprecated';
  createdAt: string;
  updatedAt: string;
}

export interface AppFeatureBindingEntry {
  featureId: string;
  pinnedVersion: string;
  installedAt: string;
  lastUpdated: string;
  updatePolicy: 'auto' | 'manual' | 'canary' | 'scheduled';
}

// ── Migration Types ─────────────────────────────────────────────

export interface MigrationInventoryEntry {
  appId: string;
  appName: string;
  repoUrl: string;
  migrationPolicy: 'full' | 'forward-only' | 'exception';
  complexity: 'low' | 'medium' | 'high' | 'extreme';
  priority: number;
  features: MigrationFeatureEntry[];
}

export interface MigrationFeatureEntry {
  sourceIdentifier: string;
  masterFeatureId: string | null;
  readiness: 'ready' | 'needs-adapter' | 'needs-refactor' | 'not-feasible' | 'exception';
  status: string;
  estimatedEffort: string;
}

// ── Pipeline Types ──────────────────────────────────────────────

export interface PipelineRunEntry {
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

export interface AdminDashboardData {
  registry: {
    totalFeatures: number;
    extractedFeatures: number;
    totalApps: number;
    totalVersions: number;
  };
  migration: {
    totalApps: number;
    fullyMigrated: number;
    migrating: number;
    exceptions: number;
  };
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
