const {
    buildDriverSlipDocument,
    buildStaffSlipDocument,
    buildBatchSlipDocument
} = require('../../../public/scripts/staff-payroll-print');

describe('staff payroll printable slips', () => {
    const finalizedBatch = {
        id: 12,
        status: 'finalized',
        cycle_label: '2026-07-05 s/d 2026-07-26',
        payroll_date: '2026-07-31',
        practice_dates: ['2026-07-05', '2026-07-12', '2026-07-19', '2026-07-26'],
        items: [{
            staff_id: 'STF-01',
            staff_name: 'Pegawai <Sunday>',
            role_display: 'Bidan',
            attendance_dates: ['2026-07-05', '2026-07-12'],
            attendance_count: 2,
            base_amount: 150000,
            additional_amount: 100000,
            adjustment_amount: 25000,
            total_amount: 275000,
            notes: 'Tambahan & transport'
        }]
    };

    const finalizedDriver = {
        id: 4,
        status: 'finalized',
        payroll_month: '2026-07-01',
        calendar_days: 31,
        sunday_count: 4,
        working_days: 27,
        monthly_salary: 1500000,
        absence_days: 1,
        daily_deduction: 56000,
        deduction_amount: 56000,
        total_amount: 1444000
    };

    test('builds an escaped finalized Sunday Clinic employee slip', () => {
        const html = buildStaffSlipDocument(finalizedBatch, finalizedBatch.items[0]);

        expect(html).toContain('SLIP GAJI PEGAWAI SUNDAY CLINIC');
        expect(html).toContain('Pegawai &lt;Sunday&gt;');
        expect(html).not.toContain('Pegawai <Sunday>');
        expect(html).toContain('Rp 275.000');
        expect(html).toContain('Tambahan &amp; transport');
        expect(html).toContain('SC-12-STF-01');
    });

    test('builds a finalized monthly driver slip with deduction details', () => {
        const html = buildDriverSlipDocument(finalizedDriver);

        expect(html).toContain('SLIP GAJI SUPIR');
        expect(html).toContain('Private');
        expect(html).toContain('Juli 2026');
        expect(html).toContain('Rp 1.500.000');
        expect(html).toContain('Rp 56.000');
        expect(html).toContain('Rp 1.444.000');
        expect(html).toContain('DRV-202607');
    });

    test('builds one page per paid staff member for batch printing', () => {
        const html = buildBatchSlipDocument({
            ...finalizedBatch,
            items: [
                finalizedBatch.items[0],
                { ...finalizedBatch.items[0], staff_id: 'STF-02', staff_name: 'Pegawai Dua', total_amount: 0 }
            ]
        });

        expect((html.match(/class="payroll-slip"/g) || []).length).toBe(1);
        expect(html).not.toContain('Pegawai Dua');
    });

    test('adds the supplied dr. Dibya signature to driver and staff slips', () => {
        const driverHtml = buildDriverSlipDocument(finalizedDriver);
        const staffHtml = buildStaffSlipDocument(finalizedBatch, finalizedBatch.items[0]);

        [driverHtml, staffHtml].forEach((html) => {
            expect(html).toContain('class="signature-image"');
            expect(html).toContain('src="data:image/jpeg;base64,');
            expect(html).toContain('alt="Tanda tangan dr. Dibya"');
            expect(html).toContain('>dr. Dibya</div>');

            const signatureMatch = html.match(/class="signature-image" src="data:image\/jpeg;base64,([^"]+)"/);
            expect(signatureMatch).not.toBeNull();
            const signatureBytes = Buffer.from(signatureMatch[1], 'base64');
            expect(signatureBytes).toHaveLength(5436);
            expect([...signatureBytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
            expect([...signatureBytes.subarray(-2)]).toEqual([0xff, 0xd9]);
        });
    });

    test('rejects draft records so unofficial slips cannot be printed', () => {
        expect(() => buildDriverSlipDocument({ ...finalizedDriver, status: 'draft' })).toThrow(/finalized/i);
        expect(() => buildStaffSlipDocument({ ...finalizedBatch, status: 'draft' }, finalizedBatch.items[0])).toThrow(/finalized/i);
    });
});
