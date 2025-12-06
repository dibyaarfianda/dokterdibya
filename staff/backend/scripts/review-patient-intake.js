#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const LOG_DIR = path.join(__dirname, '..', 'logs', 'patient-intake');

function getArgMap(argv) {
    const map = new Map();
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg.startsWith('--')) {
            continue;
        }
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            map.set(key, true);
            continue;
        }
        map.set(key, next);
    }
    return map;
}

function toDate(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
}

function deriveKey() {
    const secret = process.env.INTAKE_ENCRYPTION_KEY;
    if (!secret) {
        return null;
    }
    return crypto.createHash('sha256').update(String(secret)).digest();
}

function decryptPayload(wrapper, key) {
    if (!wrapper.encrypted) {
        return wrapper;
    }
    if (!key) {
        throw new Error('Encrypted record detected but INTAKE_ENCRYPTION_KEY is not set.');
    }
    const { iv, authTag, data } = wrapper.encrypted;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
    ]);
    const record = JSON.parse(decrypted.toString('utf8'));
    // Attach storage metadata for convenience
    record.storage = {
        submissionId: wrapper.submissionId,
        receivedAt: wrapper.receivedAt,
        status: wrapper.status,
        highRisk: wrapper.highRisk,
        payloadHash: wrapper.payloadHash,
        keyId: wrapper.encrypted.keyId,
    };
    return record;
}

async function loadRecord(file, key) {
    const raw = await fs.readFile(path.join(LOG_DIR, file), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.encrypted) {
        return decryptPayload(parsed, key);
    }
    return parsed;
}

function formatSummary(record) {
    const submissionId = record.submissionId;
    const receivedAt = record.receivedAt;
    const status = record.status || record.review?.status || 'unknown';
    const name = record.payload?.full_name || 'Tanpa nama';
    const phone = record.payload?.phone || '-';
    const edd = record.payload?.metadata?.edd?.value || record.payload?.edd || '-';
    const risk = record.summary?.highRisk || record.payload?.metadata?.highRisk || false;
    return `${submissionId} | ${receivedAt} | ${status} | ${risk ? 'HIGH-RISK' : 'normal'} | ${name} | ${phone} | EDD ${edd}`;
}

function toCsvValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function recordToCsvRow(record) {
    const payload = record.payload || {};
    const meta = payload.metadata || {};
    const eddInfo = meta.edd || {};
    return [
        record.submissionId,
        record.receivedAt,
        record.status || record.review?.status || '',
        payload.full_name || '',
        payload.phone || '',
        payload.dob || '',
        payload.age || '',
        payload.address || '',
        payload.marital_status || '',
        payload.occupation || '',
        payload.education || '',
        payload.height || '',
        payload.weight || '',
        payload.bmi || '',
        meta.bmiCategory || '',
        payload.first_check_ga || '',
        payload.lmp || '',
        eddInfo.value || payload.edd || '',
        eddInfo.source || '',
        meta.obstetricTotals?.gravida ?? payload.gravida ?? '',
        meta.obstetricTotals?.para ?? '',
        meta.obstetricTotals?.abortus ?? '',
        meta.obstetricTotals?.living ?? '',
        (meta.riskFlags || []).join('; '),
        record.client?.ip || '',
        record.client?.userAgent || '',
        payload.signature?.value || payload.patient_signature || '',
    ].map(toCsvValue).join(',');
}

function printRecord(record, options) {
    if (options.raw) {
        console.dir(record, { depth: null, colors: true });
        return;
    }
    console.log(`Submission: ${record.submissionId}`);
    console.log(`Received : ${record.receivedAt}`);
    console.log(`Status   : ${record.status || record.review?.status || 'N/A'}`);
    const payload = record.payload || {};
    console.log('--- Patient Profile ---');
    console.log(`Nama   : ${payload.full_name || '-'}`);
    console.log(`Phone  : ${payload.phone || '-'}`);
    console.log(`DOB    : ${payload.dob || '-'} (usia ${payload.age || '-'})`);
    console.log(`Alamat : ${payload.address || '-'}`);
    console.log(`Status : ${payload.marital_status || '-'}`);
    console.log(`Pekerjaan: ${payload.occupation || '-'}`);
    console.log('--- Current Pregnancy ---');
    const meta = payload.metadata || {};
    const eddInfo = meta.edd || {};
    console.log(`EDD         : ${eddInfo.value || payload.edd || '-'}`);
    console.log(`EDD source  : ${eddInfo.source || '-'}`);
    console.log(`GA first chk: ${payload.first_check_ga || '-'}`);
    console.log(`BMI         : ${payload.bmi || '-'} (${meta.bmiCategory || '-'})`);
    console.log('--- Obstetric Totals ---');
    const totals = meta.obstetricTotals || {};
    console.log(`Gravida: ${totals.gravida ?? payload.gravida ?? '-'}`);
    console.log(`Para   : ${totals.para ?? '-'}`);
    console.log(`Abortus: ${totals.abortus ?? '-'}`);
    console.log(`Living : ${totals.living ?? '-'}`);
    if (payload.previousPregnancies?.length) {
        console.log('Riwayat Obstetri:');
        payload.previousPregnancies.forEach((item) => {
            console.log(`  #${item.index || '-'} | Tahun ${item.year || '-'} | Mode ${item.mode || '-'} | Komplikasi ${item.complication || '-'}`);
        });
    }
    if (meta.riskFlags?.length) {
        console.log('Risk Flags:');
        meta.riskFlags.forEach((flag) => console.log(`  - ${flag}`));
    }
    console.log('--- Audit ---');
    console.log(`Signature : ${payload.signature?.value || payload.patient_signature || '-'}`);
    console.log(`Consent   : ${payload.consent ? 'yes' : 'no'} | Final Ack: ${payload.final_ack ? 'yes' : 'no'}`);
    console.log(`Device TS : ${meta.deviceTimestamp || record.audit?.deviceTimestamp || '-'}`);
    console.log(`Client IP : ${record.client?.ip || '-'}`);
    console.log(`User-Agent: ${record.client?.userAgent || '-'}`);
}

async function main() {
    const args = getArgMap(process.argv.slice(2));
    const filterId = args.get('id') || args.get('submission');
    const raw = args.has('raw');
    const riskFilter = args.get('risk');
    const dateFrom = toDate(args.get('date-from') || args.get('from'));
    const dateTo = toDate(args.get('date-to') || args.get('to'));
    const nameFilter = args.get('name');
    const phoneFilter = args.get('phone');
    const exportPath = args.get('export');
    const key = deriveKey();

    const files = (await fs.readdir(LOG_DIR)).filter((file) => file.endsWith('.json'));
    if (!files.length) {
        console.log('Tidak ada data intake.');
        return;
    }
    const sorted = files.slice().sort();

    if (!filterId) {
        const filteredRecords = [];
        for (const file of sorted) {
            const record = await loadRecord(file, key);
            const receivedAtDate = toDate(record.receivedAt);
            if (dateFrom && receivedAtDate && receivedAtDate < dateFrom) {
                continue;
            }
            if (dateTo && receivedAtDate && receivedAtDate > dateTo) {
                continue;
            }
            const isHighRisk = Boolean(record.summary?.highRisk || record.payload?.metadata?.highRisk);
            if (riskFilter === 'high' && !isHighRisk) {
                continue;
            }
            if (riskFilter === 'normal' && isHighRisk) {
                continue;
            }
            const name = (record.payload?.full_name || '').toLowerCase();
            if (nameFilter && !name.includes(String(nameFilter).toLowerCase())) {
                continue;
            }
            const phone = record.payload?.phone || '';
            if (phoneFilter && !phone.includes(String(phoneFilter))) {
                continue;
            }
            filteredRecords.push(record);
        }
        if (exportPath && filteredRecords.length) {
            const header = [
                'submissionId','receivedAt','status','name','phone','dob','age','address','maritalStatus','occupation','education','height','weight','bmi','bmiCategory','firstCheckGA','lmp','edd','eddSource','gravida','para','abortus','living','riskFlags','clientIp','userAgent','signature'
            ].join(',');
            const csv = [header, ...filteredRecords.map(recordToCsvRow)].join('\n');
            await fs.writeFile(exportPath, `${csv}\n`, 'utf8');
            console.log(`Diekspor ke ${exportPath} (${filteredRecords.length} baris).`);
            return;
        }
        console.log('submissionId | receivedAt | status | risk | name | phone | EDD');
        filteredRecords.forEach((record) => console.log(formatSummary(record)));
        console.log(`\nGunakan --id <submissionId> untuk detail lengkap.`);
        return;
    }

    const targetFile = sorted.find((file) => file.startsWith(filterId));
    if (!targetFile) {
        console.error(`Submission ${filterId} tidak ditemukan.`);
        process.exitCode = 1;
        return;
    }
    const record = await loadRecord(targetFile, key);
    printRecord(record, { raw });
}

main().catch((error) => {
    console.error('Gagal membaca intake:', error.message);
    process.exitCode = 1;
});
