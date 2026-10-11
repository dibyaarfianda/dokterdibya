function normalizedText(value) {
    if (Array.isArray(value)) return value.map(normalizedText).filter(Boolean).join('\n').trim();
    return String(value || '').replace(/\r\n/g, '\n').trim();
}

export function normalizePlanningSnapshot(value = {}) {
    return {
        record_datetime: normalizedText(value.record_datetime),
        tindakan: normalizedText(value.tindakan),
        terapi: normalizedText(value.terapi || value.obat),
        rencana: normalizedText(value.rencana || value.instruksi)
    };
}

export function hasUnsavedPlanning(current = {}, persisted = {}) {
    return JSON.stringify(normalizePlanningSnapshot(current)) !== JSON.stringify(normalizePlanningSnapshot(persisted));
}

export function validateDocBoardSchedule(form = {}, options = {}) {
    const errors = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.schedule_date || ''))) {
        errors.push('Tanggal wajib dipilih.');
    } else if (options.today && form.schedule_date < options.today) {
        errors.push('Tanggal jadwal tidak boleh sebelum hari ini.');
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(form.schedule_time || ''))) {
        errors.push('Jam wajib dipilih.');
    }
    if (!String(form.location || '').trim()) errors.push('Lokasi wajib dipilih.');

    if (form.kind === 'procedure') {
        if (!options.procedureCategories?.includes(form.procedure_category)) {
            errors.push('Jenis tindakan wajib dipilih.');
        }
    } else if (form.kind === 'surgery') {
        const ids = Array.isArray(form.operation_type_ids) ? form.operation_type_ids.map(Number) : [];
        const hasActiveId = ids.some(id => options.operationTypeIds?.includes(id));
        if (!hasActiveId && !String(form.operation_type_other || '').trim()) {
            errors.push('Jenis operasi wajib dipilih atau ditulis.');
        }
    } else {
        errors.push('Pilih Operasi atau Tindakan.');
    }
    return errors;
}

export function buildDocBoardScheduleRequest(form = {}, mrId, idempotencyKey) {
    return {
        mr_id: String(mrId || '').trim(),
        kind: form.kind,
        schedule_date: form.schedule_date,
        schedule_time: form.schedule_time,
        location: form.location,
        procedure_category: form.kind === 'procedure' ? form.procedure_category : '',
        operation_type_ids: form.kind === 'surgery' && Array.isArray(form.operation_type_ids)
            ? form.operation_type_ids.map(Number).filter(Number.isInteger)
            : [],
        operation_type_other: form.kind === 'surgery' ? String(form.operation_type_other || '').trim() : '',
        idempotency_key: idempotencyKey
    };
}

export function createScheduleIdempotencyKey(mrId) {
    if (globalThis.crypto?.randomUUID) return `${String(mrId || '').toLowerCase()}-${globalThis.crypto.randomUUID()}`;
    const random = Math.random().toString(36).slice(2);
    return `${String(mrId || '').toLowerCase()}-${Date.now()}-${random}`;
}
