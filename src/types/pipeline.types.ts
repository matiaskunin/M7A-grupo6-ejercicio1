/**
 * Tipos de configuración del pipeline. Ver docs/architecture.md §7 y §8.
 */

/**
 * Nombre de cada filtro de código. El filtro 3 del enunciado se implementa como dos filtros
 * de código independientes (3a/3b) — ver docs/architecture.md §4.
 */
export type FilterName =
  | 'passengerValidation'
  | 'flightValidation'
  | 'exchangeRateEnrichment'
  | 'basePriceCalculation'
  | 'loyaltyDiscount'
  | 'passengerTypeAdjustment'
  | 'taxAndFees'
  | 'currencyConversion';

export interface SeatClassMultipliers {
  economy: number;
  business: number;
  first: number;
}

export interface LoyaltyDiscountRates {
  bronze: number;
  silver: number;
  gold: number;
}

export interface PassengerTypeAdjustmentRates {
  child: number;
  senior: number;
  adult: number;
}

export interface PassengerTypeThresholds {
  /** Edad estrictamente menor a este valor => 'child'. */
  childMaxAge: number;
  /** Edad estrictamente mayor a este valor => 'senior'. */
  seniorMinAge: number;
}

export interface TaxAndFeesParams {
  /** Fracción [0,1] aplicada sobre pricing.subtotal (post-descuentos) — design-decisions.md §2. */
  taxRate: number;
  /** Monto fijo por reserva. */
  airportFee: number;
  /** Fracción [0,1] aplicada sobre pricing.basePrice (pre-descuentos) — design-decisions.md §2. */
  fuelSurchargeRate: number;
}

export interface ExchangeRateParams {
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  /** Moneda base desde la que se cotiza (el precio de lista está en USD — CONSIGNA.md). */
  baseCurrency: string;
}

/**
 * Config genérica de un filtro: si está habilitado, más sus parámetros propios (si los tiene).
 * El orquestador (Pipeline) solo lee `enabled` — nunca mira `params`, eso es responsabilidad
 * de cada filtro. Ver docs/architecture.md §3.
 */
export interface FilterConfigEntry<TParams = Record<string, never>> {
  enabled: boolean;
  params: TParams;
}

export interface PipelineFiltersConfig {
  passengerValidation: FilterConfigEntry<{ thresholds: PassengerTypeThresholds }>;
  flightValidation: FilterConfigEntry<Record<string, never>>;
  exchangeRateEnrichment: FilterConfigEntry<ExchangeRateParams>;
  basePriceCalculation: FilterConfigEntry<{ multipliers: SeatClassMultipliers }>;
  loyaltyDiscount: FilterConfigEntry<{ rates: LoyaltyDiscountRates }>;
  /** Solo las tasas: el tipo de pasajero (child/senior/adult) ya viene derivado en
   * context.metadata.passengerTypeApplied por PassengerValidationFilter (filtro 1), que es
   * quien posee los `thresholds` — este filtro no vuelve a derivar la edad. */
  passengerTypeAdjustment: FilterConfigEntry<{ rates: PassengerTypeAdjustmentRates }>;
  taxAndFees: FilterConfigEntry<TaxAndFeesParams>;
  currencyConversion: FilterConfigEntry<Record<string, never>>;
}

export interface PipelineConfig {
  filters: PipelineFiltersConfig;
  /** Tabla de tasas de cambio de fallback (moneda ISO -> tasa respecto a baseCurrency),
   * usada por ExchangeRateEnrichmentFilter cuando la API externa falla tras los reintentos.
   * Ver docs/architecture.md §6. */
  exchangeRateFallback: Record<string, number>;
}

/** Deep partial genérico, usado para el body de PUT /pipeline/config (merge parcial). */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;
