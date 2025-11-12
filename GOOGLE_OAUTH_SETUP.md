# Google OAuth Setup Guide

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a Project" → "New Project"
3. Name it: `Dibya Klinik Patient Auth` (or any name)
4. Click "Create"

## Step 2: Enable Google+ API

1. In your project dashboard, go to **APIs & Services** → **Library**
2. Search for "Google+ API"
3. Click on it and press **Enable**

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. If prompted to configure consent screen first:
   - Click "CONFIGURE CONSENT SCREEN"
   - Choose **External** (for public access)
   - Fill in:
     - App name: `Dibya Klinik`
     - User support email: `info@dokterdibya.com`
     - Developer contact: `info@dokterdibya.com`
   - Click **Save and Continue** through all steps
   
4. Back to Create OAuth client ID:
   - Application type: **Web application**
   - Name: `Dibya Klinik Web Client`
   
5. Add **Authorized JavaScript origins**:
   ```
   https://dokterdibya.com
   https://www.dokterdibya.com
   ```
   
6. Add **Authorized redirect URIs**:
   ```
   https://dokterdibya.com
   https://dokterdibya.com/patient-dashboard.html
   https://www.dokterdibya.com
   ```

7. Click **CREATE**

## Step 4: Copy Your Client ID

After creation, you'll see a popup with:
- **Client ID**: Something like `123456789-abcdef.apps.googleusercontent.com`
- **Client Secret**: (not needed for frontend)

Copy the **Client ID**.

## Step 5: Configure Backend

Edit `/var/www/dokterdibya/staff/backend/.env`:

```bash
# Add or update these lines
JWT_SECRET=your-random-64-character-secret-key-change-this-in-production
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_FROM_STEP_4
```

Example:
```bash
JWT_SECRET=a8f5f167f44f4964e6c998dee827110c03a0dbb8e7c5d87e4d27d7e6f1c8bdef
GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
```

## Step 6: Configure Frontend

Edit `/var/www/dokterdibya/public/js/auth.js`:

Find this line (around line 5):
```javascript
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
```

Replace with your actual Client ID:
```javascript
const GOOGLE_CLIENT_ID = '123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com';
```

## Step 7: Restart Backend

```bash
pm2 restart dibyaklinik-backend
```

## Step 8: Test

1. Open https://dokterdibya.com
2. Scroll to registration section (#daftar)
3. Click "Daftar dengan Google"
4. Sign in with your Google account
5. You should be redirected to the patient dashboard

## Troubleshooting

### Error: "redirect_uri_mismatch"
- Make sure `https://dokterdibya.com` is in Authorized JavaScript origins
- Check console.cloud.google.com credentials page

### Error: "invalid_client"
- Client ID doesn't match between frontend and Google Cloud
- Double-check the Client ID in auth.js

### Button doesn't work
- Check browser console for errors
- Verify Google Sign-In API script is loaded: `<script src="https://accounts.google.com/gsi/client" async defer></script>`
- Make sure GOOGLE_CLIENT_ID is not the placeholder text

### Backend error: "Google auth error"
- Check backend .env has correct GOOGLE_CLIENT_ID
- Restart backend: `pm2 restart dibyaklinik-backend`
- Check logs: `pm2 logs dibyaklinik-backend`

## Security Notes

1. **Never commit** your Client Secret to git
2. **JWT_SECRET** should be a random 64+ character string
3. Keep your `.env` file secure with proper permissions: `chmod 600 .env`
4. Regularly rotate your JWT_SECRET (will invalidate all existing tokens)

## Alternative: Configure Redirect to Patient Intake Form

If you want users to go directly to the patient intake form after login instead of dashboard:

Edit `/var/www/dokterdibya/public/js/auth.js`, change line 6:

```javascript
const REDIRECT_AFTER_LOGIN = '/patient-intake.html'; // Direct to intake form
```

This way, after successful registration or login, users are immediately taken to fill out their medical history form.
