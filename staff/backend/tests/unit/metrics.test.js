jest.mock('../../utils/logger', () => ({
    warn: jest.fn(),
    info: jest.fn()
}));

const logger = require('../../utils/logger');
const {
    metricsMiddleware,
    getMetrics,
    resetMetrics
} = require('../../middleware/metrics');

describe('metrics middleware', () => {
    beforeEach(() => {
        resetMetrics();
        jest.clearAllMocks();
    });

    it('tracks request counts and response times', () => {
        const dateSpy = jest.spyOn(Date, 'now');
        dateSpy.mockReturnValueOnce(0).mockReturnValueOnce(100);

        const req = {
            method: 'GET',
            route: { path: '/patients' },
            user: { id: 7 }
        };
        const res = {
            statusCode: 200,
            send: function(reply) { return reply; }
        };
        const next = jest.fn();

        metricsMiddleware(req, res, next);
        res.send('ok');

        const snapshot = getMetrics();
        expect(snapshot.requests.total).toBe(1);
        expect(snapshot.requests.byMethod.GET).toBe(1);
        expect(snapshot.performance.avgResponseTimeMs).toBe(100);
        expect(snapshot.users.total).toBe(1);
        expect(snapshot.performance.endpoints['GET /patients'].count).toBe(1);
        expect(next).toHaveBeenCalled();

        dateSpy.mockRestore();
    });

    it('logs slow error responses and records errors', () => {
        const dateSpy = jest.spyOn(Date, 'now');
        dateSpy.mockReturnValueOnce(0).mockReturnValueOnce(1500);

        const req = { method: 'POST', path: '/patients' };
        const res = {
            statusCode: 500,
            send: function(reply) { return reply; }
        };

        metricsMiddleware(req, res, jest.fn());
        res.send('error');

        const snapshot = getMetrics();
        expect(snapshot.errors.total).toBe(1);
        expect(snapshot.errors.byStatus['500']).toBe(1);
        expect(logger.warn).toHaveBeenCalledWith('Slow request detected', expect.objectContaining({
            endpoint: expect.stringContaining('/patients'),
            statusCode: 500
        }));

        dateSpy.mockRestore();
    });

    it('resets metrics and logs action', () => {
        const req = { method: 'GET', path: '/ping' };
        const res = {
            statusCode: 200,
            send: function(reply) { return reply; }
        };

        metricsMiddleware(req, res, jest.fn());
        res.send('ok');

        resetMetrics();
        const snapshot = getMetrics();
        expect(snapshot.requests.total).toBe(0);
        expect(logger.info).toHaveBeenCalledWith('Metrics reset');
    });
});
