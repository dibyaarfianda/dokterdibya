jest.mock('../../db', () => ({
    query: jest.fn()
}));

jest.mock('../../services/PatientPasswordService', () => ({
    hashAndUpdatePassword: jest.fn()
}));

jest.mock('../../utils/notification', () => ({
    sendPasswordResetEmail: jest.fn()
}));

const bcrypt = require('bcryptjs');
const db = require('../../db');
const PatientPasswordService = require('../../services/PatientPasswordService');
const notification = require('../../utils/notification');
const PatientPasswordResetService = require('../../services/PatientPasswordResetService');

describe('PatientPasswordResetService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('creates a canonical hashed reset token and sends the reset email', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 'P001', email: 'patient@example.com', full_name: 'Patient One' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        notification.sendPasswordResetEmail.mockResolvedValueOnce({ success: true });

        const result = await PatientPasswordResetService.requestReset({
            email: 'patient@example.com',
            revealMissingEmail: false
        });

        expect(result.success).toBe(true);
        expect(db.query).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('INSERT INTO patient_password_reset_tokens'),
            expect.arrayContaining(['P001', expect.any(String), expect.any(Date)])
        );
        expect(notification.sendPasswordResetEmail).toHaveBeenCalledWith(
            'patient@example.com',
            expect.any(String),
            expect.objectContaining({
                patientName: 'Patient One',
                email: 'patient@example.com'
            })
        );
    });

    it('resets password with a canonical token and marks all patient tokens used', async () => {
        const hash = await bcrypt.hash('ABC123', 4);
        db.query.mockResolvedValueOnce([
            [{ id: 5, patient_id: 'P001', token_hash: hash }]
        ]);
        PatientPasswordService.hashAndUpdatePassword.mockResolvedValueOnce(true);
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await PatientPasswordResetService.resetPassword({
            token: 'ABC123',
            newPassword: 'new-password-123'
        });

        expect(result.success).toBe(true);
        expect(PatientPasswordService.hashAndUpdatePassword).toHaveBeenCalledWith({
            patientId: 'P001',
            plainPassword: 'new-password-123'
        });
        expect(db.query).toHaveBeenLastCalledWith(
            'UPDATE patient_password_reset_tokens SET used = 1 WHERE patient_id = ?',
            ['P001']
        );
    });

    it('supports legacy patient reset tokens that were issued before canonicalization', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{
                id: 'P002',
                email: 'legacy@example.com',
                reset_token: '654321',
                reset_token_expires: new Date(Date.now() + 60000)
            }]]);
        PatientPasswordService.hashAndUpdatePassword.mockResolvedValueOnce(true);
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await PatientPasswordResetService.resetPassword({
            email: 'legacy@example.com',
            token: '654321',
            newPassword: 'new-password-123'
        });

        expect(result.success).toBe(true);
        expect(PatientPasswordService.hashAndUpdatePassword).toHaveBeenCalledWith({
            patientId: 'P002',
            plainPassword: 'new-password-123'
        });
        expect(db.query).toHaveBeenLastCalledWith(
            'UPDATE patients SET reset_token = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = ?',
            ['P002']
        );
    });
});
