/**
 * Construcción de la app Express, sin levantar el server (para poder testear con supertest
 * sin bindear un puerto real) — docs/architecture.md §10.
 *
 * Las dependencias de negocio (pipeline, config store, reservation store, proveedor de tasas)
 * entran por parámetro con un default razonable. Eso permite que cada test de integración arme
 * su propia app con sus propios stores —sin compartir estado mutable entre casos— y que la
 * cadena de filtros se defina en un solo lugar (`src/filters/index.ts`).
 *
 * El proveedor de tasas se crea acá y se pasa tanto al pipeline como al controller de
 * /pipeline: los dos tienen que ver LA MISMA cache, o `DELETE /pipeline/cache` vaciaría una
 * cache distinta de la que usa el filtro 3a.
 */

import express, { type Express } from 'express';
import { buildDefaultPipeline } from './pipeline/buildPipeline';
import { pipelineConfigStore, type PipelineConfigStore } from './pipeline/PipelineConfigStore';
import { reservationStore, type ReservationStore } from './services/ReservationStore';
import {
  defaultExchangeRateProvider,
  type ExchangeRateProvider,
} from './services/ExchangeRateProvider';
import type { Pipeline } from './pipeline/Pipeline';
import { createReservationsRouter } from './routes/reservations.routes';
import { createPipelineRouter } from './routes/pipeline.routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

export interface AppDependencies {
  pipeline?: Pipeline;
  configStore?: PipelineConfigStore;
  reservationStore?: ReservationStore;
  exchangeRateProvider?: ExchangeRateProvider;
}

export function createApp(deps: AppDependencies = {}): Express {
  const exchangeRateProvider = deps.exchangeRateProvider ?? defaultExchangeRateProvider;
  const pipeline = deps.pipeline ?? buildDefaultPipeline(exchangeRateProvider);
  const configStore = deps.configStore ?? pipelineConfigStore;
  const store = deps.reservationStore ?? reservationStore;

  const app = express();

  app.use(express.json());

  // Health check simple — no es uno de los 4 endpoints requeridos por CONSIGNA.md, pero sirve
  // para probar que la app arranca antes de que existan las rutas de negocio.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/reservations', createReservationsRouter({ pipeline, configStore, reservationStore: store }));
  app.use('/pipeline', createPipelineRouter({ configStore, exchangeRateProvider }));

  // 404 de ruta inexistente y catch-all de errores: siempre al final, después de las rutas.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
