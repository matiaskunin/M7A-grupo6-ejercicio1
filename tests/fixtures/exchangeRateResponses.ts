/**
 * Cargas útiles mock de la API de ExchangeRate-API para pruebas unitarias.
 * Ver CONSIGNA.md "ExchangeRate-API" y docs/testing-plan.md.
 */

export const mockUsdExchangeRatesResponse = {
  provider: 'https://www.exchangerate-api.com',
  base: 'USD',
  date: '2026-09-17',
  time_last_updated: 1726569600,
  rates: {
    USD: 1,
    ARS: 980.5,
    BRL: 5.35,
    EUR: 0.91,
    GBP: 0.77,
    UYU: 40.2,
    CLP: 935.0,
  },
};

export const mockMalformedExchangeRatesResponse = {
  provider: 'https://www.exchangerate-api.com',
  base: 'USD',
  // Falta campo rates
};
