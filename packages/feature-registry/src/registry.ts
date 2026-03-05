/**
 * Feature Registry
 * Central registry for managing features, their versions, dependencies, and app bindings.
 * Provides the core data layer for the centralized feature library.
 */

import type {
  RegisteredFeature,
  RegisteredApp,
  AppFeatureBinding,
  AuditEntry,
  AuditAction,
  FeatureDependency,
  CompatibilityRule,
  SemVer,
  UpdatePolicy,
} from './types.js';
import { satisfiesRange, compareVersions, latestVersion } from './semver.js';

export class FeatureRegistry {
  private features: Map<string, RegisteredFeature> = new Map();
  private apps: Map<string, RegisteredApp> = new Map();
  private auditLog: AuditEntry[] = [];

  /** Register or update a feature in the registry */
  registerFeature(feature: RegisteredFeature): void {
    const existing = this.features.get(feature.id);
    this.features.set(feature.id, feature);

    this.audit(
      existing ? 'feature.update' : 'feature.publish',
      'system',
      'feature',
      feature.id,
      { name: feature.name, version: feature.currentVersion },
      existing ? { version: existing.currentVersion } : undefined,
      { version: feature.currentVersion },
    );
  }

  /** Get a feature by ID */
  getFeature(id: string): RegisteredFeature | undefined {
    return this.features.get(id);
  }

  /** Get all registered features */
  getAllFeatures(): RegisteredFeature[] {
    return Array.from(this.features.values());
  }

  /** Search features by tags, category, or text */
  searchFeatures(query: {
    text?: string;
    tags?: string[];
    category?: string;
    tier?: number;
    status?: string;
  }): RegisteredFeature[] {
    let results = this.getAllFeatures();

    if (query.text) {
      const lower = query.text.toLowerCase();
      results = results.filter(
        (f) =>
          f.name.toLowerCase().includes(lower) ||
          f.displayName.toLowerCase().includes(lower) ||
          f.description.toLowerCase().includes(lower) ||
          f.tags.some((t) => t.includes(lower)),
      );
    }

    if (query.tags?.length) {
      results = results.filter((f) => query.tags!.some((t) => f.tags.includes(t)));
    }

    if (query.category) {
      results = results.filter((f) => f.category === query.category);
    }

    if (query.tier) {
      results = results.filter((f) => f.tier === query.tier);
    }

    if (query.status) {
      results = results.filter((f) => f.status === query.status);
    }

    return results;
  }

  /** Register an app in the system */
  registerApp(app: RegisteredApp): void {
    this.apps.set(app.id, app);
    this.audit('app.create', 'system', 'app', app.id, {
      name: app.name,
      featureCount: app.features.length,
    });
  }

  /** Get an app by ID */
  getApp(id: string): RegisteredApp | undefined {
    return this.apps.get(id);
  }

  /** Get all registered apps */
  getAllApps(): RegisteredApp[] {
    return Array.from(this.apps.values());
  }

  /** Find all apps that use a specific feature */
  getAppsUsingFeature(featureId: string): RegisteredApp[] {
    return this.getAllApps().filter((app) =>
      app.features.some((f) => f.featureId === featureId),
    );
  }

  /** Bind a feature to an app at a specific version */
  addFeatureToApp(
    appId: string,
    featureId: string,
    version: SemVer,
    updatePolicy: UpdatePolicy = 'auto',
  ): { success: boolean; errors: string[] } {
    const app = this.apps.get(appId);
    if (!app) return { success: false, errors: [`App ${appId} not found`] };

    const feature = this.features.get(featureId);
    if (!feature) return { success: false, errors: [`Feature ${featureId} not found`] };

    // Validate version exists
    if (!feature.versions.some((v) => v.version === version)) {
      return { success: false, errors: [`Version ${version} not found for ${feature.name}`] };
    }

    // Check dependency satisfaction
    const depErrors = this.checkDependencies(app, feature);
    if (depErrors.length > 0) return { success: false, errors: depErrors };

    // Check compatibility rules
    const compatErrors = this.checkCompatibility(app, feature, version);
    if (compatErrors.length > 0) return { success: false, errors: compatErrors };

    const existing = app.features.findIndex((f) => f.featureId === featureId);
    const now = new Date().toISOString();

    const binding: AppFeatureBinding = {
      featureId,
      pinnedVersion: version,
      installedAt: now,
      lastUpdated: now,
      updatePolicy,
      customizations: [],
    };

    if (existing >= 0) {
      const prev = app.features[existing];
      app.features[existing] = binding;
      this.audit('app.feature.update', 'system', 'app', appId, {
        featureId,
        fromVersion: prev.pinnedVersion,
        toVersion: version,
      });
    } else {
      app.features.push(binding);
      this.audit('app.feature.add', 'system', 'app', appId, {
        featureId,
        version,
      });
    }

    app.updatedAt = now;
    return { success: true, errors: [] };
  }

  /** Remove a feature from an app */
  removeFeatureFromApp(appId: string, featureId: string): { success: boolean; errors: string[] } {
    const app = this.apps.get(appId);
    if (!app) return { success: false, errors: [`App ${appId} not found`] };

    const idx = app.features.findIndex((f) => f.featureId === featureId);
    if (idx < 0) return { success: false, errors: [`Feature ${featureId} not bound to app`] };

    // Check if other features depend on this one
    const dependents = app.features.filter((binding) => {
      const f = this.features.get(binding.featureId);
      return f?.dependencies.some((d) => d.featureId === featureId);
    });

    if (dependents.length > 0) {
      const names = dependents.map((d) => d.featureId).join(', ');
      return { success: false, errors: [`Cannot remove: features [${names}] depend on ${featureId}`] };
    }

    app.features.splice(idx, 1);
    app.updatedAt = new Date().toISOString();
    this.audit('app.feature.remove', 'system', 'app', appId, { featureId });

    return { success: true, errors: [] };
  }

  /** Check which apps need updates for a feature's new version */
  getUpdateCandidates(featureId: string, newVersion: SemVer): {
    autoUpdate: RegisteredApp[];
    manualReview: RegisteredApp[];
    canary: RegisteredApp[];
    skipped: RegisteredApp[];
  } {
    const result = {
      autoUpdate: [] as RegisteredApp[],
      manualReview: [] as RegisteredApp[],
      canary: [] as RegisteredApp[],
      skipped: [] as RegisteredApp[],
    };

    for (const app of this.getAppsUsingFeature(featureId)) {
      const binding = app.features.find((f) => f.featureId === featureId);
      if (!binding) continue;

      if (compareVersions(binding.pinnedVersion, newVersion) >= 0) {
        result.skipped.push(app);
        continue;
      }

      const policy = binding.updatePolicy || app.updatePolicy;
      switch (policy) {
        case 'auto':
          result.autoUpdate.push(app);
          break;
        case 'canary':
          result.canary.push(app);
          break;
        case 'scheduled':
        case 'manual':
          result.manualReview.push(app);
          break;
      }
    }

    return result;
  }

  /** Resolve the full dependency tree for a set of features */
  resolveDependencyTree(featureIds: string[]): {
    resolved: string[];
    missing: string[];
    circular: string[][];
  } {
    const resolved: string[] = [];
    const missing: string[] = [];
    const circular: string[][] = [];
    const visiting = new Set<string>();

    const visit = (id: string, path: string[]): void => {
      if (resolved.includes(id)) return;

      if (visiting.has(id)) {
        circular.push([...path, id]);
        return;
      }

      const feature = this.features.get(id);
      if (!feature) {
        if (!missing.includes(id)) missing.push(id);
        return;
      }

      visiting.add(id);

      for (const dep of feature.dependencies) {
        visit(dep.featureId, [...path, id]);
      }

      visiting.delete(id);
      if (!resolved.includes(id)) resolved.push(id);
    };

    for (const id of featureIds) {
      visit(id, []);
    }

    return { resolved, missing, circular };
  }

  /** Validate a set of feature selections for compatibility */
  validateFeatureSet(featureIds: string[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    missingDeps: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingDeps: string[] = [];

    // Check all dependencies are present
    const { resolved, missing, circular } = this.resolveDependencyTree(featureIds);
    missingDeps.push(...missing);

    if (missing.length > 0) {
      errors.push(`Missing required dependencies: ${missing.join(', ')}`);
    }

    if (circular.length > 0) {
      errors.push(`Circular dependencies detected: ${circular.map((c) => c.join(' -> ')).join('; ')}`);
    }

    // Check compatibility rules
    for (const id of featureIds) {
      const feature = this.features.get(id);
      if (!feature) continue;

      for (const rule of feature.compatibilityRules) {
        const target = this.features.get(rule.featureId);
        if (!target) continue;

        const isPresent = featureIds.includes(rule.featureId);

        if (rule.type === 'conflicts' && isPresent) {
          errors.push(`${feature.displayName} conflicts with ${target.displayName}: ${rule.reason}`);
        }

        if (rule.type === 'requires' && !isPresent) {
          errors.push(`${feature.displayName} requires ${target.displayName}: ${rule.reason}`);
        }

        if (rule.type === 'recommends' && !isPresent) {
          warnings.push(`${feature.displayName} recommends ${target.displayName}: ${rule.reason}`);
        }
      }
    }

    // Check tier requirements (tier 1 features should be present for tier 2+)
    const hasTier2Plus = featureIds.some((id) => {
      const f = this.features.get(id);
      return f && f.tier > 1;
    });

    if (hasTier2Plus) {
      const tier1Ids = this.getAllFeatures()
        .filter((f) => f.tier === 1 && f.status === 'extracted')
        .map((f) => f.id);

      const missingFoundation = tier1Ids.filter(
        (id) => !featureIds.includes(id) && this.features.get(id)?.name !== 'ui-component-library',
      );

      if (missingFoundation.length > 0) {
        const names = missingFoundation.map((id) => this.features.get(id)?.displayName).filter(Boolean);
        warnings.push(`Consider adding foundation features: ${names.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      missingDeps,
    };
  }

  /** Get the audit log, optionally filtered */
  getAuditLog(filter?: {
    targetType?: string;
    targetId?: string;
    action?: AuditAction;
    since?: string;
    limit?: number;
  }): AuditEntry[] {
    let entries = [...this.auditLog];

    if (filter?.targetType) {
      entries = entries.filter((e) => e.targetType === filter.targetType);
    }
    if (filter?.targetId) {
      entries = entries.filter((e) => e.targetId === filter.targetId);
    }
    if (filter?.action) {
      entries = entries.filter((e) => e.action === filter.action);
    }
    if (filter?.since) {
      entries = entries.filter((e) => e.timestamp >= filter.since!);
    }

    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (filter?.limit) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  /** Import features from the catalog JSON format */
  importFromCatalog(
    catalogEntries: Array<{
      id: string;
      name: string;
      displayName: string;
      description: string;
      tier: number;
      complexity: string;
      package: string | null;
      status: string;
      bestSource: string;
      alsoIn: string[];
      dependencies: string[];
      configRequired: string[];
      tags: string[];
      category: string;
    }>,
  ): void {
    for (const entry of catalogEntries) {
      const feature: RegisteredFeature = {
        id: entry.id,
        name: entry.name,
        displayName: entry.displayName,
        description: entry.description,
        tier: entry.tier as 1 | 2 | 3 | 4,
        complexity: entry.complexity as 'S' | 'M' | 'L' | 'XL',
        package: entry.package,
        status: entry.status as 'extracted' | 'planned' | 'domain',
        category: entry.category as any,
        currentVersion: '1.0.0',
        versions: [
          {
            version: '1.0.0',
            releasedAt: new Date().toISOString(),
            changelog: 'Initial release — extracted from source repositories',
            breakingChanges: [],
          },
        ],
        dependencies: entry.dependencies.map((depId) => ({
          featureId: depId,
          versionRange: '^1.0.0',
          optional: false,
        })),
        compatibilityRules: [],
        contract: null,
        tags: entry.tags,
        bestSource: entry.bestSource,
        alsoIn: entry.alsoIn,
        configRequired: entry.configRequired,
        updatePolicy: entry.tier <= 2 ? 'auto' : 'manual',
        maintainers: [],
      };

      this.registerFeature(feature);
    }
  }

  /** Export registry state for persistence */
  exportState(): {
    features: RegisteredFeature[];
    apps: RegisteredApp[];
    auditLog: AuditEntry[];
  } {
    return {
      features: this.getAllFeatures(),
      apps: this.getAllApps(),
      auditLog: this.auditLog,
    };
  }

  /** Import registry state from persistence */
  importState(state: {
    features: RegisteredFeature[];
    apps: RegisteredApp[];
    auditLog?: AuditEntry[];
  }): void {
    this.features.clear();
    this.apps.clear();

    for (const feature of state.features) {
      this.features.set(feature.id, feature);
    }
    for (const app of state.apps) {
      this.apps.set(app.id, app);
    }
    if (state.auditLog) {
      this.auditLog = state.auditLog;
    }
  }

  private checkDependencies(app: RegisteredApp, feature: RegisteredFeature): string[] {
    const errors: string[] = [];
    for (const dep of feature.dependencies) {
      if (dep.optional) continue;

      const bound = app.features.find((f) => f.featureId === dep.featureId);
      if (!bound) {
        const depFeature = this.features.get(dep.featureId);
        errors.push(
          `Missing dependency: ${feature.displayName} requires ${depFeature?.displayName ?? dep.featureId}`,
        );
      } else if (!satisfiesRange(bound.pinnedVersion, dep.versionRange)) {
        errors.push(
          `Version mismatch: ${feature.displayName} requires ${dep.featureId}@${dep.versionRange}, app has ${bound.pinnedVersion}`,
        );
      }
    }
    return errors;
  }

  private checkCompatibility(
    app: RegisteredApp,
    feature: RegisteredFeature,
    version: SemVer,
  ): string[] {
    const errors: string[] = [];
    for (const rule of feature.compatibilityRules) {
      const bound = app.features.find((f) => f.featureId === rule.featureId);
      if (rule.type === 'conflicts' && bound) {
        errors.push(`Conflict: ${feature.displayName} conflicts with ${rule.featureId}: ${rule.reason}`);
      }
    }
    return errors;
  }

  private audit(
    action: AuditAction,
    actor: string,
    targetType: 'feature' | 'app' | 'pipeline',
    targetId: string,
    details: Record<string, unknown>,
    previousState?: Record<string, unknown>,
    newState?: Record<string, unknown>,
  ): void {
    this.auditLog.push({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      action,
      actor,
      targetType,
      targetId,
      details,
      previousState,
      newState,
    });
  }
}
