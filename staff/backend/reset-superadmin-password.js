const bcrypt = require('bcryptjs');
const db = require('./db');

async function resetSuperadminPassword() {
    try {
        const email = 'nanda.arfianda@gmail.com';
        const newPassword = 'superadmin123';
        
        console.log('Resetting password for:', email);
        console.log('New password will be:', newPassword);
        
        // Generate hash
        const hash = await bcrypt.hash(newPassword, 10);
        console.log('Generated hash:', hash);
        
        // Update database
        const [result] = await db.query(
            'UPDATE users SET password_hash = ? WHERE email = ?',
            [hash, email]
        );
        
        console.log('Update result:', result);
        
        if (result.affectedRows > 0) {
            console.log('✅ Password updated successfully!');
            console.log('You can now login with:');
            console.log('  Email:', email);
            console.log('  Password:', newPassword);
        } else {
            console.log('❌ No user found with that email');
        }
        
        // Verify by selecting
        const [users] = await db.query(
            'SELECT id, email, role, role_id FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length > 0) {
            console.log('\nUser details:');
            console.log(users[0]);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

resetSuperadminPassword();
