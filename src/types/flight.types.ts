/**
 * Tipos del vuelo. Ver docs/architecture.md §8.
 */

export interface FlightRecord {
  code: string;
  origin: string;
  destination: string;
  /** Código de país ISO del destino (ej. "AR", "BR", "US", "EU") — lo usa el filtro 3a
   * (ExchangeRateEnrichmentFilter) para mapear a la moneda local. */
  destinationCountry: string;
  /** ISO date/datetime de salida. */
  departureDate: string;
  availableSeats: number;
  basePriceUSD: number;
}
