/**
 * Middleware genérico de validación zod del body. Ver docs/architecture.md §9 y §10.
 *
 * Cubre el caso "reserva con datos malformados" del enunciado: el 400 se devuelve ACÁ, antes
 * de que la request entre al pipeline. Los filtros nunca ven un body inválido.
 *
 * El schema parseado reemplaza a `req.body`, así el controller trabaja con el tipo inferido de
 * zod y no con `unknown`.
 */

import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';

/** Forma estable del 400 de validación: un `issues[]` con la ruta exacta de cada campo. */
export function formatZodError(error: ZodError): {
  error: string;
  message: string;
  issues: { path: string; message: string }[];
} {
  return {
    error: 'VALIDATION_ERROR',
    message: 'El body de la request no cumple el contrato esperado.',
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json(formatZodError(parsed.error));
      return;
    }

    req.body = parsed.data;
    next();
  };
}
