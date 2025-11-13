#!/bin/bash
# Test profile endpoint to see what data is returned

# Get a test user's token (konchelskydaf@gmail.com - patient ID 54970)
echo "Testing profile endpoint..."
echo ""

# First login to get a fresh token
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/patients/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "konchelskydaf@gmail.com",
    "password": "Newpassword123"
  }')

echo "Login Response:"
echo "$LOGIN_RESPONSE" | jq '.'
echo ""

# Extract token
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
  echo "Token obtained: ${TOKEN:0:20}..."
  echo ""
  
  # Get profile
  echo "Profile Response:"
  curl -s -X GET http://localhost:3000/api/patients/profile \
    -H "Authorization: Bearer $TOKEN" | jq '.'
else
  echo "Failed to get token"
fi
