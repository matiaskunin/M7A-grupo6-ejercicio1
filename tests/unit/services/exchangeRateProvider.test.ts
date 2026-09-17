/**
 * Tests unitarios para HttpExchangeRateProvider.
 * Ver docs/testing-plan.md "Integración con API de Tipo de Cambio" y "Casos de Error".
 */

import { HttpExchangeRateProvider } from '../../../src/services/ExchangeRateProvider';
import { mockUsdExchangeRatesResponse, mockMalformedExchangeRatesResponse } from '../../fixtures/exchangeRateResponses';

describe('HttpExchangeRateProvider', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    fetchSpy = jest.spyOn(global, 'fetch');
    // Silencia console.warn durante las pruebas de fallback
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('devuelve tasa 1 y source cache sin llamar a la API si base === target', async () => {
    const provider = new HttpExchangeRateProvider();
    const result = await provider.getRate('USD', 'USD');

    expect(result).toEqual({ rate: 1, source: 'cache' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('obtiene tasa live cuando la API responde 200 OK', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockUsdExchangeRatesResponse,
    } as Response);

    const provider = new HttpExchangeRateProvider();
    const result = await provider.getRate('USD', 'ARS');

    expect(result).toEqual({ rate: 980.5, source: 'live' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.exchangerate-api.com/v4/latest/USD',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('reutiliza la tasa en cache en una segunda consulta y no vuelve a llamar a la API', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockUsdExchangeRatesResponse,
    } as Response);

    const provider = new HttpExchangeRateProvider();

    const first = await provider.getRate('USD', 'EUR');
    expect(first).toEqual({ rate: 0.91, source: 'live' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await provider.getRate('USD', 'EUR');
    expect(second).toEqual({ rate: 0.91, source: 'cache' });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // No incrementó
  });

  it('vuelve a consultar la API cuando expira el TTL del cache', async () => {
    jest.useFakeTimers();

    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockUsdExchangeRatesResponse,
    } as Response);

    const provider = new HttpExchangeRateProvider({ cacheTtlMs: 3600000 });

    const first = await provider.getRate('USD', 'BRL');
    expect(first).toEqual({ rate: 5.35, source: 'live' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Avanza 1 hora y 1 minuto
    jest.advanceTimersByTime(3600000 + 60000);

    const second = await provider.getRate('USD', 'BRL');
    expect(second).toEqual({ rate: 5.35, source: 'live' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('reintenta hasta tener éxito si los primeros intentos fallan', async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error('Network drop 1'))
      .mockRejectedValueOnce(new Error('Network drop 2'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUsdExchangeRatesResponse,
      } as Response);

    const provider = new HttpExchangeRateProvider({ maxRetries: 3 });
    const result = await provider.getRate('USD', 'ARS');

    expect(result).toEqual({ rate: 980.5, source: 'live' });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('aplica fallback si la API devuelve error HTTP tras todos los reintentos', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const provider = new HttpExchangeRateProvider({ maxRetries: 3 });
    const result = await provider.getRate('USD', 'ARS');

    expect(result).toEqual({ rate: 1000, source: 'fallback' });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('aplica fallback si la API responde con un formato inesperado/malformado', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockMalformedExchangeRatesResponse,
    } as Response);

    const provider = new HttpExchangeRateProvider({ maxRetries: 2 });
    const result = await provider.getRate('USD', 'EUR');

    expect(result).toEqual({ rate: 0.92, source: 'fallback' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('aplica fallback con timeout a los 5s mediante AbortController', async () => {
    jest.useFakeTimers();

    fetchSpy.mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const provider = new HttpExchangeRateProvider({
      timeoutMs: 5000,
      maxRetries: 1,
    });

    const ratePromise = provider.getRate('USD', 'BRL');

    // Avanza el reloj virtual 5000ms
    jest.advanceTimersByTime(5000);

    const result = await ratePromise;

    expect(result).toEqual({ rate: 5.4, source: 'fallback' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
