# Test Fixtures and Mocks

This directory contains comprehensive test fixtures, mock implementations, and utilities to support testing of the claude-lsp-cli project.

## Overview

The fixtures system provides:
- **Mock data** for hooks, diagnostics, configurations, and file contents
- **Mock implementations** for file system, process execution, and other system interactions
- **Test utilities** for creating temporary directories, timing operations, and assertions
- **CLI scenarios** for systematic testing of command-line interactions
- **Language-specific content** for testing different programming languages

## Structure

```
tests/fixtures/
├── index.ts                  # Main export file
├── hook-data.ts             # Hook event templates and test data
├── diagnostic-results.ts    # Mock diagnostic results for different languages
├── file-contents.ts         # Sample file contents for testing
├── config-data.ts           # Configuration templates and scenarios
├── cli-scenarios.ts         # CLI command test cases and scenarios
├── mock-implementations.ts  # Mock classes for system components
├── test-utilities.ts        # Helper functions and utilities
└── README.md               # This documentation
```

## Usage Examples

### Basic Import

```typescript
import {
  postToolUseEvents,
  typescriptResults,
  MockFileSystem,
  TempDirectory,
  testUtils
} from './fixtures';
```

### Hook Event Testing

```typescript
import { postToolUseEvents, serializeHookEvent } from './fixtures';

// Create a file edit event
const editEvent = postToolUseEvents.fileEdit('/path/to/file.ts');
const jsonData = serializeHookEvent(editEvent);

// Use in tests
const result = await runCLI(['hook', 'PostToolUse'], { stdin: jsonData });
```

### Mock Diagnostic Results

```typescript
import { typescriptResults, createDiagnosticResult } from './fixtures';

// Use predefined results
const errorResult = typescriptResults.withErrors();

// Or create custom results
const customResult = createDiagnosticResult('python', 'errors', [
  { line: 5, column: 10, severity: 'error', message: 'Custom error' }
]);
```

### Temporary Directory Management

```typescript
import { TempDirectory } from './fixtures';

describe('File operations', () => {
  let tempDir: TempDirectory;

  beforeEach(() => {
    tempDir = new TempDirectory('my-test');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  test('creates test files', () => {
    const filePath = tempDir.createFile('test.ts', 'console.log("test");');
    expect(tempDir.exists('test.ts')).toBe(true);
  });
});
```

### Mock System Components

```typescript
import { MockFileSystem, MockProcessExecutor, TestEnvironment } from './fixtures';

describe('System integration', () => {
  let env: TestEnvironment;

  beforeEach(() => {
    env = new TestEnvironment();
    env.setup();
  });

  afterEach(() => {
    env.cleanup();
  });

  test('mocks file operations', () => {
    env.mocks.filesystem.setFile('/test.ts', 'content');
    expect(env.mocks.filesystem.hasFile('/test.ts')).toBe(true);
  });
});
```

### CLI Scenario Testing

```typescript
import { basicCommands, CLITestCase } from './fixtures';

// Use predefined test cases
basicCommands.forEach((testCase: CLITestCase) => {
  test(testCase.name, async () => {
    const result = await runCLI(testCase.args);
    expect(result.exitCode).toBe(testCase.expectedExitCode);
    if (testCase.expectedStdout) {
      expect(result.stdout).toMatch(testCase.expectedStdout);
    }
  });
});
```

## Key Components

### Hook Data (`hook-data.ts`)

Provides templates for PostToolUse and UserPromptSubmit hook events:

- `postToolUseEvents.*` - File operations (edit, create, write)
- `userPromptSubmitEvents.*` - User input scenarios
- `testFilePaths.*` - File path test cases
- `lspCommands` - Common LSP command strings

### Diagnostic Results (`diagnostic-results.ts`)

Mock diagnostic results for different languages:

- `typescriptResults.*` - TypeScript scenarios (clean, errors, warnings)
- `pythonResults.*` - Python scenarios
- `goResults.*` - Go scenarios
- `createDiagnosticResult()` - Custom result generator

### File Contents (`file-contents.ts`)

Sample file contents for testing:

- `typescriptFiles.*` - TypeScript code templates
- `pythonFiles.*` - Python code templates
- `languageFiles.*` - Other language templates
- `configFiles.*` - Configuration file templates
- `createFileContent()` - Generate content by language/scenario

### Configuration Data (`config-data.ts`)

Configuration templates and scenarios:

- `lspConfigs.*` - LSP configuration variations
- `claudeSettings.*` - Claude settings.json templates
- `environmentScenarios.*` - Environment variable setups
- `directoryStructures.*` - Project structure templates

### CLI Scenarios (`cli-scenarios.ts`)

Systematic CLI test cases:

- `basicCommands` - Help, version, invalid commands
- `fileCheckCommands` - File checking scenarios
- `configCommands` - Enable/disable language commands
- `hookCommands` - Hook handling test cases
- `edgeCases` - Error conditions and edge cases
- `integrationScenarios` - Multi-step workflows

### Mock Implementations (`mock-implementations.ts`)

Mock classes for system components:

- `MockFileSystem` - File system operations
- `MockProcessExecutor` - Process execution
- `MockConfigManager` - Configuration management
- `MockLanguageChecker` - Language tool checking
- `MockDeduplicationManager` - Result deduplication
- `MockConsoleCapture` - Console output capture
- `TestEnvironment` - Complete test environment setup

### Test Utilities (`test-utilities.ts`)

Helper functions and utilities:

- `TempDirectory` - Temporary directory management
- `asyncUtils.*` - Timing and async utilities
- `assertions.*` - Common assertion helpers
- `generators.*` - Test data generation
- `jsonUtils.*` - JSON parsing helpers
- `languageUtils.*` - Language detection utilities

## Best Practices

### 1. Use Predefined Fixtures When Possible

```typescript
// Good: Use predefined fixture
const event = postToolUseEvents.fileEdit('/test.ts');

// Avoid: Creating ad-hoc data
const event = {
  event: 'PostToolUse',
  data: { tool: 'Edit', args: { file_path: '/test.ts' } }
};
```

### 2. Clean Up Resources

```typescript
describe('Test suite', () => {
  let tempDir: TempDirectory;
  let mockEnv: TestEnvironment;

  beforeEach(() => {
    tempDir = new TempDirectory();
    mockEnv = new TestEnvironment();
    mockEnv.setup();
  });

  afterEach(() => {
    tempDir.cleanup();
    mockEnv.cleanup();
  });
});
```

### 3. Use Type-Safe Assertions

```typescript
import { assertions } from './fixtures';

test('validates diagnostic result', () => {
  const result = await checkFile('test.ts');
  expect(assertions.isValidDiagnosticResult(result)).toBe(true);
});
```

### 4. Combine Fixtures for Complex Scenarios

```typescript
// Combine hook data with diagnostic results
const hookEvent = postToolUseEvents.fileEdit('/test.ts');
const diagnosticResult = typescriptResults.withErrors();

// Use in integration test
mockLangChecker.setResult('/test.ts', diagnosticResult);
const result = await handleHook(hookEvent);
```

## Adding New Fixtures

### 1. Add Test Data

```typescript
// In appropriate fixtures file
export const newLanguageResults = {
  clean: (): DiagnosticResult => ({
    language: 'newlang',
    diagnosticCount: 0,
    summary: '0 errors, 0 warnings',
    diagnostics: []
  })
};
```

### 2. Update Index File

```typescript
// In index.ts
export * from './new-fixture-file';
```

### 3. Document Usage

Update this README with examples of how to use the new fixtures.

## Testing the Fixtures

The fixtures themselves should be tested to ensure they produce valid data:

```typescript
describe('Fixture validation', () => {
  test('hook events are valid', () => {
    const event = postToolUseEvents.fileEdit('/test.ts');
    expect(assertions.isValidHookEvent(event)).toBe(true);
  });

  test('diagnostic results are valid', () => {
    const result = typescriptResults.clean();
    expect(assertions.isValidDiagnosticResult(result)).toBe(true);
  });
});
```