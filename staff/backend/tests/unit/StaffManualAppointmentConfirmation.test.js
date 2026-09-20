const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');

describe('staff manual appointment confirmation', () => {
    test('provides a staff-only API that records the confirmation time', () => {
        const routeSource = fs.readFileSync(
            path.join(projectRoot, 'backend/routes/sunday-appointments.js'),
            'utf8'
        );

        expect(routeSource).toMatch(/router\.post\('\/:id\/manual-confirm', verifyToken/);
        expect(routeSource).toMatch(/user_type === 'patient'/);
        expect(routeSource).toMatch(/status = 'confirmed',\s*confirmed_at = NOW\(\)/);
        expect(routeSource).toContain("appointment.cancelled_by === 'system'");
        expect(routeSource).toContain('Tidak konfirmasi kehadiran sebelum jam 09.00 WIB');
    });

    test('shows and exports the manual confirmation action for unconfirmed bookings', () => {
        const frontendSource = fs.readFileSync(
            path.join(projectRoot, 'public/scripts/kelola-appointment.js'),
            'utf8'
        );

        expect(frontendSource).toMatch(/manualConfirmAppointment\(\$\{apt\.id\}\)/);
        expect(frontendSource).toContain('Konfirmasi Hadir');
        expect(frontendSource).toMatch(/window\.manualConfirmAppointment = manualConfirmAppointment/);
        expect(frontendSource).toContain('`${API_BASE}/${appointmentId}/manual-confirm`');
        expect(frontendSource).toMatch(/if \(\$\('#filter-status'\)\.val\(\) === apt\.status\)/);
        expect(frontendSource).toMatch(/\$\('#filter-status'\)\.val\(''\)/);
        expect(frontendSource).not.toMatch(/\$\('#filter-status'\)\.val\('confirmed'\)/);
        expect(frontendSource).toContain("apt.cancelled_by === 'system'");
        expect(frontendSource).toContain('Tidak konfirmasi kehadiran sebelum jam 09.00 WIB');
    });

    test('loads the upcoming Sunday after setting the visible date filter', () => {
        const frontendSource = fs.readFileSync(
            path.join(projectRoot, 'public/scripts/kelola-appointment.js'),
            'utf8'
        );

        const setDateAt = frontendSource.indexOf("$('#filter-date').val(getNextSunday())");
        const loadAt = frontendSource.indexOf('loadAppointments();', setDateAt);
        expect(setDateAt).toBeGreaterThan(-1);
        expect(loadAt).toBeGreaterThan(setDateAt);
    });

    test('keeps system-expired no-confirmation bookings visible to staff', () => {
        const routeSource = fs.readFileSync(
            path.join(projectRoot, 'backend/routes/sunday-appointments.js'),
            'utf8'
        );

        expect(routeSource).toContain('a.cancelled_by = ?');
        expect(routeSource).toContain('a.cancellation_reason = ?');
        expect(routeSource).toContain("params.push('cancelled', 'cancelled', 'system', AUTO_NO_CONFIRMATION_REASON)");
    });
});
