'use strict';

function normalizeMrId(value) {
    if (!value || typeof value !== 'string') {
        return '';
    }
    return value.trim().toUpperCase();
}

function convertLooseDateToIso(dateStr) {
    if (!dateStr) {
        return null;
    }

    const match = String(dateStr).match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
    if (!match) {
        return null;
    }

    let [, day, month, year] = match;
    if (year.length === 2) {
        year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
    }

    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function buildMedifyIdentityPrefill(identity) {
    if (!identity || typeof identity !== 'object') {
        return {};
    }

    const birthDate = convertLooseDateToIso(identity.tanggal_lahir);
    const ageNumber = parseInt(String(identity.usia || '').match(/\d+/)?.[0] || '', 10);
    const insuranceParts = [
        identity.pembayaran_utama,
        identity.nomor_pembayaran,
        identity.kelas_pembayaran
    ].filter(Boolean);

    return {
        fullName: identity.nama || '',
        full_name: identity.nama || '',
        birthDate: birthDate || '',
        date_of_birth: birthDate || '',
        age: Number.isFinite(ageNumber) ? ageNumber : '',
        gender: /laki/i.test(identity.jenis_kelamin || '') ? 'male' : (/perempuan/i.test(identity.jenis_kelamin || '') ? 'female' : ''),
        gender_label: identity.jenis_kelamin || '',
        phone: identity.no_hp || '',
        whatsapp: identity.no_hp || '',
        address: identity.alamat || '',
        marital_status: identity.status_pernikahan || '',
        occupation: identity.pekerjaan || '',
        insurance: insuranceParts.join(' - '),
        nik: identity.no_identitas || ''
    };
}

function normalizePhone(phone) {
    if (!phone) {
        return null;
    }
    const digits = String(phone).replace(/\D+/g, '');
    if (!digits) {
        return null;
    }
    return digits.slice(-10);
}

module.exports = {
    normalizeMrId,
    convertLooseDateToIso,
    buildMedifyIdentityPrefill,
    normalizePhone
};
