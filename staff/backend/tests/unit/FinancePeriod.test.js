const {
    resolveFinancePeriod,
    prorateMonthlyAmounts
} = require('../../utils/finance-period');

describe('resolveFinancePeriod', () => {
    const now = new Date('2026-11-07T10:00:00+07:00');

    test('uses an explicit inclusive date range with an exclusive upper bound', () => {
        expect(resolveFinancePeriod({ start_date: '2026-10-15', end_date: '2026-11-10' }, now)).toEqual({
            ok: true,
            month: null,
            startDate: '2026-10-15',
            endDate: '2026-11-10',
            endExclusive: '2026-11-11',
            totalDays: 27
        });
    });

    test('rolls the exclusive upper bound over month and year ends', () => {
        expect(resolveFinancePeriod({ start_date: '2026-12-31', end_date: '2026-12-31' }, now))
            .toMatchObject({ ok: true, endExclusive: '2027-01-01', totalDays: 1 });
        expect(resolveFinancePeriod({ start_date: '2028-02-01', end_date: '2028-02-29' }, now))
            .toMatchObject({ ok: true, endExclusive: '2028-03-01', totalDays: 29 });
    });

    test('marks a range that is exactly one calendar month with its month', () => {
        expect(resolveFinancePeriod({ start_date: '2026-11-01', end_date: '2026-11-30' }, now))
            .toMatchObject({ ok: true, month: '2026-11' });
    });

    test('keeps the legacy month parameter working', () => {
        expect(resolveFinancePeriod({ month: '2026-02' }, now)).toEqual({
            ok: true,
            month: '2026-02',
            startDate: '2026-02-01',
            endDate: '2026-02-28',
            endExclusive: '2026-03-01',
            totalDays: 28
        });
    });

    test('defaults to the current Jakarta month', () => {
        expect(resolveFinancePeriod({}, now)).toMatchObject({
            ok: true,
            month: '2026-11',
            startDate: '2026-11-01',
            endDate: '2026-11-30'
        });
    });

    test.each([
        [{ start_date: '2026-11-10' }, 'Tanggal mulai dan tanggal akhir harus diisi bersamaan'],
        [{ end_date: '2026-11-10' }, 'Tanggal mulai dan tanggal akhir harus diisi bersamaan'],
        [{ start_date: '2026-02-30', end_date: '2026-03-01' }, 'Format tanggal harus YYYY-MM-DD'],
        [{ start_date: '10-11-2026', end_date: '2026-11-20' }, 'Format tanggal harus YYYY-MM-DD'],
        [{ start_date: '2026-11-20', end_date: '2026-11-10' }, 'Tanggal mulai tidak boleh setelah tanggal akhir'],
        [{ month: '2026-13' }, 'Format bulan harus YYYY-MM']
    ])('rejects invalid input %j', (query, message) => {
        expect(resolveFinancePeriod(query, now)).toEqual({ ok: false, message });
    });
});

describe('prorateMonthlyAmounts', () => {
    test('charges a full month when the range covers the whole month', () => {
        const result = prorateMonthlyAmounts(
            [{ month: '2026-10', amount: 500000 }],
            '2026-10-01',
            '2026-10-31'
        );

        expect(result).toEqual({
            total: 500000,
            prorated: false,
            months: [{ month: '2026-10', days: 31, daysInMonth: 31, fullAmount: 500000, amount: 500000 }]
        });
    });

    test('charges only the days of each month that fall inside the range', () => {
        const result = prorateMonthlyAmounts(
            [
                { month: '2026-10', amount: 500000 },
                { month: '2026-11', amount: 600000 }
            ],
            '2026-10-15',
            '2026-11-10'
        );

        // October: 15..31 = 17 of 31 days; November: 1..10 = 10 of 30 days.
        expect(result.months).toEqual([
            { month: '2026-10', days: 17, daysInMonth: 31, fullAmount: 500000, amount: Math.round(500000 * 17 / 31) },
            { month: '2026-11', days: 10, daysInMonth: 30, fullAmount: 600000, amount: 200000 }
        ]);
        expect(result.total).toBe(Math.round(500000 * 17 / 31) + 200000);
        expect(result.prorated).toBe(true);
    });

    test('ignores months outside the range and non-positive amounts', () => {
        const result = prorateMonthlyAmounts(
            [
                { month: '2026-09', amount: 500000 },
                { month: '2026-11', amount: 0 },
                { month: '2026-11', amount: 'abc' }
            ],
            '2026-11-10',
            '2026-11-20'
        );

        expect(result).toEqual({ total: 0, prorated: false, months: [] });
    });
});
