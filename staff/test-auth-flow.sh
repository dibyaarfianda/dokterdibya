#!/bin/bash

# Comprehensive auth flow test
# Tests the entire login -> verification -> dashboard flow

echo "=== Dibya Klinik Authentication Flow Test ==="
echo ""

# Test 1: Login endpoint
echo "Test 1: POST /api/auth/login"
echo "  Email: nanda.arfianda@gmail.com"
echo "  Password: superadmin123"
echo ""

LOGIN_RESPONSE=$(curl -s http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nanda.arfianda@gmail.com",
    "password": "superadmin123"
  }')

echo "Response:"
echo "$LOGIN_RESPONSE" | jq . 2>/dev/null || echo "$LOGIN_RESPONSE"

# Extract token
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token' 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "❌ Failed to extract token from login response"
    exit 1
fi

echo ""
echo "✅ Token extracted: ${TOKEN:0:40}..."
echo ""

# Test 2: Verify token with /me endpoint
echo "Test 2: GET /api/auth/me (with token)"
echo ""

ME_RESPONSE=$(curl -s http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo "$ME_RESPONSE" | jq . 2>/dev/null || echo "$ME_RESPONSE"

ME_SUCCESS=$(echo "$ME_RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$ME_SUCCESS" = "true" ]; then
    echo ""
    echo "✅ /me endpoint verified successfully"
    USER_EMAIL=$(echo "$ME_RESPONSE" | jq -r '.user.email' 2>/dev/null)
    USER_ROLE=$(echo "$ME_RESPONSE" | jq -r '.user.role' 2>/dev/null)
    echo "   User: $USER_EMAIL (role: $USER_ROLE)"
else
    echo ""
    echo "❌ /me endpoint returned error"
    exit 1
fi

# Test 3: Check frontend files exist
echo ""
echo "Test 3: Check frontend files"
echo ""

if [ -f "/var/www/dibyaklinik/public/login.html" ]; then
    echo "✅ login.html exists"
else
    echo "❌ login.html not found"
fi

if [ -f "/var/www/dibyaklinik/public/index-adminlte.html" ]; then
    echo "✅ index-adminlte.html exists"
else
    echo "❌ index-adminlte.html not found"
fi

if [ -f "/var/www/dibyaklinik/public/scripts/vps-auth-v2.js" ]; then
    echo "✅ vps-auth-v2.js exists"
    # Check if the fix is in place
    if grep -q "call immediately with current state" /var/www/dibyaklinik/public/scripts/vps-auth-v2.js; then
        echo "✅ Auth module fix is in place (onAuthStateChanged calls callback immediately)"
    else
        echo "⚠️  Auth module fix not found"
    fi
else
    echo "❌ vps-auth-v2.js not found"
fi

echo ""
echo "=== All backend tests passed! ==="
echo "Next steps:"
echo "1. Open http://localhost:3001/login.html in a browser"
echo "2. Enter credentials: nanda.arfianda@gmail.com / superadmin123"
echo "3. Observe if you're redirected to dashboard"
echo "4. Check browser console (F12) for any errors"
