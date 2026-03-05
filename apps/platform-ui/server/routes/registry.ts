import { Router } from 'express';
import {
  getRegistryFeatures,
  getRegistryFeature,
  searchRegistryFeatures,
  validateFeatureSet,
  getRegisteredApps,
  getAppsUsingFeature,
  getAdminDashboard,
  getAuditLog,
} from '../services/registryService.js';

const router = Router();

/** GET /api/registry/features — All features with versioning metadata */
router.get('/features', (req, res) => {
  try {
    const query = {
      text: req.query.q as string | undefined,
      category: req.query.category as string | undefined,
      tier: req.query.tier ? parseInt(req.query.tier as string) : undefined,
      status: req.query.status as string | undefined,
    };

    const features = Object.keys(query).some((k) => (query as any)[k])
      ? searchRegistryFeatures(query)
      : getRegistryFeatures();

    res.json({ data: features, total: features.length });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/registry/features/:id — Single feature with version history */
router.get('/features/:id', (req, res) => {
  try {
    const feature = getRegistryFeature(req.params.id);
    if (!feature) {
      res.status(404).json({ error: `Feature ${req.params.id} not found` });
      return;
    }

    const usedBy = getAppsUsingFeature(req.params.id);

    res.json({
      data: {
        ...feature,
        usedByApps: usedBy.map((a) => ({ id: a.id, name: a.name })),
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/registry/validate — Validate a feature selection */
router.post('/validate', (req, res) => {
  try {
    const { featureIds } = req.body as { featureIds: string[] };
    if (!Array.isArray(featureIds)) {
      res.status(400).json({ error: 'featureIds must be an array' });
      return;
    }

    const result = validateFeatureSet(featureIds);
    res.json({ data: result });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/registry/apps — All registered apps */
router.get('/apps', (_req, res) => {
  try {
    res.json({ data: getRegisteredApps() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/registry/dashboard — Admin dashboard data */
router.get('/dashboard', (_req, res) => {
  try {
    res.json({ data: getAdminDashboard() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/registry/audit — Audit log */
router.get('/audit', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    res.json({ data: getAuditLog(limit) });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
