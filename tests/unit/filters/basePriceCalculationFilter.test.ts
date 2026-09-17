/**
 * Tests del filtro 4 (BasePriceCalculationFilter). Ver docs/testing-plan.md, sección "Flujo de
 * Cálculo de Precios", y docs/team-plan.md, paquete "Dev 4".
 *
 * Se llama a execute() directamente con un ReservationContext armado a mano, sin pasar por el
 * Pipeline ni por ningún otro filtro — así lo pide el contrato de Filter (architecture.md §2).
 */

import { basePriceCalculationFilter } from '../../../src/filters/BasePriceCalculationFilter';
import type { ReservationContext, SeatClass } from '../../../src/types/reservation.types';
import type { PipelineConfig } from '../../../src/types/pipeline.types';
import type { FlightRecord } from '../../../src/types/flight.types';
import { defaultPipelineConfig } from '../../../src/config/defaultPipelineConfig';

function cloneConfig(): PipelineConfig {
  return JSON.parse(JSON.stringify(defaultPipelineConfig)) as PipelineConfig;
}

function buildFlight(overrides: Partial<FlightRecord> = {}): FlightRecord {
  return {
    code: 'F1',
    origin: 'EZE',
    destination: 'MIA',
    destinationCountry: 'US',
    departureDate: '2999-01-01T00:00:00.000Z',
    availableSeats: 10,
    basePriceUSD: 100,
    ...overrides,
  };
}

function buildContext(seatClass: SeatClass, flight?: FlightRecord): ReservationContext {
  return {
    reservationId: 'r1',
    originalRequest: { passengerId: 'p1', flightCode: 'F1', seatClass },
    flight,
    status: 'pending',
    errors: [],
    warnings: [],
    pricing: { seatClass },
    metadata: { filtersApplied: [] },
    processingStartedAt: Date.now(),
  };
}

describe('BasePriceCalculationFilter', () => {
  it('economy: precio base = basePriceUSD × 1', async () => {
    const context = buildContext('economy', buildFlight({ basePriceUSD: 100 }));
    const result = await basePriceCalculationFilter.execute(context, cloneConfig());

    expect(result.pricing.basePrice).toBe(100);
    expect(result.pricing.currentPrice).toBe(100);
    expect(result.warnings).toHaveLength(0);
  });

  it('business: precio base = basePriceUSD × 2.5', async () => {
    const context = buildContext('business', buildFlight({ basePriceUSD: 100 }));
    const result = await basePriceCalculationFilter.execute(context, cloneConfig());

    expect(result.pricing.basePrice).toBe(250);
    expect(result.pricing.currentPrice).toBe(250);
  });

  it('first: precio base = basePriceUSD × 4', async () => {
    const context = buildContext('first', buildFlight({ basePriceUSD: 100 }));
    const result = await basePriceCalculationFilter.execute(context, cloneConfig());

    expect(result.pricing.basePrice).toBe(400);
    expect(result.pricing.currentPrice).toBe(400);
  });

  it('usa los multiplicadores de la config, no valores hardcodeados', async () => {
    const config = cloneConfig();
    config.filters.basePriceCalculation.params.multipliers.business = 3;
    const context = buildContext('business', buildFlight({ basePriceUSD: 100 }));

    const result = await basePriceCalculationFilter.execute(context, config);

    expect(result.pricing.basePrice).toBe(300);
  });

  it('contexto sin datos de vuelo: no rompe, agrega warning y no calcula basePrice', async () => {
    const context = buildContext('economy', undefined);
    const result = await basePriceCalculationFilter.execute(context, cloneConfig());

    expect(result.pricing.basePrice).toBeUndefined();
    expect(result.status).toBe('pending');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      filter: 'basePriceCalculation',
      code: 'MISSING_FLIGHT_DATA',
    });
  });
});
