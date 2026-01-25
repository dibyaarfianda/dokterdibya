#!/bin/bash
#
# Reset Patient Password
# Usage: ./reset-patient-password.sh <email> <new_password>
#
# This script updates the password in the USERS table (not patients table)
# because the login endpoint checks users.password_hash
#

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <email> <new_password>"
    echo "Example: $0 patient@email.com newpassword123"
    exit 1
fi

EMAIL="$1"
PASSWORD="$2"

# Generate bcrypt hash
cd /var/www/dokterdibya/staff/backend
HASH=$(node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('$PASSWORD', 10));")

if [ -z "$HASH" ]; then
    echo "Error: Failed to generate password hash"
    exit 1
fi

# Check if user exists
USER_EXISTS=$(mysql -u root dibyaklinik -N -e "SELECT COUNT(*) FROM users WHERE email = '$EMAIL';")

if [ "$USER_EXISTS" -eq 0 ]; then
    echo "Error: User with email '$EMAIL' not found in users table"
    exit 1
fi

# Update password
mysql -u root dibyaklinik -e "UPDATE users SET password_hash = '$HASH' WHERE email = '$EMAIL';"

if [ $? -eq 0 ]; then
    echo "Password updated successfully for: $EMAIL"
    echo "New password: $PASSWORD"

    # Show user info
    mysql -u root dibyaklinik -e "SELECT new_id, email, name, user_type FROM users WHERE email = '$EMAIL';"
else
    echo "Error: Failed to update password"
    exit 1
fi
