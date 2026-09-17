/**
 * Rutas de /pipeline. Ver docs/architecture.md §7 y §9.
 */

import { Router } from 'express';
import {
  createPipelineController,
  type PipelineControllerDeps,
} from '../controllers/pipeline.controller';

export function createPipelineRouter(deps: PipelineControllerDeps): Router {
  const router = Router();
  const controller = createPipelineController(deps);

  router.get('/config', controller.getConfig);
  router.put('/config', controller.updateConfig);

  return router;
}
