/* Aturan nama asli pasien. Dipakai bersama oleh portal pasien dan backend. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PatientNameRules = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    const MIN_LETTERS = 3;
    const MAX_LENGTH = 100;

    // Kata panggilan/placeholder. Nama ditolak hanya jika SELURUH katanya ada di
    // daftar ini (mis. "Bunda Cantik"), jadi "Ibu Sri" atau "Mbak Ayu" tetap lolos.
    const PLACEHOLDER_WORDS = new Set([
        'test', 'tes', 'testing', 'coba', 'cobacoba', 'admin', 'user', 'pasien',
        'anonim', 'anonymous', 'noname', 'unknown', 'dummy', 'fake', 'nama', 'asli',
        'bunda', 'mama', 'mami', 'mommy', 'mom', 'bumil', 'ibu', 'hamil', 'muda',
        'cantik', 'sayang', 'cinta', 'dede', 'adek', 'kakak', 'kak', 'mbak', 'mba',
        'bu', 'ny', 'nyonya', 'guest', 'tamu', 'someone', 'aku', 'saya', 'xxx', 'abc'
    ]);

    const KEYBOARD_MASH = /(asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|wert|erty|rtyu|zxcv|xcvb|cvbn)/i;

    function normalizePatientName(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }

    function validatePatientName(value) {
        const name = normalizePatientName(value);
        const fail = message => ({ valid: false, message, normalized: name });

        if (!name) return fail('Nama lengkap wajib diisi.');
        if (name.length > MAX_LENGTH) return fail('Nama terlalu panjang (maksimal 100 karakter).');
        if (/\d/.test(name)) return fail('Nama tidak boleh mengandung angka. Gunakan nama asli sesuai KTP.');
        if (!/^[\p{L}\p{M}\s.'`,\-]+$/u.test(name)) {
            return fail('Nama hanya boleh berisi huruf, spasi, titik, koma, tanda petik, atau tanda hubung. Tanpa emoji atau simbol.');
        }

        const letters = name.replace(/[^\p{L}]/gu, '');
        if (letters.length < MIN_LETTERS) return fail('Nama terlalu pendek. Gunakan nama lengkap asli sesuai KTP.');
        if (/(\p{L})\1{3,}/iu.test(letters)) return fail('Nama tidak valid (huruf berulang). Gunakan nama asli sesuai KTP.');
        if (/^[\x00-\x7F]+$/.test(letters) && !/[aiueoy]/i.test(letters)) {
            return fail('Nama tidak valid. Gunakan nama asli sesuai KTP.');
        }
        if (KEYBOARD_MASH.test(letters)) return fail('Nama tidak valid. Gunakan nama asli sesuai KTP.');

        const words = name.toLowerCase().split(/[\s.,\-]+/).map(word => word.replace(/['`]/g, '')).filter(Boolean);
        if (words.length > 0 && words.every(word => PLACEHOLDER_WORDS.has(word))) {
            return fail('Gunakan nama asli sesuai KTP, bukan nama panggilan atau nama samaran.');
        }

        return { valid: true, message: '', normalized: name };
    }

    return Object.freeze({
        MIN_LETTERS,
        MAX_LENGTH,
        normalizePatientName,
        validatePatientName
    });
});
