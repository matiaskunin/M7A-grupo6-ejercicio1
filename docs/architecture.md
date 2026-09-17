# Arquitectura: Pipes & Filters aplicado al Sistema de Reservas de Vuelos

Este documento describe cómo se traduce el patrón **Pipes & Filters** pedido en
[`CONSIGNA.md`](../CONSIGNA.md) a una arquitectura concreta en Node.js + TypeScript + Express.
Está pensado para que cualquier persona del equipo (o una IA retomando el trabajo) entienda el
diseño sin tener que leerse el código primero.

## 0. Diagramas

- [`diagrams/architecture.html`](./diagrams/architecture.html) — arquitectura de componentes:
  cliente → API Express → Pipeline → servicios (mock data, config store, exchange rate
  provider/cache) y la dependencia externa (API de tipo de cambio).
- [`diagrams/pipeline-flow.html`](./diagrams/pipeline-flow.html) — flujo de una reserva
  individual a través de los filtros, con las ramas de corte por rechazo y por error.

Son HTML autocontenidos y explorables (zoom, pan, temas claro/oscuro, vistas guiadas) — se
abren directamente en el navegador, no requieren build.

## 1. Idea general

El patrón Pipes & Filters procesa datos a través de una secuencia de pasos independientes
("filtros"), donde la salida de uno es la entrada del siguiente. Acá, la unidad que fluye por
el pipeline es una **reserva individual**: el array de entrada de `POST /reservations/process`
se procesa reserva por reserva, cada una atravesando su propia cadena de filtros de forma
independiente (y en paralelo respecto de las demás reservas del batch).

Por qué este patrón calza bien acá:
- Cada responsabilidad del enunciado (validar pasajero, validar vuelo, convertir moneda,
  calcular precio, aplicar descuentos, calcular impuestos) es naturalmente un paso separado,
  testeable en aislamiento.
- El enunciado pide explícitamente poder habilitar/deshabilitar filtros — algo que el patrón
  soporta de forma directa si el orquestador simplemente saltea los filtros deshabilitados.
- El enunciado pide robustez ante fallos individuales — el patrón permite que el orquestador
  aísle la falla de un filtro sin tirar abajo el procesamiento de las demás reservas.

## 2. El contrato `Filter`

Todos los filtros implementan la misma interfaz:

```ts
interface Filter {
  readonly name: FilterName;
  execute(context: ReservationContext, config: PipelineConfig): Promise<ReservationContext>;
}
```

Reglas que todo filtro debe respetar (esto es lo que los hace "independientes y testeables por
separado", como pide el enunciado):

- **No lanza excepciones por fallas de negocio esperadas.** "Pasajero no existe", "vuelo sin
  asientos", "API de tipo de cambio caída" no son bugs — son resultados válidos del dominio.
  Se representan como entradas en `context.errors` / `context.warnings`, nunca como un
  `throw`. Un filtro solo puede lanzar si hay un bug real (estado interno corrupto, por
  ejemplo) — y el orquestador lo atrapa (ver sección 3).
- **Es invocable de forma aislada.** Un test unitario debe poder armar un `ReservationContext`
  a mano (sin haber corrido los filtros anteriores) y llamar `execute()` directamente. Esto
  implica que cada filtro valida defensivamente los campos de entrada que necesita, en vez de
  asumir ciegamente que un filtro anterior ya los dejó en un estado válido.
- **Solo los filtros 1 y 2 pueden rechazar la reserva** (poner `context.status = 'rejected'`).
  Los demás filtros (enriquecimiento, precio, descuentos, impuestos, conversión) nunca
  rechazan — como mucho agregan warnings. Esto mantiene la regla de corte del orquestador
  simple y genérica (ver sección 3).

## 3. El orquestador (`Pipeline`)

El orquestador no conoce reglas de negocio — solo sabe recorrer una lista de filtros:

```ts
async function processOne(request: ReservationRequest, filters: Filter[], config: PipelineConfig) {
  let context = createInitialContext(request);

  for (const filter of filters) {
    if (!config.filters[filter.name]?.enabled) continue;   // deshabilitado → se saltea
    if (context.status !== 'pending') break;                 // ya rechazada/errored → corta

    try {
      context = await filter.execute(context, config);
      context.metadata.filtersApplied.push(filter.name);
    } catch (err) {
      context.errors.push({ filter: filter.name, code: 'FILTER_EXCEPTION', message: String(err) });
      context.status = 'error';
      break;
    }
  }

  if (context.status === 'pending') context.status = 'completed';
  return finalize(context);
}
```

Puntos clave de este diseño:

- **Deshabilitar un filtro es un `continue`, no una rama especial.** La config de cada filtro
  vive en `config.filters[filter.name]` — el orquestador ni sabe qué hace cada filtro
  puntualmente.
- **El corte por rechazo es genérico.** Cualquier filtro que ponga `status` en algo distinto de
  `'pending'` corta el resto de la cadena para esa reserva. Esto evita, por ejemplo, calcular
  impuestos sobre una reserva que ya fue rechazada por falta de asientos.
- **Una excepción inesperada de un filtro no tira abajo el batch.** Se atrapa, se registra como
  error de esa reserva puntual, y el `Promise.all` que procesa el batch completo sigue
  adelante con las demás reservas — esto es lo que exige el enunciado con "el pipeline debe
  ser robusto ante fallos individuales de filtros" y "pipeline interrumpido por falla de red"
  como caso de prueba (no debe interrumpirse para el resto del batch).
- **Las reservas del batch se procesan en paralelo** (`Promise.all` sobre `processOne`), así
  que una reserva lenta (por ejemplo, esperando el timeout de 5s de la API de cambio) no
  bloquea el procesamiento de las demás.

## 4. Por qué el filtro 3 del enunciado se implementa como dos filtros de código (3a/3b)

El enunciado ordena los filtros así: 1 pasajero, 2 vuelo, **3 tipo de cambio**, 4 precio base,
5 lealtad, 6 tipo de pasajero, 7 impuestos. El problema es que el filtro 3, tal como lo describe
el enunciado, tiene que "convertir precios a moneda local" — pero en la posición 3 todavía no
existe ningún precio calculado (eso pasa recién en los filtros 4 a 7).

La solución adoptada es dividir el trabajo del filtro 3 en dos pasos, cada uno un `Filter` de
código, pero conceptualmente ambos siguen siendo "el filtro 3" del enunciado:

- **`ExchangeRateEnrichmentFilter` (3a)** — corre en la posición original (antes del cálculo de
  precio). Detecta la moneda del país destino, obtiene la tasa de cambio (con cache, retry,
  timeout y fallback — ver sección 6) y la deja guardada en `context.metadata.exchangeRate`.
  No toca ningún precio.
- **`CurrencyConversionFilter` (3b)** — corre al final, después de `TaxAndFeesFilter`. Toma la
  tasa que ya quedó guardada en el contexto y el total final en USD, y produce
  `pricing.totalConverted` + `pricing.currency`.

Esto mantiene el orquestador genérico (no necesita lógica especial para "aplicar la conversión
en el momento justo") y cada paso sigue siendo un filtro independiente y testeable. Se
documenta acá explícitamente para que quede claro que **no es un filtro de negocio extra** —
es un detalle de implementación de un único requerimiento del enunciado.

## 5. Los filtros, en orden de ejecución

| Orden | Filtro | Responsabilidad | ¿Puede rechazar la reserva? |
|-------|--------|------------------|:---:|
| 1 | `PassengerValidationFilter` | Pasajero existe y está activo; valida contacto (email/teléfono); compara edad vs `passengerType` (agrega warning si no coincide, no rechaza por esto) | Sí |
| 2 | `FlightValidationFilter` | Vuelo existe por código; `availableSeats > 0`; origen/destino coinciden con el vuelo; fecha de salida es futura | Sí |
| 3a | `ExchangeRateEnrichmentFilter` | Mapea país destino → moneda; obtiene/cachea tasa de cambio | No (solo warnings si la API falla) |
| 4 | `BasePriceCalculationFilter` | `basePrice` según clase de asiento: Economy ×1, Business ×2.5, First ×4 | No |
| 5 | `LoyaltyDiscountFilter` | Descuento % sobre `currentPrice` según tier de lealtad: Bronze 5%, Silver 10%, Gold 15% | No |
| 6 | `PassengerTypeAdjustmentFilter` | Descuento % sobre `currentPrice` según tipo derivado de edad: Child 25%, Senior 15%, Adult 0% → fija `subtotal` | No |
| 7 | `TaxAndFeesFilter` | `tax` = 12% de `subtotal`; `airportFee` = $25 fijo; `fuelSurcharge` = 8% de `basePrice` → `totalUSD` | No |
| 3b | `CurrencyConversionFilter` | `totalUSD × exchangeRate.rate` → `totalConverted`, `currency` | No |

Las fórmulas exactas de precio (orden de aplicación de descuentos, base del impuesto, etc.)
están justificadas en [`design-decisions.md`](./design-decisions.md) — acá solo se documenta
el rol de cada filtro dentro del pipeline.

## 6. La integración con la API de tipo de cambio

Vive detrás de una interfaz para no acoplar los filtros a un proveedor concreto:

```ts
interface ExchangeRateProvider {
  getRate(base: string, target: string): Promise<{ rate: number; source: 'live' | 'cache' | 'fallback' }>;
}
```

La implementación concreta (contra `https://api.exchangerate-api.com/v4/latest/{base}`, según
lo sugerido en el enunciado — ver justificación en `design-decisions.md`) resuelve, en este
orden:

1. **Cache en memoria** (TTL 1 hora) — si hay una tasa vigente para ese par de monedas, se usa
   directo, sin llamar a la API.
2. **Llamada HTTP real** con `fetch` + `AbortController` — timeout de 5 segundos, hasta 3
   reintentos. Si dos pedidos concurrentes piden la misma moneda mientras no hay cache
   todavía, se deduplican (un único pedido en vuelo, ambos esperan la misma promesa) para
   evitar llamadas redundantes.
3. **Fallback a tabla de tasas por defecto** (`defaultExchangeRates.ts`) si la API falla tras
   los reintentos, responde con un formato inesperado, o hace timeout. Se registra un warning
   en la reserva — el pipeline **nunca se detiene** por esto, como exige el enunciado
   ("si falla, el procesamiento continúa con warnings y precios en USD").

`metadata.exchangeRate.source` en cada reserva procesada indica cuál de los tres caminos se
usó (`'live' | 'cache' | 'fallback'`) — útil tanto para los tests de integración como para
debugging en producción.

## 7. Configuración del pipeline

`PipelineConfig` tiene una entrada por filtro, con `{ enabled: boolean }` más los parámetros
propios de ese filtro (multiplicadores de clase, porcentajes de descuento, tasas de impuesto,
timeout/retries/TTL de la API de cambio, tasas de fallback). Vive como un singleton en memoria,
seedeado desde `defaultPipelineConfig.ts`:

- `GET /pipeline/config` devuelve la config completa actual.
- `PUT /pipeline/config` acepta un merge parcial (deep partial), validado con `zod` (rangos:
  porcentajes en `[0,1]`, montos `>= 0`), y actualiza el singleton — afecta a partir de ese
  momento a las próximas llamadas de `POST /reservations/process`.
- `POST /reservations/process` también acepta un `config` opcional en el body, que aplica
  **solo a esa corrida puntual**, sin tocar el singleton global.

**Limitación documentada**: al ser un singleton en memoria de un solo proceso, la config (y el
store de `/status`, ver abajo) no persiste entre reinicios del servidor ni se comparte entre
instancias. Suficiente para el alcance de este ejercicio; en un sistema real iría a una base de
datos o un store distribuido (Redis, etc.).

## 8. Tipos compartidos (resumen de campos)

```ts
interface ReservationContext {
  reservationId: string;
  originalRequest: ReservationRequest;
  passenger?: PassengerRecord;
  flight?: FlightRecord;
  status: 'pending' | 'rejected' | 'error' | 'completed';
  errors: ReservationIssue[];
  warnings: ReservationIssue[];
  pricing: {
    seatClass: 'economy' | 'business' | 'first';
    basePrice?: number;        // salida del filtro 4, USD — nunca se sobreescribe después
    currentPrice?: number;     // precio "corriendo" a través de los filtros 5 y 6
    subtotal?: number;         // = currentPrice tras el filtro 6
    tax?: number;
    airportFee?: number;
    fuelSurcharge?: number;
    totalUSD?: number;
    currency?: string;         // código ISO de la moneda destino, ej. 'ARS'
    totalConverted?: number;
  };
  metadata: {
    exchangeRate?: { rate: number; base: string; target: string; fetchedAt: string; source: 'live' | 'cache' | 'fallback' };
    loyaltyTier?: 'bronze' | 'silver' | 'gold' | 'none';
    passengerTypeApplied?: 'child' | 'senior' | 'adult';
    filtersApplied: string[];  // rastro de auditoría de qué filtros corrieron
  };
  processingStartedAt: number;
}

interface ReservationIssue { filter: string; code: string; message: string }

// Lo que devuelve la API por cada reserva procesada
interface ProcessedReservation {
  id: string;
  status: 'completed' | 'rejected' | 'error';
  passengerId: string;
  flightCode: string;
  pricing: ReservationContext['pricing'];
  errors: ReservationIssue[];
  warnings: ReservationIssue[];
  metadata: ReservationContext['metadata'];
  processingTimeMs: number;
}

// Respuesta de POST /reservations/process
interface PipelineResult {
  results: ProcessedReservation[];
  summary: { total: number; completed: number; rejected: number; errored: number };
  totalProcessingTimeMs: number;
}

interface PassengerRecord {
  id: string;
  name: string;
  isActive: boolean;
  birthDate: string;          // se deriva la edad a partir de esto, nunca se confía en un "age" suelto
  contactInfo: { email: string; phone: string };
  loyaltyTier: 'bronze' | 'silver' | 'gold' | 'none';
}

interface FlightRecord {
  code: string;
  origin: string;
  destination: string;
  destinationCountry: string;  // usado por el filtro 3a para mapear a moneda
  departureDate: string;
  availableSeats: number;
  basePriceUSD: number;
}
```

## 9. Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/reservations/process` | Body: `{ reservations: ReservationRequest[], config?: DeepPartial<PipelineConfig> }`. Valida el body con zod (400 si está malformado — cubre el caso "datos malformados" del enunciado). Devuelve `PipelineResult`. |
| `GET` | `/reservations/:id/status` | Busca en el store en memoria poblado por el último `POST /reservations/process`. 404 si el id no existe. |
| `GET` | `/pipeline/config` | Devuelve el `PipelineConfig` actual completo. |
| `PUT` | `/pipeline/config` | Body: deep partial de `PipelineConfig`, validado con zod. Actualiza el singleton en memoria. |

## 10. Estructura de archivos planeada

```
src/
  app.ts                              # construcción de la app Express (sin levantar el server, para supertest)
  server.ts                           # levanta el server (usa app.ts)
  config/
    env.ts                            # lectura de variables de entorno
    defaultPipelineConfig.ts          # valores por defecto de PipelineConfig
  types/
    reservation.types.ts
    pipeline.types.ts
    passenger.types.ts
    flight.types.ts
  schemas/
    reservationRequest.schema.ts      # zod: valida el body de POST /reservations/process
    pipelineConfig.schema.ts          # zod: valida el body de PUT /pipeline/config
  data/
    mockPassengers.ts
    mockFlights.ts
    defaultExchangeRates.ts           # tabla de fallback
    countryCurrencyMap.ts             # "AR" -> "ARS", "BR" -> "BRL", etc.
  pipeline/
    Pipeline.ts                       # orquestador (sección 3)
    PipelineConfigStore.ts            # singleton en memoria + merge parcial
    context.ts                        # createInitialContext, finalize
  filters/
    Filter.ts                         # la interfaz (sección 2)
    PassengerValidationFilter.ts
    FlightValidationFilter.ts
    ExchangeRateEnrichmentFilter.ts   # 3a
    BasePriceCalculationFilter.ts
    LoyaltyDiscountFilter.ts
    PassengerTypeAdjustmentFilter.ts
    TaxAndFeesFilter.ts
    CurrencyConversionFilter.ts       # 3b
    index.ts                          # lista ordenada de filtros que usa el Pipeline
  services/
    ExchangeRateProvider.ts           # interfaz + implementación concreta (sección 6)
    ExchangeRateCache.ts              # cache TTL + deduplicación de pedidos en vuelo
    ReservationStore.ts               # Map en memoria para GET /status
  routes/
    reservations.routes.ts
    pipeline.routes.ts
  controllers/
    reservations.controller.ts
    pipeline.controller.ts
  middlewares/
    validateBody.ts                   # middleware genérico de validación zod
    errorHandler.ts                   # catch-all de errores no controlados
tests/
  unit/filters/*.test.ts              # uno por filtro
  unit/services/exchangeRateProvider.test.ts
  unit/services/exchangeRateCache.test.ts
  unit/pipeline/pipeline.test.ts
  integration/reservations.process.test.ts
  integration/reservations.status.test.ts
  integration/pipelineConfig.test.ts
  fixtures/requests.ts
  fixtures/exchangeRateResponses.ts
postman/
  M7A-grupo6-ejercicio1.postman_collection.json
  M7A-grupo6-ejercicio1.postman_environment.json
```

Esta estructura y los contratos de esta página son la base sobre la que se implementa el
código en la etapa siguiente.
