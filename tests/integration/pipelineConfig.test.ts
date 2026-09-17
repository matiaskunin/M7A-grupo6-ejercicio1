/**
 * Tests de integración de GET / PUT /pipeline/config — docs/testing-plan.md.
 *
 * El caso central del enunciado es que la config sea realmente modificable y que el cambio se
 * note en el comportamiento del pipeline, no solo en la respuesta del PUT.
 */

import request from 'supertest';
import { buildTestApp, reservationToBrazil, validReservation } from '../fixtures/requests';

describe('GET /pipeline/config', () => {
  it('devuelve la configuración completa vigente', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/pipeline/config');

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.filters)).toEqual([
      'passengerValidation',
      'flightValidation',
      'exchangeRateEnrichment',
      'basePriceCalculation',
      'loyaltyDiscount',
      'passengerTypeAdjustment',
      'taxAndFees',
      'currencyConversion',
    ]);
    expect(response.body.filters.taxAndFees.params.taxRate).toBe(0.12);
    expect(response.body.exchangeRateFallback).toBeDefined();
  });
});

describe('PUT /pipeline/config', () => {
  it('aplica un merge parcial sin pisar el resto de la configuración', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .put('/pipeline/config')
      .send({ filters: { taxAndFees: { params: { airportFee: 50 } } } });

    expect(response.status).toBe(200);
    expect(response.body.filters.taxAndFees.params.airportFee).toBe(50);
    // Lo que no vino en el patch queda intacto.
    expect(response.body.filters.taxAndFees.params.taxRate).toBe(0.12);
    expect(response.body.filters.basePriceCalculation.params.multipliers.business).toBe(2.5);
  });

  it('el cambio persiste y lo ve el siguiente GET', async () => {
    const { app } = buildTestApp();

    await request(app)
      .put('/pipeline/config')
      .send({ filters: { taxAndFees: { params: { airportFee: 77 } } } });

    const response = await request(app).get('/pipeline/config');

    expect(response.body.filters.taxAndFees.params.airportFee).toBe(77);
  });

  it('deshabilitar un filtro cambia el resultado observable del pipeline', async () => {
    const { app } = buildTestApp();

    const antes = await request(app)
      .post('/reservations/process')
      .send({ reservations: [validReservation({ passengerId: 'PASS-ADULT-GOLD' })] });

    await request(app)
      .put('/pipeline/config')
      .send({ filters: { loyaltyDiscount: { enabled: false } } });

    const despues = await request(app)
      .post('/reservations/process')
      .send({ reservations: [validReservation({ passengerId: 'PASS-ADULT-GOLD' })] });

    expect(despues.body.results[0].metadata.filtersApplied).not.toContain('loyaltyDiscount');
    // Sin el descuento de lealtad, el total tiene que ser mayor.
    expect(despues.body.results[0].pricing.totalUSD).toBeGreaterThan(
      antes.body.results[0].pricing.totalUSD,
    );
  });

  it('rechaza descuento > 1 o tasa negativa con 400', async () => {
    const { app } = buildTestApp();

    const descuentoFueraDeRango = await request(app)
      .put('/pipeline/config')
      .send({ filters: { loyaltyDiscount: { params: { rates: { gold: 1.5 } } } } });

    expect(descuentoFueraDeRango.status).toBe(400);
    expect(descuentoFueraDeRango.body.error).toBe('VALIDATION_ERROR');

    const tasaNegativa = await request(app)
      .put('/pipeline/config')
      .send({ filters: { taxAndFees: { params: { taxRate: -0.1 } } } });

    expect(tasaNegativa.status).toBe(400);
  });

  it('rechaza un monto negativo con 400', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .put('/pipeline/config')
      .send({ filters: { taxAndFees: { params: { airportFee: -5 } } } });

    expect(response.status).toBe(400);
  });

  it('un patch inválido no deja la config a medio aplicar', async () => {
    const { app } = buildTestApp();

    await request(app)
      .put('/pipeline/config')
      .send({
        filters: {
          taxAndFees: { params: { airportFee: 40 } },
          loyaltyDiscount: { params: { rates: { gold: 99 } } },
        },
      });

    const response = await request(app).get('/pipeline/config');

    expect(response.body.filters.taxAndFees.params.airportFee).toBe(25);
    expect(response.body.filters.loyaltyDiscount.params.rates.gold).toBe(0.15);
  });
});

/**
 * CONSIGNA.md, "Caching de Tasas": la cache tiene TTL de 1 hora pero debe poder invalidarse a
 * mano. Sin este endpoint el `clear()` de ExchangeRateCache era inalcanzable desde afuera.
 */
describe('DELETE /pipeline/cache', () => {
  it('vacía la cache de tasas y reporta cuántas entradas eliminó', async () => {
    const { app, exchangeRateProvider } = buildTestApp();
    const cache = exchangeRateProvider.getCache();

    cache.set('USD', 'BRL', 5.4, 60_000);
    cache.set('USD', 'ARS', 1000, 60_000);
    expect(cache.size()).toBe(2);

    const response = await request(app).delete('/pipeline/cache');

    expect(response.status).toBe(200);
    expect(response.body.entriesRemoved).toBe(2);
    expect(cache.size()).toBe(0);
  });

  it('es idempotente: invalidar una cache ya vacía no falla', async () => {
    const { app } = buildTestApp();

    const primera = await request(app).delete('/pipeline/cache');
    const segunda = await request(app).delete('/pipeline/cache');

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(segunda.body.entriesRemoved).toBe(0);
  });

  it('vacía la misma cache que usa el pipeline, no una instancia aparte', async () => {
    const { app, exchangeRateProvider } = buildTestApp();

    // Una reserva procesada deja la cache del provider compartido al alcance del endpoint.
    await request(app).post('/reservations/process').send({ reservations: [reservationToBrazil()] });

    exchangeRateProvider.getCache().set('USD', 'BRL', 5.4, 60_000);
    await request(app).delete('/pipeline/cache');

    expect(exchangeRateProvider.getCache().size()).toBe(0);
  });

  it('el pipeline sigue funcionando después de invalidar la cache', async () => {
    const { app } = buildTestApp();

    await request(app).delete('/pipeline/cache');
    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [validReservation()] });

    expect(response.status).toBe(200);
    expect(response.body.results[0].status).toBe('completed');
  });
});
