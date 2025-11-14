jest.mock('express-validator', () => {
    const actual = jest.requireActual('express-validator');
    return {
        ...actual,
        validationResult: jest.fn()
    };
});

const { validationResult } = require('express-validator');
const {
    validatePatient,
    validateLogin,
    validatePasswordChange,
    validateObat,
    validateObatUpdate,
    validateTindakan,
    validateChatMessage,
    handleValidationErrors
} = require('../../middleware/validation');

describe('handleValidationErrors', () => {
    it('responds with errors when validation fails', () => {
        validationResult.mockReturnValue({
            isEmpty: () => false,
            array: () => ([{ path: 'full_name', msg: 'Required' }])
        });

        const req = {};
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const next = jest.fn();

        handleValidationErrors(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            errors: [{ field: 'full_name', message: 'Required' }]
        }));
        expect(next).not.toHaveBeenCalled();
    });

    it('passes through when there are no errors', () => {
        validationResult.mockReturnValue({
            isEmpty: () => true
        });

        const next = jest.fn();
        handleValidationErrors({}, { status: jest.fn() }, next);
        expect(next).toHaveBeenCalled();
    });
});

describe('validator chains', () => {
    const validatorGroups = [
        validatePatient,
        validateLogin,
        validatePasswordChange,
        validateObat,
        validateObatUpdate,
        validateTindakan,
        validateChatMessage
    ];

    it('attach handleValidationErrors as the last middleware', () => {
        validatorGroups.forEach(group => {
            expect(group[group.length - 1]).toBe(handleValidationErrors);
        });
    });
});
