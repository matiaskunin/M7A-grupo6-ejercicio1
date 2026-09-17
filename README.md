# M7A-grupo6-ejercicio1 — Sistema de Reservas de Vuelos (Pipes & Filters)

Backend en **Node.js + TypeScript + Express** que procesa reservas de vuelo a través de un
pipeline de filtros (patrón arquitectónico **Pipes & Filters**), según el enunciado en
[`CONSIGNA.md`](./CONSIGNA.md).

> **Estado actual: implementación completa.** Los 5 paquetes de trabajo de
> [`docs/team-plan.md`](./docs/team-plan.md) están mergeados, más el paso de "Integración
> final" que cablea todo junto. Los 4 endpoints requeridos están expuestos y **112 tests**
> (80 unitarios + 32 de integración) pasan en verde.

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

La lista ordenada vive en un solo lugar, [`src/filters/index.ts`](./src/filters/index.ts). El
orquestador no la conoce: la recibe por constructor. Ver el detalle completo, incluyendo por
qué el filtro 3 del enunciado se implementa como dos pasos de código (3a/3b), en
[`docs/architecture.md`](./docs/architecture.md).

Garantías del ejecutor ([`src/pipeline/Pipeline.ts`](./src/pipeline/Pipeline.ts)):

- Los filtros corren en el orden en que están registrados.
- Un filtro deshabilitado por configuración se saltea.
- Si un filtro rechaza la reserva, los filtros siguientes no corren **para esa reserva**; el
  resto del batch continúa.
- Si un filtro lanza una excepción, se captura como error de esa reserva puntual: un fallo
  individual nunca tumba el procesamiento del lote.
- Si la API de tipo de cambio falla, el procesamiento **continúa** con un warning y la tasa de
  fallback — nunca se interrumpe el pipeline.

## Progreso de implementación

Basado en la división de [`docs/team-plan.md`](./docs/team-plan.md).

| Paquete | Contenido | Estado |
|---|---|:---:|
| Dev 1 — Núcleo | Tipos, schemas zod, contrato `Filter`, orquestador `Pipeline`, `PipelineConfigStore`, `app.ts`/`server.ts` | ✅ |
| Dev 2 — Validación + mocks | `PassengerValidationFilter`, `FlightValidationFilter`, `mockPassengers.ts`, `mockFlights.ts` | ✅ |
| Dev 3 — Tipo de cambio | `ExchangeRateProvider` (fetch + retry + timeout + fallback), `ExchangeRateCache` (TTL + deduplicación), `countryCurrencyMap.ts`, `defaultExchangeRates.ts`, filtros `ExchangeRateEnrichmentFilter` (3a) y `CurrencyConversionFilter` (3b) | ✅ |
| Dev 4 — Filtros de precio | `BasePriceCalculationFilter`, `LoyaltyDiscountFilter`, `PassengerTypeAdjustmentFilter`, `TaxAndFeesFilter` | ✅ |
| Dev 5 — Capa API + Postman | Rutas, controllers, middlewares, `ReservationStore`, colección Postman, tests de integración | ✅ |
| Integración final | `filters/index.ts` con los 8 filtros reales en orden, rutas cableadas en `app.ts`, tests de punta a punta | ✅ |

## Estructura de carpetas

```
src/
  app.ts, server.ts          # app Express (dependencias inyectables) y arranque del server
  config/                    # env.ts, defaultPipelineConfig.ts
  types/                     # tipos compartidos (reservation, pipeline, passenger, flight)
  schemas/                   # validación zod (reservationRequest, pipelineConfig)
  pipeline/                  # Pipeline (orquestador), PipelineConfigStore, context, buildPipeline
  filters/                   # los 8 filtros de negocio + index.ts (lista ordenada) + Filter.ts (contrato)
  services/                  # ExchangeRateProvider, ExchangeRateCache, ReservationStore
  data/                      # mockPassengers, mockFlights, countryCurrencyMap, defaultExchangeRates
  routes/                    # reservations.routes.ts, pipeline.routes.ts
  controllers/               # reservations.controller.ts, pipeline.controller.ts
  middlewares/               # validateBody.ts (zod), errorHandler.ts
tests/
  unit/filters/, unit/services/, unit/pipeline/   # 80 tests
  integration/                                     # 32 tests (los 4 endpoints, punta a punta)
  fixtures/
postman/                     # colección + environment (entregable 3)
docs/                        # documentación de arquitectura y decisiones de diseño
```

El detalle archivo por archivo está en [`docs/architecture.md`](./docs/architecture.md) §10.

## Instalación y ejecución

Requisitos: **Node.js >= 18** (se usa el `fetch` nativo, sin dependencias de HTTP externas).

```bash
npm install
```

```bash
npm run dev
```

El servidor queda en `http://localhost:3000`.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática (ts-node-dev) |
| `npm run build` | Compila TypeScript a `dist/` (solo `src/`, sin los tests) |
| `npm start` | Ejecuta la build compilada (`node dist/server.js`) |
| `npm test` | Corre la suite completa |
| `npm run test:watch` | Tests en modo watch |
| `npm run typecheck` | Chequeo de tipos de `src/` y `tests/`, sin emitir |

> Ojo con PowerShell en Windows: si `npm` falla con *"running scripts is disabled on this
> system"*, usá `npm.cmd` en lugar de `npm`, o habilitá los scripts con
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

Variables de entorno (ver [`.env.example`](./.env.example)): `PORT` y `NODE_ENV`. Ninguna es
obligatoria — la app arranca con los valores por defecto.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/reservations/process` | Procesa un array de reservas a través del pipeline |
| `GET` | `/reservations/:id/status` | Estado del procesamiento de una reserva ya procesada |
| `GET` | `/pipeline/config` | Configuración actual del pipeline |
| `PUT` | `/pipeline/config` | Modifica configuración de filtros (habilitados / parámetros) |
| `DELETE` | `/pipeline/cache` | Invalidación manual de la cache de tasas de cambio |
| `GET` | `/health` | Chequeo de vida (no es de la consigna) |

### Ejemplo

```bash
curl -X POST http://localhost:3000/reservations/process \
  -H "Content-Type: application/json" \
  -d '{"reservations":[{"reservationId":"RES-001","passengerId":"PASS-ADULT-GOLD","flightCode":"FL-BR-003","seatClass":"business"}]}'
```

Devuelve el array de reservas procesadas con su desglose de precios, los errores y warnings de
cada una, y el tiempo total de procesamiento:

```json
{
  "results": [
    {
      "id": "RES-001",
      "status": "completed",
      "pricing": {
        "basePrice": 300, "subtotal": 255, "tax": 30.6,
        "airportFee": 25, "fuelSurcharge": 24,
        "totalUSD": 334.6, "currency": "BRL", "totalConverted": 1723.19
      },
      "errors": [],
      "warnings": [],
      "metadata": { "exchangeRate": { "rate": 5.15, "source": "live" } }
    }
  ],
  "summary": { "total": 1, "completed": 1, "rejected": 0, "errored": 0 },
  "totalProcessingTimeMs": 745
}
```

Una reserva rechazada devuelve `status: "rejected"` con el detalle en `errors`, y la request
HTTP sigue siendo `200`: el rechazo es **por reserva**, no del lote. Los `400` se reservan para
el body mal formado.

El `config` opcional del body aplica **solo a esa corrida** y no modifica la configuración
global; para cambiarla de forma persistente está `PUT /pipeline/config`.

## Colección de Postman

[`postman/`](./postman) tiene la colección y el environment (entregable 3 de la consigna). Se
importan desde *Import → File*:

- `M7A-grupo6-ejercicio1.postman_collection.json` — 16 requests con ejemplos de response
  guardados: flujo feliz, casos de descuento, batch mixto con rechazos, los `400`/`404` y la
  administración del pipeline.
- `M7A-grupo6-ejercicio1.postman_environment.json` — define `{{baseUrl}}`.

Correr primero *"1. Reserva valida"* para poblar el store en memoria, y después los requests de
`/reservations/:id/status`.

## Datos de prueba

Los mocks viven en [`src/data/`](./src/data) y se cargan al iniciar la aplicación. Están
comentados con qué caso de prueba cubre cada registro: pasajeros activos e inactivos de los
cuatro tiers de lealtad, rangos de edad (child / adult / senior), contacto inválido, y vuelos
con y sin asientos, con fecha futura y pasada, y destinos en distintas monedas.

| Pasajero | Uso |
|---|---|
| `PASS-ADULT-NONE` | Caso base sin descuentos |
| `PASS-ADULT-BRONZE` / `SILVER` / `GOLD` | Descuentos por lealtad (5% / 10% / 15%) |
| `PASS-CHILD-GOLD` / `PASS-SENIOR-SILVER` | Descuentos combinados |
| `PASS-INACTIVE` | Rechazo por pasajero inactivo |
| `PASS-INVALID-CONTACT` | Rechazo por contacto inválido |

| Vuelo | Uso |
|---|---|
| `FL-US-001` | Destino en USD (sin conversión), base $100 |
| `FL-AR-002` / `FL-BR-003` / `FL-EU-004` | Destinos en ARS / BRL / EUR |
| `FL-NO-SEATS` | Rechazo por falta de asientos |
| `FL-PAST-DATE` | Rechazo por fecha no futura |

## Tests

```bash
npm test
```

**112 tests en 15 suites**, todos en verde:

- **80 unitarios** — un archivo por filtro (cada uno armando su `ReservationContext` a mano,
  sin depender del resto del pipeline), más el orquestador con filtros dobles y los dos
  servicios de tipo de cambio.
- **32 de integración** — los 4 endpoints con supertest contra el pipeline real de 8 filtros:
  body malformado, array vacío, batch con fallas parciales, `404`s, config fuera de rango,
  invalidación de cache y el comportamiento con la red caída.

Ningún test pega a la red real: `fetch` se mockea y el proveedor de tasas se inyecta. La
trazabilidad de qué test cubre cada caso pedido por el enunciado está en
[`docs/testing-plan.md`](./docs/testing-plan.md).

## Equipo

M7A - Grupo 6 — Arquitectura de Software.
