# Decisiones de diseño

El enunciado ([`CONSIGNA.md`](../CONSIGNA.md)) deja varios puntos de negocio ambiguos o
subespecificados. Este documento registra cómo se resolvió cada uno, con quién se confirmó, y
por qué — para que el equipo (y quien retome el trabajo) no tenga que volver a discutirlos ni
adivinar el motivo de una fórmula puntual en el código.

Todas las decisiones de esta página fueron confirmadas explícitamente con el usuario antes de
fijarse en [`architecture.md`](./architecture.md).

## 1. Cómo se combinan el descuento de lealtad y el de tipo de pasajero

**Decisión: secuencial/compuesto.** El filtro 5 (lealtad) aplica su porcentaje sobre el precio
que recibe de entrada (`currentPrice`, salida del filtro 4). El filtro 6 (tipo de pasajero)
aplica el suyo sobre el resultado del filtro 5. No se suman los dos porcentajes para aplicarlos
de una sola vez.

**Alternativa descartada:** sumar los porcentajes (ej. Gold 15% + Child 25% = 40%) y aplicar
ese total una sola vez sobre el precio base original.

**Por qué:** el enunciado pide que "cada filtro debe ser independiente y testeable por
separado". Si se sumaran los porcentajes, el filtro 6 necesitaría saber qué porcentaje ya
aplicó el filtro 5 (o viceversa) para no pisarlo — los acopla. Con la aplicación secuencial,
cada filtro solo necesita el precio de entrada y su propio porcentaje; no le importa qué pasó
antes. Es también el comportamiento más común en sistemas de pricing reales (descuentos que se
aplican en cascada, no que se suman).

**Ejemplo numérico** (Business, precio base USD $100):

| Paso | Cálculo | Resultado |
|------|---------|-----------|
| Filtro 4 (Business ×2.5) | `100 × 2.5` | `$250.00` |
| Filtro 5 (Gold 15%) | `250 × (1 − 0.15)` | `$212.50` |
| Filtro 6 (Child 25%) | `212.50 × (1 − 0.25)` | `$159.375` |

Con la alternativa descartada (sumado sobre base) el resultado hubiese sido `250 × (1 − 0.40) =
$150.00` — un valor distinto. Este ejemplo queda como caso de test explícito (ver
[`testing-plan.md`](./testing-plan.md), caso "niño en business con descuentos combinados").

## 2. Base de cálculo del impuesto (12%) vs. del recargo de combustible (8%)

El enunciado usa dos términos distintos para las bases de estos dos cargos:
- "Impuestos base: **12% del precio**" (genérico, sin nombre)
- "Sobrecargos por combustible: **8% del precio base**" (usa el término específico "precio
  base", que el enunciado ya usó antes para nombrar la salida del filtro 4)

**Decisión:**
- El **recargo de combustible (8%)** se calcula sobre `pricing.basePrice` — la salida literal
  del filtro 4 (precio según clase de asiento, *antes* de cualquier descuento). Es la lectura
  más literal: el enunciado nombra "precio base" como un término específico en otro punto del
  documento, y acá lo repite a propósito.
- El **impuesto base (12%)** se calcula sobre `pricing.subtotal` — la salida del filtro 6
  (precio *después* de aplicar lealtad y tipo de pasajero). Se interpretó que el uso de la
  palabra genérica "precio" (sin el calificador "base") en este punto se refiere al precio que
  el pasajero efectivamente va a pagar en ese momento del pipeline, no al precio de lista.
- La **tasa de aeropuerto ($25 fijos)** no depende de ninguna base — es un monto fijo por
  reserva.

**Por qué esta lectura y no la alternativa** (ambos cargos sobre `basePrice`, ignorando
`subtotal`): el enunciado eligió deliberadamente dos términos distintos ("el precio" vs. "el
precio base") en dos bullets consecutivos del mismo filtro — si hubiese querido la misma base
para ambos, no tendría sentido nombrarla distinto. Aun así, esta es una interpretación, no algo
100% inequívoco en el texto original — quedó documentada acá explícitamente para que, si en
algún momento se cuestiona (por ejemplo en una corrección), el motivo de la elección esté a
mano y se pueda ajustar en un solo lugar (`TaxAndFeesFilter`).

**Fórmula final del filtro 7:**

```
tax           = 0.12 × subtotal        (subtotal = salida del filtro 6, post-descuentos)
airportFee    = 25                     (fijo)
fuelSurcharge = 0.08 × basePrice       (basePrice = salida del filtro 4, pre-descuentos)
totalUSD      = subtotal + tax + airportFee + fuelSurcharge
```

## 3. Proveedor de la API de tipo de cambio

**Decisión: usar la API sugerida explícitamente por el enunciado**,
`https://api.exchangerate-api.com/v4/latest/{base_currency}` (sin autenticación).

**Contexto de la decisión:** ese endpoint específico corresponde a una versión gratuita legacy
del servicio, que con el tiempo puede volverse menos confiable o dejar de estar disponible tal
cual está documentada. Se evaluó como alternativa usar un proveedor distinto (Frankfurter,
`https://api.frankfurter.app/latest`, gratuito y sin API key, basado en tasas del BCE) por ser
más estable a largo plazo. **El usuario decidió mantener la API del enunciado**, ya que:

- Es la que el enunciado pide explícitamente, y sirve para probar el camino de fallback en la
  práctica si esa API efectivamente falla o quedó desactualizada (uno de los "Casos de Prueba
  Requeridos" es justamente "manejo de errores cuando la API de tipo de cambio falla").
- El diseño ya exige que el sistema funcione correctamente aunque la API externa no responda
  (timeout, retry, fallback a tasas por defecto) — así que la confiabilidad del proveedor
  elegido no es un punto crítico para que el sistema funcione.

**Mitigación:** el acceso a la API vive detrás de la interfaz `ExchangeRateProvider`
(ver [`architecture.md`](./architecture.md#6-la-integración-con-la-api-de-tipo-de-cambio)), así
que cambiar de proveedor en el futuro (por ejemplo, si esta API deja de funcionar durante el
desarrollo) es reemplazar una única implementación, sin tocar ningún filtro.

## 4. Confianza en el campo `passengerType` enviado por el cliente

**Decisión:** el tipo de pasajero (`child` / `senior` / `adult`) **siempre se deriva de la edad
real** del pasajero (calculada desde `birthDate`, usando los umbrales configurables `<12` y
`>65`), nunca del valor que venga en el request.

**Alternativa descartada:** confiar directamente en el `passengerType` que manda el cliente en
el body.

**Por qué:** el enunciado pide explícitamente, en el filtro 1, "confirmar edad vs tipo de
pasajero" — lo cual ya sugiere que el sistema no debe confiar ciegamente en el tipo declarado.
Además, si se confiara en el valor del cliente, cualquiera podría mandar `"passengerType":
"child"` para un adulto y obtener el 25% de descuento sin que el sistema lo detecte — un bug de
negocio explotable. Con la derivación desde la edad, el campo enviado por el cliente se usa
solo como un valor informativo: si no coincide con lo derivado de la edad, el filtro 1 agrega
un **warning** (`PASSENGER_TYPE_MISMATCH` o similar) pero el cálculo de precio sigue usando el
tipo derivado, no el declarado.

## 5. Otros supuestos menores (no requirieron confirmación explícita, documentados por trazabilidad)

- **`GET /reservations/:id/status` usa un store en memoria** (`Map<string, ProcessedReservation>`
  poblado por cada `POST /reservations/process`), no una base de datos. No persiste entre
  reinicios del servidor ni se comparte entre instancias — aceptable para el alcance de este
  ejercicio (no se pide persistencia en `CONSIGNA.md`). Documentado también en
  `architecture.md`.
- **La configuración del pipeline (`PipelineConfig`) también vive en memoria**, como singleton
  seedeado desde valores por defecto. `PUT /pipeline/config` lo modifica in-place; no hay
  persistencia entre reinicios. Mismo criterio que el punto anterior.
- **Los datos mock** (`mockPassengers.ts`, `mockFlights.ts`) se diseñan para cubrir a propósito
  los casos de prueba pedidos por el enunciado (pasajero activo/inactivo, vuelo con/sin
  asientos disponibles, distintos países de destino para probar la conversión de moneda,
  fechas pasadas/futuras). El detalle de qué registro cubre qué caso se documenta en
  [`testing-plan.md`](./testing-plan.md).
- **Deduplicación de pedidos concurrentes a la API de cambio:** si dos reservas del mismo batch
  piden la tasa de la misma moneda al mismo tiempo y todavía no hay nada en cache, se
  comparte una única promesa en vuelo en vez de disparar dos llamadas HTTP redundantes. No lo
  pide el enunciado explícitamente, pero se desprende del requerimiento de cache/eficiencia y
  evita duplicar consumo de la cuota gratuita de la API externa.

## Trazabilidad: enunciado → dónde se resuelve

| Punto del enunciado | Dónde se define/resuelve |
|---|---|
| 7 filtros y su orden | `architecture.md` §5 |
| Habilitar/deshabilitar filtros | `architecture.md` §3 y §7 (`PipelineConfig`) |
| Timeout 5s / retry 3 / cache 1h / fallback de la API de cambio | `architecture.md` §6 |
| Detección de moneda por país | `architecture.md` §5 (filtro 3a) + `data/countryCurrencyMap.ts` |
| Robustez ante fallo de un filtro | `architecture.md` §3 (try/catch del orquestador) |
| Datos mock en archivos separados, cargados al inicio | `architecture.md` §10 (`data/mockPassengers.ts`, `data/mockFlights.ts`) |
| 4 endpoints requeridos | `architecture.md` §9 |
| Casos de prueba requeridos | [`testing-plan.md`](./testing-plan.md) |
