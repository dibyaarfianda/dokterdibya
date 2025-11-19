// Migration script to update user IDs
const db = require('../db');
const { generateStaffID, generatePatientID } = require('../utils/idGenerator');
const logger = require('../utils/logger');

async function migrateUserIDs() {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        console.log('Starting user ID migration...');

        // Step 1: Add new columns if they don't exist
        console.log('Step 1: Adding new columns...');
        await connection.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS new_id VARCHAR(10) UNIQUE,
            ADD COLUMN IF NOT EXISTS user_type ENUM('staff', 'patient') DEFAULT 'patient',
            ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT FALSE,
            ADD INDEX IF NOT EXISTS idx_new_id (new_id),
            ADD INDEX IF NOT EXISTS idx_user_type (user_type)
        `);

        // Step 2: Get all existing users
        console.log('Step 2: Fetching existing users...');
        const [users] = await connection.query(`
            SELECT id, email, role, name
            FROM users
            WHERE new_id IS NULL
        `);

        console.log(`Found ${users.length} users to migrate`);

        // Step 3: Generate new IDs for each user
        for (const user of users) {
            let newId;
            let userType;
            let isSuperadmin = false;

            // Determine if user is staff or patient based on email/role
            const isStaff =
                user.role !== null ||
                user.email?.includes('@dokterdibya') ||
                user.email?.includes('@staff') ||
                user.email?.includes('admin') ||
                user.email?.includes('dr.') ||
                user.email?.includes('dokter');

            if (isStaff) {
                // Generate staff ID (10 letters)
                let attempts = 0;
                do {
                    newId = generateStaffID();
                    const [existing] = await connection.query(
                        'SELECT id FROM users WHERE new_id = ?',
                        [newId]
                    );
                    if (existing.length === 0) break;
                    attempts++;
                } while (attempts < 100);

                userType = 'staff';
                isSuperadmin = true; // Set all staff as superadmin for now

                console.log(`Migrating staff: ${user.email} (${user.id}) -> ${newId}`);
            } else {
                // Generate patient ID (6 numbers)
                let attempts = 0;
                do {
                    newId = generatePatientID();
                    const [existing] = await connection.query(
                        'SELECT id FROM users WHERE new_id = ?',
                        [newId]
                    );
                    if (existing.length === 0) break;
                    attempts++;
                } while (attempts < 100);

                userType = 'patient';

                console.log(`Migrating patient: ${user.email || user.name} (${user.id}) -> ${newId}`);
            }

            // Update user with new ID
            await connection.query(
                `UPDATE users
                 SET new_id = ?,
                     user_type = ?,
                     is_superadmin = ?,
                     role = CASE WHEN ? = TRUE THEN COALESCE(role, 'superadmin') ELSE role END
                 WHERE id = ?`,
                [newId, userType, isSuperadmin, isSuperadmin, user.id]
            );
        }

        // Step 4: Update patients table
        console.log('Step 4: Updating patients table...');
        await connection.query(`
            ALTER TABLE patients
            ADD COLUMN IF NOT EXISTS new_id VARCHAR(6) UNIQUE,
            ADD INDEX IF NOT EXISTS idx_patients_new_id (new_id)
        `);

        // Generate new IDs for patients
        const [patients] = await connection.query(`
            SELECT id
            FROM patients
            WHERE new_id IS NULL
        `);

        console.log(`Found ${patients.length} patients to migrate`);

        for (const patient of patients) {
            let newId;
            let attempts = 0;
            do {
                newId = generatePatientID();
                const [existing] = await connection.query(
                    'SELECT id FROM patients WHERE new_id = ?',
                    [newId]
                );
                if (existing.length === 0) break;
                attempts++;
            } while (attempts < 100);

            await connection.query(
                'UPDATE patients SET new_id = ? WHERE id = ?',
                [newId, patient.id]
            );

            console.log(`Migrated patient ID: ${patient.id} -> ${newId}`);
        }

        await connection.commit();
        console.log('Migration completed successfully!');

        // Display summary
        const [staffCount] = await connection.query(
            "SELECT COUNT(*) as count FROM users WHERE user_type = 'staff'"
        );
        const [patientUserCount] = await connection.query(
            "SELECT COUNT(*) as count FROM users WHERE user_type = 'patient'"
        );
        const [patientCount] = await connection.query(
            "SELECT COUNT(*) as count FROM patients WHERE new_id IS NOT NULL"
        );

        console.log('\n=== Migration Summary ===');
        console.log(`Staff users: ${staffCount[0].count}`);
        console.log(`Patient users: ${patientUserCount[0].count}`);
        console.log(`Patients: ${patientCount[0].count}`);

    } catch (error) {
        await connection.rollback();
        console.error('Migration failed:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// Run migration if executed directly
if (require.main === module) {
    migrateUserIDs()
        .then(() => {
            console.log('Migration script completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateUserIDs };