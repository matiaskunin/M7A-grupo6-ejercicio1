/**
 * Tests unitarios para PassengerValidationFilter (Filtro 1).
 * Ver docs/team-plan.md (Dev 2) y docs/testing-plan.md.
 */

import { PassengerValidationFilter } from '../../../src/filters/PassengerValidationFilter';
import { createInitialContext } from '../../../src/pipeline/context';
import { defaultPipelineConfig } from '../../../src/config/defaultPipelineConfig';
import type { ReservationRequest } from '../../../src/types/reservation.types';
import type { PipelineConfig } from '../../../src/types/pipeline.types';
import type { PassengerRecord } from '../../../src/types/passenger.types';

function buildContext(overrides: Partial<ReservationRequest> = {}, startedAt?: number) {
  const request: ReservationRequest = {
    passengerId: 'PASS-ADULT-NONE',
    flightCode: 'FL-US-001',
    seatClass: 'economy',
    ...overrides,
  };
  const ctx = createInitialContext(request);
  if (startedAt) {
    ctx.processingStartedAt = startedAt;
  }
  return ctx;
}

function cloneConfig(): PipelineConfig {
  return JSON.parse(JSON.stringify(defaultPipelineConfig)) as PipelineConfig;
}

describe('PassengerValidationFilter', () => {
  const filter = new PassengerValidationFilter();

  it('valida con éxito un pasajero adulto activo existente y enriquece el contexto', async () => {
    const ctx = buildContext({ passengerId: 'PASS-ADULT-NONE' });
    const result = await filter.execute(ctx, cloneConfig());

    expect(result.status).toBe('pending');
    expect(result.errors).toHaveLength(0);
    expect(result.passenger).toBeDefined();
    expect(result.passenger?.id).toBe('PASS-ADULT-NONE');
    expect(result.metadata.passengerTypeApplied).toBe('adult');
    expect(result.metadata.loyaltyTier).toBe('none');
  });

  it('rechaza la reserva si el pasajero no existe (PASSENGER_NOT_FOUND)', async () => {
    const ctx = buildContext({ passengerId: 'NON-EXISTENT-ID' });
    const result = await filter.execute(ctx, cloneConfig());

    expect(result.status).toBe('rejected');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      filter: 'passengerValidation',
      code: 'PASSENGER_NOT_FOUND',
    });
  });

  it('rechaza la reserva si el pasajero está inactivo (PASSENGER_INACTIVE)', async () => {
    const ctx = buildContext({ passengerId: 'PASS-INACTIVE' });
    const result = await filter.execute(ctx, cloneConfig());

    expect(result.status).toBe('rejected');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      filter: 'passengerValidation',
      code: 'PASSENGER_INACTIVE',
    });
  });

  it('rechaza la reserva si el contacto es inválido (email o teléfono malformado)', async () => {
    const ctx = buildContext({ passengerId: 'PASS-INVALID-CONTACT' });
    const result = await filter.execute(ctx, cloneConfig());

    expect(result.status).toBe('rejected');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      filter: 'passengerValidation',
      code: 'INVALID_CONTACT_INFO',
    });
  });

  it('rechaza si el email está vacío o malformado en un pasajero inyectado', async () => {
    const customPassenger: PassengerRecord = {
      id: 'CUSTOM-INVALID-EMAIL',
      name: 'Test Email',
      isActive: true,
      birthDate: '1990-01-01',
      contactInfo: { email: 'no-at-sign.com', phone: '+123456789' },
      loyaltyTier: 'none',
    };
    const customFilter = new PassengerValidationFilter([customPassenger]);
    const ctx = buildContext({ passengerId: 'CUSTOM-INVALID-EMAIL' });
    const result = await customFilter.execute(ctx, cloneConfig());

    expect(result.status).toBe('rejected');
    expect(result.errors[0].code).toBe('INVALID_CONTACT_INFO');
  });

  it('rechaza si el teléfono es demasiado corto o inválido en un pasajero inyectado', async () => {
    const customPassenger: PassengerRecord = {
      id: 'CUSTOM-INVALID-PHONE',
      name: 'Test Phone',
      isActive: true,
      birthDate: '1990-01-01',
      contactInfo: { email: 'test@example.com', phone: '12' },
      loyaltyTier: 'none',
    };
    const customFilter = new PassengerValidationFilter([customPassenger]);
    const ctx = buildContext({ passengerId: 'CUSTOM-INVALID-PHONE' });
    const result = await customFilter.execute(ctx, cloneConfig());

    expect(result.status).toBe('rejected');
    expect(result.errors[0].code).toBe('INVALID_CONTACT_INFO');
  });

  it('clasifica correctamente como child a un pasajero con edad < 12 años', async () => {
    // PASS-CHILD-GOLD nació en 2018; procesado en 2026 tiene 8 años (< 12)
    const ctx = buildContext(
      { passengerId: 'PASS-CHILD-GOLD' },
      new Date('2026-09-01T00:00:00.000Z').getTime(),
    );
    const result = await filter.execute(ctx, cloneConfig());

    expect(result.status).toBe('pending');
    expect(result.metadata.passengerTypeApplied).toBe('child');
    expect(result.metadata.loyaltyTier).toBe('gold');
  });

  it('clasifica correctamente como senior a un pasajero con edad > 65 años', async () => {
    // PASS-SENIOR-SILVER nació en 1950; procesado en 2026 tiene 76 años (> 65)
    const ctx = buildContext(
      { passengerId: 'PASS-SENIOR-SILVER' },
      new Date('2026-09-01T00:00:00.000Z').getTime(),
    );
    const result = await filter.execute(ctx, cloneConfig());

    expect(result.status).toBe('pending');
    expect(result.metadata.passengerTypeApplied).toBe('senior');
    expect(result.metadata.loyaltyTier).toBe('silver');
  });

  it('agrega warning si declaredPassengerType no coincide con el derivado, pero no rechaza', async () => {
    // El pasajero es adulto (PASS-ADULT-NONE), pero el cliente declaró "child"
    const ctx = buildContext(
      { passengerId: 'PASS-ADULT-NONE', declaredPassengerType: 'child' },
      new Date('2026-09-01T00:00:00.000Z').getTime(),
    );
    const result = await filter.execute(ctx, cloneConfig());

    expect(result.status).toBe('pending');
    expect(result.metadata.passengerTypeApplied).toBe('adult');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      filter: 'passengerValidation',
      code: 'PASSENGER_TYPE_MISMATCH',
    });
  });

  it('no agrega warning si declaredPassengerType coincide con el tipo derivado', async () => {
    const ctx = buildContext(
      { passengerId: 'PASS-ADULT-NONE', declaredPassengerType: 'adult' },
      new Date('2026-09-01T00:00:00.000Z').getTime(),
    );
    const result = await filter.execute(ctx, cloneConfig());

    expect(result.status).toBe('pending');
    expect(result.warnings).toHaveLength(0);
  });

  it('respeta umbrales de edad modificados en la configuración', async () => {
    // Si configuramos childMaxAge = 18, un pasajero de 15 años debe ser 'child'
    const teenager: PassengerRecord = {
      id: 'PASS-TEEN',
      name: 'Adolescente',
      isActive: true,
      birthDate: '2011-01-01', // ~15 años en 2026
      contactInfo: { email: 'teen@example.com', phone: '+5491100001111' },
      loyaltyTier: 'none',
    };
    const customFilter = new PassengerValidationFilter([teenager]);
    const ctx = buildContext(
      { passengerId: 'PASS-TEEN' },
      new Date('2026-09-01T00:00:00.000Z').getTime(),
    );

    const config = cloneConfig();
    config.filters.passengerValidation.params.thresholds.childMaxAge = 18;

    const result = await customFilter.execute(ctx, config);
    expect(result.metadata.passengerTypeApplied).toBe('child');
  });
});

