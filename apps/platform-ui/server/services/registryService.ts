/**
 * Registry Service
 * Initializes and manages the in-memory feature registry, migration engine,
 * and update pipeline from the catalog data.
 */

import { loadCatalog } from './catalogService.js';
import type {
  RegistryFeature,
  RegisteredAppEntry,
  MigrationInventoryEntry,
  PipelineRunEntry,
  AdminDashboardData,
} from '../types.js';

// ── In-Memory State ─────────────────────────────────────────────

interface RegistryState {
  features: Map<string, RegistryFeature>;
  apps: Map<string, RegisteredAppEntry>;
  migrations: Map<string, MigrationInventoryEntry>;
  pipelines: PipelineRunEntry[];
  auditLog: AuditEntry[];
}

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
}

let state: RegistryState | null = null;

/** Known source apps for migration inventory */
const SOURCE_APPS = [
  { id: 'chathmc', name: 'ChatHMC', repo: 'bscwaryan/ChatHMC' },
  { id: 'sermoncraft', name: 'SermonCraft', repo: 'bscwaryan/SermonCraft' },
  { id: 'ghosticmember', name: 'hmcghosticmember', repo: 'bscwaryan/hmcghosticmember' },
  { id: 'taxflow', name: 'hmc-taxflow', repo: 'bscwaryan/hmc-taxflow' },
  { id: 'feedback', name: 'Feedback_App', repo: 'bscwaryan/Feedback_App' },
  { id: 'legalnda', name: 'Legal-NDA', repo: 'bscwaryan/Legal-NDA' },
  { id: 'aivoting', name: 'hmcaivoting', repo: 'bscwaryan/hmcaivoting' },
  { id: 'method', name: 'Method', repo: 'bscwaryan/Method' },
];

const MIGRATION_EXCEPTIONS = ['hmcghosticmember'];

// ── Initialization ──────────────────────────────────────────────

function getState(): RegistryState {
  if (state) return state;

  state = {
    features: new Map(),
    apps: new Map(),
    migrations: new Map(),
    pipelines: [],
    auditLog: [],
  };

  // Import catalog features into registry with versioning
  const catalog = loadCatalog();
  for (const entry of catalog) {
    const feature: RegistryFeature = {
      ...entry,
      version: '1.0.0',
      updatePolicy: entry.tier <= 2 ? 'auto' : 'manual',
      maintainers: [],
      versions: [
        {
          version: '1.0.0',
          releasedAt: '2026-03-04T00:00:00Z',
          changelog: 'Initial release — extracted from source repositories',
          breakingChanges: [],
        },
      ],
      compatibilityRules: [],
    };
    state.features.set(entry.id, feature);
  }

  // Build migration inventories for source apps
  for (const app of SOURCE_APPS) {
    const isException = MIGRATION_EXCEPTIONS.includes(app.name);
    const appFeatures = catalog.filter(
      (f) => f.bestSource === app.name || f.alsoIn.includes(app.name),
    );

    const inventory: MigrationInventoryEntry = {
      appId: app.id,
      appName: app.name,
      repoUrl: app.repo,
      migrationPolicy: isException ? 'forward-only' : 'full',
      complexity: appFeatures.length > 15 ? 'extreme' : appFeatures.length > 8 ? 'high' : appFeatures.length > 3 ? 'medium' : 'low',
      priority: isException ? 99 : Math.max(1, 10 - appFeatures.filter((f) => f.status === 'extracted').length),
      features: appFeatures.map((f) => ({
        sourceIdentifier: `${app.name}/${f.name}`,
        masterFeatureId: f.id,
        readiness: f.status !== 'extracted'
          ? 'not-feasible'
          : f.bestSource === app.name
            ? 'ready'
            : 'needs-adapter',
        status: 'mapped',
        estimatedEffort: { S: '0.5 days', M: '1-2 days', L: '3-5 days', XL: '1-2 weeks' }[f.complexity] ?? '1 day',
      })),
    };

    state.migrations.set(app.id, inventory);
  }

  addAudit('registry.initialized', 'system', 'registry', 'all', {
    featureCount: catalog.length,
    appCount: SOURCE_APPS.length,
  });

  return state;
}

// ── Feature Registry API ────────────────────────────────────────

export function getRegistryFeatures(): RegistryFeature[] {
  return Array.from(getState().features.values());
}

export function getRegistryFeature(id: string): RegistryFeature | undefined {
  return getState().features.get(id);
}

export function searchRegistryFeatures(query: {
  text?: string;
  category?: string;
  tier?: number;
  status?: string;
  tags?: string[];
}): RegistryFeature[] {
  let results = getRegistryFeatures();

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

  if (query.category) results = results.filter((f) => f.category === query.category);
  if (query.tier) results = results.filter((f) => f.tier === query.tier);
  if (query.status) results = results.filter((f) => f.status === query.status);
  if (query.tags?.length) results = results.filter((f) => query.tags!.some((t) => f.tags.includes(t)));

  return results;
}

export function validateFeatureSet(featureIds: string[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missingDeps: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingDeps: string[] = [];
  const s = getState();

  for (const id of featureIds) {
    const feature = s.features.get(id);
    if (!feature) {
      errors.push(`Feature ${id} not found`);
      continue;
    }

    for (const depId of feature.dependencies) {
      if (!featureIds.includes(depId)) {
        const dep = s.features.get(depId);
        missingDeps.push(depId);
        errors.push(`${feature.displayName} requires ${dep?.displayName ?? depId}`);
      }
    }
  }

  // Warn about missing foundation for higher-tier features
  const hasTier2Plus = featureIds.some((id) => {
    const f = s.features.get(id);
    return f && f.tier > 1;
  });

  if (hasTier2Plus) {
    const tier1 = Array.from(s.features.values()).filter((f) => f.tier === 1 && f.status === 'extracted');
    const missing = tier1.filter((f) => !featureIds.includes(f.id));
    if (missing.length > 0) {
      warnings.push(`Consider adding foundation features: ${missing.map((f) => f.displayName).join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, missingDeps };
}

// ── App Registry API ────────────────────────────────────────────

export function getRegisteredApps(): RegisteredAppEntry[] {
  return Array.from(getState().apps.values());
}

export function registerApp(app: RegisteredAppEntry): void {
  getState().apps.set(app.id, app);
  addAudit('app.registered', 'system', 'app', app.id, { name: app.name });
}

export function getAppsUsingFeature(featureId: string): RegisteredAppEntry[] {
  return Array.from(getState().apps.values()).filter((app) =>
    app.features.some((f) => f.featureId === featureId),
  );
}

// ── Migration API ───────────────────────────────────────────────

export function getMigrationInventories(): MigrationInventoryEntry[] {
  return Array.from(getState().migrations.values());
}

export function getMigrationInventory(appId: string): MigrationInventoryEntry | undefined {
  return getState().migrations.get(appId);
}

export function getMigrationMetrics() {
  const inventories = getMigrationInventories();
  const totalMappings = inventories.reduce((s, i) => s + i.features.length, 0);
  const migrated = inventories.reduce(
    (s, i) => s + i.features.filter((f) => f.status === 'migrated').length,
    0,
  );

  return {
    totalApps: inventories.length,
    fullyMigrated: inventories.filter(
      (i) => i.features.every((f) => f.status === 'migrated' || f.readiness === 'exception'),
    ).length,
    migrating: inventories.filter(
      (i) => i.features.some((f) => f.status === 'migrating'),
    ).length,
    exceptions: inventories.filter((i) => i.migrationPolicy === 'forward-only').length,
    totalMappings,
    featuresMigrated: migrated,
    duplicatedCodeReduction: totalMappings > 0 ? Math.round((migrated / totalMappings) * 100) : 0,
  };
}

// ── Pipeline API ────────────────────────────────────────────────

export function getPipelineRuns(): PipelineRunEntry[] {
  return getState().pipelines;
}

export function createPipelineRun(
  featureId: string,
  fromVersion: string,
  toVersion: string,
): PipelineRunEntry {
  const apps = getAppsUsingFeature(featureId);
  const run: PipelineRunEntry = {
    id: `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    featureId,
    fromVersion,
    toVersion,
    status: 'pending',
    targetApps: apps.length,
    startedAt: new Date().toISOString(),
  };

  getState().pipelines.push(run);
  addAudit('pipeline.created', 'system', 'pipeline', run.id, {
    featureId,
    fromVersion,
    toVersion,
  });

  return run;
}

// ── Admin Dashboard ─────────────────────────────────────────────

export function getAdminDashboard(): AdminDashboardData {
  const s = getState();
  const features = Array.from(s.features.values());

  return {
    registry: {
      totalFeatures: features.length,
      extractedFeatures: features.filter((f) => f.status === 'extracted').length,
      totalApps: s.apps.size,
      totalVersions: features.reduce((sum, f) => sum + f.versions.length, 0),
    },
    migration: getMigrationMetrics(),
    pipeline: {
      totalRuns: s.pipelines.length,
      active: s.pipelines.filter((p) => p.status === 'running' || p.status === 'pending').length,
      completed: s.pipelines.filter((p) => p.status === 'completed').length,
      failed: s.pipelines.filter((p) => p.status === 'failed').length,
    },
    requests: {
      pending: 0,
      inReview: 0,
      delivered: 0,
      enhancements: 0,
    },
  };
}

// ── Audit Log ───────────────────────────────────────────────────

export function getAuditLog(limit: number = 50): AuditEntry[] {
  return getState()
    .auditLog.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

function addAudit(
  action: string,
  actor: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>,
): void {
  getState().auditLog.push({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    action,
    actor,
    targetType,
    targetId,
    details,
  });
}
