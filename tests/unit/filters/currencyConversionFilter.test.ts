/**
 * Tests unitarios para CurrencyConversionFilter (Filtro 3b).
 * Ver docs/architecture.md §4 y docs/testing-plan.md.
 */

import { CurrencyConversionFilter } from '../../../src/filters/CurrencyConversionFilter';
import type { ReservationContext } from '../../../src/types/reservation.types';
import { defaultPipelineConfig } from '../../../src/config/defaultPipelineConfig';

function createMockContext(overrides: Partial<ReservationContext> = {}): ReservationContext {
  return {
    reservationId: 'test-res-conv',
    originalRequest: {
      passengerId: 'p-1',
      flightCode: 'FL-123',
      seatClass: 'economy',
    },
    status: 'pending',
    errors: [],
    warnings: [],
    pricing: {
      seatClass: 'economy',
      totalUSD: 200,
    },
    metadata: {
      exchangeRate: {
        rate: 5.35,
        base: 'USD',
        target: 'BRL',
        fetchedAt: new Date().toISOString(),
        source: 'live',
      },
      filtersApplied: [],
    },
    processingStartedAt: Date.now(),
    ...overrides,
  };
}

describe('CurrencyConversionFilter', () => {
  const filter = new CurrencyConversionFilter();

  it('convierte el total en USD a la divisa de destino y fija totalConverted y currency', async () => {
    const context = createMockContext({
      pricing: {
        seatClass: 'economy',
        totalUSD: 250,
      },
      metadata: {
        exchangeRate: {
          rate: 1000,
          base: 'USD',
          target: 'ARS',
          fetchedAt: new Date().toISOString(),
          source: 'fallback',
        },
        filtersApplied: [],
      },
    });

    const result = await filter.execute(context, defaultPipelineConfig);

    expect(result.pricing.currency).toBe('ARS');
    expect(result.pricing.totalConverted).toBe(250000);
    expect(result.status).toBe('pending');
    expect(result.warnings).toHaveLength(0);
  });

  it('aplica redondeo adecuado a 2 decimales para divisas', async () => {
    const context = createMockContext({
      pricing: {
        seatClass: 'economy',
        totalUSD: 100.33,
      },
      metadata: {
        exchangeRate: {
          rate: 0.91234,
          base: 'USD',
          target: 'EUR',
          fetchedAt: new Date().toISOString(),
          source: 'live',
        },
        filtersApplied: [],
      },
    });

    const result = await filter.execute(context, defaultPipelineConfig);

    expect(result.pricing.currency).toBe('EUR');
    // 100.33 * 0.91234 = 91.5350722 -> redondeado 91.54
    expect(result.pricing.totalConverted).toBe(91.54);
  });

  it('defensivo: agrega warning si totalUSD no está definido en el contexto', async () => {
    const context = createMockContext({
      pricing: {
        seatClass: 'economy',
        totalUSD: undefined,
      },
    });

    const result = await filter.execute(context, defaultPipelineConfig);

    expect(result.pricing.currency).toBeUndefined();
    expect(result.pricing.totalConverted).toBeUndefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filter: 'currencyConversion',
          code: 'MISSING_TOTAL_USD',
        }),
      ]),
    );
  });

  it('defensivo: agrega warning y preserva totalUSD si exchangeRate no está en metadata', async () => {
    const context = createMockContext({
      pricing: {
        seatClass: 'economy',
        totalUSD: 300,
      },
      metadata: {
        filtersApplied: [],
        exchangeRate: undefined,
      },
    });

    const result = await filter.execute(context, defaultPipelineConfig);

    expect(result.pricing.currency).toBe('USD');
    expect(result.pricing.totalConverted).toBe(300);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filter: 'currencyConversion',
          code: 'MISSING_EXCHANGE_RATE',
        }),
      ]),
    );
  });

  it('no procesa si el status de la reserva ya no es pending', async () => {
    const context = createMockContext({
      status: 'rejected',
      pricing: {
        seatClass: 'economy',
        totalUSD: 100,
      },
    });

    const result = await filter.execute(context, defaultPipelineConfig);

    expect(result.pricing.currency).toBeUndefined();
    expect(result.pricing.totalConverted).toBeUndefined();
    expect(result.status).toBe('rejected');
  });
});
