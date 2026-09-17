/**
 * Tests unitarios para ExchangeRateCache.
 * Ver docs/testing-plan.md "Uso de cache de tasas de cambio".
 */

import { ExchangeRateCache } from '../../../src/services/ExchangeRateCache';

describe('ExchangeRateCache', () => {
  let cache: ExchangeRateCache;

  beforeEach(() => {
    cache = new ExchangeRateCache();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('devuelve null si no existe la entrada en cache', () => {
    expect(cache.get('USD', 'ARS')).toBeNull();
  });

  it('guarda y recupera una tasa antes de que expire el TTL', () => {
    cache.set('USD', 'ARS', 950, 3600000);
    expect(cache.get('USD', 'ARS')).toBe(950);
  });

  it('ignora mayúsculas/minúsculas y espacios en las claves', () => {
    cache.set('usd ', ' ars', 950, 3600000);
    expect(cache.get('USD', 'ARS')).toBe(950);
    expect(cache.get('usd', 'ars')).toBe(950);
  });

  it('invalida la entrada una vez transcurrido el TTL', () => {
    jest.useFakeTimers();
    cache.set('USD', 'ARS', 950, 1000); // TTL 1s

    expect(cache.get('USD', 'ARS')).toBe(950);

    // Avanza el tiempo 1.5s
    jest.advanceTimersByTime(1500);

    expect(cache.get('USD', 'ARS')).toBeNull();
  });

  it('permite eliminar una entrada puntual con delete()', () => {
    cache.set('USD', 'ARS', 950, 3600000);
    cache.set('USD', 'BRL', 5.3, 3600000);

    expect(cache.delete('USD', 'ARS')).toBe(true);
    expect(cache.get('USD', 'ARS')).toBeNull();
    expect(cache.get('USD', 'BRL')).toBe(5.3);
  });

  it('limpia todas las entradas con clear()', () => {
    cache.set('USD', 'ARS', 950, 3600000);
    cache.set('USD', 'EUR', 0.9, 3600000);

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get('USD', 'ARS')).toBeNull();
    expect(cache.get('USD', 'EUR')).toBeNull();
  });

  describe('getOrFetch y deduplicación concurrente (in-flight request coalescing)', () => {
    it('retorna la tasa en cache directamente sin invocar al fetcher', async () => {
      cache.set('USD', 'EUR', 0.92, 3600000);
      const fetcher = jest.fn();

      const result = await cache.getOrFetch('USD', 'EUR', 3600000, fetcher);

      expect(result).toEqual({ rate: 0.92, isCache: true });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('invoca al fetcher y almacena la tasa si no está en cache', async () => {
      const fetcher = jest.fn().mockResolvedValue(980);

      const result = await cache.getOrFetch('USD', 'ARS', 3600000, fetcher);

      expect(result).toEqual({ rate: 980, isCache: false });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(cache.get('USD', 'ARS')).toBe(980);
    });

    it('deduplica peticiones concurrentes para el mismo par de monedas (un solo fetch)', async () => {
      let resolvePromise!: (val: number) => void;
      const fetcher = jest.fn().mockImplementation(() => {
        return new Promise<number>((resolve) => {
          resolvePromise = resolve;
        });
      });

      // Se lanzan dos llamadas simultáneas
      const call1 = cache.getOrFetch('USD', 'BRL', 3600000, fetcher);
      const call2 = cache.getOrFetch('USD', 'BRL', 3600000, fetcher);

      expect(fetcher).toHaveBeenCalledTimes(1);

      // Resuelve la petición en vuelo
      resolvePromise(5.42);

      const [res1, res2] = await Promise.all([call1, call2]);

      expect(res1).toEqual({ rate: 5.42, isCache: false });
      expect(res2).toEqual({ rate: 5.42, isCache: false });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(cache.get('USD', 'BRL')).toBe(5.42);
    });

    it('propaga el error y limpia la entrada in-flight si el fetcher falla', async () => {
      const fetcher = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(cache.getOrFetch('USD', 'EUR', 3600000, fetcher)).rejects.toThrow('Network error');

      // Si se intenta de nuevo, el fetcher vuelve a llamarse (no queda bloqueado)
      fetcher.mockResolvedValueOnce(0.95);
      const retryResult = await cache.getOrFetch('USD', 'EUR', 3600000, fetcher);
      expect(retryResult.rate).toBe(0.95);
    });
  });
});
