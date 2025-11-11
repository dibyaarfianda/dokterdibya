// Import users from CSV to MariaDB (run on VPS)
// Run: node import-users-on-vps.js

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');

// Database config (localhost on VPS)
const dbConfig = {
    host: 'localhost',
    user: 'dibyaapp',
    password: 'DibyaKlinik2024!',
    database: 'dibyaklinik'
};

async function importUsers() {
    console.log('🔐 Starting user import from CSV...\n');
    
    try {
        // Read CSV file
        const csvPath = '/tmp/users.csv';
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        
        // Parse CSV (semicolon delimiter)
        const lines = csvContent.split('\n').filter(line => line.trim() && !line.match(/^;+$/));
        const rawHeaders = lines[0].split(';');
        
        // Map headers: UID;email;name;password;role
        const users = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(';');
            if (values.length < 4) continue; // Skip incomplete lines
            
            const user = {
                UID: values[0]?.trim() || '',
                email: values[1]?.trim() || '',
                name: values[2]?.trim() || '',
                password: values[3]?.trim() || '',
                role: values[4]?.trim() || 'user'
            };
            
            if (user.email && user.password) users.push(user);
        }
        
        console.log(`📦 Found ${users.length} users in CSV\n`);
        
        // Connect to database
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to MariaDB\n');
        
        let inserted = 0;
        let updated = 0;
        let errors = 0;
        
        for (const user of users) {
            try {
                const { UID, email, name, password, role } = user;
                
                if (!email || !password) {
                    console.log(`⏭️  Skipping user: missing email or password`);
                    errors++;
                    continue;
                }
                
                // Hash password
                const passwordHash = await bcrypt.hash(password, 10);
                
                // Check if user exists
                const [existing] = await connection.query(
                    'SELECT id FROM users WHERE email = ?',
                    [email]
                );
                
                if (existing.length > 0) {
                    // Update existing user
                    await connection.query(
                        'UPDATE users SET name = ?, password_hash = ?, role = ?, display_name = ? WHERE email = ?',
                        [name || email, passwordHash, role || 'user', name || email, email]
                    );
                    console.log(`✅ Updated: ${email} (${name}) - Role: ${role || 'user'}`);
                    updated++;
                } else {
                    // Insert new user (use Firebase UID as id)
                    await connection.query(
                        'INSERT INTO users (id, email, name, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?, ?)',
                        [UID || Date.now().toString(), email, name || email, passwordHash, name || email, role || 'user']
                    );
                    console.log(`✅ Inserted: ${email} (${name}) - Role: ${role || 'user'}`);
                    inserted++;
                }
                
            } catch (err) {
                console.error(`❌ Error processing ${user.email}:`, err.message);
                errors++;
            }
        }
        
        await connection.end();
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 IMPORT SUMMARY');
        console.log('='.repeat(50));
        console.log(`✅ Inserted: ${inserted}`);
        console.log(`🔄 Updated: ${updated}`);
        console.log(`❌ Errors: ${errors}`);
        console.log(`📦 Total processed: ${users.length}`);
        console.log('='.repeat(50));
        console.log('\n🎉 User import complete!\n');
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run import
importUsers().catch(console.error);

