# Dual-Table Architecture Documentation

## Overview

Sistem database menggunakan **dual-table architecture** untuk memisahkan concerns antara autentikasi dan data medis.

## Architecture Pattern: Separation of Concerns

```
┌─────────────────────────────────────────────────────────────┐
│                     DUAL TABLE SYSTEM                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐      ┌──────────────────────┐   │
│  │   USERS TABLE        │      │   PATIENTS TABLE      │   │
│  │   (Authentication)   │      │   (Medical Records)   │   │
│  ├──────────────────────┤      ├──────────────────────┤   │
│  │ - new_id (PK)       │◄─────┤ - id (PK)            │   │
│  │ - email             │  FK  │ - email              │   │
│  │ - password_hash     │      │ - full_name          │   │
│  │ - user_type         │      │ - phone              │   │
│  │ - role              │      │ - birth_date         │   │
│  │ - is_active         │      │ - medical_history    │   │
│  │ - is_superadmin     │      │ - allergy            │   │
│  └──────────────────────┘      │ - visit_count        │   │
│                                 │ - last_visit         │   │
│                                 └──────────────────────┘   │
│                                                              │
│  Same ID: P2025001 = P2025001                               │
└─────────────────────────────────────────────────────────────┘
```

## Table Responsibilities

### 1. `users` Table (Authentication Layer)
**Purpose**: Menyimpan data autentikasi untuk SEMUA user (staff + patient)

**Columns**:
- `new_id`: Primary key (format: P2025001 untuk patient, atau random untuk staff)
- `email`: Unique email address
- `password_hash`: Bcrypt hashed password
- `user_type`: enum('staff', 'patient')
- `role`: User role (admin, doctor, nurse, cashier, user, etc.)
- `is_active`: Account status
- `is_superadmin`: Superadmin flag

**Used for**:
- Login (`POST /api/auth/login`)
- JWT token generation
- Permission checking
- Role-based access control

### 2. `patients` Table (Medical Data Layer)
**Purpose**: Menyimpan data medis dan informasi pasien

**Columns**:
- `id`: Primary key (foreign key to users.new_id)
- `full_name`: Patient's full name
- `email`: Contact email (duplicate from users)
- `phone`, `whatsapp`: Contact numbers
- `birth_date`, `age`: Demographics
- `medical_history`, `allergy`: Medical information
- `visit_count`, `last_visit`: Visit tracking
- `patient_type`: enum('walk-in', 'web')
- `status`: enum('active', 'inactive', 'suspended')

**Used for**:
- Medical records
- Appointment management
- Billing and invoices
- Clinical history
- USG records

## Registration Flow

### Step 1: Email Registration
```javascript
POST /api/auth/register
{
  "email": "patient@example.com"
}
```
- Generates OTP code
- Stores in `email_verifications` table
- Sends verification email

### Step 2: Email Verification
```javascript
POST /api/auth/verify-email
{
  "email": "patient@example.com",
  "code": "123456",
  "verification_token": "abc123..."
}
```
- Validates OTP code
- Returns `verified_token`

### Step 3: Password Setup (DUAL INSERT)
```javascript
POST /api/auth/set-password
{
  "email": "patient@example.com",
  "password": "securePassword123",
  "verified_token": "xyz789..."
}
```

**Backend Operation** (auth.js:918-930):
```javascript
// 1. Generate patient ID
const userId = `P${year}${String(nextNumber).padStart(3, '0')}`; // e.g., P2025001

// 2. Insert into USERS table (authentication)
await db.query(
    `INSERT INTO users (new_id, email, password_hash, user_type, role, is_active)
     VALUES (?, ?, ?, 'patient', 'user', 1)`,
    [userId, email, passwordHash]
);

// 3. Insert into PATIENTS table (medical records)
await db.query(
    `INSERT INTO patients (id, email, full_name, status)
     VALUES (?, ?, ?, 'active')`,
    [userId, email, 'New Patient']
);
```

**Result**: Two records with same ID (P2025001) created in both tables.

## Deletion Strategy

### ❌ WRONG: Single Table Delete
```javascript
// This leaves orphaned records!
DELETE FROM users WHERE email = 'patient@example.com';
// patients table still has the record → DATA INCONSISTENCY
```

### ✅ CORRECT: Dual Table Delete

#### Option 1: By Patient ID (with all relations)
```javascript
const { deletePatientWithRelations } = require('../services/patientDeletion');

const result = await deletePatientWithRelations('P2025001');
```

This deletes from:
1. All related tables (billings, medical_records, visits, appointments, etc.)
2. `patients` table
3. `users` table

#### Option 2: By Email (cleanup only)
```javascript
const { deletePatientByEmail } = require('../services/patientDeletion');

const result = await deletePatientByEmail('patient@example.com');
```

This deletes from:
1. `users` table
2. `patients` table
3. `email_verifications` table
4. `patient_password_reset_tokens` table

### API Endpoints

#### DELETE /api/admin/web-patients/:id
**Purpose**: Delete patient with all medical relations
**Access**: Admin, Superadmin
**Usage**:
```bash
curl -X DELETE http://localhost:3000/api/admin/web-patients/P2025001 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### DELETE /api/admin/cleanup-email/:email
**Purpose**: Clean up patient by email (dual-table aware)
**Access**: Superadmin only
**Usage**:
```bash
curl -X DELETE http://localhost:3000/api/admin/cleanup-email/patient@example.com \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Query Patterns

### Login Query (Single Table)
```sql
SELECT
    u.new_id,
    u.email,
    u.password_hash,
    u.user_type,
    u.role
FROM users u
WHERE u.email = ?;
```

### Get Patient Detail (Join Both Tables)
```sql
SELECT
    p.*,
    u.role,
    u.is_active,
    u.user_type
FROM patients p
LEFT JOIN users u ON u.new_id = p.id
WHERE p.id = ?;
```

### Find Patient by Email (Either Table)
```sql
SELECT p.id FROM patients p WHERE p.email = ?
UNION
SELECT u.new_id as id FROM users u
WHERE u.email = ? AND u.user_type = 'patient';
```

## Benefits of Dual-Table System

### ✅ Advantages
1. **Separation of Concerns**: Auth logic separated from medical data
2. **Security**: Password hashes isolated from medical records
3. **Flexibility**: Can add staff users without medical data
4. **Performance**: Auth queries don't need medical columns
5. **Compliance**: Easier to manage PHI (Protected Health Information)

### ⚠️ Considerations
1. **Must maintain consistency**: Always insert/delete from BOTH tables
2. **Transaction required**: Use transactions for atomic operations
3. **Join queries needed**: Some operations require joining tables
4. **Duplicate email**: Email exists in both tables (trade-off for performance)

## Database Constraints

### Foreign Key Relationships
```sql
-- patients.id references users.new_id (logical, not enforced)
-- This allows for:
-- 1. Walk-in patients without user accounts
-- 2. Web patients with user accounts
```

### Unique Constraints
```sql
users.email: UNIQUE
users.new_id: PRIMARY KEY

patients.id: PRIMARY KEY
patients.email: UNIQUE (allows NULL for walk-in patients)
```

## Common Operations

### Create Web Patient
```javascript
// 1. Create user account
const userId = generatePatientId(); // P2025001
await db.query('INSERT INTO users (new_id, email, password_hash, user_type) VALUES (?, ?, ?, "patient")',
    [userId, email, hash]);

// 2. Create patient record
await db.query('INSERT INTO patients (id, email, full_name) VALUES (?, ?, ?)',
    [userId, email, name]);
```

### Update Patient Info
```javascript
// Authentication info (email, password)
await db.query('UPDATE users SET email = ? WHERE new_id = ?', [newEmail, patientId]);

// Medical/personal info (name, phone, etc.)
await db.query('UPDATE patients SET full_name = ?, phone = ? WHERE id = ?',
    [name, phone, patientId]);
```

### Delete Patient (Complete Cleanup)
```javascript
const connection = await db.getConnection();
await connection.beginTransaction();

try {
    // 1. Delete all related records (billings, records, visits, etc.)
    // 2. Delete from patients table
    await connection.query('DELETE FROM patients WHERE id = ?', [patientId]);

    // 3. Delete from users table
    await connection.query('DELETE FROM users WHERE new_id = ?', [patientId]);

    await connection.commit();
} catch (error) {
    await connection.rollback();
    throw error;
}
```

## Troubleshooting

### Issue: Orphaned Records
**Symptom**: User exists in `users` table but not in `patients` table
**Solution**: Use `deletePatientByEmail()` or manual cleanup

### Issue: Duplicate Email Registration Fails
**Symptom**: Registration fails with "Email sudah terdaftar"
**Cause**: Email exists in `users` table
**Solution**: Check both tables before allowing registration

### Issue: Login Works But No Medical Records
**Symptom**: Patient can login but has no medical history
**Cause**: Record exists in `users` but not in `patients`
**Solution**:
```javascript
// Check and create patient record if missing
const [user] = await db.query('SELECT new_id FROM users WHERE email = ?', [email]);
const [patient] = await db.query('SELECT id FROM patients WHERE id = ?', [user[0].new_id]);

if (patient.length === 0) {
    await db.query('INSERT INTO patients (id, email, full_name) VALUES (?, ?, ?)',
        [user[0].new_id, email, 'New Patient']);
}
```

## Migration Path

If you need to consolidate to single table in future:

```sql
-- Move patient-specific columns to users table
ALTER TABLE users ADD COLUMN full_name VARCHAR(255);
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
-- ... (add all patients columns)

-- Migrate data
UPDATE users u
LEFT JOIN patients p ON p.id = u.new_id
SET u.full_name = p.full_name,
    u.phone = p.phone,
    -- ... (copy all columns)
WHERE u.user_type = 'patient';

-- Drop patients table (after verifying migration)
-- DROP TABLE patients;
```

## Best Practices

1. ✅ **Always use transactions** for dual-table operations
2. ✅ **Use service layer** (`patientDeletion.js`) for complex operations
3. ✅ **Check both tables** when searching by email
4. ✅ **Keep IDs synchronized** between tables
5. ✅ **Log all dual-table operations** for audit trail
6. ❌ **Never delete from one table only**
7. ❌ **Don't query patients table for authentication**
8. ❌ **Don't store passwords in patients table**

## Summary

**Dual-table system adalah design pattern yang benar** untuk memisahkan authentication concerns dari medical data concerns. Namun, **requires careful handling** untuk maintain consistency antara kedua tabel.

Key takeaway: **Think of them as one logical entity split across two physical tables.**
