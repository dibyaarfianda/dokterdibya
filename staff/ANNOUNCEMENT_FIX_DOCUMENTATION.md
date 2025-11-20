# Announcement Feature Database Migration Fix

## Issue
The announcement save functionality was failing with a 500 error because the backend API was trying to insert data into database columns (`image_url`, `formatted_content`, `content_type`) that don't exist yet on the production database.

## Root Cause
The migration file `20251120_add_announcement_features.sql` was created but not yet executed on the production database. The API code assumed the new columns were already present.

## Solution

### 1. Backward-Compatible API (Immediate Fix)
Updated `/staff/backend/routes/announcements.js` to be backward-compatible:

- **Detection**: API now checks if new columns exist before using them
- **Fallback**: If columns don't exist, uses basic schema (title, message, priority, status)
- **Graceful**: Works with both old and new database schemas

**Modified Endpoints:**
- `GET /api/announcements/active` - Detects available columns
- `POST /api/announcements` - Falls back to basic insert if needed
- `PUT /api/announcements/:id` - Falls back to basic update if needed

### 2. Improved Migration File
Updated `20251120_add_announcement_features.sql`:

- **Idempotent**: Can be run multiple times safely
- **Smart Detection**: Checks if columns exist before adding them
- **Informative**: Shows existing columns after migration
- **Safe**: Won't fail if columns already exist

## How to Apply the Fix

### Option A: Use Backward-Compatible API (No Migration Needed)
The API now works without the migration:
1. Restart the backend server
2. Announcements will work with basic fields (no images/markdown yet)
3. Can run migration later when ready

### Option B: Run the Migration (Full Features)
To enable image and markdown support:

```bash
# On the VPS server
mysql -u root -p dibyaklinik < /path/to/staff/backend/migrations/20251120_add_announcement_features.sql
```

After migration, restart the backend:
```bash
pm2 restart backend
# or
systemctl restart your-backend-service
```

## Verification

### Check if Migration is Needed
```sql
USE dibyaklinik;
DESCRIBE announcements;
```

Look for these columns:
- `image_url` (VARCHAR 500)
- `formatted_content` (MEDIUMTEXT)
- `content_type` (ENUM)

If missing, run the migration.

### Test Announcement Creation

1. **Without Migration** (Basic Mode):
   - Create announcement with title and message
   - Should save successfully
   - Image and formatting fields ignored

2. **After Migration** (Enhanced Mode):
   - Create announcement with title, message, and image URL
   - Select markdown formatting
   - Should save all fields including rich content

## Backend Logs

The API will log which mode it's using:

```
New announcement columns not yet migrated, using basic query
New announcement columns not available, using basic insert
New announcement columns not available, using basic update
```

If you don't see these messages, the migration has been applied.

## Impact

### Users
- ✓ No errors when creating/editing announcements
- ✓ Basic announcements work immediately
- ✓ Enhanced features (images, markdown) work after migration

### Developers
- ✓ Code works in both scenarios
- ✓ Safe to deploy before running migration
- ✓ Can test locally without migration

## Files Modified

1. `staff/backend/routes/announcements.js` - Backward-compatible API
2. `staff/backend/migrations/20251120_add_announcement_features.sql` - Idempotent migration

## Testing Checklist

- [x] Create announcement without migration (basic mode)
- [x] Edit announcement without migration
- [x] Delete announcement without migration
- [ ] Run migration on test database
- [ ] Create announcement with image after migration
- [ ] Create announcement with markdown after migration
- [ ] Verify preview feature works

## Rollback Plan

If issues occur after migration:

```sql
-- Remove new columns (not recommended, but possible)
ALTER TABLE announcements
DROP COLUMN content_type,
DROP COLUMN formatted_content,
DROP COLUMN image_url;
```

The API will automatically detect and work with the basic schema.
