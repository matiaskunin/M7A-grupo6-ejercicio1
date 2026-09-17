/**
 * Construcción y cierre del ReservationContext. Ver docs/architecture.md §8.
 */

import { randomUUID } from 'node:crypto';
import type {
  ProcessedReservation,
  ReservationContext,
  ReservationRequest,
} from '../types/reservation.types';

export function createInitialContext(request: ReservationRequest): ReservationContext {
  return {
    reservationId: request.reservationId ?? randomUUID(),
    originalRequest: request,
    status: 'pending',
    errors: [],
    warnings: [],
    pricing: {
      seatClass: request.seatClass,
    },
    metadata: {
      filtersApplied: [],
    },
    processingStartedAt: Date.now(),
  };
}

/**
 * Convierte un ReservationContext ya resuelto (status !== 'pending') en la forma que expone la
 * API. Pipeline.processOne es quien garantiza que 'pending' se resuelva a 'completed' antes de
 * llamar acá (ver docs/architecture.md §3) — por eso el cast de status es seguro en este punto.
 */
export function finalize(context: ReservationContext): ProcessedReservation {
  return {
    id: context.reservationId,
    status: context.status as ProcessedReservation['status'],
    passengerId: context.originalRequest.passengerId,
    flightCode: context.originalRequest.flightCode,
    pricing: context.pricing,
    errors: context.errors,
    warnings: context.warnings,
    metadata: context.metadata,
    processingTimeMs: Date.now() - context.processingStartedAt,
  };
}
