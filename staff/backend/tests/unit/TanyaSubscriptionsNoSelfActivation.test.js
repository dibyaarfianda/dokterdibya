'use strict';

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    verifyPatientToken: (req, res, next) => next()
}));

const router = require('../../routes/tanya-subscriptions');

function registeredRoutes() {
    return router.stack
        .filter(layer => layer.route)
        .map(layer => ({
            path: layer.route.path,
            methods: Object.keys(layer.route.methods)
        }));
}

describe('Tanya Dokter subscriptions cannot be activated without a real payment', () => {
    test('has no simulate-payment route', () => {
        const paths = registeredRoutes().map(route => route.path);
        expect(paths).not.toContain('/simulate-payment');
    });

    test('has no unauthenticated payment webhook', () => {
        const paths = registeredRoutes().map(route => route.path);
        expect(paths).not.toContain('/webhook');
    });

    test('keeps the read and subscribe routes that the patient portal can still reach', () => {
        const signatures = registeredRoutes().flatMap(route =>
            route.methods.map(method => `${method.toUpperCase()} ${route.path}`)
        );
        expect(signatures).toEqual(expect.arrayContaining([
            'GET /tiers',
            'GET /my',
            'POST /subscribe',
            'GET /payment/:orderId',
            'GET /payments',
            'POST /cancel'
        ]));
    });
});
