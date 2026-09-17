/**
 * Filtro 2: Validación de Vuelo.
 * Ver docs/architecture.md §5 y CONSIGNA.md ("Para el Filtro de Validación de Vuelo").
 *
 * Responsabilidades:
 *  - Buscar por código: El vuelo debe existir en el repositorio (mock o inyectado).
 *  - Verificar disponibilidad: `availableSeats > 0`.
 *  - Validar ruta: Si la reserva especifica origen o destino, deben coincidir con los del vuelo.
 *  - Verificar fecha: La fecha de salida debe ser futura (estrictamente mayor al momento de procesamiento).
 *  - Guardar el vuelo en `context.flight`.
 */

import type { Filter } from './Filter';
import type { ReservationContext } from '../types/reservation.types';
import type { FlightRecord } from '../types/flight.types';
import type { PipelineConfig } from '../types/pipeline.types';
import { mockFlights } from '../data/mockFlights';

export class FlightValidationFilter implements Filter {
  public readonly name = 'flightValidation' as const;

  constructor(private readonly flights: FlightRecord[] = mockFlights) {}

  public async execute(
    context: ReservationContext,
    _config: PipelineConfig,
  ): Promise<ReservationContext> {
    const flightCode = context.originalRequest.flightCode;
    const flight = this.flights.find((f) => f.code === flightCode);

    // 1. Buscar por código
    if (!flight) {
      context.status = 'rejected';
      context.errors.push({
        filter: this.name,
        code: 'FLIGHT_NOT_FOUND',
        message: `Vuelo con código "${flightCode}" no encontrado.`,
      });
      return context;
    }

    // Guardar en el contexto
    context.flight = flight;

    // 2. Verificar disponibilidad de asientos
    if (flight.availableSeats <= 0) {
      context.status = 'rejected';
      context.errors.push({
        filter: this.name,
        code: 'FLIGHT_NO_AVAILABILITY',
        message: `El vuelo "${flight.code}" no tiene asientos disponibles (disponibles: ${flight.availableSeats}).`,
      });
      return context;
    }

    // 3. Validar ruta (origen y destino) si fueron provistos en el request
    const { origin, destination } = context.originalRequest;
    if (origin && origin !== flight.origin) {
      context.status = 'rejected';
      context.errors.push({
        filter: this.name,
        code: 'FLIGHT_ROUTE_MISMATCH',
        message: `El origen solicitado "${origin}" no coincide con el origen del vuelo "${flight.origin}".`,
      });
      return context;
    }

    if (destination && destination !== flight.destination) {
      context.status = 'rejected';
      context.errors.push({
        filter: this.name,
        code: 'FLIGHT_ROUTE_MISMATCH',
        message: `El destino solicitado "${destination}" no coincide con el destino del vuelo "${flight.destination}".`,
      });
      return context;
    }

    // 4. Verificar fecha de salida (debe ser estrictamente futura)
    const departureTime = new Date(flight.departureDate).getTime();
    const refTime = context.processingStartedAt || Date.now();

    if (isNaN(departureTime) || departureTime <= refTime) {
      context.status = 'rejected';
      context.errors.push({
        filter: this.name,
        code: 'FLIGHT_DATE_NOT_FUTURE',
        message: `La fecha de salida del vuelo "${flight.departureDate}" debe ser posterior a la fecha actual.`,
      });
      return context;
    }

    return context;
  }
}

