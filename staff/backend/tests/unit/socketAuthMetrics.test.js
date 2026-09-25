const { createSocketAuthMetrics } = require('../../security/socketAuthMetrics');

test('handshake denominator is attempts and five-minute buckets prune expired activity', () => {
    let at = 1700000000000;
    const metrics = createSocketAuthMetrics({ now: () => at });
    metrics.accepted();
    metrics.rejected('AUTH_INVALID');
    metrics.expiredAfterConnect();
    expect(metrics.snapshot()).toMatchObject({
        attempts: 2, accepted: 1, rejected: 1, expiredAfterConnect: 1,
        rejectionRatePercent: 50,
        rejectedByCode: { AUTH_MISSING: 0, AUTH_INVALID: 1, AUTH_EXPIRED: 0, FORBIDDEN: 0 }
    });

    at += 301000;
    expect(metrics.snapshot()).toMatchObject({
        windowSeconds: 300, windowStartedAtMs: null, windowEndedAtMs: null,
        attempts: 0, accepted: 0, rejected: 0, expiredAfterConnect: 0,
        rejectionRatePercent: 0
    });
});

test('unexpected handshake rejection codes are never used as metric keys', () => {
    const marker = 'synthetic-secret-or-patient-identifier';
    const metrics = createSocketAuthMetrics({ now: () => 1700000000000 });
    metrics.rejected(marker);
    const snapshot = metrics.snapshot();
    expect(snapshot.attempts).toBe(1);
    expect(snapshot.rejectedByCode.AUTH_INVALID).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain(marker);
});

test('quarantined anonymous handshakes remain visible after transport accepts them', () => {
    const metrics = createSocketAuthMetrics({ now: () => 1700000000000 });
    metrics.accepted(true);
    metrics.accepted();
    expect(metrics.snapshot()).toMatchObject({
        attempts: 2, accepted: 2, rejected: 0, anonymousQuarantined: 1
    });
});
