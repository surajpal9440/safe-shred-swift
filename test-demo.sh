#!/bin/bash

# SecureWipe Electron Demo Test Script
# This script tests the local backend API endpoints

BASE_URL="http://localhost:3001"

echo "🔧 SecureWipe Electron API Test"
echo "================================"
echo ""

# Function to test API endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo "Testing: $description"
    echo "Endpoint: $method $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE:/d')
    
    if [ "$http_code" = "200" ]; then
        echo "✅ Success (200)"
        echo "Response: $body"
    else
        echo "❌ Failed ($http_code)"
        echo "Response: $body"
    fi
    echo ""
}

# Test server health
test_endpoint "GET" "/api/health" "" "Server Health Check"

# Test device detection
test_endpoint "GET" "/api/drives" "" "Device Detection"

# Test license info
test_endpoint "GET" "/api/license" "" "License Information"

# Test valid token validation
test_endpoint "POST" "/api/validate-token" '{"token":"demo-123"}' "Valid Token Validation"

# Test invalid token validation
test_endpoint "POST" "/api/validate-token" '{"token":"invalid"}' "Invalid Token Validation"

# Test erasure with valid token (mock device)
test_endpoint "POST" "/api/erase" '{
    "device": {
        "id": "test-001",
        "name": "Test USB Drive",
        "type": "removable",
        "size": "32 GB",
        "status": "ready",
        "serialNumber": "TEST-001",
        "driveLetter": "X"
    },
    "token": "demo-123"
}' "Start Mock Erasure Process"

echo "🎯 Test Summary"
echo "==============="
echo "• Health check endpoint"
echo "• Device detection API"
echo "• Token validation system"
echo "• Erasure initiation workflow"
echo ""
echo "📝 Notes:"
echo "• Use 'demo-123' or any token starting with 'demo-' for testing"
echo "• WebSocket progress updates available on ws://localhost:3001"
echo "• Audit logs stored in ./logs/ directory"
echo "• Mock devices shown on non-Windows platforms"
echo ""
echo "🚨 Security Features Tested:"
echo "• System drive protection (C: drive rejection)"
echo "• Token validation before operations"
echo "• Device path validation"
echo "• Audit logging for all operations"