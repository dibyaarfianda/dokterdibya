'use strict';

// Tahap 2: deleting a record or a patient must not erase prepay money history.
const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../../services');
const read = file => fs.readFileSync(path.join(servicesDir, file), 'utf8').replace(/\r\n/g, '\n');
const BLOCKED = 'Tagihan ini dibayar dengan saldo di muka; tidak dapat dihapus.';

test('every deletion path checks saldo right after the cancelled-billing guard', () => {
    const records = read('sunday-clinic/records.js');
    expect(records).toMatch(/assertNoCancelledBillingEvidence\(connection, \{ mrId \}\);\s*\n\s*await assertNoPrepaySaldoEvidence\(connection, \{ mrId \}\);/);
    expect(records).toContain("require('../PatientCreditLedger')");

    const patients = read('patientDeletion.js');
    const guarded = patients.match(/assertNoCancelledBillingEvidence\(connection, \{ patientId \}\);\s*\n\s*await assertNoPrepaySaldoEvidence\(connection, \{ patientId \}\);/g) || [];
    expect(guarded).toHaveLength(2);
});

test('a patient with live saldo history cannot be deleted', async () => {
    const { deletePatientWithRelationsOnConnection } = require('../../services/patientDeletion');
    const connection = {
        query: jest.fn(async sql => {
            const query = String(sql).replace(/\s+/g, ' ');
            if (query.includes('FROM patients p LEFT JOIN users u')) return [[{ id: 'P1', full_name: 'Pasien Uji', email: null, user_id: 'P1' }]];
            if (query.includes('FROM patient_credit_ledger') && query.includes("gateway_mode = 'live'")) return [[{ id: 9 }]];
            if (query.startsWith('DELETE')) throw new Error(`must not delete: ${query}`);
            return [[]];
        })
    };
    await expect(deletePatientWithRelationsOnConnection(connection, 'P1')).rejects.toMatchObject({ statusCode: 409, message: BLOCKED });
});

test('sandbox saldo rows go with the deleted patient', () => {
    const patients = read('patientDeletion.js');
    expect(patients).toContain("DELETE FROM patient_credit_ledger WHERE patient_id = ? AND gateway_mode = 'sandbox'");
});
