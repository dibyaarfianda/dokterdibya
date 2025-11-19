# 🔒 PRIVACY & SECURITY RULES
**Last Updated:** 2025-11-19
**Status:** MANDATORY - ALL DEVELOPERS MUST FOLLOW

---

## ⚠️ CRITICAL RULE #1: NO EMAIL EXPOSURE

### **NEVER display, print, or expose email addresses in:**
- ❌ Web pages (any HTML output)
- ❌ Print templates (invoices, receipts, labels)
- ❌ User interfaces
- ❌ Client-side JavaScript variables
- ❌ API responses (except authentication endpoints)
- ❌ Logs visible to users
- ❌ PDF exports
- ❌ Reports

### **Email usage is ONLY allowed for:**
- ✅ Authentication (login)
- ✅ Internal server logs (never shown to users)
- ✅ Backend validation
- ✅ Email sending (as recipient address)

---

## ✅ RULE #2: ALWAYS USE STAFF NAMES

### **For display purposes, ALWAYS use:**
```javascript
// ✅ CORRECT
displayName = req.user.name || req.user.id || 'Staff'

// ❌ WRONG - Never fall back to email!
displayName = req.user.name || req.user.email  // FORBIDDEN
```

### **Priority order for display:**
1. **Primary:** `req.user.name` (Staff name)
2. **Fallback:** `req.user.id` (10-letter staff ID)
3. **Last resort:** `'Staff'` (Generic label)

**NEVER use email as fallback!**

---

## 🔑 RULE #3: USE STAFF ID FOR ALL OPERATIONS

### **All database operations MUST use staff ID:**

```javascript
// ✅ CORRECT - Use staff ID
const staffId = req.user.id  // 10-letter staff ID
await db.query('SELECT * FROM records WHERE created_by = ?', [staffId])

// ❌ WRONG - Don't use email or name
await db.query('SELECT * FROM records WHERE created_by = ?', [req.user.email])
await db.query('SELECT * FROM records WHERE staff_name = ?', [req.user.name])
```

### **Why use staff ID:**
- ✅ Immutable (doesn't change)
- ✅ Unique identifier
- ✅ Privacy-preserving
- ✅ Name changes don't break references
- ✅ Email changes don't break references

---

## 📋 RULE #4: DATABASE STORAGE

### **Store staff information as:**
```sql
-- ✅ CORRECT
created_by VARCHAR(10)     -- Staff ID (AEPQEBDQBW)
doctor_id VARCHAR(10)      -- Staff ID (UDZAQUCQWZ)
updated_by VARCHAR(10)     -- Staff ID (GEJXDAZEZM)

-- ❌ WRONG
created_by_email VARCHAR   -- Never store email
staff_email VARCHAR        -- Never store email
```

### **Display information separately:**
```sql
-- Store ID only
created_by = 'AEPQEBDQBW'

-- Lookup name when displaying
SELECT u.name FROM users u WHERE u.new_id = 'AEPQEBDQBW'
```

---

## 🖨️ RULE #5: PRINT TEMPLATES

### **Invoice/Receipt/Label Templates:**

```html
<!-- ✅ CORRECT -->
<div>Staff: {{ staffName }}</div>
<div>ID: {{ staffId }}</div>

<!-- ❌ WRONG -->
<div>Email: {{ staffEmail }}</div>  <!-- FORBIDDEN! -->
```

### **Etiket (Medicine Labels):**
```
✅ Prepared by: Dr. Dibya
✅ Staff ID: UDZAQUCQWZ

❌ Email: nanda.arfianda@gmail.com  <!-- NEVER! -->
```

---

## 🔍 RULE #6: API RESPONSES

### **User data in API responses:**

```javascript
// ✅ CORRECT - Authentication response (login only)
{
  user: {
    id: "AEPQEBDQBW",
    name: "feby",
    email: "feby_mail@gmail.com",  // OK for login
    role: "observer"
  }
}

// ✅ CORRECT - Regular API responses (no email)
{
  user: {
    id: "AEPQEBDQBW",
    name: "feby",
    role: "observer"
  }
}

// ❌ WRONG - Never expose email in regular APIs
{
  createdBy: "feby_mail@gmail.com"  // FORBIDDEN!
}
```

---

## 📊 RULE #7: LOGGING

### **Server logs (backend):**
```javascript
// ✅ CORRECT - Server logs (internal only)
logger.info(`User logged in: ${user.email}`)
logger.warn(`Action by ${req.user.email}`)

// ✅ CORRECT - User-visible logs (no email)
activityLog.create({
  action: 'created_record',
  userId: req.user.id,
  userName: req.user.name
})
```

### **Activity logs shown to users:**
```javascript
// ✅ CORRECT
"Record created by Dr. Dibya (UDZAQUCQWZ)"

// ❌ WRONG
"Record created by nanda.arfianda@gmail.com"
```

---

## 🎯 RULE #8: IDENTIFICATION HIERARCHY

### **When identifying staff, use this hierarchy:**

1. **For system operations:** Use `staff_id` (10-letter ID)
2. **For display to users:** Use `staff_name`
3. **For internal logs:** Use `email` (acceptable)
4. **Never mix:** Don't use email for display or ID for authentication

```javascript
// ✅ CORRECT
function recordAction(staffId, staffName) {
  // Store ID
  await db.query('INSERT INTO actions (staff_id) VALUES (?)', [staffId])

  // Display name
  showNotification(`Action by ${staffName}`)

  // Log email (internal)
  logger.info(`Action by ${req.user.email}`)
}

// ❌ WRONG
function recordAction() {
  // Don't store email
  await db.query('INSERT INTO actions (staff_email) VALUES (?)', [email])

  // Don't display email
  showNotification(`Action by ${email}`)
}
```

---

## 🚫 COMMON VIOLATIONS (WHAT NOT TO DO)

### **❌ VIOLATION 1: Email in UI**
```html
<!-- WRONG -->
<div>Requested by: feby_mail@gmail.com</div>
```

### **❌ VIOLATION 2: Email in Print**
```javascript
// WRONG
const invoiceData = {
  cashier: user.email  // Never!
}
```

### **❌ VIOLATION 3: Email as Identifier**
```javascript
// WRONG
WHERE created_by = 'feby_mail@gmail.com'
```

### **❌ VIOLATION 4: Email in Fallback**
```javascript
// WRONG
displayName = user.name || user.email  // Email fallback forbidden!
```

---

## ✅ CODE REVIEW CHECKLIST

Before committing code, verify:

- [ ] No `user.email` in display code (except login)
- [ ] No email in print templates
- [ ] All operations use `staff_id` (10 letters)
- [ ] Display fallback is `user.name || user.id || 'Staff'`
- [ ] No email in API responses (except auth)
- [ ] No email in user-visible logs
- [ ] Database columns use staff ID, not email
- [ ] All queries use `new_id`, not email

---

## 🛠️ ENFORCEMENT

### **Automated checks:**
```bash
# Search for email exposure violations
grep -r "user\.email" public/ | grep -v "unused/"
grep -r "\.email" backend/routes/ | grep -v "logger\|auth\.js"
```

### **Manual review:**
- Check all print templates
- Review all user-facing displays
- Verify API response structures
- Test with real user data

---

## 📝 EXAMPLES

### **✅ CORRECT IMPLEMENTATION**

**Sunday Clinic Billing:**
```javascript
// Store staff ID
const billingData = {
  created_by: req.user.id,  // AEPQEBDQBW
  created_at: getGMT7Timestamp()
}

// Display staff name
const displayName = req.user.name || req.user.id || 'Staff'
showNotification(`Billing created by ${displayName}`)

// Log with email (internal only)
logger.info(`Billing created by ${req.user.email}`)
```

**Change Request:**
```javascript
// Store ID and name
const changeRequest = {
  requested_by_id: req.user.id,      // AEPQEBDQBW
  requested_by_name: req.user.name   // "feby"
}

// Display name only
return {
  requestedBy: changeRequest.requested_by_name
}
```

**Invoice Print:**
```html
<div class="cashier-info">
  <p>Kasir: {{ cashierName }}</p>
  <p>ID: {{ cashierId }}</p>
</div>
```

---

## 🎓 TRAINING NOTES

### **Why these rules exist:**

1. **Privacy Protection:** Email addresses are PII (Personally Identifiable Information)
2. **Security:** Email exposure can lead to phishing attacks
3. **Professionalism:** Staff names are more professional than emails
4. **Flexibility:** Names can be changed without breaking references
5. **Consistency:** Staff ID is the single source of truth

### **What happens if violated:**

- ❌ Privacy breach
- ❌ Potential GDPR/data protection violations
- ❌ Unprofessional appearance
- ❌ Security risk
- ❌ Code fails review

---

## 📞 QUESTIONS?

If unsure about email usage, ask:
1. Is this for authentication? → Email OK
2. Is this for internal logging? → Email OK
3. Is this displayed to users? → **NO EMAIL!**
4. Is this printed? → **NO EMAIL!**
5. Is this an API response? → **NO EMAIL!** (except login)

**When in doubt, use staff name + staff ID!**

---

**Version:** 1.0
**Effective Date:** 2025-11-19
**Review Date:** 2026-01-19
**Contact:** System Administrator
