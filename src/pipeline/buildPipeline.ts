/**
 * Fábrica del Pipeline por defecto que usa la app.
 *
 * La lista de filtros y su orden viven en `src/filters/index.ts` (docs/architecture.md §5);
 * acá solo se la envuelve en el orquestador. El proveedor de tasas se recibe por parámetro
 * para que la app comparta una sola instancia entre el filtro 3a y el endpoint
 * `DELETE /pipeline/cache`.
 */

import { Pipeline } from './Pipeline';
import { createOrderedFilters } from '../filters';
import {
  type ExchangeRateProvider,
  defaultExchangeRateProvider,
} from '../services/ExchangeRateProvider';

export function buildDefaultPipeline(
  exchangeRateProvider: ExchangeRateProvider = defaultExchangeRateProvider,
): Pipeline {
  return new Pipeline(createOrderedFilters(exchangeRateProvider));
}
