/**
 * Migration Engine Types
 * Types for the phased migration strategy from existing apps to centralized features.
 */

/** Migration readiness levels */
export type MigrationReadiness = 'ready' | 'needs-adapter' | 'needs-refactor' | 'not-feasible' | 'exception';

/** Migration phase */
export type MigrationPhase = 'inventory' | 'analysis' | 'adapter' | 'migration' | 'validation' | 'complete';

/** Migration status for a single feature in an app */
export type FeatureMigrationStatus =
  | 'unmapped'
  | 'mapped'
  | 'adapter-ready'
  | 'migrating'
  | 'testing'
  | 'migrated'
  | 'exception';

/** Source app inventory entry */
export interface SourceAppInventory {
  appId: string;
  appName: string;
  repoUrl: string;
  features: SourceFeatureMapping[];
  migrationPolicy: 'full' | 'forward-only' | 'exception';
  complexity: 'low' | 'medium' | 'high' | 'extreme';
  priority: number;
  notes: string;
}

/** Mapping of a feature in a source app to a master feature */
export interface SourceFeatureMapping {
  sourceIdentifier: string;
  sourceDescription: string;
  masterFeatureId: string | null;
  readiness: MigrationReadiness;
  status: FeatureMigrationStatus;
  deviations: string[];
  adapterRequired: boolean;
  estimatedEffort: string;
  blockers: string[];
}

/** Compatibility adapter/shim definition */
export interface CompatibilityAdapter {
  id: string;
  sourceApp: string;
  featureId: string;
  description: string;
  type: 'config-transform' | 'api-shim' | 'schema-bridge' | 'event-adapter';
  code: string;
  deprecated: boolean;
  removeAfter?: string;
}

/** Migration plan for a single app */
export interface MigrationPlan {
  appId: string;
  appName: string;
  phases: MigrationPlanPhase[];
  totalFeatures: number;
  migratedFeatures: number;
  exceptionFeatures: number;
  adaptersRequired: number;
  estimatedEffort: string;
  startDate?: string;
  targetDate?: string;
}

/** A phase within a migration plan */
export interface MigrationPlanPhase {
  phase: number;
  name: string;
  description: string;
  features: string[];
  prerequisites: string[];
  status: MigrationPhase;
  completedAt?: string;
}

/** Migration metrics for tracking progress */
export interface MigrationMetrics {
  totalApps: number;
  appsFullyMigrated: number;
  appsMigrating: number;
  appsException: number;
  totalFeatureMappings: number;
  featuresMigrated: number;
  featuresInProgress: number;
  featuresException: number;
  adaptersActive: number;
  duplicatedCodeReduction: number;
  avgBugFixPropagationTime: string;
}

/** Success criteria for a migrated feature */
export interface MigrationAcceptanceCriteria {
  featureId: string;
  appId: string;
  functionalParity: boolean;
  performanceBenchmark: { metric: string; threshold: number; actual?: number }[];
  testCoverage: number;
  noRegressions: boolean;
  dataIntegrity: boolean;
  configMigrated: boolean;
}
