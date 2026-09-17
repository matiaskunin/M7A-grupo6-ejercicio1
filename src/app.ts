/**
 * Construcción de la app Express, sin levantar el server (para poder testear con supertest
 * sin bindear un puerto real) — docs/architecture.md §10.
 *
 * Este archivo es uno de los dos puntos de integración final que nadie más toca hasta que los
 * 5 paquetes estén listos (ver docs/team-plan.md "Cómo evitar conflictos de merge"). Por eso
 * acá todavía NO se montan las rutas de negocio (son de Dev 5, `src/routes/*`) ni el
 * errorHandler genérico (`src/middlewares/errorHandler.ts`, también de Dev 5) — están
 * marcados con TODO en el lugar exacto donde van a engancharse.
 */

import express, { type Express } from 'express';

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  // Health check simple — no es uno de los 4 endpoints requeridos por CONSIGNA.md, pero sirve
  // para probar que la app arranca antes de que existan las rutas de negocio.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // TODO(Dev 5, paso de integración final): montar acá las rutas reales, en este orden —
  //   app.use('/reservations', reservationsRouter);
  //   app.use('/pipeline', pipelineRouter);
  // y, después de las rutas, el catch-all de errores no controlados:
  //   app.use(errorHandler);

  return app;
}
