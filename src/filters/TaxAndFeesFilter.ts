/**
 * Filtro 7 — Cálculo de Impuestos y Tasas. Ver docs/architecture.md §5 y CONSIGNA.md "Filtro
 * de Cálculo de Impuestos y Tasas".
 *
 *   tax           = taxRate (12%)          × pricing.subtotal   (post-descuentos)
 *   airportFee    = airportFee ($25 fijos)
 *   fuelSurcharge = fuelSurchargeRate (8%)  × pricing.basePrice  (pre-descuentos)
 *   totalUSD      = subtotal + tax + airportFee + fuelSurcharge
 *
 * El impuesto va sobre el subtotal ya descontado (lo que el pasajero paga en este punto) y el
 * recargo de combustible sobre el precio de lista antes de descuentos — son bases distintas a
 * propósito, no un error. El porqué está justificado en detalle en design-decisions.md §2.
 */

import type { Filter } from './Filter';

export const taxAndFeesFilter: Filter = {
  name: 'taxAndFees',

  async execute(context, config) {
    const { subtotal, basePrice } = context.pricing;

    if (subtotal === undefined || basePrice === undefined) {
      return {
        ...context,
        warnings: [
          ...context.warnings,
          {
            filter: 'taxAndFees',
            code: 'MISSING_PRICING_DATA',
            message:
              'Falta el subtotal o el precio base en el contexto: no se pueden calcular impuestos y tasas.',
          },
        ],
      };
    }

    const { taxRate, airportFee, fuelSurchargeRate } = config.filters.taxAndFees.params;
    const tax = taxRate * subtotal;
    const fuelSurcharge = fuelSurchargeRate * basePrice;
    const totalUSD = subtotal + tax + airportFee + fuelSurcharge;

    return {
      ...context,
      pricing: {
        ...context.pricing,
        tax,
        airportFee,
        fuelSurcharge,
        totalUSD,
      },
    };
  },
};
