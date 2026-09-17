/**
 * Tests de integración de GET /reservations/:id/status — docs/testing-plan.md.
 *
 * El store se puebla únicamente desde POST /reservations/process, así que cada test procesa
 * primero y consulta después, usando la misma app (mismo store).
 */

import request from 'supertest';
import {
  buildTestApp,
  reservationUnknownPassenger,
  validReservation,
} from '../fixtures/requests';

describe('GET /reservations/:id/status', () => {
  it('devuelve el estado de una reserva ya procesada', async () => {
    const { app } = buildTestApp();

    await request(app)
      .post('/reservations/process')
      .send({ reservations: [validReservation({ reservationId: 'RES-STATUS-1' })] });

    const response = await request(app).get('/reservations/RES-STATUS-1/status');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'RES-STATUS-1',
      status: 'completed',
      passengerId: 'PASS-ADULT-NONE',
      flightCode: 'FL-US-001',
    });
    expect(response.body.pricing.totalUSD).toBeGreaterThan(0);
    expect(Array.isArray(response.body.metadata.filtersApplied)).toBe(true);
  });

  it('404 si el id no existe', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/reservations/NO-EXISTE/status');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('RESERVATION_NOT_FOUND');
  });

  it('404 si todavía no se procesó ninguna reserva', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/reservations/RES-OK-1/status');

    expect(response.status).toBe(404);
  });

  it('también expone las reservas rechazadas, no solo las completadas', async () => {
    const { app } = buildTestApp();

    await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationUnknownPassenger()] });

    const response = await request(app).get('/reservations/RES-NO-PASS/status');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('rejected');
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it('un id repetido en un batch posterior refleja el último procesamiento', async () => {
    const { app } = buildTestApp();

    await request(app)
      .post('/reservations/process')
      .send({ reservations: [validReservation({ reservationId: 'RES-DUP' })] });

    await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          validReservation({ reservationId: 'RES-DUP', passengerId: 'PASS-NO-EXISTE' }),
        ],
      });

    const response = await request(app).get('/reservations/RES-DUP/status');

    expect(response.body.status).toBe('rejected');
  });

  it('una ruta inexistente devuelve 404 con cuerpo JSON', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/ruta-que-no-existe');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('ROUTE_NOT_FOUND');
  });
});
