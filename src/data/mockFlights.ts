/**
 * Datos mock de vuelos. Ver docs/architecture.md §10 y docs/testing-plan.md.
 * Cada registro está documentado con el caso de prueba que cubre.
 */

import type { FlightRecord } from '../types/flight.types';

export const mockFlights: FlightRecord[] = [
  // Caso de prueba: Vuelo regular con asientos disponibles y destino US (dólares)
  // Utilizado para: Flujo básico de reserva exitoso, pricing en USD
  {
    code: 'FL-US-001',
    origin: 'EZE',
    destination: 'MIA',
    destinationCountry: 'US',
    departureDate: '2030-05-15T14:00:00.000Z', // Fecha futura garantizada
    availableSeats: 45,
    basePriceUSD: 100, // Usado como base estándar ($100) en los ejemplos de cálculo
  },

  // Caso de prueba: Vuelo regular con asientos disponibles y destino AR (pesos argentinos)
  // Utilizado para: Test de conversión de moneda a ARS (filtro 3a/3b)
  {
    code: 'FL-AR-002',
    origin: 'MIA',
    destination: 'EZE',
    destinationCountry: 'AR',
    departureDate: '2030-06-20T08:30:00.000Z',
    availableSeats: 120,
    basePriceUSD: 150,
  },

  // Caso de prueba: Vuelo regular con asientos disponibles y destino BR (reales brasileños)
  // Utilizado para: Test de conversión de moneda a BRL (filtro 3a/3b)
  {
    code: 'FL-BR-003',
    origin: 'EZE',
    destination: 'GIG',
    destinationCountry: 'BR',
    departureDate: '2030-07-10T18:00:00.000Z',
    availableSeats: 30,
    basePriceUSD: 120,
  },

  // Caso de prueba: Vuelo regular con asientos disponibles y destino EU (euros)
  // Utilizado para: Test de conversión de moneda a EUR (filtro 3a/3b)
  {
    code: 'FL-EU-004',
    origin: 'EZE',
    destination: 'MAD',
    destinationCountry: 'EU',
    departureDate: '2030-08-01T22:00:00.000Z',
    availableSeats: 80,
    basePriceUSD: 300,
  },

  // Caso de prueba: Vuelo sin asientos disponibles (availableSeats: 0)
  // Utilizado para: Rechazo en FlightValidationFilter por falta de disponibilidad (error FLIGHT_NO_AVAILABILITY)
  {
    code: 'FL-NO-SEATS',
    origin: 'EZE',
    destination: 'MIA',
    destinationCountry: 'US',
    departureDate: '2030-09-15T10:00:00.000Z',
    availableSeats: 0,
    basePriceUSD: 200,
  },

  // Caso de prueba: Vuelo con fecha de salida pasada
  // Utilizado para: Rechazo en FlightValidationFilter por fecha no futura (error FLIGHT_DATE_NOT_FUTURE)
  {
    code: 'FL-PAST-DATE',
    origin: 'EZE',
    destination: 'MIA',
    destinationCountry: 'US',
    departureDate: '2020-01-01T12:00:00.000Z', // Fecha pasada
    availableSeats: 50,
    basePriceUSD: 100,
  },
];

/**
 * Helper para buscar un vuelo mock por código.
 */
export function findMockFlight(code: string): FlightRecord | undefined {
  return mockFlights.find((f) => f.code === code);
}

