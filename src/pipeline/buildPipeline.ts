/**
 * Fábrica del Pipeline por defecto que usa la app.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────────────────────────────
 * docs/team-plan.md reserva `src/filters/index.ts` (la lista ordenada canónica de los 8
 * filtros) para el paso de INTEGRACIÓN FINAL, a cargo de quien haga el merge conjunto. Ese
 * archivo todavía no existe.
 *
 * Para no bloquear al paquete de Dev 5 (capa API) ni adelantarse a un archivo que es de otro
 * paso, la lista vive acá, en UN SOLO lugar, y todo lo demás del paquete (rutas, controllers,
 * tests de integración) recibe el `Pipeline` por inyección y no sabe de dónde salió.
 *
 * ── QUÉ HAY QUE HACER EN LA INTEGRACIÓN FINAL ──────────────────────────────────────────────
 * Cuando se cree `src/filters/index.ts`, este archivo se reduce a:
 *
 *   import { orderedFilters } from '../filters';
 *   export function buildDefaultPipeline(): Pipeline {
 *     return new Pipeline(orderedFilters);
 *   }
 *
 * y se borra la lista de abajo. Ningún otro archivo del paquete de Dev 5 cambia.
 * ───────────────────────────────────────────────────────────────────────────────────────────
 */

import { Pipeline } from './Pipeline';
import type { Filter } from '../filters/Filter';
import { PassengerValidationFilter } from '../filters/PassengerValidationFilter';
import { FlightValidationFilter } from '../filters/FlightValidationFilter';
import { ExchangeRateEnrichmentFilter } from '../filters/ExchangeRateEnrichmentFilter';
import { basePriceCalculationFilter } from '../filters/BasePriceCalculationFilter';
import { loyaltyDiscountFilter } from '../filters/LoyaltyDiscountFilter';
import { passengerTypeAdjustmentFilter } from '../filters/PassengerTypeAdjustmentFilter';
import { taxAndFeesFilter } from '../filters/TaxAndFeesFilter';
import { CurrencyConversionFilter } from '../filters/CurrencyConversionFilter';

/**
 * Los 8 filtros en el orden canónico de `FilterName` (docs/architecture.md §4).
 *
 * El filtro 3 del enunciado está partido en dos filtros de código: 3a enriquece con la tasa
 * ANTES del cálculo de precio, y 3b convierte el total final DESPUÉS de impuestos — por eso
 * uno abre y el otro cierra la cadena de pricing.
 */
export const orderedFilters: readonly Filter[] = [
  new PassengerValidationFilter(), // 1
  new FlightValidationFilter(), // 2
  new ExchangeRateEnrichmentFilter(), // 3a
  basePriceCalculationFilter, // 4
  loyaltyDiscountFilter, // 5
  passengerTypeAdjustmentFilter, // 6
  taxAndFeesFilter, // 7
  new CurrencyConversionFilter(), // 3b
];

export function buildDefaultPipeline(): Pipeline {
  return new Pipeline(orderedFilters);
}
