/**
 * Fixtures compartidas por los tests de integración — docs/architecture.md §10.
 *
 * Dos piezas:
 *  1. Constructores de bodies válidos/ inválidos para POST /reservations/process, apoyados en
 *     los ids reales de `src/data/mockPassengers.ts` y `src/data/mockFlights.ts`.
 *  2. `buildTestApp()`: arma una app con dependencias frescas y un proveedor de tasas FALSO.
 *
 * Por qué el proveedor falso: `ExchangeRateEnrichmentFilter` usa por defecto un provider que
 * pega a la API pública real. Un test de integración que dependa de la red es lento y falla
 * sin conexión, así que acá se inyecta un provider determinista — la misma regla que
 * docs/team-plan.md le impone al paquete de Dev 3 ("ningún test pega a la red real").
 */

import { Pipeline } from '../../src/pipeline/Pipeline';
import { PipelineConfigStore } from '../../src/pipeline/PipelineConfigStore';
import { ReservationStore } from '../../src/services/ReservationStore';
import { createApp, type AppDependencies } from '../../src/app';
import type { Filter } from '../../src/filters/Filter';
import type { ReservationRequest } from '../../src/types/reservation.types';
import type {
  ExchangeRateProvider,
  RateResult,
} from '../../src/services/ExchangeRateProvider';
import { ExchangeRateCache } from '../../src/services/ExchangeRateCache';
import { PassengerValidationFilter } from '../../src/filters/PassengerValidationFilter';
import { FlightValidationFilter } from '../../src/filters/FlightValidationFilter';
import { ExchangeRateEnrichmentFilter } from '../../src/filters/ExchangeRateEnrichmentFilter';
import { basePriceCalculationFilter } from '../../src/filters/BasePriceCalculationFilter';
import { loyaltyDiscountFilter } from '../../src/filters/LoyaltyDiscountFilter';
import { passengerTypeAdjustmentFilter } from '../../src/filters/PassengerTypeAdjustmentFilter';
import { taxAndFeesFilter } from '../../src/filters/TaxAndFeesFilter';
import { CurrencyConversionFilter } from '../../src/filters/CurrencyConversionFilter';

/** Tasa fija y conocida, para poder afirmar sobre `totalConverted` sin ambigüedad. */
export const STUB_RATE = 1000;

export class StubExchangeRateProvider implements ExchangeRateProvider {
  private readonly cache = new ExchangeRateCache();

  constructor(private readonly rate: number = STUB_RATE) {}

  async getRate(base: string, target: string): Promise<RateResult> {
    return {
      rate: base === target ? 1 : this.rate,
      source: 'fallback',
    };
  }

  getCache(): ExchangeRateCache {
    return this.cache;
  }
}

/** Los 8 filtros reales, pero con el provider de tasas mockeado. */
export function buildTestFilters(): Filter[] {
  return [
    new PassengerValidationFilter(),
    new FlightValidationFilter(),
    new ExchangeRateEnrichmentFilter(new StubExchangeRateProvider()),
    basePriceCalculationFilter,
    loyaltyDiscountFilter,
    passengerTypeAdjustmentFilter,
    taxAndFeesFilter,
    new CurrencyConversionFilter(),
  ];
}

export interface TestAppHandles {
  app: ReturnType<typeof createApp>;
  configStore: PipelineConfigStore;
  reservationStore: ReservationStore;
}

/**
 * App lista para supertest, con stores nuevos en cada llamada: ningún test hereda la config
 * modificada ni las reservas guardadas por otro.
 */
export function buildTestApp(overrides: AppDependencies = {}): TestAppHandles {
  const configStore = overrides.configStore ?? new PipelineConfigStore();
  const reservationStore = overrides.reservationStore ?? new ReservationStore();
  const pipeline = overrides.pipeline ?? new Pipeline(buildTestFilters());

  return {
    app: createApp({ pipeline, configStore, reservationStore }),
    configStore,
    reservationStore,
  };
}

// ── Bodies de reserva ───────────────────────────────────────────────────────────────────────

/** Adulto sin tier, vuelo a US (moneda destino = USD), $100 de base. */
export function validReservation(overrides: Partial<ReservationRequest> = {}): ReservationRequest {
  return {
    reservationId: 'RES-OK-1',
    passengerId: 'PASS-ADULT-NONE',
    flightCode: 'FL-US-001',
    seatClass: 'economy',
    ...overrides,
  };
}

/** Vuelo a Brasil: sirve para ver la conversión de moneda aplicada. */
export function reservationToBrazil(
  overrides: Partial<ReservationRequest> = {},
): ReservationRequest {
  return validReservation({
    reservationId: 'RES-BR-1',
    flightCode: 'FL-BR-003',
    ...overrides,
  });
}

/** Pasajero que no existe en los datos mock → rechazada por el filtro 1. */
export function reservationUnknownPassenger(): ReservationRequest {
  return validReservation({
    reservationId: 'RES-NO-PASS',
    passengerId: 'PASS-NO-EXISTE',
  });
}

/** Vuelo sin asientos → rechazada por el filtro 2. */
export function reservationNoSeats(): ReservationRequest {
  return validReservation({
    reservationId: 'RES-NO-SEATS',
    flightCode: 'FL-NO-SEATS',
  });
}

/** Body sin `passengerId`: el schema zod lo rechaza con 400 antes del pipeline. */
export const malformedReservationMissingField = {
  reservationId: 'RES-MALFORMED',
  flightCode: 'FL-US-001',
  seatClass: 'economy',
};

/** `seatClass` fuera del enum: también 400. */
export const malformedReservationBadSeatClass = {
  passengerId: 'PASS-ADULT-NONE',
  flightCode: 'FL-US-001',
  seatClass: 'premium',
};
