const {
    PAYROLL_CONFIG,
    DRIVER_PAYROLL_CONFIG,
    calculatePayroll,
    calculateDriverPayroll,
    validateEmployeePayrollInput,
    sumPayrollItems
} = require('../../services/StaffPayrollService');

describe('StaffPayrollService', () => {
    test('uses configured integer payroll rates', () => {
        expect(PAYROLL_CONFIG.BASE_AMOUNT).toBe(150000);
        expect(PAYROLL_CONFIG.ADDITIONAL_RATE).toBe(100000);
        expect(DRIVER_PAYROLL_CONFIG.MONTHLY_SALARY).toBe(1500000);
        expect(DRIVER_PAYROLL_CONFIG.DEDUCTION_ROUNDING).toBe(1000);
    });

    test('calculates July 2026 driver payroll with Sundays off and rounded-up daily deduction', () => {
        expect(calculateDriverPayroll('2026-07', 1)).toEqual({
            payroll_month: '2026-07-01',
            calendar_days: 31,
            sunday_count: 4,
            working_days: 27,
            monthly_salary: 1500000,
            absence_days: 1,
            daily_deduction: 56000,
            deduction_amount: 56000,
            total_amount: 1444000
        });
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
});
