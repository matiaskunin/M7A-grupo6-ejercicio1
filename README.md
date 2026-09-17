# M7A-grupo6-ejercicio1 — Sistema de Reservas de Vuelos (Pipes & Filters)

Backend en **Node.js + TypeScript + Express** que procesa reservas de vuelo a través de un
pipeline de filtros (patrón arquitectónico **Pipes & Filters**), según el enunciado en
[`CONSIGNA.md`](./CONSIGNA.md).

> **Estado actual: implementación en progreso.** 4 de los 5 paquetes de trabajo de
> [`docs/team-plan.md`](./docs/team-plan.md) ya están mergeados a `main`: núcleo/orquestador,
> validación + datos mock, integración de tipo de cambio y filtros de precio. Falta la capa de
> API (rutas/controllers/Postman) y el paso de "Integración final" que cablea todo junto — ver
> [Progreso de implementación](#progreso-de-implementación) más abajo.

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
5. [`docs/team-plan.md`](./docs/team-plan.md) — división del trabajo en 5 paquetes para el
   equipo, con archivos, dependencias y tests a cargo de cada persona.

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

## Progreso de implementación

Basado en la división de [`docs/team-plan.md`](./docs/team-plan.md). "Integración final" es el
único paso que no se puede paralelizar: cablea `filters/index.ts` y `app.ts` con las piezas
reales de todos los paquetes.

| Paquete | Contenido | Estado |
|---|---|:---:|
| Dev 1 — Núcleo | Tipos, schemas zod, contrato `Filter`, orquestador `Pipeline`, `PipelineConfigStore`, `app.ts`/`server.ts` (sin rutas de negocio todavía) | ✅ |
| Dev 2 — Validación + mocks | `PassengerValidationFilter`, `FlightValidationFilter`, `mockPassengers.ts`, `mockFlights.ts` | ✅ |
| Dev 3 — Tipo de cambio | `ExchangeRateProvider` (fetch + retry + timeout + fallback), `ExchangeRateCache` (TTL + deduplicación), `countryCurrencyMap.ts`, `defaultExchangeRates.ts`, filtros `ExchangeRateEnrichmentFilter` (3a) y `CurrencyConversionFilter` (3b) | ✅ |
| Dev 4 — Filtros de precio | `BasePriceCalculationFilter`, `LoyaltyDiscountFilter`, `PassengerTypeAdjustmentFilter`, `TaxAndFeesFilter` | ✅ |
| Dev 5 — Capa API + Postman | Rutas, controllers, middlewares, `ReservationStore`, colección Postman | ⏳ pendiente |
| Integración final | `filters/index.ts` con los 8 filtros reales en orden, rutas cableadas en `app.ts`, tests de integración de punta a punta | ⏳ pendiente (bloqueado por Dev 5) |

Los 8 filtros de negocio y los 2 servicios de tipo de cambio ya existen y tienen test unitario
propio. Lo que falta es exponerlos por HTTP: hoy `src/app.ts` solo tiene un `GET /health` de
humo, sin los 4 endpoints reales de `CONSIGNA.md`.

## Estructura de carpetas

```
src/
  app.ts, server.ts          # app Express — todavía sin las rutas de negocio (Dev 5)
  config/                    # env.ts, defaultPipelineConfig.ts
  types/                     # tipos compartidos (reservation, pipeline, passenger, flight)
  schemas/                   # validación zod (reservationRequest, pipelineConfig)
  pipeline/                  # Pipeline (orquestador), PipelineConfigStore, context
  filters/                   # los 8 filtros de negocio (Filter.ts = el contrato)
  services/                  # ExchangeRateProvider, ExchangeRateCache
  data/                      # mockPassengers, mockFlights, countryCurrencyMap, defaultExchangeRates
  routes/, controllers/,
  middlewares/               # pendiente — Dev 5
tests/
  unit/filters/, unit/services/, unit/pipeline/   # 80 tests, todos en verde
  integration/                                     # pendiente — Dev 5 + integración final
  fixtures/
postman/                     # pendiente — Dev 5
docs/                        # documentación de arquitectura y decisiones de diseño
```

El detalle archivo por archivo (incluido lo que falta) está en
[`docs/architecture.md`](./docs/architecture.md) §10 y en
[`docs/team-plan.md`](./docs/team-plan.md).

## Instalación y ejecución

```bash
npm install
npm run dev     # servidor en modo desarrollo (arranca en http://localhost:3000, con GET /health)
npm test        # suite de tests — hoy: 80 tests unitarios en verde (filtros, servicios, pipeline)
npm run build   # compilación TypeScript → JS
```

`npx tsc --noEmit` y `npm test` están verificados contra el estado actual de `main`: compila sin
errores y los 12 test suites (80 tests) pasan.

## Endpoints (pendientes de exponer — Dev 5)

La lógica de negocio de los 4 endpoints ya existe (pipeline + config store + filtros), pero
todavía no está expuesta por HTTP:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/reservations/process` | Procesa un array de reservas a través del pipeline |
| `GET` | `/reservations/:id/status` | Estado del procesamiento de una reserva |
| `GET` | `/pipeline/config` | Configuración actual del pipeline |
| `PUT` | `/pipeline/config` | Modifica configuración de filtros (habilitados/parámetros) |

## Equipo

M7A - Grupo 6 — Arquitectura de Software.
