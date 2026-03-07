/**
 * Integration tests for async PDF queue service.
 * Tests job lifecycle: enqueue → process → complete/fail.
 */

const pdfQueue = require('../../services/pdfQueue');

// Mock the PDF generator and R2 storage to avoid real file I/O
jest.mock('../../utils/pdf-generator', () => {
    return class MockPDFGenerator {
        async generateInvoice(billing, patient, record) {
            return { r2Key: 'invoices/test/mock.pdf', filename: 'mock.pdf', size: 1234 };
        }
        async generateEtiket(billing, patient, record) {
            return { r2Key: 'etikets/test/mock.pdf', filename: 'mock.pdf', size: 567 };
        }
        async generateResumeMedis(resume, patient, record) {
            return { r2Key: 'resume/test/mock.pdf', filename: 'mock.pdf', size: 890 };
        }
    };
});

jest.mock('../../services/r2Storage', () => ({
    getSignedDownloadUrl: jest.fn().mockResolvedValue('https://r2.example.com/signed-url'),
}));

describe('PDF Queue', () => {
    it('enqueues a job and returns jobId', () => {
        const result = pdfQueue.enqueue('invoice', {
            billingData: { items: [] },
            patientData: { full_name: 'Test' },
            recordData: { mrId: 'DRD0001' },
        });

        expect(result.jobId).toBeDefined();
        expect(result.status).toBe('queued');
    });

    it('processes a job to completion', async () => {
        const result = pdfQueue.enqueue('invoice', {
            billingData: { items: [] },
            patientData: { full_name: 'Test' },
            recordData: { mrId: 'DRD0002' },
        });

        // Wait for async processing
        await new Promise(resolve => setTimeout(resolve, 200));

        const job = pdfQueue.getJob(result.jobId);
        expect(job).not.toBeNull();
        expect(job.status).toBe('completed');
        expect(job.result).toBeDefined();
        expect(job.result.r2Key).toBe('invoices/test/mock.pdf');
        expect(job.result.downloadUrl).toBe('https://r2.example.com/signed-url');
    });

    it('supports etiket type', async () => {
        const result = pdfQueue.enqueue('etiket', {
            billingData: { items: [] },
            patientData: { full_name: 'Test' },
            recordData: { mrId: 'DRD0003' },
        });

        await new Promise(resolve => setTimeout(resolve, 200));

        const job = pdfQueue.getJob(result.jobId);
        expect(job.status).toBe('completed');
        expect(job.result.r2Key).toBe('etikets/test/mock.pdf');
    });

    it('supports resume_medis type', async () => {
        const result = pdfQueue.enqueue('resume_medis', {
            billingData: {},
            patientData: { full_name: 'Test' },
            recordData: { mrId: 'DRD0004' },
            resumeData: { sections: [] },
        });

        await new Promise(resolve => setTimeout(resolve, 200));

        const job = pdfQueue.getJob(result.jobId);
        expect(job.status).toBe('completed');
    });

    it('returns null for unknown job ID', () => {
        const job = pdfQueue.getJob('nonexistent-id');
        expect(job).toBeNull();
    });

    it('returns accurate stats', () => {
        const stats = pdfQueue.getStats();
        expect(typeof stats.queued).toBe('number');
        expect(typeof stats.processing).toBe('number');
        expect(typeof stats.completed).toBe('number');
        expect(typeof stats.failed).toBe('number');
        expect(typeof stats.activeWorkers).toBe('number');
        expect(stats.maxConcurrent).toBe(2);
    });
});
