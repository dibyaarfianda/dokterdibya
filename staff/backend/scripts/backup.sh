#!/bin/bash
# Database Backup Script for Dibya Klinik
# Save as: /var/www/dokterdibya/staff/backend/scripts/backup.sh

# Configuration
BACKUP_DIR="/var/www/dokterdibya/backups"
DB_NAME="dibyaklinik"
DB_USER="dibyaklinik_user"
DB_HOST="localhost"
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/dibyaklinik_${DATE}.sql"
RETENTION_DAYS=30

# Load database password from .env file
if [ -f "/var/www/dokterdibya/staff/backend/.env" ]; then
    export $(grep -v '^#' /var/www/dokterdibya/staff/backend/.env | grep DB_PASSWORD | xargs)
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Log start
echo "[$(date)] Starting database backup..."

# Perform backup
mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    "$DB_NAME" > "$BACKUP_FILE"

# Check if backup was successful
if [ $? -eq 0 ]; then
    # Compress backup
    gzip "$BACKUP_FILE"
    BACKUP_FILE="${BACKUP_FILE}.gz"
    
    echo "[$(date)] Backup completed successfully: $BACKUP_FILE"
    
    # Get file size
    FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Backup size: $FILE_SIZE"
    
    # Delete old backups (older than RETENTION_DAYS)
    echo "[$(date)] Removing backups older than $RETENTION_DAYS days..."
    find "$BACKUP_DIR" -name "dibyaklinik_*.sql.gz" -mtime +$RETENTION_DAYS -delete
    
    # Count remaining backups
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/dibyaklinik_*.sql.gz 2>/dev/null | wc -l)
    echo "[$(date)] Total backups: $BACKUP_COUNT"
    
    exit 0
else
    echo "[$(date)] ERROR: Backup failed!"
    exit 1
fi
