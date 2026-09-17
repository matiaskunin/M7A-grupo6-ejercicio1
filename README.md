# M7A-grupo6-ejercicio1 — Sistema de Reservas de Vuelos (Pipes & Filters)

Backend en **Node.js + TypeScript + Express** que procesa reservas de vuelo a través de un
pipeline de filtros (patrón arquitectónico **Pipes & Filters**), según el enunciado en
[`CONSIGNA.md`](./CONSIGNA.md).

> **Estado actual: fase de diseño.** Este repositorio contiene la documentación de
> arquitectura y las decisiones de diseño ya acordadas por el equipo. El código fuente
> (TypeScript, tests, colección de Postman) todavía no fue escrito — se implementa en una
> etapa siguiente, sobre la base de estos documentos.

## Documentación

Antes de tocar código, leé esto en orden:

1. [`docs/architecture.md`](./docs/architecture.md) — cómo se aplica Pipes & Filters acá: el
   contrato de `Filter`, el orquestador del pipeline, el ciclo de vida de una reserva a través
   de los filtros, los tipos compartidos y los endpoints.
2. [`docs/design-decisions.md`](./docs/design-decisions.md) — las decisiones de negocio que
   el enunciado dejaba ambiguas (cómo se combinan los descuentos, sobre qué base se calculan
   los impuestos, qué API de tipo de cambio se usa, cómo se determina el tipo de pasajero) y
   por qué se resolvieron así.
3. [`docs/testing-plan.md`](./docs/testing-plan.md) — qué test (unitario o de integración) va
   a cubrir cada caso de prueba pedido por el enunciado.
4. [`docs/diagrams/`](./docs/diagrams/) — diagramas de arquitectura y de flujo del pipeline.

## Resumen de la arquitectura

Cada reserva del array de entrada pasa, de forma independiente, por una cadena ordenada de
filtros. Cada filtro tiene una única responsabilidad, recibe el contexto de la reserva, lo
transforma y lo pasa al siguiente — o corta la cadena si la reserva debe rechazarse.

```
Validar          Validar        Enriquecer          Calcular   Descuento   Ajuste por   Impuestos   Convertir
pasajero    →     vuelo     →   tipo de cambio  →    precio  →  lealtad  →  tipo pas.  →  y tasas  →  moneda
(filtro 1)      (filtro 2)      (filtro 3a)         (filtro 4) (filtro 5)  (filtro 6)   (filtro 7)  (filtro 3b)
```

Ver el detalle completo, incluyendo por qué el filtro 3 del enunciado se implementa como dos
pasos de código (3a/3b), en [`docs/architecture.md`](./docs/architecture.md).

## Estructura de carpetas planeada

```
src/          código fuente (pipeline, filtros, servicios, rutas, tipos, datos mock)
tests/        tests unitarios (por filtro/servicio) e integración (por endpoint)
postman/      colección y environment de Postman
docs/         documentación de arquitectura y decisiones de diseño
```

El detalle archivo por archivo está en [`docs/architecture.md`](./docs/architecture.md).

## Instalación y ejecución

_Se completa cuando exista el código fuente._ Va a incluir aproximadamente:

```bash
npm install
npm run dev     # servidor en modo desarrollo
npm test        # suite de tests (unit + integración)
npm run build   # compilación TypeScript → JS
```

## Endpoints (una vez implementados)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/reservations/process` | Procesa un array de reservas a través del pipeline |
| `GET` | `/reservations/:id/status` | Estado del procesamiento de una reserva |
| `GET` | `/pipeline/config` | Configuración actual del pipeline |
| `PUT` | `/pipeline/config` | Modifica configuración de filtros (habilitados/parámetros) |

## Equipo

M7A - Grupo 6 — Arquitectura de Software.
