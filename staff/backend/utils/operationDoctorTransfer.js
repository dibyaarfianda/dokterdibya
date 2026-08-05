const TARGET_DOCTOR_KEYS = ['dibya', 'tri_aji', 'latifa'];

function normalizeDoctorText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function targetDoctorKey(doctor) {
    if (!doctor) return null;
    const identities = [doctor.key, doctor.name].map(normalizeDoctorText).filter(Boolean);
    for (const identity of identities) {
        if (/\btri\s+aji\b/.test(identity)) return 'tri_aji';
        if (/\bdibya\b/.test(identity)) return 'dibya';
        if (/\blatifa\b/.test(identity)) return 'latifa';
    }
    return null;
}

function hasDoctorIdentity(doctor) {
    return Boolean(normalizeDoctorText(doctor?.key) || normalizeDoctorText(doctor?.name));
}

function classifyTargetDoctorTransfer(currentStatus, originDoctor, finalDoctor) {
    const fallback = ['yes', 'no', 'unknown'].includes(currentStatus) ? currentStatus : 'unknown';
    if (!hasDoctorIdentity(originDoctor) || !hasDoctorIdentity(finalDoctor)) {
        return fallback === 'yes' ? 'unknown' : fallback;
    }

    const originKey = targetDoctorKey(originDoctor);
    const finalKey = targetDoctorKey(finalDoctor);
    if (!originKey || !finalKey) return 'no';
    return originKey === finalKey ? 'no' : 'yes';
}

module.exports = {
    TARGET_DOCTOR_KEYS,
    classifyTargetDoctorTransfer,
    targetDoctorKey,
};
