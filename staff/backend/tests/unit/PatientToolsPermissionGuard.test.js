const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('patient tools permission guard', () => {
    test('keeps the shared account permission checker intact when the feature loads', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '../../../public/scripts/legacy/patient-tools.js'),
            'utf8'
        );
        const sharedPermissionChecker = jest.fn(permission => permission === 'patients.view');
        const context = {
            console,
            hasAccountPermission: sharedPermissionChecker,
            document: {
                readyState: 'loading',
                addEventListener: jest.fn()
            },
            addEventListener: jest.fn(),
            location: {
                hostname: 'dokterdibya.com',
                origin: 'https://dokterdibya.com'
            },
            setTimeout,
            clearTimeout
        };
        context.window = context;
        vm.createContext(context);

        vm.runInContext(source, context, { filename: 'patient-tools.js' });

        expect(context.hasAccountPermission).toBe(sharedPermissionChecker);
        expect(context.hasAccountPermission('patients.view')).toBe(true);
        expect(sharedPermissionChecker).toHaveBeenCalledWith('patients.view');
    });
});
