'use strict';

process.env.JWT_SECRET ||= 'task7-test-secret';

const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');
const publicRoot = path.resolve(backendRoot, '../public');
const TASK7_PERMISSION_PREFIXES = [
    'patients.', 'patient_documents.', 'r2_files.', 'registration_codes.',
    'medical_records.', 'anamnesa.', 'physical_exam.', 'lab_exam.',
    'usg_exam.', 'visits.'
];

function responseDouble() {
    return {
        statusCode: 200,
        body: null,
        status: jest.fn(function status(code) { this.statusCode = code; return this; }),
        json: jest.fn(function json(body) { this.body = body; return this; })
    };
}

function accountRequest(permission) {
    return {
        user: { id: 'STAFF-ACCOUNT', role: 'staff', role_id: null, user_type: 'staff' },
        accountAccess: { mode: 'account', permissions: new Set([permission]) },
        accountAccessResolution: { permission, ruleId: 'staff-task7' },
        context: { requestId: 'task7-test' },
        path: '/task7'
    };
}

describe('Task 7 patient and medical-record route matrix', () => {
    test.each([
        ['GET', '/api/patients', 'patients.view'],
        ['POST', '/api/patients', 'patients.create'],
        ['PUT', '/api/patients/P-1', 'patients.edit'],
        ['DELETE', '/api/patients/P-1', 'patients.delete'],
        ['POST', '/api/v1/patients', 'patients.create'],
        ['PUT', '/api/v1/patients/P-1', 'patients.edit'],
        ['DELETE', '/api/v1/patients/P-1', 'patients.delete'],
        ['POST', '/api/patients/fix-names', 'patients.reset'],
        ['POST', '/api/patients/P-1/mark-delivered', 'patients.edit'],
        ['POST', '/api/patients/merge', 'patients.merge'],
        ['POST', '/api/patients/bulk-delete', 'patients.bulk_delete'],
        ['POST', '/api/admin/sync-web-patients', 'patients.reset'],
        ['GET', '/api/admin/web-patients', 'patients.view'],
        ['GET', '/api/admin/web-patients/P-1', 'patients.view'],
        ['PATCH', '/api/admin/web-patients/P-1/status', 'patients.edit'],
        ['DELETE', '/api/admin/web-patients/P-1', 'patients.delete'],
        ['GET', '/api/medical-records/P-1', 'medical_records.view'],
        ['POST', '/api/medical-records', 'medical_records.create'],
        ['PATCH', '/api/medical-records/1', 'medical_records.edit'],
        ['DELETE', '/api/medical-records/1', 'medical_records.delete'],
        ['POST', '/api/medical-records/generate-resume', 'medical_records.export'],
        ['POST', '/api/medical-records/DRD1/sections/usg/reset', 'medical_records.reset_section'],
        ['DELETE', '/api/medical-records/by-type/usg', 'medical_records.reset_section'],
        ['DELETE', '/api/medical-exams/1', 'medical_records.delete'],
        ['GET', '/api/patient-documents/check-sent/DRD1', 'patient_documents.view'],
        ['POST', '/api/patient-documents/upload', 'patient_documents.create'],
        ['POST', '/api/patient-documents/publish-from-mr', 'patient_documents.create'],
        ['POST', '/api/patient-documents/42/create-share-link', 'patient_documents.share'],
        ['POST', '/api/patient-documents/notify-whatsapp', 'patient_documents.share'],
        ['POST', '/api/patient-documents/generate-resume-pdf', 'patient_documents.share'],
        ['DELETE', '/api/patient-documents/42', 'r2_files.delete'],
        ['PUT', '/api/docboard/surgery/9/outcome', 'medical_records.edit'],
        ['DELETE', '/api/docboard/surgery/9', 'medical_records.delete'],
        ['GET', '/api/registration-codes/public', 'registration_codes.view'],
        ['POST', '/api/registration-codes/generate-public', 'registration_codes.create'],
        ['POST', '/api/registration-codes/generate-now', 'registration_codes.create'],
        ['PUT', '/api/registration-codes/settings', 'registration_codes.create'],
        ['DELETE', '/api/registration-codes/42', 'registration_codes.delete'],
        ['POST', '/api/usg-bulk-upload/bot/run', 'usg_exam.sync'],
        ['POST', '/api/usg-bulk-upload/bot/schedule/run-now', 'usg_exam.sync'],
        ['GET', '/api/sunday-clinic/records/DRD1', 'medical_records.view'],
        ['POST', '/api/sunday-clinic/records/DRD1/anamnesa', 'anamnesa.edit'],
        ['POST', '/api/sunday-clinic/records/DRD1/physical_exam', 'physical_exam.edit'],
        ['POST', '/api/sunday-clinic/records/DRD1/usg', 'usg_exam.edit'],
        ['POST', '/api/sunday-clinic/records/DRD1/penunjang', 'lab_exam.edit'],
        ['POST', '/api/sunday-clinic/records/DRD1/diagnosis', 'medical_records.edit'],
        ['DELETE', '/api/sunday-clinic/records/DRD1', 'medical_records.delete'],
        ['POST', '/api/sunday-clinic/resume-medis/pdf', 'medical_records.export']
    ])('%s %s requires %s', (method, route, permission) => {
        const { createRuntimeAccessResolver } = require('../../security/accountModeAccess');
        const resolve = createRuntimeAccessResolver();
        expect(resolve(method, route)).toEqual(expect.objectContaining({ permission }));
    });
});

describe('Task 7 account-mode delegation through legacy guards', () => {
    test('every mapped Task 7 HTTP route allows its exact grant and denies a zero-grant account', async () => {
        const { buildRuntimeAccessRules, createAccountModeAccessBoundary } = require('../../security/accountModeAccess');
        const routes = buildRuntimeAccessRules({
            serverFile: path.join(backendRoot, 'server.js'),
            routesDir: path.join(backendRoot, 'routes')
        }).filter(route => TASK7_PERMISSION_PREFIXES.some(prefix => route.resolution?.permission?.startsWith(prefix)));
        expect(routes.length).toBeGreaterThanOrEqual(175);

        const state = {
            userId: 'STAFF-ACCOUNT', userType: 'staff', isActive: true, isSuperadmin: false,
            roleId: null, roleName: 'staff', mode: 'account', accessVersion: 1
        };
        for (const route of routes) {
            const run = async permissions => {
                const req = {
                    method: route.method,
                    originalUrl: route.fullPath,
                    headers: { authorization: 'Bearer test-token' },
                    context: { requestId: 'task7-complete-matrix' }
                };
                const res = responseDouble();
                const next = jest.fn();
                const boundary = createAccountModeAccessBoundary({
                    verifyJwt: () => ({ id: state.userId, user_type: 'staff' }),
                    accessControlService: {
                        getStaffAccountState: jest.fn().mockResolvedValue(state),
                        getEffectiveAccess: jest.fn().mockResolvedValue({ ...state, permissions: new Set(permissions) })
                    },
                    resolveRequestAccess: () => route.resolution,
                    logger: { warn: jest.fn(), error: jest.fn() }
                });
                await boundary(req, res, next);
                return { res, next };
            };

            const permission = route.resolution.permission;
            const allowed = await run([permission]);
            expect(allowed.next).toHaveBeenCalledTimes(1);
            const denied = await run([]);
            expect(denied.next).not.toHaveBeenCalled();
            expect(denied.res.body).toEqual(expect.objectContaining({ code: 'ACCESS_DENIED' }));
        }
    });

    test.each([
        ['GET', '/api/patients', 'patients.view'],
        ['POST', '/api/sunday-clinic/records/DRD1/anamnesa', 'anamnesa.edit'],
        ['POST', '/api/sunday-clinic/records/DRD1/usg', 'usg_exam.edit'],
        ['DELETE', '/api/sunday-clinic/records/DRD1', 'medical_records.delete'],
        ['POST', '/api/patient-documents/42/create-share-link', 'patient_documents.share'],
        ['DELETE', '/api/registration-codes/42', 'registration_codes.delete']
    ])('global boundary allows only the exact grant for %s %s', async (method, requestPath, permission) => {
        const { createAccountModeAccessBoundary, createRuntimeAccessResolver } = require('../../security/accountModeAccess');
        const state = {
            userId: 'STAFF-ACCOUNT', userType: 'staff', isActive: true, isSuperadmin: false,
            roleId: null, roleName: 'staff', mode: 'account', accessVersion: 1
        };
        const run = async permissions => {
            const req = {
                method,
                originalUrl: requestPath,
                headers: { authorization: 'Bearer test-token' },
                context: { requestId: 'task7-boundary' }
            };
            const res = responseDouble();
            const next = jest.fn();
            const boundary = createAccountModeAccessBoundary({
                verifyJwt: () => ({ id: state.userId, user_type: 'staff' }),
                accessControlService: {
                    getStaffAccountState: jest.fn().mockResolvedValue(state),
                    getEffectiveAccess: jest.fn().mockResolvedValue({ ...state, permissions: new Set(permissions) })
                },
                resolveRequestAccess: createRuntimeAccessResolver(),
                logger: { warn: jest.fn(), error: jest.fn() }
            });
            await boundary(req, res, next);
            return { req, res, next };
        };

        const allowed = await run([permission]);
        expect(allowed.next).toHaveBeenCalledTimes(1);
        expect(allowed.req.accountAccessResolution).toEqual(expect.objectContaining({ permission }));

        const denied = await run([]);
        expect(denied.next).not.toHaveBeenCalled();
        expect(denied.res.status).toHaveBeenCalledWith(403);
        expect(denied.res.body).toEqual(expect.objectContaining({ code: 'ACCESS_DENIED' }));
    });

    test('requirePermission accepts an already-authorized account-mode Task 7 decision without role tables', async () => {
        const { requirePermission } = require('../../middleware/auth');
        const req = accountRequest('medical_records.edit');
        const res = responseDouble();
        const next = jest.fn();
        await requirePermission('medical_records.edit')(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('superadmin-compatible guard delegates only the named account permission', () => {
        const { requireSuperadminOrAccountPermission } = require('../../middleware/auth');
        const allowed = accountRequest('patients.merge');
        const allowedRes = responseDouble();
        const allowedNext = jest.fn();
        requireSuperadminOrAccountPermission('patients.merge')(allowed, allowedRes, allowedNext);
        expect(allowedNext).toHaveBeenCalledTimes(1);

        const denied = accountRequest('patients.view');
        const deniedRes = responseDouble();
        const deniedNext = jest.fn();
        requireSuperadminOrAccountPermission('patients.merge')(denied, deniedRes, deniedNext);
        expect(deniedRes.status).toHaveBeenCalledWith(403);
        expect(deniedNext).not.toHaveBeenCalled();
    });

    test('delegation is active for Task 7 permissions and remains closed for later groups', () => {
        const { isDelegatedAccountPermission } = require('../../middleware/auth');
        expect(isDelegatedAccountPermission(accountRequest('patients.delete'), ['patients.delete'])).toBe(true);
        expect(isDelegatedAccountPermission(accountRequest('medical_records.finalize'), ['medical_records.finalize'])).toBe(true);
        expect(isDelegatedAccountPermission(accountRequest('patient_documents.share'), ['patient_documents.share'])).toBe(true);
        expect(isDelegatedAccountPermission(accountRequest('r2_files.delete'), ['r2_files.delete'])).toBe(true);
        expect(isDelegatedAccountPermission(accountRequest('registration_codes.create'), ['registration_codes.create'])).toBe(true);
        expect(isDelegatedAccountPermission(accountRequest('billing.process_payment'), ['billing.process_payment'])).toBe(false);
    });

    test('section reset accepts a boundary-authorized account while retaining the legacy role gate', () => {
        const service = require('../../services/MedicalRecordService');
        const principal = { id: 'STAFF-ACCOUNT', user_type: 'staff', role: 'staff', role_id: null };
        expect(() => service.assertResetRole(principal, { delegatedPermission: true })).not.toThrow();
        expect(() => service.assertResetRole(principal)).toThrow(expect.objectContaining({ code: 'CLINICAL_RESET_ROLE_REQUIRED' }));
    });
});

describe('Task 7 HTTP, realtime, and UI wiring', () => {
    test('destructive patient and exam routes preserve legacy behavior while accepting exact account grants', () => {
        const patients = fs.readFileSync(path.join(backendRoot, 'routes/patients.js'), 'utf8');
        const patientAuth = fs.readFileSync(path.join(backendRoot, 'routes/patients-auth.js'), 'utf8');
        const intake = fs.readFileSync(path.join(backendRoot, 'routes/patient-intake.js'), 'utf8');
        const exams = fs.readFileSync(path.join(backendRoot, 'routes/medical-exams.js'), 'utf8');
        const documents = fs.readFileSync(path.join(backendRoot, 'routes/patient-documents.js'), 'utf8');
        const registrationCodes = fs.readFileSync(path.join(backendRoot, 'routes/registration-codes.js'), 'utf8');
        const surgery = fs.readFileSync(path.join(backendRoot, 'routes/surgery.js'), 'utf8');
        expect(patients).toContain("requireSuperadminOrAccountPermission('patients.merge')");
        expect(patients).toContain("requireSuperadminOrAccountPermission('patients.bulk_delete')");
        expect(patientAuth).toContain("isDelegatedAccountPermission(req, ['patients.delete'])");
        expect(patientAuth).toContain("isDelegatedAccountPermission(req, ['patients.edit'])");
        expect(intake).toContain("requireSuperadminOrAccountPermission('medical_records.delete')");
        expect(exams).toContain("requireSuperadminOrAccountPermission('medical_records.delete')");
        expect(documents).toContain("requireSuperadminOrAccountPermission('r2_files.delete')");
        expect(registrationCodes).toContain("requireSuperadminOrAccountPermission('registration_codes.create')");
        expect(surgery).toContain("requireSuperadminOrAccountPermission('medical_records.edit')");
        expect(surgery).toContain("requireSuperadminOrAccountPermission('medical_records.delete')");
    });

    test('visit finalization and patient/record events use permission gates', () => {
        const server = fs.readFileSync(path.join(backendRoot, 'server.js'), 'utf8');
        expect(server).toMatch(/onStaffEvent\(socket, 'visit:complete',[\s\S]{0,900}\{ permission: 'medical_records\.finalize' \}/);
        for (const permission of ['patients.view', 'anamnesa.edit', 'physical_exam.edit', 'usg_exam.edit', 'lab_exam.edit']) {
            expect(server).toContain(`{ permission: '${permission}' }`);
        }
    });

    test('account-mode UI hides or disables patient actions by exact permission', () => {
        const accessUi = fs.readFileSync(path.join(publicRoot, 'scripts/shell/account-access.js'), 'utf8');
        const shell = fs.readFileSync(path.join(publicRoot, 'index-adminlte.html'), 'utf8');
        const patientTools = fs.readFileSync(path.join(publicRoot, 'scripts/legacy/patient-tools.js'), 'utf8');
        const patientsUi = fs.readFileSync(path.join(publicRoot, 'scripts/patients.js'), 'utf8');
        const sundayClinicUi = fs.readFileSync(path.join(publicRoot, 'scripts/sunday-clinic/main.js'), 'utf8');
        const sendToPatientUi = fs.readFileSync(path.join(publicRoot, 'scripts/sunday-clinic/components/shared/send-to-patient.js'), 'utf8');
        const registrationUi = fs.readFileSync(path.join(publicRoot, 'scripts/shell/registration-codes.js'), 'utf8');
        expect(accessUi).toContain('data-account-permission');
        expect(accessUi).toContain('window.hasAccountPermission');
        expect(shell).toContain('data-account-permission="patients.merge"');
        expect(shell).toContain('data-account-permission="patients.bulk_delete"');
        expect(patientTools).toContain("hasAccountPermission('patients.reset')");
        for (const permission of ['patients.edit', 'patients.delete', 'patients.bulk_delete']) {
            expect(patientTools).toContain(`hasAccountPermission('${permission}')`);
        }
        for (const permission of ['patients.create', 'patients.edit', 'patients.delete']) {
            expect(patientsUi).toContain(`'${permission}'`);
        }
        for (const permission of ['medical_records.edit', 'medical_records.delete', 'medical_records.export', 'medical_records.reset_section', 'medical_records.finalize']) {
            expect(sundayClinicUi).toContain(`'${permission}'`);
        }
        expect(sundayClinicUi).toContain("'patient_documents.share'");
        expect(sundayClinicUi).toContain("'patient_documents.create'");
        expect(sendToPatientUi).toContain("requirePermission('patient_documents.create'");
        for (const permission of ['registration_codes.view', 'registration_codes.create', 'registration_codes.delete']) {
            expect(registrationUi).toContain(`'${permission}'`);
        }
    });
});
