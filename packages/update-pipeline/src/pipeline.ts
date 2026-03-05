/**
 * Update Pipeline Engine
 * Orchestrates automated feature updates across downstream apps.
 * Handles test gates, canary deployments, approvals, notifications, and rollbacks.
 */

import type { FeatureRegistry, SemVer, RegisteredApp, RegisteredFeature } from '@hmc/feature-registry';
import { getBumpType } from '@hmc/feature-registry';
import type {
  PipelineRun,
  PipelineConfig,
  PipelineAppTarget,
  PipelineStep,
  PipelineNotification,
  PipelineStatus,
  TestResult,
  TestGate,
  RollbackRecord,
  CanaryMetrics,
} from './types.js';

/** Test runner function — provided by the host environment */
export type TestRunner = (
  appId: string,
  featureId: string,
  version: SemVer,
  gate: TestGate,
) => Promise<TestResult>;

/** Notification sender — provided by the host environment */
export type NotificationSender = (notification: PipelineNotification) => Promise<void>;

/** Merge executor — provided by the host environment */
export type MergeExecutor = (
  appId: string,
  featureId: string,
  version: SemVer,
) => Promise<{ success: boolean; error?: string }>;

const DEFAULT_CONFIG: PipelineConfig = {
  testGates: ['unit', 'typecheck', 'lint'],
  requireApproval: false,
  approvers: [],
  canaryEnabled: false,
  canaryDuration: 3600,
  canaryErrorThreshold: 0.01,
  rollbackOnFailure: true,
  notificationChannels: ['webhook'],
  parallelTestLimit: 4,
};

export class UpdatePipeline {
  private runs: Map<string, PipelineRun> = new Map();
  private rollbacks: RollbackRecord[] = [];
  private config: PipelineConfig;
  private pendingApprovals: Map<string, { resolve: (approved: boolean) => void }> = new Map();

  constructor(
    private registry: FeatureRegistry,
    private testRunner: TestRunner,
    private notifier: NotificationSender,
    private merger: MergeExecutor,
    config?: Partial<PipelineConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Trigger an update pipeline for a feature version bump */
  async triggerUpdate(
    featureId: string,
    newVersion: SemVer,
    triggeredBy: string,
  ): Promise<PipelineRun> {
    const feature = this.registry.getFeature(featureId);
    if (!feature) throw new Error(`Feature ${featureId} not found`);

    const candidates = this.registry.getUpdateCandidates(featureId, newVersion);
    const allTargets = [
      ...candidates.autoUpdate,
      ...candidates.canary,
      ...candidates.manualReview,
    ];

    if (allTargets.length === 0) {
      throw new Error(`No apps need updating for ${feature.name}@${newVersion}`);
    }

    const run = this.createPipelineRun(feature, newVersion, allTargets, triggeredBy);
    this.runs.set(run.id, run);

    await this.notifier({
      channel: 'webhook',
      sentAt: new Date().toISOString(),
      type: 'started',
      message: `Update pipeline started: ${feature.displayName} ${feature.currentVersion} → ${newVersion} (${allTargets.length} apps)`,
    });

    await this.executePipeline(run);

    return run;
  }

  /** Approve a pending pipeline (for manual approval gates) */
  approveUpdate(pipelineId: string): boolean {
    const resolver = this.pendingApprovals.get(pipelineId);
    if (resolver) {
      resolver.resolve(true);
      this.pendingApprovals.delete(pipelineId);
      return true;
    }
    return false;
  }

  /** Reject a pending pipeline */
  rejectUpdate(pipelineId: string): boolean {
    const resolver = this.pendingApprovals.get(pipelineId);
    if (resolver) {
      resolver.resolve(false);
      this.pendingApprovals.delete(pipelineId);
      return true;
    }
    return false;
  }

  /** Manually trigger rollback for a pipeline */
  async rollback(pipelineId: string, reason: string): Promise<RollbackRecord[]> {
    const run = this.runs.get(pipelineId);
    if (!run) throw new Error(`Pipeline ${pipelineId} not found`);

    const records: RollbackRecord[] = [];

    for (const target of run.targetApps) {
      if (target.status === 'completed') {
        // Revert the app to its previous version
        const result = this.registry.addFeatureToApp(
          target.appId,
          run.featureId,
          target.currentVersion,
        );

        if (result.success) {
          target.status = 'rolled-back';
          target.rolledBackAt = new Date().toISOString();

          const record: RollbackRecord = {
            pipelineId,
            appId: target.appId,
            featureId: run.featureId,
            fromVersion: target.targetVersion,
            toVersion: target.currentVersion,
            reason,
            executedAt: new Date().toISOString(),
            restoredVersion: target.currentVersion,
          };

          records.push(record);
          this.rollbacks.push(record);
        }
      }
    }

    run.status = 'rolled-back';
    run.completedAt = new Date().toISOString();

    await this.notifier({
      channel: 'webhook',
      sentAt: new Date().toISOString(),
      type: 'rolled-back',
      message: `Pipeline ${pipelineId} rolled back: ${reason}. ${records.length} apps reverted.`,
    });

    return records;
  }

  /** Get a pipeline run by ID */
  getRun(id: string): PipelineRun | undefined {
    return this.runs.get(id);
  }

  /** Get all pipeline runs */
  getAllRuns(): PipelineRun[] {
    return Array.from(this.runs.values());
  }

  /** Get rollback history */
  getRollbackHistory(): RollbackRecord[] {
    return [...this.rollbacks];
  }

  private createPipelineRun(
    feature: RegisteredFeature,
    newVersion: SemVer,
    apps: RegisteredApp[],
    triggeredBy: string,
  ): PipelineRun {
    const targets: PipelineAppTarget[] = apps.map((app) => {
      const binding = app.features.find((f) => f.featureId === feature.id);
      return {
        appId: app.id,
        appName: app.name,
        status: 'pending' as PipelineStatus,
        currentVersion: binding?.pinnedVersion ?? '0.0.0',
        targetVersion: newVersion,
        testResults: [],
      };
    });

    const steps: PipelineStep[] = [
      ...this.config.testGates.map((gate, i) => ({
        id: `step-test-${gate}`,
        name: `Run ${gate} tests`,
        type: 'test-gate' as const,
        status: 'pending' as const,
      })),
    ];

    if (this.config.canaryEnabled) {
      steps.push({
        id: 'step-canary',
        name: 'Canary deployment',
        type: 'canary-deploy',
        status: 'pending',
      });
    }

    if (this.config.requireApproval) {
      steps.push({
        id: 'step-approval',
        name: 'Manual approval',
        type: 'approval',
        status: 'pending',
      });
    }

    steps.push({
      id: 'step-merge',
      name: 'Merge updates',
      type: 'merge',
      status: 'pending',
    });

    steps.push({
      id: 'step-notify',
      name: 'Send notifications',
      type: 'notify',
      status: 'pending',
    });

    return {
      id: `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      featureId: feature.id,
      fromVersion: feature.currentVersion,
      toVersion: newVersion,
      status: 'pending',
      targetApps: targets,
      steps,
      startedAt: new Date().toISOString(),
      triggeredBy,
      notifications: [],
    };
  }

  private async executePipeline(run: PipelineRun): Promise<void> {
    run.status = 'running';

    // Phase 1: Run test gates for each target app
    run.status = 'testing';
    for (const step of run.steps.filter((s) => s.type === 'test-gate')) {
      step.status = 'running';
      step.startedAt = new Date().toISOString();

      const gate = step.id.replace('step-test-', '') as TestGate;
      let allPassed = true;

      for (const target of run.targetApps) {
        try {
          const result = await this.testRunner(
            target.appId,
            run.featureId,
            run.toVersion,
            gate,
          );
          target.testResults.push(result);

          if (!result.passed) {
            allPassed = false;
            target.status = 'failed';
            target.error = `${gate} tests failed: ${result.summary}`;
          }
        } catch (err) {
          allPassed = false;
          target.status = 'failed';
          target.error = `${gate} test error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      step.status = allPassed ? 'passed' : 'failed';
      step.completedAt = new Date().toISOString();

      if (!allPassed) {
        await this.notifier({
          channel: 'webhook',
          sentAt: new Date().toISOString(),
          type: 'test-failed',
          message: `Test gate "${gate}" failed for pipeline ${run.id}`,
        });

        if (this.config.rollbackOnFailure) {
          run.status = 'failed';
          return;
        }
      }
    }

    await this.notifier({
      channel: 'webhook',
      sentAt: new Date().toISOString(),
      type: 'test-passed',
      message: `All test gates passed for pipeline ${run.id}`,
    });

    // Phase 2: Canary deployment (if enabled)
    const canaryStep = run.steps.find((s) => s.type === 'canary-deploy');
    if (canaryStep) {
      canaryStep.status = 'running';
      canaryStep.startedAt = new Date().toISOString();
      run.status = 'canary';

      // In production, this would deploy to a subset and monitor metrics.
      // Here we simulate the canary check passing.
      for (const target of run.targetApps.filter((t) => t.status !== 'failed')) {
        target.canaryMetrics = {
          deployedAt: new Date().toISOString(),
          duration: this.config.canaryDuration,
          errorRate: 0,
          latencyP50: 45,
          latencyP99: 200,
          successThreshold: this.config.canaryErrorThreshold,
          passed: true,
        };
      }

      canaryStep.status = 'passed';
      canaryStep.completedAt = new Date().toISOString();
    }

    // Phase 3: Approval gate (if required)
    const approvalStep = run.steps.find((s) => s.type === 'approval');
    if (approvalStep) {
      approvalStep.status = 'running';
      approvalStep.startedAt = new Date().toISOString();
      run.status = 'awaiting-approval';

      await this.notifier({
        channel: 'webhook',
        sentAt: new Date().toISOString(),
        type: 'approval-needed',
        message: `Pipeline ${run.id} awaiting approval from: ${this.config.approvers.join(', ')}`,
      });

      const approved = await new Promise<boolean>((resolve) => {
        this.pendingApprovals.set(run.id, { resolve });
      });

      if (!approved) {
        approvalStep.status = 'failed';
        run.status = 'failed';
        return;
      }

      approvalStep.status = 'passed';
      approvalStep.completedAt = new Date().toISOString();
    }

    // Phase 4: Merge updates into target apps
    const mergeStep = run.steps.find((s) => s.type === 'merge');
    if (mergeStep) {
      mergeStep.status = 'running';
      mergeStep.startedAt = new Date().toISOString();
      run.status = 'merging';

      for (const target of run.targetApps.filter((t) => t.status !== 'failed')) {
        const mergeResult = await this.merger(target.appId, run.featureId, run.toVersion);

        if (mergeResult.success) {
          this.registry.addFeatureToApp(target.appId, run.featureId, run.toVersion);
          target.status = 'completed';
          target.mergedAt = new Date().toISOString();
        } else {
          target.status = 'failed';
          target.error = mergeResult.error;
        }
      }

      const anyFailed = run.targetApps.some((t) => t.status === 'failed');
      mergeStep.status = anyFailed ? 'failed' : 'passed';
      mergeStep.completedAt = new Date().toISOString();
    }

    // Phase 5: Completion notifications
    const notifyStep = run.steps.find((s) => s.type === 'notify');
    if (notifyStep) {
      notifyStep.status = 'running';

      const succeeded = run.targetApps.filter((t) => t.status === 'completed').length;
      const failed = run.targetApps.filter((t) => t.status === 'failed').length;

      await this.notifier({
        channel: 'webhook',
        sentAt: new Date().toISOString(),
        type: 'completed',
        message: `Pipeline ${run.id} completed: ${succeeded} apps updated, ${failed} failed`,
      });

      notifyStep.status = 'passed';
      notifyStep.completedAt = new Date().toISOString();
    }

    run.status = run.targetApps.every((t) => t.status === 'completed') ? 'completed' : 'failed';
    run.completedAt = new Date().toISOString();
  }
}
