# How to Access AI Interview Demo Page

## Issue: Page Redirects to Index

The `book-appointment-ai.html` page requires authentication because the AI endpoints use JWT tokens.

---

## ✅ Solution 1: Login First (Recommended)

### Step 1: Login as Patient
1. Go to `https://dokterdibya.com/index.html`
2. Login dengan email yang sudah terdaftar:
   - Email: `konchelskydaf@gmail.com`
   - Password: (password yang Anda buat saat registrasi)
3. Or register new account if needed

### Step 2: Access AI Demo
1. After login, go to `https://dokterdibya.com/book-appointment-ai.html`
2. Page will load successfully with authentication token
3. Fill form and test AI interview flow

---

## ✅ Solution 2: Use Test Page (No Auth Required)

I created a test page that shows the authentication requirement:

```
https://dokterdibya.com/test-ai-demo.html
```

This page:
- Shows API endpoint tests
- Demonstrates that endpoints require JWT
- Helps debug connectivity issues
- No redirect - stays on page

---

## ✅ Solution 3: Remove Auth from AI Endpoints (For Demo Only)

If you want to test WITHOUT login, edit `/var/www/dokterdibya/staff/backend/routes/ai.js`:

### Current (with auth):
```javascript
router.post('/api/ai/detect-category', verifyToken, async (req, res) => {
```

### Change to (without auth):
```javascript
router.post('/api/ai/detect-category', async (req, res) => {
```

Do this for all 3 endpoints:
- `/api/ai/detect-category`
- `/api/ai/interview/questions`
- `/api/ai/interview/process`

Then restart:
```bash
pm2 restart sunday-clinic
```

**⚠️ Warning:** This removes security. Only do this for testing, then add auth back for production.

---

## 🎯 Recommended Flow

The correct production flow should be:

```
1. Patient visits website
   ↓
2. Patient registers/logs in at /index.html
   ↓
3. Patient goes to dashboard
   ↓
4. Patient clicks "Book Appointment"
   ↓
5. AI Interview page opens (WITH auth token)
   ↓
6. AI interview works perfectly
```

---

## 🔧 Why the Redirect Happens

When you visit `book-appointment-ai.html` without being logged in:

1. Page loads fine (HTML is public)
2. JavaScript tries to call `/api/ai/detect-category`
3. API returns 401 Unauthorized (no token)
4. Browser might have cached redirect rules or session checks
5. User gets redirected to `/index.html`

The redirect is likely from:
- Browser cache/cookies
- Service worker
- Session expiry check
- Or previous page state

---

## ✅ Quick Test (As Patient)

### Option A: Login Existing Account
```
1. Go to: https://dokterdibya.com/index.html
2. Login dengan: konchelskydaf@gmail.com
3. After login success, go to: https://dokterdibya.com/book-appointment-ai.html
4. Test AI interview flow
```

### Option B: Test from Patient Dashboard
```
1. Login at /index.html
2. Go to /patient-dashboard.html
3. Click "Book Appointment" (when integrated)
4. AI interview modal opens
```

---

## 📝 Integration Todo

To integrate AI interview into the main flow:

1. **Add to Patient Dashboard:**
   - Add "Book Appointment" button
   - Opens modal or navigates to booking page
   - AI interview flows automatically

2. **Add to Staff Appointment Page:**
   - Staff can book appointment for walk-in patients
   - AI interview helps gather anamnesa
   - Data saved to `appointments` table

3. **Use in Sunday Clinic:**
   - When doctor opens patient with `pre_anamnesa` data
   - Auto-fill anamnesa form
   - Show "AI-Generated" badge

---

## 🆘 Troubleshooting

### Still redirecting after login?
- Clear browser cache and cookies
- Try incognito/private window
- Check browser console for errors
- Verify token is stored: `localStorage.getItem('auth_token')`

### API returning 401?
- Check token exists in localStorage/sessionStorage
- Verify JWT_SECRET in .env matches
- Check PM2 logs: `pm2 logs sunday-clinic`

### OpenAI errors?
- Check API key in .env is valid
- Verify billing enabled on OpenAI account
- System will fallback to hardcoded questions

---

**Summary:** Login first at `/index.html`, then access `/book-appointment-ai.html` ✅
