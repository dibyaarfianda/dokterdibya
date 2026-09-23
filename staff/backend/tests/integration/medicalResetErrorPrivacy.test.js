'use strict';

const express = require('express');
const request = require('supertest');
const mockDb = require('../helpers/medicalRecordDatabase')();
jest.mock('../../db', () => mockDb);
jest.mock('../../utils/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), http: jest.fn() }));
jest.mock('../../realtime-sync', () => ({ broadcast: jest.fn() }));
const logger = require('../../utils/logger');
const medicalRoutes = require('../../routes/medical-records');
const { requestLogger, performanceLogger } = require('../../middleware/requestLogger');
const { errorHandler, AppError, getErrorMetrics, resetErrorMetrics } = require('../../middleware/errorHandler');

const mrMarker = 'PRIVATERESET999';
const patientMarker = 'PRIVATE_PATIENT_SENTINEL';
const logged = () => JSON.stringify(Object.values(logger).flatMap(fn => fn.mock.calls));

function appWithErrorBoundary(injectedError) {
    const app = express();
    app.use(requestLogger, performanceLogger);
    // Same real body parsers, content types and limits as server.js; a parser
    // error reaches errorHandler before any route authentication or transaction.
    app.use(express.json({ limit: '10mb', type: ['application/json', 'application/csp-report', 'application/reports+json'] }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    if (injectedError) app.use((req, res, next) => {
        req.context = { requestId: mrMarker, correlationId: patientMarker, traceId: mrMarker };
        next(injectedError());
    });
    app.use(medicalRoutes);
    app.use(errorHandler);
    return app;
}

function resetRequest(app, legacy) {
    return legacy
        ? request(app).delete('/api/medical-records/by-type/usg').query({ mrId: mrMarker, patientId: patientMarker })
        : request(app).post(`/api/medical-records/${mrMarker}/sections/usg/reset`);
}

function expectPrivateFailure() {
    const metrics = getErrorMetrics();
    expect(metrics.total).toBe(1);
    expect(metrics.recent).toHaveLength(1);
    for (const output of [logged(), JSON.stringify(metrics)]) {
        expect(output).not.toContain(mrMarker);
        expect(output).not.toContain(patientMarker);
    }
    expect(mockDb.events.some(event => ['begin', 'commit', 'broadcast'].includes(event.kind))).toBe(false);
    expect(mockDb.state().records).toHaveLength(0);
    expect(mockDb.state().documents).toHaveLength(0);
    expect(mockDb.state().revisions).toHaveLength(0);
}

beforeEach(() => {
    process.env.NODE_ENV = 'production';
    mockDb.reset();
    resetErrorMetrics();
    jest.clearAllMocks();
});
afterEach(() => { process.env.NODE_ENV = 'test'; });

describe.each([false, true])('reset parser/global error privacy, legacy=%s', legacy => {
    test('malformed JSON is a private 400 before route mutation', async () => {
        const response = await resetRequest(appWithErrorBoundary(), legacy)
            .set('Content-Type', 'application/json').send(`{"patientId":"${patientMarker}","broken":`);
        expect(response.status).toBe(400);
        expect(response.body.code).toBe('INVALID_JSON');
        expectPrivateFailure();
    });

    test.each(['application/json', 'application/x-www-form-urlencoded'])('oversized %s is a private 413 before route mutation', async contentType => {
        const large = 'x'.repeat(10 * 1024 * 1024);
        const body = contentType === 'application/json'
            ? JSON.stringify({ patientId: patientMarker, large })
            : `patientId=${patientMarker}&large=${large}`;
        const response = await resetRequest(appWithErrorBoundary(), legacy).set('Content-Type', contentType).send(body);
        expect(response.status).toBe(413);
        expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
        expectPrivateFailure();
    });

    test.each([
        ['production', true], ['production', false], ['development', true], ['development', false]
    ])('%s operational=%s filters final stack/raw exception metadata and metric keys', async (environment, operational) => {
        process.env.NODE_ENV = environment;
        const target = appWithErrorBoundary(() => {
            const error = new AppError(`Raw ${mrMarker} ${patientMarker}`, 500, operational, `${mrMarker}_CODE`);
            error.name = `${patientMarker}_ERROR`;
            error.stack = `Raw stack ${patientMarker} ${mrMarker}`;
            error.privateData = { patient: patientMarker, mr: mrMarker };
            return error;
        });
        expect((await resetRequest(target, legacy).send({ patientId: patientMarker })).status).toBe(500);
        expectPrivateFailure();
        if (environment === 'development') expect(logger.error).toHaveBeenCalledWith('ERROR (Development)', expect.any(Object));
        else if (operational) expect(logger.warn).toHaveBeenCalledWith('Operational error', expect.any(Object));
        else expect(logger.error).toHaveBeenCalledWith('Programming error', expect.any(Object));
    });
});

test.each(['production', 'development'])('ordinary %s errors retain useful message, stack, code and metric diagnostics', async environment => {
    process.env.NODE_ENV = environment;
    const target = appWithErrorBoundary(() => {
        const error = new AppError('Ordinary diagnostic detail', 500, false, 'DIAGNOSTIC_CODE');
        error.stack = 'Ordinary diagnostic stack';
        return error;
    });
    expect((await request(target).post('/api/operational-failure').send({})).status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(environment === 'development' ? 'ERROR (Development)' : 'Programming error', expect.objectContaining({
        path: '/api/operational-failure', message: 'Ordinary diagnostic detail', stack: 'Ordinary diagnostic stack', code: 'DIAGNOSTIC_CODE'
    }));
    expect(getErrorMetrics()).toMatchObject({ total: 1, byCode: { DIAGNOSTIC_CODE: 1 }, recent: [expect.objectContaining({ message: 'Ordinary diagnostic detail', code: 'DIAGNOSTIC_CODE' })] });
});

test('reset error metrics never retain raw exception messages or dynamic code keys', async () => {
    const target = appWithErrorBoundary(() => new AppError(`${mrMarker} ${patientMarker}`, 500, false, `${patientMarker}_CODE`));
    expect((await resetRequest(target, false).send({})).status).toBe(500);
    const metrics = JSON.stringify(getErrorMetrics());
    expect(metrics).not.toContain(mrMarker);
    expect(metrics).not.toContain(patientMarker);
});
