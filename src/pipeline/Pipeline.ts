/**
 * El orquestador. No conoce reglas de negocio — solo sabe recorrer una lista de filtros.
 * Ver docs/architecture.md §3 (acá se implementa el pseudocódigo documentado ahí, tal cual).
 */

import type { Filter } from '../filters/Filter';
import type {
  PipelineResult,
  PipelineResultSummary,
  ProcessedReservation,
  ReservationContext,
  ReservationRequest,
} from '../types/reservation.types';
import type { PipelineConfig } from '../types/pipeline.types';
import { createInitialContext, finalize } from './context';

export class Pipeline {
  constructor(private readonly filters: readonly Filter[]) {}

  /**
   * Procesa una única reserva a través de la cadena de filtros habilitados.
   *  - Deshabilitar un filtro es un `continue` — la config vive en config.filters[filter.name].
   *  - El corte por rechazo/error es genérico: cualquier filtro que deje context.status !=
   *    'pending' corta el resto de la cadena para esa reserva.
   *  - Una excepción inesperada de un filtro no tira abajo el batch: se atrapa, se registra
   *    como error de esa reserva puntual, y se corta la cadena para ella únicamente.
   */
  async processOne(request: ReservationRequest, config: PipelineConfig): Promise<ProcessedReservation> {
    let context: ReservationContext = createInitialContext(request);

    for (const filter of this.filters) {
      const filterConfig = config.filters[filter.name];
      if (!filterConfig?.enabled) continue;
      if (context.status !== 'pending') break;

      try {
        context = await filter.execute(context, config);
        context.metadata.filtersApplied.push(filter.name);
      } catch (err) {
        context.errors.push({
          filter: filter.name,
          code: 'FILTER_EXCEPTION',
          message: err instanceof Error ? err.message : String(err),
        });
        context.status = 'error';
        break;
      }
    }

    if (context.status === 'pending') {
      context.status = 'completed';
    }

    return finalize(context);
  }

  /**
   * Procesa el array completo de reservas en paralelo (Promise.all): una reserva lenta (ej.
   * esperando el timeout de 5s de la API de cambio) no bloquea el procesamiento de las demás.
   */
  async processBatch(requests: ReservationRequest[], config: PipelineConfig): Promise<PipelineResult> {
    const startedAt = Date.now();

    const results = await Promise.all(
      requests.map((request) => this.processOne(request, config)),
    );

    const summary = results.reduce<PipelineResultSummary>(
      (acc, result) => {
        acc.total += 1;
        if (result.status === 'completed') acc.completed += 1;
        else if (result.status === 'rejected') acc.rejected += 1;
        else if (result.status === 'error') acc.errored += 1;
        return acc;
      },
      { total: 0, completed: 0, rejected: 0, errored: 0 },
    );

    return {
      results,
      summary,
      totalProcessingTimeMs: Date.now() - startedAt,
    };
  }
}
