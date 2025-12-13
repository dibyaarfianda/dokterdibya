#!/bin/bash
# Fix permissions for dokterdibya project

# Set ownership
chown -R www-data:www-data /var/www/dokterdibya

# Directories: 755 (rwxr-xr-x)
find /var/www/dokterdibya -type d -exec chmod 755 {} \;

# Files: 644 (rw-r--r--)
find /var/www/dokterdibya -type f -exec chmod 644 {} \;

# Make scripts executable
find /var/www/dokterdibya -name "*.sh" -exec chmod +x {} \;

echo "Permissions fixed!"
