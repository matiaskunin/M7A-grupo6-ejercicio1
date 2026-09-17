/**
 * Tipos del ciclo de vida de una reserva a través del pipeline. Ver docs/architecture.md §8.
 */

import type { PassengerRecord, LoyaltyTier } from './passenger.types';
import type { FlightRecord } from './flight.types';

export type SeatClass = 'economy' | 'business' | 'first';

/** Lo que llega en el body de POST /reservations/process, por cada reserva del array. */
export interface ReservationRequest {
  /** Opcional: si no se manda, el pipeline genera uno (ver pipeline/context.ts). */
  reservationId?: string;
  passengerId: string;
  flightCode: string;
  seatClass: SeatClass;
  /** Valor informativo mandado por el cliente — nunca se usa para calcular el precio, ver
   * design-decisions.md §4. El tipo real siempre se deriva de `passenger.birthDate`. */
  declaredPassengerType?: 'child' | 'adult' | 'senior';
  /** Opcional: origen esperado por el cliente, para validar ruta contra el vuelo. */
  origin?: string;
  /** Opcional: destino esperado por el cliente, para validar ruta contra el vuelo. */
  destination?: string;
}

export interface ReservationIssue {
  filter: string;
  code: string;
  message: string;
}

export type ReservationStatus = 'pending' | 'rejected' | 'error' | 'completed';

export interface ReservationPricing {
  seatClass: SeatClass;
  /** Salida del filtro 4, USD — nunca se sobreescribe después. */
  basePrice?: number;
  /** Precio "corriendo" a través de los filtros 5 y 6. */
  currentPrice?: number;
  /** = currentPrice tras el filtro 6 (post-descuentos). */
  subtotal?: number;
  tax?: number;
  airportFee?: number;
  fuelSurcharge?: number;
  totalUSD?: number;
  /** Código ISO de la moneda destino, ej. 'ARS'. */
  currency?: string;
  totalConverted?: number;
}

export type ExchangeRateSource = 'live' | 'cache' | 'fallback';

export interface ExchangeRateMetadata {
  rate: number;
  base: string;
  target: string;
  fetchedAt: string;
  source: ExchangeRateSource;
}

export type PassengerTypeApplied = 'child' | 'senior' | 'adult';

export interface ReservationMetadata {
  exchangeRate?: ExchangeRateMetadata;
  loyaltyTier?: LoyaltyTier;
  /** Tipo de pasajero derivado de la edad real — lo fija PassengerValidationFilter (filtro 1)
   * y lo consume PassengerTypeAdjustmentFilter (filtro 6). */
  passengerTypeApplied?: PassengerTypeApplied;
  /** Rastro de auditoría de qué filtros corrieron, en orden. */
  filtersApplied: string[];
}

/** Estado que fluye por el pipeline, filtro a filtro (una instancia por reserva). */
export interface ReservationContext {
  reservationId: string;
  originalRequest: ReservationRequest;
  passenger?: PassengerRecord;
  flight?: FlightRecord;
  status: ReservationStatus;
  errors: ReservationIssue[];
  warnings: ReservationIssue[];
  pricing: ReservationPricing;
  metadata: ReservationMetadata;
  processingStartedAt: number;
}

/** Lo que devuelve la API por cada reserva procesada. */
export interface ProcessedReservation {
  id: string;
  status: Exclude<ReservationStatus, 'pending'>;
  passengerId: string;
  flightCode: string;
  pricing: ReservationPricing;
  errors: ReservationIssue[];
  warnings: ReservationIssue[];
  metadata: ReservationMetadata;
  processingTimeMs: number;
}

export interface PipelineResultSummary {
  total: number;
  completed: number;
  rejected: number;
  errored: number;
}

/** Respuesta de POST /reservations/process. */
export interface PipelineResult {
  results: ProcessedReservation[];
  summary: PipelineResultSummary;
  totalProcessingTimeMs: number;
}
