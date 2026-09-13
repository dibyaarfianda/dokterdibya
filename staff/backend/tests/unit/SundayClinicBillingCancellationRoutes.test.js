'use strict';

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../services/sunday-clinic/billing', () => new Proxy({}, { get: () => jest.fn() }));
jest.mock('../../services/sunday-clinic/shared', () => ({ normalizeMrId: value => value, realtimeSync: { broadcast: jest.fn() } }));
jest.mock('../../services/SundayClinicClosingService', () => ({ acquireSundayClinicAccountingDateGuard: jest.fn() }));
jest.mock('../../routes/billing-payment', () => require('express').Router());

const router = require('../../routes/sunday-clinic/billing');
const { ROLE_IDS } = require('../../constants/roles');

function response() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json: jest.fn()
    };
}

test.each([
    '/billing/:mrId/cancel',
    '/billing/:mrId/additional/:additionalBillingId/cancel'
])('%s requires doctor or superadmin before cancellation handler', path => {
    const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods.post)?.route;
    expect(route).toBeDefined();
    const authorization = route.stack.find(layer => layer.name === 'requireSuperadmin')?.handle;
    expect(authorization).toEqual(expect.any(Function));

    const patientResponse = response();
    const patientNext = jest.fn();
    authorization({ user: { id: 9, role: 'patient' }, path }, patientResponse, patientNext);
    expect(patientResponse.statusCode).toBe(403);
    expect(patientNext).not.toHaveBeenCalled();

    const doctorResponse = response();
    const doctorNext = jest.fn();
    authorization({ user: { id: 1, role_id: ROLE_IDS.DOKTER }, path }, doctorResponse, doctorNext);
    expect(doctorNext).toHaveBeenCalledTimes(1);
});
