/**
 * Store en memoria de reservas ya procesadas. Ver docs/architecture.md §9 y §10.
 *
 * Lo puebla POST /reservations/process y lo consulta GET /reservations/:id/status.
 *
 * Limitación documentada (misma que PipelineConfigStore): al vivir en el proceso, el store se
 * vacía al reiniciar el servidor y no se comparte entre instancias. Suficiente para el alcance
 * del ejercicio — el enunciado pide "estado del procesamiento de una reserva", no persistencia.
 */

import type { ProcessedReservation } from '../types/reservation.types';

export class ReservationStore {
  private readonly reservations = new Map<string, ProcessedReservation>();

  /** Guarda el batch completo. Un id repetido pisa al anterior: vale el último procesamiento. */
  saveAll(results: readonly ProcessedReservation[]): void {
    for (const result of results) {
      this.reservations.set(result.id, result);
    }
  }

  findById(id: string): ProcessedReservation | undefined {
    return this.reservations.get(id);
  }

  size(): number {
    return this.reservations.size;
  }

  /** Solo para tests: deja el store vacío entre casos. */
  clear(): void {
    this.reservations.clear();
  }
}

/** Instancia por defecto que usa la app; los tests pueden inyectar la suya. */
export const reservationStore = new ReservationStore();
