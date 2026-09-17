/**
 * Tasas de cambio de fallback frente a USD por defecto.
 * Utilizadas cuando la API externa no responde o falla tras los reintentos permitidos.
 * Ver CONSIGNA.md "Manejo de Errores", docs/architecture.md §6 y docs/design-decisions.md §3.
 */

export const defaultExchangeRates: Record<string, number> = {
  USD: 1,
  ARS: 1000,
  BRL: 5.4,
  EUR: 0.92,
  GBP: 0.78,
  UYU: 40.5,
  CLP: 940,
  COP: 4100,
  MXN: 18.5,
  PEN: 3.75,
};
