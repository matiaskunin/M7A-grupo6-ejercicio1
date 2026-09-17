/**
 * Filtro 5 — Descuentos por Lealtad. Ver docs/architecture.md §5 y CONSIGNA.md "Filtro de
 * Descuentos por Lealtad".
 *
 * Bronze 5%, Silver 10%, Gold 15%, none (sin tier) 0% — ver
 * config.filters.loyaltyDiscount.params.rates.
 *
 * Aplica el descuento sobre `pricing.currentPrice` (el valor que le pasó el filtro anterior),
 * no sobre `pricing.basePrice` — los descuentos son secuenciales/compuestos, no se suman con
 * el de PassengerTypeAdjustmentFilter. Ver design-decisions.md §1 para el porqué y el ejemplo
 * numérico completo.
 */

import type { Filter } from './Filter';

export const loyaltyDiscountFilter: Filter = {
  name: 'loyaltyDiscount',

  async execute(context, config) {
    if (!context.passenger || context.pricing.currentPrice === undefined) {
      return {
        ...context,
        warnings: [
          ...context.warnings,
          {
            filter: 'loyaltyDiscount',
            code: 'MISSING_PRICING_DATA',
            message:
              'Falta el pasajero o el precio de entrada en el contexto: no se aplica el descuento de lealtad.',
          },
        ],
      };
    }

    const { rates } = config.filters.loyaltyDiscount.params;
    const tier = context.passenger.loyaltyTier;
    const rate = tier === 'none' ? 0 : rates[tier];
    const currentPrice = context.pricing.currentPrice * (1 - rate);

    return {
      ...context,
      pricing: {
        ...context.pricing,
        currentPrice,
      },
      metadata: {
        ...context.metadata,
        loyaltyTier: tier,
      },
    };
  },
};
