#!/bin/bash
# Script to update backend code to use unified patients table

echo "Updating backend code to use unified patients table..."

# Backup original file
cp /var/www/dokterdibya/staff/backend/routes/patients-auth.js /var/www/dokterdibya/staff/backend/routes/patients-auth.js.backup-before-merge

# Replace web_patients with patients
sed -i 's/web_patients/patients/g' /var/www/dokterdibya/staff/backend/routes/patients-auth.js

# Replace fullname with full_name (patients table uses full_name)
sed -i 's/\bfullname\b/full_name/g' /var/www/dokterdibya/staff/backend/routes/patients-auth.js

# Replace medical_record_id with id (in context of patients table)
# This is tricky - only replace in specific contexts
sed -i 's/medical_record_id FROM patients/id FROM patients/g' /var/www/dokterdibya/staff/backend/routes/patients-auth.js
sed -i 's/medical_record_id, full_name/id, full_name/g' /var/www/dokterdibya/staff/backend/routes/patients-auth.js
sed -i 's/INSERT INTO patients (id,/INSERT INTO patients (id,/g' /var/www/dokterdibya/staff/backend/routes/patients-auth.js

echo "Done! Please review the changes."
echo "Backup saved to: /var/www/dokterdibya/staff/backend/routes/patients-auth.js.backup-before-merge"
