'use strict';

function normalizeNameTokens(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

function isValidIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function extractPatientName(folderName) {
    const normalizedFolder = String(folderName || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
    const underscoreIndex = normalizedFolder.lastIndexOf('_');
    let name = underscoreIndex >= 0
        ? normalizedFolder.slice(underscoreIndex + 1)
        : normalizedFolder.replace(/^\d{8}(?:-\d{6})?[\s-]*/, '');

    name = name.replace(/^(?:NY|NYONYA)[.\s]*/i, '').trim();
    return name ? name.toUpperCase() : null;
}

function extractDateFromFolder(folderName) {
    const match = String(folderName || '').match(/^(\d{2})(\d{2})(\d{4})/);
    if (!match) return null;

    const [, day, month, year] = match;
    const isoDate = `${year}-${month}-${day}`;
    const parsed = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) return null;
    return isoDate;
}

const USG_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tif', '.tiff']);
const GENERIC_USG_FOLDER_NAMES = new Set([
    'images', 'image', 'img', 'imgs', 'pictures', 'picture', 'photos', 'photo',
    'scan', 'scans', 'report', 'reports', 'export', 'exports', 'dcim', 'dicom',
    'print', 'prints', 'screen', 'screenshots'
]);

function normalizeZipPath(entryPath) {
    return String(entryPath || '').replace(/\\/g, '/');
}

function getFileExtension(fileName) {
    const base = String(fileName || '').split('/').pop() || '';
    const dot = base.lastIndexOf('.');
    return dot >= 0 ? base.slice(dot).toLowerCase() : '';
}

function isUsgImageFile(fileName) {
    return USG_IMAGE_EXTENSIONS.has(getFileExtension(fileName));
}

function isJunkZipPart(part) {
    const value = String(part || '');
    const lowered = value.toLowerCase();
    return !value
        || lowered === '__macosx'
        || lowered === '.ds_store'
        || lowered === 'thumbs.db'
        || value.startsWith('._');
}

function isDateOnlyFolder(name) {
    return /^\d{8}$/.test(String(name || ''));
}

function looksLikePatientFolder(name) {
    const value = String(name || '').trim();
    if (!value || isJunkZipPart(value) || isDateOnlyFolder(value)) return false;
    return !GENERIC_USG_FOLDER_NAMES.has(value.toLowerCase());
}

function resolvePatientFolderFromEntryPath(entryPath) {
    const parts = normalizeZipPath(entryPath).split('/').filter(Boolean);
    if (parts.length < 2 || parts.some(isJunkZipPart)) return null;

    const fileName = parts[parts.length - 1];
    if (!isUsgImageFile(fileName)) return null;

    const folders = parts.slice(0, -1);
    for (let index = folders.length - 1; index >= 0; index -= 1) {
        if (looksLikePatientFolder(folders[index])) return folders[index];
    }
    return null;
}

function detectDateFromZipPath(entryPath) {
    const parts = normalizeZipPath(entryPath).split('/').filter(Boolean);
    for (const part of parts) {
        const detected = extractDateFromFolder(part);
        if (detected) return detected;
    }
    return null;
}

function groupZipImageEntries(entries) {
    const folderMap = new Map();
    let detectedDate = null;

    for (const entry of entries || []) {
        if (entry?.isDirectory) continue;

        const entryPath = entry.entryName || entry.name || '';
        const patientFolder = resolvePatientFolderFromEntryPath(entryPath);
        if (!patientFolder) continue;

        if (!detectedDate) {
            detectedDate = detectDateFromZipPath(entryPath);
        }

        if (!folderMap.has(patientFolder)) {
            folderMap.set(patientFolder, {
                folderName: patientFolder,
                files: [],
                extractedName: extractPatientName(patientFolder),
                dateFromFolder: extractDateFromFolder(patientFolder)
            });
        }

        const fileName = normalizeZipPath(entryPath).split('/').filter(Boolean).pop();
        folderMap.get(patientFolder).files.push({
            name: fileName,
            path: entryPath,
            size: entry.header?.size || entry.size || 0
        });
    }

    return { folderMap, detectedDate };
}

function levenshtein(left, right) {
    const a = String(left || '');
    const b = String(right || '');
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

    for (let row = 1; row <= a.length; row += 1) {
        const current = [row];
        for (let column = 1; column <= b.length; column += 1) {
            const substitutionCost = a[row - 1] === b[column - 1] ? 0 : 1;
            current[column] = Math.min(
                current[column - 1] + 1,
                previous[column] + 1,
                previous[column - 1] + substitutionCost
            );
        }
        previous.splice(0, previous.length, ...current);
    }

    return previous[b.length];
}

function scoreNameMatch(inputName, patientName) {
    const inputTokens = normalizeNameTokens(inputName);
    const patientTokens = normalizeNameTokens(patientName);
    if (!inputTokens.length || !patientTokens.length) return 0;

    const inputCompact = inputTokens.join('');
    const patientCompact = patientTokens.join('');
    if (inputCompact === patientCompact) return 100;

    const isExactPrefix = inputTokens.length <= patientTokens.length
        && inputTokens.every((token, index) => token === patientTokens[index]);
    if (isExactPrefix) return inputTokens.length === 1 ? 90 : 95;

    if (inputTokens.length === 1) {
        const [token] = inputTokens;
        const exactTokenIndex = patientTokens.indexOf(token);
        if (exactTokenIndex >= 0) return exactTokenIndex === 0 ? 90 : 82;

        if (token.length >= 4) {
            const distances = patientTokens
                .filter((candidate) => candidate.length >= 4)
                .map((candidate) => levenshtein(token, candidate));
            if (distances.length && Math.min(...distances) === 1) return 72;
        }
        return 0;
    }

    if (inputTokens.length <= patientTokens.length) {
        const fuzzyPrefix = inputTokens.every((token, index) => (
            token.length >= 4
            && patientTokens[index]?.length >= 4
            && levenshtein(token, patientTokens[index]) <= 1
        ));
        if (fuzzyPrefix) return 75;
    }

    return 0;
}

function findBestNameMatches(inputName, patients) {
    const scored = (patients || [])
        .map((patient) => ({ patient, score: scoreNameMatch(inputName, patient.full_name) }))
        .filter(({ score }) => score > 0);

    if (!scored.length) return [];
    const bestScore = Math.max(...scored.map(({ score }) => score));
    return scored
        .filter(({ score }) => score === bestScore)
        .map(({ patient }) => patient);
}

function deduplicateVisitCandidates(rows) {
    const withRecords = [];
    const withoutRecords = [];
    const seenRecords = new Set();
    const patientsWithRecords = new Set();

    for (const row of rows || []) {
        if (row.scr_id) {
            const key = String(row.scr_id);
            if (seenRecords.has(key)) continue;
            seenRecords.add(key);
            patientsWithRecords.add(String(row.patient_id));
            withRecords.push(row);
        } else {
            withoutRecords.push(row);
        }
    }

    const seenPatientsWithoutRecords = new Set();
    for (const row of withoutRecords) {
        const patientKey = String(row.patient_id);
        if (patientsWithRecords.has(patientKey) || seenPatientsWithoutRecords.has(patientKey)) continue;
        seenPatientsWithoutRecords.add(patientKey);
        withRecords.push(row);
    }

    return withRecords.sort((left, right) => (
        String(left.full_name || '').localeCompare(String(right.full_name || ''), 'id')
        || String(left.mr_id || '').localeCompare(String(right.mr_id || ''), 'id')
    ));
}

async function getPatientsForDate(db, date, hospital) {
    let appointmentRows = [];

    if (hospital === 'klinik_private') {
        [appointmentRows] = await db.query(`
            SELECT
                p.id AS patient_id,
                p.full_name,
                scr.mr_id,
                scr.mr_category,
                scr.id AS scr_id,
                sa.id AS appointment_id
            FROM sunday_appointments sa
            INNER JOIN patients p ON p.id = sa.patient_id
            LEFT JOIN sunday_clinic_records scr ON scr.id = (
                SELECT linked_scr.id
                FROM sunday_clinic_records linked_scr
                WHERE linked_scr.appointment_id = sa.id
                  AND linked_scr.patient_id = sa.patient_id
                  AND linked_scr.visit_location = 'klinik_private'
                ORDER BY linked_scr.created_at DESC, linked_scr.id DESC
                LIMIT 1
            )
            WHERE sa.appointment_date = ?
              AND sa.status IN ('confirmed', 'completed')
        `, [date]);
    } else {
        [appointmentRows] = await db.query(`
            SELECT
                p.id AS patient_id,
                p.full_name,
                scr.mr_id,
                scr.mr_category,
                scr.id AS scr_id,
                a.id AS appointment_id
            FROM appointments a
            INNER JOIN patients p ON p.id = a.patient_id
            LEFT JOIN sunday_clinic_records scr ON scr.id = (
                SELECT dated_scr.id
                FROM sunday_clinic_records dated_scr
                WHERE dated_scr.patient_id = a.patient_id
                  AND dated_scr.visit_location = a.hospital_location
                  AND dated_scr.created_at >= ?
                  AND dated_scr.created_at < DATE_ADD(?, INTERVAL 1 DAY)
                ORDER BY dated_scr.created_at DESC, dated_scr.id DESC
                LIMIT 1
            )
            WHERE a.appointment_date = ?
              AND a.hospital_location = ?
              AND a.status IN ('confirmed', 'completed')
        `, [date, date, date, hospital]);
    }

    const [walkInRows] = await db.query(`
        SELECT
            p.id AS patient_id,
            p.full_name,
            scr.mr_id,
            scr.mr_category,
            scr.id AS scr_id,
            scr.appointment_id
        FROM sunday_clinic_records scr
        INNER JOIN patients p ON p.id = scr.patient_id
        WHERE scr.created_at >= ?
          AND scr.created_at < DATE_ADD(?, INTERVAL 1 DAY)
          AND scr.visit_location = ?
    `, [date, date, hospital]);

    return deduplicateVisitCandidates([...appointmentRows, ...walkInRows]);
}

async function resolveVisitRecord(db, { scrId, mrId, patientId, date, hospital }) {
    if (!patientId || !date || !hospital || (!scrId && !mrId)) return null;

    const identityClause = scrId ? 'scr.id = ?' : 'scr.mr_id = ?';
    const identityValue = scrId || mrId;
    const [rows] = await db.query(`
        SELECT scr.id, scr.mr_id, scr.patient_id, scr.visit_location
        FROM sunday_clinic_records scr
        WHERE ${identityClause}
          AND scr.patient_id = ?
          AND scr.visit_location = ?
          AND (
              (scr.created_at >= ? AND scr.created_at < DATE_ADD(?, INTERVAL 1 DAY))
              OR EXISTS (
                  SELECT 1
                  FROM sunday_appointments sa
                  WHERE sa.id = scr.appointment_id
                    AND sa.patient_id = scr.patient_id
                    AND sa.appointment_date = ?
                    AND sa.status IN ('confirmed', 'completed')
              )
          )
        LIMIT 1
    `, [identityValue, patientId, hospital, date, date, date]);

    return rows[0] || null;
}

module.exports = {
    normalizeNameTokens,
    isValidIsoDate,
    extractPatientName,
    extractDateFromFolder,
    resolvePatientFolderFromEntryPath,
    groupZipImageEntries,
    scoreNameMatch,
    findBestNameMatches,
    deduplicateVisitCandidates,
    getPatientsForDate,
    resolveVisitRecord
};
