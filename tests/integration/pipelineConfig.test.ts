/**
 * Tests de integración de GET / PUT /pipeline/config — docs/testing-plan.md.
 *
 * El caso central del enunciado es que la config sea realmente modificable y que el cambio se
 * note en el comportamiento del pipeline, no solo en la respuesta del PUT.
 */

import request from 'supertest';
import { buildTestApp, validReservation } from '../fixtures/requests';

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
