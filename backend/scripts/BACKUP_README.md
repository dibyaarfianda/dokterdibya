# Database Backup Automation

## Backup Script

Automated MySQL backup with compression and retention policy.

### Features
- Daily automated backups
- GZIP compression
- 30-day retention (configurable)
- Logging

### Setup

1. Make scripts executable:
```bash
chmod +x /var/www/dibyaklinik/backend/scripts/backup.sh
chmod +x /var/www/dibyaklinik/backend/scripts/restore.sh
```

2. Create backup directory:
```bash
mkdir -p /var/www/dibyaklinik/backups
```

3. Set up cron job for daily backups at 2 AM:
```bash
crontab -e
```

Add this line:
```
0 2 * * * /var/www/dibyaklinik/backend/scripts/backup.sh >> /var/www/dibyaklinik/backups/backup.log 2>&1
```

### Manual Backup

Run backup manually:
```bash
cd /var/www/dibyaklinik/backend
./scripts/backup.sh
```

### Restore Database

List available backups:
```bash
ls -lh /var/www/dibyaklinik/backups/
```

Restore from backup:
```bash
cd /var/www/dibyaklinik/backend
./scripts/restore.sh /var/www/dibyaklinik/backups/dibyaklinik_20240101_020000.sql.gz
```

### Configuration

Edit `backup.sh` to change:
- `RETENTION_DAYS` - Number of days to keep backups (default: 30)
- `BACKUP_DIR` - Directory to store backups
- Database credentials (loaded from .env)

### Backup Location

Default: `/var/www/dibyaklinik/backups/`

### Important Notes

1. **Security**: Ensure backup directory has proper permissions
   ```bash
   chmod 700 /var/www/dibyaklinik/backups
   ```

2. **Storage**: Monitor disk space for backups
   ```bash
   du -sh /var/www/dibyaklinik/backups
   ```

3. **Testing**: Test restore process regularly
   ```bash
   # Create test database
   mysql -u root -p -e "CREATE DATABASE dibyaklinik_test;"
   
   # Test restore
   gunzip -c backup.sql.gz | mysql -u root -p dibyaklinik_test
   
   # Drop test database
   mysql -u root -p -e "DROP DATABASE dibyaklinik_test;"
   ```

4. **Off-site Backups**: Consider copying backups to remote storage
   ```bash
   # Example: rsync to remote server
   rsync -avz /var/www/dibyaklinik/backups/ user@remote:/backups/dibyaklinik/
   ```

### Troubleshooting

**Error: Access denied**
- Check DB_PASSWORD in .env file
- Verify database user permissions

**Error: Disk space**
- Check available disk space: `df -h`
- Reduce RETENTION_DAYS or move old backups

**Error: mysqldump not found**
- Install MySQL client: `sudo apt install mysql-client`
