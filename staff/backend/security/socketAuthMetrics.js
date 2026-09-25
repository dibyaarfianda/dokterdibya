'use strict';

const WINDOW_MS = 5 * 60 * 1000;
const SECOND_MS = 1000;
const REJECTION_CODES = Object.freeze(['AUTH_MISSING', 'AUTH_INVALID', 'AUTH_EXPIRED', 'FORBIDDEN']);

function createSocketAuthMetrics({ now = Date.now } = {}) {
    const buckets = new Map();

    function prune(at = now()) {
        const cutoff = at - WINDOW_MS;
        for (const second of buckets.keys()) {
            if (second < cutoff) buckets.delete(second);
        }
    }

    function currentBucket() {
        const at = now();
        prune(at);
        const second = Math.floor(at / SECOND_MS) * SECOND_MS;
        if (!buckets.has(second)) buckets.set(second, {
            attempts: 0, accepted: 0, rejected: 0, anonymousQuarantined: 0,
            expiredAfterConnect: 0,
            rejectedByCode: Object.fromEntries(REJECTION_CODES.map(code => [code, 0]))
        });
        return buckets.get(second);
    }

    return {
        accepted(anonymousQuarantined = false) {
            const bucket = currentBucket();
            bucket.attempts++;
            bucket.accepted++;
            if (anonymousQuarantined) bucket.anonymousQuarantined++;
        },
        rejected(code) {
            const bucket = currentBucket();
            bucket.attempts++;
            bucket.rejected++;
            bucket.rejectedByCode[REJECTION_CODES.includes(code) ? code : 'AUTH_INVALID']++;
        },
        expiredAfterConnect() {
            currentBucket().expiredAfterConnect++;
        },
        snapshot() {
            prune();
            const result = {
                windowSeconds: WINDOW_MS / SECOND_MS,
                windowStartedAtMs: buckets.size ? Math.min(...buckets.keys()) : null,
                windowEndedAtMs: buckets.size ? Math.max(...buckets.keys()) : null,
                attempts: 0, accepted: 0, rejected: 0, anonymousQuarantined: 0,
                expiredAfterConnect: 0,
                rejectedByCode: Object.fromEntries(REJECTION_CODES.map(code => [code, 0]))
            };
            for (const bucket of buckets.values()) {
                result.attempts += bucket.attempts;
                result.accepted += bucket.accepted;
                result.rejected += bucket.rejected;
                result.anonymousQuarantined += bucket.anonymousQuarantined;
                result.expiredAfterConnect += bucket.expiredAfterConnect;
                for (const code of REJECTION_CODES) result.rejectedByCode[code] += bucket.rejectedByCode[code];
            }
            result.rejectionRatePercent = result.attempts > 0
                ? Math.round(result.rejected / result.attempts * 10000) / 100 : 0;
            return result;
        }
    };
}

const socketAuthMetrics = createSocketAuthMetrics();

module.exports = { createSocketAuthMetrics, socketAuthMetrics };
