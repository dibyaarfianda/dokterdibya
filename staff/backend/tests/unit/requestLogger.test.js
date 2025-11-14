jest.mock('morgan', () => {
    const mockMiddleware = jest.fn((req, res, next) => next());
    const mockMorgan = jest.fn(() => mockMiddleware);
    mockMorgan.token = jest.fn();
    return mockMorgan;
});

jest.mock('../../utils/logger', () => ({
    http: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const morgan = require('morgan');
const logger = require('../../utils/logger');
const {
    requestLogger,
    performanceLogger
} = require('../../middleware/requestLogger');

describe('requestLogger middleware', () => {
    it('configures morgan with custom format and stream', () => {
        expect(typeof requestLogger).toBe('function');
        expect(morgan).toHaveBeenCalledTimes(1);

        const [format, options] = morgan.mock.calls[0];
        expect(format).toContain(':response-time-ms');
        expect(options).toMatchObject({
            stream: expect.any(Object),
            skip: expect.any(Function)
        });

        options.stream.write('log message\n');
        expect(logger.http).toHaveBeenCalledWith('log message');
    });
});

describe('performanceLogger middleware', () => {
    beforeEach(() => {
        logger.warn.mockClear();
        logger.error.mockClear();
    });

    it('logs slow error responses', () => {
        const dateSpy = jest.spyOn(Date, 'now');
        dateSpy.mockReturnValueOnce(0).mockReturnValueOnce(1500);

        const req = { method: 'GET', originalUrl: '/api/patients', user: { id: 1 } };
        const res = {
            on: jest.fn(),
            statusCode: 500
        };
        const next = jest.fn();

        performanceLogger(req, res, next);

        const finishHandler = res.on.mock.calls[0][1];
        finishHandler();

        expect(logger.warn).toHaveBeenCalledWith('Slow request detected', expect.objectContaining({
            url: '/api/patients',
            duration: expect.stringContaining('ms')
        }));
        expect(logger.error).toHaveBeenCalledWith('Request error', expect.objectContaining({
            statusCode: 500
        }));
        expect(next).toHaveBeenCalled();

        dateSpy.mockRestore();
    });

    it('does not log fast successful responses', () => {
        const dateSpy = jest.spyOn(Date, 'now');
        dateSpy.mockReturnValueOnce(0).mockReturnValueOnce(500);

        const req = { method: 'GET', originalUrl: '/api/health' };
        const res = {
            on: jest.fn(),
            statusCode: 200
        };

        performanceLogger(req, res, jest.fn());

        const finishHandler = res.on.mock.calls[0][1];
        finishHandler();

        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();

        dateSpy.mockRestore();
    });
});
