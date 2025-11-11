-- Role Management System
-- Create tables for roles, permissions, and role-permission mapping

-- Roles Table
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permissions Table
CREATE TABLE IF NOT EXISTS permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_permission_name (name),
    INDEX idx_permission_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Role-Permission Mapping Table
CREATE TABLE IF NOT EXISTS role_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_role_permission (role_id, permission_id),
    INDEX idx_role_id (role_id),
    INDEX idx_permission_id (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Modify users table to add role_id (if not exists)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role_id INT NULL,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT 1,
ADD INDEX IF NOT EXISTS idx_users_role_id (role_id),
ADD FOREIGN KEY IF NOT EXISTS fk_users_role_id (role_id) REFERENCES roles(id) ON DELETE SET NULL;

-- Insert default system roles
INSERT INTO roles (name, display_name, description, is_system) VALUES
('superadmin', 'Super Administrator', 'Full system access with all permissions', 1),
('admin', 'Administrator', 'Administrative access to most system features', 1),
('doctor', 'Dokter', 'Medical staff with patient care and clinical permissions', 1),
('nurse', 'Perawat', 'Nursing staff with limited clinical permissions', 1),
('receptionist', 'Resepsionis', 'Front desk staff for appointments and registration', 1),
('pharmacist', 'Apoteker', 'Pharmacy staff for medication management', 1),
('cashier', 'Kasir', 'Financial staff for billing and payments', 1),
('viewer', 'Viewer', 'Read-only access to system data', 1)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- Insert default permissions
INSERT INTO permissions (name, display_name, category, description) VALUES
-- User Management
('users.view', 'Lihat Pengguna', 'User Management', 'View user list and details'),
('users.create', 'Tambah Pengguna', 'User Management', 'Create new users'),
('users.edit', 'Edit Pengguna', 'User Management', 'Edit existing users'),
('users.delete', 'Hapus Pengguna', 'User Management', 'Delete users'),
('users.manage_roles', 'Kelola Role Pengguna', 'User Management', 'Assign roles to users'),

-- Role Management
('roles.view', 'Lihat Role', 'Role Management', 'View roles and permissions'),
('roles.create', 'Tambah Role', 'Role Management', 'Create new roles'),
('roles.edit', 'Edit Role', 'Role Management', 'Edit existing roles'),
('roles.delete', 'Hapus Role', 'Role Management', 'Delete custom roles'),
('roles.manage_permissions', 'Kelola Permission Role', 'Role Management', 'Assign permissions to roles'),

-- Patient Management
('patients.view', 'Lihat Pasien', 'Patient Management', 'View patient list and details'),
('patients.create', 'Tambah Pasien', 'Patient Management', 'Register new patients'),
('patients.edit', 'Edit Pasien', 'Patient Management', 'Edit patient information'),
('patients.delete', 'Hapus Pasien', 'Patient Management', 'Delete patient records'),

-- Appointment Management
('appointments.view', 'Lihat Appointment', 'Appointment Management', 'View appointments'),
('appointments.create', 'Tambah Appointment', 'Appointment Management', 'Create new appointments'),
('appointments.edit', 'Edit Appointment', 'Appointment Management', 'Edit appointments'),
('appointments.delete', 'Hapus Appointment', 'Appointment Management', 'Cancel appointments'),
('appointments.manage_all', 'Kelola Semua Appointment', 'Appointment Management', 'Manage all user appointments'),

-- Visit Management
('visits.view', 'Lihat Kunjungan', 'Visit Management', 'View visit records'),
('visits.create', 'Tambah Kunjungan', 'Visit Management', 'Record new visits'),
('visits.edit', 'Edit Kunjungan', 'Visit Management', 'Edit visit records'),
('visits.delete', 'Hapus Kunjungan', 'Visit Management', 'Delete visit records'),

-- Medical Exam
('medical_exam.view', 'Lihat Pemeriksaan', 'Medical Exam', 'View medical examination records'),
('medical_exam.create', 'Tambah Pemeriksaan', 'Medical Exam', 'Create medical examination records'),
('medical_exam.edit', 'Edit Pemeriksaan', 'Medical Exam', 'Edit medical examination records'),
('medical_exam.delete', 'Hapus Pemeriksaan', 'Medical Exam', 'Delete medical examination records'),

-- Medication Management
('medications.view', 'Lihat Obat', 'Medication Management', 'View medication inventory'),
('medications.create', 'Tambah Obat', 'Medication Management', 'Add new medications'),
('medications.edit', 'Edit Obat', 'Medication Management', 'Edit medication details'),
('medications.delete', 'Hapus Obat', 'Medication Management', 'Delete medications'),
('medications.manage_stock', 'Kelola Stok Obat', 'Medication Management', 'Manage medication stock levels'),

-- Billing & Payments
('billing.view', 'Lihat Billing', 'Billing & Payments', 'View billing records'),
('billing.create', 'Buat Billing', 'Billing & Payments', 'Create new bills'),
('billing.edit', 'Edit Billing', 'Billing & Payments', 'Edit billing records'),
('billing.delete', 'Hapus Billing', 'Billing & Payments', 'Delete billing records'),
('billing.process_payment', 'Proses Pembayaran', 'Billing & Payments', 'Process payments'),

-- Tindakan (Services)
('services.view', 'Lihat Tindakan', 'Services Management', 'View medical services'),
('services.create', 'Tambah Tindakan', 'Services Management', 'Add new services'),
('services.edit', 'Edit Tindakan', 'Services Management', 'Edit service details'),
('services.delete', 'Hapus Tindakan', 'Services Management', 'Delete services'),

-- Reports & Analytics
('reports.view', 'Lihat Laporan', 'Reports & Analytics', 'View reports and analytics'),
('reports.export', 'Export Laporan', 'Reports & Analytics', 'Export reports to PDF/Excel'),
('analytics.view', 'Lihat Analytics', 'Reports & Analytics', 'View analytics dashboard'),

-- System Settings
('settings.view', 'Lihat Pengaturan', 'System Settings', 'View system settings'),
('settings.edit', 'Edit Pengaturan', 'System Settings', 'Modify system settings'),

-- Logs
('logs.view', 'Lihat Log', 'System Logs', 'View system activity logs'),

-- Chat
('chat.use', 'Gunakan Chat', 'Communication', 'Use internal chat system')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- Assign permissions to Super Admin (all permissions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'superadmin'
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- Assign permissions to Admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
AND p.name NOT IN ('users.delete', 'roles.delete', 'settings.edit')
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- Assign permissions to Doctor
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'doctor'
AND p.name IN (
    'patients.view', 'patients.create', 'patients.edit',
    'appointments.view', 'appointments.create', 'appointments.edit', 'appointments.manage_all',
    'visits.view', 'visits.create', 'visits.edit',
    'medical_exam.view', 'medical_exam.create', 'medical_exam.edit',
    'medications.view',
    'billing.view',
    'reports.view', 'analytics.view',
    'chat.use'
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- Assign permissions to Nurse
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'nurse'
AND p.name IN (
    'patients.view', 'patients.edit',
    'appointments.view', 'appointments.edit',
    'visits.view', 'visits.create',
    'medical_exam.view', 'medical_exam.create',
    'medications.view',
    'chat.use'
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- Assign permissions to Receptionist
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'receptionist'
AND p.name IN (
    'patients.view', 'patients.create', 'patients.edit',
    'appointments.view', 'appointments.create', 'appointments.edit',
    'visits.view',
    'chat.use'
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- Assign permissions to Pharmacist
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'pharmacist'
AND p.name IN (
    'patients.view',
    'visits.view',
    'medications.view', 'medications.create', 'medications.edit', 'medications.manage_stock',
    'reports.view',
    'chat.use'
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- Assign permissions to Cashier
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'cashier'
AND p.name IN (
    'patients.view',
    'visits.view',
    'billing.view', 'billing.create', 'billing.edit', 'billing.process_payment',
    'reports.view', 'reports.export',
    'chat.use'
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- Assign permissions to Viewer
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'viewer'
AND p.name IN (
    'patients.view',
    'appointments.view',
    'visits.view',
    'medical_exam.view',
    'medications.view',
    'billing.view',
    'reports.view',
    'analytics.view'
)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- Migrate existing users to use role_id (update based on their role column)
UPDATE users u
INNER JOIN roles r ON BINARY u.role = BINARY r.name
SET u.role_id = r.id
WHERE u.role_id IS NULL;

-- Set default role for users without role
UPDATE users u
INNER JOIN roles r ON r.name = 'viewer'
SET u.role_id = r.id
WHERE u.role_id IS NULL;

SELECT 'Role management system created successfully!' AS status;
