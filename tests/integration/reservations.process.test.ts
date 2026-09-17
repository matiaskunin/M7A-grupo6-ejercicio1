/**
 * Tests de integración de POST /reservations/process — docs/testing-plan.md.
 *
 * Cubren los casos transversales asignados al paquete de Dev 5: body malformado (400), array
 * vacío, batch con fallas parciales, override puntual de config y filtro deshabilitado.
 *
 * Corren contra el pipeline REAL de 8 filtros, pero con el proveedor de tasas mockeado
 * (ver tests/fixtures/requests.ts): ningún test pega a la red.
 */

import request from 'supertest';
import {
  buildTestApp,
  malformedReservationBadSeatClass,
  malformedReservationMissingField,
  reservationNoSeats,
  reservationToBrazil,
  reservationUnknownPassenger,
  validReservation,
  STUB_RATE,
} from '../fixtures/requests';

describe('POST /reservations/process', () => {
  it('procesa una reserva válida y devuelve el PipelineResult completo', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [validReservation()] });

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({ total: 1, completed: 1, rejected: 0, errored: 0 });
    expect(typeof response.body.totalProcessingTimeMs).toBe('number');

    const [result] = response.body.results;
    expect(result.status).toBe('completed');
    expect(result.id).toBe('RES-OK-1');
    expect(result.pricing.totalUSD).toBeGreaterThan(0);
    expect(result.metadata.filtersApplied.length).toBeGreaterThan(0);
  });

  it('body malformado devuelve 400', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [malformedReservationMissingField] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.issues.some((issue: { path: string }) => issue.path.includes('passengerId'))).toBe(true);
  });

  it('seatClass fuera del enum devuelve 400 sin entrar al pipeline', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [malformedReservationBadSeatClass] });

    expect(response.status).toBe(400);
    expect(response.body.issues.some((issue: { path: string }) => issue.path.includes('seatClass'))).toBe(true);
  });

  it('body sin la clave "reservations" devuelve 400', async () => {
    const { app } = buildTestApp();

    const response = await request(app).post('/reservations/process').send({ foo: 'bar' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('JSON sintácticamente inválido devuelve 400, no 500', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .set('Content-Type', 'application/json')
      .send('{"reservations": [');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_JSON');
  });

  it('array vacío devuelve 200 con resultados vacíos', async () => {
    const { app } = buildTestApp();

    const response = await request(app).post('/reservations/process').send({ reservations: [] });

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([]);
    expect(response.body.summary).toEqual({ total: 0, completed: 0, rejected: 0, errored: 0 });
  });

  it('un batch con fallas parciales procesa el resto y las reporta por separado', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          validReservation({ reservationId: 'OK-1' }),
          reservationUnknownPassenger(),
          reservationNoSeats(),
          validReservation({ reservationId: 'OK-2' }),
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({ total: 4, completed: 2, rejected: 2 });

    const byId = Object.fromEntries(
      response.body.results.map((result: { id: string }) => [result.id, result]),
    );
    expect(byId['OK-1'].status).toBe('completed');
    expect(byId['OK-2'].status).toBe('completed');
    expect(byId['RES-NO-PASS'].status).toBe('rejected');
    expect(byId['RES-NO-PASS'].errors.length).toBeGreaterThan(0);
    expect(byId['RES-NO-SEATS'].status).toBe('rejected');
  });

  it('aplica la conversión de moneda para un destino con moneda distinta de la base', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationToBrazil()] });

    const [result] = response.body.results;
    expect(result.status).toBe('completed');
    expect(result.metadata.exchangeRate).toMatchObject({ base: 'USD', target: 'BRL' });
    expect(result.pricing.currency).toBe('BRL');
    expect(result.pricing.totalConverted).toBeCloseTo(result.pricing.totalUSD * STUB_RATE, 2);
  });

  it('con currencyConversion deshabilitado, el total queda en USD', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [reservationToBrazil()],
        config: { filters: { currencyConversion: { enabled: false } } },
      });

    const [result] = response.body.results;
    expect(result.status).toBe('completed');
    expect(result.pricing.totalUSD).toBeGreaterThan(0);
    expect(result.pricing.totalConverted).toBeUndefined();
    expect(result.metadata.filtersApplied).not.toContain('currencyConversion');
  });

  it('el config de la request aplica solo a esa corrida y no pisa el singleton global', async () => {
    const { app, configStore } = buildTestApp();
    const airportFeeAntes = configStore.getConfig().filters.taxAndFees.params.airportFee;

    await request(app)
      .post('/reservations/process')
      .send({
        reservations: [validReservation()],
        config: { filters: { taxAndFees: { params: { airportFee: 999 } } } },
      });

    expect(configStore.getConfig().filters.taxAndFees.params.airportFee).toBe(airportFeeAntes);
  });

  it('un config inválido en la request devuelve 400', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [validReservation()],
        config: { filters: { loyaltyDiscount: { params: { rates: { gold: 5 } } } } },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});
