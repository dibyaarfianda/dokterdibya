/**
 * Derived State Computation
 * EXACT copy from backup sunday-clinic.js lines 14-1249
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const RISK_FACTOR_LABELS = {
    age_extremes: 'Usia ibu di bawah 18 tahun atau di atas 35 tahun',
    previous_complication: 'Riwayat komplikasi kehamilan sebelumnya',
    multiple_pregnancy: 'Kemungkinan kehamilan kembar',
    medical_conditions: 'Memiliki penyakit medis yang berisiko',
    family_history: 'Riwayat keluarga dengan kelainan genetik',
    substance: 'Paparan rokok/alkohol/narkoba'
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function toDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
}

function calculateGestationalAge(lmpValue) {
    const lmpDate = toDate(lmpValue);
    if (!lmpDate) return null;
    const diffMs = Date.now() - lmpDate.getTime();
    if (diffMs < 0) return null;
    const totalDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;
    return { weeks, days, reference: lmpDate };
}

function uniqueArray(items) {
    return Array.from(new Set((items || []).map(item => (item === null || item === undefined ? '' : String(item).trim()))))
        .filter(item => item);
}

function mapRiskCodesToLabels(codes) {
    return uniqueArray(Array.isArray(codes)
        ? codes.map(code => RISK_FACTOR_LABELS[code] || code)
        : []);
}

function capitalizeFirstWord(str) {
    if (typeof str !== 'string') return str;
    const trimmed = str.trim();
    if (!trimmed) return str;
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return str.startsWith(trimmed) && str.endsWith(trimmed)
        ? capitalized
        : str.replace(trimmed, capitalized);
}

function titleCaseWords(str) {
    if (typeof str !== 'string') return str;
    const trimmed = str.trim();
    if (!trimmed) return str;
    const lower = trimmed.toLowerCase();
    const transformed = lower
        .split(/([\s'-]+)/)
        .map((segment) => {
            if (!segment || /[\s'-]+/.test(segment)) return segment;
            return segment.charAt(0).toUpperCase() + segment.slice(1);
        })
        .join('');
    return str.startsWith(trimmed) && str.endsWith(trimmed)
        ? transformed
        : str.replace(trimmed, transformed);
}

function isLikelyNameKey(key) {
    if (!key) return false;
    const normalized = String(key).toLowerCase();
    if (normalized.includes('name')) return true;
    if (normalized.endsWith('by')) return true;
    return false;
}

function formatValueForKey(value, key) {
    if (typeof value !== 'string') return value;
    const normalizedKey = typeof key === 'string' ? key.toLowerCase() : '';
    const trimmed = value.trim();

    if (!trimmed) return value;

    if (normalizedKey.includes('email') || normalizedKey.includes('url') || normalizedKey.includes('http')) {
        return value;
    }

    if (/^https?:\/\//i.test(trimmed) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return value;
    }

    if (isLikelyNameKey(key)) {
        return titleCaseWords(value);
    }
    return capitalizeFirstWord(value);
}

// ============================================================================
// COMPUTE DERIVED STATE
// ============================================================================

export function computeDerived(data, routeMrSlug = null) {
    const record = data.record || {};
    const patient = data.patient || {};
    const appointment = data.appointment || null;
    const intake = data.intake || {};
    const medicalRecords = data.medicalRecords || null;
    const payload = intake.payload && typeof intake.payload === 'object' ? intake.payload : {};
    const metadata = intake.metadata && typeof intake.metadata === 'object'
        ? intake.metadata
        : (payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {});
    const summary = intake.summary || {};

    const normalizeText = (value, key) => (typeof value === 'string' ? formatValueForKey(value, key) : value);
    const normalizeName = (value) => (typeof value === 'string' ? titleCaseWords(value) : value);

    const displayMrId = record.mrId || record.mr_id || routeMrSlug || null;
    const fullName = summary.fullName || payload.full_name || patient.fullName || appointment?.patientName || null;
    const dob = summary.dob || payload.dob || patient.birthDate || payload.patient_dob || null;
    const ageSource = summary.age ?? patient.age ?? (payload.patient_age ? Number(payload.patient_age) : null);
    const phone = payload.phone || patient.whatsapp || patient.phone || appointment?.patientPhone || null;
    const emergencyContact = payload.patient_emergency_contact || null;
    const address = payload.address || payload.patient_address || null;
    const maritalStatus = payload.marital_status || null;
    const lmp = summary.lmp || payload.lmp_date || payload.lmp || (metadata.edd && metadata.edd.lmpReference) || null;
    const edd = summary.edd || (metadata.edd && metadata.edd.value) || payload.edd || null;
    const gestationalAge = summary.gestationalAge || calculateGestationalAge(lmp);
    const obstetric = metadata.obstetricTotals && typeof metadata.obstetricTotals === 'object' ? metadata.obstetricTotals : {};
    const gravida = obstetric.gravida ?? payload.gravida_count ?? payload.gravida ?? null;
    const para = obstetric.para ?? payload.para_count ?? payload.para ?? null;
    const abortus = obstetric.abortus ?? payload.abortus_count ?? payload.abortus ?? null;
    const living = obstetric.living ?? payload.living_children_count ?? payload.living ?? null;
    const bmi = metadata.bmiValue || payload.bmi || null;
    const riskFlags = (summary.riskFlags && summary.riskFlags.length)
        ? summary.riskFlags
        : mapRiskCodesToLabels(summary.riskFactorCodes || payload.risk_factors);
    const highRisk = Boolean(summary.highRisk || metadata.highRisk || (payload.flags && payload.flags.highRisk));
    const reviewedBySource = intake.reviewedBy || (intake.review && (intake.review.verifiedBy || intake.review.reviewedBy)) || null;
    const reviewNotesSource = intake.reviewNotes || (intake.review && intake.review.notes) || null;
    const contraceptionPreviousSource = payload.previous_contraception || null;
    const contraceptionFailureTypeSource = payload.failed_contraception_type || payload.current_contraception || null;

    const normalizedPatientName = normalizeName(fullName);
    const normalizedAddress = normalizeText(address, 'address');
    const normalizedMaritalStatus = normalizeText(maritalStatus, 'marital_status');
    const normalizedHusbandName = normalizeName(payload.husband_name || null);
    const normalizedHusbandJob = normalizeText(payload.husband_job || null, 'husband_job');
    const normalizedOccupation = normalizeText(payload.occupation || null, 'occupation');
    const normalizedEducation = normalizeText(payload.education || null, 'education');
    const normalizedInsurance = normalizeText(payload.insurance || null, 'insurance');
    const normalizedContraceptionPrevious = normalizeText(contraceptionPreviousSource, 'previous_contraception');
    const normalizedContraceptionFailureType = normalizeText(contraceptionFailureTypeSource, 'failed_contraception_type');
    const normalizedReviewedBy = normalizeName(reviewedBySource);
    const normalizedReviewNotes = normalizeText(reviewNotesSource, 'review_notes');

    return {
        record,
        patient,
        appointment,
        intake,
        payload,
        metadata,
        summary,
        mrId: displayMrId,
        patientName: normalizedPatientName,
        quickId: intake.quickId || intake.quick_id || null,
        patientId: record.patientId || record.patient_id || null,
        age: Number.isFinite(ageSource) ? Math.round(ageSource) : null,
        dob,
        phone,
        emergencyContact,
        address: normalizedAddress,
        maritalStatus: normalizedMaritalStatus,
        husbandName: normalizedHusbandName,
        husbandAge: payload.husband_age || null,
        husbandJob: normalizedHusbandJob,
        occupation: normalizedOccupation,
        education: normalizedEducation,
        insurance: normalizedInsurance,
        edd,
        lmp,
        gestationalAge,
        gravida,
        para,
        abortus,
        living,
        bmi,
        riskFlags,
        riskFactorCodes: summary.riskFactorCodes || payload.risk_factors || [],
        highRisk,
        cycle: {
            menarcheAge: payload.menarche_age || null,
            cycleLength: payload.cycle_length || null,
            regular: payload.cycle_regular || null
        },
        contraception: {
            previous: normalizedContraceptionPrevious,
            failure: payload.contraception_failure || payload.kb_failure || null,
            failureType: normalizedContraceptionFailureType
        },
        intakeCreatedAt: intake.createdAt || intake.created_at || null,
        intakeReviewedAt: intake.reviewedAt || intake.reviewed_at || (intake.review && (intake.review.verifiedAt || intake.review.reviewedAt)) || null,
        intakeReviewedBy: normalizedReviewedBy,
        intakeStatus: intake.status || null,
        intakeReviewNotes: normalizedReviewNotes,
        medicalRecords
    };
}
