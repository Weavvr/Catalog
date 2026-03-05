/**
 * Migration Engine
 * Manages the phased migration of existing apps to consume features from the master repository.
 * Handles inventory mapping, adapter generation, phased rollout, and acceptance validation.
 */

import type { FeatureRegistry, RegisteredFeature } from '@hmc/feature-registry';
import type {
  SourceAppInventory,
  SourceFeatureMapping,
  CompatibilityAdapter,
  MigrationPlan,
  MigrationPlanPhase,
  MigrationMetrics,
  MigrationAcceptanceCriteria,
  MigrationReadiness,
} from './types.js';

/** Known source applications and their migration policies */
const MIGRATION_EXCEPTIONS = ['hmcghosticmember', 'hmc-consensus'];

export class MigrationEngine {
  private inventories: Map<string, SourceAppInventory> = new Map();
  private adapters: Map<string, CompatibilityAdapter> = new Map();
  private plans: Map<string, MigrationPlan> = new Map();
  private acceptanceCriteria: Map<string, MigrationAcceptanceCriteria> = new Map();

  constructor(private registry: FeatureRegistry) {}

  /** Create an inventory for a source app by analyzing feature overlap */
  createInventory(
    appId: string,
    appName: string,
    repoUrl: string,
    isException: boolean = false,
  ): SourceAppInventory {
    const allFeatures = this.registry.getAllFeatures();

    // Find features that reference this app in bestSource or alsoIn
    const appFeatures = allFeatures.filter(
      (f) =>
        f.bestSource === appName ||
        f.alsoIn.includes(appName),
    );

    const mappings: SourceFeatureMapping[] = appFeatures.map((f) => ({
      sourceIdentifier: `${appName}/${f.name}`,
      sourceDescription: f.description,
      masterFeatureId: f.id,
      readiness: this.assessReadiness(f, appName),
      status: 'mapped',
      deviations: this.detectDeviations(f, appName),
      adapterRequired: f.bestSource !== appName,
      estimatedEffort: this.estimateEffort(f),
      blockers: [],
    }));

    const inventory: SourceAppInventory = {
      appId,
      appName,
      repoUrl,
      features: mappings,
      migrationPolicy: isException || MIGRATION_EXCEPTIONS.includes(appName)
        ? 'forward-only'
        : 'full',
      complexity: this.assessAppComplexity(mappings),
      priority: this.calculatePriority(mappings, appName),
      notes: isException
        ? 'Exception: only consuming net-new features going forward'
        : '',
    };

    this.inventories.set(appId, inventory);
    return inventory;
  }

  /** Generate a phased migration plan for an app */
  generateMigrationPlan(appId: string): MigrationPlan {
    const inventory = this.inventories.get(appId);
    if (!inventory) throw new Error(`No inventory for app ${appId}`);

    const migratable = inventory.features.filter(
      (f) => f.readiness !== 'not-feasible' && f.readiness !== 'exception',
    );
    const exceptions = inventory.features.filter(
      (f) => f.readiness === 'not-feasible' || f.readiness === 'exception',
    );

    // Group features into phases based on tier and dependencies
    const phases = this.buildPhases(migratable, inventory);

    const plan: MigrationPlan = {
      appId: inventory.appId,
      appName: inventory.appName,
      phases,
      totalFeatures: inventory.features.length,
      migratedFeatures: 0,
      exceptionFeatures: exceptions.length,
      adaptersRequired: migratable.filter((f) => f.adapterRequired).length,
      estimatedEffort: this.sumEffort(migratable),
    };

    this.plans.set(appId, plan);
    return plan;
  }

  /** Register a compatibility adapter for a feature migration */
  registerAdapter(adapter: CompatibilityAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  /** Get all adapters for an app */
  getAdaptersForApp(appName: string): CompatibilityAdapter[] {
    return Array.from(this.adapters.values()).filter(
      (a) => a.sourceApp === appName,
    );
  }

  /** Set acceptance criteria for a feature migration */
  setAcceptanceCriteria(criteria: MigrationAcceptanceCriteria): void {
    this.acceptanceCriteria.set(`${criteria.appId}:${criteria.featureId}`, criteria);
  }

  /** Validate acceptance criteria for a migrated feature */
  validateAcceptance(appId: string, featureId: string): {
    passed: boolean;
    failures: string[];
  } {
    const criteria = this.acceptanceCriteria.get(`${appId}:${featureId}`);
    if (!criteria) return { passed: false, failures: ['No acceptance criteria defined'] };

    const failures: string[] = [];

    if (!criteria.functionalParity) failures.push('Functional parity not achieved');
    if (!criteria.noRegressions) failures.push('Regressions detected');
    if (!criteria.dataIntegrity) failures.push('Data integrity issues');
    if (!criteria.configMigrated) failures.push('Configuration not fully migrated');

    if (criteria.testCoverage < 80) {
      failures.push(`Test coverage ${criteria.testCoverage}% below 80% threshold`);
    }

    for (const bench of criteria.performanceBenchmark) {
      if (bench.actual !== undefined && bench.actual > bench.threshold) {
        failures.push(`Performance: ${bench.metric} (${bench.actual}) exceeds threshold (${bench.threshold})`);
      }
    }

    return { passed: failures.length === 0, failures };
  }

  /** Calculate overall migration metrics */
  getMetrics(): MigrationMetrics {
    const allInventories = Array.from(this.inventories.values());
    const allPlans = Array.from(this.plans.values());

    const totalMappings = allInventories.reduce((sum, inv) => sum + inv.features.length, 0);
    const migrated = allInventories.reduce(
      (sum, inv) => sum + inv.features.filter((f) => f.status === 'migrated').length,
      0,
    );
    const inProgress = allInventories.reduce(
      (sum, inv) =>
        sum + inv.features.filter((f) => f.status === 'migrating' || f.status === 'testing').length,
      0,
    );
    const exceptions = allInventories.reduce(
      (sum, inv) => sum + inv.features.filter((f) => f.status === 'exception').length,
      0,
    );

    return {
      totalApps: allInventories.length,
      appsFullyMigrated: allPlans.filter(
        (p) => p.migratedFeatures === p.totalFeatures - p.exceptionFeatures,
      ).length,
      appsMigrating: allPlans.filter((p) => p.migratedFeatures > 0 && p.migratedFeatures < p.totalFeatures).length,
      appsException: allInventories.filter((i) => i.migrationPolicy === 'forward-only').length,
      totalFeatureMappings: totalMappings,
      featuresMigrated: migrated,
      featuresInProgress: inProgress,
      featuresException: exceptions,
      adaptersActive: Array.from(this.adapters.values()).filter((a) => !a.deprecated).length,
      duplicatedCodeReduction: totalMappings > 0 ? Math.round((migrated / totalMappings) * 100) : 0,
      avgBugFixPropagationTime: migrated > 0 ? 'minutes' : 'days',
    };
  }

  /** Get all inventories */
  getAllInventories(): SourceAppInventory[] {
    return Array.from(this.inventories.values());
  }

  /** Get a migration plan */
  getPlan(appId: string): MigrationPlan | undefined {
    return this.plans.get(appId);
  }

  private assessReadiness(feature: RegisteredFeature, appName: string): MigrationReadiness {
    if (MIGRATION_EXCEPTIONS.includes(appName) && feature.tier >= 3) {
      return 'exception';
    }

    if (feature.status !== 'extracted') return 'not-feasible';
    if (feature.bestSource === appName) return 'ready';
    if (feature.complexity === 'XL') return 'needs-refactor';
    if (feature.alsoIn.includes(appName)) return 'needs-adapter';

    return 'ready';
  }

  private detectDeviations(feature: RegisteredFeature, appName: string): string[] {
    const deviations: string[] = [];

    if (feature.bestSource !== appName) {
      deviations.push(`Best implementation is in ${feature.bestSource}, not ${appName}`);
    }

    if (feature.complexity === 'XL') {
      deviations.push('High complexity — may have significant app-specific customizations');
    }

    if (feature.configRequired.length > 0) {
      deviations.push(`Requires configuration: ${feature.configRequired.join(', ')}`);
    }

    return deviations;
  }

  private estimateEffort(feature: RegisteredFeature): string {
    const effortMap = { S: '0.5 days', M: '1-2 days', L: '3-5 days', XL: '1-2 weeks' };
    return effortMap[feature.complexity];
  }

  private assessAppComplexity(
    mappings: SourceFeatureMapping[],
  ): 'low' | 'medium' | 'high' | 'extreme' {
    const needsWork = mappings.filter(
      (m) => m.readiness === 'needs-adapter' || m.readiness === 'needs-refactor',
    ).length;

    if (needsWork === 0) return 'low';
    if (needsWork <= 3) return 'medium';
    if (needsWork <= 7) return 'high';
    return 'extreme';
  }

  private calculatePriority(mappings: SourceFeatureMapping[], appName: string): number {
    // Higher priority = more shared features with less effort
    const readyFeatures = mappings.filter((m) => m.readiness === 'ready').length;
    const isException = MIGRATION_EXCEPTIONS.includes(appName);
    return isException ? 99 : Math.max(1, 10 - readyFeatures);
  }

  private buildPhases(
    features: SourceFeatureMapping[],
    inventory: SourceAppInventory,
  ): MigrationPlanPhase[] {
    const phases: MigrationPlanPhase[] = [];

    // Phase 1: Foundation features (tier 1, ready)
    const foundation = features.filter((f) => {
      const master = f.masterFeatureId ? this.registry.getFeature(f.masterFeatureId) : null;
      return master && master.tier === 1 && f.readiness === 'ready';
    });

    if (foundation.length > 0) {
      phases.push({
        phase: 1,
        name: 'Foundation Migration',
        description: 'Migrate tier-1 foundation features that are ready with no adapters needed',
        features: foundation.map((f) => f.masterFeatureId!),
        prerequisites: [],
        status: 'inventory',
      });
    }

    // Phase 2: High-value shared features
    const shared = features.filter((f) => {
      const master = f.masterFeatureId ? this.registry.getFeature(f.masterFeatureId) : null;
      return master && master.tier === 2 && !foundation.includes(f);
    });

    if (shared.length > 0) {
      phases.push({
        phase: 2,
        name: 'Shared Feature Migration',
        description: 'Migrate tier-2 shared features, creating adapters where needed',
        features: shared.map((f) => f.masterFeatureId!),
        prerequisites: foundation.map((f) => f.masterFeatureId!),
        status: 'inventory',
      });
    }

    // Phase 3: Domain and enterprise features
    const domain = features.filter(
      (f) => !foundation.includes(f) && !shared.includes(f),
    );

    if (domain.length > 0) {
      phases.push({
        phase: 3,
        name: 'Domain Feature Migration',
        description: 'Migrate domain-specific and enterprise features',
        features: domain.map((f) => f.masterFeatureId!).filter(Boolean),
        prerequisites: shared.map((f) => f.masterFeatureId!),
        status: 'inventory',
      });
    }

    return phases;
  }

  private sumEffort(features: SourceFeatureMapping[]): string {
    let totalDays = 0;
    for (const f of features) {
      const match = f.estimatedEffort.match(/(\d+(?:\.\d+)?)/);
      if (match) totalDays += parseFloat(match[1]);
    }
    if (totalDays <= 5) return `${totalDays} days`;
    return `${Math.ceil(totalDays / 5)} weeks`;
  }
}
