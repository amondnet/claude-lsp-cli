# Testing Guide for Claude Code LSP

## Overview

This project has comprehensive test coverage for all critical components. Tests are written using Bun's built-in test runner.

## Test Coverage Status

- **Total Coverage**: 80% (12/15 source files)
- **Critical Files**: 100% covered
- **Total Tests**: 100+ tests across 17 test files

## Running Tests

### Run All Tests
```bash
bun test
```

### Run with Timeout (recommended for CI)
```bash
bun test --timeout 30000
```

### Run Specific Test File
```bash
bun test tests/server-lsp-client.test.ts
```

### Run Tests Matching Pattern
```bash
bun test --grep "Critical"
```

## Test Organization

### High-Impact Tests
These test files cover the most critical functionality:

1. **server-lsp-client.test.ts** - LSP client operations (14 tests)
   - Language server management
   - Document synchronization
   - Diagnostics collection
   - Error handling

2. **server.test.ts** - Main server functionality
   - HTTP/Unix socket endpoints
   - Diagnostic aggregation
   - Health checks

3. **cli.test.ts** - CLI entry point
   - Command parsing
   - Hook integration

### Component Tests
- **diagnostic-capabilities.test.ts** - Language capability definitions (17 tests)
- **diagnostic-request-manager.test.ts** - Request coordination (10 tests)
- **manager.test.ts** - LSP server lifecycle (15 tests)
- **cli-lsp-installer.test.ts** - Installation logic (10 tests)

### Integration Tests
- **integration-rules.test.ts** - End-to-end workflows
- **performance-validation.test.ts** - Performance benchmarks

## Writing New Tests

### Test Structure
```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

describe("Component Name", () => {
  describe("Critical: Feature Name", () => {
    test("should handle specific case", () => {
      // Arrange
      const input = createTestInput();
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toBe(expectedValue);
    });
  });
});
```

### Best Practices

1. **Use descriptive test names** that explain what is being tested
2. **Group related tests** using `describe` blocks
3. **Mark critical tests** with "Critical:" prefix in describe blocks
4. **Clean up resources** in `afterAll` or `afterEach` hooks
5. **Use timeouts** for async operations that might hang
6. **Mock external dependencies** to keep tests fast and isolated

## CI/CD Integration

The project includes GitHub Actions workflow (`.github/workflows/test.yml`) that:
- Runs tests on push and pull requests
- Tests against multiple Node versions
- Builds and verifies binaries
- Reports coverage statistics

## Coverage Goals

### Current Status
- ✅ All files > 30KB have tests
- ✅ Core functionality fully tested
- ✅ Critical paths covered

### Remaining Gaps (Low Priority)
- `manager-cli.ts` - Simple CLI wrapper
- `diagnostic-worker.ts` - Worker thread (tested indirectly)
- `constants.ts` - Configuration values only

## Performance Testing

Some tests validate performance characteristics:
- Response time < 5 seconds for diagnostics
- Memory usage stays within limits
- No zombie processes created
- Handles 1000+ diagnostics efficiently

## Troubleshooting

### Tests Timing Out
- Increase timeout: `bun test --timeout 60000`
- Check for hanging async operations
- Ensure language servers are installed

### Flaky Tests
- Performance tests may vary based on system load
- Server startup tests may need retry logic
- File system tests should use unique temp directories

## Quick Commands

```bash
# Run all tests
bun test

# Run with coverage info
./run-tests.sh

# Run critical tests only
bun test --grep "Critical"

# Run fast tests (skip performance)
bun test --grep -v "Performance"

# Debug a specific test
bun test tests/server.test.ts --grep "should start"
```