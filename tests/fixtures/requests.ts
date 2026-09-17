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
import { createOrderedFilters } from '../../src/filters';

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

/** La cadena canónica de 8 filtros (src/filters/index.ts), con el provider mockeado. */
export function buildTestFilters(provider: ExchangeRateProvider): Filter[] {
  return createOrderedFilters(provider);
}

export interface TestAppHandles {
  app: ReturnType<typeof createApp>;
  configStore: PipelineConfigStore;
  reservationStore: ReservationStore;
  exchangeRateProvider: ExchangeRateProvider;
}

/**
 * App lista para supertest, con dependencias nuevas en cada llamada: ningún test hereda la
 * config modificada, las reservas guardadas ni la cache de tasas de otro.
 *
 * El provider se comparte entre el pipeline y el controller de /pipeline, igual que en
 * producción — es lo que hace verificable que `DELETE /pipeline/cache` vacíe la cache que el
 * filtro 3a realmente usa.
 */
export function buildTestApp(overrides: AppDependencies = {}): TestAppHandles {
  const configStore = overrides.configStore ?? new PipelineConfigStore();
  const reservationStore = overrides.reservationStore ?? new ReservationStore();
  const exchangeRateProvider = overrides.exchangeRateProvider ?? new StubExchangeRateProvider();
  const pipeline = overrides.pipeline ?? new Pipeline(buildTestFilters(exchangeRateProvider));

  return {
    app: createApp({ pipeline, configStore, reservationStore, exchangeRateProvider }),
    configStore,
    reservationStore,
    exchangeRateProvider,
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
