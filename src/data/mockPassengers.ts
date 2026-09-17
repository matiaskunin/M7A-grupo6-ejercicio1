/**
 * Datos mock de pasajeros. Ver docs/architecture.md §10 y docs/testing-plan.md.
 * Cada registro está documentado con el caso de prueba que cubre.
 */

import type { PassengerRecord } from '../types/passenger.types';

export const mockPassengers: PassengerRecord[] = [
  // Caso de prueba: Pasajero activo, adulto, sin tier de lealtad (none)
  // Utilizado para: Flujo básico de reserva y cálculo de precio base sin descuentos (CONSIGNA.md "Reserva economy sin descuentos")
  {
    id: 'PASS-ADULT-NONE',
    name: 'Juan Perez',
    isActive: true,
    birthDate: '1990-05-15', // Adulto (~34-36 años)
    contactInfo: {
      email: 'juan.perez@example.com',
      phone: '+5491112345678',
    },
    loyaltyTier: 'none',
  },

  // Caso de prueba: Pasajero activo, adulto, con tier de lealtad Bronze (5% descuento)
  // Utilizado para: Filtro de lealtad con tier intermedio
  {
    id: 'PASS-ADULT-BRONZE',
    name: 'Maria Gomez',
    isActive: true,
    birthDate: '1988-11-20', // Adulto (~36-38 años)
    contactInfo: {
      email: 'maria.gomez@example.com',
      phone: '+5491187654321',
    },
    loyaltyTier: 'bronze',
  },

  // Caso de prueba: Pasajero activo, adulto, con tier de lealtad Silver (10% descuento)
  // Utilizado para: Filtro de lealtad con tier intermedio
  {
    id: 'PASS-ADULT-SILVER',
    name: 'Carlos Sanchez',
    isActive: true,
    birthDate: '1985-03-10', // Adulto (~39-41 años)
    contactInfo: {
      email: 'carlos.sanchez@example.com',
      phone: '+5491155554444',
    },
    loyaltyTier: 'silver',
  },

  // Caso de prueba: Pasajero activo, adulto, con tier de lealtad Gold (15% descuento)
  // Utilizado para: Caso "Pasajero Gold con descuento por lealtad" (testing-plan.md)
  {
    id: 'PASS-ADULT-GOLD',
    name: 'Laura Rodriguez',
    isActive: true,
    birthDate: '1982-07-25', // Adulto (~42-44 años)
    contactInfo: {
      email: 'laura.rodriguez@example.com',
      phone: '+5491199998888',
    },
    loyaltyTier: 'gold',
  },

  // Caso de prueba: Pasajero inactivo (isActive: false)
  // Utilizado para: Rechazo en PassengerValidationFilter por pasajero inactivo (error PASSENGER_INACTIVE)
  {
    id: 'PASS-INACTIVE',
    name: 'Roberto Bloqueado',
    isActive: false,
    birthDate: '1975-01-12',
    contactInfo: {
      email: 'roberto.bloqueado@example.com',
      phone: '+5491122223333',
    },
    loyaltyTier: 'none',
  },

  // Caso de prueba: Pasajero niño (edad < 12 años) con tier Gold
  // Utilizado para: Caso "Niño en clase business con descuentos combinados" ($250 -> $212.50 -> $159.375)
  // y para verificar derivación de passengerTypeApplied = 'child'
  {
    id: 'PASS-CHILD-GOLD',
    name: 'Lucas Martinez',
    isActive: true,
    birthDate: '2018-04-10', // Niño (< 12 años)
    contactInfo: {
      email: 'padre.lucas@example.com',
      phone: '+5491177776666',
    },
    loyaltyTier: 'gold',
  },

  // Caso de prueba: Pasajero senior (edad > 65 años) con tier Silver
  // Utilizado para: Caso "Senior en primera clase con múltiples ajustes" (testing-plan.md)
  // y para verificar derivación de passengerTypeApplied = 'senior'
  {
    id: 'PASS-SENIOR-SILVER',
    name: 'Antonio Fernandez',
    isActive: true,
    birthDate: '1950-09-05', // Senior (> 65 años)
    contactInfo: {
      email: 'antonio.fernandez@example.com',
      phone: '+5491144443333',
    },
    loyaltyTier: 'silver',
  },

  // Caso de prueba: Pasajero con información de contacto inválida (email malformado)
  // Utilizado para: Validación de contacto en PassengerValidationFilter (error INVALID_CONTACT_INFO)
  {
    id: 'PASS-INVALID-CONTACT',
    name: 'Contacto Invalido',
    isActive: true,
    birthDate: '1995-12-01',
    contactInfo: {
      email: 'email-invalido-sin-arroba',
      phone: '',
    },
    loyaltyTier: 'none',
  },
];

/**
 * Helper para buscar un pasajero mock por id.
 */
export function findMockPassenger(id: string): PassengerRecord | undefined {
  return mockPassengers.find((p) => p.id === id);
}

