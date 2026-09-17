/**
 * Controllers de /reservations. Ver docs/architecture.md §9.
 *
 * Diseño clave (docs/team-plan.md, paquete "Dev 5"): el `Pipeline`, el `PipelineConfigStore` y
 * el `ReservationStore` se reciben por INYECCIÓN, no se importan hard-coded. Eso permite:
 *  - levantar la API contra un pipeline de filtros dobles mientras el paquete de Dev 3 (tipo
 *    de cambio) no esté mergeado, sin bloquear este paquete;
 *  - que los tests de integración inyecten su propio pipeline/store y no compartan estado;
 *  - que el paso de integración final sea cambiar qué lista de filtros se inyecta, nada más.
 */

import type { NextFunction, Request, Response } from 'express';
import type { Pipeline } from '../pipeline/Pipeline';
import type { PipelineConfigStore } from '../pipeline/PipelineConfigStore';
import type { ReservationStore } from '../services/ReservationStore';
import type { ProcessReservationsBody } from '../schemas/reservationRequest.schema';
import { HttpError } from '../middlewares/errorHandler';

export interface ReservationsControllerDeps {
  pipeline: Pipeline;
  configStore: PipelineConfigStore;
  reservationStore: ReservationStore;
}

export function createReservationsController(deps: ReservationsControllerDeps) {
  const { pipeline, configStore, reservationStore } = deps;

  return {
    /**
     * POST /reservations/process
     *
     * El body ya viene validado por validateBody(processReservationsBodySchema), así que acá
     * no se re-valida. El `config` opcional se resuelve con resolveEffectiveConfig: aplica solo
     * a esta corrida y NO toca el singleton global (docs/architecture.md §7).
     */
    async process(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = req.body as ProcessReservationsBody;
        const effectiveConfig = configStore.resolveEffectiveConfig(body.config);

        const result = await pipeline.processBatch(body.reservations, effectiveConfig);

        // Se guarda el batch completo, no solo los completed: una reserva rechazada también
        // tiene un "estado del procesamiento" consultable por GET /:id/status.
        reservationStore.saveAll(result.results);

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },

    /**
     * GET /reservations/:id/status
     * 404 si el id no fue procesado todavía (o si el server se reinició: el store es en memoria).
     */
    status(req: Request, res: Response, next: NextFunction): void {
      try {
        const { id } = req.params;
        const reservation = reservationStore.findById(id);

        if (!reservation) {
          throw new HttpError(
            404,
            'RESERVATION_NOT_FOUND',
            `No hay ninguna reserva procesada con id "${id}". Procesala primero con POST /reservations/process.`,
          );
        }

        res.status(200).json(reservation);
      } catch (err) {
        next(err);
      }
    },
  };
}

export type ReservationsController = ReturnType<typeof createReservationsController>;
