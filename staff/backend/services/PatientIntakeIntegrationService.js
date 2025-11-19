'use strict';

const database = require('../utils/database');
const logger = require('../utils/logger');
const VALID_INTAKE_CATEGORIES = new Set(['obstetri', 'gyn_repro', 'gyn_special', 'admin_followup']);

const REPRO_GOAL_LABELS = {
    promil: 'Program hamil / promil',
    kb_setup: 'Pasang/lepas alat kontrasepsi',
    fertility_check: 'Pemeriksaan kesuburan',
    pre_marital: 'Konsultasi pra-nikah',
    cycle_planning: 'Mengatur siklus/menunda haid',
    other: 'Lainnya',
};

const PAST_CONDITION_LABELS = {
    hipertensi: 'Hipertensi',
    diabetes: 'Diabetes',
    heart: 'Penyakit jantung',
    kidney: 'Gangguan ginjal',
    thyroid: 'Gangguan tiroid',
    cyst_myoma: 'Kista/Myoma',
    asthma: 'Asma',
    autoimmune: 'Penyakit autoimun',
    mental: 'Kondisi kesehatan mental',
    surgery: 'Riwayat operasi',
    blood: 'Kelainan darah',
};

const FAMILY_HISTORY_LABELS = {
    hipertensi: 'Hipertensi',
    diabetes: 'Diabetes',
    heart: 'Penyakit jantung',
    stroke: 'Stroke',
    cancer: 'Kanker',
    kidney: 'Gangguan ginjal',
    thyroid: 'Gangguan tiroid',
    asthma: 'Asma',
    mental: 'Kondisi kesehatan mental',
    blood: 'Kelainan darah',
    genetic: 'Kelainan genetik',
};

function trimToNull(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
}

function normalizeChoice(value) {
    const trimmed = trimToNull(value);
    return trimmed ? trimmed.toLowerCase() : null;
}

function resolveIntakeCategory(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const direct = normalizeChoice(payload.intake_category || payload.metadata?.intakeCategory || null);
    if (direct && VALID_INTAKE_CATEGORIES.has(direct)) {
        return direct;
    }
    const pregnantStatus = normalizeChoice(payload.pregnant_status);
    if (pregnantStatus === 'yes') {
        return 'obstetri';
    }
    if (pregnantStatus === 'no') {
        const reproductive = normalizeChoice(payload.needs_reproductive);
        if (reproductive === 'yes') {
            return 'gyn_repro';
        }
        if (reproductive === 'no') {
            const gynIssue = normalizeChoice(payload.has_gyn_issue);
            if (gynIssue === 'yes') {
                return 'gyn_special';
            }
            if (gynIssue === 'no') {
                const adminNote = trimToNull(payload.admin_followup_note) || trimToNull(payload.admin_followup_note_secondary);
                return adminNote ? 'admin_followup' : null;
            }
        }
    }
    return null;
}

function determinePregnancyFlag(payload) {
    const pregnantStatus = normalizeChoice(payload?.pregnant_status);
    if (pregnantStatus === 'yes') {
        return true;
    }
    if (pregnantStatus === 'no') {
        return false;
    }
    const category = resolveIntakeCategory(payload);
    if (category === 'obstetri') {
        return true;
    }
    if (category && category !== 'obstetri') {
        return false;
    }
    return null;
}

function ensureArray(value) {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value
            .map((item) => trimToNull(item))
            .filter((item) => item !== null);
    }
    const single = trimToNull(value);
    return single ? [single] : [];
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function hasAnyValue(data) {
    if (!data || typeof data !== 'object') {
        return false;
    }
    return Object.values(data).some((value) => {
        if (Array.isArray(value)) {
            return value.length > 0;
        }
        if (value && typeof value === 'object') {
            return hasAnyValue(value);
        }
        return value !== null && value !== undefined && value !== '';
    });
}

function formatChoiceDisplay(value) {
    if (!value && value !== 0) {
        return null;
    }
    const normalized = typeof value === 'string' ? value.toLowerCase() : value;
    if (normalized === 'ya' || normalized === 'yes') {
        return 'Ya';
    }
    if (normalized === 'tidak' || normalized === 'no') {
        return 'Tidak';
    }
    if (typeof normalized === 'string') {
        return normalized
            .split('_')
            .filter((segment) => segment.length)
            .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(' ');
    }
    return normalized;
}

function formatMedicationRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const name = trimToNull(row.name);
    const dose = trimToNull(row.dose);
    const freq = trimToNull(row.freq);
    const parts = [name, dose, freq].filter(Boolean);
    return parts.length ? parts.join(' • ') : null;
}

function formatPregnancyRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const indexLabel = row.index ? `#${row.index}` : null;
    const year = trimToNull(row.year);
    const mode = trimToNull(row.mode);
    const complication = trimToNull(row.complication);
    const weight = toNumber(row.weight);
    const alive = formatChoiceDisplay(normalizeChoice(row.alive));
    const parts = [];
    if (year) {
        parts.push(year);
    }
    if (mode) {
        parts.push(mode);
    }
    if (weight) {
        parts.push(`${weight} gr`);
    }
    if (alive) {
        parts.push(`Anak hidup: ${alive}`);
    }
    if (complication) {
        parts.push(`Komplikasi: ${complication}`);
    }
    if (!parts.length) {
        return null;
    }
    return [indexLabel, parts.join(' • ')].filter(Boolean).join(' ');
}

function buildGeneralMedicalItems(payload) {
    const items = [];
    const bloodType = trimToNull(payload.blood_type);
    if (bloodType) {
        items.push({ label: 'Golongan darah', value: bloodType.toUpperCase() });
    }
    const rhesus = trimToNull(payload.rhesus);
    if (rhesus) {
        items.push({ label: 'Rhesus', value: rhesus.toUpperCase() });
    }
    const allergyNotes = [];
    const drugAllergy = trimToNull(payload.allergy_drugs);
    if (drugAllergy) {
        allergyNotes.push(`Obat: ${drugAllergy}`);
    }
    const foodAllergy = trimToNull(payload.allergy_food);
    if (foodAllergy) {
        allergyNotes.push(`Makanan: ${foodAllergy}`);
    }
    const envAllergy = trimToNull(payload.allergy_env);
    if (envAllergy) {
        allergyNotes.push(`Lingkungan: ${envAllergy}`);
    }
    if (allergyNotes.length) {
        items.push({ label: 'Alergi', value: allergyNotes });
    }

    const pastConditions = ensureArray(payload.past_conditions)
        .map((code) => PAST_CONDITION_LABELS[code] || code)
        .filter(Boolean);
    if (pastConditions.length) {
        items.push({ label: 'Riwayat penyakit', value: pastConditions });
    }
    const pastDetail = trimToNull(payload.past_conditions_detail);
    if (pastDetail) {
        items.push({ label: 'Detail penyakit', value: pastDetail });
    }

    const familyHistory = ensureArray(payload.family_history)
        .map((code) => FAMILY_HISTORY_LABELS[code] || code)
        .filter(Boolean);
    if (familyHistory.length) {
        items.push({ label: 'Riwayat keluarga', value: familyHistory });
    }
    const familyDetail = trimToNull(payload.family_history_detail);
    if (familyDetail) {
        items.push({ label: 'Detail keluarga', value: familyDetail });
    }

    const medications = Array.isArray(payload.medications)
        ? payload.medications.map(formatMedicationRow).filter(Boolean)
        : [];
    if (medications.length) {
        items.push({ label: 'Obat yang sedang dikonsumsi', value: medications });
    }

    return items;
}

function buildMenstrualDisplay(history) {
    if (!history) {
        return [];
    }
    const items = [];
    if (history.menarcheAge !== null && history.menarcheAge !== undefined) {
        items.push({ label: 'Pertama kali menstruasi', value: `${history.menarcheAge} tahun` });
    }
    if (history.cycleLength !== null && history.cycleLength !== undefined) {
        items.push({ label: 'Siklus menstruasi', value: `${history.cycleLength} hari` });
    }
    if (history.menstruationDuration !== null && history.menstruationDuration !== undefined) {
        items.push({ label: 'Lama menstruasi', value: `${history.menstruationDuration} hari` });
    }
    if (history.menstruationFlow) {
        items.push({ label: 'Jumlah perdarahan', value: formatChoiceDisplay(history.menstruationFlow) });
    }
    if (history.dysmenorrheaLevel) {
        items.push({ label: 'Nyeri menstruasi', value: formatChoiceDisplay(history.dysmenorrheaLevel) });
    }
    if (history.spottingOutsideCycle) {
        items.push({ label: 'Intermenstrual spotting', value: formatChoiceDisplay(history.spottingOutsideCycle) });
    }
    if (history.cycleRegular) {
        items.push({ label: 'Siklus menstruasi teratur', value: formatChoiceDisplay(history.cycleRegular) });
    }
    if (history.lmp) {
        items.push({ label: 'Hari pertama haid terakhir', value: history.lmp });
    }
    return items;
}

function buildPregnancyDisplay(payload) {
    const items = [];
    const totals = [
        ['Gravida', payload.gravida],
        ['Para', payload.para],
        ['Abortus', payload.abortus],
        ['Anak hidup', payload.living_children],
    ];
    totals.forEach(([label, value]) => {
        const numeric = toNumber(value);
        if (numeric !== null && numeric !== undefined) {
            items.push({ label, value: numeric });
        }
    });

    const pregnancySource = Array.isArray(payload.previousPregnancies)
        ? payload.previousPregnancies
        : Array.isArray(payload.previous_pregnancies)
        ? payload.previous_pregnancies
        : Array.isArray(payload.pregnancy_history)
        ? payload.pregnancy_history
        : [];
    const pregnancies = pregnancySource.map(formatPregnancyRow).filter(Boolean);
    if (pregnancies.length) {
        items.push({ label: 'Riwayat persalinan', value: pregnancies });
    }

    return items;
}

function buildGynReproDisplay(payload, reproductiveDetail, menstrualHistory) {
    const sections = [];

    const complaintItems = [];
    const goalLabels = Array.isArray(reproductiveDetail?.goals)
        ? reproductiveDetail.goals.map((goal) => REPRO_GOAL_LABELS[goal] || goal).filter(Boolean)
        : [];
    if (goalLabels.length) {
        complaintItems.push({ label: 'Tujuan konsultasi', value: goalLabels });
    }
    if (reproductiveDetail?.goalDetail) {
        complaintItems.push({ label: 'Detail kebutuhan', value: reproductiveDetail.goalDetail });
    }
    if (reproductiveDetail?.tryingDuration) {
        complaintItems.push({ label: 'Durasi mencoba hamil', value: reproductiveDetail.tryingDuration });
    }
    if (reproductiveDetail?.previousEvaluations) {
        complaintItems.push({ label: 'Pemeriksaan sebelumnya', value: reproductiveDetail.previousEvaluations });
    }
    if (reproductiveDetail?.expectation) {
        complaintItems.push({ label: 'Harapan konsultasi', value: reproductiveDetail.expectation });
    }
    if (reproductiveDetail?.lastContraception) {
        complaintItems.push({ label: 'Metode kontrasepsi terakhir', value: reproductiveDetail.lastContraception });
    }
    if (reproductiveDetail?.programInterest) {
        complaintItems.push({ label: 'Sedang mengikuti program hamil', value: formatChoiceDisplay(reproductiveDetail.programInterest) });
    }

    if (reproductiveDetail?.fertilityAssessment && typeof reproductiveDetail.fertilityAssessment === 'object') {
        const assessmentLabels = {
            diagnosedPcos: 'Diagnosis PCOS',
            diagnosedGyneConditions: 'Riwayat miom/kista/endometriosis',
            transvaginalUsg: 'USG transvaginal kesuburan',
            hsgHistory: 'Pemeriksaan HSG',
            previousPrograms: 'Program hamil sebelumnya',
            partnerSmoking: 'Pasangan merokok',
            partnerAlcohol: 'Pasangan mengonsumsi alkohol',
            spermAnalysis: 'Analisa sperma',
            preferNaturalProgram: 'Prefer promil alami',
            willingHormonalTherapy: 'Bersedia terapi hormonal',
        };
        const assessmentItems = Object.entries(assessmentLabels)
            .map(([key, label]) => {
                const rawValue = reproductiveDetail.fertilityAssessment[key];
                const formatted = formatChoiceDisplay(rawValue);
                return formatted ? { label, value: formatted } : null;
            })
            .filter(Boolean);
        if (assessmentItems.length) {
            complaintItems.push({ label: 'Riwayat reproduksi & gaya hidup', value: assessmentItems });
        }
    }

    sections.push({ title: 'Keluhan Utama', items: complaintItems });
    sections.push({ title: 'Riwayat Medis Umum', items: buildGeneralMedicalItems(payload) });
    sections.push({ title: 'Riwayat Menstruasi', items: buildMenstrualDisplay(menstrualHistory) });
    sections.push({ title: 'Riwayat Kehamilan Sebelumnya', items: buildPregnancyDisplay(payload) });

    return sections;
}

function collectStructuredSections(payload = {}) {
    const reproductiveGoals = ensureArray(payload.repro_goals);
    const goalDetail = trimToNull(payload.repro_goal_detail);
    const tryingDuration = trimToNull(payload.repro_trying_duration);
    const previousEvaluations = trimToNull(payload.repro_previous_evaluations);
    const expectation = trimToNull(payload.repro_expectation);
    const lastContraception = trimToNull(payload.repro_last_contraception);
    const fertilityProgramInterest = normalizeChoice(payload.fertility_program_interest);

    const fertilityAssessment = {
        diagnosedPcos: normalizeChoice(payload.diagnosed_pcos),
        diagnosedGyneConditions: normalizeChoice(payload.diagnosed_gyne_conditions),
        transvaginalUsg: normalizeChoice(payload.transvaginal_usg),
        hsgHistory: normalizeChoice(payload.hsg_history),
        previousPrograms: normalizeChoice(payload.previous_programs),
        partnerSmoking: normalizeChoice(payload.partner_smoking),
        partnerAlcohol: normalizeChoice(payload.partner_alcohol),
        spermAnalysis: normalizeChoice(payload.sperm_analysis),
        preferNaturalProgram: normalizeChoice(payload.prefer_natural_program),
        willingHormonalTherapy: normalizeChoice(payload.willing_hormonal_therapy),
    };

    const reproductiveDetail = {
        goals: reproductiveGoals,
        goalDetail,
        tryingDuration,
        previousEvaluations,
        expectation,
        lastContraception,
    };

    if (fertilityProgramInterest) {
        reproductiveDetail.programInterest = fertilityProgramInterest;
    }

    if (hasAnyValue(fertilityAssessment)) {
        reproductiveDetail.fertilityAssessment = fertilityAssessment;
    }

    const includeReproductive =
        reproductiveGoals.length > 0 ||
        goalDetail !== null ||
        tryingDuration !== null ||
        previousEvaluations !== null ||
        expectation !== null ||
        lastContraception !== null ||
        fertilityProgramInterest !== null ||
        hasAnyValue(fertilityAssessment);

    const menstrualHistory = {
        menarcheAge: toNumber(payload.menarche_age),
        cycleLength: toNumber(payload.cycle_length),
        menstruationDuration: toNumber(payload.menstruation_duration),
        menstruationFlow: normalizeChoice(payload.menstruation_flow),
        dysmenorrheaLevel: normalizeChoice(payload.dysmenorrhea_level),
        spottingOutsideCycle: normalizeChoice(payload.spotting_outside_cycle),
        cycleRegular: normalizeChoice(payload.cycle_regular),
        lmp: trimToNull(payload.lmp),
    };
    const includeMenstrual = hasAnyValue(menstrualHistory);

    const gynecologyHistory = {
        frequentDischarge: normalizeChoice(payload.frequent_discharge),
        dischargeColor: trimToNull(payload.discharge_color),
        dischargeOdor: trimToNull(payload.discharge_odor),
        lowerAbdomenEnlarged: normalizeChoice(payload.lower_abdomen_enlarged),
        reproductiveSurgery: normalizeChoice(payload.reproductive_surgery),
        reproductiveSurgeryDetail: trimToNull(payload.reproductive_surgery_detail),
        papSmearHistory: normalizeChoice(payload.pap_smear_history),
        papSmearResult: trimToNull(payload.pap_smear_result),
        dyspareunia: normalizeChoice(payload.dyspareunia),
        postcoitalBleeding: normalizeChoice(payload.postcoital_bleeding),
    };
    const includeGynecology = hasAnyValue(gynecologyHistory);

    const intakeCategory = resolveIntakeCategory(payload);
    let displaySections = null;
    if (intakeCategory === 'gyn_repro') {
        displaySections = {
            anamnesa: buildGynReproDisplay(payload, includeReproductive ? reproductiveDetail : null, includeMenstrual ? menstrualHistory : null),
        };
    }

    return {
        reproductive: includeReproductive ? reproductiveDetail : null,
        menstrual: includeMenstrual ? menstrualHistory : null,
        gynecology: includeGynecology ? gynecologyHistory : null,
        display: displaySections,
    };
}

function buildRoutingSnapshot(payload) {
    return {
        pregnantStatus: normalizeChoice(payload?.pregnant_status) || null,
        needsReproductive: normalizeChoice(payload?.needs_reproductive) || null,
        hasGynIssue: normalizeChoice(payload?.has_gyn_issue) || null,
    };
}

function resolveAdminFollowupNotes(payload) {
    const primary = trimToNull(payload?.admin_followup_note);
    const secondary = trimToNull(payload?.admin_followup_note_secondary);
    if (!primary && !secondary) {
        return null;
    }
    return {
        primaryNote: primary,
        secondaryNote: secondary,
    };
}

function sanitizePhone(raw) {
    if (!raw) {
        return null;
    }
    const digits = String(raw).replace(/[^0-9]/g, '');
    if (!digits) {
        return null;
    }
    if (digits.startsWith('62')) {
        return digits;
    }
    if (digits.startsWith('0')) {
        return `62${digits.slice(1)}`;
    }
    return digits.length >= 9 ? `62${digits}` : digits;
}

function calculateAge(dob) {
    if (!dob) {
        return null;
    }
    const birth = new Date(dob);
    if (Number.isNaN(birth.valueOf())) {
        return null;
    }
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age -= 1;
    }
    return age;
}

function buildAllergyString(payload) {
    if (!payload) {
        return null;
    }
    const notes = [];
    if (payload.allergy_drugs) {
        notes.push(`Obat: ${payload.allergy_drugs}`.trim());
    }
    if (payload.allergy_food) {
        notes.push(`Makanan: ${payload.allergy_food}`.trim());
    }
    if (payload.allergy_env) {
        notes.push(`Lingkungan: ${payload.allergy_env}`.trim());
    }
    return notes.length ? notes.join('\n') : null;
}

function buildMedicalHistory(existingHistory, record) {
    const payload = record.payload || {};
    const metadata = payload.metadata || {};
    const intakeCategory = resolveIntakeCategory(payload);
    const routing = buildRoutingSnapshot(payload);
    const adminFollowup = resolveAdminFollowupNotes(payload);
    const sections = collectStructuredSections(payload);
    const historyEntry = {
        submissionId: record.submissionId,
        collectedAt: record.receivedAt || null,
        reviewStatus: record.status || null,
        verifiedAt: record.review?.verifiedAt || null,
        reviewer: record.review?.verifiedBy || null,
        notes: record.review?.notes || null,
        highRisk: Boolean(metadata.highRisk),
        riskFlags: metadata.riskFlags || [],
        obstetricTotals: metadata.obstetricTotals || {},
        edd: metadata.edd || null,
        lmp: payload.lmp || null,
        gravida: metadata.obstetricTotals?.gravida ?? payload.gravida ?? null,
        para: metadata.obstetricTotals?.para ?? null,
        abortus: metadata.obstetricTotals?.abortus ?? null,
        living: metadata.obstetricTotals?.living ?? null,
        medications: payload.medications || [],
        pastConditions: payload.past_conditions || [],
        allergies: {
            drugs: payload.allergy_drugs || null,
            food: payload.allergy_food || null,
            environment: payload.allergy_env || null,
        },
        intakeCategory,
        routing,
        reproductive: sections.reproductive,
        menstrual: sections.menstrual,
        gynecology: sections.gynecology,
        structuredSections: sections.display || null,
        adminFollowup,
    };

    const history = [];
    if (existingHistory) {
        try {
            const parsed = JSON.parse(existingHistory);
            if (Array.isArray(parsed.records)) {
                history.push(...parsed.records);
            }
        } catch (error) {
            // Ignore parse errors and start a clean history chain
        }
    }
    history.push(historyEntry);
    return JSON.stringify({ source: 'patient-intake', records: history });
}

async function findExistingPatient(connection, payload, sanitizedPhone) {
    if (sanitizedPhone) {
        const [byPhone] = await connection.query(
            'SELECT id, medical_history FROM patients WHERE whatsapp = ? LIMIT 1',
            [sanitizedPhone]
        );
        if (byPhone.length) {
            return byPhone[0];
        }
    }
    if (payload.full_name && payload.dob) {
        const [byIdentity] = await connection.query(
            'SELECT id, medical_history FROM patients WHERE full_name = ? AND birth_date = ? LIMIT 1',
            [payload.full_name, payload.dob]
        );
        if (byIdentity.length) {
            return byIdentity[0];
        }
    }
    if (payload.full_name) {
        const [byName] = await connection.query(
            'SELECT id, medical_history FROM patients WHERE full_name = ? ORDER BY created_at DESC LIMIT 1',
            [payload.full_name]
        );
        if (byName.length) {
            return byName[0];
        }
    }
    return null;
}

async function ensurePatient(connection, record, sanitizedPhone) {
    const payload = record.payload || {};
    const existing = await findExistingPatient(connection, payload, sanitizedPhone);
    const age = calculateAge(payload.dob);
    const allergy = buildAllergyString(payload);
    const medicalHistory = buildMedicalHistory(existing?.medical_history, record);
    const pregnancyFlag = determinePregnancyFlag(payload);

    if (existing) {
        const updateSegments = [];
        const params = [];

        if (payload.full_name) {
            updateSegments.push('full_name = ?');
            params.push(payload.full_name);
        }
        if (sanitizedPhone) {
            updateSegments.push('whatsapp = ?');
            params.push(sanitizedPhone);
        }
        if (payload.dob) {
            updateSegments.push('birth_date = ?');
            params.push(payload.dob);
        }
        if (age !== null) {
            updateSegments.push('age = ?');
            params.push(age);
        }
        if (pregnancyFlag !== null) {
            updateSegments.push('is_pregnant = ?');
            params.push(pregnancyFlag ? 1 : 0);
        }
        if (allergy) {
            updateSegments.push('allergy = ?');
            params.push(allergy);
        }
        updateSegments.push('medical_history = ?');
        params.push(medicalHistory);
        updateSegments.push('updated_at = NOW()');
        params.push(existing.id);

        await connection.query(`UPDATE patients SET ${updateSegments.join(', ')} WHERE id = ?`, params);
        return { patientId: existing.id, created: false, updated: true };
    }

    const [rows] = await connection.query(
        'SELECT LPAD(COALESCE(MAX(CAST(id AS UNSIGNED)), 0) + 1, 5, "0") AS nextId FROM patients'
    );
    const nextId = rows[0]?.nextId || '00001';
    const isPregnantValue = pregnancyFlag === null ? 1 : (pregnancyFlag ? 1 : 0);

    await connection.query(
        'INSERT INTO patients (id, full_name, whatsapp, birth_date, age, is_pregnant, allergy, medical_history, patient_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [
            nextId,
            payload.full_name || 'Pasien Intake',
            sanitizedPhone,
            payload.dob || null,
            age,
            isPregnantValue,
            allergy,
            medicalHistory,
            'web',
        ]
    );

    return { patientId: nextId, created: true, updated: false };
}

function buildVisitSummary(record, context) {
    const payload = record.payload || {};
    const metadata = payload.metadata || {};
    const intakeCategory = resolveIntakeCategory(payload);
    const routing = buildRoutingSnapshot(payload);
    const adminFollowup = resolveAdminFollowupNotes(payload);
    const sections = collectStructuredSections(payload);
    return {
        intakeSubmissionId: record.submissionId,
        source: 'patient-intake',
        status: record.status || null,
        reviewer: context.reviewer || record.review?.verifiedBy || null,
        reviewedAt: context.reviewedAt || record.review?.verifiedAt || null,
        notes: context.notes || record.review?.notes || null,
        highRisk: Boolean(metadata.highRisk),
        riskFlags: metadata.riskFlags || [],
        obstetricTotals: metadata.obstetricTotals || {},
        edd: metadata.edd || null,
        lmp: payload.lmp || null,
        gravida: metadata.obstetricTotals?.gravida ?? payload.gravida ?? null,
        para: metadata.obstetricTotals?.para ?? null,
        abortus: metadata.obstetricTotals?.abortus ?? null,
        living: metadata.obstetricTotals?.living ?? null,
        intakeCategory,
        routing,
        adminFollowup,
        reproductive: sections.reproductive,
        menstrual: sections.menstrual,
        gynecology: sections.gynecology,
    };
}

async function upsertVisit(connection, patientId, record, context) {
    const payload = record.payload || {};
    const visitSummary = buildVisitSummary(record, context);
    const servicesJson = JSON.stringify(visitSummary);
    const medicationsJson = JSON.stringify(payload.medications || []);
    const reviewer = context.reviewer || record.review?.verifiedBy || null;
    const reviewedAt = context.reviewedAt ? new Date(context.reviewedAt) : null;
    const visitDate = reviewedAt && !Number.isNaN(reviewedAt.valueOf()) ? reviewedAt : new Date();

    const [existing] = await connection.query(
        `SELECT id FROM visits
         WHERE is_dummy = 1
           AND services IS NOT NULL
           AND JSON_UNQUOTE(JSON_EXTRACT(services, '$.intakeSubmissionId')) = ?
         LIMIT 1`,
        [record.submissionId]
    );

    if (existing.length) {
        const visitId = existing[0].id;
        await connection.query(
            `UPDATE visits
             SET patient_id = ?,
                 patient_name = ?,
                 visit_date = ?,
                 examiner = ?,
                 services = ?,
                 medications = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [patientId, payload.full_name || 'Pasien Intake', visitDate, reviewer, servicesJson, medicationsJson, visitId]
        );
        return { visitId, created: false };
    }

    const [result] = await connection.query(
        `INSERT INTO visits
            (patient_id, patient_name, visit_date, examiner, services, medications, grand_total, is_dummy, created_at, updated_at)
         VALUES
            (?, ?, ?, ?, ?, ?, 0.00, 1, NOW(), NOW())`,
        [patientId, payload.full_name || 'Pasien Intake', visitDate, reviewer, servicesJson, medicationsJson]
    );

    return { visitId: result.insertId, created: true };
}

function buildExamData(record) {
    const payload = record.payload || {};
    const sections = collectStructuredSections(payload);
    return {
        intakeSubmissionId: record.submissionId,
        source: 'patient-intake',
        collectedAt: record.receivedAt || null,
        status: record.status || null,
        payload,
        review: record.review || {},
        summary: record.summary || null,
        intakeCategory: resolveIntakeCategory(payload),
        routing: buildRoutingSnapshot(payload),
        adminFollowup: resolveAdminFollowupNotes(payload),
        reproductive: sections.reproductive,
        menstrual: sections.menstrual,
        gynecology: sections.gynecology,
    };
}

async function upsertMedicalExam(connection, patientId, visitId, record, context) {
    const examPayload = buildExamData(record);
    const examiner = context.reviewer || record.review?.verifiedBy || null;
    const reviewedAt = context.reviewedAt ? new Date(context.reviewedAt) : null;
    const examDate = reviewedAt && !Number.isNaN(reviewedAt.valueOf()) ? reviewedAt : new Date();
    const examDataJson = JSON.stringify(examPayload);

    const [existing] = await connection.query(
        `SELECT id FROM medical_exams
         WHERE exam_type = 'anamnesa'
           AND exam_data IS NOT NULL
           AND JSON_UNQUOTE(JSON_EXTRACT(exam_data, '$.intakeSubmissionId')) = ?
         LIMIT 1`,
        [record.submissionId]
    );

    if (existing.length) {
        const examId = existing[0].id;
        await connection.query(
            `UPDATE medical_exams
             SET patient_id = ?,
                 visit_id = ?,
                 exam_data = ?,
                 examiner = ?,
                 exam_date = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [patientId, visitId || null, examDataJson, examiner, examDate, examId]
        );
        return { examId, created: false };
    }

    const [result] = await connection.query(
        `INSERT INTO medical_exams
            (patient_id, visit_id, exam_type, exam_data, examiner, exam_date, created_at, updated_at)
         VALUES
            (?, ?, 'anamnesa', ?, ?, ?, NOW(), NOW())`,
        [patientId, visitId || null, examDataJson, examiner, examDate]
    );

    return { examId: result.insertId, created: true };
}

async function process(record, context = {}) {
    if (!record || !record.submissionId) {
        throw new Error('Data intake tidak valid untuk integrasi.');
    }
    if (record.integration?.status === 'completed') {
        return record.integration;
    }

    const payload = record.payload || {};
    const intakeCategory = resolveIntakeCategory(payload);
    const routingSnapshot = buildRoutingSnapshot(payload);
    const adminFollowup = resolveAdminFollowupNotes(payload);

    const integrationResult = await database.transaction(async (connection) => {
        const sanitizedPhone = sanitizePhone(payload?.phone);
        const patientInfo = await ensurePatient(connection, record, sanitizedPhone);
        const visitInfo = await upsertVisit(connection, patientInfo.patientId, record, context);
        const examInfo = await upsertMedicalExam(connection, patientInfo.patientId, visitInfo.visitId, record, context);

        // Mark intake as completed for this patient
        await connection.query(
            'UPDATE patients SET intake_completed = 1 WHERE id = ?',
            [patientInfo.patientId]
        );

        return {
            status: 'completed',
            integratedAt: new Date().toISOString(),
            patientId: patientInfo.patientId,
            visitId: visitInfo.visitId,
            medicalExamId: examInfo.examId,
            createdNewPatient: patientInfo.created,
            updatedExistingPatient: patientInfo.updated,
            visitCreated: visitInfo.created,
            examCreated: examInfo.created,
            reviewer: context.reviewer || record.review?.verifiedBy || null,
            notes: context.notes || record.review?.notes || null,
            risk: {
                highRisk: Boolean(record.summary?.highRisk || record.payload?.metadata?.highRisk),
                flags: record.summary?.riskFlags || record.payload?.metadata?.riskFlags || [],
            },
            intakeCategory,
            routing: routingSnapshot,
            adminFollowup,
        };
    });

    logger.info('Patient intake integrated into EMR', {
        submissionId: record.submissionId,
        patientId: integrationResult.patientId,
        visitId: integrationResult.visitId,
        medicalExamId: integrationResult.medicalExamId,
    });

    return integrationResult;
}

module.exports = {
    process,
    _helpers: {
        buildMedicalHistory,
        collectStructuredSections,
    },
};
