jest.mock('../../utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
}));

const logger = require('../../utils/logger');
const {
    AppError,
    asyncHandler,
    errorHandler,
    notFoundHandler,
    getErrorMetrics,
    resetErrorMetrics,
    trackError
} = require('../../middleware/errorHandler');

describe('asyncHandler', () => {
    it('passes rejected promises to next', async () => {
        const next = jest.fn();
        const handler = asyncHandler(async () => {
            throw new Error('boom');
        });

        await handler({}, {}, next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
});

describe('errorHandler', () => {
    const buildRes = () => ({
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    });

    afterEach(() => {
        process.env.NODE_ENV = 'test';
    });

    it('returns operational error details in non-development env', () => {
        const err = new AppError('Missing data', 400, true, 'MISSING');
        const req = { context: { requestId: 'req-123' } };
        const res = buildRes();

        errorHandler(err, req, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: 'Missing data',
            code: 'MISSING',
            requestId: 'req-123'
        }));
        expect(logger.warn).toHaveBeenCalled();
    });

    it('sanitizes non-operational errors', () => {
        const err = new Error('secret info');
        const res = buildRes();

        errorHandler(err, {}, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: 'Something went wrong. Please try again later.'
        }));
        expect(logger.error).toHaveBeenCalled();
    });

    it('includes stack output in development mode', () => {
        process.env.NODE_ENV = 'development';
        const err = new AppError('dev error', 418, true);
        const res = buildRes();

        errorHandler(err, {}, res, jest.fn());

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            stack: expect.any(String)
        }));
    });
});

describe('notFoundHandler', () => {
    it('creates AppError for missing routes', () => {
        const next = jest.fn();
        notFoundHandler({ originalUrl: '/missing' }, {}, next);
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
});

describe('error metrics helpers', () => {
    it('tracks and resets metrics', () => {
        resetErrorMetrics();
        const err = new AppError('track me', 400, true, 'TRACK');
        trackError(err);

        const metrics = getErrorMetrics();
        expect(metrics.total).toBe(1);
        expect(metrics.byCode.TRACK).toBe(1);

        resetErrorMetrics();
        const resetMetrics = getErrorMetrics();
        expect(resetMetrics.total).toBe(0);
    });
});
