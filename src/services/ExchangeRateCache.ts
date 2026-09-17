/**
 * Cache en memoria para tasas de cambio con TTL configurable y soporte para deduplicación
 * de peticiones concurrentes en vuelo (in-flight request coalescing).
 * Ver CONSIGNA.md "Caching de Tasas", docs/architecture.md §6 y docs/design-decisions.md §5.
 */

interface CacheEntry {
  rate: number;
  expiresAt: number;
}

export class ExchangeRateCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlightRequests = new Map<string, Promise<number>>();

  private buildKey(base: string, target: string): string {
    return `${base.trim().toUpperCase()}_${target.trim().toUpperCase()}`;
  }

  /**
   * Retorna la tasa si existe en memoria y no ha expirado.
   * Si expiró, elimina la entrada y devuelve null.
   */
  get(base: string, target: string): number | null {
    const key = this.buildKey(base, target);
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }

    return entry.rate;
  }

  /**
   * Guarda una tasa en memoria con el tiempo de vida (TTL) en milisegundos especificado.
   */
  set(base: string, target: string, rate: number, ttlMs: number): void {
    const key = this.buildKey(base, target);
    this.entries.set(key, {
      rate,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Recupera la tasa desde el cache si está vigente.
   * Si no está en cache y ya hay una llamada en curso para el mismo par de monedas,
   * se acopla a la misma promesa en vuelo (deduplicación).
   * Si no hay llamada en curso, ejecuta el fetcher, guarda el resultado en cache y resuelve.
   */
  async getOrFetch(
    base: string,
    target: string,
    ttlMs: number,
    fetcher: () => Promise<number>,
  ): Promise<{ rate: number; isCache: boolean }> {
    const cached = this.get(base, target);
    if (cached !== null) {
      return { rate: cached, isCache: true };
    }

    const key = this.buildKey(base, target);
    const inFlight = this.inFlightRequests.get(key);
    if (inFlight) {
      const rate = await inFlight;
      return { rate, isCache: false };
    }

    const requestPromise = (async () => {
      try {
        const rate = await fetcher();
        this.set(base, target, rate, ttlMs);
        return rate;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, requestPromise);
    const rate = await requestPromise;
    return { rate, isCache: false };
  }

  /**
   * Invalida una entrada específica.
   */
  delete(base: string, target: string): boolean {
    return this.entries.delete(this.buildKey(base, target));
  }

  /**
   * Invalida todo el cache en memoria y cancela tracking de in-flight requests.
   */
  clear(): void {
    this.entries.clear();
    this.inFlightRequests.clear();
  }

  /**
   * Devuelve la cantidad de entradas vigentes y no vigentes almacenadas.
   */
  size(): number {
    return this.entries.size;
  }
}
