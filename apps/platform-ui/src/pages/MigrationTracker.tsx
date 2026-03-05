import { useState, useEffect } from 'react';
import type { MigrationInventory, MigrationMetrics } from '../lib/types';
import { READINESS_COLORS } from '../lib/types';

export default function MigrationTracker() {
  const [inventories, setInventories] = useState<MigrationInventory[]>([]);
  const [metrics, setMetrics] = useState<MigrationMetrics | null>(null);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/migration/inventories').then((r) => r.json()),
      fetch('/api/migration/metrics').then((r) => r.json()),
    ])
      .then(([inv, met]) => {
        setInventories(inv.data);
        setMetrics(met.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-gray-500">Loading migration data...</div>;

  const selected = selectedApp
    ? inventories.find((i) => i.appId === selectedApp)
    : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Migration Tracker</h1>
        <p className="text-gray-500 mt-1">
          Track the phased migration of existing apps to the centralized feature library
        </p>
      </div>

      {/* Metrics summary */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatBadge label="Source Apps" value={metrics.totalApps} />
          <StatBadge label="Fully Migrated" value={metrics.fullyMigrated} />
          <StatBadge label="In Progress" value={metrics.migrating} />
          <StatBadge label="Exceptions" value={metrics.exceptions} />
          <StatBadge label="Code Reduction" value={`${metrics.duplicatedCodeReduction}%`} />
        </div>
      )}

      {/* App inventory list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Source Applications</h2>
          {inventories
            .sort((a, b) => a.priority - b.priority)
            .map((inv) => (
              <button
                key={inv.appId}
                onClick={() => setSelectedApp(inv.appId)}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
                  selectedApp === inv.appId
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">{inv.appName}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {inv.features.length} features mapped
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        inv.migrationPolicy === 'full'
                          ? 'bg-green-100 text-green-800'
                          : inv.migrationPolicy === 'forward-only'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {inv.migrationPolicy}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        { low: 'bg-green-100 text-green-800', medium: 'bg-yellow-100 text-yellow-800', high: 'bg-orange-100 text-orange-800', extreme: 'bg-red-100 text-red-800' }[inv.complexity]
                      }`}
                    >
                      {inv.complexity}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex gap-1">
                  {inv.features.slice(0, 8).map((f) => (
                    <span
                      key={f.sourceIdentifier}
                      className={`inline-block w-3 h-3 rounded-full ${
                        { ready: 'bg-green-400', 'needs-adapter': 'bg-yellow-400', 'needs-refactor': 'bg-orange-400', 'not-feasible': 'bg-red-400', exception: 'bg-gray-400' }[f.readiness]
                      }`}
                      title={`${f.sourceIdentifier}: ${f.readiness}`}
                    />
                  ))}
                  {inv.features.length > 8 && (
                    <span className="text-xs text-gray-400">+{inv.features.length - 8}</span>
                  )}
                </div>
              </button>
            ))}
        </div>

        {/* Detail panel */}
        <div>
          {selected ? (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-1">{selected.appName}</h2>
              <p className="text-sm text-gray-500 mb-4">{selected.repoUrl}</p>

              <div className="space-y-2">
                {selected.features.map((f) => (
                  <div
                    key={f.sourceIdentifier}
                    className="flex items-center justify-between p-3 rounded border"
                  >
                    <div>
                      <p className="text-sm font-medium">{f.sourceIdentifier}</p>
                      <p className="text-xs text-gray-500">
                        {f.masterFeatureId ?? 'unmapped'} | {f.estimatedEffort}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${READINESS_COLORS[f.readiness] ?? 'bg-gray-100'}`}
                    >
                      {f.readiness}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border border-dashed p-12 text-center text-gray-400">
              Select an app to view its migration details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg border p-3 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}
