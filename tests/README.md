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
4. **Format**: Expect shell integration output with OSC 633 sequences

## Current Output Format

**Shell Integration Format:**

```
# Default view (immediately visible)
✗ 3 errors found
  Files affected: lib/main.ex

# Raw output with OSC sequences
]633;A]633;B]633;C]633;E;>
✗ lib/main.ex:4:3 - module UndefinedModule is not loaded...
✗ lib/main.ex:19:5 - undefined variable "undefined_user"
]633;D;1
```

# Test comment
