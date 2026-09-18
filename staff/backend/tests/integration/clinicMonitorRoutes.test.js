const request = require('supertest');
const express = require('express');
const { createRouter, createWebhookRouter } = require('../../routes/clinic-monitor');
const { validateArchive, MAX_FILE } = require('../../services/ClinicHospitalMonitor');

function app(service) {
    const server = express();
    server.use(express.json({ limit: '10mb' }));
    server.use('/api/integration/comm', createRouter(() => service));
    server.use('/webhook', createWebhookRouter(() => service));
    return server;
}
beforeEach(() => { process.env.COMM_API_KEY = 'synthetic-api-key'; });
afterEach(() => { delete process.env.COMM_API_KEY; });
test('every monitor route rejects missing/forged service credentials', async () => {
    const service = { dashboard: jest.fn() };
    const paths = ['/clinic-monitor','/clinic-monitor/events/fake','/clinic-monitor/archive-jobs','/clinic-monitor/archive-files/fake/download'];
    for (const path of paths) {
        await request(app(service)).get(`/api/integration/comm${path}`).expect(401);
        await request(app(service)).get(`/api/integration/comm${path}`).set('X-API-Key','forged').expect(403);
    }
    expect(service.dashboard).not.toHaveBeenCalled();
});
test('authorized dashboard is no-store and sanitizes database failure', async () => {
    const service = { dashboard: jest.fn().mockRejectedValue(new Error('patient payload SECRET')) };
    const result = await request(app(service)).get('/api/integration/comm/clinic-monitor').set('X-API-Key','synthetic-api-key').expect(503);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(JSON.stringify(result.body)).not.toContain('SECRET');
});
test('binary upload bypasses JSON parsing, preserves bytes, and takes explicit metadata', async () => {
    const uploadFile = jest.fn().mockResolvedValue({ upload_id:'upload' });
    const body = Buffer.from([0,255,20,30,0,99]);
    await request(app({ uploadFile })).post('/api/integration/comm/clinic-monitor/archive-jobs/episode/files?source_id=f1&category=resume&filename=result.pdf&mime_type=application%2Fpdf')
        .set('X-API-Key','synthetic-api-key').set('X-Content-SHA256','hash').set('Content-Type','application/octet-stream').send(body).expect(200);
    expect(uploadFile).toHaveBeenCalledWith('episode', expect.objectContaining({ source_id:'f1', category:'resume', mime_type:'application/pdf', sha256:'hash' }), body);
});
test('size bounds include referenced originals, not only inline base64', () => {
    const payload = { status:'ready', snapshot:{}, sections:{ resume:'present',penunjang:'not_applicable',operasi:'not_applicable' }, warnings:[], files:[{ upload_id:'ref', source_id:'f1',category:'resume',filename:'a.pdf',mime_type:'application/pdf',sha256:'a'.repeat(64),byte_size:MAX_FILE + 1 }] };
    expect(() => validateArchive(payload)).toThrow('INVALID_FILE');
    payload.files[0].byte_size = MAX_FILE;
    expect(validateArchive(payload).files[0].byte_size).toBe(MAX_FILE);
    payload.files[0].filename = '../file'; expect(() => validateArchive(payload)).toThrow('INVALID_FILE');
});
test('webhook passes secret only to dedicated verifier and never bypasses it via service key', async () => {
    const webhook = jest.fn().mockRejectedValue(Object.assign(new Error('FORBIDDEN'), { status:403 }));
    await request(app({ webhook })).post('/webhook').set('X-API-Key','synthetic-api-key').send({}).expect(403);
    expect(webhook).toHaveBeenCalledWith({}, undefined);
});
