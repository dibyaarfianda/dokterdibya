# Permission System Testing Guide

## Quick Test Checklist

### 1. Login Tests
```bash
# Test superadmin login (should have all permissions)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "your_password"}'

# Save the token from response
TOKEN="your_jwt_token_here"
```

### 2. Permission-Protected Endpoint Tests

#### Test Logs Endpoint (requires logs.view)
```bash
# Should work for superadmin
curl -X GET http://localhost:3001/api/logs \
  -H "Authorization: Bearer $TOKEN"

# Should return 403 for users without logs.view permission
```

#### Test Patients Endpoint (requires patients.view)
```bash
# View patients
curl -X GET http://localhost:3001/api/patients \
  -H "Authorization: Bearer $TOKEN"

# Create patient (requires patients.create)
curl -X POST http://localhost:3001/api/patients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Patient", "phone": "1234567890"}'
```

#### Test Medications Endpoint (requires medications.view)
```bash
# View medications
curl -X GET http://localhost:3001/api/obat \
  -H "Authorization: Bearer $TOKEN"
```

#### Test Services Endpoint (requires services.view)
```bash
# View services
curl -X GET http://localhost:3001/api/tindakan \
  -H "Authorization: Bearer $TOKEN"
```

#### Test Roles Endpoint (requires roles.view)
```bash
# View roles
curl -X GET http://localhost:3001/api/roles \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Test with Limited User

1. **Create a test user with admin role:**
```sql
-- Check current admin permissions
SELECT p.name, p.display_name 
FROM role_permissions rp
JOIN permissions p ON rp.permission_id = p.id
JOIN roles r ON rp.role_id = r.id
WHERE r.name = 'admin';
```

2. **Login as admin user:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin_username", "password": "admin_password"}'
```

3. **Test accessing endpoints:**
   - Should work: Endpoints matching admin permissions
   - Should fail (403): Endpoints not in admin permissions

### 4. Frontend Tests (Manual)

#### A. Login and Check Token
1. Open browser console
2. Login to the system
3. Check localStorage for token:
```javascript
localStorage.getItem('token')
```

#### B. Test Role Management Page
1. Navigate to `/role-management.html`
2. Verify you can see roles list
3. Try editing role permissions
4. Check if changes persist

#### C. Test Menu Access
1. Login as superadmin → Should see all menus
2. Login as admin → Should see limited menus (based on permissions)
3. Login as kasir → Should see only billing-related menus

#### D. Test Actions
1. Try creating a patient
2. Try editing medication
3. Try viewing logs
4. Verify appropriate access based on role

### 5. Expected Results

#### Superadmin (role: superadmin)
- ✅ Can access ALL endpoints
- ✅ All permissions granted automatically
- ✅ No database check needed

#### Admin (role: admin)
- ✅ Can access endpoints matching their permissions in database
- ❌ Gets 403 for endpoints they don't have permission for
- ℹ️ Permissions loaded from role_permissions table

#### Kasir (role: kasir)
- ✅ Can access billing-related endpoints
- ❌ Cannot access patient management
- ❌ Cannot access settings
- ℹ️ Limited permissions set

### 6. Database Verification

#### Check User's Permissions
```sql
SELECT 
    u.username,
    r.name as role_name,
    p.name as permission_name,
    p.display_name
FROM users u
JOIN roles r ON u.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
WHERE u.username = 'your_username'
ORDER BY p.category, p.name;
```

#### Check All Permissions for a Role
```sql
SELECT 
    p.name,
    p.display_name,
    p.category,
    p.description
FROM role_permissions rp
JOIN permissions p ON rp.permission_id = p.id
WHERE rp.role_id = (SELECT id FROM roles WHERE name = 'admin')
ORDER BY p.category, p.name;
```

### 7. Common Issues & Troubleshooting

#### Issue: 401 Unauthorized
- **Cause**: Invalid or expired token
- **Fix**: Login again to get new token

#### Issue: 403 Forbidden
- **Cause**: User doesn't have required permission
- **Fix**: 
  1. Check user's role permissions in database
  2. Assign required permission to the role
  3. Or assign user to different role

#### Issue: "User role not found"
- **Cause**: User's role_id doesn't match any role in roles table
- **Fix**: Update user's role_id to valid role

#### Issue: All requests fail
- **Cause**: Server may not be running or database connection issue
- **Fix**: 
  ```bash
  pm2 status
  pm2 logs 0
  ```

### 8. Performance Monitoring

#### Check Database Query Performance
```sql
-- Monitor permission check queries
SHOW PROCESSLIST;

-- Check slow query log
SHOW VARIABLES LIKE 'slow_query_log';
```

#### Monitor API Response Times
```bash
# Check PM2 logs for slow requests
pm2 logs 0 | grep "ms"
```

### 9. Security Audit

#### Verify No Public Endpoints Remain
```bash
# Check for routes without verifyToken
grep -r "router\.(get|post|put|delete)" backend/routes/ | grep -v "verifyToken"
```

#### Verify All Endpoints Have Permissions
```bash
# Check for routes with verifyToken but no requirePermission
grep -r "verifyToken" backend/routes/ | grep -v "requirePermission" | grep "router\."
```

### 10. Next Steps After Testing

1. **If all tests pass:**
   - ✅ Update frontend to use permissions
   - ✅ Hide/show menus based on user permissions
   - ✅ Disable buttons for actions user cannot perform

2. **If tests fail:**
   - 🔍 Check server logs: `pm2 logs 0`
   - 🔍 Check database permissions: Run SQL queries above
   - 🔍 Verify JWT token is valid
   - 🔍 Check middleware is properly imported

3. **Performance optimization:**
   - Consider implementing permission caching
   - Add Redis for session/permission storage
   - Monitor database query performance

4. **Documentation:**
   - Document permission requirements for each endpoint
   - Create user guide for role management
   - Update API documentation

---

## Quick Command Reference

```bash
# Restart server
pm2 restart 0

# View logs
pm2 logs 0

# Check server status
pm2 status

# Test login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "your_password"}'

# Test protected endpoint
curl -X GET http://localhost:3001/api/logs \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Success Criteria

- ✅ Superadmin can access all endpoints
- ✅ Admin gets 403 on endpoints they don't have permission for
- ✅ Kasir has limited access
- ✅ No public endpoints remain (except auth routes)
- ✅ All responses are fast (< 200ms)
- ✅ No errors in PM2 logs
- ✅ Frontend properly handles 403 responses
