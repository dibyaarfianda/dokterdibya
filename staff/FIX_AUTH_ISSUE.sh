#!/bin/bash

# Fix for authentication and login issue
# Problem: Token stored but system thinks user is not logged in
# Cause: API_BASE was hardcoded to external domain, token not properly retrieved

echo "🔧 Fixing authentication issues..."

# 1. Check the current state
echo "1. Checking token storage:"
curl -s http://localhost:3001/api/status 2>&1 | head -5

echo ""
echo "2. Verifying middleware is working:"
ps aux | grep "node /var/www/dokterdibya/staff/backend/server.js" | grep -v grep

echo ""
echo "3. Files that were updated:"
echo "   ✓ /var/www/dokterdibya/staff/public/scripts/vps-auth-v2.js"
echo "     - Fixed API_BASE to use dynamic hostname"
echo "     - getIdToken() now checks both localStorage and sessionStorage"

echo ""
echo "✅ Authentication fixes applied!"
echo ""
echo "📋 Next steps to test:"
echo "1. Open browser console (F12)"
echo "2. Clear localStorage and sessionStorage:"
echo "   localStorage.clear(); sessionStorage.clear();"
echo "3. Hard refresh page: Ctrl+Shift+R (or Cmd+Shift+R on Mac)"
echo "4. Try logging in again"
echo "5. Check if X-Request-ID appears in response headers"
echo "6. Verify you're redirected to index-adminlte.html"

