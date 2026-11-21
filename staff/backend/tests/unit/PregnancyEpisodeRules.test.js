'use strict';

const rules = require('../../services/PregnancyEpisodeRules');
const { PREGNANCY_COMPLICATIONS } = require('../../constants/pregnancyComplications');

describe('constants', () => {
    test('thresholds', () => {
        expect(rules.SAME_PREGNANCY_DAYS).toBe(14);
        expect(rules.NEW_PREGNANCY_AFTER_DAYS).toBe(294);
    });

    test('delivery methods', () => {
        expect(rules.DELIVERY_METHODS).toEqual(['Spt B (Spontan)', 'SC (Caesar)', 'Vakum', 'Forceps']);
    });

    test('complications are frozen with codes and labels', () => {
        expect(Object.isFrozen(PREGNANCY_COMPLICATIONS)).toBe(true);
        expect(PREGNANCY_COMPLICATIONS.map(c => c.code)).toEqual([
            'preeklamsia', 'eklamsia', 'hipertensi_gestasional', 'dm_gestasional', 'hpp',
            'plasenta_previa', 'solusio_plasenta', 'kpd', 'preterm', 'iugr',
            'kelainan_letak', 'infeksi', 'lainnya'
        ]);
        expect(PREGNANCY_COMPLICATIONS.find(c => c.code === 'preeklamsia').label).toBe('Preeklamsia/PEB');
        expect(PREGNANCY_COMPLICATIONS.find(c => c.code === 'hpp').label).toBe('HPP (perdarahan postpartum)');
        expect(PREGNANCY_COMPLICATIONS.find(c => c.code === 'iugr').label).toBe('IUGR/PJT');
        for (const c of PREGNANCY_COMPLICATIONS) {
            expect(Object.isFrozen(c)).toBe(true);
            expect(typeof c.label).toBe('string');
        }
    });
});

describe('gaWeeksAt', () => {
    test('floors days / 7', () => {
        expect(rules.gaWeeksAt('2026-01-01', '2026-05-21')).toBe(20);
        expect(rules.gaWeeksAt('2026-01-01', '2026-05-20')).toBe(19);
        expect(rules.gaWeeksAt('2026-01-01', '2026-01-01')).toBe(0);
    });

    test('accepts Date objects using local components', () => {
        expect(rules.gaWeeksAt(new Date(2026, 0, 1), new Date(2026, 4, 21))).toBe(20);
    });

    test('null for invalid input or date before hpht', () => {
        expect(rules.gaWeeksAt(null, '2026-05-21')).toBeNull();
        expect(rules.gaWeeksAt('2026-01-01', '')).toBeNull();
        expect(rules.gaWeeksAt('bukan', '2026-05-21')).toBeNull();
        expect(rules.gaWeeksAt('2026-05-21', '2026-01-01')).toBeNull();
    });
});

describe('lossTypeForGa', () => {
    test('20-week rule', () => {
        expect(rules.lossTypeForGa(0)).toBe('abortus');
        expect(rules.lossTypeForGa(19)).toBe('abortus');
        expect(rules.lossTypeForGa(20)).toBe('lahir_mati');
        expect(rules.lossTypeForGa(41)).toBe('lahir_mati');
    });

    test('null when weeks unknown', () => {
        expect(rules.lossTypeForGa(null)).toBeNull();
        expect(rules.lossTypeForGa(undefined)).toBeNull();
    });
});

describe('decideEpisodeAction', () => {
    const open = { hpht: '2026-01-01', ended: false };

    test('none when new HPHT empty or invalid', () => {
        expect(rules.decideEpisodeAction({ ongoing: open, newHpht: '' })).toBe('none');
        expect(rules.decideEpisodeAction({ ongoing: open, newHpht: null })).toBe('none');
        expect(rules.decideEpisodeAction({ ongoing: null, newHpht: 'xx' })).toBe('none');
    });

    test('start when there is no ongoing pregnancy', () => {
        expect(rules.decideEpisodeAction({ ongoing: null, newHpht: '2026-01-01' })).toBe('start');
    });

    test('start when ongoing ended or has no HPHT', () => {
        expect(rules.decideEpisodeAction({ ongoing: { hpht: '2026-01-01', ended: true }, newHpht: '2026-01-02' })).toBe('start');
        expect(rules.decideEpisodeAction({ ongoing: { hpht: null, ended: false }, newHpht: '2026-01-02' })).toBe('start');
    });

    test('update within 14 days either direction, inclusive', () => {
        expect(rules.decideEpisodeAction({ ongoing: open, newHpht: '2026-01-01' })).toBe('update');
        expect(rules.decideEpisodeAction({ ongoing: open, newHpht: '2026-01-15' })).toBe('update');
        expect(rules.decideEpisodeAction({ ongoing: open, newHpht: '2025-12-18' })).toBe('update');
    });

    test('15 days later needs previous end', () => {
        expect(rules.decideEpisodeAction({ ongoing: open, newHpht: '2026-01-16' })).toBe('start_needs_previous_end');
        expect(rules.decideEpisodeAction({ ongoing: open, newHpht: '2026-12-01' })).toBe('start_needs_previous_end');
    });

    test('older HPHT beyond 14 days never starts a pregnancy', () => {
        expect(rules.decideEpisodeAction({ ongoing: open, newHpht: '2025-12-17' })).toBe('none');
        expect(rules.decideEpisodeAction({ ongoing: open, newHpht: '2025-01-01' })).toBe('none');
    });

    test('accepts Date objects', () => {
        expect(rules.decideEpisodeAction({ ongoing: { hpht: new Date(2026, 0, 1), ended: false }, newHpht: new Date(2026, 0, 16) }))
            .toBe('start_needs_previous_end');
    });
});

describe('isAfterFullTerm', () => {
    test('strictly more than 294 days', () => {
        expect(rules.isAfterFullTerm('2026-01-01', '2026-10-22')).toBe(false); // 294 days
        expect(rules.isAfterFullTerm('2026-01-01', '2026-10-23')).toBe(true);
        expect(rules.isAfterFullTerm(null, '2026-10-23')).toBe(false);
    });
});

describe('computeObstetricTotals', () => {
    const preg = [
        { status: 'ended', outcome: 'lahir_hidup', babies: [{ alive: true }, { alive: true }] },
        { status: 'ended', outcome: 'lahir_hidup', babies: [{ alive: true }, { alive: false }] },
        { status: 'ended', outcome: 'lahir_hidup', babies: [] },
        { status: 'ended', outcome: 'lahir_mati', babies: [{ alive: false }] },
        { status: 'ended', outcome: 'abortus' },
        { status: 'ended', outcome: 'ektopik' },
        { status: 'ongoing', outcome: null }
    ];

    test('ongoing counted only when includeOngoing', () => {
        expect(rules.computeObstetricTotals(preg, { includeOngoing: false })).toEqual({
            gravida: 6, para: 4, abortus: 2, anak_hidup: 4
        });
        expect(rules.computeObstetricTotals(preg, { includeOngoing: true })).toEqual({
            gravida: 7, para: 4, abortus: 2, anak_hidup: 4
        });
    });

    test('lahir_mati twins do not add living children', () => {
        const t = rules.computeObstetricTotals([{ status: 'ended', outcome: 'lahir_mati', babies: [{ alive: false }, { alive: false }] }], {});
        expect(t).toEqual({ gravida: 1, para: 1, abortus: 0, anak_hidup: 0 });
    });

    test('empty list', () => {
        expect(rules.computeObstetricTotals([], { includeOngoing: true })).toEqual({ gravida: 0, para: 0, abortus: 0, anak_hidup: 0 });
        expect(rules.computeObstetricTotals(null)).toEqual({ gravida: 0, para: 0, abortus: 0, anak_hidup: 0 });
    });
});

describe('toRiwayatPersalinanList', () => {
    const list = [
        { id: 3, status: 'ended', outcome: 'abortus', year: 2024, ended_on: '2024-06-10', kuretase: 'Ya', hpht: '2024-03-01' },
        { id: 1, status: 'ended', outcome: 'lahir_hidup', ended_on: '2019-09-15', term: 'aterm',
          delivery_method: 'SC (Caesar)', babies: [{ weight_g: 3200, sex: 'Laki-laki', alive: true }, { weight_g: 2900, sex: 'Perempuan', alive: true }] },
        { id: 2, status: 'ended', outcome: 'lahir_mati', ended_on: '2021-02-01', term: 'preterm', delivery_method: 'Spt B (Spontan)', babies: [] },
        { id: 4, status: 'ongoing', outcome: null, hpht: '2026-01-01' },
        { id: 5, status: 'ended', outcome: 'ektopik', year: 2022, ended_on: null }
    ];

    test('oldest first, ongoing skipped, shapes match the anamnesa entries', () => {
        expect(rules.toRiwayatPersalinanList(list)).toEqual([
            { type: 'DELIVERY', tahun: 2019, bulan: 9, persalinan: 'Aterm', metode_persalinan: 'SC (Caesar)',
              berat_lahir: 3200, jenis_kelamin: 'Laki-laki', kuretase: null },
            { type: 'DELIVERY', tahun: 2021, bulan: 2, persalinan: 'Preterm', metode_persalinan: 'Spt B (Spontan)',
              berat_lahir: null, jenis_kelamin: null, kuretase: null },
            { type: 'ABORTUS', tahun: 2022, bulan: null, persalinan: null, metode_persalinan: null,
              berat_lahir: null, jenis_kelamin: null, kuretase: 'Tidak' },
            { type: 'ABORTUS', tahun: 2024, bulan: null, persalinan: null, metode_persalinan: null,
              berat_lahir: null, jenis_kelamin: null, kuretase: 'Ya' }
        ]);
    });

    test('empty input', () => {
        expect(rules.toRiwayatPersalinanList(null)).toEqual([]);
    });
});
