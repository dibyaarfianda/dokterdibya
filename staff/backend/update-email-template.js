/**
 * Script to update password reset email template
 */

require('dotenv').config();
const db = require('./db');

async function updateTemplate() {
    const newSubject = 'Reset Password - dokterDIBYA';
    const newBody = `Halo {user_name},

Kami menerima permintaan untuk mereset password akun Anda di dokterDIBYA.

📧 KODE RESET PASSWORD ANDA:
{reset_code}

🔗 Atau klik tautan berikut untuk langsung mengatur ulang password:
{reset_link}

⏰ Kode ini berlaku selama 1 jam.

Jika Anda tidak meminta reset password, abaikan email ini dan password Anda akan tetap aman.

Salam hangat,
Tim {clinic_name}`;

    try {
        console.log('Updating password reset email template...');

        await db.query(
            `INSERT INTO email_templates (template_key, subject, body, updated_by)
             VALUES ('password_reset', ?, ?, NULL)
             ON DUPLICATE KEY UPDATE subject = VALUES(subject), body = VALUES(body), updated_at = NOW()`,
            [newSubject, newBody]
        );

        console.log('✅ Email template updated successfully!');
        console.log('\nNew template:');
        console.log('Subject:', newSubject);
        console.log('\nBody:');
        console.log(newBody);

        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to update template:', error.message);
        process.exit(1);
    }
}

updateTemplate();
