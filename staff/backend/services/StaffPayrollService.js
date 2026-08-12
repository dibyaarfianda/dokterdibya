const PAYROLL_CONFIG = Object.freeze({
    BASE_AMOUNT: 150000,
    ADDITIONAL_RATE: 100000
});

const DRIVER_PAYROLL_CONFIG = Object.freeze({
    MONTHLY_SALARY: 1500000,
    DEDUCTION_ROUNDING: 1000,
    WEEKLY_DAY_OFF: 0
});

function toInteger(value, fieldName) {
    const normalized = value === undefined || value === null || value === '' ? 0 : Number(value);
    if (!Number.isInteger(normalized)) {
        throw new Error(`${fieldName} harus berupa bilangan bulat`);
    }
    return normalized;
}

function calculatePayroll(attendanceCount, adjustmentAmount = 0) {
    const count = toInteger(attendanceCount, 'jumlah_hadir');
    const adjustment = toInteger(adjustmentAmount, 'bonus_penyesuaian');

    if (count < 0) {
        throw new Error('jumlah_hadir tidak boleh negatif');
    }

    if (count === 0) {
        if (adjustment !== 0) {
            throw new Error('bonus_penyesuaian harus 0 jika jumlah_hadir 0');
        }
        return {
            attendance_count: 0,
            base_amount: 0,
            additional_count: 0,
            additional_amount: 0,
            adjustment_amount: adjustment,
            total_amount: adjustment
        };
    }

    const additionalCount = Math.max(0, count - 1);
    const baseAmount = PAYROLL_CONFIG.BASE_AMOUNT;
    const additionalAmount = additionalCount * PAYROLL_CONFIG.ADDITIONAL_RATE;
    const totalAmount = baseAmount + additionalAmount + adjustment;

    if (totalAmount < 0) {
        throw new Error('Pendapatan akhir tidak boleh negatif');
    }

    return {
        attendance_count: count,
        base_amount: baseAmount,
        additional_count: additionalCount,
        additional_amount: additionalAmount,
        adjustment_amount: adjustment,
        total_amount: totalAmount
    };
}

function normalizePayrollMonth(value) {
    const month = String(value || '').trim();
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) {
        throw new Error('bulan_gaji harus format YYYY-MM');
    }

    const year = Number(match[1]);
    const monthNumber = Number(match[2]);
    if (year < 2000 || year > 2100 || monthNumber < 1 || monthNumber > 12) {
        throw new Error('bulan_gaji tidak valid');
    }

    return month;
}

function calculateDriverPayroll(payrollMonth, absenceDays = 0) {
    const normalizedMonth = normalizePayrollMonth(payrollMonth);
    const absence = toInteger(absenceDays, 'hari_tidak_masuk');
    if (absence < 0) {
        throw new Error('hari_tidak_masuk tidak boleh negatif');
    }

    const [year, monthNumber] = normalizedMonth.split('-').map(Number);
    const calendarDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    let sundayCount = 0;
    for (let day = 1; day <= calendarDays; day += 1) {
        if (new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay() === DRIVER_PAYROLL_CONFIG.WEEKLY_DAY_OFF) {
            sundayCount += 1;
        }
    }

    const workingDays = calendarDays - sundayCount;
    if (absence > workingDays) {
        throw new Error(`hari_tidak_masuk tidak boleh melebihi ${workingDays} hari kerja`);
    }

    const dailyDeduction = Math.ceil(
        (DRIVER_PAYROLL_CONFIG.MONTHLY_SALARY / workingDays) / DRIVER_PAYROLL_CONFIG.DEDUCTION_ROUNDING
    ) * DRIVER_PAYROLL_CONFIG.DEDUCTION_ROUNDING;
    const deductionAmount = Math.min(
        DRIVER_PAYROLL_CONFIG.MONTHLY_SALARY,
        absence * dailyDeduction
    );

    return {
        payroll_month: `${normalizedMonth}-01`,
        calendar_days: calendarDays,
        sunday_count: sundayCount,
        working_days: workingDays,
        monthly_salary: DRIVER_PAYROLL_CONFIG.MONTHLY_SALARY,
        absence_days: absence,
        daily_deduction: dailyDeduction,
        deduction_amount: deductionAmount,
        total_amount: DRIVER_PAYROLL_CONFIG.MONTHLY_SALARY - deductionAmount
    };
}

function validateEmployeePayrollInput(input) {
    const name = String(input && input.name ? input.name : '').trim();
    if (!name) {
        throw new Error('nama wajib diisi');
    }
    return calculatePayroll(input.attendance_count, input.adjustment_amount || 0);
}

function sumPayrollItems(items) {
    return (items || []).reduce((sum, item) => sum + (Number(item.total_amount) || 0), 0);
}

module.exports = {
    PAYROLL_CONFIG,
    DRIVER_PAYROLL_CONFIG,
    calculatePayroll,
    calculateDriverPayroll,
    normalizePayrollMonth,
    validateEmployeePayrollInput,
    sumPayrollItems
};
