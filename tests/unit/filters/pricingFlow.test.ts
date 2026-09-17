/**
 * Cubre los 4 escenarios combinados de docs/testing-plan.md, sección "Flujo de Cálculo de
 * Precios": economy sin descuentos, Gold en business, niño en business con descuentos
 * combinados, senior en first con múltiples ajustes.
 *
 * Encadena los 4 filtros reales de precio (Dev 4) uno detrás del otro, a mano — sin usar
 * Pipeline (eso es de Dev 1, y sus tests usan dobles, no filtros reales, ver
 * tests/unit/pipeline/pipeline.test.ts) y sin depender de PassengerValidationFilter (Dev 2)
 * para derivar el tipo de pasajero: acá se setea directo en el contexto, como indica el
 * contrato de Filter (architecture.md §2).
 */

import { basePriceCalculationFilter } from '../../../src/filters/BasePriceCalculationFilter';
import { loyaltyDiscountFilter } from '../../../src/filters/LoyaltyDiscountFilter';
import { passengerTypeAdjustmentFilter } from '../../../src/filters/PassengerTypeAdjustmentFilter';
import { taxAndFeesFilter } from '../../../src/filters/TaxAndFeesFilter';
import type { PassengerTypeApplied, ReservationContext, SeatClass } from '../../../src/types/reservation.types';
import type { PipelineConfig } from '../../../src/types/pipeline.types';
import type { LoyaltyTier, PassengerRecord } from '../../../src/types/passenger.types';
import type { FlightRecord } from '../../../src/types/flight.types';
import { defaultPipelineConfig } from '../../../src/config/defaultPipelineConfig';

function cloneConfig(): PipelineConfig {
  return JSON.parse(JSON.stringify(defaultPipelineConfig)) as PipelineConfig;
}

function buildFlight(basePriceUSD: number): FlightRecord {
  return {
    code: 'F1',
    origin: 'EZE',
    destination: 'MIA',
    destinationCountry: 'US',
    departureDate: '2999-01-01T00:00:00.000Z',
    availableSeats: 10,
    basePriceUSD,
  };
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

function buildContext(
  seatClass: SeatClass,
  flight: FlightRecord,
  passenger: PassengerRecord,
  passengerTypeApplied: PassengerTypeApplied,
): ReservationContext {
  return {
    reservationId: 'r1',
    originalRequest: { passengerId: 'p1', flightCode: 'F1', seatClass },
    passenger,
    flight,
    status: 'pending',
    errors: [],
    warnings: [],
    pricing: { seatClass },
    metadata: { filtersApplied: [], passengerTypeApplied },
    processingStartedAt: Date.now(),
  };
}

/** Corre los 4 filtros de precio en orden (4 → 5 → 6 → 7), threadeando el contexto. */
async function runPricingChain(context: ReservationContext, config: PipelineConfig) {
  let ctx = context;
  ctx = await basePriceCalculationFilter.execute(ctx, config);
  ctx = await loyaltyDiscountFilter.execute(ctx, config);
  ctx = await passengerTypeAdjustmentFilter.execute(ctx, config);
  ctx = await taxAndFeesFilter.execute(ctx, config);
  return ctx;
}

describe('Flujo de cálculo de precios (filtros 4-7 encadenados)', () => {
  it('economy sin descuentos (tier none, adult)', async () => {
    const context = buildContext('economy', buildFlight(100), buildPassenger('none'), 'adult');
    const result = await runPricingChain(context, cloneConfig());

    expect(result.pricing.basePrice).toBe(100);
    expect(result.pricing.subtotal).toBe(100);
    expect(result.pricing.tax).toBeCloseTo(12);
    expect(result.pricing.airportFee).toBe(25);
    expect(result.pricing.fuelSurcharge).toBeCloseTo(8);
    expect(result.pricing.totalUSD).toBeCloseTo(145);
    expect(result.warnings).toHaveLength(0);
  });

  it('pasajero Gold en business con descuento de lealtad (adult, sin ajuste extra)', async () => {
    const context = buildContext('business', buildFlight(100), buildPassenger('gold'), 'adult');
    const result = await runPricingChain(context, cloneConfig());

    expect(result.pricing.basePrice).toBe(250);
    expect(result.pricing.subtotal).toBeCloseTo(212.5);
    expect(result.pricing.tax).toBeCloseTo(25.5);
    expect(result.pricing.fuelSurcharge).toBeCloseTo(20);
    expect(result.pricing.totalUSD).toBeCloseTo(283);
  });

  it('niño en business con descuentos combinados (Gold + Child, secuenciales)', async () => {
    const context = buildContext('business', buildFlight(100), buildPassenger('gold'), 'child');
    const result = await runPricingChain(context, cloneConfig());

    // Ejemplo exacto de design-decisions.md §1: 250 → 212.50 (Gold 15%) → 159.375 (Child 25%).
    expect(result.pricing.basePrice).toBe(250);
    expect(result.pricing.currentPrice).toBeCloseTo(159.375);
    expect(result.pricing.subtotal).toBeCloseTo(159.375);
    expect(result.pricing.tax).toBeCloseTo(19.125);
    expect(result.pricing.fuelSurcharge).toBeCloseTo(20); // 8% del basePrice (250), no del subtotal
    expect(result.pricing.totalUSD).toBeCloseTo(223.5);
  });

  it('senior en first class con múltiples ajustes (Silver + Senior)', async () => {
    const context = buildContext('first', buildFlight(100), buildPassenger('silver'), 'senior');
    const result = await runPricingChain(context, cloneConfig());

    // 400 (First x4) → 360 (Silver 10%) → 306 (Senior 15%).
    expect(result.pricing.basePrice).toBe(400);
    expect(result.pricing.subtotal).toBeCloseTo(306);
    expect(result.pricing.tax).toBeCloseTo(36.72);
    expect(result.pricing.fuelSurcharge).toBeCloseTo(32); // 8% de 400 (basePrice), no de 306
    expect(result.pricing.totalUSD).toBeCloseTo(399.72);
  });
});
