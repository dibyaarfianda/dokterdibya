#!/bin/bash
# Database Restore Script for Dibya Klinik
# Save as: /var/www/dokterdibya/staff/backend/scripts/restore.sh

# Configuration
BACKUP_DIR="/var/www/dokterdibya/backups"
DB_NAME="dibyaklinik"
DB_USER="dibyaklinik_user"
DB_HOST="localhost"

# Load database password from .env file
if [ -f "/var/www/dokterdibya/staff/backend/.env" ]; then
    export $(grep -v '^#' /var/www/dokterdibya/staff/backend/.env | grep DB_PASSWORD | xargs)
fi

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/dibyaklinik_*.sql.gz 2>/dev/null
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Confirm restore
echo "WARNING: This will restore the database from: $BACKUP_FILE"
echo "Database: $DB_NAME"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Log start
echo "[$(date)] Starting database restore..."

# Check if file is compressed
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo "[$(date)] Decompressing backup..."
    gunzip -c "$BACKUP_FILE" | mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
else
    mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$BACKUP_FILE"
fi

# Check if restore was successful
if [ $? -eq 0 ]; then
    echo "[$(date)] Restore completed successfully!"
    exit 0
else
    echo "[$(date)] ERROR: Restore failed!"
    exit 1
fi
