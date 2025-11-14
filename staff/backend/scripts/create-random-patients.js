#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const FIRST_NAMES = [
    'Adi', 'Bima', 'Cahya', 'Dian', 'Eka', 'Fajar', 'Gita', 'Hani', 'Indra', 'Jaya',
    'Kirana', 'Laras', 'Maya', 'Nanda', 'Oka', 'Putri', 'Raka', 'Sari', 'Tirta', 'Wira'
];

const LAST_NAMES = [
    'Santoso', 'Wijaya', 'Pratama', 'Saputra', 'Setiawan', 'Nugraha', 'Kusuma', 'Anggraini', 'Mahendra', 'Utami'
];

const PATIENT_COUNT = 5;

function randomItem(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function randomPhone() {
    const suffix = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
    return `+628${suffix}`;
}

function randomBirthDate() {
    const start = new Date('1980-01-01');
    const end = new Date('2005-12-31');
    const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return date;
}

function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

async function getStartingId() {
    const [rows] = await db.query(
        "SELECT MAX(CAST(id AS UNSIGNED)) AS maxId FROM patients WHERE id REGEXP '^[0-9]+$'"
    );
    const currentMax = rows[0]?.maxId || 0;
    return Number(currentMax);
}

async function insertPatient(idNumber) {
    const birthDate = randomBirthDate();
    const record = {
        id: String(idNumber).padStart(5, '0'),
        full_name: `${randomItem(FIRST_NAMES)} ${randomItem(LAST_NAMES)}`,
        whatsapp: randomPhone(),
        birth_date: formatDate(birthDate),
        age: calculateAge(birthDate),
        patient_type: 'walk-in'
    };

    await db.query(
        'INSERT INTO patients (id, full_name, whatsapp, birth_date, age, patient_type, status, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
        [
            record.id,
            record.full_name,
            record.whatsapp,
            record.birth_date,
            record.age,
            record.patient_type,
            'active'
        ]
    );

    return record;
}

async function main() {
    try {
        const startId = await getStartingId();
        const created = [];
        for (let i = 1; i <= PATIENT_COUNT; i++) {
            const record = await insertPatient(startId + i);
            created.push(record);
            console.log(`✅ Created patient ${record.full_name} (ID ${record.id})`);
        }
        console.log('\nFive random patients inserted successfully.');
        console.table(created);
    } catch (error) {
        console.error('Failed to create patients:', error.message);
        process.exitCode = 1;
    } finally {
        if (db && db.end) {
            await db.end();
        }
    }
}

main();
