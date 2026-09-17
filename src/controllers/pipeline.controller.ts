/**
 * Controllers de /pipeline. Ver docs/architecture.md §7 y §9.
 *
 * El PUT no valida con el middleware genérico sino que delega en
 * PipelineConfigStore.updateConfig(), que parsea con zod internamente (rangos: porcentajes en
 * [0,1], montos >= 0). Si el patch está fuera de rango, updateConfig lanza un ZodError que el
 * errorHandler traduce a 400 — así la regla de validación vive en un solo lugar y no se
 * duplica acá.
 */

import type { NextFunction, Request, Response } from 'express';
import type { PipelineConfigStore } from '../pipeline/PipelineConfigStore';

export interface PipelineControllerDeps {
  configStore: PipelineConfigStore;
}

export function createPipelineController(deps: PipelineControllerDeps) {
  const { configStore } = deps;

  return {
    /** GET /pipeline/config — devuelve el PipelineConfig completo vigente. */
    getConfig(_req: Request, res: Response, next: NextFunction): void {
      try {
        res.status(200).json(configStore.getConfig());
      } catch (err) {
        next(err);
      }
    },

    /** PUT /pipeline/config — merge parcial sobre el singleton en memoria. */
    updateConfig(req: Request, res: Response, next: NextFunction): void {
      try {
        res.status(200).json(configStore.updateConfig(req.body));
      } catch (err) {
        next(err);
      }
    },
  };
}

export type PipelineController = ReturnType<typeof createPipelineController>;
