# Plan de trabajo en equipo (5 desarrolladores)

Este documento divide la implementación en 5 paquetes de trabajo, uno por persona, sobre la
base de lo ya definido en [`architecture.md`](./architecture.md),
[`design-decisions.md`](./design-decisions.md) y [`testing-plan.md`](./testing-plan.md).

## Por qué se puede paralelizar desde el día 1

El patrón Pipes & Filters ya separó las responsabilidades en piezas independientes, y los
contratos de cada pieza (interfaz `Filter`, forma de `ReservationContext`, forma de
`PipelineConfig`) **ya están documentados y cerrados** en `architecture.md`. Eso significa que
nadie necesita esperar a que otra persona termine su código para empezar el propio: cada
desarrollador programa contra el contrato documentado, no contra la implementación real de los
demás. Los tests unitarios de cada filtro tampoco dependen de que el resto del pipeline exista
— construyen un `ReservationContext` a mano, como ya indica `architecture.md` §2.

El único punto que sí depende de una implementación real y no solo del contrato es la
**integración final** (armar `filters/index.ts`, cablear `app.ts`, correr los tests de
integración de punta a punta) — ver "Integración final" más abajo.

## Los 5 paquetes de trabajo

### Dev 1 — Núcleo: setup, tipos, orquestador y config

**Por qué primero/en paralelo:** define los contratos que usan los otros 4 paquetes. Se
recomienda que esta persona entregue `types/`, `schemas/` y `filters/Filter.ts` **el primer
día** (son básicamente una transcripción directa de `architecture.md` §2 y §8), y recién
después siga con el resto — así no bloquea a nadie.

| | |
|---|---|
| **Archivos propios** | `package.json`, `tsconfig.json`, `jest.config.ts`, `.env.example`, `src/app.ts`, `src/server.ts`, `src/config/env.ts`, `src/config/defaultPipelineConfig.ts`, `src/types/*.ts`, `src/schemas/*.ts`, `src/pipeline/Pipeline.ts`, `src/pipeline/PipelineConfigStore.ts`, `src/pipeline/context.ts`, `src/filters/Filter.ts` |
| **Depende de** | Nada — es quien desbloquea al resto |
| **Referencia** | `architecture.md` §2, §3, §7, §8 |
| **Tests propios** | `tests/unit/pipeline/pipeline.test.ts` (con filtros de prueba/dobles inyectados, no los filtros reales) |
| **Entregable clave** | El orquestador debe poder correr un array de `Filter` de prueba (dobles) y producir un `PipelineResult` — sin depender de los filtros reales de negocio |

### Dev 2 — Filtros de validación (1-2) + datos mock

| | |
|---|---|
| **Archivos propios** | `src/filters/PassengerValidationFilter.ts`, `src/filters/FlightValidationFilter.ts`, `src/data/mockPassengers.ts`, `src/data/mockFlights.ts` |
| **Depende de** | `Filter.ts` y `types/*.ts` de Dev 1 (contrato ya documentado, puede empezar con lo escrito en `architecture.md` aunque Dev 1 no haya terminado el resto) |
| **Referencia** | `architecture.md` §5 (filtros 1-2), `design-decisions.md` §4 (derivar `passengerType` de la edad) |
| **Tests propios** | `tests/unit/filters/passengerValidationFilter.test.ts`, `tests/unit/filters/flightValidationFilter.test.ts` |
| **Casos de `testing-plan.md` a cubrir** | Toda la sección "Flujo Básico de Reserva" + "origen/destino no coincide" + "fecha de salida = ahora" |
| **Nota de datos mock** | Cada registro debe quedar comentado con qué caso de prueba cubre (pasajero activo/inactivo, child/senior, vuelo con/sin asientos, distintos `destinationCountry`, fecha pasada/futura) — ver la lista al final de `testing-plan.md` |

### Dev 3 — Integración de tipo de cambio (filtros 3a/3b + servicios)

| | |
|---|---|
| **Archivos propios** | `src/services/ExchangeRateProvider.ts`, `src/services/ExchangeRateCache.ts`, `src/data/countryCurrencyMap.ts`, `src/data/defaultExchangeRates.ts`, `src/filters/ExchangeRateEnrichmentFilter.ts`, `src/filters/CurrencyConversionFilter.ts` |
| **Depende de** | `Filter.ts` y `types/*.ts` de Dev 1 |
| **Referencia** | `architecture.md` §4 (por qué 3a/3b) y §6 (integración completa: cache, retry, timeout, fallback), `design-decisions.md` §3 (por qué esta API puntual) |
| **Tests propios** | `tests/unit/services/exchangeRateProvider.test.ts`, `tests/unit/services/exchangeRateCache.test.ts`, `tests/unit/filters/exchangeRateEnrichmentFilter.test.ts` |
| **Casos de `testing-plan.md` a cubrir** | Toda la sección "Integración con API de Tipo de Cambio" + "Timeout en llamada a API externa" de "Casos de Error" |
| **Importante** | Ningún test de este paquete pega a la red real — `fetch` siempre mockeado (`jest.spyOn(global, 'fetch')`), timeouts probados con fake timers, no con `sleep` real |

### Dev 4 — Filtros de precio (4-7)

| | |
|---|---|
| **Archivos propios** | `src/filters/BasePriceCalculationFilter.ts`, `src/filters/LoyaltyDiscountFilter.ts`, `src/filters/PassengerTypeAdjustmentFilter.ts`, `src/filters/TaxAndFeesFilter.ts` |
| **Depende de** | `Filter.ts` y `types/*.ts` de Dev 1 |
| **Referencia** | `architecture.md` §5 (filtros 4-7), `design-decisions.md` §1 y §2 (fórmulas exactas — **son las más fáciles de implementar mal si no se leen primero**) |
| **Tests propios** | `tests/unit/filters/basePriceCalculationFilter.test.ts`, `loyaltyDiscountFilter.test.ts`, `passengerTypeAdjustmentFilter.test.ts`, `taxAndFeesFilter.test.ts` |
| **Casos de `testing-plan.md` a cubrir** | Toda la sección "Flujo de Cálculo de Precios" (usa el ejemplo numérico exacto de `design-decisions.md` §1: Business/Gold/Child → `$250 → $212.50 → $159.375`) + "datos corruptos en mitad del pipeline" (defensivo si `basePrice` no está seteado) |
| **Ojo** | El descuento de lealtad y el de tipo de pasajero son **secuenciales**, no se suman. El impuesto va sobre `subtotal` (post-descuentos); el recargo de combustible va sobre `basePrice` (pre-descuentos). Si el número de un test no cierra, primero revisar `design-decisions.md` antes de tocar la fórmula |

### Dev 5 — Capa API + Postman

| | |
|---|---|
| **Archivos propios** | `src/routes/*.ts`, `src/controllers/*.ts`, `src/middlewares/*.ts`, `src/services/ReservationStore.ts`, `postman/*.json` |
| **Depende de** | El contrato de endpoints (`architecture.md` §9) y `PipelineConfigStore` de Dev 1 — puede levantar rutas contra un `Pipeline` con filtros de prueba mientras el resto no esté listo |
| **Referencia** | `architecture.md` §9 (los 4 endpoints) |
| **Tests propios** | `tests/integration/reservations.process.test.ts`, `reservations.status.test.ts`, `pipelineConfig.test.ts` (estos sí necesitan el pipeline real ensamblado — ver "Integración final") |
| **Casos de `testing-plan.md` a cubrir** | Los casos de integración transversales: body malformado (400), batch con fallas parciales, `PUT /pipeline/config` con valores fuera de rango, `GET /status` con id inexistente (404), array vacío |
| **Postman** | Un request por combinación endpoint × caso relevante, con un environment (`baseUrl`) — ver `CONSIGNA.md` "Entregables" punto 3 |

## Integración final (paso conjunto, no de una sola persona)

Cuando los 5 paquetes tienen sus propios tests unitarios en verde, falta un paso corto que sí
requiere piezas reales de todos:

1. Armar `src/filters/index.ts` con la lista ordenada real de los 8 filtros (Dev 1 o quien
   haga el merge final).
2. Cablear `app.ts` con las rutas de Dev 5 usando el `Pipeline` real (no los dobles de test).
3. Correr los tests de integración de Dev 5 contra el pipeline completo — acá es donde
   aparecen los problemas de integración entre paquetes, si los hay.
4. Pasada de verificación cruzada contra `CONSIGNA.md` (ya listada al final de
   `architecture.md`/`testing-plan.md`).

Se recomienda que este paso lo haga una sola persona (o Dev 1, por ser quien conoce mejor el
orquestador) sobre una rama corta, con el resto disponible para resolver dudas puntuales de su
propio paquete — no debería tomar más de un día si cada paquete cumplió su contrato.

## Cómo evitar conflictos de merge

- Cada paquete toca **su propia carpeta o sus propios archivos** (ver tablas arriba) — no hay
  dos personas escribiendo el mismo archivo salvo en la integración final.
- Nadie edita `src/filters/index.ts` ni `src/app.ts` hasta la integración final — son los dos
  únicos archivos que "atan" el trabajo de todos.
- Cada paquete se sube en su propia rama (`feature/dev1-nucleo`, `feature/dev2-validacion`,
  `feature/dev3-tipo-cambio`, `feature/dev4-precios`, `feature/dev5-api`) y se mergea a `main`
  apenas sus tests unitarios están en verde — no hace falta esperar a los demás para mergear
  cada paquete individual, solo para el paso de integración final.

## Checklist de Definition of Done por paquete

Antes de pedir review, cada paquete debe cumplir:

- [ ] Los archivos creados coinciden con la tabla de este documento (no se tocó nada fuera del
      paquete propio).
- [ ] Los tests unitarios propios están en verde y no dependen de red real ni de que otro
      paquete exista.
- [ ] Los casos de `testing-plan.md` asignados a este paquete están cubiertos, uno por uno.
- [ ] Si el paquete toca una fórmula de negocio (Dev 4) o una interpretación del enunciado
      (Dev 2, Dev 3), el código sigue exactamente lo que dice `design-decisions.md` — si hace
      falta desviarse, se discute con el equipo y se actualiza ese documento primero.
