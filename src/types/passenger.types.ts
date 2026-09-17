/**
 * Tipos del pasajero. Ver docs/architecture.md §8.
 */

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'none';

export interface PassengerContactInfo {
  email: string;
  phone: string;
}

export interface PassengerRecord {
  id: string;
  name: string;
  isActive: boolean;
  /** ISO date. La edad (y por lo tanto el `passengerType`) siempre se deriva de acá,
   * nunca del valor que mande el cliente en el request — ver design-decisions.md §4. */
  birthDate: string;
  contactInfo: PassengerContactInfo;
  loyaltyTier: LoyaltyTier;
}
