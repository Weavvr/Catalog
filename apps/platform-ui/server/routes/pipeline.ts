import { Router } from 'express';
import {
  getPipelineRuns,
  createPipelineRun,
} from '../services/registryService.js';

const router = Router();

/** GET /api/pipeline/runs — All pipeline runs */
router.get('/runs', (_req, res) => {
  try {
    res.json({ data: getPipelineRuns() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/pipeline/trigger — Trigger a new pipeline run */
router.post('/trigger', (req, res) => {
  try {
    const { featureId, fromVersion, toVersion } = req.body as {
      featureId: string;
      fromVersion: string;
      toVersion: string;
    };

    if (!featureId || !fromVersion || !toVersion) {
      res.status(400).json({ error: 'featureId, fromVersion, and toVersion are required' });
      return;
    }

    const run = createPipelineRun(featureId, fromVersion, toVersion);
    res.status(201).json({ data: run });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
