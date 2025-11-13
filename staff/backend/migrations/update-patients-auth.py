#!/usr/bin/env python3
"""
Script to update patients-auth.js to use unified patients table
"""

import re

# Read the file
with open('/var/www/dokterdibya/staff/backend/routes/patients-auth.js', 'r') as f:
    content = f.read()

# Backup
with open('/var/www/dokterdibya/staff/backend/routes/patients-auth.js.backup-merge', 'w') as f:
    f.write(content)

# 1. Replace table name
content = content.replace('web_patients', 'patients')

# 2. Replace column names in SQL queries
# fullname -> full_name
content = re.sub(r'\bfullname\b', 'full_name', content)

# 3. Replace medical_record_id -> id in SELECT statements
content = re.sub(r'SELECT\s+id,\s+id\s+FROM', 'SELECT id FROM', content)
content = re.sub(r'SELECT\s+medical_record_id\s+FROM\s+patients', 'SELECT id FROM patients', content)
content = re.sub(r'medical_record_id\s+as\s+id', 'id', content)

# 4. Fix INSERT statements - medical_record_id becomes id
content = re.sub(r'INSERT INTO patients\s*\(\s*medical_record_id,', 'INSERT INTO patients (id,', content)

# 5. Fix UPDATE statements
content = re.sub(r'UPDATE patients SET medical_record_id =', 'UPDATE patients SET id =', content)

# 6. Fix JavaScript object properties
# But keep medicalRecordId in responses for now (will fix in frontend later)

# Write the updated content
with open('/var/www/dokterdibya/staff/backend/routes/patients-auth.js', 'w') as f:
    f.write(content)

print("✓ Updated patients-auth.js")
print("✓ Backup saved to patients-auth.js.backup-merge")
print("\nNext steps:")
print("1. Review the changes")
print("2. Test registration endpoint")
print("3. Test login endpoint")
print("4. Update frontend if needed")
