'use strict';

const PatientIntakeIntegrationService = require('../../services/PatientIntakeIntegrationService');

const { buildMedicalHistory, collectStructuredSections } = PatientIntakeIntegrationService._helpers;

describe('PatientIntakeIntegrationService structured sections', () => {
    test('collectStructuredSections captures menstrual, reproductive, and gynecology details', () => {
        const payload = {
            intake_category: 'gyn_repro',
            menarche_age: '12',
            cycle_length: '28',
            menstruation_duration: '5',
            menstruation_flow: 'sedang',
            dysmenorrhea_level: 'sangat_nyeri',
            spotting_outside_cycle: 'kadang',
            cycle_regular: 'tidak',
            lmp: '2025-10-01',
            fertility_program_interest: 'ya',
            diagnosed_pcos: 'ya',
            diagnosed_gyne_conditions: 'tidak',
            transvaginal_usg: 'ya',
            hsg_history: 'tidak',
            previous_programs: 'ya',
            partner_smoking: 'tidak',
            partner_alcohol: 'tidak',
            sperm_analysis: 'ya',
            prefer_natural_program: 'ya',
            willing_hormonal_therapy: 'tidak',
            frequent_discharge: 'ada',
            discharge_color: 'kekuningan',
            discharge_odor: 'asam',
            lower_abdomen_enlarged: 'ya',
            reproductive_surgery: 'ya',
            reproductive_surgery_detail: 'miomektomi 2023',
            pap_smear_history: 'ya',
            pap_smear_result: 'LSIL, 2024',
            dyspareunia: 'ya',
            postcoital_bleeding: 'tidak',
            repro_goals: ['promil'],
            blood_type: 'b',
            rhesus: 'positive',
            allergy_drugs: 'penisilin',
            past_conditions: ['hipertensi'],
            family_history: ['diabetes'],
            medications: [
                { name: 'Asam folat', dose: '400mcg', freq: '1x1' },
                { name: 'Vitamin D', dose: '1000IU', freq: '1x1' },
            ],
            gravida: 1,
            previousPregnancies: [
                { index: 1, year: '2022', mode: 'SC', weight: '3200', alive: 'ya' },
            ],
        };

        const sections = collectStructuredSections(payload);

        expect(sections.menstrual).toMatchObject({
            menarcheAge: 12,
            cycleLength: 28,
            menstruationDuration: 5,
            menstruationFlow: 'sedang',
            dysmenorrheaLevel: 'sangat_nyeri',
            spottingOutsideCycle: 'kadang',
            cycleRegular: 'tidak',
            lmp: '2025-10-01',
        });

        expect(sections.reproductive).toMatchObject({
            goals: ['promil'],
            programInterest: 'ya',
            fertilityAssessment: expect.objectContaining({
                diagnosedPcos: 'ya',
                transvaginalUsg: 'ya',
                previousPrograms: 'ya',
                partnerSmoking: 'tidak',
                preferNaturalProgram: 'ya',
                willingHormonalTherapy: 'tidak',
            }),
        });

        expect(sections.gynecology).toMatchObject({
            frequentDischarge: 'ada',
            dischargeColor: 'kekuningan',
            reproductiveSurgery: 'ya',
            reproductiveSurgeryDetail: 'miomektomi 2023',
            papSmearHistory: 'ya',
            dyspareunia: 'ya',
        });

        expect(sections.display).toBeTruthy();
        expect(sections.display.anamnesa).toBeInstanceOf(Array);
        const displayTitles = sections.display.anamnesa.map((section) => section.title);
        expect(displayTitles).toEqual([
            'Keluhan Utama',
            'Riwayat Medis Umum',
            'Riwayat Menstruasi',
            'Riwayat Kehamilan Sebelumnya',
        ]);
        const menstrualSection = sections.display.anamnesa.find((section) => section.title === 'Riwayat Menstruasi');
        expect(menstrualSection.items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ label: 'Siklus menstruasi', value: '28 hari' }),
                expect.objectContaining({ label: 'Hari pertama haid terakhir', value: '2025-10-01' }),
            ])
        );
    });

    test('buildMedicalHistory persists structured sections for review chain', () => {
        const record = {
            submissionId: 'test-sub-001',
            receivedAt: '2025-11-01T00:00:00Z',
            status: 'verified',
            review: {
                verifiedAt: '2025-11-01T00:10:00Z',
                verifiedBy: 'auto_system',
            },
            payload: {
                full_name: 'Test Pasien',
                metadata: {
                    obstetricTotals: {},
                },
                menarche_age: '11',
                cycle_length: '27',
                menstruation_duration: '4',
                menstruation_flow: 'sedikit',
                cycle_regular: 'ya',
                fertility_program_interest: 'tidak',
                diagnosed_pcos: 'tidak',
                partner_smoking: 'tidak',
                prefer_natural_program: 'tidak',
                willing_hormonal_therapy: 'ya',
                repro_goals: [],
                medications: [],
                past_conditions: [],
            },
        };

        const historyJson = buildMedicalHistory(null, record);
        const parsed = JSON.parse(historyJson);
        expect(parsed).toHaveProperty('records');
        expect(parsed.records).toHaveLength(1);
        const entry = parsed.records[0];

        expect(entry.reproductive).toMatchObject({
            programInterest: 'tidak',
            fertilityAssessment: expect.objectContaining({
                partnerSmoking: 'tidak',
                willingHormonalTherapy: 'ya',
            }),
        });
        expect(entry.menstrual).toMatchObject({
            menarcheAge: 11,
            cycleLength: 27,
            menstruationDuration: 4,
            cycleRegular: 'ya',
        });
        expect(entry.gynecology).toBeNull();
        expect(entry).toHaveProperty('structuredSections');
        expect(entry.structuredSections).toBeNull();
    });
});
