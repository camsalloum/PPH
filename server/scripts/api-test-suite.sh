#!/bin/bash
# =============================================================================
# IPDashboard API Test Suite
# =============================================================================
# Comprehensive test script for verifying all API endpoints
# Run with: chmod +x api-test-suite.sh && ./api-test-suite.sh
# =============================================================================

set -e

BASE_URL="${BASE_URL:-http://localhost:3001}"
TOKEN=""
PASSED=0
FAILED=0
SKIPPED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
}

print_test() {
    echo -e "\n${YELLOW}Testing:${NC} $1"
}

pass() {
    echo -e "${GREEN}✓ PASSED${NC}: $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗ FAILED${NC}: $1"
    ((FAILED++))
}

skip() {
    echo -e "${YELLOW}⊘ SKIPPED${NC}: $1"
    ((SKIPPED++))
}

check_response() {
    local response=$1
    local expected_code=$2
    local test_name=$3
    local actual_code=$(echo "$response" | head -1 | grep -oE '[0-9]{3}')
    
    if [ "$actual_code" == "$expected_code" ]; then
        pass "$test_name (HTTP $actual_code)"
        return 0
    else
        fail "$test_name (Expected $expected_code, got $actual_code)"
        return 1
    fi
}

# =============================================================================
# Check if server is running
# =============================================================================

print_header "Pre-flight Check"
echo "Testing connection to $BASE_URL..."

if ! curl -s --connect-timeout 5 "$BASE_URL/api/health" > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Cannot connect to server at $BASE_URL${NC}"
    echo "Please ensure the server is running: node index.js"
    exit 1
fi
echo -e "${GREEN}Server is running${NC}"

# =============================================================================
# Health & Monitoring Tests
# =============================================================================

print_header "Health & Monitoring Endpoints"

# Health check
print_test "GET /api/health"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/health")
check_response "$response" "200" "Health check"

# Deep health check
print_test "GET /api/health/deep"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/health/deep")
check_response "$response" "200" "Deep health check"

# Metrics
print_test "GET /api/metrics"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/metrics")
check_response "$response" "200" "Metrics endpoint"

# Kubernetes probes
print_test "GET /api/ready"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/ready")
check_response "$response" "200" "Readiness probe"

print_test "GET /api/live"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/live")
check_response "$response" "200" "Liveness probe"

# =============================================================================
# Security Headers Test
# =============================================================================

print_header "Security Headers"

print_test "Checking security headers"
headers=$(curl -sI "$BASE_URL/api/health")

# Check for key security headers
check_header() {
    if echo "$headers" | grep -qi "$1"; then
        pass "Header present: $1"
    else
        fail "Header missing: $1"
    fi
}

check_header "X-Content-Type-Options"
check_header "X-Frame-Options"
check_header "X-XSS-Protection"
check_header "X-Correlation-ID"
check_header "X-Request-ID"

# =============================================================================
# Authentication Tests
# =============================================================================

print_header "Authentication Endpoints"

# Login with invalid credentials
print_test "POST /api/auth/login (invalid credentials)"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"invalid@test.com","password":"wrongpass"}')
check_response "$response" "401" "Login with invalid credentials"

# Login without credentials
print_test "POST /api/auth/login (missing fields)"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{}')
check_response "$response" "400" "Login without credentials"

# Refresh without token
print_test "POST /api/auth/refresh (no token)"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/refresh")
check_response "$response" "401" "Refresh without token"

# Protected endpoint without auth
print_test "GET /api/auth/me (unauthorized)"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/auth/me")
check_response "$response" "401" "Protected endpoint without auth"

# =============================================================================
# API Documentation Test
# =============================================================================

print_header "API Documentation"

print_test "GET /api-docs/"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api-docs/")
if echo "$response" | grep -q "swagger\|Swagger\|<!DOCTYPE"; then
    pass "Swagger UI accessible"
else
    # Swagger might not be enabled in all environments
    skip "Swagger UI (may not be enabled)"
fi

# =============================================================================
# AEBF Endpoints (Public)
# =============================================================================

print_header "AEBF Public Endpoints"

# AEBF Health
print_test "GET /api/aebf/health"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/aebf/health")
check_response "$response" "200" "AEBF health check"

# Filter options (may need auth depending on config)
print_test "GET /api/aebf/filter-options (FP division)"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/aebf/filter-options?division=FP")
code=$(echo "$response" | tail -1)
if [ "$code" == "200" ] || [ "$code" == "401" ]; then
    pass "AEBF filter options (HTTP $code)"
else
    fail "AEBF filter options (HTTP $code)"
fi

# =============================================================================
# Rate Limiting Test
# =============================================================================

print_header "Rate Limiting"

print_test "Testing rate limit headers"
headers=$(curl -sI "$BASE_URL/api/health")
if echo "$headers" | grep -qi "RateLimit\|X-RateLimit"; then
    pass "Rate limit headers present"
else
    skip "Rate limit headers (may not be enabled)"
fi

# =============================================================================
# Error Handling Test
# =============================================================================

print_header "Error Handling"

# 404 Not Found
print_test "GET /api/nonexistent"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/nonexistent")
check_response "$response" "404" "404 Not Found"

# Invalid JSON
print_test "POST with invalid JSON"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d 'invalid json')
code=$(echo "$response" | tail -1)
if [ "$code" == "400" ] || [ "$code" == "422" ]; then
    pass "Invalid JSON rejected (HTTP $code)"
else
    fail "Invalid JSON handling (HTTP $code)"
fi

# =============================================================================
# Correlation ID Test
# =============================================================================

print_header "Request Tracing"

print_test "Correlation ID propagation"
# Send request with correlation ID
response=$(curl -sI -H "X-Correlation-ID: test-correlation-123" "$BASE_URL/api/health")
if echo "$response" | grep -q "test-correlation-123"; then
    pass "Correlation ID propagated"
else
    # Server might generate its own if not provided
    if echo "$response" | grep -qi "X-Correlation-ID"; then
        pass "Correlation ID generated"
    else
        fail "Correlation ID missing"
    fi
fi

# =============================================================================
# Summary
# =============================================================================

print_header "Test Summary"

TOTAL=$((PASSED + FAILED + SKIPPED))
echo -e "${GREEN}Passed:${NC}  $PASSED"
echo -e "${RED}Failed:${NC}  $FAILED"
echo -e "${YELLOW}Skipped:${NC} $SKIPPED"
echo -e "${BLUE}Total:${NC}   $TOTAL"

echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
