const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Load environment variables
require('dotenv').config();

const STORAGE_DIR = path.join(__dirname, 'logs', 'patient-intake');

function deriveEncryptionKey() {
    const secret = process.env.INTAKE_ENCRYPTION_KEY;
    if (!secret) return null;
    return crypto.createHash('sha256').update(secret).digest();
}

async function main() {
    const files = await fs.readdir(STORAGE_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    console.log(`Found ${jsonFiles.length} intake files\n`);
    
    for (const file of jsonFiles) {
        const filePath = path.join(STORAGE_DIR, file);
        const content = await fs.readFile(filePath, 'utf8');
        const record = JSON.parse(content);
        
        let phone = 'N/A';
        
        if (record.encrypted) {
            try {
                const key = deriveEncryptionKey();
                if (key) {
                    const decipher = crypto.createDecipheriv(
                        record.encrypted.algorithm || 'aes-256-gcm',
                        key,
                        Buffer.from(record.encrypted.iv, 'base64')
                    );
                    decipher.setAuthTag(Buffer.from(record.encrypted.authTag, 'base64'));
                    let decrypted = decipher.update(record.encrypted.data, 'base64', 'utf8');
                    decrypted += decipher.final('utf8');
                    const decryptedRecord = JSON.parse(decrypted);
                    phone = decryptedRecord.payload?.phone || decryptedRecord.summary?.phone || 'N/A';
                }
            } catch (error) {
                phone = 'DECRYPT ERROR';
            }
        } else {
            phone = record.payload?.phone || record.summary?.phone || 'N/A';
        }
        
        const normalized = phone !== 'N/A' && phone !== 'DECRYPT ERROR' 
            ? phone.replace(/\D/g, '').slice(-10) 
            : 'N/A';
        
        console.log(`File: ${file}`);
        console.log(`  Status: ${record.status}`);
        console.log(`  Phone: ${phone}`);
        console.log(`  Last 10 digits: ${normalized}`);
        console.log('');
    }
    
    console.log('\nTarget user phone: 082327545665');
    console.log('Last 10 digits: 2327545665');
}

main().catch(console.error);
