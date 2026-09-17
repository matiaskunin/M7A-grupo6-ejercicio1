/**
 * Tests del orquestador (Pipeline), con filtros de prueba/dobles inyectados — nunca los
 * filtros reales de negocio (esos son responsabilidad de Dev 2/3/4 y viven en src/filters/*,
 * cada uno con su propio test). Ver docs/team-plan.md, paquete "Dev 1".
 */

import { Pipeline } from '../../../src/pipeline/Pipeline';
import type { Filter } from '../../../src/filters/Filter';
import type { ReservationRequest } from '../../../src/types/reservation.types';
import type { PipelineConfig } from '../../../src/types/pipeline.types';
import { defaultPipelineConfig } from '../../../src/config/defaultPipelineConfig';

function buildRequest(overrides: Partial<ReservationRequest> = {}): ReservationRequest {
  return {
    passengerId: 'p1',
    flightCode: 'F1',
    seatClass: 'economy',
    ...overrides,
  };
}

/** Config de trabajo independiente por test, para no compartir estado mutable entre tests. */
function cloneConfig(): PipelineConfig {
  return JSON.parse(JSON.stringify(defaultPipelineConfig)) as PipelineConfig;
}

describe('Pipeline', () => {
  it('ejecuta los filtros habilitados en orden y registra filtersApplied', async () => {
    const order: string[] = [];

    const filterA: Filter = {
      name: 'passengerValidation',
      execute: async (context) => {
        order.push('A');
        return context;
      },
    };
    const filterB: Filter = {
      name: 'flightValidation',
      execute: async (context) => {
        order.push('B');
        return context;
      },
    };

    const pipeline = new Pipeline([filterA, filterB]);
    const result = await pipeline.processOne(buildRequest(), cloneConfig());

    expect(order).toEqual(['A', 'B']);
    expect(result.status).toBe('completed');
    expect(result.metadata.filtersApplied).toEqual(['passengerValidation', 'flightValidation']);
  });

  it('saltea un filtro deshabilitado por config, sin ejecutarlo', async () => {
    const executed: string[] = [];

    const filterA: Filter = {
      name: 'passengerValidation',
      execute: async (context) => {
        executed.push('A');
        return context;
      },
    };
    const filterB: Filter = {
      name: 'flightValidation',
      execute: async (context) => {
        executed.push('B');
        return context;
      },
    };

    const pipeline = new Pipeline([filterA, filterB]);
    const config = cloneConfig();
    config.filters.flightValidation.enabled = false;

    const result = await pipeline.processOne(buildRequest(), config);

    expect(executed).toEqual(['A']);
    expect(result.metadata.filtersApplied).toEqual(['passengerValidation']);
  });

  it('corta la cadena cuando un filtro pone status distinto de pending (rechazo)', async () => {
    const executed: string[] = [];

    const rejectingFilter: Filter = {
      name: 'passengerValidation',
      execute: async (context) => {
        executed.push('reject');
        return {
          ...context,
          status: 'rejected',
          errors: [
            ...context.errors,
            { filter: 'passengerValidation', code: 'PASSENGER_NOT_FOUND', message: 'no existe' },
          ],
        };
      },
    };
    const neverCalled: Filter = {
      name: 'flightValidation',
      execute: async (context) => {
        executed.push('never');
        return context;
      },
    };

    const pipeline = new Pipeline([rejectingFilter, neverCalled]);
    const result = await pipeline.processOne(buildRequest(), cloneConfig());

    expect(executed).toEqual(['reject']);
    expect(result.status).toBe('rejected');
    expect(result.errors).toHaveLength(1);
  });

  it('atrapa una excepción de un filtro: la reserva queda en error, sin tumbar el resto del batch', async () => {
    const throwingFilter: Filter = {
      name: 'passengerValidation',
      execute: async () => {
        throw new Error('boom');
      },
    };

    const pipeline = new Pipeline([throwingFilter]);
    const batch = await pipeline.processBatch(
      [buildRequest({ passengerId: 'a' }), buildRequest({ passengerId: 'b' })],
      cloneConfig(),
    );

    expect(batch.results).toHaveLength(2);
    for (const result of batch.results) {
      expect(result.status).toBe('error');
      expect(result.errors[0]).toMatchObject({
        filter: 'passengerValidation',
        code: 'FILTER_EXCEPTION',
        message: 'boom',
      });
    }
  });

  it('calcula bien el summary del batch (completed / rejected / errored)', async () => {
    const conditionalFilter: Filter = {
      name: 'passengerValidation',
      execute: async (context) => {
        if (context.originalRequest.passengerId === 'reject-me') {
          return {
            ...context,
            status: 'rejected',
            errors: [...context.errors, { filter: 'passengerValidation', code: 'X', message: 'x' }],
          };
        }
        if (context.originalRequest.passengerId === 'throw-me') {
          throw new Error('boom');
        }
        return context;
      },
    };

    const pipeline = new Pipeline([conditionalFilter]);
    const batch = await pipeline.processBatch(
      [
        buildRequest({ passengerId: 'ok' }),
        buildRequest({ passengerId: 'reject-me' }),
        buildRequest({ passengerId: 'throw-me' }),
      ],
      cloneConfig(),
    );

    expect(batch.summary).toEqual({ total: 3, completed: 1, rejected: 1, errored: 1 });
  });

  it('no llama a un filtro posterior si el status ya no es pending, aunque esté habilitado', async () => {
    const calledAfterReject = jest.fn();

    const rejectingFilter: Filter = {
      name: 'passengerValidation',
      execute: async (context) => ({ ...context, status: 'rejected' }),
    };
    const afterFilter: Filter = {
      name: 'flightValidation',
      execute: async (context) => {
        calledAfterReject();
        return context;
      },
    };

    const pipeline = new Pipeline([rejectingFilter, afterFilter]);
    await pipeline.processOne(buildRequest(), cloneConfig());

    expect(calledAfterReject).not.toHaveBeenCalled();
  });
});
