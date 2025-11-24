# CLAUDE.md - AI Assistant Guide for Dokter Dibya Project

**Document Version:** 1.0
**Last Updated:** 2025-11-24
**Repository:** dokterdibya (monorepo)

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Structure](#repository-structure)
3. [Technology Stack](#technology-stack)
4. [Architecture](#architecture)
5. [Development Workflows](#development-workflows)
6. [Key Conventions](#key-conventions)
7. [Database Management](#database-management)
8. [Authentication & Authorization](#authentication--authorization)
9. [API Structure](#api-structure)
10. [Frontend Architecture](#frontend-architecture)
11. [Environment Configuration](#environment-configuration)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [Important Files & Documentation](#important-files--documentation)
15. [Common Tasks](#common-tasks)
16. [Security Considerations](#security-considerations)

---

## 🎯 Project Overview

**Dokter Dibya** is a comprehensive medical clinic management system consisting of:

- **Public-facing patient portal** - Registration, appointments, intake forms, visit history
- **Staff clinical portal** - Patient management, medical records, billing, analytics
- **Backend API** - RESTful API with Socket.IO for real-time features
- **Android mobile app** (archived) - Mobile wrapper for the web portal

### Core Business Features

- Patient registration and authentication (JWT-based)
- Medical intake forms with encryption
- Appointment booking and management
- Sunday Clinic with 3-template system (Obstetri, Gyn Repro, Gyn Special)
- Medical records with category-based MR IDs
- Billing and invoicing
- Practice schedules and locations
- Real-time chat and notifications
- Analytics and reporting

---

## 📁 Repository Structure

```
dokterdibya/
├── public/                          # Patient-facing portal
│   ├── css/                         # Bootstrap, Font Awesome, custom styles
│   ├── js/                          # Custom JS, typed.js, wow.js
│   ├── scripts/                     # Patient portal functionality
│   │   ├── patient-intake.js        # Patient intake form logic
│   │   ├── booking-appointment.js   # Appointment booking
│   │   ├── api-service.js           # API client for patient portal
│   │   └── vps-auth-v2.js           # Patient authentication
│   ├── images/                      # Static assets
│   ├── *.html                       # Patient portal pages
│   └── unused/                      # Archived experiments
│
├── staff/                           # Staff clinical portal
│   ├── backend/                     # Node.js/Express API server
│   │   ├── config/                  # Config files (swagger, etc.)
│   │   ├── middleware/              # Auth, validation, error handling
│   │   ├── routes/                  # API route definitions
│   │   ├── services/                # Business logic layer
│   │   ├── utils/                   # Helper utilities
│   │   ├── migrations/              # Database migration scripts
│   │   ├── tests/                   # Jest test suites
│   │   ├── swagger/                 # API documentation
│   │   ├── server.js                # Main server entry point
│   │   ├── db.js                    # MySQL connection pool
│   │   └── unused/                  # Archived backend files
│   │
│   ├── public/                      # Staff portal frontend (AdminLTE)
│   │   ├── scripts/                 # Staff portal JS modules
│   │   │   ├── auth.js              # Staff authentication
│   │   │   ├── patients-v2.js       # Patient management
│   │   │   ├── sunday-clinic.js     # Medical records entry
│   │   │   ├── billing.js           # Billing management
│   │   │   ├── chat.js              # Real-time chat
│   │   │   └── sunday-clinic/       # Modular Sunday Clinic system
│   │   │       ├── main.js          # Component loader
│   │   │       ├── utils/           # Constants, API client, state
│   │   │       └── components/      # Category-specific templates
│   │   ├── css/                     # AdminLTE styles
│   │   ├── dist/                    # AdminLTE assets
│   │   └── unused/                  # Archived frontend files
│   │
│   ├── docs/                        # Operational documentation
│   ├── backups/                     # Database backup scripts
│   └── unused/                      # Archived staff files
│
├── android-app/                     # Android mobile app (React Native/Capacitor)
│   └── DokterDibya/                 # Android project files
│
├── *.md                             # Extensive documentation (57 files)
├── .gitignore                       # Git ignore patterns
├── .vscode/                         # VSCode settings
└── CLAUDE.md                        # This file

```

---

## 🛠 Technology Stack

### Backend
- **Runtime:** Node.js (v14+)
- **Framework:** Express.js v4.18
- **Database:** MySQL 2 with connection pooling
- **Authentication:** JWT (jsonwebtoken v9.0)
- **Real-time:** Socket.IO v4.7 with Redis adapter
- **Security:** bcrypt, helmet, express-rate-limit
- **Validation:** express-validator
- **Email:** Nodemailer
- **PDF Generation:** PDFKit
- **Excel:** ExcelJS
- **Logging:** Winston
- **Testing:** Jest v30, Supertest
- **OAuth:** Google Auth Library v10
- **SMS:** Twilio
- **Caching:** Node-cache, Redis v5.9

### Frontend

#### Patient Portal
- **HTML5/CSS3/JavaScript** (vanilla JS)
- **UI Framework:** Bootstrap 3
- **Libraries:** jQuery, typed.js, wow.js, Font Awesome
- **Animation:** animate.css

#### Staff Portal
- **UI Framework:** AdminLTE (Bootstrap-based)
- **JavaScript:** Modular vanilla JS
- **Charts:** Chart.js (via chartjs-node-canvas)
- **Real-time:** Socket.IO client

### Android App (Archived)
- **Framework:** Capacitor 3.x
- **Platform:** Android (Gradle build system)
- **Location:** `/android-app/` (development moved to web)

### DevOps
- **Web Server:** Nginx (reverse proxy)
- **Process Manager:** PM2 (implied from deployment)
- **Version Control:** Git
- **CI/CD:** GitHub Actions (inferred from branch naming)
- **Timezone:** GMT+7 (Jakarta/Indonesian time)

---

## 🏗 Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Nginx (Reverse Proxy)                │
│                     https://praktekdrdibya.com              │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
┌────────▼──────────┐              ┌────────▼──────────┐
│  Patient Portal   │              │   Staff Portal    │
│   (Static HTML)   │              │   (AdminLTE SPA)  │
│  /public/*.html   │              │  /staff/public/   │
└────────┬──────────┘              └────────┬──────────┘
         │                                   │
         └──────────────┬────────────────────┘
                        │
                ┌───────▼────────┐
                │  Express API   │
                │  (Port 3000)   │
                │  /api/*        │
                └───────┬────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
    │  MySQL  │   │  Redis  │   │Socket.IO│
    │Database │   │  Cache  │   │Real-time│
    └─────────┘   └─────────┘   └─────────┘
```

### Backend Layer Architecture

```
Request → Middleware Chain → Route Handler → Service Layer → Database
           ├─ CORS
           ├─ Helmet (security)
           ├─ Compression
           ├─ Request Logger
           ├─ Metrics
           ├─ Rate Limiter (disabled in dev)
           ├─ JWT Verification (protected routes)
           └─ Validation
```

### Sunday Clinic 3-Template System

The Sunday Clinic uses a modular component-based architecture:

```
sunday-clinic.js (647 lines - integration layer)
├── sunday-clinic/main.js (component loader)
├── utils/
│   ├── constants.js      # Category definitions, field configs
│   ├── api-client.js     # Backend API communication
│   └── state-manager.js  # Shared state management
└── components/
    ├── obstetri/         # MROBS#### - Pregnant patients
    │   ├── form.js
    │   ├── renderer.js
    │   └── validator.js
    ├── gyn-repro/        # MRGPR#### - Reproductive health
    │   ├── form.js
    │   ├── renderer.js
    │   └── validator.js
    ├── gyn-special/      # MRGPS#### - Gynecological pathology
    │   ├── form.js
    │   ├── renderer.js
    │   └── validator.js
    └── shared/           # Shared UI components
        ├── header.js
        ├── footer.js
        ├── navigation.js
        ├── patient-info.js
        ├── search.js
        └── mr-display.js
```

**Key Achievement:** Reduced from 6,447 lines monolithic to 647 lines + modular components (90% reduction)

---

## 💻 Development Workflows

### Setting Up Development Environment

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd dokterdibya
   ```

2. **Backend Setup**
   ```bash
   cd staff/backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   node server.js
   ```

3. **Database Setup**
   - Create MySQL database named `dibyaklinik`
   - Run migrations in `/staff/backend/migrations/`
   - Migrations are manual SQL scripts (no migration framework)

4. **Frontend Development**
   - Patient portal: Serve `/public` directory
   - Staff portal: Serve `/staff/public` directory
   - Both are static HTML/JS, no build step required

### Branch Strategy

**Active Development Branch:** Branch names follow pattern `claude/claude-md-*-<session-id>`

Example: `claude/claude-md-midfaoceg932eimm-01A7cqKEsf7Cxppu3MTvNajC`

### Git Workflow

1. **Always develop on Claude branches** - Never push to main/master
2. **Commit Messages:** Clear, descriptive (see recent commits for style)
3. **Push Command:** `git push -u origin <branch-name>`
4. **Branch Naming:** Must start with `claude/` and end with session ID

### Code Organization Principles

1. **Prefer Editing Over Creating:** Always edit existing files rather than creating new ones
2. **Unused Files:** Move deprecated code to appropriate `unused/` directories
3. **No Build Steps:** Frontend is vanilla JS/HTML - no webpack/bundler
4. **Modular JS:** Break large files into smaller modules (see Sunday Clinic refactor)
5. **No External Dependencies:** Avoid adding new npm packages unless necessary

---

## 📝 Key Conventions

### Code Style

#### JavaScript
- **ES6+ syntax** where supported
- **async/await** for asynchronous operations
- **Destructuring** for cleaner code
- **Arrow functions** for callbacks
- **Template literals** for strings
- **Semicolons:** Used consistently

#### Naming Conventions
- **Files:** kebab-case (`patient-intake.js`, `sunday-clinic.js`)
- **Variables/Functions:** camelCase (`getUserData`, `patientInfo`)
- **Constants:** UPPER_SNAKE_CASE (`JWT_SECRET`, `MAX_FAILED_ATTEMPTS`)
- **Classes:** PascalCase (if used)
- **Database Tables:** snake_case (`web_patients`, `sunday_clinic_records`)
- **API Routes:** kebab-case (`/api/patient-intake`, `/api/medical-records`)

### Error Handling

```javascript
// Backend API Pattern
try {
    const result = await someAsyncOperation();
    res.json({ success: true, data: result });
} catch (error) {
    logger.error('Operation failed:', error);
    res.status(500).json({
        success: false,
        message: 'Descriptive error message'
    });
}

// Frontend Pattern
try {
    const response = await fetch('/api/endpoint');
    const data = await response.json();
    if (!data.success) {
        throw new Error(data.message);
    }
    // Handle success
} catch (error) {
    console.error('Error:', error);
    showAlert('Error: ' + error.message);
}
```

### API Response Format

```javascript
// Success Response
{
    "success": true,
    "data": { /* result data */ },
    "message": "Optional success message"
}

// Error Response
{
    "success": false,
    "message": "Error description",
    "error": "Technical error details (dev mode only)"
}

// Paginated Response
{
    "success": true,
    "data": [ /* items */ ],
    "pagination": {
        "page": 1,
        "limit": 20,
        "total": 150,
        "pages": 8
    }
}
```

### Database Query Patterns

```javascript
// Using connection pool
const pool = require('./db');

// Basic query
const [rows] = await pool.query(
    'SELECT * FROM patients WHERE id = ?',
    [patientId]
);

// Transaction pattern
const connection = await pool.getConnection();
try {
    await connection.beginTransaction();

    await connection.query('INSERT INTO ...', [values]);
    await connection.query('UPDATE ...', [values]);

    await connection.commit();
} catch (error) {
    await connection.rollback();
    throw error;
} finally {
    connection.release();
}

// Timezone handling
// Database configured for GMT+7 (Jakarta)
// Dates stored in local time, not UTC
```

### Frontend-Backend Communication

```javascript
// Frontend API calls use fetch with credentials
const response = await fetch('/api/endpoint', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(data)
});
```

### Logging

```javascript
// Backend (Winston logger)
const logger = require('./utils/logger');

logger.info('Informational message', { context: data });
logger.warn('Warning message', { context: data });
logger.error('Error message', { error: err, context: data });

// Frontend (Console with context)
console.log('[ModuleName] Action:', data);
console.error('[ModuleName] Error:', error);
```

---

## 🗄 Database Management

### Database: dibyaklinik

**Connection:** MySQL 2 with connection pooling
**Timezone:** GMT+7 (Jakarta)
**Connection Limits:** 10 connections (configurable via `DB_CONNECTION_LIMIT`)

### Key Tables

#### Patient Management
- `web_patients` - Patient accounts and authentication
- `patient_intake` - Medical intake forms (encrypted sensitive data)
- `patient_password_resets` - Password reset tokens
- `patient_verification_tokens` - Email verification

#### Medical Records
- `sunday_clinic_records` - Sunday Clinic medical records
  - `mr_category` - Category: 'obstetri', 'gyn_repro', 'gyn_special'
  - `mr_sequence` - Sequential number per category
  - `mr_id` - Generated ID (e.g., MROBS0001)
- `sunday_clinic_mr_counters` - Thread-safe counter table
- `patient_mr_history` - Historical MR tracking

#### Appointments & Visits
- `appointments` - Appointment bookings
- `appointment_archive` - Archived appointments
- `visits` - Patient visits
- `visit_invoices` - Visit billing

#### Practice Operations
- `obat` - Medications inventory
- `tindakan` - Medical procedures/services
- `practice_schedules` - Practice schedule management
- `announcements` - System announcements

#### Staff & Administration
- `users` - Staff accounts
- `roles` - Staff role definitions
- `permissions` - Permission management

### Migration Strategy

**Manual SQL migrations** in `/staff/backend/migrations/`

Naming convention: `YYYYMMDD_descriptive_name.sql` or descriptive names

**To apply a migration:**
```bash
mysql -u username -p dibyaklinik < migration_file.sql
```

**Important Migrations:**
- `20251120_add_mr_category_system.sql` - Sunday Clinic 3-template system
- `20251121_create_patient_mr_history.sql` - MR history tracking
- `add-patient-auth.sql` - Patient authentication tables
- `create-patient-password-reset-table.sql` - Password reset feature

### Data Encryption

**Patient intake data** is encrypted at rest:
- Uses `INTAKE_ENCRYPTION_KEY` from environment
- Key ID versioning: `INTAKE_ENCRYPTION_KEY_ID=v1`
- Sensitive fields encrypted before database storage
- Decryption happens in service layer

---

## 🔐 Authentication & Authorization

### Patient Authentication (JWT)

**Location:** `/staff/backend/routes/patients-auth.js`

**Flow:**
1. Registration → Email verification required
2. Login → JWT token issued (7-day expiry)
3. Token stored in localStorage
4. Bearer token sent in Authorization header

**Endpoints:**
- `POST /api/patients-auth/register` - Register new patient
- `POST /api/patients-auth/login` - Patient login
- `POST /api/patients-auth/verify-email` - Verify email token
- `POST /api/patients-auth/forgot-password` - Request password reset
- `POST /api/patients-auth/reset-password` - Reset password
- `GET /api/patients-auth/profile` - Get patient profile (protected)

**Security Features:**
- bcrypt password hashing
- Email verification required
- Failed login attempt tracking (5 attempts = 15-min lock)
- Password reset tokens with expiry

### Staff Authentication (JWT)

**Location:** `/staff/backend/routes/auth.js`

**Flow:**
1. Login with email/password
2. JWT token issued
3. Role-based permissions checked
4. Google OAuth optional

**Endpoints:**
- `POST /api/auth/login` - Staff login
- `POST /api/auth/google` - Google OAuth login
- `GET /api/auth/profile` - Get staff profile
- `POST /api/auth/change-password` - Change password

**Roles & Permissions:**
- Superadmin - Full access
- Admin - Most operations
- Staff - Limited access
- Role-based UI hiding (`.superadmin-only` CSS class)

### JWT Middleware

**Location:** `/staff/backend/middleware/auth.js`

```javascript
// Protect routes with verifyToken middleware
router.get('/protected', verifyToken, handler);

// Optional patient-specific verification
router.get('/patient-route', verifyPatientToken, handler);

// Check permissions
router.post('/admin-only', verifyToken, requireRole(['superadmin', 'admin']), handler);
```

**JWT Configuration:**
- `JWT_SECRET` - Required environment variable (32+ chars)
- `JWT_EXPIRES_IN=7d` - Default token expiry
- Tokens verified on every protected request

### Security Middleware Stack

1. **Helmet** - Security headers
2. **CORS** - Configured for production domain
3. **Rate Limiting** - Disabled in dev, configure for production
4. **JWT Verification** - Protected route middleware
5. **Request Logging** - All requests logged with context
6. **Metrics** - Performance tracking

---

## 🌐 API Structure

### Base URL: `/api`

### API Route Files

Location: `/staff/backend/routes/`

#### Public Routes (No Auth Required)
- `05-public-tindakan.js` - Public medical procedures list
- `patients-auth.js` - Patient registration/login

#### Protected Routes (JWT Required)

**Patient Management:**
- `patients.js` - Patient CRUD operations
- `patient-intake.js` - Patient intake form submission
- `patient-records.js` - Patient medical records

**Medical Operations:**
- `sunday-clinic.js` - Sunday Clinic medical records (3-template system)
- `sunday-appointments.js` - Sunday Clinic appointments
- `medical-exams.js` - Medical examination records
- `visits.js` - Patient visits
- `medical-records.js` - General medical records

**Practice Operations:**
- `obat.js` - Medication inventory management
- `02-tindakan-api.js` - Medical procedures (protected)
- `practice-schedules.js` - Practice schedule management
- `appointments.js` - Appointment management
- `appointment-archive.js` - Archived appointments

**Billing:**
- `billings.js` - Billing management
- `visit-invoices.js` - Visit invoice generation

**Administration:**
- `auth.js` - Staff authentication
- `roles.js` - Role management
- `dashboard-stats.js` - Dashboard statistics
- `analytics.js` - Analytics data
- `announcements.js` - System announcements

**Real-time & Communication:**
- `chat.js` - Real-time chat with Socket.IO
- `notifications.js` - Push notifications
- `logs.js` - System logs
- `status.js` - System status

**Utilities:**
- `pdf.js` - PDF generation
- `email-settings.js` - Email configuration

### API Documentation

**Swagger UI available at:** `/api-docs`

Configuration: `/staff/backend/config/swagger.js`

### Socket.IO Real-time Features

**Server:** `/staff/backend/server.js`

**Features:**
- Real-time chat between staff and patients
- Live notifications
- System status updates
- Activity logs

**Connection:**
```javascript
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
    }
});
```

---

## 🎨 Frontend Architecture

### Patient Portal (`/public`)

**Architecture:** Traditional multi-page application (MPA)

**Key Pages:**
- `index.html` - Landing page
- `register.html` - Patient registration
- `verify-email.html` - Email verification
- `patient-dashboard.html` - Patient dashboard
- `patient-intake.html` - Medical intake form (large, complex)
- `booking-appointment.html` - Appointment booking
- `patient-visit-history.html` - Visit history
- `practice-locations.html` - Clinic locations
- `practice-schedule.html` - Practice schedule

**Key Scripts:**
- `api-service.js` - Centralized API client
- `vps-auth-v2.js` - Authentication handling
- `patient-intake.js` - Intake form logic
- `booking-appointment.js` - Appointment booking

**Authentication Pattern:**
```javascript
// Store token in localStorage
localStorage.setItem('patientToken', token);

// Include in requests
headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('patientToken')
}
```

### Staff Portal (`/staff/public`)

**Architecture:** AdminLTE-based single-page-like application

**Key Pages:**
- `kelola-patients.html` - Patient management
- `kelola-obat.html` - Medication inventory
- `kelola-tindakan.html` - Procedures management
- `sunday-clinic.html` - Sunday Clinic medical records
- `sunday-appointments.html` - Sunday Clinic appointments
- `billing.html` - Billing management
- `dashboard.html` - Analytics dashboard
- `finance-dashboard.html` - Financial reports
- `klinik-private.html` - Private clinic operations

**Key Scripts:**
- `auth.js` - Staff authentication & authorization
- `patients-v2.js` - Patient management
- `sunday-clinic.js` - Main Sunday Clinic integration (647 lines)
- `sunday-clinic/` - Modular component system
  - `main.js` - Component loader
  - `utils/constants.js` - Category configs
  - `utils/api-client.js` - Backend API
  - `utils/state-manager.js` - Shared state
  - `components/obstetri/` - Obstetri template
  - `components/gyn-repro/` - Gyn Repro template
  - `components/gyn-special/` - Gyn Special template
  - `components/shared/` - Shared UI components
- `billing.js` - Billing operations
- `chat.js` - Real-time chat
- `mobile-helper.js` - Mobile responsiveness
- `mobile-action-bar.js` - Mobile action bar

**Shared Components Strategy:**

**Goal:** Keep sidebar/header defined once and reused everywhere

1. Create `public/partials/sidebar.html` with `<aside class="main-sidebar">...</aside>`
2. Create `public/partials/header.html` with navbar
3. Create `public/scripts/layout.js` to inject partials
4. Preserve role toggles (`.superadmin-only`, `.medical-exam-menu`)
5. Re-run AdminLTE's PushMenu + `mobile-menu.js` after injection

**Mobile Responsiveness:**
- AdminLTE handles basic responsive layout
- Custom mobile helpers in `mobile-helper.js` and `mobile-action-bar.js`
- Mobile-specific CSS overrides

**State Management:**
- No framework (Vue/React) - vanilla JS
- State stored in module closures or global objects
- LocalStorage for persistence
- Sunday Clinic uses centralized `state-manager.js`

---

## ⚙️ Environment Configuration

### Required Environment Variables

**Location:** `/staff/backend/.env`

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Database Configuration
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=dibyaklinik
DB_CONNECTION_LIMIT=10

# JWT Configuration (REQUIRED)
JWT_SECRET=your_very_strong_secret_key_here_minimum_32_characters
JWT_EXPIRES_IN=7d

# CORS Configuration
CORS_ORIGIN=https://praktekdrdibya.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
MAX_FAILED_LOGIN_ATTEMPTS=5
LOGIN_LOCK_TIME_MS=900000

# Patient Intake Encryption (REQUIRED)
INTAKE_ENCRYPTION_KEY=REPLACE_WITH_32_BYTE_BASE64_KEY
INTAKE_ENCRYPTION_KEY_ID=v1

# Email Configuration (Nodemailer)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your_email@example.com
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=noreply@praktekdrdibya.com

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Twilio SMS (Optional)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890

# Redis (Optional - for Socket.IO scaling)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

### Security Notes

1. **JWT_SECRET** - MUST be 32+ characters, cryptographically random
2. **INTAKE_ENCRYPTION_KEY** - 32-byte base64-encoded key for AES encryption
3. **Never commit .env** - Use `.env.example` as template
4. **Rotate secrets regularly** - Especially after team member departure

---

## 🧪 Testing

### Test Location: `/staff/backend/tests/` (ARCHIVED in `unused/`)

**Framework:** Jest v30
**HTTP Testing:** Supertest

### Test Structure
- `unit/` - Unit tests for utilities, services
- `integration/` - API integration tests

### Running Tests

```bash
cd staff/backend
npm test                  # Run all tests with coverage
npm run test:watch        # Watch mode
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
```

### Test Patterns

```javascript
// API integration test
describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@example.com', password: 'password' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.token).toBeDefined();
    });
});
```

### Current Testing Status

Tests are **archived** in `unused/` folders. To run tests:
1. Move `backend/unused/tests/` back to `backend/tests/`
2. Run tests
3. Return folder to `unused/` to keep production tree lean

---

## 🚀 Deployment

### Deployment Target: VPS

**Production URL:** https://praktekdrdibya.com

### Deployment Architecture

```
Internet → Nginx (443) → Node.js Express (3000)
                      ↓
                   MySQL (3306)
                      ↓
                   Redis (6379)
```

### Deployment Guide

**Primary Documentation:** `/DEPLOYMENT_GUIDE.md`

### Deployment Checklist

1. **Environment Setup**
   - Copy `.env.example` to `.env`
   - Set all required environment variables
   - Generate strong JWT_SECRET and INTAKE_ENCRYPTION_KEY

2. **Database Setup**
   - Create database `dibyaklinik`
   - Run all migrations in order
   - Verify schema with latest migrations

3. **Backend Deployment**
   - Install dependencies: `npm install --production`
   - Start server: `npm start`
   - Use PM2 for process management: `pm2 start server.js --name dibyaklinik-api`

4. **Frontend Deployment**
   - Copy `/public` to web root
   - Copy `/staff/public` to web root subdirectory
   - Configure Nginx to serve static files

5. **Nginx Configuration**
   ```nginx
   server {
       listen 443 ssl;
       server_name praktekdrdibya.com;

       # SSL configuration
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       # Patient portal
       location / {
           root /var/www/dokterdibya/public;
           try_files $uri $uri/ =404;
       }

       # Staff portal
       location /staff {
           alias /var/www/dokterdibya/staff/public;
           try_files $uri $uri/ =404;
       }

       # API proxy
       location /api {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }

       # Socket.IO
       location /socket.io {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

6. **Post-Deployment**
   - Test all critical paths
   - Verify SSL certificate
   - Check logs: `pm2 logs dibyaklinik-api`
   - Monitor performance

### Deployment Script

**Location:** `/staff/setup_vps_for_github_deploy.sh`

### Backup Strategy

**Location:** `/staff/backups/`

Regular database backups recommended via cron:
```bash
0 2 * * * mysqldump -u user -p dibyaklinik > /backups/dibyaklinik_$(date +\%Y\%m\%d).sql
```

---

## 📚 Important Files & Documentation

### Critical Documentation (57 .md files)

**Root Documentation:**
- `README.md` - Monorepo overview
- `DEPLOYMENT_GUIDE.md` - Complete deployment guide
- `CLAUDE.md` - This file (AI assistant guide)

**Feature Documentation:**
- `SUNDAY_CLINIC_3_TEMPLATE_SYSTEM.md` - 3-template system architecture
- `PHASE1_MR_CATEGORY_SYSTEM.md` - MR category implementation
- `PHASE2_COMPONENT_ARCHITECTURE_PROGRESS.md` - Component refactoring
- `PHASE3_COMPLETION_SUMMARY.md` - Phase 3 summary
- `PATIENT_INTAKE_FINAL_SPEC.md` - Patient intake specification
- `PATIENT_INTAKE_DUPLICATE_PREVENTION.md` - Duplicate prevention
- `PATIENT_INTAKE_DB_IMPLEMENTATION.md` - Database implementation
- `JWT_AUTH_IMPLEMENTATION.md` - JWT authentication
- `EMAIL_VERIFICATION_SYSTEM.md` - Email verification
- `GOOGLE_OAUTH_SETUP.md` - Google OAuth setup
- `PREGNANCY_HISTORY_REDESIGN.md` - Pregnancy history feature
- `ANNOUNCEMENT_PREVIEW_FEATURE.md` - Announcements feature

**Implementation Documentation:**
- `CHECKBOX_GRID_LAYOUT.md` - UI component implementation
- `INTAKE_FLOW_DIAGRAM.md` - Patient intake flow
- `GPT_AUTO_ANAMNESA_SPEC.md` - AI-assisted anamnesis
- `SMART_TRIAGE_IMPLEMENTATION.md` - Triage system
- `WEB_PATIENT_SYNC_IMPLEMENTATION.md` - Patient sync

**Testing & Validation:**
- `TESTING_AND_VALIDATION_PLAN.md` - Comprehensive test plan

**Staff Documentation:**
- `/staff/README.md` - Staff portal overview
- `/staff/REGISTRATION_FLOW.md` - Registration process
- `/staff/PERMISSION_SYSTEM_IMPLEMENTATION.md` - Permissions
- `/staff/SECURITY_IMPLEMENTATION.md` - Security measures
- `/staff/PRIVACY_RULES.md` - Privacy compliance

**Android App:**
- `/android-app/README.md` - Android app overview
- `/android-app/ANDROID_APP_SPECIFICATION.md` - App specification
- `/android-app/BUILD_APK.md` - Build instructions
- `/android-app/FIGMA_DESIGN_SPECIFICATION.md` - Design specs

### Configuration Files

- `.env.example` - Environment variable template
- `.gitignore` - Git ignore patterns
- `.vscode/settings.json` - VSCode settings
- `package.json` - Dependencies
- `/staff/backend/config/swagger.js` - API documentation

### Key Backend Files

- `server.js` - Main Express server
- `db.js` - MySQL connection pool
- `/middleware/auth.js` - JWT authentication
- `/middleware/errorHandler.js` - Error handling
- `/middleware/validation.js` - Request validation
- `/utils/logger.js` - Winston logger
- `/services/sundayClinicService.js` - Sunday Clinic business logic

### Key Frontend Files

**Patient Portal:**
- `patient-intake.html` - Large intake form (complex)
- `api-service.js` - API client
- `vps-auth-v2.js` - Authentication

**Staff Portal:**
- `sunday-clinic.js` - Main integration (647 lines)
- `sunday-clinic/main.js` - Component loader
- `auth.js` - Staff authentication
- `patients-v2.js` - Patient management
- `mobile-helper.js` - Mobile responsiveness

---

## 🔧 Common Tasks

### Adding a New API Endpoint

1. **Create/Edit Route File** in `/staff/backend/routes/`
   ```javascript
   const express = require('express');
   const router = express.Router();
   const { verifyToken } = require('../middleware/auth');

   router.post('/my-endpoint', verifyToken, async (req, res) => {
       try {
           // Business logic
           res.json({ success: true, data: result });
       } catch (error) {
           logger.error('Error:', error);
           res.status(500).json({ success: false, message: error.message });
       }
   });

   module.exports = router;
   ```

2. **Register Route** in `server.js`
   ```javascript
   const myRoutes = require('./routes/my-routes');
   app.use('/api/my-routes', myRoutes);
   ```

3. **Document in Swagger** (optional)
   Add JSDoc comments or update Swagger config

4. **Test the Endpoint**
   - Manual testing with curl/Postman
   - Write integration test (if tests are active)

### Adding a Database Migration

1. **Create Migration File** in `/staff/backend/migrations/`
   ```sql
   -- 20251124_add_new_feature.sql

   ALTER TABLE table_name
   ADD COLUMN new_column VARCHAR(255);

   CREATE INDEX idx_new_column ON table_name(new_column);
   ```

2. **Apply Migration**
   ```bash
   mysql -u user -p dibyaklinik < migrations/20251124_add_new_feature.sql
   ```

3. **Document Migration**
   - Add entry to migration list in this file
   - Create feature documentation if significant

### Adding a Sunday Clinic Template Component

1. **Determine Category:** obstetri, gyn-repro, or gyn-special

2. **Create Component Files** in `/staff/public/scripts/sunday-clinic/components/<category>/`
   - `form.js` - Form field definitions
   - `renderer.js` - Rendering logic
   - `validator.js` - Validation rules

3. **Update Constants** in `utils/constants.js`
   ```javascript
   CATEGORIES: {
       MY_CATEGORY: {
           id: 'my_category',
           prefix: 'MRCAT',
           label: 'My Category',
           fields: [/* field definitions */]
       }
   }
   ```

4. **Register in Loader** in `main.js`
   ```javascript
   async loadComponent(category) {
       const components = {
           obstetri: () => import('./components/obstetri/form.js'),
           gyn_repro: () => import('./components/gyn-repro/form.js'),
           gyn_special: () => import('./components/gyn-special/form.js'),
           my_category: () => import('./components/my-category/form.js')
       };
       return components[category]();
   }
   ```

### Adding Staff Portal Page

1. **Create HTML Page** in `/staff/public/`
   ```html
   <!DOCTYPE html>
   <html>
   <head>
       <title>My Feature</title>
       <!-- AdminLTE CSS -->
   </head>
   <body class="hold-transition sidebar-mini">
       <div class="wrapper">
           <!-- Header -->
           <!-- Sidebar -->
           <div class="content-wrapper">
               <!-- Page content -->
           </div>
       </div>
       <script src="scripts/auth.js"></script>
       <script src="scripts/my-feature.js"></script>
   </body>
   </html>
   ```

2. **Create JS Module** in `/staff/public/scripts/`
   ```javascript
   // my-feature.js
   (function() {
       const API_BASE = '/api';

       async function loadData() {
           const response = await fetch(`${API_BASE}/my-endpoint`, {
               headers: {
                   'Authorization': 'Bearer ' + localStorage.getItem('token')
               }
           });
           const data = await response.json();
           // Handle data
       }

       // Initialize
       document.addEventListener('DOMContentLoaded', loadData);
   })();
   ```

3. **Add to Sidebar** (once shared sidebar is implemented)

### Debugging Common Issues

**Issue: JWT Authentication Fails**
- Check `JWT_SECRET` is set in `.env`
- Verify token is being sent in `Authorization` header
- Check token hasn't expired (default 7 days)
- Look at logs: `logger.error` messages

**Issue: Database Connection Fails**
- Verify MySQL is running
- Check `.env` database credentials
- Test connection: `mysql -u user -p -h host dibyaklinik`
- Check connection pool logs in `db.js`

**Issue: CORS Errors**
- Verify `CORS_ORIGIN` in `.env` matches frontend URL
- Check browser console for specific CORS error
- Ensure credentials are included in frontend requests

**Issue: Socket.IO Not Connecting**
- Check Nginx WebSocket proxy configuration
- Verify Socket.IO server is running (port 3000)
- Check browser console for connection errors
- Test direct connection: `http://localhost:3000/socket.io/`

**Issue: Frontend Not Loading**
- Check browser console for errors
- Verify static file paths are correct
- Check Nginx configuration for static file serving
- Ensure files have correct permissions

---

## 🔒 Security Considerations

### Authentication Security

1. **Password Hashing:** bcrypt with salt rounds
2. **JWT Tokens:** Short expiry (7 days), secure secrets
3. **Failed Login Protection:** 5 attempts = 15-min lockout
4. **Email Verification:** Required for patient accounts
5. **Password Reset:** Time-limited tokens

### Data Security

1. **Patient Data Encryption:** Intake forms encrypted at rest
2. **SQL Injection Prevention:** Parameterized queries throughout
3. **XSS Prevention:** Input validation, output encoding
4. **CSRF Protection:** Consider implementing tokens for state-changing operations

### Network Security

1. **HTTPS:** Enforced in production
2. **Helmet:** Security headers (CSP, HSTS, etc.)
3. **CORS:** Restricted to production domain
4. **Rate Limiting:** Configure in production (currently disabled)

### Database Security

1. **Principle of Least Privilege:** Database user has minimal required permissions
2. **Connection Pooling:** Prevents connection exhaustion
3. **Timezone Consistency:** GMT+7 across all layers
4. **Backups:** Regular automated backups

### Code Security

1. **Dependency Updates:** Keep npm packages updated
2. **Environment Variables:** Never commit secrets
3. **Error Messages:** Don't leak sensitive info in production
4. **Logging:** Log security events, sanitize logs

### Security Checklist for New Features

- [ ] Input validation on all user inputs
- [ ] Parameterized SQL queries (no string concatenation)
- [ ] Authentication required for protected endpoints
- [ ] Authorization checks (role/permission verification)
- [ ] Output encoding for XSS prevention
- [ ] Rate limiting for sensitive operations
- [ ] Logging of security-relevant actions
- [ ] Error handling doesn't leak sensitive data
- [ ] Sensitive data encrypted if stored
- [ ] HTTPS enforced for sensitive operations

---

## 📋 Quick Reference

### Starting the Application

```bash
# Backend
cd staff/backend
npm install
node server.js

# Development with auto-reload
npm run dev
```

### API Base URL
- Development: `http://localhost:3000/api`
- Production: `https://praktekdrdibya.com/api`

### Key Ports
- Express API: 3000
- MySQL: 3306
- Redis: 6379
- Nginx: 80, 443

### Important Commands

```bash
# Database
mysql -u user -p dibyaklinik
mysqldump -u user -p dibyaklinik > backup.sql

# Process Management (Production)
pm2 start server.js --name dibyaklinik-api
pm2 logs dibyaklinik-api
pm2 restart dibyaklinik-api
pm2 stop dibyaklinik-api

# Git
git status
git add .
git commit -m "Descriptive message"
git push -u origin claude/<branch-name>
```

### Quick Debug Checklist

1. Check `.env` file exists and is configured
2. Verify database is running and accessible
3. Check server logs for errors
4. Verify JWT_SECRET is set
5. Check browser console for frontend errors
6. Verify API endpoint URLs are correct
7. Check CORS configuration
8. Verify authentication tokens are being sent

---

## 🎯 Project Goals & Future Considerations

### Current Focus Areas

1. **Modularization:** Continue refactoring monolithic code into modules
2. **Mobile Responsiveness:** Improve mobile UX
3. **Shared Components:** Implement sidebar/header partials system
4. **Testing:** Reactivate and expand test coverage
5. **Documentation:** Keep docs updated with code changes

### Technical Debt

1. **Build System:** Consider adding bundler for frontend optimization
2. **Testing:** Jest tests currently archived, need reactivation
3. **Migration Framework:** Consider Knex.js or similar for migrations
4. **State Management:** Evaluate lightweight state management library
5. **Rate Limiting:** Enable and configure for production
6. **Error Handling:** Standardize error responses across all endpoints

### Scalability Considerations

1. **Database:** Connection pooling configured, monitor for bottlenecks
2. **Caching:** Redis available, expand usage for frequently accessed data
3. **File Storage:** Consider CDN for static assets
4. **Load Balancing:** Nginx configured, can add multiple backend instances
5. **Monitoring:** Add APM tool (New Relic, DataDog, etc.)

---

## 📞 Getting Help

### For AI Assistants Working on This Codebase

1. **Always read this file first** before making changes
2. **Check existing documentation** (57 .md files) for feature context
3. **Follow conventions** outlined in this guide
4. **Prefer editing over creating** - reuse existing files
5. **Test thoroughly** - especially authentication and data integrity
6. **Document changes** - update relevant .md files
7. **Ask clarifying questions** - if requirements are unclear

### Key Documentation to Reference

- **Sunday Clinic:** `SUNDAY_CLINIC_3_TEMPLATE_SYSTEM.md`
- **Patient Intake:** `PATIENT_INTAKE_FINAL_SPEC.md`
- **Authentication:** `JWT_AUTH_IMPLEMENTATION.md`
- **Deployment:** `DEPLOYMENT_GUIDE.md`
- **Staff Portal:** `/staff/README.md`

### When Making Changes

1. **Branch:** Always work on claude/* branches
2. **Commit:** Clear, descriptive messages
3. **Test:** Verify changes work end-to-end
4. **Document:** Update relevant documentation
5. **Review:** Check for security implications

---

**Last Updated:** 2025-11-24
**Maintainer:** AI Assistant (Claude)
**Repository:** dokterdibya (monorepo)

---

*This document is a living guide. Update it as the codebase evolves to keep AI assistants informed and effective.*
