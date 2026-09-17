/**
 * Filtro 6 — Ajustes por Tipo de Pasajero. Ver docs/architecture.md §5 y CONSIGNA.md "Filtro
 * de Ajustes por Tipo de Pasajero".
 *
 * Child (<12) 25%, Senior (>65) 15%, Adult 0% — ver
 * config.filters.passengerTypeAdjustment.params.rates.
 *
 * El tipo de pasajero YA viene derivado de la edad real en
 * `context.metadata.passengerTypeApplied` (lo fija PassengerValidationFilter, filtro 1, que es
 * quien posee los umbrales childMaxAge/seniorMinAge) — este filtro no vuelve a mirar la edad ni
 * confía en ningún valor declarado por el cliente. Ver design-decisions.md §4.
 *
 * Aplica el descuento sobre `pricing.currentPrice` (secuencial respecto del descuento de
 * lealtad ya aplicado, no sumado — design-decisions.md §1) y cierra `pricing.subtotal`, que es
 * la base que va a usar TaxAndFeesFilter para el impuesto del 12%.
 */

import type { Filter } from './Filter';

export const passengerTypeAdjustmentFilter: Filter = {
  name: 'passengerTypeAdjustment',

  async execute(context, config) {
    const passengerType = context.metadata.passengerTypeApplied;

    if (!passengerType || context.pricing.currentPrice === undefined) {
      return {
        ...context,
        warnings: [
          ...context.warnings,
          {
            filter: 'passengerTypeAdjustment',
            code: 'MISSING_PRICING_DATA',
            message:
              'Falta el tipo de pasajero derivado o el precio de entrada en el contexto: no se aplica el ajuste.',
          },
        ],
      };
    }

    const { rates } = config.filters.passengerTypeAdjustment.params;
    const rate = rates[passengerType];
    const adjustedPrice = context.pricing.currentPrice * (1 - rate);

    return {
      ...context,
      pricing: {
        ...context.pricing,
        currentPrice: adjustedPrice,
        subtotal: adjustedPrice,
      },
    };
  },
};
