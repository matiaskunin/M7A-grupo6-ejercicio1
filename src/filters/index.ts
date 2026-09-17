/**
 * Lista ordenada canónica de los filtros que ejecuta el Pipeline.
 * Ver docs/architecture.md §5 y docs/team-plan.md ("Integración final", paso 1).
 *
 * Este es el único lugar del proyecto donde se define QUÉ filtros corren y EN QUÉ ORDEN. El
 * orquestador (`Pipeline`) no sabe nada de esta lista: la recibe por constructor.
 *
 * El filtro 3 del enunciado está partido en dos filtros de código (3a/3b) — la justificación
 * está en docs/architecture.md §4. Por eso son 8 entradas para 7 filtros del enunciado:
 * `exchangeRateEnrichment` abre la cadena de pricing obteniendo la tasa, y
 * `currencyConversion` la cierra convirtiendo el total ya calculado.
 */

import type { Filter } from './Filter';
import {
  type ExchangeRateProvider,
  defaultExchangeRateProvider,
} from '../services/ExchangeRateProvider';
import { PassengerValidationFilter } from './PassengerValidationFilter';
import { FlightValidationFilter } from './FlightValidationFilter';
import { ExchangeRateEnrichmentFilter } from './ExchangeRateEnrichmentFilter';
import { basePriceCalculationFilter } from './BasePriceCalculationFilter';
import { loyaltyDiscountFilter } from './LoyaltyDiscountFilter';
import { passengerTypeAdjustmentFilter } from './PassengerTypeAdjustmentFilter';
import { taxAndFeesFilter } from './TaxAndFeesFilter';
import { CurrencyConversionFilter } from './CurrencyConversionFilter';

/**
 * Arma la cadena de filtros. El proveedor de tasas se recibe por parámetro para que la app
 * pueda compartir UNA sola instancia entre el filtro 3a y el endpoint
 * `DELETE /pipeline/cache` — si cada uno tuviera la suya, invalidar la cache no tendría
 * ningún efecto sobre la que realmente usa el pipeline.
 */
export function createOrderedFilters(
  exchangeRateProvider: ExchangeRateProvider = defaultExchangeRateProvider,
): Filter[] {
  return [
    new PassengerValidationFilter(), // 1 — validación de pasajero
    new FlightValidationFilter(), // 2 — validación de vuelo
    new ExchangeRateEnrichmentFilter(exchangeRateProvider), // 3a — obtiene la tasa
    basePriceCalculationFilter, // 4 — precio base según clase
    loyaltyDiscountFilter, // 5 — descuento por lealtad
    passengerTypeAdjustmentFilter, // 6 — ajuste por tipo de pasajero
    taxAndFeesFilter, // 7 — impuestos y tasas
    new CurrencyConversionFilter(), // 3b — convierte el total final
  ];
}

/** La cadena por defecto, con el proveedor de tasas compartido de la aplicación. */
export const orderedFilters: readonly Filter[] = createOrderedFilters();

export type { Filter };
