/**
 * App Assembler Types
 * Types for the app builder UX — end-user assembly and admin governance.
 */

/** Request status in the admin queue */
export type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'in-review'
  | 'needs-clarification'
  | 'approved'
  | 'rejected'
  | 'building'
  | 'delivered';

/** Enhancement request priority */
export type EnhancementPriority = 'low' | 'medium' | 'high' | 'critical';

/** App assembly request from an end user */
export interface AssemblyRequest {
  id: string;
  requestedBy: string;
  requestedAt: string;
  appName: string;
  description: string;
  selectedFeatures: SelectedFeature[];
  template: 'api-only' | 'express-react';
  status: RequestStatus;
  reviewedBy?: string;
  reviewNotes?: string;
  enhancements: EnhancementRequest[];
  generatedRepoUrl?: string;
  auditTrail: AssemblyAuditEntry[];
}

/** A feature selected for assembly with configuration */
export interface SelectedFeature {
  featureId: string;
  version: string;
  configuration: Record<string, unknown>;
  customizations: string[];
}

/** Enhancement request for a feature not yet available */
export interface EnhancementRequest {
  id: string;
  featureId?: string;
  title: string;
  description: string;
  priority: EnhancementPriority;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'accepted' | 'in-progress' | 'completed' | 'declined';
  adminResponse?: string;
  targetVersion?: string;
}

/** Admin clarification request */
export interface ClarificationRequest {
  id: string;
  assemblyRequestId: string;
  question: string;
  askedBy: string;
  askedAt: string;
  response?: string;
  respondedAt?: string;
}

/** Audit entry for assembly decisions */
export interface AssemblyAuditEntry {
  timestamp: string;
  action: string;
  actor: string;
  details: string;
}

/** Assembly validation result */
export interface AssemblyValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  resolvedDependencies: string[];
  missingDependencies: string[];
  configurationIssues: string[];
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  estimatedBuildTime: string;
}

/** Generated app scaffold */
export interface AppScaffold {
  appName: string;
  template: string;
  features: string[];
  packageJson: Record<string, unknown>;
  serverEntry: string;
  clientEntry?: string;
  envTemplate: string;
  configFiles: { path: string; content: string }[];
}

/** Admin dashboard summary */
export interface AdminDashboard {
  pendingRequests: number;
  inReviewRequests: number;
  needsClarification: number;
  enhancementsQueue: number;
  recentlyDelivered: number;
  topRequestedFeatures: { featureId: string; count: number }[];
  avgReviewTime: string;
}
