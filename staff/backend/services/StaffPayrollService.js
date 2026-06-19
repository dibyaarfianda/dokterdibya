const PAYROLL_CONFIG = Object.freeze({
    BASE_AMOUNT: 150000,
    ADDITIONAL_RATE: 100000
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
    calculatePayroll,
    validateEmployeePayrollInput,
    sumPayrollItems
};
