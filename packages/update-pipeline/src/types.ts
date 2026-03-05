/**
 * Update Pipeline Types
 * Types for managing automated feature update propagation across apps.
 */

import type { SemVer } from '@hmc/feature-registry';

/** Pipeline execution status */
export type PipelineStatus =
  | 'pending'
  | 'running'
  | 'testing'
  | 'canary'
  | 'awaiting-approval'
  | 'merging'
  | 'completed'
  | 'failed'
  | 'rolled-back';

/** Individual step in a pipeline */
export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

/** Test gate types */
export type TestGate = 'unit' | 'integration' | 'e2e' | 'typecheck' | 'lint' | 'security-scan';

/** Notification channel */
export type NotificationChannel = 'webhook' | 'email' | 'slack' | 'github-issue';

/** An update propagation pipeline run */
export interface PipelineRun {
  id: string;
  featureId: string;
  fromVersion: SemVer;
  toVersion: SemVer;
  status: PipelineStatus;
  targetApps: PipelineAppTarget[];
  steps: PipelineStep[];
  startedAt: string;
  completedAt?: string;
  triggeredBy: string;
  rollbackVersion?: SemVer;
  notifications: PipelineNotification[];
}

/** Target app in a pipeline run */
export interface PipelineAppTarget {
  appId: string;
  appName: string;
  status: PipelineStatus;
  currentVersion: SemVer;
  targetVersion: SemVer;
  testResults: TestResult[];
  canaryMetrics?: CanaryMetrics;
  mergedAt?: string;
  rolledBackAt?: string;
  error?: string;
}

/** Pipeline step definition */
export interface PipelineStep {
  id: string;
  name: string;
  type: 'test-gate' | 'canary-deploy' | 'approval' | 'merge' | 'notify' | 'rollback-check';
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
}

/** Test execution result */
export interface TestResult {
  gate: TestGate;
  passed: boolean;
  duration: number;
  summary: string;
  coverage?: number;
  failedTests?: string[];
}

/** Canary deployment metrics */
export interface CanaryMetrics {
  deployedAt: string;
  duration: number;
  errorRate: number;
  latencyP50: number;
  latencyP99: number;
  successThreshold: number;
  passed: boolean;
}

/** Pipeline notification */
export interface PipelineNotification {
  channel: NotificationChannel;
  sentAt: string;
  type: 'started' | 'test-passed' | 'test-failed' | 'approval-needed' | 'completed' | 'rolled-back';
  message: string;
}

/** Pipeline configuration */
export interface PipelineConfig {
  testGates: TestGate[];
  requireApproval: boolean;
  approvers: string[];
  canaryEnabled: boolean;
  canaryDuration: number;
  canaryErrorThreshold: number;
  rollbackOnFailure: boolean;
  notificationChannels: NotificationChannel[];
  parallelTestLimit: number;
}

/** Rollback record */
export interface RollbackRecord {
  pipelineId: string;
  appId: string;
  featureId: string;
  fromVersion: SemVer;
  toVersion: SemVer;
  reason: string;
  executedAt: string;
  restoredVersion: SemVer;
}
