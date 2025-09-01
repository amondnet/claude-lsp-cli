#!/bin/bash

# Run tests and collect results
echo "Running Claude LSP Test Suite"
echo "=============================="
echo ""

# Track totals
TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_FILES=""

# Test each file individually to avoid timeouts
for test_file in tests/*.test.ts; do
  echo "Testing: $(basename $test_file)"
  
  # Run test with timeout
  output=$(timeout 30 bun test "$test_file" 2>&1)
  
  # Extract pass/fail counts
  if echo "$output" | grep -q "pass"; then
    passes=$(echo "$output" | grep -oE "[0-9]+ pass" | awk '{print $1}')
    fails=$(echo "$output" | grep -oE "[0-9]+ fail" | awk '{print $1}' || echo "0")
    
    if [ -z "$fails" ]; then
      fails=0
    fi
    
    TOTAL_PASS=$((TOTAL_PASS + passes))
    TOTAL_FAIL=$((TOTAL_FAIL + fails))
    
    if [ "$fails" -gt 0 ]; then
      echo "  ✗ $passes pass, $fails fail"
      FAILED_FILES="$FAILED_FILES $(basename $test_file)"
    else
      echo "  ✓ $passes pass"
    fi
  else
    echo "  ⚠ Test timeout or error"
    FAILED_FILES="$FAILED_FILES $(basename $test_file)"
  fi
done

echo ""
echo "=============================="
echo "Test Summary"
echo "=============================="
echo "Total Passed: $TOTAL_PASS"
echo "Total Failed: $TOTAL_FAIL"

if [ -n "$FAILED_FILES" ]; then
  echo ""
  echo "Failed test files:"
  for file in $FAILED_FILES; do
    echo "  - $file"
  done
  exit 1
else
  echo ""
  echo "✅ All tests passed!"
  exit 0
fi
