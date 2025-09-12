# Test Structure

## New Architecture Test Files

Based on the new modular architecture with clear separation:

### CLI Tests (`cli-*.test.ts`)

- `cli-diagnostics.test.ts` - Test CLI diagnostic commands
- `cli-hooks.test.ts` - Test Claude Code hook integration
- `cli-server-manager.test.ts` - Test server lifecycle management
- `cli-lsp-installer.test.ts` - Test LSP installation commands

### Server Tests (`server-*.test.ts`)

- `server-lsp-client.test.ts` - Test LSP client communication
- `server-http.test.ts` - Test HTTP/Unix socket server
- `server-diagnostics.test.ts` - Test diagnostic processing

### Utility Tests

- `project-config-detector.test.ts` - Test project type detection
- `language-servers.test.ts` - Test language server configuration
- `diagnostic-deduplication.test.ts` - Test deduplication logic

### Integration Tests

- `e2e-typescript.test.ts` - End-to-end TypeScript project tests
- `e2e-multi-language.test.ts` - Multi-language project tests
- `e2e-claude-hook.test.ts` - Claude Code hook integration tests

## Test Conventions

1. **Naming**: Match source file names (e.g., `cli-diagnostics.ts` → `cli-diagnostics.test.ts`)
2. **Structure**: Group by module/component
3. **Focus**: Unit tests for individual modules, e2e tests for workflows
4. **Format**: Expect `[[system-message]]:` prefix in diagnostic outputs

## Current Output Format

```json
// Project diagnostics
[[system-message]]:{"summary":"no errors or warnings"}
[[system-message]]:{"diagnostics":[...],"summary":"total: X diagnostics (typescript: Y)"}

// File diagnostics
[[system-message]]:{"summary":"no errors or warnings"}
[[system-message]]:{"diagnostics":[...],"summary":"X errors in file.ts"}
```

## Migration Plan

1. Create new test files with proper naming
2. Migrate test logic to match new architecture
3. Update expectations for new output format
4. Remove outdated test files
