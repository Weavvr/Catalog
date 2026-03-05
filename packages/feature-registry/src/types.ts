/**
 * Feature Registry Types
 * Core type definitions for the centralized feature library system.
 */

/** Semantic version string (e.g., "1.2.3") */
export type SemVer = string;

/** Version range expression (e.g., "^1.0.0", ">=2.0.0 <3.0.0") */
export type VersionRange = string;

/** Feature tier classification */
export type FeatureTier = 1 | 2 | 3 | 4;

/** Implementation complexity */
export type Complexity = 'S' | 'M' | 'L' | 'XL';

/** Feature extraction status */
export type FeatureStatus = 'extracted' | 'planned' | 'domain';

/** Update propagation policy */
export type UpdatePolicy = 'auto' | 'manual' | 'canary' | 'scheduled';

/** Feature category grouping */
export type FeatureCategory =
  | 'Foundation'
  | 'Shared Features'
  | 'Domain Features'
  | 'Enterprise & Compliance';

/** Breaking change type classification */
export type BreakingChangeType =
  | 'api-signature'
  | 'schema-migration'
  | 'config-change'
  | 'dependency-bump'
  | 'removal';

/** A single version entry in the feature's version history */
export interface FeatureVersion {
  version: SemVer;
  releasedAt: string;
  changelog: string;
  breakingChanges: BreakingChange[];
  minNodeVersion?: string;
  deprecated?: boolean;
  deprecationMessage?: string;
}

/** Description of a breaking change */
export interface BreakingChange {
  type: BreakingChangeType;
  description: string;
  migrationGuide: string;
  affectedExports: string[];
}

/** Integration contract: the public API surface of a feature */
export interface IntegrationContract {
  featureId: string;
  version: SemVer;
  exports: ContractExport[];
  configSchema: Record<string, ConfigField>;
  events: ContractEvent[];
  middlewares: string[];
  routes: ContractRoute[];
}

/** A single exported symbol from a feature */
export interface ContractExport {
  name: string;
  type: 'function' | 'class' | 'interface' | 'constant' | 'middleware' | 'router';
  signature?: string;
  description: string;
}

/** Configuration field definition */
export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: unknown;
  env?: string;
}

/** Event emitted by a feature */
export interface ContractEvent {
  name: string;
  payload: string;
  description: string;
}

/** Route exposed by a feature */
export interface ContractRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  auth: boolean;
}

/** Compatibility rule between features */
export interface CompatibilityRule {
  featureId: string;
  constraint: VersionRange;
  type: 'requires' | 'conflicts' | 'recommends';
  reason: string;
}

/** Full feature definition in the registry */
export interface RegisteredFeature {
  id: string;
  name: string;
  displayName: string;
  description: string;
  tier: FeatureTier;
  complexity: Complexity;
  package: string | null;
  status: FeatureStatus;
  category: FeatureCategory;
  currentVersion: SemVer;
  versions: FeatureVersion[];
  dependencies: FeatureDependency[];
  compatibilityRules: CompatibilityRule[];
  contract: IntegrationContract | null;
  tags: string[];
  bestSource: string;
  alsoIn: string[];
  configRequired: string[];
  updatePolicy: UpdatePolicy;
  maintainers: string[];
}

/** Dependency on another feature with version constraint */
export interface FeatureDependency {
  featureId: string;
  versionRange: VersionRange;
  optional: boolean;
}

/** An app registered in the system */
export interface RegisteredApp {
  id: string;
  name: string;
  displayName: string;
  repoUrl: string;
  features: AppFeatureBinding[];
  updatePolicy: UpdatePolicy;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'migrating' | 'deprecated';
  migrationExceptions: string[];
}

/** Binding of a feature to an app with pinned version */
export interface AppFeatureBinding {
  featureId: string;
  pinnedVersion: SemVer;
  installedAt: string;
  lastUpdated: string;
  updatePolicy: UpdatePolicy;
  customizations: string[];
}

/** Audit trail entry for feature/app changes */
export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  actor: string;
  targetType: 'feature' | 'app' | 'pipeline';
  targetId: string;
  details: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
}

/** Audit action types */
export type AuditAction =
  | 'feature.publish'
  | 'feature.deprecate'
  | 'feature.update'
  | 'app.create'
  | 'app.feature.add'
  | 'app.feature.update'
  | 'app.feature.remove'
  | 'pipeline.trigger'
  | 'pipeline.complete'
  | 'pipeline.rollback';
