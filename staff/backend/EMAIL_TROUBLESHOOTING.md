# Password Reset Email Troubleshooting Guide

## Summary
The password reset email system at dokterdibya.com is **working correctly**. Emails are being sent successfully from the server. If users are not receiving emails, it's likely due to one of the following reasons:

## Issue Investigation Results

### ✅ What's Working
1. **SMTP Connection**: Successfully connected to smtp.hostinger.com:465
2. **Email Sending**: Emails are being sent with message IDs
3. **Backend API**: `/api/auth/forgot-password` endpoint is functional
4. **Email Template**: Updated with clear instructions and reset code
5. **Reset Link Generation**: Properly formatted URLs to reset-password.html

### 📧 Current Email Configuration
- **Host**: smtp.hostinger.com
- **Port**: 465 (SSL)
- **From**: info@dokterdibya.com
- **Status**: ✅ Connected and verified

### 🔍 Common Reasons Users Don't Receive Emails

1. **Spam Folder** (Most Common)
   - Emails from new domains often go to spam
   - **Solution**: Check spam/junk folder

2. **Email Filters**
   - Gmail, Yahoo, etc. may filter automated emails
   - **Solution**: Add info@dokterdibya.com to contacts

3. **Wrong Email Address**
   - User may have registered with different email
   - **Solution**: Verify email address in database

4. **Email Provider Blocking**
   - Some providers block emails from certain servers
   - **Solution**: Use different email provider or check server reputation

## Testing Email Delivery

Run this command to test email delivery:

```bash
cd /var/www/dokterdibya/staff/backend
node test-email.js your-email@example.com
```

## Updated Email Template

The password reset email now includes:
- Clear subject line: "Reset Password - dokterDIBYA"
- Reset code (6-character hex token)
- Direct reset link to dokterdibya.com/reset-password.html
- 1-hour expiration notice
- Professional formatting with emojis for better visibility

## How to Improve Email Deliverability

### 1. Add SPF Record
Add this TXT record to your DNS:
```
v=spf1 include:_spf.hostinger.com ~all
```

### 2. Add DKIM Record
Contact Hostinger support to get your DKIM key and add it to DNS

### 3. Add DMARC Record
Add this TXT record:
```
v=DMARC1; p=quarantine; rua=mailto:info@dokterdibya.com
```

### 4. Check Email Reputation
Use these tools:
- https://mxtoolbox.com/emailhealth/
- https://www.mail-tester.com/

## User Instructions

When users report not receiving emails, tell them to:

1. **Check spam/junk folder** (most common solution)
2. **Wait 2-3 minutes** (email delivery can be delayed)
3. **Add info@dokterdibya.com to contacts** before requesting reset
4. **Try a different email address** if issue persists
5. **Check email address is correct** in their profile

## Technical Details

### Password Reset Flow
1. User enters email at `/reset-password.html`
2. Frontend sends POST to `/api/auth/forgot-password`
3. Backend generates 6-character token (e.g., "A1B2C3")
4. Token is hashed and stored in `patient_password_reset_tokens` table
5. Email sent with plaintext token and reset link
6. User clicks link or enters token to reset password

### Database Tables
- `patient_password_reset_tokens`: Stores hashed tokens
- `email_templates`: Stores email template (password_reset)
- `email_settings`: Stores sender name and reply-to

### Email Template Placeholders
- `{user_name}`: Patient's full name
- `{reset_code}`: 6-character reset token
- `{reset_link}`: Full URL to reset page with token
- `{clinic_name}`: "Klinik Dr. Dibya"

## Logs

Check backend logs for email sending:
```bash
pm2 logs sunday-clinic | grep -i "email\|password"
```

Look for:
- "Email sent successfully" ✅
- "Password reset email sent to..." ✅
- "Failed to send email" ❌

## Support

If emails are still not being delivered after checking all above:
1. Check Hostinger email sending limits
2. Verify email account is active
3. Check server IP reputation
4. Contact Hostinger support for email delivery issues
