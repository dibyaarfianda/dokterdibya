// Reset all user passwords to "123456"
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const dbConfig = {
    host: 'localhost',
    user: 'dibyaapp',
    password: process.env.DB_PASSWORD,
    database: 'dibyaklinik'
};

async function resetPasswords() {
    console.log('🔐 Resetting all passwords to "123456"...\n');
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to MariaDB\n');
        
        // Hash the new password
        const passwordHash = await bcrypt.hash('123456', 10);
        console.log('✓ Password hashed\n');
        
        // Update all users
        const [result] = await connection.query('UPDATE users SET password_hash = ?', [passwordHash]);
        
        console.log(`✅ Updated ${result.affectedRows} users with password "123456"\n`);
        
        await connection.end();
        console.log('🎉 All passwords reset successfully!\n');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

resetPasswords();

