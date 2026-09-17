/**
 * Proveedor de tasas de cambio con consulta a API pública, cache en memoria,
 * reintentos automáticos, timeout por AbortController y fallback ante fallos.
 * Ver CONSIGNA.md "Integración con API de Tipo de Cambio", docs/architecture.md §6 y docs/design-decisions.md §3.
 */

import { ExchangeRateCache } from './ExchangeRateCache';
import { defaultExchangeRates } from '../data/defaultExchangeRates';
import type { ExchangeRateSource } from '../types/reservation.types';

export interface RateResult {
  rate: number;
  source: ExchangeRateSource;
}

export interface ExchangeRateProviderOptions {
  cache?: ExchangeRateCache;
  fallbackRates?: Record<string, number>;
  timeoutMs?: number;
  maxRetries?: number;
  cacheTtlMs?: number;
  apiUrlBase?: string;
}

export interface ExchangeRateProvider {
  getRate(
    base: string,
    target: string,
    options?: {
      timeoutMs?: number;
      maxRetries?: number;
      cacheTtlMs?: number;
      fallbackRates?: Record<string, number>;
    },
  ): Promise<RateResult>;
  getCache(): ExchangeRateCache;
}

export class HttpExchangeRateProvider implements ExchangeRateProvider {
  private readonly cache: ExchangeRateCache;
  private readonly fallbackRates: Record<string, number>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly cacheTtlMs: number;
  private readonly apiUrlBase: string;

  constructor(options: ExchangeRateProviderOptions = {}) {
    this.cache = options.cache ?? new ExchangeRateCache();
    this.fallbackRates = options.fallbackRates ?? defaultExchangeRates;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.maxRetries = options.maxRetries ?? 3;
    this.cacheTtlMs = options.cacheTtlMs ?? 60 * 60 * 1000; // 1 hora
    this.apiUrlBase = options.apiUrlBase ?? 'https://api.exchangerate-api.com/v4/latest';
  }

  getCache(): ExchangeRateCache {
    return this.cache;
  }

  async getRate(
    base: string,
    target: string,
    options?: {
      timeoutMs?: number;
      maxRetries?: number;
      cacheTtlMs?: number;
      fallbackRates?: Record<string, number>;
    },
  ): Promise<RateResult> {
    const normBase = base.trim().toUpperCase();
    const normTarget = target.trim().toUpperCase();

    // Si la moneda destino es igual a la base, no requiere consulta a API ni conversión
    if (normBase === normTarget) {
      return { rate: 1, source: 'cache' };
    }

    const effectiveTtl = options?.cacheTtlMs ?? this.cacheTtlMs;
    const effectiveTimeout = options?.timeoutMs ?? this.timeoutMs;
    const effectiveRetries = options?.maxRetries ?? this.maxRetries;
    const effectiveFallbacks = options?.fallbackRates ?? this.fallbackRates;

    // 1. Verificar cache en memoria antes de cualquier operación
    const cachedRate = this.cache.get(normBase, normTarget);
    if (cachedRate !== null) {
      return { rate: cachedRate, source: 'cache' };
    }

    // 2. Ejecutar consulta con deduplicación de pedidos en vuelo y reintentos
    try {
      const { rate, isCache } = await this.cache.getOrFetch(
        normBase,
        normTarget,
        effectiveTtl,
        async () => {
          return await this.fetchWithRetry(
            normBase,
            normTarget,
            effectiveTimeout,
            effectiveRetries,
          );
        },
      );

      return {
        rate,
        source: isCache ? 'cache' : 'live',
      };
    } catch (error) {
      // 3. Fallback a tabla por defecto si la API falla o hace timeout tras los reintentos
      const fallbackRate =
        effectiveFallbacks[normTarget] ??
        this.fallbackRates[normTarget] ??
        1;

      console.warn(
        `[HttpExchangeRateProvider] Falló la obtención de tasa para ${normBase}->${normTarget}. Aplicando fallback (${fallbackRate}). Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return {
        rate: fallbackRate,
        source: 'fallback',
      };
    }
  }

  private async fetchWithRetry(
    base: string,
    target: string,
    timeoutMs: number,
    maxRetries: number,
  ): Promise<number> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const url = `${this.apiUrlBase}/${encodeURIComponent(base)}`;
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as { rates?: Record<string, number> };

        if (!data || typeof data !== 'object' || !data.rates) {
          throw new Error('Respuesta inválida de API: no contiene el objeto rates');
        }

        const rate = data.rates[target];
        if (typeof rate !== 'number') {
          throw new Error(`Moneda destino '${target}' no encontrada en la respuesta`);
        }

        return rate;
      } catch (err) {
        lastError = err;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError ?? new Error(`No se pudo obtener tasa para ${base}->${target} tras ${maxRetries} intentos`);
  }
}

/** Instancia singleton por defecto para ser consumida por los filtros */
export const defaultExchangeRateProvider: ExchangeRateProvider = new HttpExchangeRateProvider();
