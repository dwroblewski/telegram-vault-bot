#!/bin/bash
# Smoke tests for Epic 3: Setup Verification
# Run: WORKER_URL=https://your-worker.workers.dev ./tests/setup.test.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VERIFY_SCRIPT="$SCRIPT_DIR/../scripts/verify-setup.sh"

# Require WORKER_URL for live tests
if [ -z "$WORKER_URL" ]; then
  echo "ERROR: WORKER_URL not set"
  echo "Usage: WORKER_URL=https://your-worker.workers.dev ./tests/setup.test.sh"
  exit 1
fi

echo "=== Epic 3: Setup Verification Tests ==="
echo "Using WORKER_URL: $WORKER_URL"
echo ""

PASS=0
FAIL=0

test_pass() {
  echo "  ✓ $1"
  PASS=$((PASS + 1))
}

test_fail() {
  echo "  ✗ $1"
  FAIL=$((FAIL + 1))
}

# Test 1: Script exists and is executable
echo "1. Script exists and executable..."
if [ -x "$VERIFY_SCRIPT" ]; then
  test_pass "verify-setup.sh is executable"
else
  test_fail "verify-setup.sh not executable"
fi

# Test 2: Script runs without error on valid setup
echo "2. Happy path (valid WORKER_URL)..."
OUTPUT=$(WORKER_URL=$WORKER_URL "$VERIFY_SCRIPT" 2>&1)
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  test_pass "Script exits 0 on healthy worker"
else
  test_fail "Script exited $EXIT_CODE (expected 0)"
fi

# Test 3: Script shows worker health
echo "3. Output contains health check..."
if echo "$OUTPUT" | grep -q "Worker responding"; then
  test_pass "Shows worker health status"
else
  test_fail "Missing worker health in output"
fi

# Test 4: Script fails on bad worker URL
echo "4. Failure path (invalid WORKER_URL)..."
OUTPUT=$(WORKER_URL=https://invalid-worker-that-does-not-exist.workers.dev "$VERIFY_SCRIPT" 2>&1)
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  test_pass "Script exits non-zero on unreachable worker"
else
  test_fail "Script should fail on unreachable worker"
fi

# Test 5: Script handles missing WORKER_URL
echo "5. Missing WORKER_URL..."
OUTPUT=$(WORKER_URL="" "$VERIFY_SCRIPT" 2>&1)
if echo "$OUTPUT" | grep -q "WORKER_URL not set"; then
  test_pass "Reports missing WORKER_URL"
else
  test_fail "Should report missing WORKER_URL"
fi

# Test 6: Script shows summary
echo "6. Output contains summary..."
OUTPUT=$(WORKER_URL=$WORKER_URL "$VERIFY_SCRIPT" 2>&1)
if echo "$OUTPUT" | grep -q "Summary"; then
  test_pass "Shows summary section"
else
  test_fail "Missing summary in output"
fi

# Summary
echo ""
echo "=== Results ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "All tests passed!"
  exit 0
else
  echo "Some tests failed."
  exit 1
fi
