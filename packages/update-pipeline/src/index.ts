/**
 * @hmc/update-pipeline
 * Automated feature update pipeline with test gates, canary deployments,
 * approval workflows, and rollback mechanisms.
 */

export { UpdatePipeline } from './pipeline.js';
export type { TestRunner, NotificationSender, MergeExecutor } from './pipeline.js';
export * from './types.js';
