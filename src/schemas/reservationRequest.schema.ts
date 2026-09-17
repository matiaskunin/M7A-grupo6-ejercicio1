/**
 * Validación zod del body de POST /reservations/process. Cubre el caso "datos malformados"
 * del enunciado (400 antes de entrar al pipeline) — ver docs/architecture.md §9.
 */

import { z } from 'zod';
import { pipelineConfigPartialSchema } from './pipelineConfig.schema';

export const seatClassSchema = z.enum(['economy', 'business', 'first']);

export const reservationRequestSchema = z.object({
  reservationId: z.string().min(1).optional(),
  passengerId: z.string().min(1),
  flightCode: z.string().min(1),
  seatClass: seatClassSchema,
  declaredPassengerType: z.enum(['child', 'adult', 'senior']).optional(),
  origin: z.string().min(1).optional(),
  destination: z.string().min(1).optional(),
});

export const processReservationsBodySchema = z.object({
  reservations: z.array(reservationRequestSchema),
  /** Aplica solo a esta corrida puntual, sin tocar el singleton global — architecture.md §7. */
  config: pipelineConfigPartialSchema.optional(),
});

export type ReservationRequestInput = z.infer<typeof reservationRequestSchema>;
export type ProcessReservationsBody = z.infer<typeof processReservationsBodySchema>;
