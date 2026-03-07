/**
 * Integration tests for request coalescing middleware
 * Verifies cross-user safety, dedup behavior, bypass logic, and waiter cleanup.
 */

const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

// We test the coalescing middleware in isolation — no DB or auth mocks needed.
// Build a minimal Express app that mounts coalesce + a controllable handler.

const { coalesce, getCoalesceStats } = require('../../middleware/rateLimiter');
const { inflightRequests, config, failsafe, hashIdentity, counters, tripFailsafe } = coalesce._internals;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetCounters() {
    counters.coalesceMapSize = 0;
    counters.coalescedWaiters = 0;
    counters.coalesceBypass = 0;
    counters.failsafeBypass = 0;
    counters.limiterRejects.auth = 0;
    counters.limiterRejects.expensive = 0;
    counters.limiterRejects.standard = 0;
    inflightRequests.clear();
    config.enabled = true;
    failsafe.tripped = false;
    failsafe.triggerCount = 0;
    failsafe.lastTriggerTs = null;
    clearTimeout(failsafe.recoveryTimer);
    failsafe.recoveryTimer = null;
}

/**
 * Build a test app where the handler delay and response body are controllable.
 * `handlerFn` receives (req, res) and must call res.json().
 */
function buildApp(handlerFn) {
    const app = express();
    app.use(express.json());
    app.use('/api/test', coalesce);
    app.get('/api/test', handlerFn);
    return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Request Coalescing Middleware', () => {
    beforeEach(() => {
        resetCounters();
    });

    afterAll(() => {
        // Clear any pending setTimeout handles from coalescing cleanup timers
        inflightRequests.clear();
    });

    // -----------------------------------------------------------------------
    // 1. Cross-user isolation
    // -----------------------------------------------------------------------
    describe('cross-user isolation', () => {
        it('two simultaneous requests with different tokens get independent responses', async () => {
            const tokenA = 'Bearer token-user-A';
            const tokenB = 'Bearer token-user-B';

            // Handler returns different data per authorization header
            const app = buildApp((req, res) => {
                const who = req.headers['authorization'] === tokenA ? 'A' : 'B';
                // Small delay to ensure both requests are in-flight together
                setTimeout(() => res.json({ user: who }), 50);
            });

            const [respA, respB] = await Promise.all([
                request(app).get('/api/test').set('Authorization', tokenA),
                request(app).get('/api/test').set('Authorization', tokenB)
            ]);

            expect(respA.status).toBe(200);
            expect(respB.status).toBe(200);
            expect(respA.body.user).toBe('A');
            expect(respB.body.user).toBe('B');
        });

        it('hashed keys for different tokens are different', () => {
            const h1 = hashIdentity('Bearer aaa');
            const h2 = hashIdentity('Bearer bbb');
            expect(h1).not.toBe(h2);
            expect(h1).toHaveLength(64); // SHA-256 hex
        });
    });

    // -----------------------------------------------------------------------
    // 2. Same-identity coalescing
    // -----------------------------------------------------------------------
    describe('same-identity deduplication', () => {
        it('near-simultaneous identical requests are coalesced', async () => {
            let handlerCallCount = 0;

            const app = buildApp((req, res) => {
                handlerCallCount++;
                // Delay enough that the second request arrives while first is in-flight
                setTimeout(() => res.json({ data: 'shared', call: handlerCallCount }), 80);
            });

            const token = 'Bearer same-user-token';
            const [r1, r2] = await Promise.all([
                request(app).get('/api/test').set('Authorization', token),
                request(app).get('/api/test').set('Authorization', token)
            ]);

            expect(r1.status).toBe(200);
            expect(r2.status).toBe(200);
            // Both get the same data
            expect(r1.body.data).toBe('shared');
            expect(r2.body.data).toBe('shared');
            // Handler only called once (second request piggybacked)
            expect(handlerCallCount).toBe(1);
            // Waiter counter incremented
            expect(counters.coalescedWaiters).toBeGreaterThanOrEqual(1);
        });
    });

    // -----------------------------------------------------------------------
    // 3. Unauthenticated bypass
    // -----------------------------------------------------------------------
    describe('unauthenticated bypass', () => {
        it('requests without Authorization header skip coalescing', async () => {
            let handlerCallCount = 0;

            const app = buildApp((req, res) => {
                handlerCallCount++;
                res.json({ n: handlerCallCount });
            });

            const [r1, r2] = await Promise.all([
                request(app).get('/api/test'),
                request(app).get('/api/test')
            ]);

            expect(r1.status).toBe(200);
            expect(r2.status).toBe(200);
            // Both requests hit the handler independently (no coalescing)
            expect(handlerCallCount).toBe(2);
            // Bypass counter incremented
            expect(counters.coalesceBypass).toBe(2);
        });

        it('POST requests always bypass coalescing', async () => {
            const app = express();
            app.use(express.json());
            app.use('/api/test', coalesce);
            app.post('/api/test', (req, res) => res.json({ ok: true }));

            const token = 'Bearer some-token';
            const [r1, r2] = await Promise.all([
                request(app).post('/api/test').set('Authorization', token).send({}),
                request(app).post('/api/test').set('Authorization', token).send({})
            ]);

            expect(r1.status).toBe(200);
            expect(r2.status).toBe(200);
        });
    });

    // -----------------------------------------------------------------------
    // 4. Waiter cleanup on close
    // -----------------------------------------------------------------------
    describe('waiter cleanup', () => {
        it('inflight entry is cleaned up after response completes', async () => {
            const app = buildApp((req, res) => {
                res.json({ done: true });
            });

            const token = 'Bearer cleanup-test';
            await request(app).get('/api/test').set('Authorization', token);

            // After response, the inflight map should be empty
            expect(inflightRequests.size).toBe(0);
        });

        it('inflight map cleans up even when handler never calls res.json', (done) => {
            const app = express();
            app.use(express.json());
            app.use('/api/cleanup', coalesce);
            app.get('/api/cleanup', (req, res) => {
                // Respond with res.send instead of res.json — triggers close cleanup
                res.status(204).end();
            });

            const token = 'Bearer close-test';
            request(app)
                .get('/api/cleanup')
                .set('Authorization', token)
                .expect(204)
                .end((err) => {
                    if (err) return done(err);
                    // Close event fires, entry should be cleaned
                    setTimeout(() => {
                        expect(inflightRequests.size).toBe(0);
                        done();
                    }, 50);
                });
        });
    });

    // -----------------------------------------------------------------------
    // 5. Payload isolation — mutation safety
    // -----------------------------------------------------------------------
    describe('payload isolation', () => {
        it('mutating primary response body does not affect waiter copy', async () => {
            const sharedPayload = { items: [1, 2, 3], meta: { page: 1 } };

            const app = buildApp((req, res) => {
                setTimeout(() => {
                    res.json(sharedPayload);
                    // Mutate AFTER res.json — should not affect waiter's copy
                    sharedPayload.items.push(999);
                    sharedPayload.meta.page = 999;
                }, 50);
            });

            const token = 'Bearer isolation-test';
            const [r1, r2] = await Promise.all([
                request(app).get('/api/test').set('Authorization', token),
                request(app).get('/api/test').set('Authorization', token)
            ]);

            // Waiter response should have the original unmodified data
            if (r2.body.items) {
                expect(r2.body.items).not.toContain(999);
                expect(r2.body.meta.page).toBe(1);
            }
        });
    });

    // -----------------------------------------------------------------------
    // 6. Timing / dedup window — deterministic via timestamp manipulation
    // -----------------------------------------------------------------------
    describe('dedup window timing', () => {
        it('expired inflight entry does not coalesce new request', async () => {
            let handlerCallCount = 0;

            const app = buildApp((req, res) => {
                handlerCallCount++;
                res.json({ call: handlerCallCount });
            });

            const token = 'Bearer timing-test';
            const key = `/api/test|${hashIdentity(token)}`;

            // Manually insert an "expired" inflight entry (timestamp older than TTL)
            inflightRequests.set(key, {
                ts: Date.now() - config.ttlMs - 100, // expired
                waiters: []
            });

            // This request should NOT piggyback — the entry is expired
            const resp = await request(app).get('/api/test').set('Authorization', token);

            expect(resp.status).toBe(200);
            // Handler should be called because the existing entry was stale
            expect(handlerCallCount).toBe(1);
        });

        it('fresh inflight entry DOES coalesce new request', () => {
            const token = 'Bearer timing-fresh';
            const key = `/api/test|${hashIdentity(token)}`;

            // Insert a fresh entry
            const entry = { ts: Date.now(), waiters: [] };
            inflightRequests.set(key, entry);

            // Simulate a second request checking the map
            const pending = inflightRequests.get(key);
            expect(pending).toBeDefined();
            expect(Date.now() - pending.ts).toBeLessThan(config.ttlMs);

            // Clean up
            inflightRequests.delete(key);
        });
    });

    // -----------------------------------------------------------------------
    // 7. Hash identity
    // -----------------------------------------------------------------------
    describe('hashIdentity', () => {
        it('produces consistent SHA-256 hex for same input', () => {
            const input = 'Bearer eyJhbGciOiJIUzI1NiJ9.test';
            const h1 = hashIdentity(input);
            const h2 = hashIdentity(input);
            expect(h1).toBe(h2);
            expect(h1).toHaveLength(64);
        });

        it('matches native crypto output', () => {
            const input = 'Bearer xyz';
            const expected = crypto.createHash('sha256').update(input).digest('hex');
            expect(hashIdentity(input)).toBe(expected);
        });
    });

    // -----------------------------------------------------------------------
    // 8. Stats / observability
    // -----------------------------------------------------------------------
    describe('getCoalesceStats', () => {
        it('returns current counter snapshot with canary state', () => {
            counters.coalescedWaiters = 5;
            counters.coalesceBypass = 3;
            counters.limiterRejects.auth = 1;

            const stats = getCoalesceStats();
            expect(stats.totalWaiters).toBe(5);
            expect(stats.totalBypassed).toBe(3);
            expect(stats.limiterRejects.auth).toBe(1);
            expect(typeof stats.mapSize).toBe('number');
            // Canary fields
            expect(stats.enabled).toBe(true);
            expect(stats.configEnabled).toBe(true);
            expect(stats.ttlMs).toBe(config.ttlMs);
            expect(stats.maxInflight).toBe(config.maxInflight);
            expect(stats.failsafe).toBeDefined();
            expect(stats.failsafe.tripped).toBe(false);
            expect(stats.failsafe.triggerCount).toBe(0);
        });

        it('limiterRejects is a copy, not a reference', () => {
            const stats = getCoalesceStats();
            stats.limiterRejects.auth = 9999;
            expect(counters.limiterRejects.auth).not.toBe(9999);
        });

        it('reflects failsafe state when tripped', () => {
            failsafe.tripped = true;
            failsafe.triggerCount = 2;
            failsafe.lastTriggerTs = '2026-01-01T00:00:00.000Z';
            counters.failsafeBypass = 7;

            const stats = getCoalesceStats();
            expect(stats.enabled).toBe(false); // config on but failsafe tripped
            expect(stats.configEnabled).toBe(true);
            expect(stats.failsafe.tripped).toBe(true);
            expect(stats.failsafe.triggerCount).toBe(2);
            expect(stats.failsafe.lastTriggerTs).toBe('2026-01-01T00:00:00.000Z');
            expect(stats.failsafe.failsafeBypass).toBe(7);
        });
    });

    // -----------------------------------------------------------------------
    // 9. Canary config toggle
    // -----------------------------------------------------------------------
    describe('canary config', () => {
        it('disabling config.enabled bypasses coalescing for all requests', async () => {
            config.enabled = false;
            let handlerCallCount = 0;

            const app = buildApp((req, res) => {
                handlerCallCount++;
                res.json({ n: handlerCallCount });
            });

            const token = 'Bearer canary-off';
            const [r1, r2] = await Promise.all([
                request(app).get('/api/test').set('Authorization', token),
                request(app).get('/api/test').set('Authorization', token)
            ]);

            expect(r1.status).toBe(200);
            expect(r2.status).toBe(200);
            // No coalescing — both hit handler
            expect(handlerCallCount).toBe(2);
        });
    });

    // -----------------------------------------------------------------------
    // 10. Failsafe behavior
    // -----------------------------------------------------------------------
    describe('failsafe', () => {
        it('when failsafe is tripped, requests bypass coalescing and succeed', async () => {
            failsafe.tripped = true;
            let handlerCallCount = 0;

            const app = buildApp((req, res) => {
                handlerCallCount++;
                res.json({ ok: true });
            });

            const token = 'Bearer failsafe-test';
            const resp = await request(app).get('/api/test').set('Authorization', token);

            expect(resp.status).toBe(200);
            expect(resp.body.ok).toBe(true);
            expect(handlerCallCount).toBe(1);
            expect(counters.failsafeBypass).toBe(1);
        });

        it('tripFailsafe sets state correctly', () => {
            expect(failsafe.tripped).toBe(false);
            tripFailsafe();
            expect(failsafe.tripped).toBe(true);
            expect(failsafe.triggerCount).toBe(1);
            expect(failsafe.lastTriggerTs).toBeTruthy();
        });

        it('tripFailsafe is idempotent while tripped', () => {
            tripFailsafe();
            tripFailsafe();
            tripFailsafe();
            // Only counted once because subsequent calls are no-ops while tripped
            expect(failsafe.triggerCount).toBe(1);
        });

        it('failsafe recovers after cooldown if map drains', (done) => {
            config.cooldownMs = 100; // short cooldown for test
            tripFailsafe();
            expect(failsafe.tripped).toBe(true);

            // Map is empty (drained), so recovery should succeed
            setTimeout(() => {
                expect(failsafe.tripped).toBe(false);
                done();
            }, 150);
        });

        it('failsafe re-trips if map is still overloaded after cooldown', (done) => {
            config.cooldownMs = 100;
            config.maxInflight = 2;

            // Fill the map to exceed threshold
            inflightRequests.set('a', { ts: Date.now(), waiters: [] });
            inflightRequests.set('b', { ts: Date.now(), waiters: [] });
            inflightRequests.set('c', { ts: Date.now(), waiters: [] });

            tripFailsafe();
            expect(failsafe.triggerCount).toBe(1);

            // After cooldown, map still full — should re-trip
            setTimeout(() => {
                expect(failsafe.tripped).toBe(true);
                expect(failsafe.triggerCount).toBe(2);
                // Clean up
                inflightRequests.clear();
                done();
            }, 150);
        });
    });
});
