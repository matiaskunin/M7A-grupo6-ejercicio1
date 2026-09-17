/**
 * Tests unitarios para FlightValidationFilter (Filtro 2).
 * Ver docs/team-plan.md (Dev 2) y docs/testing-plan.md.
 */

import { FlightValidationFilter } from '../../../src/filters/FlightValidationFilter';
import { createInitialContext } from '../../../src/pipeline/context';
import { defaultPipelineConfig } from '../../../src/config/defaultPipelineConfig';
import type { ReservationRequest } from '../../../src/types/reservation.types';
import type { FlightRecord } from '../../../src/types/flight.types';

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

describe('FlightValidationFilter', () => {
  const filter = new FlightValidationFilter();

  it('valida con éxito un vuelo existente con asientos y fecha futura', async () => {
    const ctx = buildContext({ flightCode: 'FL-US-001' });
    const result = await filter.execute(ctx, defaultPipelineConfig);

    expect(result.status).toBe('pending');
    expect(result.errors).toHaveLength(0);
    expect(result.flight).toBeDefined();
    expect(result.flight?.code).toBe('FL-US-001');
    expect(result.flight?.availableSeats).toBeGreaterThan(0);
  });

  it('rechaza la reserva si el vuelo no existe (FLIGHT_NOT_FOUND)', async () => {
    const ctx = buildContext({ flightCode: 'NON-EXISTENT-FLIGHT' });
    const result = await filter.execute(ctx, defaultPipelineConfig);

    expect(result.status).toBe('rejected');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      filter: 'flightValidation',
      code: 'FLIGHT_NOT_FOUND',
    });
  });

  it('rechaza la reserva si el vuelo no tiene asientos disponibles (FLIGHT_NO_AVAILABILITY)', async () => {
    const ctx = buildContext({ flightCode: 'FL-NO-SEATS' });
    const result = await filter.execute(ctx, defaultPipelineConfig);

    expect(result.status).toBe('rejected');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      filter: 'flightValidation',
      code: 'FLIGHT_NO_AVAILABILITY',
    });
  });

  it('rechaza la reserva si el origen no coincide con el vuelo (FLIGHT_ROUTE_MISMATCH)', async () => {
    // FL-US-001 tiene origin: 'EZE' y destination: 'MIA'
    const ctx = buildContext({
      flightCode: 'FL-US-001',
      origin: 'JFK', // No coincide con EZE
    });
    const result = await filter.execute(ctx, defaultPipelineConfig);

    expect(result.status).toBe('rejected');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      filter: 'flightValidation',
      code: 'FLIGHT_ROUTE_MISMATCH',
    });
  });

  it('rechaza la reserva si el destino no coincide con el vuelo (FLIGHT_ROUTE_MISMATCH)', async () => {
    // FL-US-001 tiene origin: 'EZE' y destination: 'MIA'
    const ctx = buildContext({
      flightCode: 'FL-US-001',
      destination: 'MAD', // No coincide con MIA
    });
    const result = await filter.execute(ctx, defaultPipelineConfig);

    expect(result.status).toBe('rejected');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      filter: 'flightValidation',
      code: 'FLIGHT_ROUTE_MISMATCH',
    });
  });

  it('acepta la reserva si el origen y destino especificados coinciden exactamente', async () => {
    const ctx = buildContext({
      flightCode: 'FL-US-001',
      origin: 'EZE',
      destination: 'MIA',
    });
    const result = await filter.execute(ctx, defaultPipelineConfig);

    expect(result.status).toBe('pending');
    expect(result.errors).toHaveLength(0);
  });

  it('rechaza la reserva si la fecha de salida ya pasó (FLIGHT_DATE_NOT_FUTURE)', async () => {
    const ctx = buildContext({ flightCode: 'FL-PAST-DATE' });
    const result = await filter.execute(ctx, defaultPipelineConfig);

    expect(result.status).toBe('rejected');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      filter: 'flightValidation',
      code: 'FLIGHT_DATE_NOT_FUTURE',
    });
  });

  it('rechaza la reserva si la fecha de salida es exactamente igual a "ahora"', async () => {
    const nowIso = '2026-09-17T12:00:00.000Z';
    const nowMs = new Date(nowIso).getTime();

    const flightNow: FlightRecord = {
      code: 'FL-NOW',
      origin: 'EZE',
      destination: 'MIA',
      destinationCountry: 'US',
      departureDate: nowIso, // Salida exactamente en el instante de procesamiento
      availableSeats: 10,
      basePriceUSD: 100,
    };

    const customFilter = new FlightValidationFilter([flightNow]);
    const ctx = buildContext({ flightCode: 'FL-NOW' }, nowMs);

    const result = await customFilter.execute(ctx, defaultPipelineConfig);

    expect(result.status).toBe('rejected');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      filter: 'flightValidation',
      code: 'FLIGHT_DATE_NOT_FUTURE',
    });
  });
});

