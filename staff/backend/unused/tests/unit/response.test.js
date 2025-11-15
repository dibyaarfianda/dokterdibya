const { HTTP_STATUS } = require('../../config/constants');
const {
    sendSuccess,
    sendError,
    sendCreated,
    sendPaginated
} = require('../../utils/response');

describe('response utilities', () => {
    const buildRes = () => ({
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    });

    it('sends success payloads with defaults', () => {
        const res = buildRes();
        sendSuccess(res, { id: 1 });

        expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.OK);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            message: 'Success',
            data: { id: 1 }
        }));
    });

    it('sends error payloads with optional details', () => {
        const res = buildRes();
        sendError(res, 'Bad', HTTP_STATUS.BAD_REQUEST, [{ field: 'full_name' }]);

        expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: 'Bad',
            errors: [{ field: 'full_name' }]
        }));
    });

    it('sends created responses with helper', () => {
        const res = buildRes();
        sendCreated(res, { id: 5 }, 'Created');

        expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.CREATED);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            message: 'Created'
        }));
    });

    it('sends paginated responses with derived totals', () => {
        const res = buildRes();
        sendPaginated(res, [{ id: 1 }], { page: 1, limit: 10, total: 25 });

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            pagination: expect.objectContaining({
                totalPages: 3
            })
        }));
    });
});
