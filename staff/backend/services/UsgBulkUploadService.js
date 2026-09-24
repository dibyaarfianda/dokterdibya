'use strict';

const dns = require('dns').promises;
const net = require('net');
const path = require('path');
const { randomUUID } = require('crypto');
const AdmZip = require('adm-zip');
const db = require('../db');
const logger = require('../utils/logger');
const r2Storage = require('./r2Storage');
const clinicalPhotos = require('./UsgClinicalPhotoService');
const {
    extractPatientName,
    extractDateFromFolder,
    isValidIsoDate,
    findBestNameMatches,
    getPatientsForDate,
    resolveVisitRecord
} = require('./UsgBulkUploadMatchingService');

const HOSPITAL_LOCATIONS = {
    klinik_private: 'Klinik Privat',
    rsia_melinda: 'RSIA Melinda',
    rsud_gambiran: 'RSUD Gambiran',
    rs_bhayangkara: 'RS Bhayangkara'
};

const MAX_ZIP_BYTES = 500 * 1024 * 1024;
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
const MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp'
};

let tablesReady = null;
const jobProcessors = new Map();

function getHospitalName(hospital) {
    return HOSPITAL_LOCATIONS[hospital] || hospital;
}

function isValidHospital(hospital) {
    return Boolean(hospital && HOSPITAL_LOCATIONS[hospital]);
}

function jakartaTodayIso(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(now);
    const year = parts.find((part) => part.type === 'year').value;
    const month = parts.find((part) => part.type === 'month').value;
    const day = parts.find((part) => part.type === 'day').value;
    return `${year}-${month}-${day}`;
}

function sundayClinicDateIso(now = new Date()) {
    const today = jakartaTodayIso(now);
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        weekday: 'short'
    }).format(now);
    const weekdayOffset = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday] ?? 0;
    const [year, month, day] = today.split('-').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    utcDate.setUTCDate(utcDate.getUTCDate() - weekdayOffset);
    return utcDate.toISOString().slice(0, 10);
}

function parseZipFolders(buffer) {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    const folderMap = new Map();
    let detectedDate = null;

    for (const entry of zipEntries) {
        if (entry.isDirectory) continue;

        const parts = entry.entryName.split('/').filter(Boolean);
        if (parts.length < 2) continue;

        const ext = path.extname(entry.entryName).toLowerCase();
        if (!IMAGE_EXTS.includes(ext)) continue;

        if (!detectedDate) {
            detectedDate = extractDateFromFolder(parts[0]);
        }

        let patientFolder;
        if (parts[0].match(/^\d{8}$/) && parts.length >= 3) {
            patientFolder = parts[1];
        } else if (parts[0].match(/^\d{8}-/)) {
            patientFolder = parts[0];
        } else {
            patientFolder = parts[0];
        }

        if (!folderMap.has(patientFolder)) {
            folderMap.set(patientFolder, {
                folderName: patientFolder,
                files: [],
                extractedName: extractPatientName(patientFolder),
                dateFromFolder: extractDateFromFolder(patientFolder)
            });
        }

        folderMap.get(patientFolder).files.push({
            name: path.basename(entry.entryName),
            path: entry.entryName,
            size: entry.header.size
        });
    }

    return { zip, folderMap, detectedDate };
}

function buildUniqueMappings(folders) {
    return folders
        .filter((folder) => folder.status === 'matched' && folder.selectedPatient)
        .map((folder) => {
            const selected = folder.matchedPatients.find(
                (patient) => String(patient.patient_id) === String(folder.selectedPatient)
            ) || folder.matchedPatients[0];
            return {
                folderName: folder.folderName,
                patient_id: selected.patient_id,
                mr_id: selected.mr_id,
                scr_id: selected.scr_id,
                files: folder.files
            };
        });
}

function reviewFolders(folders) {
    return folders
        .filter((folder) => folder.status !== 'matched')
        .map((folder) => ({
            folderName: folder.folderName,
            status: folder.status,
            reason: folder.reason || null,
            extractedName: folder.extractedName,
            fileCount: folder.files.length,
            matchedPatients: folder.matchedPatients || []
        }));
}

async function previewFromZipBuffer({ buffer, date, hospital }) {
    if (!isValidHospital(hospital)) {
        const error = new Error('Lokasi rumah sakit harus dipilih');
        error.statusCode = 400;
        throw error;
    }

    const { folderMap, detectedDate } = parseZipFolders(buffer);
    const targetDate = date || detectedDate;
    if (!targetDate || !isValidIsoDate(targetDate)) {
        const error = new Error('Tanggal USG harus dipilih dan valid');
        error.statusCode = 400;
        throw error;
    }

    const patients = await getPatientsForDate(db, targetDate, hospital);
    const folders = [];
    let matchedCount = 0;
    let noMatchCount = 0;

    for (const [, folderData] of folderMap) {
        const extractedName = folderData.extractedName;

        if (folderData.dateFromFolder && folderData.dateFromFolder !== targetDate) {
            folders.push({
                ...folderData,
                matchedPatients: [],
                status: 'date_mismatch',
                reason: `Tanggal folder ${folderData.dateFromFolder} berbeda dari tanggal yang dipilih ${targetDate}`
            });
            noMatchCount += 1;
            continue;
        }

        if (!extractedName) {
            folders.push({
                ...folderData,
                matchedPatients: [],
                status: 'no_match',
                reason: 'Nama pasien tidak dapat diekstrak dari folder'
            });
            noMatchCount += 1;
            continue;
        }

        const matchedPatients = findBestNameMatches(extractedName, patients);
        if (matchedPatients.length > 0) {
            folders.push({
                ...folderData,
                matchedPatients: matchedPatients.map((patient) => ({
                    patient_id: patient.patient_id,
                    full_name: patient.full_name,
                    mr_id: patient.mr_id,
                    mr_category: patient.mr_category,
                    scr_id: patient.scr_id
                })),
                selectedPatient: matchedPatients.length === 1 ? matchedPatients[0].patient_id : null,
                status: matchedPatients.length === 1 ? 'matched' : 'multiple_matches'
            });
            matchedCount += 1;
        } else {
            folders.push({
                ...folderData,
                matchedPatients: [],
                status: 'no_match',
                reason: 'Tidak ditemukan pasien dengan nama yang cocok'
            });
            noMatchCount += 1;
        }
    }

    folders.sort((left, right) => left.folderName.localeCompare(right.folderName));
    const totalFiles = folders.reduce((sum, folder) => sum + folder.files.length, 0);

    return {
        success: true,
        date: targetDate,
        hospital,
        hospitalName: getHospitalName(hospital),
        folders,
        allPatients: patients.map((patient) => ({
            patient_id: patient.patient_id,
            full_name: patient.full_name,
            mr_id: patient.mr_id,
            mr_category: patient.mr_category,
            scr_id: patient.scr_id
        })),
        summary: {
            totalFolders: folders.length,
            matched: matchedCount,
            noMatch: noMatchCount,
            uniqueMatches: buildUniqueMappings(folders).length,
            needsReview: reviewFolders(folders).length,
            totalFiles
        }
    };
}

async function executeFromZipBuffer({
    buffer,
    mappingsData,
    date,
    hospital,
    originalFilename,
    user
}) {
    if (!mappingsData || mappingsData.length === 0) {
        const error = new Error('No mappings provided');
        error.statusCode = 400;
        throw error;
    }
    if (!isValidIsoDate(date)) {
        const error = new Error('Tanggal USG tidak valid');
        error.statusCode = 400;
        throw error;
    }
    if (!isValidHospital(hospital)) {
        const error = new Error('Lokasi rumah sakit tidak valid');
        error.statusCode = 400;
        throw error;
    }

    const zip = new AdmZip(buffer);
    const results = [];
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const mapping of mappingsData) {
        const { folderName, patient_id, mr_id, scr_id, files } = mapping;
        const folderDate = extractDateFromFolder(folderName);

        if (folderDate && folderDate !== date) {
            results.push({
                folder: folderName,
                status: 'skipped',
                reason: 'Tanggal folder berbeda dari tanggal USG yang dipilih'
            });
            skipCount += 1;
            continue;
        }

        if (!patient_id) {
            results.push({
                folder: folderName,
                status: 'skipped',
                reason: 'No patient selected'
            });
            skipCount += 1;
            continue;
        }

        const uploadedPhotos = [];
        let clinicalSaved = false;
        try {
            const selectedVisit = await resolveVisitRecord(db, {
                scrId: scr_id,
                mrId: mr_id,
                patientId: patient_id,
                date,
                hospital
            });

            let effectiveMrId;

            if (selectedVisit) {
                effectiveMrId = selectedVisit.mr_id;
            } else {
                logger.info('[BulkUSG] Canonical visit unavailable', { count: 1 });
                results.push({
                    folder: folderName,
                    status: 'skipped',
                    reason: 'DRD untuk tanggal dan lokasi yang dipilih tidak ditemukan. Gunakan PERIKSA untuk membuat DRD kunjungan.'
                });
                skipCount += 1;
                continue;
            }

            for (const file of files) {
                const entry = zip.getEntry(file.path);
                if (!entry) continue;

                const fileBuffer = entry.getData();
                const ext = path.extname(file.name).toLowerCase();
                const r2Result = await r2Storage.uploadFile(
                    fileBuffer,
                    `bulk-${randomUUID()}${ext}`,
                    MIME_TYPES[ext] || 'image/jpeg',
                    'usg-photos'
                );

                uploadedPhotos.push({
                    name: file.name,
                    filename: r2Result.filename,
                    key: r2Result.key,
                    url: `/api/usg-photos/file/${r2Result.key}`,
                    type: MIME_TYPES[ext] || 'image/jpeg',
                    size: fileBuffer.length,
                    storage: 'r2',
                    uploadedAt: new Date().toISOString(),
                    source: 'bulk-upload'
                });
            }

            if (uploadedPhotos.length === 0) {
                results.push({
                    folder: folderName,
                    status: 'error',
                    reason: 'No files uploaded'
                });
                errorCount += 1;
                continue;
            }

            await clinicalPhotos.appendPhotos({ patientId: patient_id, mrId: effectiveMrId,
                photos: uploadedPhotos, actor: user?.id ? user : { id: 'usg-bulk-bot', name: 'USG Bulk Bot' }, recordDate: date });
            clinicalSaved = true;

            results.push({
                folder: folderName,
                status: 'success',
                photosUploaded: uploadedPhotos.length,
                patient_id,
                mr_id: effectiveMrId
            });
            successCount += 1;
        } catch (folderError) {
            if (!clinicalSaved && uploadedPhotos.length) await clinicalPhotos.compensateUploaded(uploadedPhotos);
            logger.error('[BulkUSG] Error processing folder', { count: 1 });
            results.push({
                folder: folderName,
                status: 'error',
                reason: folderError.message
            });
            errorCount += 1;
        }
    }

    try {
        await db.query(`
                INSERT INTO usg_bulk_upload_logs
                (upload_date, hospital, hospital_name, zip_filename, total_folders, success_count, skipped_count, error_count, details, uploaded_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
            date,
            hospital,
            getHospitalName(hospital),
            originalFilename || 'bot.zip',
            mappingsData.length,
            successCount,
            skipCount,
            errorCount,
            JSON.stringify(results),
            user?.name || user?.email || 'Grok Bot'
        ]);
    } catch (logError) {
        logger.error('[BulkUSG] Failed to log upload history', { count: 1 });
    }

    return {
        success: true,
        results,
        summary: {
            success: successCount,
            skipped: skipCount,
            errors: errorCount
        }
    };
}

function rewriteGoogleDriveUrl(rawUrl) {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.endsWith('google.com') && !parsed.hostname.endsWith('googleusercontent.com')) {
        return parsed;
    }
    const fileId = parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1]
        || parsed.searchParams.get('id');
    if (!fileId) return parsed;
    return new URL(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`);
}

function isBlockedIp(address) {
    if (!address) return true;
    if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true;
    if (address.startsWith('::ffff:')) {
        return isBlockedIp(address.slice(7));
    }
    if (net.isIP(address) === 4) {
        const [a, b] = address.split('.').map(Number);
        return a === 0 || a === 10 || a === 127
            || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168);
    }
    if (net.isIP(address) === 6) {
        const normalized = address.toLowerCase();
        return normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80');
    }
    return true;
}

async function assertSafeZipUrl(rawUrl) {
    let parsed;
    try {
        parsed = rewriteGoogleDriveUrl(String(rawUrl || '').trim());
    } catch (_error) {
        const error = new Error('URL ZIP tidak valid');
        error.statusCode = 400;
        throw error;
    }

    if (parsed.protocol !== 'https:') {
        const error = new Error('URL ZIP harus HTTPS');
        error.statusCode = 400;
        throw error;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        const error = new Error('URL ZIP tidak diizinkan');
        error.statusCode = 400;
        throw error;
    }

    const lookup = await dns.lookup(hostname, { all: true });
    if (!lookup.length || lookup.some((item) => isBlockedIp(item.address))) {
        const error = new Error('URL ZIP tidak diizinkan');
        error.statusCode = 400;
        throw error;
    }

    return parsed.toString();
}

function filenameFromHeaders(headers, fallbackUrl) {
    const disposition = headers.get('content-disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
    if (match) {
        try {
            return decodeURIComponent(match[1].replace(/"/g, ''));
        } catch (_error) {
            return match[1];
        }
    }
    try {
        const urlName = path.basename(new URL(fallbackUrl).pathname);
        return urlName && urlName !== '/' ? urlName : 'usg-bot.zip';
    } catch (_error) {
        return 'usg-bot.zip';
    }
}

async function downloadZipFromUrl(rawUrl, fetchImpl = fetch) {
    const safeUrl = await assertSafeZipUrl(rawUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
        const response = await fetchImpl(safeUrl, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: { Accept: 'application/zip,application/octet-stream,*/*' }
        });
        if (!response.ok) {
            const error = new Error(`Gagal mengunduh ZIP (HTTP ${response.status})`);
            error.statusCode = 400;
            throw error;
        }

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > MAX_ZIP_BYTES) {
            const error = new Error('File ZIP melebihi 500MB');
            error.statusCode = 400;
            throw error;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_ZIP_BYTES) {
            const error = new Error('File ZIP melebihi 500MB');
            error.statusCode = 400;
            throw error;
        }
        if (buffer.length < 4 || buffer.slice(0, 2).toString() !== 'PK') {
            const error = new Error('URL tidak mengembalikan file ZIP. Pastikan tautan bisa diunduh langsung.');
            error.statusCode = 400;
            throw error;
        }

        return {
            buffer,
            filename: filenameFromHeaders(response.headers, safeUrl)
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            const timeoutError = new Error('Timeout mengunduh ZIP');
            timeoutError.statusCode = 504;
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function ensureBotTables() {
    if (tablesReady) return tablesReady;
    tablesReady = (async () => {
        await db.query(`
            CREATE TABLE IF NOT EXISTS usg_bulk_upload_bot_config (
                id TINYINT PRIMARY KEY,
                enabled TINYINT(1) NOT NULL DEFAULT 0,
                sources_json LONGTEXT,
                updated_by VARCHAR(255) DEFAULT NULL,
                updated_at DATETIME NOT NULL
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS usg_bulk_upload_jobs (
                id VARCHAR(36) PRIMARY KEY,
                status VARCHAR(32) NOT NULL,
                hospital VARCHAR(64) NOT NULL,
                upload_date DATE NOT NULL,
                zip_url TEXT NOT NULL,
                zip_filename VARCHAR(255) DEFAULT NULL,
                dry_run TINYINT(1) NOT NULL DEFAULT 0,
                force_rerun TINYINT(1) NOT NULL DEFAULT 0,
                preview_json LONGTEXT,
                result_json LONGTEXT,
                error_message TEXT,
                requested_by VARCHAR(255) DEFAULT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        `);
        const [existing] = await db.query('SELECT id FROM usg_bulk_upload_bot_config WHERE id = 1');
        if (!existing.length) {
            await db.query(
                'INSERT INTO usg_bulk_upload_bot_config (id, enabled, sources_json, updated_at) VALUES (1, 0, ?, NOW())',
                [JSON.stringify([])]
            );
        }
    })();
    return tablesReady;
}

function parseJsonColumn(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_error) {
        return fallback;
    }
}

async function getBotConfig() {
    await ensureBotTables();
    const [rows] = await db.query('SELECT enabled, sources_json, updated_by, updated_at FROM usg_bulk_upload_bot_config WHERE id = 1');
    const row = rows[0] || {};
    return {
        enabled: Boolean(row.enabled),
        sources: parseJsonColumn(row.sources_json, []),
        updated_by: row.updated_by || null,
        updated_at: row.updated_at || null,
        cron: '0 21 * * 0',
        timezone: 'Asia/Jakarta'
    };
}

function normalizeSources(sources) {
    if (!Array.isArray(sources)) {
        const error = new Error('sources harus berupa array');
        error.statusCode = 400;
        throw error;
    }
    return sources.map((source, index) => {
        if (!isValidHospital(source?.hospital)) {
            const error = new Error(`Sumber #${index + 1}: lokasi rumah sakit tidak valid`);
            error.statusCode = 400;
            throw error;
        }
        if (!String(source?.zipUrl || '').trim()) {
            const error = new Error(`Sumber #${index + 1}: zipUrl wajib`);
            error.statusCode = 400;
            throw error;
        }
        return {
            hospital: source.hospital,
            zipUrl: String(source.zipUrl).trim()
        };
    });
}

async function saveBotConfig({ enabled, sources, user }) {
    await ensureBotTables();
    const normalized = sources === undefined ? (await getBotConfig()).sources : normalizeSources(sources);
    const enabledValue = enabled === undefined ? (await getBotConfig()).enabled : Boolean(enabled);
    await db.query(
        `UPDATE usg_bulk_upload_bot_config
         SET enabled = ?, sources_json = ?, updated_by = ?, updated_at = NOW()
         WHERE id = 1`,
        [enabledValue ? 1 : 0, JSON.stringify(normalized), user?.name || user?.email || 'Grok Bot']
    );
    return getBotConfig();
}

function serializeJob(row) {
    if (!row) return null;
    return {
        id: row.id,
        status: row.status,
        hospital: row.hospital,
        hospitalName: getHospitalName(row.hospital),
        date: row.upload_date,
        zipUrl: row.zip_url,
        zipFilename: row.zip_filename,
        dryRun: Boolean(row.dry_run),
        preview: parseJsonColumn(row.preview_json, null),
        result: parseJsonColumn(row.result_json, null),
        error: row.error_message || null,
        requestedBy: row.requested_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function getJob(id) {
    await ensureBotTables();
    const [rows] = await db.query('SELECT * FROM usg_bulk_upload_jobs WHERE id = ? LIMIT 1', [id]);
    return serializeJob(rows[0]);
}

async function listJobs({ limit = 20 } = {}) {
    await ensureBotTables();
    const [rows] = await db.query(
        'SELECT * FROM usg_bulk_upload_jobs ORDER BY created_at DESC LIMIT ?',
        [Math.min(Number(limit) || 20, 100)]
    );
    return rows.map(serializeJob);
}

async function updateJob(id, fields) {
    const assignments = [];
    const params = [];
    for (const [key, value] of Object.entries(fields)) {
        assignments.push(`${key} = ?`);
        params.push(value);
    }
    assignments.push('updated_at = NOW()');
    params.push(id);
    await db.query(`UPDATE usg_bulk_upload_jobs SET ${assignments.join(', ')} WHERE id = ?`, params);
}

async function alreadyUploaded(hospital, date) {
    const [rows] = await db.query(
        `SELECT id FROM usg_bulk_upload_logs
         WHERE hospital = ? AND upload_date = ? AND success_count > 0
         ORDER BY created_at DESC LIMIT 1`,
        [hospital, date]
    );
    return rows.length > 0;
}

async function processJob(jobId, fetchImpl = fetch) {
    const job = await getJob(jobId);
    if (!job) return null;

    try {
        await updateJob(jobId, { status: 'downloading' });
        const downloaded = await downloadZipFromUrl(job.zipUrl, fetchImpl);
        await updateJob(jobId, {
            status: 'previewing',
            zip_filename: downloaded.filename
        });

        const preview = await previewFromZipBuffer({
            buffer: downloaded.buffer,
            date: job.date,
            hospital: job.hospital
        });
        await updateJob(jobId, { preview_json: JSON.stringify(preview) });

        if (job.dryRun) {
            const result = {
                dryRun: true,
                uniqueMappings: buildUniqueMappings(preview.folders).length,
                needsReview: reviewFolders(preview.folders)
            };
            await updateJob(jobId, {
                status: 'completed',
                result_json: JSON.stringify(result)
            });
            return getJob(jobId);
        }

        const mappings = buildUniqueMappings(preview.folders);
        await updateJob(jobId, { status: 'uploading' });
        const executed = mappings.length
            ? await executeFromZipBuffer({
                buffer: downloaded.buffer,
                mappingsData: mappings,
                date: preview.date,
                hospital: job.hospital,
                originalFilename: downloaded.filename,
                user: { name: job.requestedBy || 'Grok Bot' }
            })
            : {
                success: true,
                results: [],
                summary: { success: 0, skipped: 0, errors: 0 }
            };

        const result = {
            ...executed,
            uniqueMappings: mappings.length,
            needsReview: reviewFolders(preview.folders)
        };
        await updateJob(jobId, {
            status: 'completed',
            result_json: JSON.stringify(result)
        });
        return getJob(jobId);
    } catch (error) {
        logger.error('[BulkUSG] Bot job failed', { count: 1 });
        await updateJob(jobId, {
            status: 'failed',
            error_message: error.message
        });
        return getJob(jobId);
    }
}

async function createBotJob({
    zipUrl,
    hospital,
    date,
    dryRun = false,
    force = false,
    user,
    waitMs = 25000,
    fetchImpl = fetch
}) {
    await ensureBotTables();
    if (!isValidHospital(hospital)) {
        const error = new Error('Lokasi rumah sakit tidak valid');
        error.statusCode = 400;
        throw error;
    }
    const targetDate = date || sundayClinicDateIso();
    if (!isValidIsoDate(targetDate)) {
        const error = new Error('Tanggal USG tidak valid');
        error.statusCode = 400;
        throw error;
    }

    await assertSafeZipUrl(zipUrl);

    if (!dryRun && !force && await alreadyUploaded(hospital, targetDate)) {
        return {
            skipped: true,
            reason: 'already_uploaded',
            message: `Upload USG ${getHospitalName(hospital)} untuk ${targetDate} sudah ada. Kirim force=true untuk mengulang.`,
            hospital,
            date: targetDate
        };
    }

    const id = randomUUID();
    await db.query(`
        INSERT INTO usg_bulk_upload_jobs
        (id, status, hospital, upload_date, zip_url, dry_run, force_rerun, requested_by, created_at, updated_at)
        VALUES (?, 'queued', ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [
        id,
        hospital,
        targetDate,
        String(zipUrl).trim(),
        dryRun ? 1 : 0,
        force ? 1 : 0,
        user?.name || user?.email || 'Grok Bot'
    ]);

    const runner = processJob(id, fetchImpl);
    jobProcessors.set(id, runner);
    runner.finally(() => jobProcessors.delete(id));

    if (waitMs > 0) {
        await Promise.race([
            runner,
            new Promise((resolve) => setTimeout(resolve, waitMs))
        ]);
    }

    return getJob(id);
}

async function runConfiguredSources({ force = false, dryRun = false, user, date } = {}) {
    const config = await getBotConfig();
    if (!config.enabled) {
        return { skipped: true, reason: 'disabled', message: 'Jadwal bot USG belum diaktifkan. Simpan config enabled=true dulu.' };
    }
    if (!config.sources.length) {
        return { skipped: true, reason: 'no_sources', message: 'Belum ada zipUrl yang disimpan untuk jadwal Minggu 21.00.' };
    }

    const targetDate = date || sundayClinicDateIso();
    const jobs = [];
    for (const source of config.sources) {
        jobs.push(await createBotJob({
            zipUrl: source.zipUrl,
            hospital: source.hospital,
            date: targetDate,
            dryRun,
            force,
            user,
            waitMs: 0
        }));
    }
    return {
        skipped: false,
        date: targetDate,
        jobs
    };
}

async function getPatients(date, hospital) {
    if (!isValidIsoDate(date) || !isValidHospital(hospital)) {
        const error = new Error('Tanggal dan lokasi rumah sakit wajib valid');
        error.statusCode = 400;
        throw error;
    }
    const patients = await getPatientsForDate(db, date, hospital);
    return {
        success: true,
        date,
        hospital,
        hospitalName: getHospitalName(hospital),
        patients: patients.map((patient) => ({
            patient_id: patient.patient_id,
            full_name: patient.full_name,
            mr_id: patient.mr_id,
            mr_category: patient.mr_category,
            scr_id: patient.scr_id
        }))
    };
}

module.exports = {
    HOSPITAL_LOCATIONS,
    MAX_ZIP_BYTES,
    jakartaTodayIso,
    sundayClinicDateIso,
    parseZipFolders,
    buildUniqueMappings,
    reviewFolders,
    previewFromZipBuffer,
    executeFromZipBuffer,
    assertSafeZipUrl,
    downloadZipFromUrl,
    ensureBotTables,
    getBotConfig,
    saveBotConfig,
    getJob,
    listJobs,
    createBotJob,
    processJob,
    runConfiguredSources,
    getPatients,
    getHospitalName,
    isValidHospital
};
