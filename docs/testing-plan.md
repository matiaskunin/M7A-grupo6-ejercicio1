# Plan de testing

Mapeo explícito entre los "Casos de Prueba Requeridos" de [`CONSIGNA.md`](../CONSIGNA.md) y el
test que los va a cubrir en la etapa de implementación. El objetivo es que, antes de escribir
un solo test, quede claro qué se va a probar, en qué nivel (unitario vs. integración) y con qué
datos mock — para que la cobertura del enunciado sea verificable por checklist y no quede
librada a la memoria de quien escriba el código.

Runner: **Jest + ts-jest + supertest** (justificación en `architecture.md`). Ningún test pega a
la red real: la API de tipo de cambio se mockea siempre (`fetch` interceptado).

## Flujo Básico de Reserva

| Caso del enunciado | Test | Nivel | Notas |
|---|---|---|---|
| Reserva válida con pasajero existente y vuelo disponible | `integration/reservations.process.test.ts` → `"reserva válida completa el pipeline"` | Integración | Usa un registro de `mockPassengers` activo + un `mockFlights` con asientos. Verifica `status: 'completed'` y que `pricing.totalUSD` esté seteado. |
| Reserva con pasajero inexistente | `unit/filters/passengerValidationFilter.test.ts` → `"pasajero no encontrado"` + `integration/reservations.process.test.ts` | Unit + Integración | Unit: contexto con `passengerId` que no existe en `mockPassengers` → `status: 'rejected'`, error `PASSENGER_NOT_FOUND`. Integración: mismo caso vía HTTP, confirma que el pipeline corta ahí (no llega a calcular precio). |
| Reserva para vuelo sin asientos disponibles | `unit/filters/flightValidationFilter.test.ts` → `"vuelo sin asientos disponibles"` | Unit | Requiere un registro en `mockFlights` con `availableSeats: 0` dedicado a este caso. Error `FLIGHT_NO_AVAILABILITY`. |
| Reserva con datos malformados | `integration/reservations.process.test.ts` → `"body malformado devuelve 400"` | Integración | Body sin `passengerId`, o `seatClass` inválido (no economy/business/first) → 400 por el middleware de validación zod, antes de entrar al pipeline. |

## Flujo de Cálculo de Precios

| Caso del enunciado | Test | Nivel | Notas |
|---|---|---|---|
| Reserva economy sin descuentos | `unit/pipeline/pipeline.test.ts` → `"economy, tier none, adult: sin descuentos"` | Unit (pipeline completo con filtros reales, sin HTTP) | `totalUSD` = `basePrice × 1.12 + 25 + basePrice × 0.08`, sin descuentos aplicados. |
| Pasajero Gold con descuento por lealtad | Mismo archivo → `"business, tier gold: aplica 15% de descuento de lealtad"` | Unit | Verifica que `subtotal` refleje el 15% off sobre `currentPrice`, no sobre `basePrice`. |
| Niño en clase business con descuentos combinados | Mismo archivo → `"business, gold, child: descuentos secuenciales combinados"` | Unit | Usa el ejemplo numérico exacto de `design-decisions.md` §1 (`$250 → $212.50 → $159.375`) como valor esperado — si alguien cambia el orden de aplicación por error, este test lo detecta. |
| Senior en primera clase con múltiples ajustes | Mismo archivo → `"first, senior, con/sin lealtad: ajustes combinados"` | Unit | Cubre el multiplicador ×4 de First junto con el 15% de Senior, y confirma que `fuelSurcharge` se calculó sobre `basePrice` (pre-descuento) y no sobre `subtotal`, según `design-decisions.md` §2. |

## Integración con API de Tipo de Cambio

| Caso del enunciado | Test | Nivel | Notas |
|---|---|---|---|
| Reserva exitosa con conversión de moneda aplicada | `integration/reservations.process.test.ts` → `"convierte a la moneda del país destino"` | Integración | `fetch` mockeado con una respuesta válida. Verifica `pricing.currency`, `pricing.totalConverted` y `metadata.exchangeRate.source === 'live'`. |
| Reserva con destino en país con moneda diferente | `unit/filters/exchangeRateEnrichmentFilter.test.ts` → `"mapea país destino a moneda correcta"` | Unit | Prueba varios países del `countryCurrencyMap` (AR→ARS, BR→BRL, US→USD, EU→EUR). |
| Manejo de errores cuando la API de tipo de cambio falla | `unit/services/exchangeRateProvider.test.ts` → `"fetch rechaza / responde error → fallback"` + `integration/reservations.process.test.ts` → `"API caída: continúa en USD con warning"` | Unit + Integración | `fetch` mockeado para rechazar. Confirma `status` de la reserva sigue `'completed'` (no se rechaza por esto), `metadata.exchangeRate.source === 'fallback'`, y hay un warning registrado. |
| Uso de cache de tasas de cambio | `unit/services/exchangeRateCache.test.ts` → `"segunda consulta dentro de 1h no llama a fetch"` | Unit | Reloj falso (`jest.useFakeTimers`), dos llamadas seguidas al provider con el mismo par de monedas → `fetch` se invoca una sola vez. Un tercer test verifica que pasada 1h simulada, sí se vuelve a llamar. |

## Casos de Error

| Caso del enunciado | Test | Nivel | Notas |
|---|---|---|---|
| Timeout en llamada a API externa | `unit/services/exchangeRateProvider.test.ts` → `"timeout a los 5s aborta y cae a fallback"` | Unit | `fetch` mockeado para no resolver nunca; se verifica que `AbortController` corta a los 5000ms (con fake timers) y el resultado es `source: 'fallback'`, sin que el test tarde 5s reales. |
| Filtro que lanza excepción | `unit/pipeline/pipeline.test.ts` → `"un filtro que lanza excepción no tumba el batch"` | Unit | Se inyecta un filtro de prueba (double) que lanza `throw new Error(...)` a propósito. Verifica que esa reserva queda `status: 'error'` con el error registrado, y que las demás reservas del mismo batch se procesan normalmente. |
| Pipeline interrumpido por falla de red | `integration/reservations.process.test.ts` → `"falla de red en una reserva no afecta a las demás del batch"` | Integración | Batch con 3 reservas; se mockea `fetch` para fallar solo en la llamada asociada a una de ellas (o simplemente falla siempre, ya que el manejo es el mismo) → las otras 2 reservas completan normalmente. |
| Datos corruptos en mitad del pipeline | `unit/filters/basePriceCalculationFilter.test.ts` (y equivalentes en 5/6/7) → `"contexto sin basePrice: no rompe, agrega warning"` | Unit | Simula que un filtro anterior fue deshabilitado (por config) dejando `pricing.basePrice` sin definir; el filtro siguiente debe hacer no-op defensivo + warning, no lanzar ni producir `NaN`. Cubre el caso de robustez mencionado en `architecture.md` §7. |

## Casos adicionales identificados durante el diseño (no vienen explícitos en el enunciado, pero se desprenden de sus reglas)

| Caso | Test | Justificación |
|---|---|---|
| Array de reservas vacío | `integration/reservations.process.test.ts` → `"array vacío devuelve 200 con resultados vacíos"` | El enunciado no dice que deba ser un error; un array vacío es una entrada válida. |
| Origen/destino de la reserva no coincide con los del vuelo | `unit/filters/flightValidationFilter.test.ts` → `"origen o destino no coincide con el vuelo"` | Está explícitamente en la sección "Para el Filtro de Validación de Vuelo" del enunciado. |
| Fecha de vuelo exactamente igual a "ahora" | `unit/filters/flightValidationFilter.test.ts` → `"fecha de salida = ahora no es futura"` | Caso límite de "la fecha de salida debe ser futura". |
| `passengerType` del cliente no coincide con la edad real | `unit/filters/passengerTypeAdjustmentFilter.test.ts` → `"warning si el tipo declarado no coincide con la edad, pero usa el derivado"` | Consecuencia directa de la decisión en `design-decisions.md` §4. |
| `PUT /pipeline/config` con valores fuera de rango | `integration/pipelineConfig.test.ts` → `"rechaza descuento > 1 o tasa negativa con 400"` | Consecuencia de que la config se valida con zod. |
| `GET /reservations/:id/status` con id inexistente | `integration/reservations.status.test.ts` → `"404 si el id no existe"` | Comportamiento estándar de un endpoint de consulta por id. |
| Filtro `currencyConversion` deshabilitado por config | `integration/reservations.process.test.ts` → `"con currencyConversion deshabilitado, el total queda en USD"` | Verifica que apagar un filtro por config realmente cambia el comportamiento observable, no solo internamente. |

## Datos mock necesarios para soportar estos casos

`data/mockPassengers.ts` y `data/mockFlights.ts` deben incluir, como mínimo (a completar en la
etapa de código, cada registro comentado con qué caso de esta tabla cubre):

- Un pasajero activo (Adult, con loyaltyTier variado: uno bronze, uno silver, uno gold).
- Un pasajero inactivo (`isActive: false`).
- Un pasajero cuya edad real lo hace `child` (<12) y otro `senior` (>65).
- Un vuelo con asientos disponibles y uno con `availableSeats: 0`.
- Vuelos con distintos `destinationCountry` (al menos AR, BR, US, EU) para probar conversión de
  moneda.
- Un vuelo con fecha de salida futura y uno con fecha pasada (para el caso de rechazo por
  fecha).
