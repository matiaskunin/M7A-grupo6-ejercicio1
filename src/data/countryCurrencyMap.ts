/**
 * Mapeo de códigos de país (ISO 3166-1 alpha-2 / alias regionales como "EU") a códigos de moneda (ISO 4217).
 * Ver CONSIGNA.md "Detección de Moneda por País" y docs/architecture.md §5.
 */

export const countryCurrencyMap: Record<string, string> = {
  AR: 'ARS',
  BR: 'BRL',
  US: 'USD',
  EU: 'EUR',
  ES: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  IT: 'EUR',
  GB: 'GBP',
  UY: 'UYU',
  CL: 'CLP',
  CO: 'COP',
  MX: 'MXN',
  PE: 'PEN',
};

/**
 * Obtiene el código de moneda correspondiente a un código de país.
 * Si no se encuentra el país o viene indefinido/vacío, devuelve 'USD' por defecto.
 */
export function getCurrencyForCountry(countryCode?: string): string {
  if (!countryCode) {
    return 'USD';
  }
  const normalized = countryCode.trim().toUpperCase();
  return countryCurrencyMap[normalized] ?? 'USD';
}
