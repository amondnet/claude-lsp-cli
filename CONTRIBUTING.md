# Contributing to Claude Code LSP CLI

Thank you for your interest in contributing to Claude Code LSP CLI! This document provides guidelines and standards for contributing to the project.

## Quick Start

1. Fork and clone the repository
2. Install dependencies: `bun install`
3. Build the project: `bun run build`
4. Run tests: `bun test`
5. Make your changes following the guidelines below
6. Submit a pull request

## Development Workflow

### Setting Up Your Environment

```bash
# Clone your fork
git clone https://github.com/yourusername/claude-lsp-cli.git
cd claude-lsp-cli

# Install dependencies
bun install

# Build the CLI
bun run build

# Run tests to ensure everything works
bun test
```

### Running Quality Checks

Before submitting any changes, ensure all quality checks pass:

```bash
# Run all checks at once
bun run check:all

# Individual checks
bun run lint          # ESLint checking
bun run format        # Prettier formatting
bun run format:check  # Check formatting without changes
bun test              # Run test suite
bun run coverage      # Generate coverage report
```

## Code Quality Standards

### Code Style

We use automated tools to maintain consistent code style:

- **ESLint**: Enforces TypeScript best practices and code quality rules
- **Prettier**: Handles code formatting automatically

**Important**: All code must pass ESLint checks with no errors or warnings.

### Testing Requirements

- **Test Coverage**: Aim for >80% code coverage for new features
- **Test Types**: Write both unit and integration tests
- **Test Location**: Place tests in the `tests/` directory with `.test.ts` extension
- **Test Fixtures**: Use existing fixtures in `tests/fixtures/` or create new ones as needed

#### Writing Good Tests

```typescript
// Good: Descriptive test names and clear assertions
describe('checkTypeScript', () => {
  it('should detect type errors in TypeScript files', async () => {
    const result = await checkFile('/path/to/file.ts');
    expect(result.success).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain('Type error');
  });
});

// Good: Test edge cases and error conditions
it('should handle missing tsconfig gracefully', async () => {
  const result = await checkFile('/path/without/tsconfig.json');
  expect(result.success).toBe(true); // Should not fail completely
});
```

### Architecture Guidelines

#### File Organization

- **Core Logic**: Keep main functionality in `src/`
- **Language Checkers**: Use the registry pattern in `src/checkers/`
- **Tests**: Mirror source structure in `tests/`
- **Utilities**: Place shared utilities in appropriate modules

#### Function Design

- **Single Responsibility**: Each function should have one clear purpose
- **Size Limits**: Keep functions under 100 lines when possible
- **Complexity**: Avoid deeply nested logic (max 4 levels)
- **Error Handling**: Always handle errors gracefully

```typescript
// Good: Small, focused function
function extractFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  return lastDot === -1 ? '' : filePath.slice(lastDot + 1).toLowerCase();
}

// Good: Clear error handling
async function checkFile(filePath: string): Promise<CheckResult> {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    // ... checking logic
  } catch (error) {
    return { success: false, error: `Check failed: ${error.message}` };
  }
}
```

#### TypeScript Standards

- **Type Safety**: Avoid `any` types - use specific types or generics
- **Interfaces**: Define clear interfaces for data structures
- **Null Safety**: Use strict null checks and optional chaining
- **Import Organization**: Use barrel exports and organize imports

```typescript
// Good: Specific types
interface DiagnosticResult {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

// Good: Null safety
const config = await loadConfig(filePath);
const timeout = config?.timeout ?? DEFAULT_TIMEOUT;
```

## Language Checker Development

When adding support for a new programming language:

### 1. Create Language Configuration

```typescript
// src/checkers/newlang.ts
import type { LanguageConfig } from '../language-checker-registry';

export const newLangConfig: LanguageConfig = {
  name: 'newlang',
  extensions: ['.ext'],
  toolName: 'newlang-checker',
  findTool: () => findLocalTool('newlang-checker', 'bin/newlang-checker'),
  buildCommand: (toolPath, filePath, options) => [
    toolPath,
    '--check',
    filePath,
  ],
  parseOutput: (stdout, stderr, filePath) => {
    // Parse tool output into standardized diagnostics
    return diagnostics;
  },
};
```

### 2. Register the Language

```typescript
// src/checkers/index.ts
import { newLangConfig } from './newlang';
import { LANGUAGE_REGISTRY } from '../language-checker-registry';

// Register during initialization
LANGUAGE_REGISTRY.set('ext', newLangConfig);
```

### 3. Add Tests

Create comprehensive tests covering:
- Tool detection
- Command building
- Output parsing
- Error handling
- Edge cases

### 4. Add Example Project

Create `examples/newlang-project/` with:
- Sample files with intentional errors
- Configuration files if needed
- README explaining the test cases

## Commit Guidelines

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Adding or modifying tests
- `docs`: Documentation changes
- `chore`: Maintenance tasks

**Examples:**
```
feat(typescript): add support for project references
fix(cli): handle missing config files gracefully
refactor(checker): extract common language patterns
test(integration): add end-to-end CLI tests
docs(readme): update installation instructions
```

## Pull Request Process

### Before Submitting

1. **Run Quality Checks**: Ensure `bun run check:all` passes
2. **Update Tests**: Add tests for new features or bug fixes
3. **Update Documentation**: Update README.md, CONTRIBUTING.md, or comments as needed
4. **Test Examples**: Verify example projects still work with your changes

### PR Description Template

```markdown
## Description
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update

## Testing
- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] Tested with example projects
- [ ] Manual testing completed

## Quality Checks
- [ ] `bun run lint` passes
- [ ] `bun run format:check` passes
- [ ] `bun test` passes
- [ ] Code coverage maintained/improved

## Breaking Changes
List any breaking changes and migration instructions.
```

### Review Process

1. **Automated Checks**: GitHub Actions will run all quality checks
2. **Code Review**: Maintainers will review code quality, architecture, and testing
3. **Testing**: Changes will be tested against example projects
4. **Merge**: Once approved, changes will be merged to main branch

## Development Tips

### Local Testing

```bash
# Test CLI during development
bun run src/cli.ts check examples/typescript-project/src/index.ts

# Test built binary
./bin/claude-lsp-cli check examples/python-project/main.py

# Run specific test files
bun test tests/file-checker.test.ts

# Watch mode for development
bun test --watch
```

### Debugging

- Use `DEBUG=true` environment variable for verbose output
- Add temporary console.log statements (remove before committing)
- Use the built-in test fixtures for consistent testing

### Common Issues

1. **Coverage Not Working**: c8 has limited compatibility with Bun test runner
2. **Tool Detection**: Always test on systems without global tool installations
3. **Path Handling**: Use path.resolve() and handle Windows paths correctly
4. **Async Operations**: Always await async operations and handle rejections

## Getting Help

- **Issues**: Check existing issues or create a new one
- **Discussions**: Use GitHub Discussions for questions and ideas
- **Code Review**: Request feedback early and often

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (check LICENSE file).

---

Thank you for helping make Claude Code LSP CLI better! 🚀