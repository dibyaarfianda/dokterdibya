'use strict';

// "Sudah Lahir" and "Kehamilan Berakhir" close a pregnancy: dokter/bidan only (user decision 2026-11-22).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { assertCanClose } = require('../../services/PregnancyEpisodeService');
const { ROLE_IDS, ROLE_NAMES } = require('../../constants/roles');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('closing a pregnancy is dokter/bidan only', () => {
    test('assertCanClose allows dokter, bidan and superadmin, refuses other staff with 403', () => {
        expect(() => assertCanClose({ role_id: ROLE_IDS.DOKTER })).not.toThrow();
        expect(() => assertCanClose({ role: ROLE_NAMES.BIDAN })).not.toThrow();
        expect(() => assertCanClose({ role_id: ROLE_IDS.BIDAN })).not.toThrow();
        expect(() => assertCanClose({ is_superadmin: true, role: ROLE_NAMES.ADMIN })).not.toThrow();
        for (const actor of [{ role: ROLE_NAMES.ADMIN, role_id: ROLE_IDS.ADMIN }, { role: ROLE_NAMES.FRONT_OFFICE }, null]) {
            let error = null;
            try { assertCanClose(actor); } catch (err) { error = err; }
            expect(error).not.toBeNull();
            expect(error.status).toBe(403);
            expect(error.message).toBe('Hanya dokter atau bidan yang dapat menutup kehamilan');
        }
    });

    test.each([
        ["router.post('/api/patients/:id/mark-delivered'", 'markPatientDelivered('],
        ["router.post('/api/patients/:id/pregnancy-outcome'", 'pregnancyOutcomeService.record('],
        ["router.delete('/api/patients/:id/pregnancy-outcome/:outcomeId'", 'pregnancyOutcomeService.voidOutcome(']
    ])('%s checks the role before writing', (routeStart, writeCall) => {
        const source = read('staff/backend/routes/patients.js');
        const start = source.indexOf(routeStart);
        expect(start).toBeGreaterThan(-1);
        const handler = source.slice(start, source.indexOf('\n});', start));
        const guard = handler.indexOf('assertCanClose(req.user)');
        expect(guard).toBeGreaterThan(-1);
        expect(guard).toBeLessThan(handler.indexOf(writeCall));
    });

    test('frontend role helper mirrors the backend rule', () => {
        const source = read('staff/public/scripts/role-constants.js')
            .replace(/^export\s+/gm, '');
        const window = {};
        vm.runInNewContext(source, { window, Number });
        const check = window.isPregnancyCloserUser;
        expect(check({ role_id: ROLE_IDS.DOKTER })).toBe(true);
        expect(check({ role: ROLE_NAMES.BIDAN })).toBe(true);
        expect(check({ role_id: ROLE_IDS.BIDAN })).toBe(true);
        expect(check({ is_superadmin: true })).toBe(true);
        expect(check({ role: ROLE_NAMES.ADMIN, role_id: ROLE_IDS.ADMIN })).toBe(false);
        expect(check({ role: ROLE_NAMES.FRONT_OFFICE, role_id: ROLE_IDS.FRONT_OFFICE })).toBe(false);
        expect(check(null)).toBe(false);
    });

    test('Kelola Pasien shows the close buttons only through canClosePregnancy()', () => {
        const source = read('staff/public/scripts/legacy/patient-tools.js');
        expect(source).toContain('function canClosePregnancy()');
        expect(source).toMatch(/const actionButton = canClosePregnancy\(\)/);
        expect(source).toContain('if (canClosePregnancy() && patient.is_obstetri && !patient.pregnancy_end)');
        expect(source).toMatch(/window\.markAsDelivered = async function[^\n]*\n\s*if \(!canClosePregnancy\(\)\) return;/);
        expect(source).toMatch(/window\.markPregnancyEnded = async function[^\n]*\n\s*if \(!canClosePregnancy\(\)\) return;/);
        expect(source).toContain('const canEdit = Boolean(canClosePregnancy() && outcome.id);');
    });

    test('canClosePregnancy hides the buttons for admin staff and shows them for bidan', () => {
        const source = read('staff/public/scripts/legacy/patient-tools.js');
        const fn = source.match(/function hasPatientToolsPermission[\s\S]*?\n    }\n[\s\S]*?function canClosePregnancy\(\) \{[\s\S]*?\n    }/)[0];
        const run = (user, helper) => {
            const window = { currentStaffUser: user, isPregnancyCloserUser: helper, hasAccountPermission: () => true };
            return vm.runInNewContext(`${fn}\ncanClosePregnancy();`, { window });
        };
        const helper = user => user.role === 'bidan' || user.role === 'dokter';
        expect(run({ role: 'admin' }, helper)).toBe(false);
        expect(run({ role: 'bidan' }, helper)).toBe(true);
        // Unknown user or missing helper: show the button, the server refuses non dokter/bidan.
        expect(run(null, helper)).toBe(true);
        expect(run({ role: 'admin' }, undefined)).toBe(true);
    });
});
