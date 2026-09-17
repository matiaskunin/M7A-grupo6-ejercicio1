/**
 * Filtro 1: Validación de Pasajero.
 * Ver docs/architecture.md §5 y docs/design-decisions.md §4.
 *
 * Responsabilidades:
 *  - Verificar que el pasajero existe en el repositorio (mock o inyectado).
 *  - Verificar que el pasajero está activo.
 *  - Validar información de contacto (email válido y teléfono).
 *  - Derivar la edad real desde `birthDate` y clasificar en child / senior / adult según thresholds.
 *  - Cotejar contra `declaredPassengerType` y agregar warning en caso de discrepancia (sin rechazar).
 *  - Guardar el pasajero en `context.passenger` y fijar `metadata.passengerTypeApplied` y `metadata.loyaltyTier`.
 */

import type { Filter } from './Filter';
import type { ReservationContext } from '../types/reservation.types';
import type { PassengerRecord } from '../types/passenger.types';
import type { PassengerTypeApplied } from '../types/reservation.types';
import type { PipelineConfig } from '../types/pipeline.types';
import { mockPassengers } from '../data/mockPassengers';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class PassengerValidationFilter implements Filter {
  public readonly name = 'passengerValidation' as const;

  constructor(private readonly passengers: PassengerRecord[] = mockPassengers) {}

  public async execute(
    context: ReservationContext,
    config: PipelineConfig,
  ): Promise<ReservationContext> {
    const passengerId = context.originalRequest.passengerId;
    const passenger = this.passengers.find((p) => p.id === passengerId);

    // 1. Verificar existencia
    if (!passenger) {
      context.status = 'rejected';
      context.errors.push({
        filter: this.name,
        code: 'PASSENGER_NOT_FOUND',
        message: `Pasajero con ID "${passengerId}" no encontrado.`,
      });
      return context;
    }

    // 2. Verificar que esté activo
    if (!passenger.isActive) {
      context.status = 'rejected';
      context.errors.push({
        filter: this.name,
        code: 'PASSENGER_INACTIVE',
        message: `El pasajero "${passenger.name}" (ID: ${passenger.id}) no está activo.`,
      });
      return context;
    }

    // 3. Validar información de contacto
    const { contactInfo } = passenger;
    const hasValidEmail =
      Boolean(contactInfo?.email) && EMAIL_REGEX.test(contactInfo.email.trim());
    const hasValidPhone =
      Boolean(contactInfo?.phone) && contactInfo.phone.trim().length >= 5;

    if (!hasValidEmail || !hasValidPhone) {
      context.status = 'rejected';
      context.errors.push({
        filter: this.name,
        code: 'INVALID_CONTACT_INFO',
        message: `Información de contacto inválida para el pasajero "${passenger.name}". Se requiere email y teléfono válidos.`,
      });
      return context;
    }

    // 4. Derivar edad real desde birthDate
    const refDate = new Date(context.processingStartedAt || Date.now());
    const birthDate = new Date(passenger.birthDate);
    let age = refDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = refDate.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < birthDate.getDate())) {
      age--;
    }

    const { childMaxAge, seniorMinAge } =
      config.filters.passengerValidation.params.thresholds;

    let derivedType: PassengerTypeApplied = 'adult';
    if (age < childMaxAge) {
      derivedType = 'child';
    } else if (age > seniorMinAge) {
      derivedType = 'senior';
    }

    // Guardar en el contexto para los siguientes filtros
    context.passenger = passenger;
    context.metadata.passengerTypeApplied = derivedType;
    context.metadata.loyaltyTier = passenger.loyaltyTier;

    // 5. Comparar declaredPassengerType vs derivedType (agrega warning si no coincide, no rechaza)
    const declared = context.originalRequest.declaredPassengerType;
    if (declared && declared !== derivedType) {
      context.warnings.push({
        filter: this.name,
        code: 'PASSENGER_TYPE_MISMATCH',
        message: `El tipo de pasajero declarado "${declared}" no coincide con el tipo derivado de la edad "${derivedType}" (edad: ${age}). Se utilizará el tipo derivado.`,
      });
    }

    return context;
  }
}

