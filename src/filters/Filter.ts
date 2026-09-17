/**
 * Contrato que implementan los 8 filtros de código. Ver docs/architecture.md §2.
 *
 * Reglas que todo filtro debe respetar:
 *  - No lanza excepciones por fallas de negocio esperadas ("pasajero no existe", "vuelo sin
 *    asientos", "API de tipo de cambio caída"): esas se representan en context.errors /
 *    context.warnings, nunca como un throw. Solo lanza si hay un bug real — el orquestador
 *    (Pipeline) lo atrapa y lo convierte en status: 'error' para esa reserva puntual.
 *  - Es invocable de forma aislada: un test unitario arma un ReservationContext a mano (sin
 *    haber corrido los filtros anteriores) y llama a execute() directamente. Cada filtro valida
 *    defensivamente los campos que necesita, no asume que un filtro anterior los dejó válidos.
 *  - Solo los filtros 1 (PassengerValidationFilter) y 2 (FlightValidationFilter) pueden poner
 *    context.status = 'rejected'. Los demás, como mucho, agregan warnings.
 */

import type { ReservationContext } from '../types/reservation.types';
import type { FilterName, PipelineConfig } from '../types/pipeline.types';

export interface Filter {
  readonly name: FilterName;
  execute(context: ReservationContext, config: PipelineConfig): Promise<ReservationContext>;
}
