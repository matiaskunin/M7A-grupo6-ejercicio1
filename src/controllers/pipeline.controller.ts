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
import type { ExchangeRateProvider } from '../services/ExchangeRateProvider';

export interface PipelineControllerDeps {
  configStore: PipelineConfigStore;
  exchangeRateProvider: ExchangeRateProvider;
}

export function createPipelineController(deps: PipelineControllerDeps) {
  const { configStore, exchangeRateProvider } = deps;

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

    /**
     * DELETE /pipeline/cache — invalidación manual de la cache de tasas de cambio.
     *
     * CONSIGNA.md lo pide explícitamente en "Caching de Tasas": la cache tiene un TTL de 1 hora,
     * pero tiene que poder vaciarse a mano sin reiniciar el proceso (por ejemplo ante un salto
     * fuerte de cotización, o para forzar una consulta en vivo durante una demo).
     * `ExchangeRateCache` ya exponía `clear()`; esto es lo que lo hace alcanzable desde afuera.
     */
    clearExchangeRateCache(_req: Request, res: Response, next: NextFunction): void {
      try {
        const cache = exchangeRateProvider.getCache();
        const entriesRemoved = cache.size();
        cache.clear();

        res.status(200).json({
          message: 'Cache de tasas de cambio invalidada.',
          entriesRemoved,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export type PipelineController = ReturnType<typeof createPipelineController>;
