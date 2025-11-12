# JWT Authentication Implementation

## Overview
Implemented JWT-based authentication for patient registration and login with support for:
- Email/password registration and login
- Google OAuth sign-in
- JWT token generation and verification
- Secure password hashing with bcrypt

## Database Structure

### Table: `web_patients`
Stores patient accounts registered through the website:
- `id` - Auto-increment primary key
- `fullname` - Patient's full name
- `email` - Unique email address
- `phone` - Contact phone number
- `password` - Bcrypt hashed password (NULL for Google-only accounts)
- `google_id` - Google OAuth ID (NULL for email-only accounts)
- `photo_url` - Profile photo URL (from Google)
- `registration_date` - Account creation timestamp
- `status` - Account status (active/inactive/suspended)

## API Endpoints

### POST `/api/patients/register`
Register new patient with email and password.

**Request Body:**
```json
{
  "fullname": "John Doe",
  "email": "john@example.com",
  "phone": "+62812345678",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Registrasi berhasil",
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "fullname": "John Doe",
    "email": "john@example.com",
    "phone": "+62812345678",
    "role": "patient"
  }
}
```

### POST `/api/patients/login`
Login with email and password.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login berhasil",
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "fullname": "John Doe",
    "email": "john@example.com",
    "phone": "+62812345678",
    "role": "patient"
  }
}
```

### POST `/api/patients/auth/google`
Login or register with Google OAuth.

**Request Body:**
```json
{
  "credential": "google_jwt_credential"
}
```

**Response:**
```json
{
  "message": "Login dengan Google berhasil",
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "fullname": "John Doe",
    "email": "john@example.com",
    "phone": null,
    "photo_url": "https://...",
    "role": "patient"
  }
}
```

### GET `/api/patients/verify`
Verify JWT token validity.

**Headers:**
```
Authorization: Bearer jwt_token_here
```

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": 1,
    "email": "john@example.com",
    "fullname": "John Doe",
    "role": "patient"
  }
}
```

### GET `/api/patients/profile`
Get current user profile.

**Headers:**
```
Authorization: Bearer jwt_token_here
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "fullname": "John Doe",
    "email": "john@example.com",
    "phone": "+62812345678",
    "photo_url": null,
    "registration_date": "2025-11-12T10:30:00.000Z"
  }
}
```

## Frontend Integration

### Files Modified
- `/var/www/dokterdibya/public/index.html` - Added Google Sign-In API and auth.js
- `/var/www/dokterdibya/public/js/auth.js` - JWT authentication client

### Token Storage
JWT tokens are stored in localStorage:
- `patient_token` - JWT authentication token
- `patient_user` - User profile data (JSON string)

### Authentication Flow

#### Registration
1. User fills registration form
2. Frontend calls `/api/patients/register`
3. Backend validates data, hashes password, creates account
4. Backend returns JWT token
5. Frontend stores token and redirects to dashboard

#### Login
1. User fills login form
2. Frontend calls `/api/patients/login`
3. Backend validates credentials
4. Backend returns JWT token
5. Frontend stores token and redirects to dashboard

#### Google OAuth
1. User clicks "Daftar dengan Google"
2. Google Sign-In popup appears
3. User authorizes with Google
4. Frontend receives Google credential
5. Frontend sends credential to `/api/patients/auth/google`
6. Backend verifies with Google, creates/updates account
7. Backend returns JWT token
8. Frontend stores token and redirects to dashboard

## Environment Variables

Add to `/var/www/dokterdibya/staff/backend/.env`:

```env
# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production-use-random-64-char-string
JWT_EXPIRES_IN=7d

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id-from-console.cloud.google.com
```

## Security Features

1. **Password Hashing**: Uses bcrypt with default salt rounds (10)
2. **JWT Expiration**: Tokens expire after 7 days
3. **Token Verification**: Middleware validates JWT on protected routes
4. **Google OAuth**: Server-side verification of Google credentials
5. **Email Uniqueness**: Prevents duplicate registrations
6. **Status Management**: Accounts can be active/inactive/suspended

## Google OAuth Setup

To enable Google Sign-In:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized JavaScript origins: `https://dokterdibya.com`
6. Add authorized redirect URIs: `https://dokterdibya.com`
7. Copy Client ID to `.env` and `/var/www/dokterdibya/public/js/auth.js`

## Testing

Test the endpoints with curl:

```bash
# Register
curl -X POST https://dokterdibya.com/api/patients/register \
  -H "Content-Type: application/json" \
  -d '{"fullname":"Test User","email":"test@example.com","phone":"+62812345678","password":"test123"}'

# Login
curl -X POST https://dokterdibya.com/api/patients/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Verify token
curl -X GET https://dokterdibya.com/api/patients/verify \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Next Steps

1. **Create Patient Dashboard**: Build `/var/www/dokterdibya/public/patient-dashboard.html`
2. **Add Google Client ID**: Update `GOOGLE_CLIENT_ID` in auth.js and backend .env
3. **Add Logout**: Implement logout functionality in patient dashboard
4. **Password Reset**: Add forgot password / reset password flow
5. **Email Verification**: Add email verification on registration
6. **Profile Update**: Allow patients to update their profile information
