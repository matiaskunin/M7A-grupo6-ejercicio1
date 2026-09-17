/**
 * Rutas de /reservations. Ver docs/architecture.md §9.
 *
 * La ruta solo declara método + path + middlewares; la lógica vive en el controller y las
 * dependencias entran por inyección desde app.ts.
 */

import { Router } from 'express';
import { validateBody } from '../middlewares/validateBody';
import { processReservationsBodySchema } from '../schemas/reservationRequest.schema';
import {
  createReservationsController,
  type ReservationsControllerDeps,
} from '../controllers/reservations.controller';

export function createReservationsRouter(deps: ReservationsControllerDeps): Router {
  const router = Router();
  const controller = createReservationsController(deps);

  router.post('/process', validateBody(processReservationsBodySchema), controller.process);
  router.get('/:id/status', controller.status);

  return router;
}
