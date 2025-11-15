jest.mock('uuid', () => ({ v4: jest.fn(() => 'generated-uuid') }));
jest.mock('../../utils/logger', () => ({
    debug: jest.fn()
}));

const logger = require('../../utils/logger');
const {
    requestContextMiddleware,
    contextualizeError,
    getContext
} = require('../../middleware/requestContext');

describe('requestContextMiddleware', () => {
    it('adds tracing headers, context, and completion log', () => {
        const req = {
            headers: {},
            method: 'GET',
            path: '/patients',
            ip: '127.0.0.1',
            get: jest.fn(() => 'jest-agent'),
            connection: { remoteAddress: '127.0.0.1' }
        };

        let finishHandler;
        const res = {
            set: jest.fn(),
            on: jest.fn((event, handler) => {
                if (event === 'finish') {
                    finishHandler = handler;
                }
            }),
            statusCode: 200,
            get: jest.fn(() => undefined)
        };

        const next = jest.fn();

        requestContextMiddleware(req, res, next);

        expect(req.context).toMatchObject({
            requestId: 'generated-uuid',
            correlationId: 'generated-uuid',
            traceId: 'generated-uuid'
        });
        expect(res.set).toHaveBeenCalledWith('X-Request-ID', 'generated-uuid');
        expect(logger.debug).toHaveBeenCalledWith('Request started', expect.any(Object));
        expect(finishHandler).toBeInstanceOf(Function);

        finishHandler();
        expect(logger.debug).toHaveBeenCalledWith('Request completed', expect.any(Object));
        expect(next).toHaveBeenCalled();
    });
});

describe('contextualizeError', () => {
    it('adds context identifiers to error object', () => {
        const err = {};
        const req = {
            context: {
                requestId: 'req-1',
                correlationId: 'corr-1',
                traceId: 'trace-1'
            }
        };

        contextualizeError(err, req, {}, jest.fn());

        expect(err).toMatchObject({
            requestId: 'req-1',
            correlationId: 'corr-1',
            traceId: 'trace-1'
        });
    });
});

describe('getContext', () => {
    it('returns default fallbacks when context missing', () => {
        const ctx = getContext({});
        expect(ctx).toEqual({
            requestId: 'unknown',
            correlationId: 'unknown',
            traceId: 'unknown'
        });
    });
});
