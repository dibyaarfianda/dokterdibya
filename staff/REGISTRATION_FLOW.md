# Patient Registration Flow

## Overview
Complete mobile-first registration flow for new patients with email verification and identity collection.

## Flow Diagram

```
┌─────────────────┐
│  register.html  │  Step 1: Email Registration
└────────┬────────┘
         │
         │ Submit email
         ▼
    [Send OTP Email]
         │
         ▼
┌─────────────────┐
│verify-email.html│  Step 2: Email Verification
└────────┬────────┘
         │
         │ Enter 6-digit OTP
         ▼
    [Verify OTP]
         │
         ▼
┌─────────────────┐
│set-password.html│  Step 3: Password Setup
└────────┬────────┘
         │
         │ Create password
         ▼
   [Create Account]
         │
         ▼
┌─────────────────┐
│identitas-awal.  │  Step 4: Personal Identity
│     html        │  (7-step conversational form)
└────────┬────────┘
         │
         │ Complete profile
         ▼
┌─────────────────┐
│   Dashboard     │  Patient Dashboard
└─────────────────┘
```

## Files Created

### 1. register.html
**Path**: `/var/www/dokterdibya/staff/public/register.html`
**URL**: `https://dokterdibya.com/staff/register.html`

**Features**:
- Email-only registration
- Animated gradient background with floating bubbles
- Email validation
- Mobile-first responsive design
- Loading state during submission
- Link to login page for existing users
- Benefits list to encourage registration

**Data Collected**:
- Email address

**API Endpoint**: `POST /auth/register`
**Request**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "verification_token": "abc123...",
  "message": "Verification code sent to email"
}
```

**Session Storage**:
- `registration_email`: User's email
- `verification_token`: Token for verification

---

### 2. verify-email.html
**Path**: `/var/www/dokterdibya/staff/public/verify-email.html`
**URL**: `https://dokterdibya.com/staff/verify-email.html`

**Features**:
- 6-digit OTP input with auto-focus
- Auto-paste support for OTP codes
- 2-minute countdown timer
- Resend code functionality
- Real-time validation
- Bouncing email icon animation
- Instructions and tips section

**Data Validation**:
- 6-digit numeric code
- Auto-advance to next input
- Backspace navigation
- Error shake animation

**API Endpoints**:

1. **Verify OTP**: `POST /auth/verify-email`
   **Request**:
   ```json
   {
     "email": "user@example.com",
     "code": "123456",
     "verification_token": "abc123..."
   }
   ```

   **Response**:
   ```json
   {
     "success": true,
     "verified_token": "xyz789...",
     "message": "Email verified successfully"
   }
   ```

2. **Resend Code**: `POST /auth/resend-verification`
   **Request**:
   ```json
   {
     "email": "user@example.com"
   }
   ```

   **Response**:
   ```json
   {
     "success": true,
     "verification_token": "new_token_123...",
     "message": "New verification code sent"
   }
   ```

**Session Storage**:
- `verified_token`: Token proving email verification

---

### 3. set-password.html
**Path**: `/var/www/dokterdibya/staff/public/set-password.html`
**URL**: `https://dokterdibya.com/staff/set-password.html`

**Features**:
- Password strength indicator (4 bars)
- Real-time requirement checking:
  - ✓ Minimum 8 characters
  - ✓ 1 uppercase letter (A-Z)
  - ✓ 1 lowercase letter (a-z)
  - ✓ 1 number (0-9)
- Password visibility toggle (👁️/🙈)
- Confirm password with match validation
- Strength levels: Lemah (Weak), Sedang (Medium), Kuat (Strong)
- Pulsing lock icon animation

**Password Requirements**:
- Length: >= 8 characters
- Uppercase: >= 1 letter
- Lowercase: >= 1 letter
- Number: >= 1 digit

**API Endpoint**: `POST /auth/set-password`
**Request**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "verified_token": "xyz789..."
}
```

**Response**:
```json
{
  "success": true,
  "token": "auth_token_abc...",
  "user_id": "P2025001",
  "message": "Account created successfully"
}
```

**Session Storage**:
- `auth_token`: Authentication token
- `user_id`: Patient ID
- Clears: `registration_email`, `verification_token`, `verified_token`

---

### 4. identitas-awal.html
**Path**: `/var/www/dokterdibya/staff/public/identitas-awal.html`
**URL**: `https://dokterdibya.com/staff/identitas-awal.html`

**Features**:
- 7-step conversational form with progress bar
- One question at a time (progressive disclosure)
- Welcome screen with "Mulai Sekarang" button
- Animated card transitions
- Auto-save to localStorage
- Auto-fill from user profile
- Conditional logic (skips spouse info if not married)
- Phone number formatting (08xxx → 628xxx)
- Age auto-calculation from DOB
- Success screen with checkmark animation
- Each step has emoji icon for visual appeal

**7 Steps**:
1. 😊 **Name**: Full name (required)
2. 🎂 **DOB & NIK**: Date of birth (required), Age (auto), NIK (optional)
3. 📱 **Contact**: Phone/WhatsApp (required), Emergency contact (optional)
4. 🏡 **Address**: Full address (optional)
5. 💍 **Marital Status**: Single/Married/Divorced (radio cards)
6. 👨‍👩‍👧 **Spouse Info**: Name, age, occupation (only if married)
7. 💼 **Additional**: Occupation, education, insurance, consent (required)

**Data Collected**:
- `patient_name` *
- `patient_dob` *
- `patient_age` (calculated)
- `nik`
- `patient_phone` * (formatted to 628)
- `patient_emergency_contact` (formatted to 628)
- `patient_address`
- `patient_marital_status`
- `patient_husband_name`
- `husband_age`
- `husband_job`
- `patient_occupation`
- `patient_education`
- `patient_insurance`
- `consent` * (checkbox)

**API Endpoint**: `POST /patients`
**Request**:
```json
{
  "patient_name": "Siti Nurhaliza",
  "patient_dob": "1990-05-15",
  "patient_age": 34,
  "nik": "1234567890123456",
  "patient_phone": "628123456789",
  "patient_emergency_contact": "628987654321",
  "patient_address": "Jl. Example No. 123, Jakarta",
  "patient_marital_status": "menikah",
  "patient_husband_name": "Ahmad Rahman",
  "husband_age": 36,
  "husband_job": "Pegawai Swasta",
  "patient_occupation": "Ibu Rumah Tangga",
  "patient_education": "sarjana",
  "patient_insurance": "BPJS",
  "consent": "on"
}
```

**Response**:
```json
{
  "success": true,
  "patient_id": "P2025001",
  "message": "Patient profile created successfully"
}
```

**Redirect**: `/patient-dashboard.html?patient_id=P2025001`

---

## Design Principles

### Mobile-First (WAP)
- Viewport optimized for mobile: `width=device-width, initial-scale=1, maximum-scale=1`
- Touch-friendly tap targets (minimum 44px)
- Responsive layouts that stack on mobile
- Large, readable fonts (16px+ for inputs to prevent zoom)
- Full-width buttons on mobile

### Visual Engagement
- **Animated Background**: Gradient with floating bubbles
- **Smooth Transitions**: Card enter/exit animations
- **Progress Indicators**: Visual progress bar showing "Langkah X dari 7"
- **Color Psychology**:
  - Primary: #6366f1 (Indigo - trust, professionalism)
  - Success: #10b981 (Green - completion, positive)
  - Danger: #ef4444 (Red - errors, warnings)
- **Emoji Icons**: Each step has contextual emoji for personality
- **Micro-interactions**: Button hover effects, input focus states

### User Experience
- **Progressive Disclosure**: Show one question at a time
- **Autosave**: Draft saved to localStorage every 1.5 seconds
- **Smart Navigation**: Skip irrelevant questions (spouse info if not married)
- **Validation Feedback**: Real-time validation with visual indicators
- **Loading States**: Spinners during async operations
- **Error Recovery**: Clear error messages with retry options

---

## Backend Requirements

### Database Schema

#### users table
```sql
CREATE TABLE users (
    id VARCHAR(20) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### email_verifications table
```sql
CREATE TABLE email_verifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    verification_token VARCHAR(255) NOT NULL,
    verified_token VARCHAR(255) DEFAULT NULL,
    expires_at TIMESTAMP NOT NULL,
    verified_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_token (verification_token)
);
```

#### patients table (extended)
```sql
ALTER TABLE patients ADD COLUMN user_id VARCHAR(20);
ALTER TABLE patients ADD FOREIGN KEY (user_id) REFERENCES users(id);
```

### API Endpoints Summary

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/auth/register` | POST | Register with email | No |
| `/auth/verify-email` | POST | Verify OTP code | No |
| `/auth/resend-verification` | POST | Resend OTP code | No |
| `/auth/set-password` | POST | Create password | No |
| `/patients` | POST | Create patient profile | Yes |

---

## Email Templates

### Verification Email
**Subject**: Kode Verifikasi Dibya Klinik

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {
            font-family: 'Arial', sans-serif;
            background: #f3f4f6;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            text-align: center;
            color: white;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
        }
        .content {
            padding: 40px 30px;
            text-align: center;
        }
        .otp-code {
            font-size: 48px;
            font-weight: bold;
            letter-spacing: 8px;
            color: #6366f1;
            background: #f3f4f6;
            padding: 20px;
            border-radius: 12px;
            margin: 30px 0;
        }
        .info {
            color: #6b7280;
            font-size: 14px;
            margin-top: 30px;
        }
        .footer {
            background: #f9fafb;
            padding: 20px;
            text-align: center;
            color: #9ca3af;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 Dibya Klinik</h1>
        </div>
        <div class="content">
            <h2>Kode Verifikasi Email Anda</h2>
            <p>Masukkan kode berikut untuk melanjutkan pendaftaran:</p>
            <div class="otp-code">{{OTP_CODE}}</div>
            <p class="info">
                Kode ini akan kedaluwarsa dalam <strong>2 menit</strong>.<br>
                Jika Anda tidak mendaftar, abaikan email ini.
            </p>
        </div>
        <div class="footer">
            © 2025 Dibya Klinik. All rights reserved.
        </div>
    </div>
</body>
</html>
```

---

## Security Considerations

1. **Email Verification**:
   - OTP expires after 2 minutes
   - Rate limiting on resend (max 3 attempts per hour)
   - Single-use verification tokens

2. **Password Security**:
   - Minimum 8 characters
   - Must contain uppercase, lowercase, and numbers
   - Hashed using bcrypt (cost factor 10+)
   - Never stored in plain text

3. **Session Management**:
   - JWT tokens with expiration
   - Secure, httpOnly cookies for web
   - Token refresh mechanism

4. **Data Protection**:
   - HTTPS only in production
   - Input sanitization
   - SQL injection prevention (parameterized queries)
   - XSS protection

---

## Testing Checklist

### register.html
- [ ] Valid email formats accepted
- [ ] Invalid email formats rejected
- [ ] Duplicate email shows error
- [ ] Loading state displays correctly
- [ ] Redirect to verify-email.html on success
- [ ] Login link works

### verify-email.html
- [ ] OTP inputs accept only numbers
- [ ] Auto-focus works between inputs
- [ ] Backspace navigation works
- [ ] Paste 6-digit code works
- [ ] Timer counts down correctly
- [ ] Resend button enables after timer
- [ ] Correct OTP redirects to set-password.html
- [ ] Incorrect OTP shows error with shake animation

### set-password.html
- [ ] Password requirements check in real-time
- [ ] Strength indicator updates correctly
- [ ] Confirm password validates match
- [ ] Toggle password visibility works
- [ ] Submit disabled until all requirements met
- [ ] Redirect to identitas-awal.html on success

### identitas-awal.html
- [ ] Welcome screen displays
- [ ] Progress bar updates correctly
- [ ] Navigation between steps works
- [ ] Spouse info skipped if not married
- [ ] Phone formatting works (08 → 628)
- [ ] Age calculates from DOB
- [ ] Autosave indicator appears
- [ ] Draft restoration works after refresh
- [ ] Form validation works
- [ ] Success screen displays on submit
- [ ] Redirect to dashboard on completion

---

## Deployment

### Files to Deploy
```
/var/www/dokterdibya/staff/public/
├── register.html
├── verify-email.html
├── set-password.html
├── identitas-awal.html
└── clear-intake-draft.html (utility)
```

### URLs
- Registration: `https://dokterdibya.com/staff/register.html`
- Verification: `https://dokterdibya.com/staff/verify-email.html`
- Set Password: `https://dokterdibya.com/staff/set-password.html`
- Identity Form: `https://dokterdibya.com/staff/identitas-awal.html`

### Configuration
- Ensure all API endpoints are configured in `api-service.js`
- Set up email service (SMTP) for sending OTP codes
- Configure CORS for API calls
- Set up session storage handling

---

## Future Enhancements

1. **Social Login**: Google, Facebook OAuth
2. **SMS Verification**: Alternative to email OTP
3. **Two-Factor Authentication**: Optional 2FA after login
4. **Profile Picture Upload**: During identity setup
5. **Document Upload**: KTP/ID card verification
6. **Progress Save Across Devices**: Cloud-based draft storage
7. **Multi-language Support**: English, Indonesian
8. **Accessibility**: Screen reader support, keyboard navigation
9. **Analytics**: Track drop-off points in registration flow
10. **A/B Testing**: Optimize conversion rates

---

## Support

For issues or questions about the registration flow:
- Check browser console for errors
- Verify API endpoints are responding
- Test email delivery service
- Review session storage values
- Check network tab for failed requests

---

**Last Updated**: 2025-11-21
**Version**: 1.0.0
**Author**: Claude Code
