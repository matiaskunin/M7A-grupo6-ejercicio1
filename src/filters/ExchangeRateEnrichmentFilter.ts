/**
 * Filtro 3a: Enriquecimiento con API de tipo de cambio.
 * Corre en la posición 3 (antes de pricing). Mapea el país de destino a moneda local,
 * obtiene la tasa de cambio vigente (con cache, retry, timeout y fallback) y la guarda
 * en context.metadata.exchangeRate. No modifica precios ni rechaza la reserva.
 * Ver CONSIGNA.md "Filtro de Enriquecimiento", docs/architecture.md §4, §5 y §6.
 */

import type { Filter } from './Filter';
import type { ReservationContext } from '../types/reservation.types';
import type { PipelineConfig } from '../types/pipeline.types';
import { getCurrencyForCountry } from '../data/countryCurrencyMap';
import {
  type ExchangeRateProvider,
  defaultExchangeRateProvider,
} from '../services/ExchangeRateProvider';

export class ExchangeRateEnrichmentFilter implements Filter {
  readonly name = 'exchangeRateEnrichment' as const;

  constructor(
    private readonly provider: ExchangeRateProvider = defaultExchangeRateProvider,
  ) {}

  async execute(
    context: ReservationContext,
    config: PipelineConfig,
  ): Promise<ReservationContext> {
    // Si la reserva ya fue rechazada o cancelada por un filtro previo, no procesar
    if (context.status !== 'pending') {
      return context;
    }

    const filterConfig = config.filters.exchangeRateEnrichment;
    const params = filterConfig?.params ?? {
      baseCurrency: 'USD',
      timeoutMs: 5000,
      maxRetries: 3,
      cacheTtlMs: 3600000,
    };

    const baseCurrency = params.baseCurrency || 'USD';
    const destinationCountry = context.flight?.destinationCountry;

    // Validación defensiva si no se cargó vuelo o destino previo
    let targetCurrency: string;
    if (!destinationCountry) {
      targetCurrency = 'USD';
      context.warnings.push({
        filter: this.name,
        code: 'MISSING_DESTINATION_COUNTRY',
        message: 'No se encontró país de destino en los datos del vuelo. Se utiliza USD como moneda objetivo.',
      });
    } else {
      targetCurrency = getCurrencyForCountry(destinationCountry);
    }

    const { rate, source } = await this.provider.getRate(
      baseCurrency,
      targetCurrency,
      {
        timeoutMs: params.timeoutMs,
        maxRetries: params.maxRetries,
        cacheTtlMs: params.cacheTtlMs,
        fallbackRates: config.exchangeRateFallback,
      },
    );

    if (source === 'fallback') {
      context.warnings.push({
        filter: this.name,
        code: 'EXCHANGE_RATE_FALLBACK_APPLIED',
        message: `No se pudo obtener cotización en vivo para ${targetCurrency}. Se utilizó la tasa de cambio de fallback (${rate}).`,
      });
    }

    context.metadata.exchangeRate = {
      rate,
      base: baseCurrency,
      target: targetCurrency,
      fetchedAt: new Date().toISOString(),
      source,
    };

    return context;
  }
}
