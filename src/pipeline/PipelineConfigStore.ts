/**
 * Singleton en memoria de PipelineConfig. Ver docs/architecture.md §7.
 *
 * Limitación documentada: al ser un singleton en memoria de un solo proceso, la config no
 * persiste entre reinicios del servidor ni se comparte entre instancias. Suficiente para el
 * alcance de este ejercicio.
 */

import type { DeepPartial, PipelineConfig } from '../types/pipeline.types';
import { defaultPipelineConfig } from '../config/defaultPipelineConfig';
import { pipelineConfigPartialSchema } from '../schemas/pipelineConfig.schema';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merge profundo genérico: todo lo que venga en `patch` pisa a `base`, recursivamente para
 * objetos planos; cualquier otro valor (array, primitivo) reemplaza directo. */
function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch === undefined ? base : (patch as unknown as T);
  }

  const merged: Record<string, unknown> = { ...base };

  for (const key of Object.keys(patch)) {
    const patchValue = (patch as Record<string, unknown>)[key];
    if (patchValue === undefined) continue;

    const baseValue = (base as Record<string, unknown>)[key];
    merged[key] =
      isPlainObject(baseValue) && isPlainObject(patchValue)
        ? deepMerge(baseValue, patchValue as DeepPartial<typeof baseValue>)
        : patchValue;
  }

  return merged as T;
}

export class PipelineConfigStore {
  private config: PipelineConfig;

  constructor(initialConfig: PipelineConfig = defaultPipelineConfig) {
    this.config = initialConfig;
  }

  getConfig(): PipelineConfig {
    return this.config;
  }

  /**
   * Aplica un merge parcial (deep partial) sobre el singleton, validado con zod (rangos:
   * porcentajes en [0,1], montos >= 0 — pipelineConfig.schema.ts). Usado por
   * PUT /pipeline/config.
   */
  updateConfig(patch: unknown): PipelineConfig {
    const parsedPatch = pipelineConfigPartialSchema.parse(patch) as DeepPartial<PipelineConfig>;
    this.config = deepMerge(this.config, parsedPatch);
    return this.config;
  }

  /**
   * Igual que updateConfig, pero no toca el singleton: devuelve la config resultante de
   * mezclar `patch` sobre la config actual, para el `config` opcional de
   * POST /reservations/process (aplica solo a esa corrida puntual).
   */
  resolveEffectiveConfig(patch: unknown): PipelineConfig {
    if (patch === undefined) return this.config;
    const parsedPatch = pipelineConfigPartialSchema.parse(patch) as DeepPartial<PipelineConfig>;
    return deepMerge(this.config, parsedPatch);
  }

  /** Solo para tests: resetea el singleton a un valor conocido. */
  resetForTests(config: PipelineConfig = defaultPipelineConfig): void {
    this.config = config;
  }
}

export const pipelineConfigStore = new PipelineConfigStore();
