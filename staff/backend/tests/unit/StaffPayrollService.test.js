const {
    PAYROLL_CONFIG,
    DRIVER_PAYROLL_CONFIG,
    calculatePayroll,
    calculateDriverPayroll,
    calculateDoctorPaidAmount,
    normalizePayrollRates,
    validateEmployeePayrollInput,
    sumPayrollItems
} = require('../../services/StaffPayrollService');

describe('StaffPayrollService', () => {
    test('uses configured integer payroll rates', () => {
        expect(PAYROLL_CONFIG.BASE_AMOUNT).toBe(150000);
        expect(PAYROLL_CONFIG.ADDITIONAL_RATE).toBe(100000);
        expect(DRIVER_PAYROLL_CONFIG.FIXED_SALARY).toBe(1000000);
        expect(DRIVER_PAYROLL_CONFIG.DEFAULT_DOCTOR_BONUS).toBe(500000);
        expect(DRIVER_PAYROLL_CONFIG.DEDUCTION_ROUNDING).toBe(1000);
    });

    test('calculates July 2026 driver payroll with Sundays off and rounded-up daily deduction', () => {
        expect(calculateDriverPayroll('2026-07', 1)).toEqual({
            payroll_month: '2026-07-01',
            calendar_days: 31,
            sunday_count: 4,
            working_days: 27,
            fixed_salary: 1000000,
            doctor_bonus: 500000,
            monthly_salary: 1500000,
            absence_days: 1,
            daily_deduction: 56000,
            deduction_amount: 56000,
            total_amount: 1444000,
            doctor_paid_amount: 444000
        });
    });

    test('uses a custom dokterdibya bonus on top of the fixed RSIA Melinda salary', () => {
        const result = calculateDriverPayroll('2026-07', 1, 750000);

        expect(result.fixed_salary).toBe(1000000);
        expect(result.doctor_bonus).toBe(750000);
        expect(result.monthly_salary).toBe(1750000);
        expect(result.daily_deduction).toBe(65000);
        expect(result.total_amount).toBe(1685000);
        expect(result.doctor_paid_amount).toBe(685000);
    });

    test('accepts a zero dokterdibya bonus and numeric strings', () => {
        expect(calculateDriverPayroll('2026-07', 0, 0)).toMatchObject({
            monthly_salary: 1000000,
            total_amount: 1000000,
            doctor_paid_amount: 0
        });
        expect(calculateDriverPayroll('2026-07', 0, '600000').doctor_bonus).toBe(600000);
    });

    test('defaults the dokterdibya bonus when it is omitted or empty', () => {
        expect(calculateDriverPayroll('2026-07', 0).doctor_bonus).toBe(500000);
        expect(calculateDriverPayroll('2026-07', 0, '').doctor_bonus).toBe(500000);
    });

    test.each([-1, 1500.5, 'abc', 10000001])('rejects invalid dokterdibya bonus %p', (bonus) => {
        expect(() => calculateDriverPayroll('2026-07', 0, bonus)).toThrow(/tambahan_dokter/);
    });

    test('clamps the dokterdibya share at zero when deductions exceed the bonus', () => {
        const result = calculateDriverPayroll('2026-07', 10);

        expect(result.total_amount).toBe(940000);
        expect(result.doctor_paid_amount).toBe(0);
        expect(calculateDoctorPaidAmount(1200000, 1000000)).toBe(200000);
    });

    test('keeps full driver salary when absence is zero', () => {
        expect(calculateDriverPayroll('2026-07', 0).total_amount).toBe(1500000);
    });

    test('never produces a negative salary when every working day is absent', () => {
        const result = calculateDriverPayroll('2026-07', 27);

        expect(result.deduction_amount).toBe(1500000);
        expect(result.total_amount).toBe(0);
    });

    test('rejects driver absence above the working days for that month', () => {
        expect(() => calculateDriverPayroll('2026-07', 28)).toThrow(/hari kerja/);
    });

    test.each([
        [1, 0, 150000],
        [2, 0, 250000],
        [3, 0, 350000],
        [2, 100000, 350000],
        [4, 0, 450000]
    ])('attendance %i adjustment %i produces %i', (attendance, adjustment, expected) => {
        expect(calculatePayroll(attendance, adjustment).total_amount).toBe(expected);
    });

    test('zero attendance is not paid', () => {
        expect(calculatePayroll(0, 0)).toMatchObject({
            attendance_count: 0,
            base_amount: 0,
            additional_amount: 0,
            total_amount: 0
        });
    });

    test('negative adjustment is allowed when final total remains non-negative', () => {
        expect(calculatePayroll(2, -50000).total_amount).toBe(200000);
    });

    test('rejects invalid attendance and negative final totals', () => {
        expect(() => calculatePayroll(0.5, 0)).toThrow(/jumlah_hadir/);
        expect(() => calculatePayroll(-1, 0)).toThrow(/jumlah_hadir/);
        expect(() => calculatePayroll(1, -200000)).toThrow(/Pendapatan akhir/);
        expect(() => calculatePayroll(0, 100000)).toThrow(/jumlah_hadir 0/);
    });

    test('rejects empty employee name', () => {
        expect(() => validateEmployeePayrollInput({
            name: '',
            attendance_count: 1,
            adjustment_amount: 0
        })).toThrow(/nama wajib/);
    });

    test('prompt examples total 2300000', () => {
        const examples = [
            calculatePayroll(3, 0),
            calculatePayroll(2, 0),
            calculatePayroll(2, 100000),
            calculatePayroll(1, 100000),
            calculatePayroll(1, 0),
            calculatePayroll(2, 100000),
            calculatePayroll(4, 0),
            calculatePayroll(1, 0)
        ];

        expect(sumPayrollItems(examples)).toBe(2300000);
    });
    test('uses custom per-batch rates when provided', () => {
        expect(calculatePayroll(3, 0, { base_amount: 200000, additional_rate: 120000 })).toMatchObject({
            base_amount: 200000,
            additional_amount: 240000,
            total_amount: 440000
        });
        expect(calculatePayroll(8, 0).total_amount).toBe(850000);
    });

    test('legacy batches without snapshot rates fall back to 150rb / 100rb', () => {
        expect(normalizePayrollRates({ base_amount: null, additional_rate: undefined })).toEqual({
            base_amount: 150000,
            additional_rate: 100000
        });
        expect(normalizePayrollRates({ base_rate: 175000, additional_rate: 0 })).toEqual({
            base_amount: 175000,
            additional_rate: 0
        });
    });

    test.each([-1, 1.5, 'abc'])('rejects invalid rate %p', (rate) => {
        expect(() => normalizePayrollRates({ base_amount: rate })).toThrow(/tarif_hadir_pertama/);
    });

    test('pays task allowance only when the staff attended', () => {
        expect(calculatePayroll(2, 0, { allowance_amount: 100000 })).toMatchObject({
            allowance_amount: 100000,
            total_amount: 350000
        });
        expect(calculatePayroll(0, 0, { allowance_amount: 100000 })).toMatchObject({
            allowance_amount: 0,
            total_amount: 0
        });
        expect(() => calculatePayroll(1, 0, { allowance_amount: -5 })).toThrow(/tunjangan/);
    });
});
