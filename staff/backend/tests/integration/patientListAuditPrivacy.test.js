'use strict';

const express = require('express');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
jest.mock('../../utils/logger', () => ({ http: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() }));
const logger = require('../../utils/logger');
const { requestLogger, performanceLogger } = require('../../middleware/requestLogger');
const { metricsMiddleware, getMetrics } = require('../../middleware/metrics');
const { requestAuditUrl } = require('../../utils/requestAudit');

test('patient list access, performance, error and metrics logs omit search/cursor/patient identifiers', async () => {
    const name = 'SYNTHETIC_PATIENT_NAME';
    const patientId = 'PRIVATE_PATIENT_ID';
    const cursor = Buffer.from(JSON.stringify({ keys: [name, patientId] })).toString('base64url');
    const target = express();
    target.use(metricsMiddleware, requestLogger, performanceLogger);
    target.get('/api/patients', (req, res) => res.status(500).json({ success: false }));
    jest.clearAllMocks();
    const response = await request(target).get(`/api/patients?search=${name}&cursor=${cursor}`).expect(500);
    expect(requestAuditUrl({ method: 'GET', originalUrl: `/api/patients?search=${name}&cursor=${cursor}` })).toBe('/api/patients');
    expect(logger.http).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
    const logs = JSON.stringify(Object.values(logger).flatMap(fn => fn.mock.calls));
    const metrics = JSON.stringify(getMetrics());
    for (const sentinel of [name, patientId, cursor]) {
        expect(logs).not.toContain(sentinel);
        expect(metrics).not.toContain(sentinel);
    }
    expect(logs).toContain('/api/patients');
    expect(logs).toContain('500');
    expect(response.status).toBe(500);
});

test('legacy native-app blocker also redacts patient-list query logging', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
    const blocker = source.split('function isLegacyPatientNativeAppRequest(req) {')[1]
        .split('// Smart rate limiting')[0];
    const target = express();
    vm.runInNewContext(`function isLegacyPatientNativeAppRequest(req) {${blocker}`, {
        app: target, logger, requestAuditUrl, LEGACY_PATIENT_NATIVE_APP_MESSAGE: 'Retired'
    });
    jest.clearAllMocks();
    await request(target).get('/api/patients?search=SYNTHETIC_PATIENT_NAME&cursor=PRIVATE_CURSOR')
        .set('User-Agent', 'Android; wv) Version/1').expect(410);
    const logs = JSON.stringify(logger.warn.mock.calls);
    expect(logs).toContain('/api/patients');
    expect(logs).not.toContain('SYNTHETIC_PATIENT_NAME');
    expect(logs).not.toContain('PRIVATE_CURSOR');
});

test('advanced patient search identifiers are redacted at the same audit boundary', async () => {
    const target = express();
    target.use(metricsMiddleware, requestLogger, performanceLogger);
    target.get('/api/patients/search/advanced', (req, res) => res.status(500).json({ success: false }));
    jest.clearAllMocks();
    await request(target).get('/api/patients/search/advanced?name=SYNTHETIC_PATIENT_NAME&mr_id=PRIVATE_MR_ID').expect(500);
    const logs = JSON.stringify(Object.values(logger).flatMap(fn => fn.mock.calls));
    expect(logs).not.toContain('SYNTHETIC_PATIENT_NAME');
    expect(logs).not.toContain('PRIVATE_MR_ID');
    expect(logs).toContain('/api/patients/search/advanced');
});
