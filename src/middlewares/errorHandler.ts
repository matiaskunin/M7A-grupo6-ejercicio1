/**
 * Catch-all de errores no controlados + 404 de ruta inexistente.
 * Ver docs/architecture.md §9 y §10.
 *
 * Va montado DESPUÉS de todas las rutas (ver src/app.ts). Express reconoce al errorHandler por
 * su aridad de 4 parámetros, por eso `_next` se declara aunque no se use.
 */

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { formatZodError } from './validateBody';

/** Error de negocio con status HTTP explícito, lanzado por los controllers (ej. 404). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** 404 para cualquier ruta no registrada. Se monta antes del errorHandler. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'ROUTE_NOT_FOUND',
    message: `No existe la ruta ${req.method} ${req.path}.`,
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }

  // Un ZodError que llegó hasta acá (ej. PipelineConfigStore.updateConfig parseando por su
  // cuenta) sigue siendo un problema del cliente, no del servidor: 400, no 500.
  if (err instanceof ZodError) {
    res.status(400).json(formatZodError(err));
    return;
  }

  // Body con JSON sintácticamente inválido: express.json() lanza un SyntaxError con `body`.
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: 'INVALID_JSON',
      message: 'El body de la request no es JSON válido.',
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error('[errorHandler] error no controlado:', message);
  res.status(500).json({ error: 'INTERNAL_ERROR', message });
}
