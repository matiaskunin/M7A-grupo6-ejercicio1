/**
 * Tests unitarios para ExchangeRateEnrichmentFilter (Filtro 3a).
 * Ver docs/testing-plan.md "Integración con API de Tipo de Cambio".
 */

import { ExchangeRateEnrichmentFilter } from '../../../src/filters/ExchangeRateEnrichmentFilter';
import type { ExchangeRateProvider, RateResult } from '../../../src/services/ExchangeRateProvider';
import type { ReservationContext } from '../../../src/types/reservation.types';
import { defaultPipelineConfig } from '../../../src/config/defaultPipelineConfig';

function createMockContext(overrides: Partial<ReservationContext> = {}): ReservationContext {
  return {
    reservationId: 'test-res-1',
    originalRequest: {
      passengerId: 'p-1',
      flightCode: 'FL-123',
      seatClass: 'economy',
    },
    flight: {
      code: 'FL-123',
      origin: 'EZE',
      destination: 'GIG',
      destinationCountry: 'BR',
      departureDate: '2026-12-01T10:00:00Z',
      availableSeats: 50,
      basePriceUSD: 200,
    },
    status: 'pending',
    errors: [],
    warnings: [],
    pricing: {
      seatClass: 'economy',
    },
    metadata: {
      filtersApplied: [],
    },
    processingStartedAt: Date.now(),
    ...overrides,
  };
}

describe('ExchangeRateEnrichmentFilter', () => {
  it('mapea país destino a moneda correcta y enriquece metadata con tasa live', async () => {
    const mockProvider: ExchangeRateProvider = {
      getRate: jest.fn().mockResolvedValue({ rate: 5.35, source: 'live' } as RateResult),
      getCache: jest.fn(),
    };

    const filter = new ExchangeRateEnrichmentFilter(mockProvider);
    const context = createMockContext();

    const result = await filter.execute(context, defaultPipelineConfig);

    expect(mockProvider.getRate).toHaveBeenCalledWith(
      'USD',
      'BRL',
      expect.objectContaining({
        fallbackRates: defaultPipelineConfig.exchangeRateFallback,
      }),
    );
    expect(result.status).toBe('pending');
    expect(result.metadata.exchangeRate).toEqual({
      rate: 5.35,
      base: 'USD',
      target: 'BRL',
      fetchedAt: expect.any(String),
      source: 'live',
    });
    expect(result.warnings).toHaveLength(0);
  });

  it('mapea correctamente diferentes países a sus monedas (AR->ARS, EU->EUR, US->USD)', async () => {
    const mockProvider: ExchangeRateProvider = {
      getRate: jest.fn().mockResolvedValue({ rate: 1, source: 'cache' } as RateResult),
      getCache: jest.fn(),
    };

    const filter = new ExchangeRateEnrichmentFilter(mockProvider);

    // Caso Argentina
    const ctxAr = createMockContext({
      flight: {
        code: 'FL-AR',
        origin: 'MIA',
        destination: 'EZE',
        destinationCountry: 'AR',
        departureDate: '2026-12-01T10:00:00Z',
        availableSeats: 10,
        basePriceUSD: 500,
      },
    });
    await filter.execute(ctxAr, defaultPipelineConfig);
    expect(mockProvider.getRate).toHaveBeenCalledWith('USD', 'ARS', expect.anything());

    // Caso Europa
    const ctxEu = createMockContext({
      flight: {
        code: 'FL-EU',
        origin: 'EZE',
        destination: 'MAD',
        destinationCountry: 'EU',
        departureDate: '2026-12-01T10:00:00Z',
        availableSeats: 10,
        basePriceUSD: 800,
      },
    });
    await filter.execute(ctxEu, defaultPipelineConfig);
    expect(mockProvider.getRate).toHaveBeenCalledWith('USD', 'EUR', expect.anything());
  });

  it('registra un warning cuando se usa la tasa de fallback y no rechaza la reserva', async () => {
    const mockProvider: ExchangeRateProvider = {
      getRate: jest.fn().mockResolvedValue({ rate: 1000, source: 'fallback' } as RateResult),
      getCache: jest.fn(),
    };

    const filter = new ExchangeRateEnrichmentFilter(mockProvider);
    const context = createMockContext({
      flight: {
        code: 'FL-AR',
        origin: 'MIA',
        destination: 'EZE',
        destinationCountry: 'AR',
        departureDate: '2026-12-01T10:00:00Z',
        availableSeats: 10,
        basePriceUSD: 500,
      },
    });

    const result = await filter.execute(context, defaultPipelineConfig);

    expect(result.status).toBe('pending');
    expect(result.metadata.exchangeRate?.source).toBe('fallback');
    expect(result.metadata.exchangeRate?.rate).toBe(1000);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filter: 'exchangeRateEnrichment',
          code: 'EXCHANGE_RATE_FALLBACK_APPLIED',
        }),
      ]),
    );
  });

  it('manejo defensivo: agrega warning y usa USD si context.flight no tiene destinationCountry', async () => {
    const mockProvider: ExchangeRateProvider = {
      getRate: jest.fn().mockResolvedValue({ rate: 1, source: 'cache' } as RateResult),
      getCache: jest.fn(),
    };

    const filter = new ExchangeRateEnrichmentFilter(mockProvider);
    const context = createMockContext({ flight: undefined });

    const result = await filter.execute(context, defaultPipelineConfig);

    expect(mockProvider.getRate).toHaveBeenCalledWith('USD', 'USD', expect.anything());
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filter: 'exchangeRateEnrichment',
          code: 'MISSING_DESTINATION_COUNTRY',
        }),
      ]),
    );
  });

  it('no procesa si el status de la reserva ya no es pending', async () => {
    const mockProvider: ExchangeRateProvider = {
      getRate: jest.fn(),
      getCache: jest.fn(),
    };

    const filter = new ExchangeRateEnrichmentFilter(mockProvider);
    const context = createMockContext({ status: 'rejected' });

    const result = await filter.execute(context, defaultPipelineConfig);

    expect(result.status).toBe('rejected');
    expect(mockProvider.getRate).not.toHaveBeenCalled();
  });
});
