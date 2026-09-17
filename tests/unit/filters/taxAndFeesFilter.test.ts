/**
 * Tests del filtro 7 (TaxAndFeesFilter). Ver docs/testing-plan.md, sección "Flujo de Cálculo
 * de Precios", y docs/team-plan.md, paquete "Dev 4".
 */

import { taxAndFeesFilter } from '../../../src/filters/TaxAndFeesFilter';
import type { ReservationContext } from '../../../src/types/reservation.types';
import type { PipelineConfig } from '../../../src/types/pipeline.types';
import { defaultPipelineConfig } from '../../../src/config/defaultPipelineConfig';

function cloneConfig(): PipelineConfig {
  return JSON.parse(JSON.stringify(defaultPipelineConfig)) as PipelineConfig;
}

function buildContext(basePrice: number | undefined, subtotal: number | undefined): ReservationContext {
  return {
    reservationId: 'r1',
    originalRequest: { passengerId: 'p1', flightCode: 'F1', seatClass: 'business' },
    status: 'pending',
    errors: [],
    warnings: [],
    pricing: { seatClass: 'business', basePrice, subtotal },
    metadata: { filtersApplied: [] },
    processingStartedAt: Date.now(),
  };
}

describe('TaxAndFeesFilter', () => {
  it('calcula tax (12% del subtotal), airportFee ($25 fijos) y fuelSurcharge (8% del basePrice)', async () => {
    // Business + Gold + Child del ejemplo de design-decisions.md §1: basePrice 250, subtotal 159.375.
    const context = buildContext(250, 159.375);
    const result = await taxAndFeesFilter.execute(context, cloneConfig());

    expect(result.pricing.tax).toBeCloseTo(19.125);
    expect(result.pricing.airportFee).toBe(25);
    expect(result.pricing.fuelSurcharge).toBeCloseTo(20);
    expect(result.pricing.totalUSD).toBeCloseTo(223.5);
  });

  it('el impuesto usa el subtotal post-descuentos, no el basePrice pre-descuentos', async () => {
    const context = buildContext(250, 100);
    const result = await taxAndFeesFilter.execute(context, cloneConfig());

    expect(result.pricing.tax).toBeCloseTo(12); // 12% de 100, no de 250
    expect(result.pricing.fuelSurcharge).toBeCloseTo(20); // 8% de 250, no de 100
  });

  it('usa los parámetros de la config, no valores hardcodeados', async () => {
    const config = cloneConfig();
    config.filters.taxAndFees.params = { taxRate: 0.2, airportFee: 10, fuelSurchargeRate: 0.1 };
    const context = buildContext(100, 100);

    const result = await taxAndFeesFilter.execute(context, config);

    expect(result.pricing.tax).toBeCloseTo(20);
    expect(result.pricing.airportFee).toBe(10);
    expect(result.pricing.fuelSurcharge).toBeCloseTo(10);
    expect(result.pricing.totalUSD).toBeCloseTo(140);
  });

  it('contexto sin subtotal: no rompe, agrega warning y no calcula totales', async () => {
    const context = buildContext(250, undefined);
    const result = await taxAndFeesFilter.execute(context, cloneConfig());

    expect(result.pricing.totalUSD).toBeUndefined();
    expect(result.status).toBe('pending');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      filter: 'taxAndFees',
      code: 'MISSING_PRICING_DATA',
    });
  });

  it('contexto sin basePrice: no rompe, agrega warning', async () => {
    const context = buildContext(undefined, 100);
    const result = await taxAndFeesFilter.execute(context, cloneConfig());

    expect(result.pricing.totalUSD).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
  });
});
