/**
 * Valores por defecto de PipelineConfig — seedea el singleton de PipelineConfigStore.
 * Cada valor está justificado en CONSIGNA.md / docs/design-decisions.md; no son arbitrarios.
 */

import type { PipelineConfig } from '../types/pipeline.types';

export const defaultPipelineConfig: PipelineConfig = {
  filters: {
    passengerValidation: {
      enabled: true,
      // Umbrales de edad usados para derivar el passengerType real — design-decisions.md §4.
      params: { thresholds: { childMaxAge: 12, seniorMinAge: 65 } },
    },
    flightValidation: {
      enabled: true,
      params: {},
    },
    exchangeRateEnrichment: {
      enabled: true,
      // Timeout 5s, retry 3, cache 1h — CONSIGNA.md "Manejo de Errores" / "Caching de Tasas".
      params: {
        timeoutMs: 5000,
        maxRetries: 3,
        cacheTtlMs: 60 * 60 * 1000,
        baseCurrency: 'USD',
      },
    },
    basePriceCalculation: {
      enabled: true,
      // Economy x1, Business x2.5, First x4 — CONSIGNA.md "Filtro de Cálculo de Precio Base".
      params: { multipliers: { economy: 1, business: 2.5, first: 4 } },
    },
    loyaltyDiscount: {
      enabled: true,
      // Bronze 5%, Silver 10%, Gold 15% — CONSIGNA.md "Filtro de Descuentos por Lealtad".
      params: { rates: { bronze: 0.05, silver: 0.1, gold: 0.15 } },
    },
    passengerTypeAdjustment: {
      enabled: true,
      // Child 25%, Senior 15%, Adult 0% — CONSIGNA.md "Filtro de Ajustes por Tipo de Pasajero".
      params: { rates: { child: 0.25, senior: 0.15, adult: 0 } },
    },
    taxAndFees: {
      enabled: true,
      // tax 12% sobre subtotal, airportFee $25 fijos, fuelSurcharge 8% sobre basePrice —
      // design-decisions.md §2.
      params: { taxRate: 0.12, airportFee: 25, fuelSurchargeRate: 0.08 },
    },
    currencyConversion: {
      enabled: true,
      params: {},
    },
  },
  // Tasas de fallback si la API de tipo de cambio falla tras los reintentos —
  // docs/architecture.md §6. Valores de referencia; Dev 3 puede ajustarlos al implementar el
  // servicio real (no son la parte crítica: lo crítico es que exista un fallback, no el valor
  // exacto — design-decisions.md §3).
  exchangeRateFallback: {
    USD: 1,
    ARS: 1000,
    BRL: 5.4,
    EUR: 0.92,
  },
};
