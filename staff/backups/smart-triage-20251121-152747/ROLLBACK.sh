#!/bin/bash
# Rollback script for Smart Triage implementation
# Created: 2025-11-21 15:27:47
# Usage: bash ROLLBACK.sh

echo "=========================================="
echo "Smart Triage Rollback Script"
echo "=========================================="
echo ""

BACKUP_DIR="/var/www/dokterdibya/staff/backups/smart-triage-20251121-152747"
TARGET_DIR="/var/www/dokterdibya/staff"

# Confirm rollback
read -p "Are you sure you want to rollback? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Rollback cancelled."
    exit 0
fi

echo "Starting rollback..."

# Restore backend service
echo "Restoring sundayClinicService.js..."
cp "$BACKUP_DIR/sundayClinicService.js" "$TARGET_DIR/backend/services/sundayClinicService.js"

# Restore frontend scripts
echo "Restoring sunday-clinic.js..."
cp "$BACKUP_DIR/sunday-clinic.js" "$TARGET_DIR/public/scripts/sunday-clinic.js"
cp "$BACKUP_DIR/sunday-clinic.js.backup" "$TARGET_DIR/public/scripts/sunday-clinic.js.backup"

echo ""
echo "Rollback completed successfully!"
echo ""
echo "IMPORTANT: You may need to:"
echo "1. Rollback database migrations manually"
echo "2. Restart the application server"
echo "3. Clear browser cache"
echo ""
echo "To rollback database, run:"
echo "  mysql -u root -p dibyaklinik < rollback_patient_mr_history.sql"
echo ""
