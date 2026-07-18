'use strict';

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');
const routeRoot = path.join(backendRoot, 'routes', 'sunday-clinic');
const serviceRoot = path.join(backendRoot, 'services', 'sunday-clinic');

const DOMAINS = Object.freeze([
    'queue',
    'records',
    'billing',
    'prescription',
    'resume-export',
    'visit-walk-in'
]);

const EXPECTED_ROUTES = Object.freeze({
    queue: [
        'get /queue/today',
        'get /queue/settings',
        'put /queue/settings',
        'put /records/:mrId/queue-status',
        'get /queue/public'
    ],
    records: [
        'get /check-existing',
        'get /directory',
        'get /records/:mrId',
        'post /records/:mrId/:section',
        'get /records/:mrId/prefill/medify',
        'get /medify-sync/jobs/:mrId',
        'get /medify-sync/stats',
        'delete /records/:mrId',
        'patch /records/:id/category'
    ],
    billing: [
        'get /billing/pending',
        'get /billing/:mrId',
        'post /billing/:mrId',
        'post /billing/:mrId/obat',
        'post /billing/:mrId/confirm',
        'post /billing/:mrId/mark-paid',
        'post /billing/:mrId/request-revision',
        'get /billing/revisions/pending',
        'post /billing/revisions/:id/approve',
        'post /billing/:mrId/print-etiket',
        'post /billing/:mrId/print-invoice',
        'get /billing/:mrId/additional',
        'post /billing/:mrId/additional',
        'put /billing/:mrId/additional/:additionalBillingId',
        'post /billing/:mrId/additional/:additionalBillingId/confirm',
        'post /billing/:mrId/additional/:additionalBillingId/mark-paid',
        'post /billing/:mrId/additional/:additionalBillingId/print-invoice',
        'post /billing/:mrId/additional/:additionalBillingId/print-etiket',
        'post /billing/:mrId/print',
        'delete /billing/:mrId/items/:itemType',
        'delete /billing/:mrId/items/code/:code',
        'delete /billing/:mrId/items/id/:itemId',
        'get /billing/:mrId/audit',
        'post /billing/:mrId/request-change',
        'post /billing/:mrId/approve-changes',
        'get /billing/:mrId/changes'
    ],
    prescription: [
        'get /prescription-templates',
        'post /prescription-templates',
        'put /prescription-templates/:id',
        'delete /prescription-templates/:id'
    ],
    'resume-export': [
        'get /statistics/categories',
        'post /generate-anamnesa/:mrId',
        'post /resume-medis/pdf',
        'get /resume-medis/download/:filename',
        'post /resume-medis/send-whatsapp'
    ],
    'visit-walk-in': [
        'post /start-walk-in',
        'get /patient-visits/:patientId',
        'get /last-anthropometry/:patientId'
    ]
});

function read(relativePath) {
    return fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
}

function declaredRoutes(source) {
    return [...source.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)]
        .map((match) => `${match[1]} ${match[2]}`);
}

describe('Wave 5 Sunday Clinic physical domain boundaries', () => {
    test.each(DOMAINS)('%s owns declarative routes and a named domain service', (domain) => {
        const routeSource = read(`routes/sunday-clinic/${domain}.js`);
        const serviceSource = read(`services/sunday-clinic/${domain}.js`);

        expect(routeSource).toContain(`services/sunday-clinic/${domain}`);
        expect(routeSource).not.toContain('sunday-clinic-controller');
        expect(routeSource).not.toContain('createRouteSlice');
        expect(declaredRoutes(routeSource)).toEqual(EXPECTED_ROUTES[domain]);

        expect(serviceSource).toMatch(/async function [A-Za-z0-9_]+\(req, res, next\)/);
        expect(serviceSource).toContain('module.exports = {');
    });

    test('legacy controller and route slicing compatibility files are removed', () => {
        expect(fs.existsSync(path.join(backendRoot, 'routes', 'sunday-clinic-controller.js'))).toBe(false);
        expect(fs.existsSync(path.join(routeRoot, 'route-slice.js'))).toBe(false);
        expect(fs.existsSync(path.join(routeRoot, 'route-groups.js'))).toBe(false);
        expect(fs.existsSync(path.join(serviceRoot, 'shared.js'))).toBe(true);
    });

    test('all route signatures remain unique across the six domain routers', () => {
        const actual = DOMAINS.flatMap((domain) => declaredRoutes(read(`routes/sunday-clinic/${domain}.js`)));
        const expected = Object.values(EXPECTED_ROUTES).flat();

        expect(actual).toHaveLength(expected.length);
        expect(new Set(actual).size).toBe(actual.length);
        expect(new Set(actual)).toEqual(new Set(expected));
    });
});
