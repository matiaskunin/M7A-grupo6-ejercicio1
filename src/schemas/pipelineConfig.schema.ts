/**
 * Validación zod de PipelineConfig. Se usa para:
 *  - validar el body de PUT /pipeline/config (deep partial — merge parcial sobre el singleton)
 *  - validar el `config` opcional del body de POST /reservations/process (deep partial, aplica
 *    solo a esa corrida puntual)
 *
 * Rangos, según docs/architecture.md §7: porcentajes en [0,1], montos >= 0.
 */

import { z } from 'zod';

const percentage = z.number().min(0).max(1);
const nonNegative = z.number().min(0);
const nonNegativeInt = z.number().int().min(0);
const positiveInt = z.number().int().positive();

export const seatClassMultipliersSchema = z.object({
  economy: nonNegative,
  business: nonNegative,
  first: nonNegative,
});

export const loyaltyDiscountRatesSchema = z.object({
  bronze: percentage,
  silver: percentage,
  gold: percentage,
});

export const passengerTypeAdjustmentRatesSchema = z.object({
  child: percentage,
  senior: percentage,
  adult: percentage,
});

export const passengerTypeThresholdsSchema = z.object({
  childMaxAge: nonNegative,
  seniorMinAge: nonNegative,
});

export const taxAndFeesParamsSchema = z.object({
  taxRate: percentage,
  airportFee: nonNegative,
  fuelSurchargeRate: percentage,
});

export const exchangeRateParamsSchema = z.object({
  timeoutMs: positiveInt,
  maxRetries: nonNegativeInt,
  cacheTtlMs: positiveInt,
  baseCurrency: z.string().min(1),
});

const noParamsSchema = z.object({}).strict();

export const pipelineConfigSchema = z.object({
  filters: z.object({
    passengerValidation: z.object({
      enabled: z.boolean(),
      params: z.object({ thresholds: passengerTypeThresholdsSchema }),
    }),
    flightValidation: z.object({
      enabled: z.boolean(),
      params: noParamsSchema,
    }),
    exchangeRateEnrichment: z.object({
      enabled: z.boolean(),
      params: exchangeRateParamsSchema,
    }),
    basePriceCalculation: z.object({
      enabled: z.boolean(),
      params: z.object({ multipliers: seatClassMultipliersSchema }),
    }),
    loyaltyDiscount: z.object({
      enabled: z.boolean(),
      params: z.object({ rates: loyaltyDiscountRatesSchema }),
    }),
    passengerTypeAdjustment: z.object({
      enabled: z.boolean(),
      params: z.object({ rates: passengerTypeAdjustmentRatesSchema }),
    }),
    taxAndFees: z.object({
      enabled: z.boolean(),
      params: taxAndFeesParamsSchema,
    }),
    currencyConversion: z.object({
      enabled: z.boolean(),
      params: noParamsSchema,
    }),
  }),
  exchangeRateFallback: z.record(z.string(), z.number().positive()),
});

/** Deep partial para PUT /pipeline/config y para el `config` opcional del body de proceso. */
export const pipelineConfigPartialSchema = pipelineConfigSchema.deepPartial();

export type PipelineConfigInput = z.infer<typeof pipelineConfigSchema>;
export type PipelineConfigPartialInput = z.infer<typeof pipelineConfigPartialSchema>;
