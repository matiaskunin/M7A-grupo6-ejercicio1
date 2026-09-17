/**
 * Filtro 3b: Conversión de moneda a la divisa local del destino.
 * Corre al final del pipeline (después de TaxAndFeesFilter). Toma el total final calculado
 * en USD y la tasa de cambio obtenida por ExchangeRateEnrichmentFilter, y fija
 * pricing.currency y pricing.totalConverted.
 * Ver CONSIGNA.md "Conversión de Precios", docs/architecture.md §4, §5 y §8.
 */

import type { Filter } from './Filter';
import type { ReservationContext } from '../types/reservation.types';
import type { PipelineConfig } from '../types/pipeline.types';

export class CurrencyConversionFilter implements Filter {
  readonly name = 'currencyConversion' as const;

  async execute(
    context: ReservationContext,
    _config: PipelineConfig,
  ): Promise<ReservationContext> {
    if (context.status !== 'pending') {
      return context;
    }

    const { pricing, metadata } = context;

    // Validación defensiva: verificar que totalUSD exista
    if (typeof pricing.totalUSD !== 'number') {
      context.warnings.push({
        filter: this.name,
        code: 'MISSING_TOTAL_USD',
        message: 'No se encontró totalUSD calculado en el pricing para aplicar la conversión de moneda.',
      });
      return context;
    }

    // Validación defensiva: verificar que se haya enriquecido la tasa de cambio
    const exchangeRate = metadata.exchangeRate;
    if (!exchangeRate || typeof exchangeRate.rate !== 'number') {
      pricing.currency = 'USD';
      pricing.totalConverted = pricing.totalUSD;
      context.warnings.push({
        filter: this.name,
        code: 'MISSING_EXCHANGE_RATE',
        message: 'No se encontró tasa de cambio en metadata. La reserva permanece en USD.',
      });
      return context;
    }

    // Conversión a divisa destino con redondeo financiero estándar a 2 decimales
    const converted = Math.round(pricing.totalUSD * exchangeRate.rate * 100) / 100;

    pricing.currency = exchangeRate.target;
    pricing.totalConverted = converted;

    return context;
  }
}
