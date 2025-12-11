# ⚡ Quick Start - Dokter Dibya

**Get up and running in 5 minutes!**

For detailed instructions, see **[CONNECTION_GUIDE.md](./CONNECTION_GUIDE.md)**

## Prerequisites

- Node.js v16+ installed
- MySQL v8.0+ installed and running
- Git installed

## 🏃 Fast Setup

### 1. Clone & Install

```bash
# Clone repository
git clone https://github.com/dibyaarfianda/dokterdibya.git
cd dokterdibya

# Install backend dependencies
cd staff/backend
npm install
```

### 2. Database Setup

```bash
# Create database
mysql -u root -p -e "CREATE DATABASE dibyaklinik CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Import schema (if available)
mysql -u root -p dibyaklinik < database/schema.sql
```

### 3. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env
```

**Minimum required settings:**
```bash
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=dibyaklinik
JWT_SECRET=your_very_strong_secret_key_here_minimum_64_chars
CORS_ORIGIN=http://localhost:3000
```

**Generate secure keys:**
```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Intake Encryption Key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 4. Start Backend

```bash
# From staff/backend directory
node server.js
```

**Expected output:**
```
[INFO] Database connection pool initialized successfully
[INFO] Backend server running on port 3000
```

### 5. Access Application

**Staff Portal (Admin):**
```
http://localhost:3000/staff/public/index-adminlte.html
```

**Patient Portal:**
```
http://localhost:3000/index.html
```

**Default Login (Development):**
- Email: `admin@praktekdrdibya.com`
- Password: `admin123`

⚠️ **Change password immediately!**

## 🎯 Essential Commands

```bash
# Start server
cd staff/backend && node server.js

# Create/reset superadmin
node reset-superadmin-password.js

# Database backup
mysqldump -u root -p dibyaklinik > backup_$(date +%Y%m%d).sql

# Fix permissions (Linux/Mac)
./fix-permissions.sh

# View all tables
mysql -u root -p dibyaklinik -e "SHOW TABLES;"
```

## ❓ Common Issues

### Port 3000 already in use
```bash
# Find process
lsof -i :3000
# Kill it
kill -9 <PID>
# Or change PORT in .env
```

### MySQL connection refused
```bash
# Start MySQL
sudo systemctl start mysql  # Linux
brew services start mysql   # macOS
```

### Can't login / No users exist
```bash
cd staff/backend
node reset-superadmin-password.js
```

### Blank page / 404 errors
1. Check server is running
2. Hard refresh browser: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
3. Check browser console (F12) for errors

## 📚 Next Steps

- Read **[CONNECTION_GUIDE.md](./CONNECTION_GUIDE.md)** for detailed setup
- Check **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** for production deployment
- Review **[CLAUDE.md](./CLAUDE.md)** for code conventions and project rules

## 🆘 Need Help?

1. Check [CONNECTION_GUIDE.md](./CONNECTION_GUIDE.md) troubleshooting section
2. Review backend logs: `tail -f staff/backend/logs/combined.log`
3. Check MySQL logs: `tail -f /var/log/mysql/error.log`
4. Open an issue on GitHub

---

**Ready to develop?** Great! Check out the full documentation for advanced features and configuration options.
