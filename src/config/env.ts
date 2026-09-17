/**
 * Lectura de variables de entorno. No usa una librería externa (dotenv) a propósito: en dev
 * se puede cargar con `node -r dotenv/config` o similar si hace falta, pero el contrato de
 * esta app es no depender de que el .env se haya cargado para poder correr los tests.
 */

export type NodeEnv = 'development' | 'test' | 'production';

export interface EnvConfig {
  port: number;
  nodeEnv: NodeEnv;
}

function parsePort(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
}

function parseNodeEnv(raw: string | undefined): NodeEnv {
  return raw === 'production' || raw === 'test' ? raw : 'development';
}

export function readEnv(): EnvConfig {
  return {
    port: parsePort(process.env.PORT),
    nodeEnv: parseNodeEnv(process.env.NODE_ENV),
  };
}

export const env: EnvConfig = readEnv();
