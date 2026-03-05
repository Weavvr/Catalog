import { Router } from 'express';
import {
  getMigrationInventories,
  getMigrationInventory,
  getMigrationMetrics,
} from '../services/registryService.js';

const router = Router();

/** GET /api/migration/inventories — All migration inventories */
router.get('/inventories', (_req, res) => {
  try {
    res.json({ data: getMigrationInventories() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/migration/inventories/:appId — Single app inventory */
router.get('/inventories/:appId', (req, res) => {
  try {
    const inventory = getMigrationInventory(req.params.appId);
    if (!inventory) {
      res.status(404).json({ error: `Inventory for ${req.params.appId} not found` });
      return;
    }
    res.json({ data: inventory });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /api/migration/metrics — Migration progress metrics */
router.get('/metrics', (_req, res) => {
  try {
    res.json({ data: getMigrationMetrics() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
