/**
 * Tests del filtro 6 (PassengerTypeAdjustmentFilter). Ver docs/testing-plan.md, sección "Flujo
 * de Cálculo de Precios", y docs/team-plan.md, paquete "Dev 4".
 *
 * El tipo de pasajero se lee de context.metadata.passengerTypeApplied (ya derivado de la edad
 * por PassengerValidationFilter, filtro 1 — Dev 2) — acá se setea directo en el contexto de
 * prueba, sin depender de que ese filtro exista, tal como pide el contrato de Filter.
 */

import { passengerTypeAdjustmentFilter } from '../../../src/filters/PassengerTypeAdjustmentFilter';
import type { PassengerTypeApplied, ReservationContext } from '../../../src/types/reservation.types';
import type { PipelineConfig } from '../../../src/types/pipeline.types';
import { defaultPipelineConfig } from '../../../src/config/defaultPipelineConfig';

function cloneConfig(): PipelineConfig {
  return JSON.parse(JSON.stringify(defaultPipelineConfig)) as PipelineConfig;
}

function buildContext(
  currentPrice: number | undefined,
  passengerTypeApplied?: PassengerTypeApplied,
): ReservationContext {
  return {
    reservationId: 'r1',
    originalRequest: { passengerId: 'p1', flightCode: 'F1', seatClass: 'business' },
    status: 'pending',
    errors: [],
    warnings: [],
    pricing: { seatClass: 'business', currentPrice },
    metadata: { filtersApplied: [], passengerTypeApplied },
    processingStartedAt: Date.now(),
  };
}

describe('PassengerTypeAdjustmentFilter', () => {
  it('child: 25% de descuento, y cierra subtotal', async () => {
    const context = buildContext(212.5, 'child');
    const result = await passengerTypeAdjustmentFilter.execute(context, cloneConfig());

    expect(result.pricing.currentPrice).toBeCloseTo(159.375);
    expect(result.pricing.subtotal).toBeCloseTo(159.375);
  });

  it('senior: 15% de descuento', async () => {
    const context = buildContext(360, 'senior');
    const result = await passengerTypeAdjustmentFilter.execute(context, cloneConfig());

    expect(result.pricing.currentPrice).toBeCloseTo(306);
    expect(result.pricing.subtotal).toBeCloseTo(306);
  });

  it('adult: sin descuento', async () => {
    const context = buildContext(212.5, 'adult');
    const result = await passengerTypeAdjustmentFilter.execute(context, cloneConfig());

    expect(result.pricing.currentPrice).toBe(212.5);
    expect(result.pricing.subtotal).toBe(212.5);
  });

  it('usa las tasas de la config, no valores hardcodeados', async () => {
    const config = cloneConfig();
    config.filters.passengerTypeAdjustment.params.rates.child = 0.5;
    const context = buildContext(200, 'child');

    const result = await passengerTypeAdjustmentFilter.execute(context, config);

    expect(result.pricing.subtotal).toBe(100);
  });

  it('contexto sin tipo de pasajero derivado: no rompe, agrega warning y no cierra subtotal', async () => {
    const context = buildContext(212.5, undefined);
    const result = await passengerTypeAdjustmentFilter.execute(context, cloneConfig());

    expect(result.pricing.subtotal).toBeUndefined();
    expect(result.status).toBe('pending');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      filter: 'passengerTypeAdjustment',
      code: 'MISSING_PRICING_DATA',
    });
  });

  it('contexto sin currentPrice: no rompe, agrega warning', async () => {
    const context = buildContext(undefined, 'adult');
    const result = await passengerTypeAdjustmentFilter.execute(context, cloneConfig());

    expect(result.pricing.subtotal).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
  });
});
