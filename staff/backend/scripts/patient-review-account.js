#!/usr/bin/env node
/**
 * Manage review (test) accounts for payment-gateway reviewers such as Duitku.
 * The generated password is printed ONCE on this terminal. Never paste it into chat or commit it;
 * send it to the reviewer yourself.
 *
 * Usage (from staff/backend):
 *   node scripts/patient-review-account.js create --email uji@example.com --phone 081234567890 \
 *        --birth-date 1995-05-10 [--name "AKUN UJI DUITKU"] [--days 120] [--label "Duitku review"]
 *   node scripts/patient-review-account.js reset-password --email uji@example.com
 *   node scripts/patient-review-account.js extend --email uji@example.com [--days 120]   (also re-enables a revoked account)
 *   node scripts/patient-review-account.js revoke --email uji@example.com
 *   node scripts/patient-review-account.js status [--email uji@example.com]
 *
 * Use an email that has NO Google account (Google login would bypass the expiry) and a phone
 * number the clinic controls (automated WhatsApp jobs may message it).
 */
require('dotenv').config({ quiet: true });

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db');
const { BCRYPT_ROUNDS } = require('../services/PatientReviewAccountService');
const { generateUniqueMedicalRecordId } = require('../services/PatientMedicalRecordId');

const DEFAULT_DAYS = 120; // covers 60 Indonesian working days including holidays
const DEFAULT_NAME = 'AKUN UJI DUITKU';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = {};
    for (let i = 0; i < rest.length; i += 1) {
        const key = rest[i];
        if (!key.startsWith('--')) continue;
        const next = rest[i + 1];
        if (next === undefined || next.startsWith('--')) {
            options[key.slice(2)] = true;
        } else {
            options[key.slice(2)] = next;
            i += 1;
        }
    }
    return { command, options };
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatLocal(value) {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function requireEmail(options) {
    const email = String(options.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--email wajib diisi dengan alamat email yang valid');
    return email;
}

function parseDays(options) {
    const days = options.days === undefined ? DEFAULT_DAYS : Number(options.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('--days harus bilangan bulat 1-365');
    return days;
}

function newPassword() {
    return crypto.randomBytes(18).toString('base64url');
}

function ageFrom(birthDate, now) {
    let age = now.getFullYear() - birthDate.getFullYear();
    const beforeBirthday = now.getMonth() < birthDate.getMonth()
        || (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate());
    if (beforeBirthday) age -= 1;
    return age;
}

async function findPatientByEmail(executor, email) {
    const [rows] = await executor.query('SELECT id, full_name, email FROM patients WHERE email = ? LIMIT 1', [email]);
    return rows[0] || null;
}

async function findReviewRow(executor, patientId) {
    const [rows] = await executor.query('SELECT * FROM patient_review_accounts WHERE patient_id = ? LIMIT 1', [patientId]);
    return rows[0] || null;
}

function printCredentials({ patientId, email, password, expiresAt }) {
    console.log('\nAkun uji siap. Simpan password ini sekarang; tidak akan ditampilkan lagi.');
    console.log(`  ID pasien : ${patientId}`);
    console.log(`  Email     : ${email}`);
    console.log(`  Password  : ${password}`);
    console.log(`  Berlaku   : sampai ${formatLocal(expiresAt)} (waktu server)`);
    console.log('  Login     : https://sisiwanita.id/masuk-akun-uji.html');
}

async function create(options) {
    const email = requireEmail(options);
    const days = parseDays(options);
    const name = String(options.name || DEFAULT_NAME).trim().substring(0, 100);
    const phone = String(options.phone || '').replace(/[^0-9]/g, '');
    if (phone.length < 9 || phone.length > 15) throw new Error('--phone wajib diisi (nomor milik klinik, 9-15 digit)');
    const birthText = String(options['birth-date'] || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthText)) throw new Error('--birth-date wajib diisi dengan format YYYY-MM-DD');
    const [year, month, day] = birthText.split('-').map(Number);
    const birthDate = new Date(year, month - 1, day);
    if (birthDate.getMonth() !== month - 1) throw new Error('--birth-date tidak valid');

    const existing = await findPatientByEmail(db, email);
    if (existing) {
        const review = await findReviewRow(db, existing.id);
        if (!review) throw new Error(`Email ${email} milik pasien sungguhan (${existing.id}). Gunakan email lain.`);
        throw new Error(`Akun uji ${email} sudah ada. Gunakan reset-password atau extend.`);
    }

    const now = new Date();
    const password = newPassword();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const expiresAt = new Date(now.getTime() + days * MS_PER_DAY);

    const connection = await db.getConnection();
    let patientId;
    try {
        await connection.beginTransaction();
        for (let attempt = 0; attempt < 3 && !patientId; attempt += 1) {
            const candidate = await generateUniqueMedicalRecordId(connection, now);
            try {
                await connection.query(
                    `INSERT INTO patients
                        (id, full_name, email, phone, birth_date, age, email_verified, registration_date, status, patient_type, profile_completed, intake_completed)
                     VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), 'active', 'web', 1, 1)`,
                    [candidate, name, email, phone, birthText, ageFrom(birthDate, now)]
                );
                patientId = candidate;
            } catch (error) {
                if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
            }
        }

        const [users] = await connection.query('SELECT new_id FROM users WHERE email = ? LIMIT 1', [email]);
        if (!users.length) {
            await connection.query(
                `INSERT INTO users (new_id, email, name, user_type, password_hash, created_at)
                 VALUES (?, ?, ?, 'patient', '', NOW())`,
                [patientId, email, name]
            );
        }

        await connection.query(
            'INSERT INTO patient_review_accounts (patient_id, password_hash, label, expires_at) VALUES (?, ?, ?, ?)',
            [patientId, hash, String(options.label || 'Duitku review').substring(0, 120), expiresAt]
        );
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    printCredentials({ patientId, email, password, expiresAt });
}

async function requireReviewAccount(email) {
    const patient = await findPatientByEmail(db, email);
    const review = patient ? await findReviewRow(db, patient.id) : null;
    if (!review) throw new Error(`Tidak ada akun uji dengan email ${email}`);
    return { patient, review };
}

async function resetPassword(options) {
    const email = requireEmail(options);
    const { patient, review } = await requireReviewAccount(email);
    const password = newPassword();
    await db.query('UPDATE patient_review_accounts SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, BCRYPT_ROUNDS), review.id]);
    printCredentials({ patientId: patient.id, email, password, expiresAt: review.expires_at });
}

async function extend(options) {
    const email = requireEmail(options);
    const days = parseDays(options);
    const { review } = await requireReviewAccount(email);
    const expiresAt = new Date(Date.now() + days * MS_PER_DAY);
    await db.query('UPDATE patient_review_accounts SET expires_at = ?, revoked_at = NULL WHERE id = ?', [expiresAt, review.id]);
    console.log(`Akun uji ${email} aktif sampai ${formatLocal(expiresAt)}.`);
}

async function revoke(options) {
    const email = requireEmail(options);
    const { review } = await requireReviewAccount(email);
    await db.query('UPDATE patient_review_accounts SET revoked_at = NOW() WHERE id = ?', [review.id]);
    console.log(`Akun uji ${email} dicabut. Login dan pembayaran uji tidak bisa dipakai lagi.`);
}

async function status(options) {
    const params = [];
    let where = '';
    if (options.email) {
        const patient = await findPatientByEmail(db, requireEmail(options));
        if (!patient) throw new Error('Email tidak ditemukan');
        where = 'WHERE patient_id = ?';
        params.push(patient.id);
    }
    const [rows] = await db.query(`SELECT * FROM patient_review_accounts ${where} ORDER BY created_at DESC`, params);
    if (!rows.length) {
        console.log('Belum ada akun uji.');
        return;
    }
    for (const row of rows) {
        const [patients] = await db.query('SELECT email, full_name FROM patients WHERE id = ? LIMIT 1', [row.patient_id]);
        const patient = patients[0] || {};
        const active = !row.revoked_at && new Date(row.expires_at) > new Date();
        console.log(`${row.patient_id}\t${patient.email || '-'}\t${active ? 'AKTIF' : (row.revoked_at ? 'DICABUT' : 'BERAKHIR')}\tsampai ${formatLocal(row.expires_at)}\tlogin ${row.login_count}x, terakhir ${formatLocal(row.last_login_at)}`);
    }
}

const COMMANDS = { create, 'reset-password': resetPassword, extend, revoke, status };

async function main() {
    const { command, options } = parseArgs(process.argv.slice(2));
    const handler = COMMANDS[command];
    if (!handler) {
        console.log('Perintah: create | reset-password | extend | revoke | status (lihat komentar di atas file)');
        process.exitCode = 1;
        return;
    }
    await handler(options);
}

main()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
