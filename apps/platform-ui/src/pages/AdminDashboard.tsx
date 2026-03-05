import { useState, useEffect } from 'react';
import type { AdminDashboard as AdminDashboardType } from '../lib/types';

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState<AdminDashboardType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/registry/dashboard')
      .then((r) => r.json())
      .then((d) => setDashboard(d.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-gray-500">Loading dashboard...</div>;
  }

  if (!dashboard) {
    return <div className="p-6 text-red-500">Failed to load dashboard</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Centralized feature library overview — registry, migration, pipelines, and governance
        </p>
      </div>

      {/* Top-level metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Feature Registry"
          items={[
            { label: 'Total Features', value: dashboard.registry.totalFeatures },
            { label: 'Extracted', value: dashboard.registry.extractedFeatures },
            { label: 'Registered Apps', value: dashboard.registry.totalApps },
            { label: 'Total Versions', value: dashboard.registry.totalVersions },
          ]}
          accent="blue"
        />
        <MetricCard
          title="Migration Status"
          items={[
            { label: 'Source Apps', value: dashboard.migration.totalApps },
            { label: 'Fully Migrated', value: dashboard.migration.fullyMigrated },
            { label: 'In Progress', value: dashboard.migration.migrating },
            { label: 'Exceptions', value: dashboard.migration.exceptions },
          ]}
          accent="green"
        />
        <MetricCard
          title="Update Pipelines"
          items={[
            { label: 'Total Runs', value: dashboard.pipeline.totalRuns },
            { label: 'Active', value: dashboard.pipeline.active },
            { label: 'Completed', value: dashboard.pipeline.completed },
            { label: 'Failed', value: dashboard.pipeline.failed },
          ]}
          accent="purple"
        />
        <MetricCard
          title="Governance Queue"
          items={[
            { label: 'Pending', value: dashboard.requests.pending },
            { label: 'In Review', value: dashboard.requests.inReview },
            { label: 'Delivered', value: dashboard.requests.delivered },
            { label: 'Enhancements', value: dashboard.requests.enhancements },
          ]}
          accent="orange"
        />
      </div>

      {/* Migration progress */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Migration Progress</h2>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Feature Mappings Migrated</span>
              <span className="font-medium">
                {dashboard.migration.featuresMigrated} / {dashboard.migration.totalMappings}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{
                  width: `${dashboard.migration.duplicatedCodeReduction}%`,
                }}
              />
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Duplicated code reduction: {dashboard.migration.duplicatedCodeReduction}%
          </p>
        </div>
      </div>

      {/* Architecture overview */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Architecture Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="border rounded-lg p-4">
            <h3 className="font-medium text-blue-700 mb-2">Feature Registry</h3>
            <ul className="space-y-1 text-gray-600">
              <li>Semantic versioning (semver)</li>
              <li>Dependency tracking + audit trails</li>
              <li>Compatibility rules engine</li>
              <li>Integration contracts (API surface)</li>
            </ul>
          </div>
          <div className="border rounded-lg p-4">
            <h3 className="font-medium text-green-700 mb-2">Update Pipeline</h3>
            <ul className="space-y-1 text-gray-600">
              <li>Test gates (unit, typecheck, lint)</li>
              <li>Canary deployments</li>
              <li>Approval workflows</li>
              <li>Automatic rollback on failure</li>
            </ul>
          </div>
          <div className="border rounded-lg p-4">
            <h3 className="font-medium text-purple-700 mb-2">App Assembly</h3>
            <ul className="space-y-1 text-gray-600">
              <li>Feature selection + validation</li>
              <li>Scaffold generation</li>
              <li>AI-assisted recommendations</li>
              <li>Admin governance portal</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  items,
  accent,
}: {
  title: string;
  items: { label: string; value: number }[];
  accent: string;
}) {
  const borderColor = {
    blue: 'border-t-blue-500',
    green: 'border-t-green-500',
    purple: 'border-t-purple-500',
    orange: 'border-t-orange-500',
  }[accent] ?? 'border-t-gray-500';

  return (
    <div className={`bg-white rounded-lg border border-t-4 ${borderColor} p-4`}>
      <h3 className="text-sm font-medium text-gray-500 mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between items-center">
            <span className="text-sm text-gray-600">{item.label}</span>
            <span className="text-lg font-semibold">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
