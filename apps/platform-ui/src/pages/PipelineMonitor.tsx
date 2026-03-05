import { useState, useEffect } from 'react';
import type { PipelineRun, RegistryFeature } from '../lib/types';
import { PIPELINE_STATUS_COLORS } from '../lib/types';

export default function PipelineMonitor() {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [features, setFeatures] = useState<RegistryFeature[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/pipeline/runs').then((r) => r.json()),
      fetch('/api/registry/features').then((r) => r.json()),
    ])
      .then(([runsData, featData]) => {
        setRuns(runsData.data);
        setFeatures(featData.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const getFeatureName = (id: string) =>
    features.find((f) => f.id === id)?.displayName ?? id;

  if (loading) return <div className="p-6 text-gray-500">Loading pipeline data...</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Update Pipeline Monitor</h1>
        <p className="text-gray-500 mt-1">
          Track automated feature update propagation across downstream apps
        </p>
      </div>

      {/* Pipeline architecture info */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-3">Pipeline Flow</h2>
        <div className="flex items-center gap-2 text-sm overflow-x-auto pb-2">
          {['Feature Published', 'Detect Apps', 'Test Gates', 'Canary Deploy', 'Approval', 'Merge', 'Notify'].map(
            (step, i) => (
              <div key={step} className="flex items-center gap-2 shrink-0">
                {i > 0 && <span className="text-gray-300">&#8594;</span>}
                <span className="px-3 py-1.5 bg-gray-100 rounded-md text-gray-700 whitespace-nowrap">
                  {step}
                </span>
              </div>
            ),
          )}
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-500">
          <div>
            <strong>Test Gates:</strong> unit, typecheck, lint — configurable per feature
          </div>
          <div>
            <strong>Canary:</strong> deploy to subset, monitor error rate, auto-rollback
          </div>
          <div>
            <strong>Rollback:</strong> automatic on gate failure, manual trigger available
          </div>
        </div>
      </div>

      {/* Pipeline runs */}
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Pipeline Runs</h2>
        </div>

        {runs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-lg mb-2">No pipeline runs yet</p>
            <p className="text-sm">
              Pipeline runs are triggered when feature versions are published.
              Use the Feature Registry to publish updates.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {runs.map((run) => (
              <div key={run.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">
                      {getFeatureName(run.featureId)}: {run.fromVersion} &#8594;{' '}
                      {run.toVersion}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {run.targetApps} target app{run.targetApps !== 1 ? 's' : ''} |
                      Started {new Date(run.startedAt).toLocaleString()}
                      {run.completedAt &&
                        ` | Completed ${new Date(run.completedAt).toLocaleString()}`}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-3 py-1 rounded-full ${
                      PIPELINE_STATUS_COLORS[run.status] ?? 'bg-gray-100'
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Feature version overview */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Feature Versions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {features
            .filter((f) => f.status === 'extracted')
            .slice(0, 12)
            .map((f) => (
              <div key={f.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">{f.displayName}</p>
                    <p className="text-xs text-gray-500">{f.package}</p>
                  </div>
                  <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">
                    v{f.version}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      { auto: 'bg-green-50 text-green-700', manual: 'bg-blue-50 text-blue-700', canary: 'bg-yellow-50 text-yellow-700', scheduled: 'bg-purple-50 text-purple-700' }[f.updatePolicy]
                    }`}
                  >
                    {f.updatePolicy}
                  </span>
                  <span>Tier {f.tier}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
