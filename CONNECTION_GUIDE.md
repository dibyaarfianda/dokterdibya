# 🚀 Connection Guide - Dokter Dibya Project

## 📋 Overview

This guide will help you connect to and run the Dokter Dibya clinical management system. The project is a monorepo consisting of:

- **Public Site** (`/public`) - Patient-facing landing site and marketing pages
- **Staff Portal** (`/staff`) - Clinical management system with backend API and admin dashboard
- **Chrome Extensions** (`/chrome-extension`) - SIMRS data export tools
- **Android App** (`/android-app`) - Mobile patient portal (future)

## 🎯 Quick Start

For most development work, you'll be working with the **Staff Portal** which includes the backend API and admin interface.

### System Requirements

- **Node.js**: v16 or higher (v18+ recommended)
- **MySQL**: v8.0 or higher
- **Operating System**: Linux (Ubuntu 20.04+), macOS, or Windows with WSL
- **RAM**: Minimum 4GB (8GB recommended)
- **Storage**: At least 2GB free space

## 📦 Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/dibyaarfianda/dokterdibya.git
cd dokterdibya
```

### 2. Install Dependencies

#### Backend Dependencies

```bash
cd staff/backend
npm install
```

**Key dependencies installed:**
- Express.js (API server)
- Socket.IO (real-time features)
- MySQL2 (database)
- JWT (authentication)
- Cloudflare R2 SDK (file storage)
- PDFKit (PDF generation)
- And many more...

#### Frontend (Optional - if building landing site)

```bash
cd ../../public
npm install
```

### 3. Database Setup

#### Create Database

```bash
# Login to MySQL
mysql -u root -p

# Create database
CREATE DATABASE dibyaklinik CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Create database user (optional but recommended)
CREATE USER 'dibya_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON dibyaklinik.* TO 'dibya_user'@'localhost';
FLUSH PRIVILEGES;

# Exit MySQL
EXIT;
```

#### Import Database Schema

```bash
# If there's a schema file
mysql -u root -p dibyaklinik < database/schema.sql

# Or import from backup
mysql -u root -p dibyaklinik < database/backup_YYYYMMDD.sql
```

**Note:** Database schema files may be located in:
- `/database/` directory (root level)
- `/staff/backend/migrations/` directory
- Ask the team for the latest schema file if not available

### 4. Environment Configuration

#### Create Backend Environment File

```bash
cd staff/backend
cp .env.example .env
```

#### Edit `.env` File

Open `staff/backend/.env` and configure:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_USER=root                    # or 'dibya_user' if you created one
DB_PASSWORD=your_mysql_password
DB_NAME=dibyaklinik
DB_CONNECTION_LIMIT=10

# JWT Configuration (CRITICAL - Generate strong secret)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your_very_strong_secret_key_here_minimum_64_characters_recommended
JWT_EXPIRES_IN=7d

# CORS Configuration (adjust based on your frontend URL)
CORS_ORIGIN=http://localhost:8080

# Patient Intake Encryption (Generate 32-byte base64 key)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
INTAKE_ENCRYPTION_KEY=REPLACE_WITH_32_BYTE_BASE64_KEY
INTAKE_ENCRYPTION_KEY_ID=v1

# Cloudflare R2 Storage (for PDFs and medical files)
# Get credentials from Cloudflare dashboard
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=dokterdibya-medis
R2_PUBLIC_URL=https://your-bucket.r2.dev

# Email Configuration (optional - for verification emails)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@praktekdrdibya.com

# Google OAuth (optional - for Google sign-in)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Twilio (optional - for SMS notifications)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
```

#### Generate Secure Keys

```bash
# Generate JWT Secret (64 characters recommended)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate Intake Encryption Key (32 bytes, base64 encoded)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 5. Start the Backend Server

```bash
cd staff/backend
node server.js
```

**Expected output:**
```
[INFO] Database connection pool initialized successfully
[INFO] Backend server running on port 3000
[INFO] Socket.IO server initialized
```

**Alternative: Use PM2 for production**

```bash
# Install PM2 globally
npm install -g pm2

# Start server with PM2
cd staff/backend
pm2 start server.js --name "dibya-backend"

# View logs
pm2 logs dibya-backend

# Monitor
pm2 monit

# Restart
pm2 restart dibya-backend

# Stop
pm2 stop dibya-backend
```

### 6. Access the Application

#### Staff Portal (Admin Dashboard)

1. Open browser and navigate to:
   ```
   http://localhost:3000/staff/public/index-adminlte.html
   ```

2. **Default Login Credentials** (if seeded):
   - **Superadmin:**
     - Email: `admin@praktekdrdibya.com`
     - Password: `admin123` (change immediately!)
   
   - **Dokter:**
     - Email: `dokter@praktekdrdibya.com`
     - Password: `dokter123`
   
   - **Front Office:**
     - Email: `frontoffice@praktekdrdibya.com`
     - Password: `front123`

3. **If no users exist**, create superadmin:
   ```bash
   cd staff/backend
   node reset-superadmin-password.js
   # Follow prompts to create/reset superadmin account
   ```

#### Patient Portal (Public Site)

```
http://localhost:3000/index.html
```

Or serve the public directory separately:

```bash
cd public
# Using Python
python3 -m http.server 8080

# Using Node.js http-server
npx http-server -p 8080
```

Then access: `http://localhost:8080`

## 🔍 Verify Installation

### 1. Check Backend Health

```bash
# Check if server is running
curl http://localhost:3000/api/health

# Expected response:
{"status":"ok","timestamp":"2025-12-11T10:00:00.000Z"}
```

### 2. Check Database Connection

```bash
mysql -u root -p dibyaklinik -e "SHOW TABLES;"
```

**Expected tables** (partial list):
- `users`
- `patients`
- `patient_intake`
- `sunday_clinic_records`
- `sunday_clinic_billings`
- `roles`
- `role_visibility`
- And more...

### 3. Test API Endpoints

```bash
# Test login endpoint
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@praktekdrdibya.com","password":"admin123"}'

# Should return JWT token if credentials are correct
```

### 4. Check Frontend Loading

Open browser console (F12) and check for errors when loading:
- Staff Portal: `http://localhost:3000/staff/public/index-adminlte.html`
- Check that no 404 errors appear in Network tab
- Verify Socket.IO connection establishes

## 📱 Access Different Modules

### Staff Portal Modules

Once logged in, you can access:

1. **Dashboard** - Overview and quick actions
2. **Patients** - Patient management and search
3. **Patient Intake** - New patient registration forms
4. **Sunday Clinic** - Medical records (Obstetri, Gyn Repro, Gyn Special)
5. **Billing** - Invoice generation and payment tracking
6. **Users** - Staff user management
7. **Settings** - System configuration

### Patient Portal Features

- Appointment booking
- View medical history
- Profile management
- Upload documents
- AI-powered health assistant

## 🛠️ Common Tasks

### Create New User

```bash
cd staff/backend

# Interactive user creation
node import-users-on-vps.js

# Or directly in MySQL
mysql -u root -p dibyaklinik
```

```sql
-- Create user (password will need to be hashed)
-- Use bcrypt hash generator or backend API
INSERT INTO users (email, password, name, role, role_id, created_at)
VALUES ('user@example.com', '$2b$10$...hashed...', 'User Name', 'dokter', 1, NOW());
```

### Reset Password

```bash
cd staff/backend

# Reset superadmin password
node reset-superadmin-password.js

# Reset any user password
node reset-single-password.js

# Reset all passwords (CAUTION!)
node reset-all-passwords.js
```

### Backup Database

```bash
# Full database backup
mysqldump -u root -p dibyaklinik > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup specific tables
mysqldump -u root -p dibyaklinik sunday_clinic_records patients > partial_backup.sql

# Restore from backup
mysql -u root -p dibyaklinik < backup_20251211_100000.sql
```

### View Logs

```bash
# Backend logs (if using PM2)
pm2 logs dibya-backend

# Or check log files
tail -f staff/backend/logs/combined.log
tail -f staff/backend/logs/error.log

# Real-time log monitoring
pm2 monit
```

### Run Migrations

```bash
# Apply database migration
cd staff/backend
mysql -u root -p dibyaklinik < migrations/YYYYMMDD_migration_name.sql

# Example: Category system migration
mysql -u root -p dibyaklinik < migrations/20251120_add_mr_category_system.sql
```

### Fix File Permissions (Linux/macOS)

```bash
# Run permission fix script
cd /path/to/dokterdibya
./fix-permissions.sh

# Or manually
sudo chown -R www-data:www-data /var/www/dokterdibya
sudo chmod -R 755 /var/www/dokterdibya
sudo chmod -R 644 /var/www/dokterdibya/**/*.{js,css,html,json}
```

## 🐛 Troubleshooting

### Issue: Cannot connect to MySQL

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**Solutions:**
1. Check MySQL is running:
   ```bash
   # Linux
   sudo systemctl status mysql
   sudo systemctl start mysql
   
   # macOS
   brew services list
   brew services start mysql
   
   # Windows
   net start MySQL
   ```

2. Verify credentials in `.env` file
3. Check MySQL port (default 3306):
   ```bash
   netstat -an | grep 3306
   ```

### Issue: Port 3000 already in use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**
1. Find and kill process using port 3000:
   ```bash
   # Linux/macOS
   lsof -i :3000
   kill -9 <PID>
   
   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

2. Or change PORT in `.env` file:
   ```bash
   PORT=3001
   ```

### Issue: JWT authentication fails

**Symptoms:**
```
401 Unauthorized
Invalid token
```

**Solutions:**
1. Ensure `JWT_SECRET` is set in `.env`
2. Token must be at least 32 characters
3. Clear browser localStorage and login again
4. Check token expiration (`JWT_EXPIRES_IN`)

### Issue: Socket.IO connection failed

**Symptoms:**
```
WebSocket connection to 'ws://localhost:3000/socket.io/' failed
```

**Solutions:**
1. Check if server is running
2. Verify CORS settings in `.env`:
   ```bash
   CORS_ORIGIN=http://localhost:8080
   ```
3. Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)
4. Note: The system uses **polling-only** mode (not WebSocket) for mobile compatibility

### Issue: Database tables not found

**Symptoms:**
```
Error: Table 'dibyaklinik.users' doesn't exist
```

**Solutions:**
1. Import database schema:
   ```bash
   mysql -u root -p dibyaklinik < database/schema.sql
   ```
2. Run migrations in order:
   ```bash
   cd staff/backend/migrations
   for file in *.sql; do
       mysql -u root -p dibyaklinik < "$file"
   done
   ```

### Issue: Frontend shows blank page

**Solutions:**
1. Check browser console (F12) for errors
2. Verify backend server is running
3. Clear browser cache and hard refresh
4. Check file permissions:
   ```bash
   ls -la staff/public/
   ```
5. Verify static file serving in server.js

### Issue: PDF generation fails

**Symptoms:**
```
Error: R2 upload failed
PDF not found
```

**Solutions:**
1. Verify R2 credentials in `.env`
2. Check R2 bucket exists and is accessible
3. Test R2 connection:
   ```bash
   cd staff/backend
   node -e "require('./services/r2Storage').testConnection()"
   ```
4. Check logs for specific error messages

### Issue: Permission denied on Linux

**Solutions:**
```bash
# Fix permissions
sudo chown -R $USER:$USER /path/to/dokterdibya
chmod +x fix-permissions.sh
./fix-permissions.sh

# Or for web server
sudo chown -R www-data:www-data /var/www/dokterdibya
```

## 🔐 Security Checklist

Before deploying to production:

- [ ] Change all default passwords
- [ ] Generate strong JWT_SECRET (64+ characters)
- [ ] Generate strong INTAKE_ENCRYPTION_KEY
- [ ] Enable rate limiting (uncomment in server.js)
- [ ] Set NODE_ENV=production
- [ ] Configure proper CORS_ORIGIN (not *)
- [ ] Enable HTTPS (use nginx reverse proxy)
- [ ] Set up firewall rules
- [ ] Enable database backups
- [ ] Review error logs regularly
- [ ] Set up monitoring (PM2, New Relic, etc.)

## 📚 Additional Documentation

For more detailed information, refer to:

- **[README.md](./README.md)** - Project overview and structure
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Production deployment
- **[staff/README.md](./staff/README.md)** - Staff portal details
- **[CLAUDE.md](./CLAUDE.md)** - Project rules and conventions
- **Database Docs**: `staff/backend/migrations/` - Database schema changes
- **API Docs**: `http://localhost:3000/api-docs` (Swagger UI when server is running)

## 🆘 Getting Help

### Check Logs
```bash
# Backend logs
tail -f staff/backend/logs/combined.log
tail -f staff/backend/logs/error.log

# PM2 logs
pm2 logs dibya-backend

# MySQL error log
tail -f /var/log/mysql/error.log
```

### Test Database Connection
```bash
cd staff/backend
node -e "require('./db').query('SELECT 1').then(() => console.log('✅ Connected')).catch(err => console.error('❌ Failed:', err))"
```

### Verify Environment Variables
```bash
cd staff/backend
node -e "require('dotenv').config(); console.log('DB_HOST:', process.env.DB_HOST); console.log('JWT_SECRET length:', process.env.JWT_SECRET?.length)"
```

### Contact
- **GitHub Issues**: https://github.com/dibyaarfianda/dokterdibya/issues
- **Documentation**: Check markdown files in project root
- **Code Review**: See implementation documents (PHASE1, PHASE2, etc.)

## 🎉 Success!

If you can:
1. ✅ Start the backend server without errors
2. ✅ Access the staff portal login page
3. ✅ Login with credentials
4. ✅ See the dashboard and menus
5. ✅ Database queries work

**You're successfully connected to the Dokter Dibya project!** 🚀

---

## Quick Reference

### Essential Commands

```bash
# Start backend
cd staff/backend && node server.js

# Start with PM2
pm2 start staff/backend/server.js --name dibya-backend

# View logs
pm2 logs dibya-backend

# Database access
mysql -u root -p dibyaklinik

# Run migrations
mysql -u root -p dibyaklinik < staff/backend/migrations/MIGRATION_FILE.sql

# Backup database
mysqldump -u root -p dibyaklinik > backup_$(date +%Y%m%d).sql

# Fix permissions
./fix-permissions.sh
```

### Important URLs

- **Staff Portal**: http://localhost:3000/staff/public/index-adminlte.html
- **Patient Portal**: http://localhost:3000/index.html
- **API Health**: http://localhost:3000/api/health
- **API Docs**: http://localhost:3000/api-docs (when running)

### Default Credentials (Development Only)

- **Email**: admin@praktekdrdibya.com
- **Password**: admin123

⚠️ **CHANGE IMMEDIATELY IN PRODUCTION!**

---

**Last Updated**: December 11, 2025
**Version**: 1.0.0
