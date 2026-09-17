/**
 * Tests del filtro 5 (LoyaltyDiscountFilter). Ver docs/testing-plan.md, sección "Flujo de
 * Cálculo de Precios", y docs/team-plan.md, paquete "Dev 4".
 */

import { loyaltyDiscountFilter } from '../../../src/filters/LoyaltyDiscountFilter';
import type { ReservationContext } from '../../../src/types/reservation.types';
import type { PipelineConfig } from '../../../src/types/pipeline.types';
import type { LoyaltyTier, PassengerRecord } from '../../../src/types/passenger.types';
import { defaultPipelineConfig } from '../../../src/config/defaultPipelineConfig';

function cloneConfig(): PipelineConfig {
  return JSON.parse(JSON.stringify(defaultPipelineConfig)) as PipelineConfig;
}

function buildPassenger(loyaltyTier: LoyaltyTier): PassengerRecord {
  return {
    id: 'p1',
    name: 'Test Passenger',
    isActive: true,
    birthDate: '1990-01-01',
    contactInfo: { email: 'p1@example.com', phone: '+54 11 5555-5555' },
    loyaltyTier,
  };
}

function buildContext(currentPrice: number | undefined, passenger?: PassengerRecord): ReservationContext {
  return {
    reservationId: 'r1',
    originalRequest: { passengerId: 'p1', flightCode: 'F1', seatClass: 'business' },
    passenger,
    status: 'pending',
    errors: [],
    warnings: [],
    pricing: { seatClass: 'business', currentPrice },
    metadata: { filtersApplied: [] },
    processingStartedAt: Date.now(),
  };
}

describe('LoyaltyDiscountFilter', () => {
  it('bronze: 5% de descuento', async () => {
    const context = buildContext(250, buildPassenger('bronze'));
    const result = await loyaltyDiscountFilter.execute(context, cloneConfig());

    expect(result.pricing.currentPrice).toBeCloseTo(237.5);
    expect(result.metadata.loyaltyTier).toBe('bronze');
  });

  it('silver: 10% de descuento', async () => {
    const context = buildContext(250, buildPassenger('silver'));
    const result = await loyaltyDiscountFilter.execute(context, cloneConfig());

    expect(result.pricing.currentPrice).toBeCloseTo(225);
  });

  it('gold: 15% de descuento', async () => {
    const context = buildContext(250, buildPassenger('gold'));
    const result = await loyaltyDiscountFilter.execute(context, cloneConfig());

    expect(result.pricing.currentPrice).toBeCloseTo(212.5);
  });

  it('none: sin tier de lealtad, no aplica descuento', async () => {
    const context = buildContext(250, buildPassenger('none'));
    const result = await loyaltyDiscountFilter.execute(context, cloneConfig());

    expect(result.pricing.currentPrice).toBe(250);
    expect(result.metadata.loyaltyTier).toBe('none');
  });

  it('usa las tasas de la config, no valores hardcodeados', async () => {
    const config = cloneConfig();
    config.filters.loyaltyDiscount.params.rates.gold = 0.5;
    const context = buildContext(200, buildPassenger('gold'));

    const result = await loyaltyDiscountFilter.execute(context, config);

    expect(result.pricing.currentPrice).toBe(100);
  });

  it('contexto sin pasajero: no rompe, agrega warning y no toca el precio', async () => {
    const context = buildContext(250, undefined);
    const result = await loyaltyDiscountFilter.execute(context, cloneConfig());

    expect(result.pricing.currentPrice).toBe(250);
    expect(result.status).toBe('pending');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      filter: 'loyaltyDiscount',
      code: 'MISSING_PRICING_DATA',
    });
  });

  it('contexto sin currentPrice: no rompe, agrega warning', async () => {
    const context = buildContext(undefined, buildPassenger('gold'));
    const result = await loyaltyDiscountFilter.execute(context, cloneConfig());

    expect(result.pricing.currentPrice).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
  });
});
