-- =====================================================
-- ROLE SYSTEM RESTORE SCRIPT
-- Date: 2025-11-27
-- Purpose: Restore roles from backup if needed
-- =====================================================

-- To restore, run:
-- mysql -u dibyaapp -pDibyaKlinik2024! dibyaklinik < /var/www/dokterdibya/database/backups/role_cleanup_20251127/role_system_dump.sql

-- Or manually restore users role_id:
-- UPDATE users SET role_id = 19 WHERE new_id IN ('GEJXDAZEZM', 'MHYLFYGIAS', 'NWCSQBSRCB', 'QNUBHYASRR', 'WLDOEWZSRP');
-- UPDATE users SET role_id = 20 WHERE new_id IN ('JSZXSFSYAG', 'LCBRGLMAMX', 'LZGWMHEUCJ');
-- UPDATE users SET role_id = 21 WHERE new_id IN ('AEPQEBDQBW', 'FNHSLBTRXD');
-- UPDATE users SET role_id = 1 WHERE new_id = 'UDZAQUCQWZ';
