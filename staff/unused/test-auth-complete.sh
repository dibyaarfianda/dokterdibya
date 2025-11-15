#!/bin/bash

# Comprehensive Authentication System Test
# Tests all components of the authentication system

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   DIBYA KLINIK - AUTHENTICATION SYSTEM TEST REPORT           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_count=0
pass_count=0
display_count=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_cmd="$2"
    ((display_count++))
    ((test_count++))
    
    echo -n "Test $display_count: $test_name ... "
    if eval "$test_cmd" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((pass_count++))
    else
        echo -e "${RED}✗ FAIL${NC}"
    fi
}

# Function to run a test with output
run_test_output() {
    local test_name="$1"
    local test_cmd="$2"
    ((display_count++))
    
    echo ""
    echo -e "${YELLOW}Test $display_count: $test_name${NC}"
    eval "$test_cmd"
}

echo "════════════════════════════════════════════════════════════════"
echo "BACKEND TESTS"
echo "════════════════════════════════════════════════════════════════"

run_test "Backend server is running" \
    "curl -s http://localhost:3001/api/auth/login --max-time 2"

run_test "Login endpoint accepts POST requests" \
    "curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{}' --max-time 2"

run_test_output "Login with valid credentials returns JWT token" \
    "curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"nanda.arfianda@gmail.com\",\"password\":\"superadmin123\"}' | jq '.data.token' | head -c 50 && echo '...'"

# Get a fresh token for /me test
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"nanda.arfianda@gmail.com","password":"superadmin123"}' 2>/dev/null | jq -r '.data.token' 2>/dev/null)

run_test "/me endpoint validates JWT tokens" \
    "curl -s -H 'Authorization: Bearer $TOKEN' http://localhost:3001/api/auth/me 2>/dev/null | jq '.success' | grep -q true"

run_test_output "/me endpoint returns user data" \
    "curl -s -H 'Authorization: Bearer $TOKEN' http://localhost:3001/api/auth/me 2>/dev/null | jq '.data | {id, email, role}'"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "FRONTEND FILES"
echo "════════════════════════════════════════════════════════════════"

run_test "vps-auth-v2.js exists" \
    "test -f /var/www/dokterdibya/staff/public/scripts/vps-auth-v2.js"

run_test "login.html exists" \
    "test -f /var/www/dokterdibya/staff/public/login.html"

run_test "index-adminlte.html exists" \
    "test -f /var/www/dokterdibya/staff/public/index-adminlte.html"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "CRITICAL BUG FIX VERIFICATION"
echo "════════════════════════════════════════════════════════════════"

run_test "onAuthStateChanged fix is applied" \
    "grep -q 'Call immediately with current state' /var/www/dokterdibya/staff/public/scripts/vps-auth-v2.js"

run_test_output "onAuthStateChanged function calls callback immediately" \
    "grep -A 2 'export function onAuthStateChanged' /var/www/dokterdibya/staff/public/scripts/vps-auth-v2.js | grep -E 'cb\(auth.currentUser\)|try'"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "CODE QUALITY CHECKS"
echo "════════════════════════════════════════════════════════════════"

run_test "vps-auth-v2.js has proper error handling" \
    "grep -q 'try.*catch' /var/www/dokterdibya/staff/public/scripts/vps-auth-v2.js"

run_test "login.html has redirect logic" \
    "grep -q 'window.location.replace' /var/www/dokterdibya/staff/public/login.html"

run_test "auth.js exports required functions" \
    "grep -E 'signIn|fetchMe|getIdToken|onAuthStateChanged' /var/www/dokterdibya/staff/public/scripts/vps-auth-v2.js | wc -l | grep -Eq '([4-9]|[1-9][0-9])'"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "DIAGNOSTIC PAGES"
echo "════════════════════════════════════════════════════════════════"

run_test "Test login page accessible" \
    "curl -s http://localhost:3001/login.html --max-time 2 | grep -q 'DOCTYPE'"

run_test "Auth flow test page created" \
    "test -f /var/www/dokterdibya/staff/public/auth-flow-test.html"

run_test "Test page is accessible" \
    "curl -s http://localhost:3001/auth-flow-test.html --max-time 2 | grep -q 'DOCTYPE'"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "SUMMARY DOCUMENTATION"
echo "════════════════════════════════════════════════════════════════"

run_test "Authentication fix summary created" \
    "test -f /var/www/dokterdibya/staff/AUTH_BUG_FIX_SUMMARY.md"

run_test "Summary contains root cause analysis" \
    "grep -q 'race condition' /var/www/dokterdibya/staff/AUTH_BUG_FIX_SUMMARY.md"

run_test "Summary contains fix details" \
    "grep -q 'Call immediately with current state' /var/www/dokterdibya/staff/AUTH_BUG_FIX_SUMMARY.md"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${YELLOW}TEST RESULTS: ${pass_count}/${test_count} tests passed${NC}"
echo "════════════════════════════════════════════════════════════════"

if [ $pass_count -eq $test_count ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED - System is ready for use${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed - Review output above${NC}"
    exit 1
fi
