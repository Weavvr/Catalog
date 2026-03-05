/**
 * App Assembler
 * Orchestrates app assembly from the feature catalog.
 * Provides end-user feature browsing/selection, validation, scaffold generation,
 * and admin governance workflows.
 */

import type { FeatureRegistry, RegisteredFeature } from '@hmc/feature-registry';
import type {
  AssemblyRequest,
  SelectedFeature,
  EnhancementRequest,
  ClarificationRequest,
  AssemblyValidation,
  AppScaffold,
  AdminDashboard,
  RequestStatus,
} from './types.js';

export class AppAssembler {
  private requests: Map<string, AssemblyRequest> = new Map();
  private enhancements: Map<string, EnhancementRequest> = new Map();
  private clarifications: Map<string, ClarificationRequest> = new Map();

  constructor(private registry: FeatureRegistry) {}

  // ─── End-User Assembly Flow ────────────────────────────────────

  /** Browse the feature catalog with filtering */
  browseFeatures(query?: {
    text?: string;
    category?: string;
    tier?: number;
    tags?: string[];
  }): RegisteredFeature[] {
    return this.registry.searchFeatures(query ?? {}).filter(
      (f) => f.status === 'extracted',
    );
  }

  /** Get feature details with dependency info */
  getFeatureDetails(featureId: string): {
    feature: RegisteredFeature;
    dependencies: RegisteredFeature[];
    dependents: RegisteredFeature[];
    usedByApps: number;
  } | null {
    const feature = this.registry.getFeature(featureId);
    if (!feature) return null;

    const dependencies = feature.dependencies
      .map((d) => this.registry.getFeature(d.featureId))
      .filter((f): f is RegisteredFeature => f !== undefined);

    const allFeatures = this.registry.getAllFeatures();
    const dependents = allFeatures.filter((f) =>
      f.dependencies.some((d) => d.featureId === featureId),
    );

    const usedByApps = this.registry.getAppsUsingFeature(featureId).length;

    return { feature, dependencies, dependents, usedByApps };
  }

  /** Validate a set of selected features before submission */
  validateAssembly(selectedFeatures: SelectedFeature[]): AssemblyValidation {
    const featureIds = selectedFeatures.map((f) => f.featureId);
    const validation = this.registry.validateFeatureSet(featureIds);

    const configIssues: string[] = [];
    for (const selected of selectedFeatures) {
      const feature = this.registry.getFeature(selected.featureId);
      if (feature?.configRequired.length) {
        const missing = feature.configRequired.filter(
          (key) => !selected.configuration[key],
        );
        if (missing.length > 0) {
          configIssues.push(
            `${feature.displayName}: missing config — ${missing.join(', ')}`,
          );
        }
      }
    }

    const complexity = featureIds.length <= 5
      ? 'simple'
      : featureIds.length <= 15
        ? 'moderate'
        : 'complex';

    return {
      valid: validation.valid && configIssues.length === 0,
      errors: [...validation.errors],
      warnings: [...validation.warnings],
      resolvedDependencies: validation.missingDeps.length === 0
        ? featureIds
        : featureIds.filter((id) => !validation.missingDeps.includes(id)),
      missingDependencies: validation.missingDeps,
      configurationIssues: configIssues,
      estimatedComplexity: complexity,
      estimatedBuildTime: complexity === 'simple' ? '< 5 min' : complexity === 'moderate' ? '5-15 min' : '15-30 min',
    };
  }

  /** Create an assembly request */
  createRequest(
    requestedBy: string,
    appName: string,
    description: string,
    selectedFeatures: SelectedFeature[],
    template: 'api-only' | 'express-react',
  ): AssemblyRequest {
    const request: AssemblyRequest = {
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      requestedBy,
      requestedAt: new Date().toISOString(),
      appName,
      description,
      selectedFeatures,
      template,
      status: 'submitted',
      enhancements: [],
      auditTrail: [
        {
          timestamp: new Date().toISOString(),
          action: 'request.created',
          actor: requestedBy,
          details: `Assembly request created with ${selectedFeatures.length} features`,
        },
      ],
    };

    this.requests.set(request.id, request);
    return request;
  }

  /** Submit an enhancement request */
  submitEnhancement(
    requestedBy: string,
    title: string,
    description: string,
    priority: 'low' | 'medium' | 'high' | 'critical',
    featureId?: string,
    assemblyRequestId?: string,
  ): EnhancementRequest {
    const enhancement: EnhancementRequest = {
      id: `enh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      featureId,
      title,
      description,
      priority,
      requestedBy,
      requestedAt: new Date().toISOString(),
      status: 'pending',
    };

    this.enhancements.set(enhancement.id, enhancement);

    if (assemblyRequestId) {
      const request = this.requests.get(assemblyRequestId);
      if (request) {
        request.enhancements.push(enhancement);
      }
    }

    return enhancement;
  }

  // ─── Admin Governance Flow ─────────────────────────────────────

  /** Get the admin dashboard summary */
  getAdminDashboard(): AdminDashboard {
    const allRequests = Array.from(this.requests.values());
    const allEnhancements = Array.from(this.enhancements.values());

    const featureCounts = new Map<string, number>();
    for (const req of allRequests) {
      for (const sf of req.selectedFeatures) {
        featureCounts.set(sf.featureId, (featureCounts.get(sf.featureId) ?? 0) + 1);
      }
    }

    const topFeatures = Array.from(featureCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([featureId, count]) => ({ featureId, count }));

    return {
      pendingRequests: allRequests.filter((r) => r.status === 'submitted').length,
      inReviewRequests: allRequests.filter((r) => r.status === 'in-review').length,
      needsClarification: allRequests.filter((r) => r.status === 'needs-clarification').length,
      enhancementsQueue: allEnhancements.filter((e) => e.status === 'pending').length,
      recentlyDelivered: allRequests.filter((r) => r.status === 'delivered').length,
      topRequestedFeatures: topFeatures,
      avgReviewTime: 'N/A',
    };
  }

  /** Review an assembly request (admin action) */
  reviewRequest(
    requestId: string,
    reviewedBy: string,
    action: 'approve' | 'reject' | 'clarify',
    notes: string,
  ): AssemblyRequest | null {
    const request = this.requests.get(requestId);
    if (!request) return null;

    const statusMap: Record<string, RequestStatus> = {
      approve: 'approved',
      reject: 'rejected',
      clarify: 'needs-clarification',
    };

    request.status = statusMap[action];
    request.reviewedBy = reviewedBy;
    request.reviewNotes = notes;
    request.auditTrail.push({
      timestamp: new Date().toISOString(),
      action: `request.${action}`,
      actor: reviewedBy,
      details: notes,
    });

    if (action === 'clarify') {
      const clarification: ClarificationRequest = {
        id: `clar-${Date.now()}`,
        assemblyRequestId: requestId,
        question: notes,
        askedBy: reviewedBy,
        askedAt: new Date().toISOString(),
      };
      this.clarifications.set(clarification.id, clarification);
    }

    return request;
  }

  /** Respond to a clarification (end-user action) */
  respondToClarification(
    clarificationId: string,
    response: string,
  ): ClarificationRequest | null {
    const clarification = this.clarifications.get(clarificationId);
    if (!clarification) return null;

    clarification.response = response;
    clarification.respondedAt = new Date().toISOString();

    const request = this.requests.get(clarification.assemblyRequestId);
    if (request) {
      request.status = 'submitted';
      request.auditTrail.push({
        timestamp: new Date().toISOString(),
        action: 'clarification.responded',
        actor: 'user',
        details: response,
      });
    }

    return clarification;
  }

  /** Generate app scaffold for an approved request */
  generateScaffold(requestId: string): AppScaffold | null {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'approved') return null;

    request.status = 'building';

    const features = request.selectedFeatures.map((sf) => {
      const feature = this.registry.getFeature(sf.featureId);
      return feature?.name ?? sf.featureId;
    });

    const dependencies: Record<string, string> = {};
    for (const sf of request.selectedFeatures) {
      const feature = this.registry.getFeature(sf.featureId);
      if (feature?.package) {
        dependencies[feature.package] = `^${sf.version}`;
      }
    }

    const envVars: string[] = [];
    for (const sf of request.selectedFeatures) {
      const feature = this.registry.getFeature(sf.featureId);
      if (feature?.configRequired) {
        for (const config of feature.configRequired) {
          envVars.push(`# ${feature.displayName}: ${config}`);
          envVars.push(`${config.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}=`);
        }
      }
    }

    const scaffold: AppScaffold = {
      appName: request.appName,
      template: request.template,
      features,
      packageJson: {
        name: `@hmc/${request.appName}`,
        version: '1.0.0',
        private: true,
        type: 'module',
        dependencies: {
          ...dependencies,
          express: '^4.21.0',
        },
      },
      serverEntry: this.generateServerEntry(request),
      clientEntry: request.template === 'express-react'
        ? this.generateClientEntry(request)
        : undefined,
      envTemplate: envVars.join('\n'),
      configFiles: [],
    };

    request.auditTrail.push({
      timestamp: new Date().toISOString(),
      action: 'scaffold.generated',
      actor: 'system',
      details: `Generated ${request.template} scaffold with ${features.length} features`,
    });

    return scaffold;
  }

  /** Get all requests (with optional filtering) */
  getRequests(filter?: { status?: RequestStatus; requestedBy?: string }): AssemblyRequest[] {
    let results = Array.from(this.requests.values());
    if (filter?.status) results = results.filter((r) => r.status === filter.status);
    if (filter?.requestedBy) results = results.filter((r) => r.requestedBy === filter.requestedBy);
    return results.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  /** Get all enhancements */
  getEnhancements(): EnhancementRequest[] {
    return Array.from(this.enhancements.values())
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  private generateServerEntry(request: AssemblyRequest): string {
    const imports: string[] = ["import express from 'express';"];
    const setup: string[] = [];

    for (const sf of request.selectedFeatures) {
      const feature = this.registry.getFeature(sf.featureId);
      if (!feature?.package) continue;

      imports.push(`import { setup${this.toPascalCase(feature.name)} } from '${feature.package}';`);
      setup.push(`  await setup${this.toPascalCase(feature.name)}(app);`);
    }

    return [
      ...imports,
      '',
      'const app = express();',
      'const PORT = process.env.PORT || 3000;',
      '',
      'app.use(express.json());',
      '',
      'async function bootstrap() {',
      ...setup,
      '',
      `  app.listen(Number(PORT), '0.0.0.0', () => {`,
      `    console.log(\`${request.appName} running on port \${PORT}\`);`,
      '  });',
      '}',
      '',
      'bootstrap().catch(console.error);',
    ].join('\n');
  }

  private generateClientEntry(request: AssemblyRequest): string {
    return [
      "import React from 'react';",
      "import { BrowserRouter, Routes, Route } from 'react-router-dom';",
      '',
      'export default function App() {',
      '  return (',
      '    <BrowserRouter>',
      '      <Routes>',
      '        <Route path="/" element={<div>Welcome</div>} />',
      '      </Routes>',
      '    </BrowserRouter>',
      '  );',
      '}',
    ].join('\n');
  }

  private toPascalCase(str: string): string {
    return str
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
  }
}
