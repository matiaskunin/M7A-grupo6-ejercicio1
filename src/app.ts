/**
 * Construcción de la app Express, sin levantar el server (para poder testear con supertest
 * sin bindear un puerto real) — docs/architecture.md §10.
 *
 * Las dependencias de negocio (pipeline, config store, reservation store) entran por parámetro
 * con un default razonable. Eso permite que cada test de integración arme su propia app con su
 * propio store y su propio pipeline —incluso uno de filtros dobles— sin compartir estado
 * mutable entre casos, y que el paso de integración final solo tenga que cambiar qué lista de
 * filtros se inyecta (ver src/pipeline/buildPipeline.ts).
 */

import express, { type Express } from 'express';
import { buildDefaultPipeline } from './pipeline/buildPipeline';
import { pipelineConfigStore, type PipelineConfigStore } from './pipeline/PipelineConfigStore';
import { reservationStore, type ReservationStore } from './services/ReservationStore';
import type { Pipeline } from './pipeline/Pipeline';
import { createReservationsRouter } from './routes/reservations.routes';
import { createPipelineRouter } from './routes/pipeline.routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

export interface AppDependencies {
  pipeline?: Pipeline;
  configStore?: PipelineConfigStore;
  reservationStore?: ReservationStore;
}

export function createApp(deps: AppDependencies = {}): Express {
  const pipeline = deps.pipeline ?? buildDefaultPipeline();
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
  app.use('/pipeline', createPipelineRouter({ configStore }));

  // 404 de ruta inexistente y catch-all de errores: siempre al final, después de las rutas.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
