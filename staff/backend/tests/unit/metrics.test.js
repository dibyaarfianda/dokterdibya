jest.mock('../../utils/logger', () => ({
    warn: jest.fn(),
    info: jest.fn()
}));

process.env.METRICS_LOG_SLOW_REQUESTS = 'true';

const logger = require('../../utils/logger');
const {
    metricsMiddleware,
    getMetrics,
    resetMetrics
} = require('../../middleware/metrics');

function createMockResponse(statusCode = 200) {
    const listeners = {};

    return {
        statusCode,
        on: jest.fn((event, callback) => {
            listeners[event] = callback;
            return this;
        }),
        send: function(reply) {
            return reply;
        },
        finish: function() {
            listeners.finish?.();
        }
    };
}

describe('metrics middleware', () => {
    let hrtimeSpy;

    beforeEach(() => {
        resetMetrics();
        jest.clearAllMocks();
    });

    afterEach(() => {
        hrtimeSpy?.mockRestore();
        hrtimeSpy = null;
    });

    it('tracks request counts and response times', () => {
        hrtimeSpy = jest.spyOn(process.hrtime, 'bigint');
        hrtimeSpy.mockReturnValueOnce(0n).mockReturnValueOnce(100000000n);

        const req = {
            method: 'GET',
            route: { path: '/patients' },
            user: { id: 7 }
        };
        const res = createMockResponse(200);
        const next = jest.fn();

        metricsMiddleware(req, res, next);
        res.send('ok');
        res.finish();

        const snapshot = getMetrics();
        expect(snapshot.requests.total).toBe(1);
        expect(snapshot.requests.byMethod.GET).toBe(1);
        expect(snapshot.performance.avgResponseTimeMs).toBe(100);
        expect(snapshot.users.total).toBe(1);
        expect(snapshot.performance.endpoints['GET /patients'].count).toBe(1);
        expect(next).toHaveBeenCalled();
    });

    it('logs slow error responses and records errors', () => {
        hrtimeSpy = jest.spyOn(process.hrtime, 'bigint');
        hrtimeSpy.mockReturnValueOnce(0n).mockReturnValueOnce(1500000000n);

        const req = { method: 'POST', path: '/patients' };
        const res = createMockResponse(500);

        metricsMiddleware(req, res, jest.fn());
        res.send('error');
        res.finish();

        const snapshot = getMetrics();
        expect(snapshot.errors.total).toBe(1);
        expect(snapshot.errors.byStatus['500']).toBe(1);
        expect(logger.warn).toHaveBeenCalledWith('Slow request detected', expect.objectContaining({
            endpoint: expect.stringContaining('/patients'),
            statusCode: 500
        }));
    });

    it('resets metrics and logs action', () => {
        const req = { method: 'GET', path: '/ping' };
        const res = createMockResponse(200);

        metricsMiddleware(req, res, jest.fn());
        res.send('ok');
        res.finish();

        resetMetrics();
        const snapshot = getMetrics();
        expect(snapshot.requests.total).toBe(0);
        expect(logger.info).toHaveBeenCalledWith('Metrics reset');
    });
});
