'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('Sunday Clinic closing payment correctness', () => {
    test('online payment completion persists the billing paid timestamp and actor', () => {
        const paymentRoute = readRepoFile('staff', 'backend', 'routes', 'billing-payment.js');

        expect(paymentRoute).toMatch(
            /UPDATE\s+sunday_clinic_billings[\s\S]*SET\s+status\s*=\s*'paid'[\s\S]*paid_at\s*=\s*\?[\s\S]*paid_by\s*=\s*\?/i
        );
        expect(paymentRoute).toContain("const paidBy = webhookData.confirmed_by || 'Xendit';");
        expect(paymentRoute).not.toMatch(/WHERE\s+id\s*=\s*\?[\s\S]*AND\s+status\s*<>\s*'paid'/i);
    });

    test('all financial mutations use the shared closing guard while read and print routes remain open', () => {
        const billingRouter = readRepoFile('staff', 'backend', 'routes', 'sunday-clinic', 'billing.js');
        const recordsRouter = readRepoFile('staff', 'backend', 'routes', 'sunday-clinic', 'records.js');
        const walkInRouter = readRepoFile('staff', 'backend', 'routes', 'sunday-clinic', 'visit-walk-in.js');
        const appointmentRouter = readRepoFile('staff', 'backend', 'routes', 'sunday-appointments.js');
        const medicalImportRouter = readRepoFile('staff', 'backend', 'routes', 'medical-import.js');
        const usgInboxProcessor = readRepoFile('staff', 'backend', 'scripts', 'usg-inbox-processor.js');
        const paymentRouter = readRepoFile('staff', 'backend', 'routes', 'billing-payment.js');
        const patientPaymentRouter = readRepoFile('staff', 'backend', 'routes', 'patient-billing.js');

        expect(billingRouter).toContain("require('../../services/SundayClinicClosingService')");
        expect(billingRouter).toContain('acquireSundayClinicAccountingDateGuard');
        expect(billingRouter).toContain('requireOpenAccountingDate');
        expect(paymentRouter).toContain("require('../services/SundayClinicClosingService')");
        expect(paymentRouter).toContain('acquireSundayClinicAccountingDateGuard');
        expect(paymentRouter).toContain('requireOpenAccountingDate');
        expect(patientPaymentRouter).toContain("require('../services/SundayClinicClosingService')");
        expect(patientPaymentRouter).toContain('acquireSundayClinicAccountingDateGuard');

        expect(billingRouter).toMatch(/router\.post\('\/billing\/:mrId',\s*verifyToken,\s*requireOpenAccountingDate,/);
        expect(billingRouter).toMatch(/router\.post\('\/billing\/:mrId\/additional',\s*verifyToken,\s*requireOpenAccountingDate,/);
        expect(billingRouter).toMatch(/router\.post\('\/billing\/:mrId\/mark-paid',\s*verifyToken,\s*requireOpenAccountingDate,/);
        expect(paymentRouter).toMatch(/router\.post\('\/:mrId\/create-payment',\s*verifyToken,\s*requireOpenAccountingDate,/);
        expect(paymentRouter).toMatch(/router\.post\('\/:mrId\/create-card-charge',\s*verifyToken,\s*requireOpenAccountingDate,/);
        expect(patientPaymentRouter).toMatch(/router\.post\('\/:billingId\/create-payment',\s*requireOpenAccountingDate,/);
        expect(patientPaymentRouter).toMatch(/router\.post\('\/:billingId\/create-insurance-payment',\s*requireOpenAccountingDate,/);
        expect(recordsRouter).toMatch(/router\.delete\('\/records\/:mrId',\s*verifyToken,\s*requireSuperadmin,\s*requireOpenAccountingDate,/);
        expect(walkInRouter).toMatch(/router\.post\('\/start-walk-in',\s*verifyToken,\s*requireOpenAccountingDate,/);
        expect(appointmentRouter).toMatch(/router\.post\('\/:id\/start-clinic-record',\s*verifyToken,\s*requireOpenSundayClinicAccountingDate,/);
        expect(patientPaymentRouter).toContain('patientId: req.user.id');
        expect(paymentRouter).toContain("type: 'billing_updated'");
        expect(paymentRouter).toContain("broadcastAccountingRefresh(mrId, 'payment_created'");
        expect(paymentRouter).toContain("broadcastAccountingRefresh(mrId, 'payment_cancelled'");
        expect(patientPaymentRouter).toContain("broadcastAccountingRefresh(mrId, 'patient_payment_created'");
        expect(medicalImportRouter).toMatch(/router\.post\('\/api\/medical-import\/save',\s*verifyToken,\s*requireOpenAccountingDateForImport,/);
        expect(usgInboxProcessor).toContain("hospital === 'klinik_private'");
        expect(usgInboxProcessor).toContain('acquireSundayClinicAccountingDateGuard(db, { clinicDate: recordDate })');

        expect(billingRouter).toMatch(/router\.get\('\/billing\/:mrId',\s*verifyToken,\s*handlers\.getBillingByMrId\)/);
        expect(billingRouter).toMatch(/router\.post\('\/billing\/:mrId\/print-invoice',\s*verifyToken,\s*broadcastSuccessfulBillingMutation,/);
    });

    test('backfill defaults to dry-run and applies only one unambiguous evidence source', () => {
        const backfill = require('../../scripts/backfill-sunday-clinic-paid-metadata');

        expect(backfill.parseArguments([])).toEqual({ apply: false });
        expect(backfill.parseArguments(['--apply'])).toEqual({ apply: true });

        expect(backfill.deriveBackfillDecision({
            paid_at: null,
            paid_by: null,
            payment_count: 1,
            payment_paid_at: '2026-07-19 13:10:00',
            payment_method: 'qris',
            audit_count: 0
        })).toEqual(expect.objectContaining({
            canApply: true,
            source: 'online_payment',
            paidAt: '2026-07-19 13:10:00',
            paidBy: 'Xendit'
        }));

        expect(backfill.deriveBackfillDecision({
            paid_at: null,
            paid_by: null,
            payment_count: 0,
            audit_count: 1,
            audit_created_at: '2026-07-19 13:15:00',
            audit_actor_name: 'Dokter Dibya'
        })).toEqual(expect.objectContaining({
            canApply: true,
            source: 'billing_audit',
            paidAt: '2026-07-19 13:15:00',
            paidBy: 'Dokter Dibya'
        }));

        expect(backfill.deriveBackfillDecision({
            paid_at: null,
            paid_by: null,
            payment_count: 2,
            payment_paid_at: '2026-07-19 13:10:00',
            audit_count: 0
        })).toEqual(expect.objectContaining({
            canApply: false,
            reason: 'multiple_online_payments'
        }));

        expect(backfill.deriveBackfillDecision({
            paid_at: null,
            paid_by: null,
            payment_count: 1,
            payment_paid_at: '2026-07-19 13:10:00',
            audit_count: 1,
            audit_created_at: '2026-07-19 13:15:00',
            audit_actor_name: 'Dokter Dibya'
        })).toEqual(expect.objectContaining({
            canApply: false,
            reason: 'conflicting_evidence_sources'
        }));
    });

    test('backfill dry-run never writes and apply skips ambiguous rows', async () => {
        const backfill = require('../../scripts/backfill-sunday-clinic-paid-metadata');
        const candidates = [
            {
                id: 1,
                mr_id: 'DRD0001',
                paid_at: null,
                paid_by: null,
                payment_count: 1,
                payment_paid_at: '2026-07-19 13:10:00',
                audit_count: 0
            },
            {
                id: 2,
                mr_id: 'DRD0002',
                paid_at: null,
                paid_by: null,
                payment_count: 2,
                payment_paid_at: '2026-07-19 13:20:00',
                audit_count: 0
            }
        ];
        const dryRunClient = {
            query: jest.fn().mockResolvedValue([candidates]),
            getConnection: jest.fn()
        };

        const dryRun = await backfill.runBackfill({ client: dryRunClient });

        expect(dryRun).toEqual(expect.objectContaining({
            mode: 'dry-run',
            candidateCount: 2,
            applicableCount: 1,
            appliedCount: 0,
            skippedCount: 1
        }));
        expect(dryRunClient.getConnection).not.toHaveBeenCalled();
        expect(dryRunClient.query).toHaveBeenCalledTimes(1);

        const connection = {
            beginTransaction: jest.fn(),
            query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        };
        const applyClient = {
            query: jest.fn().mockResolvedValue([candidates]),
            getConnection: jest.fn().mockResolvedValue(connection)
        };

        const applied = await backfill.runBackfill({ client: applyClient, apply: true });

        expect(applied.applicableCount).toBe(1);
        expect(applied.appliedCount).toBe(1);
        expect(connection.query).toHaveBeenCalledTimes(2);
        expect(connection.query.mock.calls[0][1]).toEqual([
            '2026-07-19 13:10:00',
            'Xendit',
            1
        ]);
        expect(connection.query.mock.calls[1][0]).toContain('billing_paid_metadata_backfilled');
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });
});
