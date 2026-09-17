/**
 * Filtro 4 — Cálculo de Precio Base. Ver docs/architecture.md §5 y CONSIGNA.md "Filtro de
 * Cálculo de Precio Base".
 *
 * precio_base = flight.basePriceUSD × multiplicador(seatClass)
 * Economy ×1, Business ×2.5, First ×4 — ver config.filters.basePriceCalculation.params.
 *
 * `basePrice` queda fijo acá y nunca se vuelve a tocar (lo usa TaxAndFeesFilter para el
 * recargo de combustible, sobre el precio pre-descuentos — design-decisions.md §2).
 * `currentPrice` arranca en el mismo valor: es el precio "corriendo" que van a ir
 * descontando LoyaltyDiscountFilter y PassengerTypeAdjustmentFilter.
 */

import type { Filter } from './Filter';

export const basePriceCalculationFilter: Filter = {
  name: 'basePriceCalculation',

  async execute(context, config) {
    if (!context.flight) {
      return {
        ...context,
        warnings: [
          ...context.warnings,
          {
            filter: 'basePriceCalculation',
            code: 'MISSING_FLIGHT_DATA',
            message: 'No hay datos de vuelo en el contexto: no se puede calcular el precio base.',
          },
        ],
      };
    }

    const { multipliers } = config.filters.basePriceCalculation.params;
    const multiplier = multipliers[context.pricing.seatClass];
    const basePrice = context.flight.basePriceUSD * multiplier;

    return {
      ...context,
      pricing: {
        ...context.pricing,
        basePrice,
        currentPrice: basePrice,
      },
    };
  },
};
