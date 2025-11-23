/**
 * Constants for Sunday Clinic Application
 */

// MR Category mappings (must match backend)
export const MR_CATEGORIES = {
    OBSTETRI: 'obstetri',
    GYN_REPRO: 'gyn_repro',
    GYN_SPECIAL: 'gyn_special'
};

export const MR_PREFIX = {
    [MR_CATEGORIES.OBSTETRI]: 'MROBS',
    [MR_CATEGORIES.GYN_REPRO]: 'MRGPR',
    [MR_CATEGORIES.GYN_SPECIAL]: 'MRGPS'
};

export const CATEGORY_LABELS = {
    [MR_CATEGORIES.OBSTETRI]: 'Obstetri',
    [MR_CATEGORIES.GYN_REPRO]: 'Ginekologi Reproduksi',
    [MR_CATEGORIES.GYN_SPECIAL]: 'Ginekologi Khusus'
};

// Section names
export const SECTIONS = {
    IDENTITY: 'identity',
    ANAMNESA: 'anamnesa',
    PHYSICAL_EXAM: 'physical-exam',
    PEMERIKSAAN_OBSTETRI: 'pemeriksaan-obstetri',
    USG: 'usg',
    PENUNJANG: 'penunjang',  // Renamed from laboratorium
    DIAGNOSIS: 'diagnosis',
    PLAN: 'plan',
    BILLING: 'billing'
};

export const SECTION_LABELS = {
    [SECTIONS.IDENTITY]: 'Identitas Pasien',
    [SECTIONS.ANAMNESA]: 'Anamnesa',
    [SECTIONS.PHYSICAL_EXAM]: 'Pemeriksaan Fisik',
    [SECTIONS.PEMERIKSAAN_OBSTETRI]: 'Pemeriksaan Obstetri',
    [SECTIONS.USG]: 'USG',
    [SECTIONS.PENUNJANG]: 'Penunjang',  // Changed from "Laboratorium"
    [SECTIONS.DIAGNOSIS]: 'Diagnosis',
    [SECTIONS.PLAN]: 'Plan',
    [SECTIONS.BILLING]: 'Tagihan'
};

// API endpoints
export const API_ENDPOINTS = {
    RECORDS: '/api/sunday-clinic/records',
    DIRECTORY: '/api/sunday-clinic/directory',
    BILLING: '/api/sunday-clinic/billing',
    STATISTICS: '/api/sunday-clinic/statistics/categories'
};

// Form field types
export const FIELD_TYPES = {
    TEXT: 'text',
    NUMBER: 'number',
    DATE: 'date',
    SELECT: 'select',
    CHECKBOX: 'checkbox',
    RADIO: 'radio',
    TEXTAREA: 'textarea'
};

// Validation rules
export const VALIDATION = {
    REQUIRED: 'required',
    EMAIL: 'email',
    PHONE: 'phone',
    NUMBER: 'number',
    DATE: 'date'
};

export default {
    MR_CATEGORIES,
    MR_PREFIX,
    CATEGORY_LABELS,
    SECTIONS,
    SECTION_LABELS,
    API_ENDPOINTS,
    FIELD_TYPES,
    VALIDATION
};
