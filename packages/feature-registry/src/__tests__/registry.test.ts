import { describe, it, expect, beforeEach } from 'vitest';
import { FeatureRegistry } from '../registry.js';
import type { RegisteredFeature, RegisteredApp } from '../types.js';

function makeFeature(overrides: Partial<RegisteredFeature> = {}): RegisteredFeature {
  return {
    id: 'F-001',
    name: 'auth',
    displayName: 'Authentication',
    description: 'Multi-provider auth',
    tier: 1,
    complexity: 'L',
    package: '@hmc/auth',
    status: 'extracted',
    category: 'Foundation',
    currentVersion: '1.0.0',
    versions: [{ version: '1.0.0', releasedAt: '2026-01-01', changelog: 'Init', breakingChanges: [] }],
    dependencies: [],
    compatibilityRules: [],
    contract: null,
    tags: ['auth', 'login'],
    bestSource: 'ChatHMC',
    alsoIn: [],
    configRequired: [],
    updatePolicy: 'auto',
    maintainers: [],
    ...overrides,
  };
}

function makeApp(overrides: Partial<RegisteredApp> = {}): RegisteredApp {
  return {
    id: 'app-1',
    name: 'test-app',
    displayName: 'Test App',
    repoUrl: 'https://github.com/test/app',
    features: [],
    updatePolicy: 'auto',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    status: 'active',
    migrationExceptions: [],
    ...overrides,
  };
}

describe('FeatureRegistry', () => {
  let registry: FeatureRegistry;

  beforeEach(() => {
    registry = new FeatureRegistry();
  });

  describe('feature management', () => {
    it('registers and retrieves a feature', () => {
      const feature = makeFeature();
      registry.registerFeature(feature);

      expect(registry.getFeature('F-001')).toEqual(feature);
      expect(registry.getAllFeatures()).toHaveLength(1);
    });

    it('returns undefined for missing feature', () => {
      expect(registry.getFeature('F-999')).toBeUndefined();
    });

    it('searches features by text', () => {
      registry.registerFeature(makeFeature({ id: 'F-001', name: 'auth', displayName: 'Authentication', description: 'Login system' }));
      registry.registerFeature(makeFeature({ id: 'F-002', name: 'rbac', displayName: 'RBAC', description: 'Role management', tags: ['permissions'] }));

      expect(registry.searchFeatures({ text: 'auth' })).toHaveLength(1);
      expect(registry.searchFeatures({ text: 'permissions' })).toHaveLength(1);
    });

    it('searches features by tier and category', () => {
      registry.registerFeature(makeFeature({ id: 'F-001', tier: 1, category: 'Foundation' }));
      registry.registerFeature(makeFeature({ id: 'F-002', tier: 2, category: 'Shared Features' }));

      expect(registry.searchFeatures({ tier: 1 })).toHaveLength(1);
      expect(registry.searchFeatures({ category: 'Foundation' })).toHaveLength(1);
    });
  });

  describe('app management', () => {
    it('registers and retrieves an app', () => {
      const app = makeApp();
      registry.registerApp(app);

      expect(registry.getApp('app-1')).toEqual(app);
      expect(registry.getAllApps()).toHaveLength(1);
    });

    it('adds a feature to an app', () => {
      registry.registerFeature(makeFeature());
      registry.registerApp(makeApp());

      const result = registry.addFeatureToApp('app-1', 'F-001', '1.0.0');
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      const app = registry.getApp('app-1')!;
      expect(app.features).toHaveLength(1);
      expect(app.features[0].featureId).toBe('F-001');
    });

    it('rejects adding a feature with unsatisfied dependencies', () => {
      registry.registerFeature(
        makeFeature({
          id: 'F-003',
          name: 'rbac',
          dependencies: [{ featureId: 'F-001', versionRange: '^1.0.0', optional: false }],
        }),
      );
      registry.registerApp(makeApp());

      registry.registerFeature(makeFeature({ id: 'F-001' }));

      const result = registry.addFeatureToApp('app-1', 'F-003', '1.0.0');
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('requires');
    });

    it('finds apps using a feature', () => {
      registry.registerFeature(makeFeature());
      registry.registerApp(makeApp());
      registry.addFeatureToApp('app-1', 'F-001', '1.0.0');

      const apps = registry.getAppsUsingFeature('F-001');
      expect(apps).toHaveLength(1);
      expect(apps[0].id).toBe('app-1');
    });

    it('removes a feature from an app', () => {
      registry.registerFeature(makeFeature());
      registry.registerApp(makeApp());
      registry.addFeatureToApp('app-1', 'F-001', '1.0.0');

      const result = registry.removeFeatureFromApp('app-1', 'F-001');
      expect(result.success).toBe(true);
      expect(registry.getApp('app-1')!.features).toHaveLength(0);
    });
  });

  describe('dependency resolution', () => {
    it('resolves a simple dependency tree', () => {
      registry.registerFeature(makeFeature({ id: 'F-001', dependencies: [] }));
      registry.registerFeature(
        makeFeature({
          id: 'F-003',
          dependencies: [{ featureId: 'F-001', versionRange: '^1.0.0', optional: false }],
        }),
      );

      const result = registry.resolveDependencyTree(['F-003']);
      expect(result.resolved).toContain('F-001');
      expect(result.resolved).toContain('F-003');
      expect(result.missing).toHaveLength(0);
      expect(result.circular).toHaveLength(0);
    });

    it('detects missing dependencies', () => {
      registry.registerFeature(
        makeFeature({
          id: 'F-003',
          dependencies: [{ featureId: 'F-999', versionRange: '^1.0.0', optional: false }],
        }),
      );

      const result = registry.resolveDependencyTree(['F-003']);
      expect(result.missing).toContain('F-999');
    });
  });

  describe('feature set validation', () => {
    it('validates a valid feature set', () => {
      registry.registerFeature(makeFeature({ id: 'F-001' }));
      registry.registerFeature(
        makeFeature({
          id: 'F-003',
          dependencies: [{ featureId: 'F-001', versionRange: '^1.0.0', optional: false }],
        }),
      );

      const result = registry.validateFeatureSet(['F-001', 'F-003']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports missing dependencies', () => {
      registry.registerFeature(
        makeFeature({
          id: 'F-003',
          dependencies: [{ featureId: 'F-001', versionRange: '^1.0.0', optional: false }],
        }),
      );

      const result = registry.validateFeatureSet(['F-003']);
      expect(result.valid).toBe(false);
      expect(result.missingDeps).toContain('F-001');
    });

    it('reports conflict rules', () => {
      registry.registerFeature(makeFeature({ id: 'F-001' }));
      registry.registerFeature(
        makeFeature({
          id: 'F-002',
          compatibilityRules: [
            { featureId: 'F-001', constraint: '*', type: 'conflicts', reason: 'Incompatible' },
          ],
        }),
      );

      const result = registry.validateFeatureSet(['F-001', 'F-002']);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('conflicts');
    });
  });

  describe('update candidates', () => {
    it('identifies apps needing updates by policy', () => {
      registry.registerFeature(makeFeature());

      registry.registerApp(makeApp({ id: 'app-auto', updatePolicy: 'auto' }));
      registry.addFeatureToApp('app-auto', 'F-001', '1.0.0', 'auto');

      registry.registerApp(makeApp({ id: 'app-manual', updatePolicy: 'manual' }));
      registry.addFeatureToApp('app-manual', 'F-001', '1.0.0', 'manual');

      const candidates = registry.getUpdateCandidates('F-001', '1.1.0');
      expect(candidates.autoUpdate).toHaveLength(1);
      expect(candidates.manualReview).toHaveLength(1);
    });

    it('skips apps already at or above target version', () => {
      registry.registerFeature(
        makeFeature({
          versions: [
            { version: '1.0.0', releasedAt: '2026-01-01', changelog: 'Init', breakingChanges: [] },
            { version: '2.0.0', releasedAt: '2026-02-01', changelog: 'v2', breakingChanges: [] },
          ],
        }),
      );

      registry.registerApp(makeApp());
      registry.addFeatureToApp('app-1', 'F-001', '2.0.0');

      const candidates = registry.getUpdateCandidates('F-001', '1.1.0');
      expect(candidates.skipped).toHaveLength(1);
    });
  });

  describe('catalog import', () => {
    it('imports features from catalog format', () => {
      registry.importFromCatalog([
        {
          id: 'F-001',
          name: 'auth',
          displayName: 'Authentication',
          description: 'Auth system',
          tier: 1,
          complexity: 'L',
          package: '@hmc/auth',
          status: 'extracted',
          bestSource: 'ChatHMC',
          alsoIn: [],
          dependencies: [],
          configRequired: [],
          tags: ['auth'],
          category: 'Foundation',
        },
      ]);

      expect(registry.getAllFeatures()).toHaveLength(1);
      const f = registry.getFeature('F-001')!;
      expect(f.currentVersion).toBe('1.0.0');
      expect(f.versions).toHaveLength(1);
      expect(f.updatePolicy).toBe('auto');
    });
  });

  describe('audit log', () => {
    it('records actions in the audit log', () => {
      registry.registerFeature(makeFeature());
      registry.registerApp(makeApp());
      registry.addFeatureToApp('app-1', 'F-001', '1.0.0');

      const log = registry.getAuditLog();
      expect(log.length).toBeGreaterThanOrEqual(3);
      expect(log.some((e) => e.action === 'feature.publish')).toBe(true);
      expect(log.some((e) => e.action === 'app.create')).toBe(true);
      expect(log.some((e) => e.action === 'app.feature.add')).toBe(true);
    });

    it('filters audit log by target', () => {
      registry.registerFeature(makeFeature());
      registry.registerApp(makeApp());

      const featureLog = registry.getAuditLog({ targetType: 'feature' });
      expect(featureLog.every((e) => e.targetType === 'feature')).toBe(true);
    });
  });

  describe('state export/import', () => {
    it('exports and imports state', () => {
      registry.registerFeature(makeFeature());
      registry.registerApp(makeApp());

      const exported = registry.exportState();
      expect(exported.features).toHaveLength(1);
      expect(exported.apps).toHaveLength(1);

      const newRegistry = new FeatureRegistry();
      newRegistry.importState(exported);
      expect(newRegistry.getAllFeatures()).toHaveLength(1);
      expect(newRegistry.getAllApps()).toHaveLength(1);
    });
  });
});
