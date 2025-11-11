// Reset single user password to "superadmin123"
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const dbConfig = {
    host: 'localhost',
    user: 'dibyaapp',
    password: 'DibyaKlinik2024!',
    database: 'dibyaklinik'
};

async function resetPassword() {
    const email = 'nanda.arfianda@gmail.com';
    const newPassword = 'superadmin123';
    
    console.log(`🔐 Resetting password for ${email}...\n`);
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to MariaDB\n');
        
        // Hash the new password
        const passwordHash = await bcrypt.hash(newPassword, 10);
        console.log('✓ Password hashed\n');
        
        // Update user
        const [result] = await connection.query(
            'UPDATE users SET password_hash = ? WHERE email = ?',
            [passwordHash, email]
        );
        
        if (result.affectedRows === 0) {
            console.log(`⚠️ User with email ${email} not found\n`);
        } else {
            console.log(`✅ Password reset for ${email}\n`);
        }
        
        await connection.end();
        console.log('🎉 Done!\n');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

resetPassword();

