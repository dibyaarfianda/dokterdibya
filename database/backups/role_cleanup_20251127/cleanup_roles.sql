-- =====================================================
-- ROLE SYSTEM CLEANUP - SAFE MIGRATION SCRIPT
-- Date: 2025-11-27
-- Purpose: Simplify to 3-role system (dokter, managerial, bidan)
-- =====================================================

-- IMPORTANT: This script is SAFE because:
-- 1. Authorization uses users.role column (string), not role_id
-- 2. All staff already have role='managerial' or role='dokter'
-- 3. We're just cleaning up unused role_id references

-- =====================================================
-- STEP 1: Update all staff role_id to correct roles
-- =====================================================

-- Update all managerial staff to role_id=7 (managerial)
UPDATE users 
SET role_id = 7 
WHERE user_type = 'staff' 
AND role = 'managerial';

-- Ensure dokter has role_id=1
UPDATE users 
SET role_id = 1 
WHERE user_type = 'staff' 
AND (role = 'dokter' OR is_superadmin = 1);

-- =====================================================
-- STEP 2: Copy permissions from custom roles to managerial
-- =====================================================

-- Copy permissions from manager (19) to managerial (7) if not exists
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 7, permission_id 
FROM role_permissions 
WHERE role_id = 19;

-- Copy permissions from doctorassistant (20) to managerial (7) if not exists  
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 7, permission_id 
FROM role_permissions 
WHERE role_id = 20;

-- =====================================================
-- STEP 3: Delete role_permissions for roles to be deleted
-- =====================================================

DELETE FROM role_permissions WHERE role_id IN (2, 3, 4, 5, 6, 8, 19, 20, 21);

-- =====================================================
-- STEP 4: Delete unused roles
-- =====================================================

DELETE FROM roles WHERE id IN (2, 3, 4, 5, 6, 8, 19, 20, 21);

-- =====================================================
-- STEP 5: Verify final state
-- =====================================================

SELECT 'Remaining Roles:' as info;
SELECT id, name, display_name FROM roles ORDER BY id;

SELECT 'Users Role Distribution:' as info;
SELECT role, role_id, COUNT(*) as cnt FROM users WHERE user_type='staff' GROUP BY role, role_id;

SELECT 'Permissions per Role:' as info;
SELECT r.id, r.name, COUNT(rp.permission_id) as perm_count 
FROM roles r 
LEFT JOIN role_permissions rp ON r.id = rp.role_id 
GROUP BY r.id, r.name;
