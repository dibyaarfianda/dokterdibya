/**
 * Helper Functions for Sunday Clinic
 * Ported from old implementation
 */

// ============================================================================
// TIMESTAMP
// ============================================================================

export function getGMT7Timestamp() {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const gmt7Time = new Date(utcTime + (7 * 60 * 60 * 1000));

    const year = gmt7Time.getFullYear();
    const month = String(gmt7Time.getMonth() + 1).padStart(2, '0');
    const day = String(gmt7Time.getDate()).padStart(2, '0');
    const hours = String(gmt7Time.getHours()).padStart(2, '0');
    const minutes = String(gmt7Time.getMinutes()).padStart(2, '0');
    const seconds = String(gmt7Time.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
}

// ============================================================================
// MEDICAL RECORD CONTEXT
// ============================================================================

export function getMedicalRecordContext(state, primaryType, fallbackTypes = []) {
    console.log('[getMedicalRecordContext] Called with primaryType:', primaryType);
    console.log('[getMedicalRecordContext] state.recordData?.medicalRecords:', state.recordData?.medicalRecords);
    console.log('[getMedicalRecordContext] state.medicalRecords:', state.medicalRecords);

    const bundle = state.recordData?.medicalRecords || state.medicalRecords;
    console.log('[getMedicalRecordContext] bundle:', bundle);

    if (!bundle) {
        console.log('[getMedicalRecordContext] No bundle found, returning null');
        return null;
    }

    const byType = bundle.byType || {};
    console.log('[getMedicalRecordContext] byType keys:', Object.keys(byType));

    const candidates = [primaryType, ...fallbackTypes];

    for (const type of candidates) {
        const direct = byType[type];
        console.log(`[getMedicalRecordContext] Checking type: ${type}, found:`, !!direct);
        if (direct && hasMeaningfulContent(direct.data)) {
            console.log(`[getMedicalRecordContext] Returning direct record for type: ${type}, data:`, direct.data);
            return {
                record: direct,
                data: direct.data || {},
                source: 'record',
                recordType: type
            };
        }

        const completeData = bundle.latestComplete?.data?.[type];
        if (completeData && hasMeaningfulContent(completeData)) {
            return {
                record: bundle.latestComplete,
                data: completeData,
                source: 'complete',
                recordType: type
            };
        }
    }

    console.log('[getMedicalRecordContext] No matching record found, returning null');
    return null;
}

function hasMeaningfulContent(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return Object.values(obj).some(val =>
        val !== null && val !== undefined && val !== ''
    );
}

// ============================================================================
// CAPITALIZATION
// ============================================================================

const RECORD_CAPITALIZATION_SKIP_KEYS = new Set([
    'timestamp', 'createdAt', 'updatedAt', 'doctorName', 'doctorId',
    'status', 'type', 'id', 'patientId', 'mrId'
]);

export function capitalizePatientData(data, skipKeys = RECORD_CAPITALIZATION_SKIP_KEYS, parentKey = '') {
    if (!data || typeof data !== 'object') {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(item => capitalizePatientData(item, skipKeys, parentKey));
    }

    const result = {};
    for (const [key, value] of Object.entries(data)) {
        const fullKey = parentKey ? `${parentKey}.${key}` : key;

        if (skipKeys.has(key) || skipKeys.has(fullKey)) {
            result[key] = value;
            continue;
        }

        if (typeof value === 'string' && value.trim()) {
            result[key] = titleCaseWords(value);
        } else if (typeof value === 'object' && value !== null) {
            result[key] = capitalizePatientData(value, skipKeys, fullKey);
        } else {
            result[key] = value;
        }
    }

    return result;
}

function titleCaseWords(str) {
    return str.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

export function formatDateDMY(value) {
    if (!value) {
        return value;
    }
    // Handle YYYY-MM-DD format - convert to European DD/MM/YYYY
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const [, year, month, day] = match;
        return `${day}/${month}/${year}`;
    }
    // Handle ISO timestamp format
    if (value.includes('T')) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    }
    return value;
}

// ============================================================================
// METADATA RENDERING
// ============================================================================

export function renderRecordMeta(context, primaryType) {
    if (!context || !context.record) {
        return '';
    }

    const meta = [];
    if (context.record.doctorName) {
        meta.push(`Dicatat oleh ${escapeHtml(context.record.doctorName)}`);
    }

    // Use record_datetime from user input first, fallback to database timestamp
    const recordDatetime = context.data?.record_datetime;
    const timestamp = recordDatetime || context.record.updatedAt || context.record.createdAt;
    const timestampText = formatDateTime(timestamp);
    if (timestampText) {
        meta.push(`Waktu pemeriksaan ${escapeHtml(timestampText)}`);
    }

    if (context.source === 'complete') {
        meta.push('Sumber: Rekam medis lengkap');
    }

    if (context.recordType && primaryType && context.recordType !== primaryType) {
        meta.push(`Menggunakan data ${escapeHtml(formatRecordTypeLabel(context.recordType))}`);
    }

    if (!meta.length) {
        return '';
    }

    return `<div class="sc-note">${meta.join(' • ')}</div>`;
}

function formatDateTime(timestamp) {
    if (!timestamp) return '';
    try {
        const date = new Date(timestamp);
        // European format: DD/MM/YYYY HH:mm
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch {
        return '';
    }
}

function formatRecordTypeLabel(type) {
    const labels = {
        'identitas': 'Identitas',
        'anamnesa': 'Anamnesa',
        'physical_exam': 'Pemeriksaan Fisik',
        'usg': 'USG',
        'diagnosis': 'Diagnosis',
        'planning': 'Planning'
    };
    return labels[type] || type;
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
