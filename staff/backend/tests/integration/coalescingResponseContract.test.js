const express = require('express');
const request = require('supertest');
const { coalesce } = require('../../middleware/rateLimiter');

describe('coalesced HTTP response contract', () => {
    it.each([
        ['Cache-Control', 'no-cache'], ['Cache-Control', 'private, no-store'],
        ['Cache-Control', 'max-age=0'], ['Pragma', 'no-cache'],
        ['If-Match', '"v1"'], ['If-Unmodified-Since', 'Wed, 23 Sep 2026 12:00:00 GMT'],
        ['If-None-Match', '"v1"'], ['If-Modified-Since', 'Wed, 23 Sep 2026 12:00:00 GMT'],
        ['If-Range', '"v1"'], ['Range', 'bytes=0-9']
    ])('preserves independent freshness/preconditions for %s: %s', async (header, value) => {
        let calls = 0;
        const app = express();
        app.use(coalesce);
        app.get('/api/patients', (req, res) => {
            const call = ++calls;
            setTimeout(() => res.json({ call }), 30);
        });
        const responses = await Promise.all([1, 2].map(() => request(app).get('/api/patients')
            .set('Authorization', 'Bearer synthetic').set(header, value)));
        expect(responses.map(response => response.status)).toEqual([200, 200]);
        expect(calls).toBe(2);
        expect(responses.map(response => response.body.call).sort()).toEqual([1, 2]);
    });
    beforeEach(() => {
        coalesce._internals.inflightRequests.clear();
        coalesce._internals.config.enabled = true;
        coalesce._internals.failsafe.tripped = false;
    });

    async function pair(status, method = 'get', configure = () => {}, path = '/api/read') {
        let calls = 0;
        const app = express();
        app.use(coalesce);
        app.all(path, (req, res) => {
            const call = ++calls;
            setTimeout(() => {
                configure(res, call);
                res.status(status).json({ call, result: status < 300 ? 'ok' : 'failed' });
            }, 30);
        });
        const responses = await Promise.all([1, 2].map(() => request(app)[method](path)
            .set('Authorization', 'Bearer synthetic-test-token')));
        return { responses, calls };
    }

    it('replays successful status, safe headers and identical body', async () => {
        const { responses, calls } = await pair(202, 'get', res => res.set({
            'Cache-Control': 'no-store', 'Content-Language': 'id', ETag: '"revision-7"'
        }));
        expect(calls).toBe(1);
        for (const res of responses) {
            expect(res.status).toBe(202);
            expect(res.headers['cache-control']).toBe('no-store');
            expect(res.headers['content-language']).toBe('id');
            expect(res.headers.etag).toBe('"revision-7"');
            expect(res.body).toEqual({ call: 1, result: 'ok' });
        }
    });

    it.each([401, 403, 429, 500])('does not share %s errors; waiters execute independently', async status => {
        const { responses, calls } = await pair(status, 'get', (res, call) => res.set('Retry-After', String(call)));
        expect(responses.map(r => r.status)).toEqual([status, status]);
        expect(calls).toBe(2);
        expect(responses.map(r => r.body.call).sort()).toEqual([1, 2]);
        expect(responses.map(r => r.headers['retry-after']).sort()).toEqual(['1', '2']);
    });

    it.each(['post', 'put', 'patch', 'delete'])('never shares %s mutations', async method => {
        const { responses, calls } = await pair(200, method);
        expect(calls).toBe(2);
        expect(responses.map(r => r.body.call).sort()).toEqual([1, 2]);
    });

    it('never shares authentication responses', async () => {
        const { calls } = await pair(200, 'get', () => {}, '/api/patients/me');
        expect(calls).toBe(2);
    });

    it('does not replay responses that set a cookie', async () => {
        const { responses, calls } = await pair(200, 'get', (res, call) => res.cookie('session', String(call)));
        expect(calls).toBe(2);
        expect(responses[0].headers['set-cookie']).not.toEqual(responses[1].headers['set-cookie']);
    });

    it('releases waiters when the primary uses send instead of json', async () => {
        let calls = 0;
        const app = express();
        app.use(coalesce);
        app.get('/api/text', (req, res) => { calls++; setTimeout(() => res.status(203).send('safe text'), 30); });
        const responses = await Promise.all([1, 2].map(() => request(app).get('/api/text')
            .set('Authorization', 'Bearer synthetic').timeout(1500)));
        expect(responses.map(r => [r.status, r.text])).toEqual([[203, 'safe text'], [203, 'safe text']]);
        expect(calls).toBe(2);
    });
});
